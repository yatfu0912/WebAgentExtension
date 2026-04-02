import type { RuntimeMessage, RuntimeResponse } from "@/lib/types"

export const RUNTIME_MESSAGES = {
  getActivePageContext: "get-active-page-context",
  analyzePage: "analyze-page",
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
