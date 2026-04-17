import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

const THEME = {
  background: "#0e0e12",
  foreground: "#d4d4dc",
  cursor: "#7aa2f7",
  selectionBackground: "#3b3f4c",
  black: "#15161e", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
  blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
  brightBlack: "#414868", brightRed: "#f7768e", brightGreen: "#9ece6a",
  brightYellow: "#e0af68", brightBlue: "#7aa2f7", brightMagenta: "#bb9af7",
  brightCyan: "#7dcfff", brightWhite: "#c0caf5",
};

export class Pane {
  constructor({ id, shell, invoke, listen, onFocus, onExit }) {
    this.id = id;
    this.shell = shell; // full { name, command } entry
    this.invoke = invoke;
    this.listen = listen;
    this.onFocus = onFocus;
    this.onExit = onExit;

    this.el = document.createElement("div");
    this.el.className = "pane";
    this.el.dataset.paneId = id;

    this.termEl = document.createElement("div");
    this.termEl.className = "pane-term";
    this.el.appendChild(this.termEl);

    this.term = new Terminal({
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: THEME,
      scrollback: 10000,
      allowProposedApi: true,
    });
    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.loadAddon(new WebLinksAddon());

    this.term.open(this.termEl);

    // Return false so xterm.js ignores these keys; the window-level handler
    // in main.js then sees them. Without this, xterm swallows the keystroke
    // and sends it to the shell.
    this.term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;

      // Ctrl+C: copy if selection; otherwise let ^C reach the shell.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyC") {
        if (this.term.hasSelection()) {
          const sel = this.term.getSelection();
          navigator.clipboard.writeText(sel).catch(() => {});
          this.term.clearSelection();
          return false;
        }
        return true;
      }
      // Ctrl+V: paste clipboard text into the PTY.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyV") {
        navigator.clipboard.readText().then((text) => {
          if (text) this.invoke("pty_write", { id: this.id, data: text });
        }).catch(() => {});
        return false;
      }

      if (e.ctrlKey && e.shiftKey &&
          ["KeyK", "KeyT", "KeyW", "KeyE", "KeyO"].includes(e.code)) return false;
      if (e.ctrlKey && e.shiftKey && e.code.startsWith("Arrow")) return false;
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyD") return false;
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyT") return false;
      if (e.ctrlKey && e.shiftKey && e.code === "KeyT") return false;
      if (e.ctrlKey && e.code === "Tab") return false;
      if (e.altKey && e.code.startsWith("Arrow")) return false;
      return true;
    });

    this.term.onData((data) => {
      this.invoke("pty_write", { id: this.id, data });
      this.captureForHistory(data);
    });
    this.term.onResize(({ cols, rows }) => {
      this.invoke("pty_resize", { id: this.id, cols, rows });
    });

    this.el.addEventListener("mousedown", () => this.onFocus?.(this));

    this.currentLine = "";
  }

  async start() {
    await this.invoke("pty_spawn", { id: this.id, shell: this.shell.command });
    this.unlisten = await this.listen(`pty://${this.id}`, (evt) => {
      this.term.write(evt.payload);
    });
    this.unlistenExit = await this.listen(`pty-exit://${this.id}`, () => {
      this.term.writeln("\r\n[process exited]");
      this.onExit?.(this);
    });
    this.fit.fit();
  }

  captureForHistory(data) {
    // Simple line-capture for history: accumulate input, flush on Enter.
    // Intentionally naive — does not handle readline editing, arrow history,
    // or bracketed paste. Good enough for a first pass.
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        const cmd = this.currentLine.trim();
        if (cmd) this.invoke("history_append", { entry: cmd }).catch(() => {});
        this.currentLine = "";
      } else if (ch === "\x7f" || ch === "\b") {
        this.currentLine = this.currentLine.slice(0, -1);
      } else if (ch >= " ") {
        this.currentLine += ch;
      }
    }
  }

  focus() {
    this.term.focus();
    document.querySelectorAll(".pane.focused").forEach(p => p.classList.remove("focused"));
    this.el.classList.add("focused");
  }

  refit() {
    try { this.fit.fit(); } catch {}
  }

  async dispose() {
    try { this.unlisten?.(); } catch {}
    try { this.unlistenExit?.(); } catch {}
    try { await this.invoke("pty_kill", { id: this.id }); } catch {}
    try { this.term.dispose(); } catch {}
    this.el.remove();
  }
}
