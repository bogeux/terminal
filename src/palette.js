// Command palette — scaffolded per spec ("prepare it don't implement").
// The mechanism is wired: open with Ctrl+Shift+K, fuzzy-filter, Enter runs.
// Commands themselves live in commands.js; fill that file with your own.

export class Palette {
  constructor({ root }) {
    this.root = root;
    this.input = root.querySelector("#palette-input");
    this.list = root.querySelector("#palette-list");
    this.commands = []; // { id, title, keybinding?, group?, run() }
    this.filtered = [];
    this.activeIdx = 0;

    this.input.addEventListener("input", () => this.#filter());
    this.input.addEventListener("keydown", (e) => this.#onKey(e));
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.root.classList.contains("hidden")) {
        this.close();
      }
    });
  }

  register(cmd) {
    if (!cmd.id || !cmd.title || typeof cmd.run !== "function") {
      throw new Error("Command requires { id, title, run }");
    }
    this.commands.push(cmd);
  }

  open() {
    this.input.value = "";
    this.#filter();
    this.root.classList.remove("hidden");
    this.input.focus();
  }

  close() {
    this.root.classList.add("hidden");
  }

  #filter() {
    const q = this.input.value.trim().toLowerCase();
    this.filtered = q
      ? this.commands.filter((c) => c.title.toLowerCase().includes(q))
      : [...this.commands];
    this.activeIdx = 0;
    this.#render();
  }

  #render() {
    this.list.innerHTML = "";
    this.filtered.forEach((cmd, i) => {
      const li = document.createElement("li");
      if (i === this.activeIdx) li.classList.add("active");
      const title = document.createElement("span");
      title.textContent = cmd.title;
      li.appendChild(title);
      if (cmd.keybinding) {
        const kbd = document.createElement("span");
        kbd.className = "kbd";
        kbd.textContent = cmd.keybinding;
        li.appendChild(kbd);
      }
      li.addEventListener("click", () => this.#run(cmd));
      this.list.appendChild(li);
    });
  }

  #onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); this.activeIdx = Math.min(this.filtered.length - 1, this.activeIdx + 1); this.#render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); this.activeIdx = Math.max(0, this.activeIdx - 1); this.#render(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = this.filtered[this.activeIdx];
      if (cmd) this.#run(cmd);
    }
  }

  #run(cmd) {
    this.close();
    try { cmd.run(); } catch (err) { console.error(err); }
  }
}
