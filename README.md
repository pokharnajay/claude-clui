# Clui CC

A floating desktop overlay for **Claude Code** and **ChatGPT** on macOS. Transparent, always-on-top pill interface with multi-tab sessions, permission approval UI, voice input, screenshots, and provider switching.

## Setup on a New Device

### Prerequisites

- **macOS 13+**
- **Node.js 20+** (LTS recommended)
- **Python 3.12+** with `setuptools`
- **Claude Code CLI** (authenticated)

### Step-by-Step

**1. Install system dependencies**

```bash
# Xcode command line tools (needed for native module compilation)
xcode-select --install

# Node.js (if not already installed)
brew install node

# Python setuptools (required by node-gyp for native modules)
python3 -m pip install --upgrade pip setuptools
```

**2. Install and authenticate Claude Code CLI**

```bash
npm install -g @anthropic-ai/claude-code
claude   # follow the auth prompts
```

**3. Install Whisper for voice input (optional)**

```bash
brew install whisper-cli
```

**4. Clone and install**

```bash
git clone https://github.com/pokharnajay/clui-cc.git
cd clui-cc
npm install
```

**5. Build and install the app**

```bash
npm run dist
```

Then copy to Applications:

```bash
rm -rf "/Applications/Clui CC.app"
ditto "release/mac-arm64/Clui CC.app" "/Applications/Clui CC.app"
codesign --force --deep --sign - "/Applications/Clui CC.app"
```

Or just double-click `install-app.command` in Finder — it does all of the above automatically.

**6. First launch**

Open **Clui CC** from Applications or Spotlight.

> macOS will block it because it's unsigned. Go to **System Settings > Privacy & Security > Open Anyway**. Only needed once.

> If prompted for **Screen Recording** permission, grant it (needed for screenshots).

### Keyboard Shortcut

Press **Option + Space** to show/hide the overlay. Fallback: **Cmd+Shift+K**.

## Features

- **Claude Code mode** — multi-tab sessions, each running `claude -p` with live streaming, permission approval, file attachments
- **ChatGPT mode** — embedded ChatGPT webview with persistent login, dark theme, detached input pill
- **Provider switch** — toggle Claude/ChatGPT from the settings popover (click the `...` button)
- **Screenshots** — camera button captures screen and sends to the active provider
- **Voice input** — local speech-to-text via Whisper
- **Dark/light theme** — with smooth cross-fade animations
- **Spring animations** — card expand/collapse uses spring physics

## Project Structure

```
src/
├── main/                   # Electron main process
│   ├── claude/             # ControlPlane, RunManager, EventNormalizer
│   ├── hooks/              # PermissionServer (PreToolUse HTTP hooks)
│   └── index.ts            # Window, IPC handlers, tray, screenshot
├── renderer/               # React frontend
│   ├── components/
│   │   ├── ChatGPTView.tsx # ChatGPT webview + CSS injection + message injection
│   │   ├── SettingsPopover.tsx # Provider toggle, theme, settings
│   │   ├── ConversationView.tsx
│   │   ├── InputBar.tsx
│   │   └── TabStrip.tsx
│   ├── stores/             # Zustand session store
│   ├── App.tsx             # Main orchestrator — card, input row, animations
│   └── theme.ts            # Dual palette, provider-aware colors
├── preload/                # Secure IPC bridge (window.clui API)
└── shared/                 # Types, IPC channel definitions
```

## Rebuilding After Changes

```bash
cd clui-cc
npm run dist
rm -rf "/Applications/Clui CC.app"
ditto "release/mac-arm64/Clui CC.app" "/Applications/Clui CC.app"
codesign --force --deep --sign - "/Applications/Clui CC.app"
```

Then **Cmd+Q** the running app and reopen it.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| App won't open | System Settings > Privacy & Security > Open Anyway |
| `npm install` fails with node-gyp errors | Run `xcode-select --install` and `python3 -m pip install setuptools` |
| `claude` command not found | Run `npm install -g @anthropic-ai/claude-code` |
| Screenshots black/empty | Grant Screen Recording permission in System Settings |
| ChatGPT not loading | Check internet connection; login persists in `persist:chatgpt` partition |
| Voice input not working | Run `brew install whisper-cli` |

Quick diagnostic:

```bash
npm run doctor
```

## Tech Stack

| Component | Version |
|-----------|---------|
| Electron | 35.x |
| electron-vite | 3.x |
| React | 19.x |
| Framer Motion | 12.x |
| Zustand | 5.x |
| node-pty | 1.x |

## License

[MIT](LICENSE)
