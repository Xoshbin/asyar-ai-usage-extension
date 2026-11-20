# AI Usage

> See how much of your AI quota is left, right from the launcher or the menu bar.

`org.asyar.ai-usage` is a Tier 2 Asyar extension (ai · macOS, Windows, Linux).

## What it does

The extension provides **2 commands**:

| Command | Mode | What it does |
| --- | --- | --- |
| **AI Usage** | `view` | See your Codex, Claude, and OpenRouter quota at a glance |
| **AI Usage Poll** | `background` | Background check of configured AI usage sources |

## Permissions

```json
"permissions": [
  "network",
  "network:secrets",
  "storage:read",
  "storage:write",
  "notifications:send",
  "clipboard:write"
]
```

## Install

Install from the [Asyar Store](https://asyar.org/extensions).

## Develop

```bash
# from this directory
pnpm install
pnpm dev          # vite dev server
pnpm test:run     # vitest
pnpm build        # emits dist/{worker,view}.js + assets
pnpm link         # registers the dev path with the launcher
asyar publish     # builds, packages, GitHub release, store submission
```

## License

[MIT](./LICENSE) © Khoshbin
