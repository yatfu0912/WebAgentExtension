import type { ManifestV3Export } from "@crxjs/vite-plugin"

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "WebAgentExtension",
  version: "0.2.0",
  description: "在 Chrome 侧边栏里与 AI 对话，并基于当前网页内容进行分析。",
  action: {
    default_title: "Open WebAgentExtension",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  side_panel: {
    default_path: "sidepanel.html",
  },
  options_page: "options.html",
  permissions: ["storage", "sidePanel", "scripting", "tabs"],
  host_permissions: [
    "<all_urls>",
    "http://127.0.0.1/*",
    "http://localhost/*",
  ],
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/main.ts"],
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["sidepanel.html", "assets/*"],
      matches: ["<all_urls>"],
    },
  ],
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'self'; connect-src 'self' https://* http://* http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*;",
  },
}

export default manifest
