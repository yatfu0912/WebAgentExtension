# WebAgentExtension

WebAgentExtension is a Chrome MV3 extension for chatting with AI about the page you are currently viewing.

It opens as a floating panel on the right side of the browser, captures the active page context, and sends your prompt plus the extracted page content to a configurable AI provider.

## What It Does

- Chat with AI about the current webpage
- Extract page title, URL, headings, selected text, and visible body content
- Support multiple providers with editable Base URL, API Key, and model settings
- Provide a settings page built with `shadcn/ui`
- Work with a local OpenAI-compatible proxy such as `http://127.0.0.1:15721/v1`
- Fall back more gracefully when relays return HTML error pages or gateway failures

## Tech Stack

- React
- TypeScript
- Vite
- CRXJS
- Chrome Extension Manifest V3
- shadcn/ui
- Tailwind CSS v4

## Project Structure

- `manifest.config.ts`: MV3 manifest source
- `src/background.ts`: background service worker, page extraction, provider calls
- `src/content/`: floating panel injection logic
- `src/sidepanel/`: chat UI
- `src/options/`: settings UI
- `src/lib/providers.ts`: OpenAI / Claude request adapters
- `src/lib/storage.ts`: local settings persistence
- `src/lib/provider-test.ts`: provider connectivity diagnostics

## Local Development

1. Install dependencies

```bash
npm install
```

2. Optional: create a local env file for your own defaults

```bash
cp .env.example .env.local
```

3. Build the extension

```bash
npm run build
```

4. Load the unpacked extension in Chrome

- Open `chrome://extensions`
- Enable `Developer mode`
- Click `Load unpacked`
- Select the generated `dist/` directory

## Usage

1. Open a normal `http` or `https` webpage
2. Click the extension icon
3. The floating panel opens on the right side
4. Configure your provider in the settings page if needed
5. Ask questions such as:

- Summarize this page
- Extract the action items
- Explain the core argument
- Translate the visible content

## Provider Configuration

The extension supports configurable provider settings from the options page:

- Base URL
- API Key
- Model
- Enable / disable provider

For this machine, the recommended OpenAI-compatible endpoint is:

`http://127.0.0.1:15721/v1`

The extension will append `/chat/completions` automatically unless you provide a full endpoint.

## Security Notes

- Do not commit real API keys
- Keep secrets in extension settings or ignored local env files
- `.env.example` is safe to commit
- `.env`, `.env.*`, and `*.local` are ignored by git
- A public frontend extension cannot fully protect secrets if end users run it directly

If you want to distribute this extension broadly, put model access behind your own backend proxy instead of shipping live API credentials.

## Scripts

```bash
npm run build
npm run lint
```

## License

Private by default unless you add your own license file.
