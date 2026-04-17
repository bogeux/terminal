// Binary tree layout: each node is either a leaf (a pane) or a split
// (two children with an orientation and a ratio). Rendering walks the tree
// and produces flex containers with draggable dividers.

let nodeCounter = 0;

export function leaf(pane) {
  return { kind: "leaf", id: `n${++nodeCounter}`, pane };
}

export function split(orientation, a, b, ratio = 0.5) {
  return { kind: "split", id: `n${++nodeCounter}`, orientation, a, b, ratio };
}

export function findLeaf(node, predicate, parent = null) {
  if (node.kind === "leaf") return predicate(node) ? { node, parent } : null;
  return findLeaf(node.a, predicate, node) || findLeaf(node.b, predicate, node);
}

export function findLeafByPaneId(root, paneId) {
  return findLeaf(root, (n) => n.pane.id === paneId);
}

// Path of nodes from root down to the leaf owning `paneId` (inclusive).
// Returns null if not found.
export function findPath(root, paneId, acc = []) {
  const current = [...acc, root];
  if (root.kind === "leaf") {
    return root.pane.id === paneId ? current : null;
  }
  return findPath(root.a, paneId, current) || findPath(root.b, paneId, current);
}

export function replaceChild(parent, oldChild, newChild) {
  if (parent.a === oldChild) parent.a = newChild;
  else if (parent.b === oldChild) parent.b = newChild;
}

// Remove the leaf whose pane id matches; collapse parent split accordingly.
// Returns the new root (may be the same, may be a sibling promoted).
export function removeLeaf(root, paneId) {
  if (root.kind === "leaf") return root.pane.id === paneId ? null : root;
  const hit = findLeafByPaneId(root, paneId);
  if (!hit) return root;
  const { parent } = hit;
  if (!parent) return null; // root was the leaf

  const sibling = parent.a === hit.node ? parent.b : parent.a;

  // Find grandparent
  const grand = findContainer(root, parent);
  if (!grand) return sibling; // parent was root
  replaceChild(grand, parent, sibling);
  return root;
}

function findContainer(node, target, parent = null) {
  if (node === target) return parent;
  if (node.kind === "split") {
    return findContainer(node.a, target, node) || findContainer(node.b, target, node);
  }
  return null;
}

// Render the tree into `container`, attaching pane elements + dividers.
export function render(node, container) {
  container.innerHTML = "";
  container.appendChild(renderNode(node));
}

function renderNode(node) {
  if (node.kind === "leaf") {
    // Reset inline flex in case this leaf was previously inside a split.
    // Without this, a leftover `flex: 0.5 1 0` from a collapsed split
    // makes the pane take only 50% of its container.
    node.pane.el.style.flex = "";
    return node.pane.el;
  }
  const wrap = document.createElement("div");
  wrap.className = `node split-${node.orientation}`;

  const a = renderNode(node.a);
  const b = renderNode(node.b);
  const divider = document.createElement("div");
  divider.className = "divider";

  // Apply ratio via flex-grow
  a.style.flex = `${node.ratio} 1 0`;
  b.style.flex = `${1 - node.ratio} 1 0`;

  wrap.appendChild(a);
  wrap.appendChild(divider);
  wrap.appendChild(b);

  attachDrag(divider, wrap, node, a, b);
  return wrap;
}

function attachDrag(divider, wrap, node, aEl, bEl) {
  divider.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const horiz = node.orientation === "h";

    const onMove = (ev) => {
      const pos = horiz ? (ev.clientX - rect.left) / rect.width
                        : (ev.clientY - rect.top) / rect.height;
      const ratio = Math.max(0.1, Math.min(0.9, pos));
      node.ratio = ratio;
      aEl.style.flex = `${ratio} 1 0`;
      bEl.style.flex = `${1 - ratio} 1 0`;
      window.dispatchEvent(new CustomEvent("pane-resize"));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}
