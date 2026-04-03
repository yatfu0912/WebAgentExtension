import type {
  ProviderId,
  ProviderSettings,
  ProviderTestResult,
} from "@/lib/types"
import { buildFetchInit, isLoopbackUrl } from "@/lib/network"

export async function testProviderConnection(
  providerId: ProviderId,
  settings: ProviderSettings
): Promise<ProviderTestResult> {
  if (providerId === "openai") {
    return testOpenAiRelay(settings)
  }

  return testClaudeRelay(settings)
}

async function testOpenAiRelay(
  settings: ProviderSettings
): Promise<ProviderTestResult> {
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "")
  const healthEndpoint = stripKnownEndpointSuffix(baseUrl)
  const modelsEndpoint = `${healthEndpoint}/models`
  const chatEndpoint = resolveOpenAiChatEndpoint(baseUrl)
  const responsesEndpoint = `${healthEndpoint}/responses`
  const isLocalProxy = isLoopbackUrl(chatEndpoint)

  const diagnostics: string[] = []
  if (!isLocalProxy) {
    const health = await fetchText(healthEndpoint, {
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
    })

    if (health.ok) {
      diagnostics.push(`健康检查可达：${healthEndpoint}`)
    } else {
      diagnostics.push(`健康检查失败：${healthEndpoint} -> HTTP ${health.status}`)
    }

    const models = await fetchText(modelsEndpoint, {
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
    })

    if (models.ok) {
      const names = extractModelNames(models.text)
      diagnostics.push(
        names.length
          ? `模型列表可读：${names.slice(0, 5).join(", ")}`
          : `模型列表可读：${modelsEndpoint}`
      )
    } else {
      diagnostics.push(`模型列表失败：${modelsEndpoint} -> HTTP ${models.status}`)
    }
  }

  const chat = await fetchText(chatEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 8,
    }),
  })

  if (chat.ok) {
    return {
      ok: true,
      summary: `生成接口正常：${chatEndpoint}`,
    }
  }

  diagnostics.push(
    `生成接口失败：${chatEndpoint} -> HTTP ${chat.status}${
      chat.text ? ` (${summarize(chat.text)})` : ""
    }`
  )

  if (!isLocalProxy) {
    const responses = await fetchText(responsesEndpoint, {
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
    })

    if (responses.status === 426) {
      diagnostics.push(
        `Responses 端点返回 426，像是要求 WebSocket 升级：${responsesEndpoint}`
      )
    } else if (!responses.ok) {
      diagnostics.push(`Responses 探测结果：${responsesEndpoint} -> HTTP ${responses.status}`)
    }
  }

  return {
    ok: false,
    summary: [
      ...diagnostics,
      isLoopbackUrl(chatEndpoint)
        ? "如果这是第一次访问本机代理，请点击测试连接后允许 Chrome 的本地网络访问权限。"
        : "",
    ]
      .filter(Boolean)
      .join("；"),
  }
}

async function testClaudeRelay(
  settings: ProviderSettings
): Promise<ProviderTestResult> {
  const endpoint = resolveClaudeMessagesEndpoint(settings.baseUrl)
  const response = await fetchText(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": settings.apiKey,
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 8,
      messages: [{ role: "user", content: "ping" }],
    }),
  })

  if (response.ok) {
    return {
      ok: true,
      summary: `Claude 接口正常：${endpoint}`,
    }
  }

  return {
    ok: false,
    summary: `Claude 接口失败：${endpoint} -> HTTP ${response.status}${
      response.text ? ` (${summarize(response.text)})` : ""
    }`,
  }
}

async function fetchText(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, buildFetchInit(url, init))
    const text = await response.text()

    return {
      ok: response.ok,
      status: response.status,
      text,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: error instanceof Error ? error.message : "network error",
    }
  }
}

function resolveOpenAiChatEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "")

  if (normalized.endsWith("/chat/completions")) {
    return normalized
  }

  return `${normalized}/chat/completions`
}

function resolveClaudeMessagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "")

  if (normalized.endsWith("/messages")) {
    return normalized
  }

  if (normalized.endsWith("/v1")) {
    return `${normalized}/messages`
  }

  return `${normalized}/v1/messages`
}

function stripKnownEndpointSuffix(baseUrl: string) {
  return baseUrl.replace(
    /\/(chat\/completions|responses|completions|messages|models)$/i,
    ""
  )
}

function extractModelNames(raw: string) {
  try {
    const payload = JSON.parse(raw) as {
      data?: Array<{
        id?: string
      }>
    }

    return (payload.data || [])
      .map((item) => item.id || "")
      .filter(Boolean)
  } catch {
    return []
  }
}

function summarize(raw: string) {
  const compact = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!compact) {
    return ""
  }

  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact
}
