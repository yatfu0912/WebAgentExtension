import type { ExtensionSettings } from "@/lib/types"

export const SETTINGS_STORAGE_KEY = "web-agent-extension-settings"

export const DEFAULT_SETTINGS: ExtensionSettings = {
  selectedProvider: "openai",
  systemPrompt:
    "你是 WebAgentExtension 内的网页分析助手。回答时必须优先基于当前网页内容，给出清晰、具体、可执行的结论；如果网页里没有足够信息，必须直接说明缺失点，不要编造。",
  pageTextLimit: 18000,
  includeMetadata: true,
  includeSelection: true,
  openai: {
    enabled: true,
    baseUrl: "http://127.0.0.1:15721/v1",
    apiKey: "",
    model: "gpt-5.4",
  },
  claude: {
    enabled: true,
    baseUrl: "https://api.anthropic.com/v1",
    apiKey: "",
    model: "claude-sonnet-4-20250514",
  },
}
