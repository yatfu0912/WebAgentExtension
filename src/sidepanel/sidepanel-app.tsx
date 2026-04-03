import { useEffect, useRef, useState } from "react"
import {
  Globe2,
  RefreshCw,
  Square,
  SendHorizontal,
  Settings,
  Sparkles,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { SETTINGS_STORAGE_KEY } from "@/lib/defaults"
import { getSettings } from "@/lib/storage"
import { connectAnalyzePageStream, sendRuntimeMessage } from "@/lib/runtime"
import type {
  AnalyzePageStreamMessage,
  ChatMessage,
  ChatTurn,
  ExtensionSettings,
  PageContext,
  StreamResponseMessage,
} from "@/lib/types"
import { toDisplayMath } from "@/lib/math"
import { ChatMessageMarkdown } from "@/components/chat-message-markdown"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Toaster } from "@/components/ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const isEmbedded =
  new URLSearchParams(window.location.search).get("embedded") === "1"

export function SidePanelApp() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)
  const [pageContext, setPageContext] = useState<PageContext | null>(null)
  const [pageError, setPageError] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [prompt, setPrompt] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const activeProvider = settings?.selectedProvider ?? "openai"
  const streamPortRef = useRef<chrome.runtime.Port | null>(null)
  const activeAssistantMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadInitialState() {
      try {
        const nextSettings = await getSettings()

        if (!isActive) {
          return
        }

        setSettings(nextSettings)

        try {
          const context = await sendRuntimeMessage<PageContext>({
            type: "get-active-page-context",
          })

          if (!isActive) {
            return
          }

          setPageContext(context)
          setPageError("")
          if (context.content.length > nextSettings.pageTextLimit) {
            toast.message("网页正文已按字数上限截断。")
          }
        } catch (error) {
          if (!isActive) {
            return
          }

          const message =
            error instanceof Error ? error.message : "无法读取当前网页内容。"
          setPageError(message)
          toast.error(message)
        }
      } catch (error) {
        if (!isActive) {
          return
        }

        toast.error(error instanceof Error ? error.message : "初始化失败。")
      }
    }

    void loadInitialState()

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local" || !changes[SETTINGS_STORAGE_KEY]?.newValue) {
        return
      }

      const next = changes[SETTINGS_STORAGE_KEY].newValue as ExtensionSettings

      setSettings(next)
    }

    chrome.storage.onChanged.addListener(listener)

    return () => {
      isActive = false
      streamPortRef.current?.disconnect()
      chrome.storage.onChanged.removeListener(listener)
    }
  }, [])

  async function refreshPageContext(pageTextLimit?: number) {
    setIsRefreshing(true)
    setPageError("")

    try {
      const context = await sendRuntimeMessage<PageContext>({
        type: "get-active-page-context",
      })

      setPageContext(context)
      if (pageTextLimit && context.content.length > pageTextLimit) {
        toast.message("网页正文已按字数上限截断。")
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "无法读取当前网页内容。"
      setPageError(message)
      toast.error(message)
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleSendPrompt() {
    const value = prompt.trim()

    if (!value || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: value,
      createdAt: new Date().toISOString(),
    }
    const assistantMessageId = crypto.randomUUID()
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      provider: activeProvider,
      isStreaming: true,
    }
    const nextMessages = [...messages, userMessage]

    streamPortRef.current?.disconnect()
    activeAssistantMessageIdRef.current = assistantMessageId
    setMessages([...nextMessages, assistantPlaceholder])
    setPrompt("")
    setIsSending(true)

    const request: AnalyzePageStreamMessage = {
      type: "analyze-page-stream",
      provider: activeProvider,
      messages: nextMessages.map<ChatTurn>(({ role, content }) => ({
        role,
        content,
      })),
    }

    streamPortRef.current = connectAnalyzePageStream(request, {
      onMessage: (message) => {
        handleStreamMessage(message, assistantMessageId)
      },
      onDisconnect: () => {
        streamPortRef.current = null
        setIsSending(false)
      },
    })
  }

  function stopStreaming() {
    const assistantMessageId = activeAssistantMessageIdRef.current

    streamPortRef.current?.disconnect()
    streamPortRef.current = null
    activeAssistantMessageIdRef.current = null
    setIsSending(false)

    if (!assistantMessageId) {
      return
    }

    setMessages((current) =>
      current.map((item) =>
        item.id === assistantMessageId
          ? {
              ...item,
              isStreaming: false,
              content: item.content || "_生成已停止_",
            }
          : item
      )
    )
  }

  function handleStreamMessage(
    message: StreamResponseMessage,
    assistantMessageId: string
  ) {
    if (message.type === "start") {
      setPageContext(message.pageContext)
      setPageError("")
      return
    }

    if (message.type === "chunk") {
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: item.content + message.chunk,
              }
            : item
        )
      )
      return
    }

    if (message.type === "done") {
      setPageContext(message.result.pageContext)
      setPageError("")
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: item.content || message.result.text,
                provider: message.result.provider,
                isStreaming: false,
              }
            : item
        )
      )
      activeAssistantMessageIdRef.current = null
      streamPortRef.current?.disconnect()
      setIsSending(false)
      return
    }

    toast.error(message.error)
    setMessages((current) =>
      current.filter(
        (item) => !(item.id === assistantMessageId && item.content.length === 0)
      )
    )
    activeAssistantMessageIdRef.current = null
    streamPortRef.current?.disconnect()
    setIsSending(false)
  }

  return (
    <div
      className={
        isEmbedded
          ? "relative min-h-full overflow-hidden bg-background text-foreground"
          : "relative min-h-screen overflow-hidden bg-background text-foreground"
      }
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.14),transparent_38%),radial-gradient(circle_at_top_right,rgba(244,162,97,0.15),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.6),transparent)]" />
      <div
        className={
          isEmbedded
            ? "relative flex min-h-full flex-col gap-4 p-4"
            : "relative flex min-h-screen flex-col gap-4 p-4"
        }
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">WebAgentExtension</Badge>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              基于当前网页的 AI 对话面板
            </h1>
            <p className="text-sm text-muted-foreground">
              先抓取活动标签页内容，再把对话发往你配置的模型端点。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => void refreshPageContext(settings?.pageTextLimit)}
              disabled={isRefreshing}
              aria-label="刷新网页上下文"
            >
              <RefreshCw data-icon="inline-start" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void chrome.runtime.openOptionsPage()}
              aria-label="打开设置"
            >
              <Settings data-icon="inline-start" />
            </Button>
            {isEmbedded ? (
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  window.parent.postMessage(
                    { type: "web-agent-close-floating" },
                    "*"
                  )
                }}
                aria-label="关闭浮动窗口"
              >
                <X data-icon="inline-start" />
              </Button>
            ) : null}
          </div>
        </header>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {pageContext ? new URL(pageContext.url).hostname : "未连接网页"}
              </Badge>
              <Badge variant="secondary">
                正文 {pageContext?.content.length.toLocaleString() || 0} chars
              </Badge>
              <Badge variant="secondary">
                选中内容 {pageContext?.selection ? "已包含" : "无"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {pageError ? (
          <Alert>
            <Sparkles />
            <AlertTitle>网页上下文不可用</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col gap-4">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="context">Context</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">当前网页</CardTitle>
                <CardDescription>
                  {pageContext?.title || "先刷新网页内容，再开始提问。"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe2 />
                  <span className="truncate">
                    {pageContext?.url || "没有可用的网址信息"}
                  </span>
                </div>
                {pageContext?.description ? (
                  <p className="text-sm leading-6 text-muted-foreground">
                    {pageContext.description}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-1 flex-col">
              <CardHeader>
                <CardTitle className="text-base">会话</CardTitle>
                <CardDescription>
                  AI 会自动读取最新网页内容，并结合你的问题作答。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col">
                <ScrollArea className="min-h-0 flex-1 pr-4">
                  <div className="flex flex-col gap-3">
                    {messages.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm leading-6 text-muted-foreground">
                        你可以直接问：
                        <br />
                        “帮我总结这页的重点”
                        <br />
                        “提取行动项和截止时间”
                        <br />
                        “判断这篇文章的核心观点是否自洽”
                      </div>
                    ) : null}

                    {messages.map((message) => (
                      <article
                        key={message.id}
                        className={
                          message.role === "assistant"
                            ? "rounded-2xl border border-border bg-card px-4 py-3"
                            : "ml-8 rounded-2xl border border-border bg-secondary px-4 py-3"
                        }
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            {message.role === "assistant" ? "Assistant" : "You"}
                          </span>
                          <time className="text-xs text-muted-foreground">
                            {new Date(message.createdAt).toLocaleTimeString()}
                          </time>
                        </div>
                        {message.role === "assistant" ? (
                          <div className="flex flex-col gap-3">
                            {message.content ? (
                              <ChatMessageMarkdown content={message.content} />
                            ) : (
                              <p className="text-sm leading-6 text-muted-foreground">
                                正在生成...
                              </p>
                            )}
                            {message.isStreaming ? (
                              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                            ) : null}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-6">
                            {message.content}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <InputGroup className="min-h-32 items-stretch">
                  <InputGroupTextarea
                    value={prompt}
                    onChange={(event) => {
                      setPrompt(event.target.value)
                    }}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault()
                        void handleSendPrompt()
                      }
                    }}
                    placeholder="输入你的问题，例如：请用中文总结这页内容，并列出我下一步该做什么。"
                    rows={5}
                  />
                  <InputGroupAddon
                    align="block-end"
                    className="justify-between border-t border-border"
                  >
                    <span className="text-xs text-muted-foreground">
                      {isSending ? "模型正在分析网页..." : "Cmd/Ctrl + Enter 发送"}
                    </span>
                    <div className="flex items-center gap-2">
                      {isSending ? (
                        <InputGroupButton
                          size="sm"
                          variant="outline"
                          onClick={stopStreaming}
                        >
                          <Square data-icon="inline-start" />
                          停止生成
                        </InputGroupButton>
                      ) : null}
                      <InputGroupButton
                        size="sm"
                        onClick={() => void handleSendPrompt()}
                        disabled={isSending || !prompt.trim()}
                      >
                        <SendHorizontal data-icon="inline-start" />
                        发送
                      </InputGroupButton>
                    </div>
                  </InputGroupAddon>
                </InputGroup>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="context" className="flex min-h-0 flex-1 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">页面上下文快照</CardTitle>
                <CardDescription>
                  这里展示发送给模型的核心网页内容，便于调试抓取质量。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {pageContext?.headings.slice(0, 4).map((heading) => (
                    <Badge key={heading} variant="secondary">
                      {heading}
                    </Badge>
                  ))}
                </div>
                {pageContext?.mathExpressions.length ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <h2 className="text-sm font-medium">提取到的公式</h2>
                      <div className="grid gap-3">
                        {pageContext.mathExpressions.slice(0, 8).map((expression) => (
                          <article
                            key={expression}
                            className="rounded-2xl border border-border bg-card px-4 py-4"
                          >
                            <ChatMessageMarkdown content={toDisplayMath(expression)} />
                            <div className="mt-3 rounded-xl border border-border bg-secondary px-3 py-2">
                              <p className="mb-1 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                TeX
                              </p>
                              <code className="block break-all whitespace-pre-wrap text-xs leading-6 text-foreground">
                                {expression}
                              </code>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                ) : null}
                {pageContext?.selection ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <h2 className="text-sm font-medium">当前选中内容</h2>
                      <p className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm leading-6">
                        {pageContext.selection}
                      </p>
                    </div>
                    <Separator />
                  </>
                ) : null}
                <ScrollArea className="min-h-0 flex-1 rounded-2xl border border-border bg-card px-4 py-4">
                  <pre className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {pageContext?.content || "暂无网页正文。"}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Toaster />
    </div>
  )
}
