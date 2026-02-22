/**
 * SecureVault — Vanilla JS File Explorer
 * Assessment requirement: load folder tree from ./data.json (root)
 * Features:
 * - Recursive tree rendering (unlimited depth)
 * - Expand/collapse folders
 * - File selection + Properties Inspector
 * - Keyboard navigation (Up/Down/Left/Right/Enter)
 * - Search filters + auto-expands ancestor folders for matches
 */

const els = {
  tree: document.getElementById("tree"),
  inspector: document.getElementById("inspector"),
  workspace: document.getElementById("workspace"),
  treeSearch: document.getElementById("treeSearch"),
  globalSearch: document.getElementById("globalSearch"),
};

const state = {
  data: null,                 // virtual root node
  expanded: new Set(),         // expanded folder ids
  selectedId: null,            // selected file id
  focusedId: null,             // focused visible node id
  query: "",                   // search query
  filteredVisibleIds: [],      // visible ids after render (for keyboard nav)
};

/** ---------------------------
 *  Boot (Fetch data.json)
 * -------------------------- */
init();

async function init() {
  wireUI();

  try {
    const nodes = await fetchDataJson("./data.json");
    const virtualRoot = buildVirtualRoot(nodes);

    // Optional: enrich file nodes with defaults for the inspector
    enrichNodesInPlace(virtualRoot);

    state.data = virtualRoot;

    // Expand virtual root by default so top-level nodes show
    state.expanded.add(virtualRoot.id);

    // Set initial focus to first visible node (virtual root)
    state.focusedId = virtualRoot.id;

    renderAll();
  } catch (err) {
    renderFatalError(err);
  }
}

async function fetchDataJson(url) {
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Failed to load ${url} (HTTP ${res.status}). Ensure data.json is in the project root.`);
  }

  const data = await res.json();

  if (!Array.isArray(data)) {
    throw new Error(`Invalid data.json shape. Expected an array of nodes, got: ${typeof data}`);
  }

  validateTreeNodes(data);
  return data;
}

function buildVirtualRoot(childrenArray) {
  return {
    id: "__root__",
    name: "Vault",
    type: "folder",
    children: childrenArray,
  };
}

/** ---------------------------
 *  Validation
 * -------------------------- */
function validateTreeNodes(nodes) {
  const ids = new Set();

  const validateNode = (node) => {
    if (!node || typeof node !== "object") {
      throw new Error("Invalid node: each item must be an object.");
    }

    if (!node.id || typeof node.id !== "string") {
      throw new Error("Invalid node: missing string 'id'.");
    }
    if (ids.has(node.id)) {
      throw new Error(`Duplicate id detected: '${node.id}'. IDs must be unique.`);
    }
    ids.add(node.id);

    if (!node.name || typeof node.name !== "string") {
      throw new Error(`Invalid node '${node.id}': missing string 'name'.`);
    }

    if (node.type !== "folder" && node.type !== "file") {
      throw new Error(`Invalid node '${node.id}': 'type' must be 'folder' or 'file'.`);
    }

    if (node.type === "folder") {
      if ("children" in node && !Array.isArray(node.children)) {
        throw new Error(`Invalid folder '${node.id}': 'children' must be an array.`);
      }
      (node.children || []).forEach(validateNode);
    } else {
      // file
      if ("children" in node) {
        throw new Error(`Invalid file '${node.id}': files must not have 'children'.`);
      }
      if ("size" in node && typeof node.size !== "string") {
        throw new Error(`Invalid file '${node.id}': 'size' must be a string like '4.2MB'.`);
      }
    }
  };

  nodes.forEach(validateNode);
}

/** ---------------------------
 *  Optional metadata enrichment
 *  (Your JSON only contains size; inspector can show sensible defaults)
 * -------------------------- */
function enrichNodesInPlace(root) {
  walk(root, (node, parents) => {
    if (node.type === "file") {
      node.owner ??= "System";
      node.encryption ??= guessEncryption(node.name);
      node.checksum ??= `sha256:${hashStub(node.id)}`;
      node.created ??= "2024-01-12";
      node.modified ??= "2024-02-24";
      node.accessed ??= "Just now";
      node.path ??= buildPath(parents, node.name);
      node.activity ??= defaultActivity();
      node.mime ??= guessMime(node.name);
      node.permissions ??= "755 (Global)";
      node.status ??= node.encryption === "None" ? "Unverified ⚠️" : "Verified";
    } else {
      node.path ??= buildPath(parents, node.name);
    }
  });
}

function buildPath(parents, name) {
  const parts = parents.map((p) => p.name).filter(Boolean);
  return `/${parts.join("/")}/${name}`.replaceAll("//", "/");
}

function guessEncryption(filename) {
  return filename.endsWith(".enc") ? "AES-256-GCM" : "None";
}

function guessMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "text/yaml";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function hashStub(str) {
  // small non-crypto stub; just for UI display
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0") + "...";
}

function defaultActivity() {
  return [
    { who: "Admin_Sara", what: "viewed metadata", when: "2 mins ago", avatar: "👩🏽‍💼" },
    { who: "System_Bot", what: "performed integrity check", when: "18 mins ago", avatar: "🤖" },
    { who: "Dev_Jake", what: "modified security flags", when: "1 hour ago", avatar: "🧑🏽‍💻" },
  ];
}

/** ---------------------------
 *  UI Wiring
 * -------------------------- */
function wireUI() {
  const onSearch = (value) => {
    state.query = value.trim();
    if (state.data) autoExpandForSearch();
    renderAll();
  };

  els.treeSearch.addEventListener("input", (e) => onSearch(e.target.value));
  els.globalSearch.addEventListener("input", (e) => {
    els.treeSearch.value = e.target.value;
    onSearch(e.target.value);
  });

  els.tree.addEventListener("keydown", onTreeKeyDown);

  // Click delegation
  els.tree.addEventListener("click", (e) => {
    const itemEl = e.target.closest("[data-node-id]");
    if (!itemEl) return;

    const nodeId = itemEl.dataset.nodeId;
    const node = findNodeById(state.data, nodeId);
    if (!node) return;

    const clickedTwisty = e.target.closest("[data-action='toggle']");

    if (node.type === "folder" && clickedTwisty) {
      toggleExpand(node.id);
      return;
    }

    if (node.type === "folder") {
      toggleExpand(node.id);
      setFocus(node.id);
      return;
    }

    if (node.type === "file") {
      selectFile(node.id);
      setFocus(node.id);
    }
  });
}

/** ---------------------------
 *  Actions
 * -------------------------- */
function toggleExpand(folderId) {
  if (state.expanded.has(folderId)) state.expanded.delete(folderId);
  else state.expanded.add(folderId);
  renderAll({ preserveScroll: true });
}

function selectFile(fileId) {
  state.selectedId = fileId;
  renderAll();
}

function setFocus(nodeId) {
  state.focusedId = nodeId;
  renderAll({ preserveScroll: true });
}

/** ---------------------------
 *  Keyboard nav
 * -------------------------- */
function onTreeKeyDown(e) {
  const visible = state.filteredVisibleIds;
  if (!visible.length) return;

  const idx = Math.max(0, visible.indexOf(state.focusedId));
  const currentId = visible[idx];
  const currentNode = findNodeById(state.data, currentId);

  switch (e.key) {
    case "ArrowDown": {
      e.preventDefault();
      const next = visible[Math.min(visible.length - 1, idx + 1)];
      setFocus(next);
      scrollFocusedIntoView();
      break;
    }
    case "ArrowUp": {
      e.preventDefault();
      const prev = visible[Math.max(0, idx - 1)];
      setFocus(prev);
      scrollFocusedIntoView();
      break;
    }
    case "ArrowRight": {
      e.preventDefault();
      if (currentNode?.type === "folder" && !state.expanded.has(currentNode.id)) {
        state.expanded.add(currentNode.id);
        renderAll({ preserveScroll: true });
      }
      break;
    }
    case "ArrowLeft": {
      e.preventDefault();
      if (currentNode?.type === "folder" && state.expanded.has(currentNode.id)) {
        state.expanded.delete(currentNode.id);
        renderAll({ preserveScroll: true });
      } else {
        const parent = findParentOf(state.data, currentId);
        if (parent) setFocus(parent.id);
        scrollFocusedIntoView();
      }
      break;
    }
    case "Enter": {
      e.preventDefault();
      if (currentNode?.type === "file") selectFile(currentNode.id);
      else if (currentNode?.type === "folder") toggleExpand(currentNode.id);
      break;
    }
    default:
      break;
  }
}

function scrollFocusedIntoView() {
  const el = els.tree.querySelector(`[data-node-id="${cssEscape(state.focusedId)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "nearest" });
}

function cssEscape(value) {
  return String(value).replace(/"/g, '\\"');
}

/** ---------------------------
 *  Search: auto-expand folders containing matches
 * -------------------------- */
function autoExpandForSearch() {
  if (!state.query) return;

  const q = state.query.toLowerCase();

  walk(state.data, (node, parents) => {
    if (node.name.toLowerCase().includes(q)) {
      for (const p of parents) {
        if (p.type === "folder") state.expanded.add(p.id);
      }
    }
  });
}

/** ---------------------------
 *  Rendering
 * -------------------------- */
function renderAll(options = {}) {
  if (!state.data) return;

  const prevScroll = els.tree.scrollTop;

  renderTree();
  renderWorkspace();
  renderInspector();

  if (options.preserveScroll) els.tree.scrollTop = prevScroll;
}

function renderTree() {
  const q = state.query.toLowerCase();
  const visibleIds = [];

  const html = Tree({
    node: state.data,
    level: 0,
    expanded: state.expanded,
    query: q,
    selectedId: state.selectedId,
    focusedId: state.focusedId,
    onVisible: (id) => visibleIds.push(id),
  });

  els.tree.innerHTML = html;
  state.filteredVisibleIds = visibleIds;

  // If focus falls out of visible set after filtering, focus first visible
  if (visibleIds.length && !visibleIds.includes(state.focusedId)) {
    state.focusedId = visibleIds[0];
    renderTree();
  }
}

function renderWorkspace() {
  const selected = state.selectedId ? findNodeById(state.data, state.selectedId) : null;
  els.workspace.innerHTML = selected ? FileWorkspace(selected) : EmptyWorkspace();
}

function renderInspector() {
  const selected = state.selectedId ? findNodeById(state.data, state.selectedId) : null;
  els.inspector.innerHTML = Inspector(selected);
}

/** ---------------------------
 *  “Components”
 * -------------------------- */
function Tree({ node, level, expanded, query, selectedId, focusedId, onVisible }) {
  const visible = filterNodeForQuery(node, query);
  if (!visible) return "";

  onVisible(node.id);

  const isFolder = node.type === "folder";
  const isExpanded = isFolder && expanded.has(node.id);
  const hasChildren = isFolder && Array.isArray(node.children) && node.children.length > 0;

  const twisty = isFolder
    ? `<span class="treeItem__twisty" data-action="toggle" aria-hidden="true">${hasChildren ? (isExpanded ? "▼" : "▶") : "•"}</span>`
    : `<span class="treeItem__twisty" aria-hidden="true"></span>`;

  const icon = isFolder ? "📁" : "📄";

  const isSelected = node.id === selectedId;
  const isFocused = node.id === focusedId;

  const item = `
    <div
      class="treeItem"
      role="treeitem"
      aria-expanded="${isFolder ? String(isExpanded) : "false"}"
      aria-selected="${String(isSelected)}"
      data-node-id="${escapeHtml(node.id)}"
      data-selected="${String(isSelected)}"
      data-focused="${String(isFocused)}"
      style="margin-left:${level * 6}px"
    >
      ${twisty}
      <span class="treeItem__icon" aria-hidden="true">${icon}</span>
      <span class="treeItem__label">${highlight(node.name, query)}</span>
    </div>
  `;

  if (!isFolder || !isExpanded) return item;

  const childrenHtml = (node.children || [])
    .map((child) =>
      Tree({
        node: child,
        level: level + 1,
        expanded,
        query,
        selectedId,
        focusedId,
        onVisible,
      })
    )
    .join("");

  return `${item}<div class="treeChildren" role="group">${childrenHtml}</div>`;
}

function EmptyWorkspace() {
  return `
    <div class="card" style="height:100%; display:grid; place-items:center;">
      <div style="text-align:center; max-width:520px; padding:22px;">
        <div style="font-size:44px; opacity:.9;">🛡️</div>
        <h2 style="margin:10px 0 6px 0;">Secure Sandbox Mode</h2>
        <p class="muted" style="margin:0;">
          Select a restricted file from the explorer tree to initiate deep inspection and integrity verification.
        </p>
      </div>
    </div>
  `;
}

function FileWorkspace(node) {
  if (node.type !== "file") {
    return `
      <div class="card" style="height:100%; display:grid; place-items:center;">
        <div style="text-align:center; max-width:520px; padding:22px;">
          <div style="font-size:44px; opacity:.9;">📁</div>
          <h2 style="margin:10px 0 6px 0;">Folder Selected</h2>
          <p class="muted" style="margin:0;">Select a file to view detailed inspection and actions.</p>
        </div>
      </div>
    `;
  }

  const badges = [
    Badge(node.encryption !== "None" ? "Encrypted" : "Not Encrypted", node.encryption !== "None" ? "accent" : ""),
    Badge(node.status || "Verified", node.encryption !== "None" ? "good" : "warn"),
  ].join("");

  return `
    <div class="hero">
      <div class="fileHeader">
        <div class="fileIcon" aria-hidden="true">🗄️</div>
        <div class="fileTitle">
          <h1>${escapeHtml(node.name)}</h1>
          <div class="badges">${badges}</div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn--primary" type="button" aria-label="Download file">
          ⬇️ <span>Download File</span>
        </button>
        <button class="btn btn--ghost" type="button" aria-label="More actions">⋯</button>
      </div>
    </div>

    <div class="card kv">
      <div class="kv__k">FILE SIZE</div><div class="kv__v">${escapeHtml(node.size || "—")}</div>
      <div class="kv__k">MIME TYPE</div><div class="kv__v">${escapeHtml(node.mime || "application/octet-stream")}</div>
      <div class="kv__k">SECURITY OWNER</div><div class="kv__v">${escapeHtml(node.owner || "System")}</div>
      <div class="kv__k">LOCATION PATH</div><div class="kv__v">${escapeHtml(node.path || "—")}</div>
    </div>

    <div class="lockPreview">
      <div class="lockPreview__inner">
        <div class="lockPreview__icon" aria-hidden="true">🔒</div>
        <div class="lockPreview__title">Content Access Restricted</div>
        <div class="lockPreview__desc">
          This asset is protected. Preview may be disabled depending on encryption and compliance policy.
        </div>
        <div class="lockPreview__buttons">
          <button class="btn" type="button">Verify Checksum</button>
          <button class="btn btn--primary" type="button">Request Approval</button>
        </div>
      </div>
    </div>
  `;
}

function Inspector(selected) {
  if (!selected) {
    return `
      ${Section("GENERAL INFO", KV([
        ["Name", "No selection"],
        ["Type", "—"],
        ["Size", "—"],
        ["Owner", "—"],
      ]))}
      ${Section("SECURITY METADATA", KV([
        ["Encryption", "—"],
        ["Status", "—"],
        ["Checksum", "—"],
        ["Permissions", "—"],
      ]))}
      ${Section("TIMESTAMPS", KV([
        ["Created", "—"],
        ["Modified", "—"],
        ["Accessed", "—"],
      ]))}
      ${Section("RECENT ACTIVITY", `<div class="muted">No activity yet.</div>`)}
    `;
  }

  const isFile = selected.type === "file";

  return `
    ${Section("GENERAL INFO", KV([
      ["Name", selected.name],
      ["Type", isFile ? "FILE" : "FOLDER"],
      ["Size", isFile ? (selected.size || "—") : "N/A"],
      ["Owner", isFile ? (selected.owner || "System") : "System"],
      ["Path", selected.path || "—"],
    ]))}
    ${Section("SECURITY METADATA", KV([
      ["Encryption", isFile ? (selected.encryption || "None") : "None"],
      ["Status", isFile ? (selected.status || "—") : "Available"],
      ["Checksum", isFile ? (selected.checksum || "—") : "Not Calculated"],
      ["Permissions", isFile ? (selected.permissions || "—") : "—"],
    ]))}
    ${Section("TIMESTAMPS", KV([
      ["Created", isFile ? (selected.created || "—") : "—"],
      ["Modified", isFile ? (selected.modified || "—") : "—"],
      ["Accessed", isFile ? (selected.accessed || "—") : "—"],
    ]))}
    ${Section("RECENT ACTIVITY", isFile ? ActivityList(selected.activity || []) : `<div class="muted">Select a file to view activity.</div>`)}
  `;
}

function Section(title, bodyHtml) {
  return `<div class="section"><h3>${escapeHtml(title)}</h3>${bodyHtml}</div>`;
}

function KV(rows) {
  return `<div class="kv">${
    rows.map(([k, v]) =>
      `<div class="kv__k">${escapeHtml(k)}</div><div class="kv__v">${escapeHtml(String(v))}</div>`
    ).join("")
  }</div>`;
}

function Badge(text, variant) {
  const cls =
    variant === "accent" ? "badge badge--accent"
    : variant === "good" ? "badge badge--good"
    : variant === "warn" ? "badge badge--warn"
    : "badge";

  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function ActivityList(items) {
  if (!items.length) return `<div class="muted">No activity yet.</div>`;

  return `
    <div class="activity">
      ${items.map((it) => `
        <div class="activityItem">
          <div class="activityAvatar" aria-hidden="true">${escapeHtml(it.avatar || "👤")}</div>
          <div class="activityMeta">
            <div class="who">${escapeHtml(it.who)}</div>
            <div class="what">${escapeHtml(it.what)}</div>
            <div class="when">${escapeHtml(it.when)}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

/** ---------------------------
 *  Helpers
 * -------------------------- */
function findNodeById(root, id) {
  let found = null;
  walk(root, (node) => { if (node.id === id) found = node; });
  return found;
}

function findParentOf(root, childId) {
  let parent = null;
  walk(root, (node) => {
    if (node.type === "folder" && node.children?.some((c) => c.id === childId)) parent = node;
  });
  return parent;
}

function walk(root, cb, parents = []) {
  cb(root, parents);
  if (root.type === "folder" && Array.isArray(root.children)) {
    for (const child of root.children) walk(child, cb, [...parents, root]);
  }
}

/**
 * Filtering rules:
 * - no query => show everything
 * - folder => show if it matches OR any child matches
 * - file => show only if it matches
 */
function filterNodeForQuery(node, query) {
  if (!query) return true;

  const selfMatch = node.name.toLowerCase().includes(query);
  if (node.type === "file") return selfMatch;

  const childMatch = (node.children || []).some((c) => filterNodeForQuery(c, query));
  return selfMatch || childMatch;
}

function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;

  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return safe;

  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length));

  return `${before}<span style="color: rgba(147,197,253,.95); font-weight:700;">${match}</span>${after}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderFatalError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  els.workspace.innerHTML = `
    <div class="card" style="padding:18px;">
      <h2 style="margin:0 0 8px 0;">Failed to load data.json</h2>
      <p class="muted" style="margin:0 0 10px 0;">${escapeHtml(msg)}</p>
      <p class="muted" style="margin:0;">Tip: If you're using VS Code Live Server, keep <code>data.json</code> in the same folder as <code>index.html</code>.</p>
    </div>
  `;
  els.inspector.innerHTML = "";
  els.tree.innerHTML = "";
}