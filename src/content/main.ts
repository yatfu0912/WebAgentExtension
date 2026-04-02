const ROOT_ID = "web-agent-extension-floating-root"
const FRAME_ID = "web-agent-extension-floating-frame"
const PANEL_WIDTH = "min(420px, calc(100vw - 24px))"
const PANEL_HEIGHT = "calc(100vh - 24px)"
const CLOSE_MESSAGE_TYPE = "web-agent-close-floating"

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "toggle-floating-panel") {
    return
  }

  toggleFloatingPanel()
})

function toggleFloatingPanel() {
  const existing = document.getElementById(ROOT_ID)

  if (existing) {
    existing.remove()
    return
  }

  mountFloatingPanel()
}

function mountFloatingPanel() {
  if (!document.body) {
    return
  }

  const root = document.createElement("div")
  root.id = ROOT_ID
  root.style.position = "fixed"
  root.style.top = "12px"
  root.style.right = "12px"
  root.style.width = PANEL_WIDTH
  root.style.height = PANEL_HEIGHT
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
  iframe.id = FRAME_ID
  iframe.src = chrome.runtime.getURL("sidepanel.html?embedded=1")
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
      event.data?.type === CLOSE_MESSAGE_TYPE
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
