import { ensureSettings, getSettings } from "@/lib/storage"
import { analyzeWithProvider, analyzeWithProviderStream } from "@/lib/providers"
import type {
  AnalyzePageMessage,
  AnalyzePageStreamMessage,
  PageContext,
  RuntimeFailure,
  RuntimeMessage,
  RuntimeSuccess,
  StreamResponseMessage,
} from "@/lib/types"

void bootstrapExtension()

chrome.runtime.onInstalled.addListener(() => {
  void bootstrapExtension()
})

chrome.runtime.onStartup.addListener(() => {
  void bootstrapExtension()
})

chrome.action.onClicked.addListener((tab) => {
  if (tab.id && tab.url && /^https?:/i.test(tab.url)) {
    void toggleFloatingPanelForTab(tab.id)
    return
  }

  void openSidePanelFromUserGesture(tab)
})

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _, sendResponse) => {
  void handleRuntimeMessage(message, sendResponse)
  return true
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "analyze-page-stream") {
    return
  }

  const abortController = new AbortController()

  port.onDisconnect.addListener(() => {
    abortController.abort()
  })

  port.onMessage.addListener((message: AnalyzePageStreamMessage) => {
    void handleStreamRequest(port, message, abortController.signal)
  })
})

async function bootstrapExtension() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })

  const storageLocal = chrome.storage.local as chrome.storage.StorageArea & {
    setAccessLevel?: (options: {
      accessLevel: chrome.storage.AccessLevel
    }) => Promise<void>
  }

  if (typeof storageLocal.setAccessLevel === "function") {
    await storageLocal.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    })
  }

  await ensureSettings()
}

async function openSidePanelFromUserGesture(tab: chrome.tabs.Tab) {
  if (!chrome.sidePanel?.open) {
    return
  }

  if (typeof tab.windowId === "number") {
    await chrome.sidePanel.open({ windowId: tab.windowId })
    return
  }

  const currentWindow = await chrome.windows.getCurrent()

  if (typeof currentWindow.id === "number") {
    await chrome.sidePanel.open({ windowId: currentWindow.id })
  }
}

async function toggleFloatingPanelForTab(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "toggle-floating-panel",
    })
    return
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: toggleFloatingPanelInjected,
        args: [chrome.runtime.getURL("sidepanel.html?embedded=1")],
      })
    } catch (error) {
      console.warn("Failed to toggle floating panel", error)
    }
  }
}

async function handleRuntimeMessage(
  message: RuntimeMessage,
  sendResponse: (response: RuntimeSuccess<unknown> | RuntimeFailure) => void
) {
  try {
    if (message.type === "get-active-page-context") {
      const settings = await getSettings()
      const pageContext = await getActivePageContext(settings.pageTextLimit)

      sendResponse({ ok: true, data: pageContext })
      return
    }

    if (message.type === "analyze-page") {
      const settings = await getSettings()
      const pageContext = await getActivePageContext(settings.pageTextLimit)
      const response = await analyzeWithProvider({
        providerId: message.provider ?? settings.selectedProvider,
        settings,
        pageContext,
        messages: sanitizeMessages(message),
      })

      sendResponse({ ok: true, data: response })
      return
    }

    sendResponse({ ok: false, error: "未知的后台消息类型。" })
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "后台处理失败。",
    })
  }
}

async function handleStreamRequest(
  port: chrome.runtime.Port,
  message: AnalyzePageStreamMessage,
  signal: AbortSignal
) {
  if (message.type !== "analyze-page-stream") {
    return
  }

  try {
    const settings = await getSettings()
    const pageContext = await getActivePageContext(settings.pageTextLimit)
    const provider = message.provider ?? settings.selectedProvider

    postStreamMessage(port, {
      type: "start",
      provider,
      pageContext,
    })

    const result = await analyzeWithProviderStream({
      providerId: provider,
      settings,
      pageContext,
      messages: sanitizeStreamMessages(message),
      signal,
      onDelta: (chunk) => {
        postStreamMessage(port, {
          type: "chunk",
          chunk,
        })
      },
    })

    postStreamMessage(port, {
      type: "done",
      result,
    })
  } catch (error) {
    if (signal.aborted) {
      return
    }

    postStreamMessage(port, {
      type: "error",
      error: error instanceof Error ? error.message : "后台流式处理失败。",
    })
  }
}

function sanitizeMessages(message: AnalyzePageMessage) {
  return message.messages
    .map((item) => ({
      role: item.role,
      content: item.content.trim(),
    }))
    .filter((item) => item.content)
}

function sanitizeStreamMessages(message: AnalyzePageStreamMessage) {
  return message.messages
    .map((item) => ({
      role: item.role,
      content: item.content.trim(),
    }))
    .filter((item) => item.content)
}

function postStreamMessage(port: chrome.runtime.Port, message: StreamResponseMessage) {
  try {
    port.postMessage(message)
  } catch {
    // Ignore port errors after disconnect.
  }
}

async function getActivePageContext(maxChars: number): Promise<PageContext> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  })

  if (!tab?.id || !tab.url) {
    throw new Error("当前没有可分析的网页标签页。")
  }

  if (!/^https?:/i.test(tab.url)) {
    throw new Error("当前页面不是普通网页，无法直接读取内容。")
  }

  const execution = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageSnapshot,
    args: [maxChars],
  })

  const result = execution[0]?.result

  if (!result) {
    throw new Error("无法读取当前网页内容，请刷新页面后重试。")
  }

  return {
    tabId: tab.id,
    ...result,
    title: result.title || tab.title || "Untitled Page",
    url: result.url || tab.url,
  }
}

function extractPageSnapshot(maxChars: number) {
  const root =
    document.querySelector("article, main, [role='main']") || document.body
  const blockedTags = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "SVG",
    "CANVAS",
    "IFRAME",
    "TEMPLATE",
  ])
  const ignoredContainers = "nav, footer, aside, [aria-hidden='true']"
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean)
    .slice(0, 8)
  const selection = window.getSelection?.()?.toString().trim() || ""
  const mathExpressions = collectMathExpressions()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const chunks: string[] = []
  let length = 0

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text
    const parent = textNode.parentElement

    if (!parent || blockedTags.has(parent.tagName) || parent.closest(ignoredContainers)) {
      continue
    }

    const style = window.getComputedStyle(parent)

    if (style.display === "none" || style.visibility === "hidden") {
      continue
    }

    const text = textNode.textContent?.replace(/\s+/g, " ").trim()

    if (!text) {
      continue
    }

    if (text.length < 3 && parent.tagName !== "TITLE") {
      continue
    }

    chunks.push(text)
    length += text.length + 1

    if (length >= maxChars) {
      break
    }
  }

  const content = chunks.join("\n").slice(0, maxChars).trim()

  return {
    title: document.title,
    url: window.location.href,
    description:
      document
        .querySelector("meta[name='description']")
        ?.getAttribute("content")
        ?.trim() || "",
    byline:
      document
        .querySelector("meta[name='author']")
        ?.getAttribute("content")
        ?.trim() || "",
    lang: document.documentElement.lang || "",
    selection,
    headings,
    mathExpressions,
    content: content || document.body.innerText.replace(/\s+/g, " ").slice(0, maxChars),
    capturedAt: new Date().toISOString(),
  }
}

function collectMathExpressions() {
  const seen = new Set<string>()
  const expressions: string[] = []
  const selectors = [
    "annotation[encoding='application/x-tex']",
    "annotation[encoding='application/x-tex; mode=display']",
    "annotation[encoding='application/x-tex; mode=inline']",
    "script[type^='math/tex']",
    "[data-tex]",
    "[data-latex]",
  ]

  for (const element of document.querySelectorAll(selectors.join(", "))) {
    const text =
      element.getAttribute("data-tex") ||
      element.getAttribute("data-latex") ||
      element.textContent ||
      ""
    const normalized = text.replace(/\s+/g, " ").trim()

    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    expressions.push(normalized)

    if (expressions.length >= 20) {
      break
    }
  }

  return expressions
}

function toggleFloatingPanelInjected(iframeUrl: string) {
  const rootId = "web-agent-extension-floating-root"
  const closeMessageType = "web-agent-close-floating"
  const existing = document.getElementById(rootId)

  if (existing) {
    existing.remove()
    return
  }

  if (!document.body) {
    return
  }

  const root = document.createElement("div")
  root.id = rootId
  root.style.position = "fixed"
  root.style.top = "12px"
  root.style.right = "12px"
  root.style.width = "min(420px, calc(100vw - 24px))"
  root.style.height = "calc(100vh - 24px)"
  root.style.zIndex = "2147483647"
  root.style.pointerEvents = "auto"
  root.style.borderRadius = "24px"
  root.style.overflow = "hidden"
  root.style.background = "rgba(255,255,255,0.86)"
  root.style.boxShadow =
    "0 24px 80px rgba(15, 23, 42, 0.24), 0 8px 24px rgba(15, 23, 42, 0.14)"
  root.style.backdropFilter = "blur(18px)"
  root.style.border = "1px solid rgba(148, 163, 184, 0.28)"

  const iframe = document.createElement("iframe")
  iframe.src = iframeUrl
  iframe.title = "WebAgentExtension Floating Panel"
  iframe.style.width = "100%"
  iframe.style.height = "100%"
  iframe.style.border = "0"
  iframe.style.background = "transparent"

  root.appendChild(iframe)
  document.body.appendChild(root)

  const handleWindowMessage = (event: MessageEvent) => {
    if (
      event.source === iframe.contentWindow &&
      event.data?.type === closeMessageType
    ) {
      cleanup()
    }
  }

  const cleanup = () => {
    window.removeEventListener("message", handleWindowMessage)
    root.remove()
  }

  window.addEventListener("message", handleWindowMessage)
}
