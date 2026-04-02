export type ProviderId = "openai" | "claude"

export type ChatRole = "user" | "assistant"

export interface ChatTurn {
  role: ChatRole
  content: string
}

export interface ChatMessage extends ChatTurn {
  id: string
  createdAt: string
  provider?: ProviderId
}

export interface ProviderSettings {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

export interface ExtensionSettings {
  selectedProvider: ProviderId
  systemPrompt: string
  pageTextLimit: number
  includeMetadata: boolean
  includeSelection: boolean
  openai: ProviderSettings
  claude: ProviderSettings
}

export interface PageContext {
  tabId: number
  title: string
  url: string
  description: string
  byline: string
  lang: string
  selection: string
  headings: string[]
  content: string
  capturedAt: string
}

export interface AnalyzePageResult {
  provider: ProviderId
  text: string
  pageContext: PageContext
}

export interface GetActivePageContextMessage {
  type: "get-active-page-context"
}

export interface AnalyzePageMessage {
  type: "analyze-page"
  provider?: ProviderId
  messages: ChatTurn[]
}

export type RuntimeMessage = GetActivePageContextMessage | AnalyzePageMessage

export interface RuntimeSuccess<T> {
  ok: true
  data: T
}

export interface RuntimeFailure {
  ok: false
  error: string
}

export type RuntimeResponse<T> = RuntimeSuccess<T> | RuntimeFailure
