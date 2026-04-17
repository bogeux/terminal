// Modal shell picker shown when creating a new tab (or the first tab).
// Keyboard: ArrowUp/Down to move, Enter to pick, Escape to cancel.
// Clicking still works. Resolves with the chosen { name, command } or null.

export function pickShell(shells, mountInto, { title = "Choose a shell" } = {}) {
  return new Promise((resolve) => {
    let activeIdx = 0;

    const overlay = document.createElement("div");
    overlay.className = "shell-picker";
    overlay.tabIndex = -1; // focusable, so it receives keydown

    const heading = document.createElement("h2");
    heading.textContent = `${title}  —  Enter to pick, Esc to cancel`;
    overlay.appendChild(heading);

    if (shells.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "var(--muted)";
      empty.style.fontSize = "13px";
      empty.textContent = "Nothing to choose — press Esc.";
      overlay.appendChild(empty);
    }

    const buttons = shells.map((shell, i) => {
      const btn = document.createElement("button");
      btn.textContent = shell.name;
      btn.addEventListener("mouseenter", () => setActive(i));
      btn.addEventListener("click", () => choose(i));
      overlay.appendChild(btn);
      return btn;
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.marginTop = "12px";
    cancelBtn.addEventListener("click", () => done(null));
    overlay.appendChild(cancelBtn);

    function setActive(i) {
      if (buttons.length === 0) return;
      activeIdx = (i + buttons.length) % buttons.length;
      buttons.forEach((b, j) => b.classList.toggle("active", j === activeIdx));
      buttons[activeIdx].scrollIntoView({ block: "nearest" });
    }

    function choose(i) {
      done(shells[i]);
    }

    function done(value) {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    }

    function onKey(e) {
      if (!overlay.isConnected) return;
      e.stopPropagation();
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
      else if (e.key === "Enter") { e.preventDefault(); choose(activeIdx); }
      else if (e.key === "Escape") { e.preventDefault(); done(null); }
    }

    // Capture phase so we run before any pane / window handler.
    document.addEventListener("keydown", onKey, true);

    mountInto.appendChild(overlay);
    overlay.focus();
    if (buttons.length > 0) setActive(0);
  });
}
