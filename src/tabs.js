import { Pane } from "./terminal.js";
import { leaf, split, render, findLeafByPaneId, findPath, removeLeaf } from "./layout.js";
import { pickShell } from "./shell-picker.js";

let paneCounter = 0;
const newPaneId = () => `p${Date.now()}-${++paneCounter}`;

export class TabManager {
  constructor({ tabsEl, workspace, invoke, listen }) {
    this.tabsEl = tabsEl;
    this.workspace = workspace;
    this.invoke = invoke;
    this.listen = listen;
    this.tabs = []; // { id, title, root, container, focusedPaneId }
    this.activeTabIdx = -1;
    this.shells = [];
    window.addEventListener("pane-resize", () => this.refitActive());
  }

  async init() {
    this.shells = await this.invoke("list_shells");
    this.renderTabs();
    await this.newTab();
  }

  async newTab({ forcePick = false, shell } = {}) {
    if (!shell) {
      const focused = this.#focusedPane();
      if (!forcePick && focused) {
        shell = focused.shell;
      } else {
        shell = await pickShell(this.shells, this.workspace);
        if (!shell) return;
      }
    }
    const pane = await this.#createPane(shell);
    const tab = {
      id: `t${Date.now()}`,
      title: shell.name,
      root: leaf(pane),
      container: document.createElement("div"),
      focusedPaneId: pane.id,
    };
    tab.container.className = "tab-root";
    this.workspace.appendChild(tab.container);
    this.tabs.push(tab);
    this.activeTabIdx = this.tabs.length - 1;
    render(tab.root, tab.container);
    this.renderTabs();
    this.showActive();
    pane.focus();
    pane.refit();
  }

  async #createPane(shell) {
    const id = newPaneId();
    const pane = new Pane({
      id,
      shell,
      invoke: this.invoke,
      listen: this.listen,
      onFocus: (p) => this.#setFocused(p),
      onExit: (p) => this.#onPaneExit(p),
    });
    await pane.start();
    return pane;
  }

  #setFocused(pane) {
    const tab = this.tabs[this.activeTabIdx];
    if (!tab) return;
    tab.focusedPaneId = pane.id;
    pane.focus();
  }

  #activeTab() {
    return this.tabs[this.activeTabIdx] ?? null;
  }

  #focusedPane() {
    const tab = this.#activeTab();
    if (!tab) return null;
    const hit = findLeafByPaneId(tab.root, tab.focusedPaneId);
    return hit?.node.pane ?? null;
  }

  async splitActive(orientation) {
    const tab = this.#activeTab();
    const focused = this.#focusedPane();
    if (!tab || !focused) return;

    // Reuse the focused pane's shell — splits inherit, new tabs pick.
    const newPane = await this.#createPane(focused.shell);

    // Replace the focused leaf with a split( leaf(focused), leaf(new) )
    const hit = findLeafByPaneId(tab.root, focused.id);
    const newSplit = split(orientation, hit.node, leaf(newPane));
    if (!hit.parent) {
      tab.root = newSplit;
    } else {
      if (hit.parent.a === hit.node) hit.parent.a = newSplit;
      else hit.parent.b = newSplit;
    }
    render(tab.root, tab.container);
    tab.focusedPaneId = newPane.id;
    newPane.focus();
    this.refitActive();
  }

  // Send text to the focused pane's PTY (as if the user typed it).
  // Useful for palette commands that inject a one-shot shell command.
  async writeToFocused(data) {
    const focused = this.#focusedPane();
    if (!focused) return;
    await this.invoke("pty_write", { id: focused.id, data });
  }

  // Swap the focused pane's shell in place: spawn a new pane, replace the
  // tree leaf, dispose the old one. Layout and siblings are untouched.
  async replaceFocusedShell(shell) {
    const tab = this.#activeTab();
    const focused = this.#focusedPane();
    if (!tab || !focused) return;
    const hit = findLeafByPaneId(tab.root, focused.id);
    if (!hit) return;

    const newPane = await this.#createPane(shell);
    hit.node.pane = newPane;
    render(tab.root, tab.container);
    tab.focusedPaneId = newPane.id;
    focused.dispose();
    newPane.focus();
    newPane.refit();
  }

  closeActivePane() {
    const tab = this.#activeTab();
    const focused = this.#focusedPane();
    if (!tab || !focused) return;
    this.#removePane(tab, focused);
  }

  #onPaneExit(pane) {
    // Find which tab owns this pane.
    for (const tab of this.tabs) {
      const hit = findLeafByPaneId(tab.root, pane.id);
      if (hit) { this.#removePane(tab, pane); return; }
    }
  }

  #removePane(tab, pane) {
    pane.dispose();
    const next = removeLeaf(tab.root, pane.id);
    if (!next) {
      // Tab is empty — close it.
      tab.container.remove();
      const idx = this.tabs.indexOf(tab);
      this.tabs.splice(idx, 1);
      if (this.activeTabIdx >= this.tabs.length) this.activeTabIdx = this.tabs.length - 1;
      this.renderTabs();
      this.showActive();
      return;
    }
    tab.root = next;
    render(tab.root, tab.container);
    // Pick any remaining leaf as focused.
    const anyLeaf = firstLeaf(tab.root);
    if (anyLeaf) { tab.focusedPaneId = anyLeaf.pane.id; anyLeaf.pane.focus(); }
    this.refitActive();
  }

  cycleTab(dir) {
    if (this.tabs.length === 0) return;
    this.activeTabIdx = (this.activeTabIdx + dir + this.tabs.length) % this.tabs.length;
    this.renderTabs();
    this.showActive();
  }

  activateTab(idx) {
    this.activeTabIdx = idx;
    this.renderTabs();
    this.showActive();
  }

  showActive() {
    this.tabs.forEach((t, i) => {
      t.container.classList.toggle("hidden", i !== this.activeTabIdx);
    });
    const active = this.#activeTab();
    if (active) {
      const pane = this.#focusedPane();
      pane?.focus();
    }
    this.refitActive();
  }

  refitActive() {
    const tab = this.#activeTab();
    if (!tab) return;
    walkLeaves(tab.root, (l) => l.pane.refit());
  }

  // Ctrl+Shift+Arrow — moves the nearest split-divider toward the given
  // direction. "right"/"down" increase the ratio (a-side grows), "left"/"up"
  // decrease it. The nearest split is the closest ancestor of the focused
  // leaf whose orientation matches (horizontal for left/right, vertical for
  // up/down). No matching ancestor = no-op.
  resizeFocused(direction) {
    const tab = this.#activeTab();
    const focused = this.#focusedPane();
    if (!tab || !focused) return;
    const wantOrientation = (direction === "left" || direction === "right") ? "h" : "v";
    const path = findPath(tab.root, focused.id);
    if (!path) return;
    let target = null;
    for (let i = path.length - 2; i >= 0; i--) {
      const node = path[i];
      if (node.kind === "split" && node.orientation === wantOrientation) {
        target = node;
        break;
      }
    }
    if (!target) return;
    const sign = (direction === "right" || direction === "down") ? +1 : -1;
    const delta = 0.03;
    target.ratio = Math.max(0.05, Math.min(0.95, target.ratio + sign * delta));
    render(tab.root, tab.container);
    this.refitActive();
  }

  focusDirection(_dir) {
    // TODO: directional focus (up/down/left/right across the tree using
    // bounding rects). Left as stub — cycleFocus below covers the basics.
    this.#cycleFocus();
  }

  #cycleFocus() {
    const tab = this.#activeTab();
    if (!tab) return;
    const leaves = [];
    walkLeaves(tab.root, (l) => leaves.push(l));
    if (leaves.length === 0) return;
    const curIdx = leaves.findIndex((l) => l.pane.id === tab.focusedPaneId);
    const next = leaves[(curIdx + 1) % leaves.length];
    tab.focusedPaneId = next.pane.id;
    next.pane.focus();
  }

  renderTabs() {
    this.tabsEl.innerHTML = "";
    this.tabs.forEach((tab, i) => {
      const el = document.createElement("div");
      el.className = "tab" + (i === this.activeTabIdx ? " active" : "");
      el.textContent = tab.title;
      el.addEventListener("click", () => this.activateTab(i));
      const close = document.createElement("span");
      close.className = "close";
      close.textContent = "×";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        // Close every pane in the tab.
        const tabRef = this.tabs[i];
        walkLeaves(tabRef.root, (l) => l.pane.dispose());
        tabRef.container.remove();
        this.tabs.splice(i, 1);
        if (this.activeTabIdx >= this.tabs.length) this.activeTabIdx = this.tabs.length - 1;
        this.renderTabs();
        this.showActive();
      });
      el.appendChild(close);
      this.tabsEl.appendChild(el);
    });
    const add = document.createElement("div");
    add.className = "tab-add";
    add.textContent = "+";
    add.addEventListener("click", () => this.newTab());
    this.tabsEl.appendChild(add);
  }
}

function firstLeaf(node) {
  if (node.kind === "leaf") return node;
  return firstLeaf(node.a) || firstLeaf(node.b);
}

function walkLeaves(node, fn) {
  if (node.kind === "leaf") return fn(node);
  walkLeaves(node.a, fn);
  walkLeaves(node.b, fn);
}
