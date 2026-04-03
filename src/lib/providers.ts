import type {
  AnalyzePageResult,
  ChatTurn,
  ExtensionSettings,
  PageContext,
  ProviderId,
  ProviderSettings,
} from "@/lib/types"
import { buildFetchInit, isLoopbackUrl } from "@/lib/network"

interface AnalyzeWithProviderArgs {
  providerId: ProviderId
  settings: ExtensionSettings
  pageContext: PageContext
  messages: ChatTurn[]
}

interface AnalyzeWithProviderStreamArgs extends AnalyzeWithProviderArgs {
  onDelta: (chunk: string) => void
  signal?: AbortSignal
}

interface ParsedResponseBody {
  contentType: string
  json: unknown | null
  text: string
}

const LEGACY_DIRECT_RELAY_BASE_URL = "https://yunyi.cfd/codex"
const LOCAL_CODEX_PROXY_BASE_URL = "http://127.0.0.1:15721/v1"

export async function analyzeWithProvider({
  providerId,
  settings,
  pageContext,
  messages,
}: AnalyzeWithProviderArgs): Promise<AnalyzePageResult> {
  const providerSettings = settings[providerId]

  validateProviderConfiguration(providerId, providerSettings)

  const text =
    providerId === "openai"
      ? await analyzeWithOpenAi(providerSettings, settings, pageContext, messages)
      : await analyzeWithClaude(providerSettings, settings, pageContext, messages)

  return {
    provider: providerId,
    text,
    pageContext,
  }
}

export async function analyzeWithProviderStream({
  providerId,
  settings,
  pageContext,
  messages,
  onDelta,
  signal,
}: AnalyzeWithProviderStreamArgs): Promise<AnalyzePageResult> {
  const providerSettings = settings[providerId]

  validateProviderConfiguration(providerId, providerSettings)

  const text =
    providerId === "openai"
      ? await streamWithOpenAi(
          providerSettings,
          settings,
          pageContext,
          messages,
          onDelta,
          signal
        )
      : await streamWithClaude(
          providerSettings,
          settings,
          pageContext,
          messages,
          onDelta,
          signal
        )

  return {
    provider: providerId,
    text,
    pageContext,
  }
}

function validateProviderConfiguration(
  providerId: ProviderId,
  settings: ProviderSettings
) {
  if (!settings.enabled) {
    throw new Error(`${providerId.toUpperCase()} 当前已被禁用。`)
  }

  if (!settings.baseUrl.trim()) {
    throw new Error(`${providerId.toUpperCase()} Base URL 不能为空。`)
  }

  if (!settings.apiKey.trim()) {
    throw new Error(`${providerId.toUpperCase()} API Key 不能为空。`)
  }

  if (!settings.model.trim()) {
    throw new Error(`${providerId.toUpperCase()} 模型名不能为空。`)
  }
}

async function analyzeWithOpenAi(
  provider: ProviderSettings,
  settings: ExtensionSettings,
  pageContext: PageContext,
  messages: ChatTurn[]
): Promise<string> {
  const endpoints = resolveOpenAiEndpoints(provider.baseUrl)
  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(
        endpoint,
        buildFetchInit(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model,
            temperature: 0.2,
            max_tokens: 1200,
            messages: [
              {
                role: "system",
                content: buildGroundedSystemPrompt(settings, pageContext),
              },
              ...messages,
            ],
          }),
        })
      )

      const data = await readResponseBody(response)

      if (!response.ok) {
        const error = new Error(
          extractApiError({
            providerLabel: "OpenAI",
            endpoint,
            response,
            data,
          })
        )

        if (shouldRetryOpenAiEndpoint(response.status, endpoint, endpoints)) {
          lastError = error
          continue
        }

        throw error
      }

      const payload = data.json as
        | {
            choices?: Array<{
              message?: {
                content?: unknown
              }
            }>
          }
        | null
      const messageContent = payload?.choices?.[0]?.message?.content
      const text = normalizeOpenAiContent(messageContent)

      if (!text) {
        throw new Error("OpenAI 没有返回可解析的文本内容。")
      }

      return text
    } catch (error) {
      const normalizedError =
        error instanceof Error
          ? error
          : new Error(
              isLoopbackUrl(endpoint)
                ? "无法连接本机 Codex 代理。请先在设置页点击“测试连接”，并允许 Chrome 的本地网络访问权限。"
                : "OpenAI 请求失败。"
            )

      if (shouldRetryOpenAiError(endpoint, endpoints)) {
        lastError = normalizedError
        continue
      }

      throw normalizedError
    }
  }

  throw lastError || new Error("OpenAI 请求失败。")
}

async function streamWithOpenAi(
  provider: ProviderSettings,
  settings: ExtensionSettings,
  pageContext: PageContext,
  messages: ChatTurn[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const endpoints = resolveOpenAiEndpoints(provider.baseUrl)
  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(
        endpoint,
        buildFetchInit(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model,
            temperature: 0.2,
            max_tokens: 1200,
            stream: true,
            messages: [
              {
                role: "system",
                content: buildGroundedSystemPrompt(settings, pageContext),
              },
              ...messages,
            ],
          }),
          signal,
        })
      )

      if (!response.ok) {
        const data = await readResponseBody(response)
        const error = new Error(
          extractApiError({
            providerLabel: "OpenAI",
            endpoint,
            response,
            data,
          })
        )

        if (shouldRetryOpenAiEndpoint(response.status, endpoint, endpoints)) {
          lastError = error
          continue
        }

        throw error
      }

      const contentType = response.headers.get("content-type") || ""

      if (!contentType.includes("text/event-stream")) {
        const data = await readResponseBody(response)
        const payload = data.json as
          | {
              choices?: Array<{
                message?: {
                  content?: unknown
                }
              }>
            }
          | null
        const messageContent = payload?.choices?.[0]?.message?.content
        const text = normalizeOpenAiContent(messageContent)

        if (!text) {
          throw new Error("OpenAI 没有返回可解析的文本内容。")
        }

        onDelta(text)
        return text
      }

      let text = ""

      await readSseStream(response, ({ data }) => {
        if (data === "[DONE]") {
          return
        }

        const payload = safeParseJson(data)
        const chunk = extractOpenAiStreamText(payload)

        if (!chunk) {
          return
        }

        text += chunk
        onDelta(chunk)
      })

      if (!text) {
        throw new Error("OpenAI 没有返回可解析的流式内容。")
      }

      return text
    } catch (error) {
      if (signal?.aborted) {
        throw new Error("请求已取消。")
      }

      const normalizedError =
        error instanceof Error
          ? error
          : new Error(
              isLoopbackUrl(endpoint)
                ? "无法连接本机 Codex 代理。请先在设置页点击“测试连接”，并允许 Chrome 的本地网络访问权限。"
                : "OpenAI 请求失败。"
            )

      if (shouldRetryOpenAiError(endpoint, endpoints)) {
        lastError = normalizedError
        continue
      }

      throw normalizedError
    }
  }

  throw lastError || new Error("OpenAI 请求失败。")
}

async function analyzeWithClaude(
  provider: ProviderSettings,
  settings: ExtensionSettings,
  pageContext: PageContext,
  messages: ChatTurn[]
): Promise<string> {
  const endpoint = resolveClaudeEndpoint(provider.baseUrl)
  const response = await fetch(
    endpoint,
    buildFetchInit(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": provider.apiKey,
      },
      body: JSON.stringify({
        model: provider.model,
        system: buildGroundedSystemPrompt(settings, pageContext),
        temperature: 0.2,
        max_tokens: 1200,
        messages,
      }),
    })
  )

  const data = await readResponseBody(response)

  if (!response.ok) {
    throw new Error(
      extractApiError({
        providerLabel: "Claude",
        endpoint,
        response,
        data,
      })
    )
  }

  const payload = data.json as
    | {
        content?: unknown
      }
    | null
  const text = normalizeClaudeContent(payload?.content)

  if (!text) {
    throw new Error("Claude 没有返回可解析的文本内容。")
  }

  return text
}

async function streamWithClaude(
  provider: ProviderSettings,
  settings: ExtensionSettings,
  pageContext: PageContext,
  messages: ChatTurn[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const endpoint = resolveClaudeEndpoint(provider.baseUrl)
  const response = await fetch(
    endpoint,
    buildFetchInit(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": provider.apiKey,
      },
      body: JSON.stringify({
        model: provider.model,
        system: buildGroundedSystemPrompt(settings, pageContext),
        temperature: 0.2,
        max_tokens: 1200,
        stream: true,
        messages,
      }),
      signal,
    })
  )

  if (!response.ok) {
    const data = await readResponseBody(response)
    throw new Error(
      extractApiError({
        providerLabel: "Claude",
        endpoint,
        response,
        data,
      })
    )
  }

  const contentType = response.headers.get("content-type") || ""

  if (!contentType.includes("text/event-stream")) {
    const data = await readResponseBody(response)
    const payload = data.json as
      | {
          content?: unknown
        }
      | null
    const text = normalizeClaudeContent(payload?.content)

    if (!text) {
      throw new Error("Claude 没有返回可解析的文本内容。")
    }

    onDelta(text)
    return text
  }

  let text = ""

  await readSseStream(response, ({ data }) => {
    const payload = safeParseJson(data)
    const chunk = extractClaudeStreamText(payload)

    if (!chunk) {
      return
    }

    text += chunk
    onDelta(chunk)
  })

  if (!text) {
    throw new Error("Claude 没有返回可解析的流式内容。")
  }

  return text
}

function buildGroundedSystemPrompt(
  settings: ExtensionSettings,
  pageContext: PageContext
) {
  const blocks = [
    settings.systemPrompt.trim(),
    "以下是当前网页的结构化上下文。回答时优先依据这些信息；如果页面没有提供答案，就明确指出缺失处。",
    settings.includeMetadata
      ? [
          `页面标题：${pageContext.title || "未命名页面"}`,
          `页面地址：${pageContext.url}`,
          pageContext.description ? `页面描述：${pageContext.description}` : "",
          pageContext.byline ? `作者信息：${pageContext.byline}` : "",
          pageContext.lang ? `页面语言：${pageContext.lang}` : "",
          pageContext.headings.length
            ? `主要标题：${pageContext.headings.join(" / ")}`
            : "",
          pageContext.mathExpressions.length
            ? `页面公式：${pageContext.mathExpressions.join(" / ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    settings.includeSelection && pageContext.selection
      ? `用户当前选中文本：\n${pageContext.selection}`
      : "",
    `正文摘录：\n${pageContext.content}`,
  ]

  return blocks.filter(Boolean).join("\n\n")
}

function resolveOpenAiEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "")

  if (normalized.endsWith("/chat/completions")) {
    return normalized
  }

  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`
  }

  return `${normalized}/chat/completions`
}

function resolveOpenAiEndpoints(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  const endpoints = [resolveOpenAiEndpoint(normalized)]

  if (normalized === LEGACY_DIRECT_RELAY_BASE_URL) {
    endpoints.push(resolveOpenAiEndpoint(LOCAL_CODEX_PROXY_BASE_URL))
  }

  return [...new Set(endpoints)]
}

function resolveClaudeEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "")

  if (normalized.endsWith("/messages")) {
    return normalized
  }

  if (normalized.endsWith("/v1")) {
    return `${normalized}/messages`
  }

  return `${normalized}/v1/messages`
}

async function readSseStream(
  response: Response,
  onMessage: (message: { event: string; data: string }) => void
) {
  if (!response.body) {
    throw new Error("流式响应不可用。")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      buffer += decoder.decode()
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n\r?\n/)
    buffer = parts.pop() || ""

    for (const part of parts) {
      const message = parseSseMessage(part)

      if (message) {
        onMessage(message)
      }
    }
  }

  if (buffer.trim()) {
    const message = parseSseMessage(buffer)

    if (message) {
      onMessage(message)
    }
  }
}

function parseSseMessage(raw: string) {
  const lines = raw.split(/\r?\n/)
  let event = "message"
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue
    }

    if (line.startsWith("event:")) {
      event = line.slice(6).trim()
      continue
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event,
    data: dataLines.join("\n"),
  }
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") || ""
  const rawText = await response.text()

  if (contentType.includes("application/json")) {
    try {
      return {
        contentType,
        json: JSON.parse(rawText) as unknown,
        text: rawText,
      }
    } catch {
      return {
        contentType,
        json: null,
        text: rawText,
      }
    }
  }

  return {
    contentType,
    json: null,
    text: rawText,
  }
}

function extractApiError({
  providerLabel,
  endpoint,
  response,
  data,
}: {
  providerLabel: string
  endpoint: string
  response: Response
  data: ParsedResponseBody
}) {
  const jsonError = extractJsonErrorMessage(data.json)

  if (jsonError) {
    return jsonError
  }

  const endpointHost = safeHostname(endpoint)
  const endpointPath = safePathname(endpoint)
  const statusLabel = `HTTP ${response.status}${
    response.statusText ? ` ${response.statusText}` : ""
  }`

  if (response.status >= 500) {
    return `${providerLabel} 中转服务暂时不可用：${endpointHost} 返回 ${statusLabel}。请求路径：${endpointPath}。请稍后重试。`
  }

  const normalizedText = summarizeErrorText(data.text, data.contentType)

  if (normalizedText) {
    return `${providerLabel} 请求失败：${statusLabel}。${normalizedText}`
  }

  return `${providerLabel} 请求失败：${statusLabel}。请求路径：${endpointPath}`
}

function extractJsonErrorMessage(data: unknown) {
  if (
    typeof data === "object" &&
    data &&
    "error" in data &&
    typeof data.error === "object" &&
    data.error &&
    "message" in data.error &&
    typeof data.error.message === "string"
  ) {
    return data.error.message
  }

  return ""
}

function summarizeErrorText(rawText: string, contentType: string) {
  if (!rawText.trim()) {
    return ""
  }

  const normalized = contentType.includes("text/html")
    ? rawText
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    : rawText

  const compact = normalized.replace(/\s+/g, " ").trim()

  if (!compact) {
    return ""
  }

  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return "unknown-host"
  }
}

function safePathname(url: string) {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function extractOpenAiStreamText(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload &&
    "choices" in payload &&
    Array.isArray(payload.choices)
  ) {
    const firstChoice = payload.choices[0]

    if (
      typeof firstChoice === "object" &&
      firstChoice &&
      "delta" in firstChoice &&
      typeof firstChoice.delta === "object" &&
      firstChoice.delta &&
      "content" in firstChoice.delta
    ) {
      return normalizeOpenAiContent(firstChoice.delta.content)
    }
  }

  return ""
}

function extractClaudeStreamText(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload &&
    "type" in payload &&
    payload.type === "content_block_delta" &&
    "delta" in payload &&
    typeof payload.delta === "object" &&
    payload.delta &&
    "type" in payload.delta &&
    payload.delta.type === "text_delta" &&
    "text" in payload.delta &&
    typeof payload.delta.text === "string"
  ) {
    return payload.delta.text
  }

  return ""
}

function shouldRetryOpenAiEndpoint(
  status: number,
  endpoint: string,
  endpoints: string[]
) {
  if (endpoints.length <= 1) {
    return false
  }

  return (
    endpoint.startsWith(LEGACY_DIRECT_RELAY_BASE_URL) &&
    status >= 500 &&
    status < 600
  )
}

function shouldRetryOpenAiError(endpoint: string, endpoints: string[]) {
  if (endpoints.length <= 1) {
    return false
  }

  return endpoint.startsWith(LEGACY_DIRECT_RELAY_BASE_URL)
}

function normalizeOpenAiContent(content: unknown) {
  if (typeof content === "string") {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part
      }

      if (
        typeof part === "object" &&
        part &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text
      }

      return ""
    })
    .join("\n")
    .trim()
}

function normalizeClaudeContent(content: unknown) {
  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .map((block) => {
      if (
        typeof block === "object" &&
        block &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        return block.text
      }

      return ""
    })
    .join("\n")
    .trim()
}
