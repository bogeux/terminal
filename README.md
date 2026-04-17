# Terminal

A tiling terminal emulator for Windows built with Tauri 2 + xterm.js. Uses
ConPTY (via `portable-pty`) to drive the shell, so it supports PowerShell,
cmd, Git Bash, and any WSL distro.

## Prerequisites

Install once:

- **Rust** (`rustup` default toolchain) — https://rustup.rs
- **Node 18+** and **npm**
- **Microsoft Visual C++ Build Tools** (the "Desktop development with C++"
  workload from Visual Studio Installer) — required by Rust on Windows
- **WebView2** — present on all modern Windows. If you want to target older
  machines, the config already ships the bootstrapper.

## Running

```bash
npm install
npm run tauri dev
```

First run compiles the Rust backend (takes a few minutes). After that it's
fast. The CLI opens a window with the shell picker.

## Building a release

```bash
npm run tauri build
```

Produces an installer (`.msi` and `.exe`) under
`src-tauri/target/release/bundle/`. Typical installer size: ~10 MB.

## Shortcuts

| Shortcut           | Action                          |
| ------------------ | ------------------------------- |
| `Ctrl+Shift+T`     | New tab                         |
| `Ctrl+Shift+O`     | Split focused pane above/below  |
| `Ctrl+Shift+E`     | Split focused pane left/right   |
| `Ctrl+Shift+W`     | Close focused pane              |
| `Ctrl+Tab`         | Next tab                        |
| `Ctrl+Shift+Tab`   | Previous tab                    |
| `Alt+Arrow`        | Cycle pane focus                |
| `Ctrl+Shift+P`     | Open command palette            |

## Adding commands to the palette

The palette mechanism is wired; the command list is intentionally short.
Add entries in [`src/commands.js`](src/commands.js):

```js
palette.register({
  id: "send.docker.ps",
  title: "Run: docker ps",
  run: () => { /* ... */ },
});
```

Each command gets fuzzy-filtered by title. Optional `keybinding` is shown on
the right side of the palette row.

## History

Every line entered into any pane is appended to `%USERPROFILE%\.terminal_history`
(one command per line, UTF-8). Capture is naive — it tracks printable
keystrokes and flushes on Enter. It does not understand arrow-key history
navigation, bracketed paste, or readline editing; if a shell rewrites the
prompt line, the stored entry may differ from what ultimately ran.

Read from Rust via the `history_read` command, or just open the file in any
editor.

## Architecture

```
┌─────────────┐    Tauri IPC    ┌──────────────┐  ConPTY  ┌─────────┐
│  xterm.js   │  ◄───────────►  │   Rust core  │  ◄────►  │  shell  │
│  (webview)  │                 │ portable-pty │          │         │
└─────────────┘                 └──────────────┘          └─────────┘
```

- **`src/`** — frontend (Vite + vanilla JS)
  - `terminal.js` — per-pane xterm.js wrapper
  - `layout.js` — binary-tree tiling with draggable dividers
  - `tabs.js` — tab + pane orchestration
  - `palette.js` — Ctrl+Shift+K command palette
  - `commands.js` — palette command registry (add your own here)
  - `shell-picker.js` — picker shown on new tab/pane
- **`src-tauri/src/`** — backend
  - `pty.rs` — PTY registry, spawn/write/resize/kill
  - `shell.rs` — enumerate PowerShell/cmd/Git Bash/WSL
  - `history.rs` — `.terminal_history` read/append

## Known limitations / TODO

- `Alt+Arrow` currently cycles focus rather than going in the pressed
  direction. Directional focus across the tree uses pane bounding rects —
  left as a TODO in `tabs.js`.
- History capture is keystroke-based (see above); consider hooking into
  shell-specific integration (PowerShell `PSReadLine`, `bash` PROMPT_COMMAND)
  for accurate per-shell history.
- Tab titles are static (shell name); no dynamic title from OSC escapes yet.
