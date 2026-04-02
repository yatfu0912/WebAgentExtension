/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_BASE_URL?: string
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_OPENAI_MODEL?: string
  readonly VITE_CLAUDE_BASE_URL?: string
  readonly VITE_CLAUDE_API_KEY?: string
  readonly VITE_CLAUDE_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
