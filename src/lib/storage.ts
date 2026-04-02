import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "@/lib/defaults"
import type { ExtensionSettings, ProviderSettings } from "@/lib/types"

const LEGACY_OPENAI_MODEL = "gpt-4.1-mini"
const LEGACY_DIRECT_RELAY_BASE_URL = "https://yunyi.cfd/codex"
const LOCAL_CODEX_PROXY_BASE_URL = "http://127.0.0.1:15721/v1"

function mergeProviderSettings(
  defaults: ProviderSettings,
  next?: Partial<ProviderSettings>
): ProviderSettings {
  return {
    enabled: next?.enabled ?? defaults.enabled,
    baseUrl: next?.baseUrl?.trim() ? next.baseUrl : defaults.baseUrl,
    apiKey: next?.apiKey?.trim() ? next.apiKey : defaults.apiKey,
    model: next?.model?.trim() ? next.model : defaults.model,
  }
}

function mergeSettings(
  next?: Partial<ExtensionSettings> | null
): ExtensionSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...next,
    openai: mergeProviderSettings(DEFAULT_SETTINGS.openai, next?.openai),
    claude: mergeProviderSettings(DEFAULT_SETTINGS.claude, next?.claude),
  }

  if (
    merged.openai.baseUrl === DEFAULT_SETTINGS.openai.baseUrl &&
    merged.openai.apiKey === DEFAULT_SETTINGS.openai.apiKey &&
    merged.openai.model === LEGACY_OPENAI_MODEL
  ) {
    merged.openai.model = DEFAULT_SETTINGS.openai.model
  }

  if (
    merged.openai.baseUrl === LEGACY_DIRECT_RELAY_BASE_URL &&
    merged.openai.model === DEFAULT_SETTINGS.openai.model
  ) {
    merged.openai.baseUrl = LOCAL_CODEX_PROXY_BASE_URL
  }

  return merged
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)

  return mergeSettings(stored[SETTINGS_STORAGE_KEY] as ExtensionSettings | undefined)
}

export async function saveSettings(
  settings: ExtensionSettings
): Promise<ExtensionSettings> {
  const merged = mergeSettings(settings)

  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: merged })

  return merged
}

export async function ensureSettings(): Promise<ExtensionSettings> {
  const settings = await getSettings()

  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings })

  return settings
}
