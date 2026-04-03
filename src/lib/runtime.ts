import type {
  AnalyzePageStreamMessage,
  RuntimeMessage,
  RuntimeResponse,
  StreamResponseMessage,
} from "@/lib/types"

export const RUNTIME_MESSAGES = {
  getActivePageContext: "get-active-page-context",
  analyzePage: "analyze-page",
  analyzePageStream: "analyze-page-stream",
} as const

export async function sendRuntimeMessage<T>(
  message: RuntimeMessage
): Promise<T> {
  const response = (await chrome.runtime.sendMessage(
    message
  )) as RuntimeResponse<T>

  if (!response?.ok) {
    throw new Error(response?.error || "扩展后台没有返回有效结果。")
  }

  return response.data
}

export function connectAnalyzePageStream(
  message: AnalyzePageStreamMessage,
  handlers: {
    onMessage: (message: StreamResponseMessage) => void
    onDisconnect?: () => void
  }
) {
  const port = chrome.runtime.connect({
    name: RUNTIME_MESSAGES.analyzePageStream,
  })

  port.onMessage.addListener((nextMessage: StreamResponseMessage) => {
    handlers.onMessage(nextMessage)
  })

  port.onDisconnect.addListener(() => {
    handlers.onDisconnect?.()
  })

  port.postMessage(message)

  return port
}
