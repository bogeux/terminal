// Modal picker with fuzzy-filter input.
// Keyboard: type to filter, ArrowUp/Down to move, Enter to pick, Esc to cancel.
// Mouse clicks still select. Resolves with the chosen entry or null.

export function pickShell(shells, mountInto, { title = "Choose a shell" } = {}) {
  return new Promise((resolve) => {
    let activeIdx = 0;
    let visible = []; // array of { btn, entry }

    const overlay = document.createElement("div");
    overlay.className = "shell-picker";
    overlay.tabIndex = -1;

    const heading = document.createElement("h2");
    heading.textContent = title;
    overlay.appendChild(heading);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type to filter — Enter to pick, Esc to cancel";
    input.className = "shell-picker-input";
    input.autocomplete = "off";
    overlay.appendChild(input);

    const listEl = document.createElement("div");
    listEl.className = "shell-picker-list";
    overlay.appendChild(listEl);

    const empty = document.createElement("div");
    empty.className = "shell-picker-empty";
    empty.textContent = "No match.";
    empty.style.display = "none";
    overlay.appendChild(empty);

    const all = shells.map((entry) => {
      const btn = document.createElement("button");
      btn.textContent = entry.name;
      btn.dataset.search = entry.name.toLowerCase();
      btn.addEventListener("mouseenter", () => setActiveByButton(btn));
      btn.addEventListener("click", () => choose(entry));
      listEl.appendChild(btn);
      return { btn, entry };
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "shell-picker-cancel";
    cancelBtn.addEventListener("click", () => done(null));
    overlay.appendChild(cancelBtn);

    function applyFilter() {
      const q = input.value.trim().toLowerCase();
      visible = [];
      for (const item of all) {
        const match = !q || item.btn.dataset.search.includes(q);
        item.btn.style.display = match ? "" : "none";
        if (match) visible.push(item);
      }
      empty.style.display = visible.length === 0 && all.length > 0 ? "" : "none";
      activeIdx = 0;
      updateActive();
    }

    function updateActive() {
      visible.forEach((v, i) => v.btn.classList.toggle("active", i === activeIdx));
      if (visible[activeIdx]) {
        visible[activeIdx].btn.scrollIntoView({ block: "nearest" });
      }
    }

    function setActiveByButton(btn) {
      const i = visible.findIndex((v) => v.btn === btn);
      if (i >= 0) { activeIdx = i; updateActive(); }
    }

    function choose(entry) {
      done(entry);
    }

    function done(value) {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    }

    function onKey(e) {
      if (!overlay.isConnected) return;
      if (e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation();
        if (visible.length) { activeIdx = (activeIdx + 1) % visible.length; updateActive(); }
      } else if (e.key === "ArrowUp") {
        e.preventDefault(); e.stopPropagation();
        if (visible.length) { activeIdx = (activeIdx - 1 + visible.length) % visible.length; updateActive(); }
      } else if (e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        if (visible[activeIdx]) choose(visible[activeIdx].entry);
      } else if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        done(null);
      } else {
        // Swallow other keys so global shortcuts (Ctrl+T etc.) don't fire.
        e.stopPropagation();
      }
    }

    document.addEventListener("keydown", onKey, true);
    input.addEventListener("input", applyFilter);

    mountInto.appendChild(overlay);
    input.focus();
    applyFilter();
  });
}
