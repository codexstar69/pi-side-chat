<p align="center">
  <b>pi-side-chat</b> — a standalone side chat extension for Pi CLI
</p>

<h1 align="center">pi-side-chat</h1>
<p align="center"><strong>Parallel AI agent with read-only tools, running alongside your main coding agent in Pi CLI.</strong></p>
<p align="center">
  <a href="https://www.npmjs.com/package/@codexstar/pi-side-chat"><img src="https://img.shields.io/npm/v/@codexstar/pi-side-chat.svg" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="Platform">
</p>

---

<p align="center">
  <img src="docs/screenshots/side-chat.png" alt="Pi Side Chat" width="700">
</p>

---

## What is this?

A floating AI chat panel that runs **alongside** your main Pi coding agent. Open it with `Alt+/` and ask questions about what the agent is doing, get a session recap, check if the agent is stuck, or just chat.

- **Parallel AI instance** — does not interrupt your main agent
- **Read-only tools only** — safe inspection, no accidental file edits
- **`peek_main` tool** — lets the side chat see what the main agent is working on
- **Built-in shortcuts** — type `analyze`, `stuck`, `recap`, `status`, or `help`
- **Per-session conversations** — each new session starts fresh

## Install

```bash
pi install @codexstar/pi-side-chat
```

## Usage

| Action | How |
|--------|-----|
| Open/toggle chat | `Alt+/` or `/sidechat` |
| Send message | Type + `Enter` |
| Close | `Esc` |
| Unfocus (back to main) | `Alt+/` again |
| Open settings | `/sidechat-settings` |

## Settings

Run `/sidechat-settings` to configure:

- **Model** — pick any available model or use the session default
- **Width/Height** — adjust the overlay size
- **Enable/Disable** — toggle the extension

Settings persist to `~/.pi/side-chat/config.json`.

## Requirements

- [Pi CLI](https://github.com/badlogic/pi-mono) with extension support
- Node.js >= 18.17

## License

MIT
