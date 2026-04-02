import { useEffect, useState } from "react"
import { ShieldAlert } from "lucide-react"
import { toast } from "sonner"

import { getSettings, saveSettings } from "@/lib/storage"
import { testProviderConnection } from "@/lib/provider-test"
import type { ExtensionSettings, ProviderId, ProviderSettings } from "@/lib/types"
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
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toaster } from "@/components/ui/sonner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const PROVIDER_NAMES: Record<ProviderId, string> = {
  openai: "OpenAI",
  claude: "Claude",
}

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [testingProvider, setTestingProvider] = useState<ProviderId | null>(null)

  useEffect(() => {
    void loadSettings()
  }, [])

  async function loadSettings() {
    try {
      setSettings(await getSettings())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载设置失败。")
    }
  }

  function updateProviderField(
    provider: ProviderId,
    key: keyof ProviderSettings,
    value: string | boolean
  ) {
    setSettings((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        [provider]: {
          ...current[provider],
          [key]: value,
        },
      }
    })
  }

  function updateSetting<K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) {
    setSettings((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        [key]: value,
      }
    })
  }

  async function handleSave() {
    if (!settings) {
      return
    }

    setIsSaving(true)

    try {
      const next = await saveSettings(settings)
      setSettings(next)
      toast.success("设置已保存。")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存设置失败。")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleTestProvider(provider: ProviderId) {
    if (!settings) {
      return
    }

    setTestingProvider(provider)

    try {
      const result = await testProviderConnection(provider, settings[provider])

      if (result.ok) {
        toast.success(result.summary)
      } else {
        toast.error(result.summary)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试连接失败。")
    } finally {
      setTestingProvider(null)
    }
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.14),transparent_38%),radial-gradient(circle_at_top_right,rgba(244,162,97,0.15),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.68),transparent)]" />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Chrome MV3</Badge>
              <Badge>shadcn/ui</Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              WebAgentExtension 设置
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              这里配置默认模型提供商、Base URL、API Key 以及网页抓取范围。
              后台请求始终从扩展可信上下文发出，不会暴露给网页脚本。
            </p>
          </div>
          <Button onClick={() => void handleSave()} disabled={isSaving}>
            保存设置
          </Button>
        </header>

        <Alert>
          <ShieldAlert />
          <AlertTitle>安全边界</AlertTitle>
          <AlertDescription>
            API Key 只保存在扩展本地存储中，不放进源码表单默认值；但只要是纯前端扩展，
            密钥依然无法做到真正保密。若要分发给他人，建议改成你自己的后端代理。
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="providers" className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="providers">Providers</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">默认提供商</CardTitle>
                <CardDescription>
                  侧边栏默认选中的模型通道。你仍然可以在聊天面板里即时切换。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ToggleGroup
                  type="single"
                  value={settings.selectedProvider}
                  onValueChange={(value) => {
                    if (value === "openai" || value === "claude") {
                      updateSetting("selectedProvider", value)
                    }
                  }}
                  variant="outline"
                >
                  <ToggleGroupItem value="openai">OpenAI</ToggleGroupItem>
                  <ToggleGroupItem value="claude">Claude</ToggleGroupItem>
                </ToggleGroup>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <ProviderCard
                provider="openai"
                settings={settings.openai}
                onChange={updateProviderField}
                onTest={handleTestProvider}
                isTesting={testingProvider === "openai"}
              />
              <ProviderCard
                provider="claude"
                settings={settings.claude}
                onChange={updateProviderField}
                onTest={handleTestProvider}
                isTesting={testingProvider === "claude"}
              />
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">网页分析参数</CardTitle>
                <CardDescription>
                  控制发送给模型的上下文规模，以及是否附带页面元信息和选中文本。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="pageTextLimit">页面正文上限</FieldLabel>
                    <FieldContent>
                      <Input
                        id="pageTextLimit"
                        type="number"
                        min={2000}
                        max={50000}
                        value={settings.pageTextLimit}
                        onChange={(event) => {
                          updateSetting(
                            "pageTextLimit",
                            Number(event.target.value) || 0
                          )
                        }}
                      />
                      <FieldDescription>
                        建议保留在 10k-20k 字符，避免无意义地增加 token 成本。
                      </FieldDescription>
                    </FieldContent>
                  </Field>

                  <Separator />

                  <Field orientation="responsive">
                    <FieldLabel htmlFor="includeMetadata">附带页面元信息</FieldLabel>
                    <FieldContent>
                      <Switch
                        id="includeMetadata"
                        checked={settings.includeMetadata}
                        onCheckedChange={(checked) => {
                          updateSetting("includeMetadata", checked)
                        }}
                      />
                      <FieldDescription>
                        包括标题、URL、描述、作者、标题层级等辅助信息。
                      </FieldDescription>
                    </FieldContent>
                  </Field>

                  <Field orientation="responsive">
                    <FieldLabel htmlFor="includeSelection">附带选中文本</FieldLabel>
                    <FieldContent>
                      <Switch
                        id="includeSelection"
                        checked={settings.includeSelection}
                        onCheckedChange={(checked) => {
                          updateSetting("includeSelection", checked)
                        }}
                      />
                      <FieldDescription>
                        如果用户在网页中高亮了一段文字，模型会把它作为优先上下文。
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">系统提示词</CardTitle>
                <CardDescription>
                  定义统一的回答风格、约束与输出偏好。网页内容会被追加在这段提示词后面。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="systemPrompt">Instruction</FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="systemPrompt"
                        value={settings.systemPrompt}
                        onChange={(event) => {
                          updateSetting("systemPrompt", event.target.value)
                        }}
                        rows={8}
                      />
                      <FieldDescription>
                        建议把它保持为“严格基于网页内容、信息不足时直说不足”这种 grounded 风格。
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Toaster />
    </div>
  )
}

interface ProviderCardProps {
  provider: ProviderId
  settings: ProviderSettings
  onChange: (
    provider: ProviderId,
    key: keyof ProviderSettings,
    value: string | boolean
  ) => void
  onTest: (provider: ProviderId) => Promise<void>
  isTesting: boolean
}

function ProviderCard({
  provider,
  settings,
  onChange,
  onTest,
  isTesting,
}: ProviderCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{PROVIDER_NAMES[provider]}</CardTitle>
            <CardDescription>
              {provider === "openai"
                ? "适合 OpenAI 兼容中转站或官方接口。"
                : "预留给 Claude / Anthropic Messages API。"}
            </CardDescription>
          </div>
          <Badge>{settings.enabled ? "Enabled" : "Disabled"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onTest(provider)}
            disabled={isTesting}
          >
            {isTesting ? "测试中..." : "测试连接"}
          </Button>
        </div>
        <FieldGroup>
          <Field orientation="responsive">
            <FieldLabel htmlFor={`${provider}-enabled`}>启用通道</FieldLabel>
            <FieldContent>
              <Switch
                id={`${provider}-enabled`}
                checked={settings.enabled}
                onCheckedChange={(checked) => {
                  onChange(provider, "enabled", checked)
                }}
              />
              <FieldDescription>
                临时关闭后，侧边栏不会再向这个 provider 发请求。
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${provider}-base-url`}>Base URL</FieldLabel>
            <FieldContent>
              <Input
                id={`${provider}-base-url`}
                value={settings.baseUrl}
                onChange={(event) => {
                  onChange(provider, "baseUrl", event.target.value)
                }}
                placeholder={
                  provider === "openai"
                    ? "https://api.openai.com/v1"
                    : "https://api.anthropic.com/v1"
                }
              />
              <FieldDescription>
                {provider === "openai"
                  ? "当前建议使用本机 Codex 代理 http://127.0.0.1:15721/v1。默认会自动拼接 /chat/completions。若你填的是完整 endpoint，也会直接使用。"
                  : "默认会自动拼接 /v1/messages 或 /messages。"}
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${provider}-model`}>Model</FieldLabel>
            <FieldContent>
              <Input
                id={`${provider}-model`}
                value={settings.model}
                onChange={(event) => {
                  onChange(provider, "model", event.target.value)
                }}
              />
              <FieldDescription>
                可以填官方模型，也可以填中转站暴露出来的模型标识。
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${provider}-api-key`}>API Key</FieldLabel>
            <FieldContent>
              <Input
                id={`${provider}-api-key`}
                type="password"
                value={settings.apiKey}
                onChange={(event) => {
                  onChange(provider, "apiKey", event.target.value)
                }}
                placeholder="sk-..."
              />
              <FieldDescription>
                保存在扩展本地存储里，只供后台 worker 发请求时使用。
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
