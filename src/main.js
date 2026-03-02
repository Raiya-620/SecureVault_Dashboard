/**
 * SecureVault — File Explorer (Vanilla JS)
 * ------------------------------------------------------------
 * Assessment requirements covered:
 *  - Fetch folder tree from ./data.json (root)
 *  - Recursive folder rendering (unlimited depth)
 *  - Expand/Collapse folders
 *  - Search filters tree + auto-expands parents
 *  - Keyboard navigation (Up/Down/Left/Right/Enter)
 *  - Click file => Preview (ONLY if previewable)
 *  - Action menu => View Details (populates inspector + details workspace)
 *  - Non-previewable files => "Preview not available" shield
 *  - Delete action with confirmation modal
 *
 
 */

// -----------------------------
// DOM References
// -----------------------------
const els = {
  tree: document.getElementById("tree"),
  inspector: document.getElementById("inspector"),
  workspace: document.getElementById("workspace"),
  treeSearch: document.getElementById("treeSearch"),
  globalSearch: document.getElementById("globalSearch"),
};

// -----------------------------
// App State
// -----------------------------
const state = {
  data: null, // Virtual root node
  expanded: new Set(), // Expanded folder ids

  // Selection + modes
  mode: "empty", // 'empty' | 'preview' | 'details'
  previewId: null, // currently previewed file id
  selectedId: null, // file selected for details
  focusedId: null, // keyboard focus id

  // UI helpers
  query: "",
  visibleIds: [], // visible node ids after rendering
  openMenuForId: null, // file id whose action menu is open
  deleteTargetId: null, // file id pending deletion
};

// -----------------------------
// Boot
// -----------------------------
init();

async function init() {
  wireUI();

  try {
    const nodes = await fetchDataJson("./data.json");
    const root = buildVirtualRoot(nodes);

    // Optional: add extra fields for the inspector UI
    enrichNodesInPlace(root);

    state.data = root;
    state.expanded.add(root.id); // expand the root so top-level shows
    state.focusedId = root.id;

    renderAll();
  } catch (err) {
    renderFatalError(err);
  }
}

// -----------------------------
// Fetch + Validate
// -----------------------------
async function fetchDataJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Failed to load ${url} (HTTP ${res.status}). Make sure data.json is in the project root and you are using a local server.`,
    );
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Invalid data.json: expected an array of nodes.");
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

function validateTreeNodes(nodes) {
  const ids = new Set();

  function validateNode(node) {
    if (!node || typeof node !== "object") {
      throw new Error("Invalid node: every item must be an object.");
    }

    if (!node.id || typeof node.id !== "string") {
      throw new Error("Invalid node: missing string 'id'.");
    }
    if (ids.has(node.id)) {
      throw new Error(`Duplicate id found: ${node.id}`);
    }
    ids.add(node.id);

    if (!node.name || typeof node.name !== "string") {
      throw new Error(`Invalid node '${node.id}': missing string 'name'.`);
    }

    if (node.type !== "folder" && node.type !== "file") {
      throw new Error(
        `Invalid node '${node.id}': type must be 'folder' or 'file'.`,
      );
    }

    if (node.type === "folder") {
      if ("children" in node && !Array.isArray(node.children)) {
        throw new Error(
          `Invalid folder '${node.id}': children must be an array.`,
        );
      }
      (node.children || []).forEach(validateNode);
    } else {
      // file
      if ("children" in node) {
        throw new Error(
          `Invalid file '${node.id}': files must not have 'children'.`,
        );
      }
      if ("size" in node && typeof node.size !== "string") {
        throw new Error(
          `Invalid file '${node.id}': size must be a string, e.g. '4.2MB'.`,
        );
      }
    }
  }

  nodes.forEach(validateNode);
}

function enrichNodesInPlace(root) {
  walk(root, (node, parents) => {
    node.path ??= buildPath(parents, node.name);

    if (node.type === "file") {
      node.owner ??= "System";
      node.encryption ??= guessEncryption(node.name);
      node.checksum ??= `sha256:${hashStub(node.id)}`;
      node.permissions ??= "755 (Global)";
      node.mime ??= guessMime(node.name);
      node.created ??= "2024-01-12 08:00";
      node.modified ??= "N/A";
      node.accessed ??= "Just now";
      node.status ??= node.encryption === "None" ? "Unverified ⚠" : "Verified";
      node.activity ??= defaultActivity();
    }
  });
}

function buildPath(parents, name) {
  const parts = parents
    .filter((p) => p && p.name && p.type === "folder")
    .map((p) => p.name);
  return `/${parts.join("/")}/${name}`.replaceAll("//", "/");
}

function guessEncryption(filename) {
  return filename.toLowerCase().endsWith(".enc") ? "AES-256-GCM" : "None";
}

function guessMime(filename) {
  const ext = getExt(filename);
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "json") return "application/json";
  if (ext === "yaml" || ext === "yml") return "text/yaml";
  if (ext === "txt" || ext === "log" || ext === "md") return "text/plain";
  return "application/octet-stream";
}

function defaultActivity() {
  return [
    {
      who: "Admin_Sara",
      what: "viewed metadata",
      when: "2 mins ago",
      avatar: "👩🏽‍💼",
    },
    {
      who: "System_Bot",
      what: "performed integrity check",
      when: "15 mins ago",
      avatar: "🤖",
    },
    {
      who: "Dev_Jake",
      what: "modified security flags",
      when: "1 hour ago",
      avatar: "🧑🏽‍💻",
    },
    {
      who: "Admin_Sara",
      what: "unlocked directory",
      when: "3 hours ago",
      avatar: "👩🏽‍💼",
    },
  ];
}

function hashStub(str) {
  // Display-only stub (NOT cryptographic)
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + "...";
}

// -----------------------------
// UI Wiring
// -----------------------------
function wireUI() {
  // Search inputs share the same logic
  function onSearch(value) {
    state.query = value.trim();
    if (state.data) autoExpandForSearch();
    renderAll({ preserveTreeScroll: true });
  }

  els.treeSearch.addEventListener("input", (e) => onSearch(e.target.value));
  els.globalSearch.addEventListener("input", (e) => {
    els.treeSearch.value = e.target.value;
    onSearch(e.target.value);
  });

  // Keyboard navigation happens on the tree container
  els.tree.addEventListener("keydown", onTreeKeyDown);

  // Tree click delegation (one listener)
  els.tree.addEventListener("click", onTreeClick);

  // Workspace click delegation (details button + modal)
  els.workspace.addEventListener("click", onWorkspaceClick);

  // Close file menus when clicking outside
  document.addEventListener("click", (e) => {
    const clickedMenu = e.target.closest(".menu");
    const clickedMenuBtn = e.target.closest("[data-action='menu']");

    if (!clickedMenu && !clickedMenuBtn && state.openMenuForId) {
      state.openMenuForId = null;
      renderAll({ preserveTreeScroll: true });
    }
  });
}

function onTreeClick(e) {
  const itemEl = e.target.closest("[data-node-id]");
  if (!itemEl) return;

  const nodeId = itemEl.dataset.nodeId;
  const node = findNodeById(state.data, nodeId);
  if (!node) return;

  // 1) Action menu button (⋯)
  const menuBtn = e.target.closest("[data-action='menu']");
  if (menuBtn) {
    const id = menuBtn.dataset.menuId;
    state.openMenuForId = state.openMenuForId === id ? null : id;
    renderAll({ preserveTreeScroll: true });
    return;
  }

  // 2) Menu actions
  const viewDetailsBtn = e.target.closest("[data-action='view-details']");
  if (viewDetailsBtn) {
    const id = viewDetailsBtn.dataset.id;
    openDetails(id);
    return;
  }

  const deleteBtn = e.target.closest("[data-action='delete']");
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    state.deleteTargetId = id;
    state.openMenuForId = null;
    renderAll({ preserveTreeScroll: true });
    return;
  }

  // 3) Normal clicking
  if (node.type === "folder") {
    // Click folder => toggle
    toggleExpand(node.id);
    setFocus(node.id);
    return;
  }

  if (node.type === "file") {
    // Click file => preview if possible
    state.previewId = node.id;
    state.mode = "preview";

    // Details is separate; will not set selectedId on plain click
    state.openMenuForId = null;

    setFocus(node.id);
    renderAll({ preserveTreeScroll: true });
  }
}

function onWorkspaceClick(e) {
  // Open details from preview screen button
  const openBtn = e.target.closest("[data-action='open-details']");
  if (openBtn) {
    openDetails(openBtn.dataset.id);
    return;
  }

  // Modal close
  const closeModalBtn = e.target.closest("[data-action='close-delete']");
  if (closeModalBtn) {
    state.deleteTargetId = null;
    renderAll({ preserveTreeScroll: true });
    return;
  }

  // Modal confirm delete
  const confirmBtn = e.target.closest("[data-action='confirm-delete']");
  if (confirmBtn) {
    deleteCurrentTarget();
    return;
  }
}

function openDetails(id) {
  state.selectedId = id;
  state.mode = "details";
  state.openMenuForId = null;
  setFocus(id);
  renderAll({ preserveTreeScroll: true });
}

function deleteCurrentTarget() {
  const id = state.deleteTargetId;
  if (!id) return;

  deleteNodeById(state.data, id);

  // Clean up UI state if deleted item was active
  if (state.selectedId === id) state.selectedId = null;
  if (state.previewId === id) {
    state.previewId = null;
    state.mode = "empty";
  }

  state.deleteTargetId = null;
  renderAll({ preserveTreeScroll: true });
}

// -----------------------------
// Expand/Collapse + Focus
// -----------------------------
function toggleExpand(folderId) {
  if (state.expanded.has(folderId)) state.expanded.delete(folderId);
  else state.expanded.add(folderId);
  renderAll({ preserveTreeScroll: true });
}

function setFocus(nodeId) {
  state.focusedId = nodeId;
}

// -----------------------------
// Keyboard Navigation
// -----------------------------
function onTreeKeyDown(e) {
  const ids = state.visibleIds;
  if (!ids.length) return;

  const idx = Math.max(0, ids.indexOf(state.focusedId));
  const currentId = ids[idx];
  const currentNode = findNodeById(state.data, currentId);

  switch (e.key) {
    case "ArrowDown": {
      e.preventDefault();
      const next = ids[Math.min(ids.length - 1, idx + 1)];
      setFocus(next);
      renderAll({ preserveTreeScroll: true });
      scrollFocusedIntoView();
      break;
    }
    case "ArrowUp": {
      e.preventDefault();
      const prev = ids[Math.max(0, idx - 1)];
      setFocus(prev);
      renderAll({ preserveTreeScroll: true });
      scrollFocusedIntoView();
      break;
    }
    case "ArrowRight": {
      e.preventDefault();
      if (
        currentNode?.type === "folder" &&
        !state.expanded.has(currentNode.id)
      ) {
        state.expanded.add(currentNode.id);
        renderAll({ preserveTreeScroll: true });
      }
      break;
    }
    case "ArrowLeft": {
      e.preventDefault();
      if (
        currentNode?.type === "folder" &&
        state.expanded.has(currentNode.id)
      ) {
        state.expanded.delete(currentNode.id);
        renderAll({ preserveTreeScroll: true });
      } else {
        const parent = findParentOf(state.data, currentId);
        if (parent) {
          setFocus(parent.id);
          renderAll({ preserveTreeScroll: true });
          scrollFocusedIntoView();
        }
      }
      break;
    }
    case "Enter": {
      e.preventDefault();
      if (!currentNode) return;

      if (currentNode.type === "folder") {
        toggleExpand(currentNode.id);
      } else {
        // Enter on a file behaves like click: preview
        state.previewId = currentNode.id;
        state.mode = "preview";
        renderAll({ preserveTreeScroll: true });
      }
      break;
    }
    default:
      break;
  }
}

function scrollFocusedIntoView() {
  const el = els.tree.querySelector(
    `[data-node-id="${cssEscape(state.focusedId)}"]`,
  );
  if (el) el.scrollIntoView({ block: "nearest" });
}

function cssEscape(value) {
  return String(value).replace(/"/g, '\\"');
}

// -----------------------------
// Search (filter + auto-expand)
// -----------------------------
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

// -----------------------------
// Rendering
// -----------------------------
function renderAll(options = {}) {
  if (!state.data) return;

  const prevTreeScroll = els.tree.scrollTop;

  renderTree();
  renderWorkspace();
  renderInspector();

  if (options.preserveTreeScroll) {
    els.tree.scrollTop = prevTreeScroll;
  }
}

function renderTree() {
  const query = state.query.toLowerCase();
  const visibleIds = [];

  const html = Tree({
    node: state.data,
    level: 0,
    query,
    onVisible: (id) => visibleIds.push(id),
  });

  els.tree.innerHTML = html;
  state.visibleIds = visibleIds;

  // If focused item is not visible (after filtering), focus the first visible.
  if (visibleIds.length && !visibleIds.includes(state.focusedId)) {
    state.focusedId = visibleIds[0];
    renderTree();
  }
}

function renderWorkspace() {
  // Delete modal overlays on top of whatever the workspace is showing
  if (state.deleteTargetId) {
    els.workspace.innerHTML = WorkspaceWithModal();
    return;
  }

  if (state.mode === "details" && state.selectedId) {
    const node = findNodeById(state.data, state.selectedId);
    els.workspace.innerHTML = node ? DetailsWorkspace(node) : EmptyWorkspace();
    return;
  }

  if (state.mode === "preview" && state.previewId) {
    const node = findNodeById(state.data, state.previewId);
    els.workspace.innerHTML = node ? PreviewWorkspace(node) : EmptyWorkspace();
    return;
  }

  els.workspace.innerHTML = EmptyWorkspace();
}

function renderInspector() {
  // Inspector only shows details when a file is selected via "View Details"
  const node = state.selectedId
    ? findNodeById(state.data, state.selectedId)
    : null;
  els.inspector.innerHTML = Inspector(node);
}

// -----------------------------
// UI Components (HTML builders)
// -----------------------------
function Tree({ node, level, query, onVisible }) {
  if (!filterNodeForQuery(node, query)) return "";

  onVisible(node.id);

  const isFolder = node.type === "folder";
  const isExpanded = isFolder && state.expanded.has(node.id);
  const hasChildren =
    isFolder && Array.isArray(node.children) && node.children.length > 0;

  const isSelected = node.id === state.selectedId;
  const isFocused = node.id === state.focusedId;

  const twisty = isFolder
    ? `<span class="treeItem__twisty" data-action="toggle" aria-hidden="true">${
        hasChildren ? (isExpanded ? "▼" : "▶") : "•"
      }</span>`
    : `<span class="treeItem__twisty" aria-hidden="true"></span>`;

  const icon = isFolder ? "📁" : "📄";

  const actions =
    node.type === "file"
      ? `
      <div class="treeItem__actions">
        <button
          class="treeActionBtn"
          type="button"
          aria-label="File actions"
          data-action="menu"
          data-menu-id="${escapeHtml(node.id)}"
        >⋯</button>
      </div>
      ${FileMenu(node)}
    `
      : "";

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
      ${actions}
    </div>
  `;

  if (!isFolder || !isExpanded) return item;

  const childrenHtml = (node.children || [])
    .map((child) => Tree({ node: child, level: level + 1, query, onVisible }))
    .join("");

  return `${item}<div class="treeChildren" role="group">${childrenHtml}</div>`;
}

function FileMenu(fileNode) {
  if (state.openMenuForId !== fileNode.id) return "";

  return `
    <div class="menu" role="menu" aria-label="File actions">
      <button type="button" data-action="view-details" data-id="${escapeHtml(fileNode.id)}">View File Details</button>
      <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(fileNode.id)}">Delete File</button>
    </div>
  `;
}

function EmptyWorkspace() {
  return `
    <div class="card" style="height:100%; display:grid; place-items:center;">
      <div style="text-align:center; max-width:520px; padding:22px;">
        <div style="font-size:44px; opacity:.9;">🛡️</div>
        <h2 style="margin:10px 0 6px 0;">Secure Sandbox Mode</h2>
        <p class="muted" style="margin:0;">
          Select a file from the explorer to preview. Use the ⋯ menu to view full details.
        </p>
      </div>
    </div>
  `;
}

function PreviewWorkspace(node) {
  if (node.type !== "file") return EmptyWorkspace();

  // Previewable types: images and text-like files
  if (!isPreviewable(node)) {
    return `
      <div class="card">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <div>
            <h2 style="margin:0 0 6px 0;">${escapeHtml(node.name)}</h2>
            <div class="muted">Preview not available for this file type.</div>
          </div>
          <button class="btn btn--primary" type="button" data-action="open-details" data-id="${escapeHtml(node.id)}">
            View Details
          </button>
        </div>

        <div class="previewFrame" style="margin-top:14px;">
          <div class="lockPreview__inner">
            <div class="lockPreview__icon" aria-hidden="true">🔒</div>
            <div class="lockPreview__title">Encrypted / Binary Content Shielded</div>
            <div class="lockPreview__desc">
              This file is not previewable. Use “View Details” to inspect metadata, or download for local viewing.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const kind = previewKind(node);

  const previewHtml =
    kind === "image"
      ? `
      <div class="previewImageMock" aria-label="Image preview (mock)">
        <div style="text-align:center; padding:18px;">
          <div style="font-size:44px;">🖼️</div>
          <div style="margin-top:8px; font-weight:800;">Image Preview</div>
          <div class="muted" style="margin-top:6px;">
            ${escapeHtml(node.name)}<br/>
            (To show real images, provide a URL/content source per file.)
          </div>
        </div>
      </div>
    `
      : `
      <div class="previewTextMock" aria-label="Text preview (generated)">
        <pre>${escapeHtml(generateTextPreview(node))}</pre>
      </div>
    `;

  return `
    <div class="card">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div>
          <h2 style="margin:0 0 6px 0;">${escapeHtml(node.name)}</h2>
          <div class="muted">Preview available (${kind}). Use “View Details” for full inspection.</div>
        </div>
        <button class="btn btn--primary" type="button" data-action="open-details" data-id="${escapeHtml(node.id)}">
          View Details
        </button>
      </div>

      <div class="previewFrame" style="margin-top:14px;">
        ${previewHtml}
      </div>
    </div>
  `;
}

function DetailsWorkspace(node) {
  //details screen
  if (node.type !== "file") {
    return `
      <div class="card" style="height:100%; display:grid; place-items:center;">
        <div style="text-align:center; max-width:520px; padding:22px;">
          <div style="font-size:44px; opacity:.9;">📁</div>
          <h2 style="margin:10px 0 6px 0;">Folder Selected</h2>
          <p class="muted" style="margin:0;">Use the ⋯ menu on a file to open its details.</p>
        </div>
      </div>
    `;
  }

  const badges = [
    Badge(
      node.encryption !== "None" ? "AES-256 Encrypted" : "No Encryption",
      node.encryption !== "None" ? "accent" : "",
    ),
    Badge("Verified Signature", "good"),
    Badge("Production Grade", "warn"),
  ].join("");

  return `
    <div class="hero">
      <div class="fileHeader">
        
        <div class="fileTitle">
          <h1>${escapeHtml(node.name)}</h1>
          <div class="badges">${badges}</div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn--primary" type="button"><span>Download File</span></button>
        
      </div>
    </div>

    <div class="card preview_wrapper">
      <div class="preview_item">FILE SIZE</div><div class="preview_value">${escapeHtml(node.size || "—")}</div>
      <div class="preview_item">MIME TYPE</div><div class="preview_value">${escapeHtml(node.mime || "application/octet-stream")}</div>
      <div class="preview_item">SECURITY OWNER</div><div class="preview_value">${escapeHtml(node.owner || "System")}</div>
      <div class="preview_item">LOCATION PATH</div><div class="preview_value">${escapeHtml(node.path || "—")}</div>
    </div>

    <div class="lockPreview">
      <div class="lockPreview__inner">
        <div class="lockPreview__icon" aria-hidden="true">🔒</div>
        <div class="lockPreview__title">Secure Content Preview</div>
        <div class="lockPreview__desc">
          In a real system, preview would be controlled by file type, permissions, and encryption policy.
        </div>
        
      </div>
    </div>
  `;
}

function Inspector(node) {
  if (!node || node.type !== "file") {
    return `
      ${Section(
        "GENERAL INFO",
        KV([
          ["Name", "No selection"],
          ["Type", "—"],
          ["Size", "—"],
          ["Owner", "—"],
        ]),
      )}

      ${Section(
        "SECURITY METADATA",
        KV([
          ["Encryption", "—"],
          ["Status", "—"],
          ["Checksum", "—"],
          ["Permissions", "—"],
        ]),
      )}

      ${Section(
        "TIMESTAMPS",
        KV([
          ["Created", "—"],
          ["Modified", "—"],
          ["Accessed", "—"],
        ]),
      )}

      ${Section("RECENT ACTIVITY", `<div class="muted">No activity yet.</div>`)}
    `;
  }

  return `
    ${Section(
      "GENERAL INFO",
      KV([
        ["Logical Name", node.name],
        ["System File Type", node.mime || "application/octet-stream"],
        ["Total Payload Size", node.size || "—"],
        ["Location Path", node.path || "—"],
        ["Owner Identity", node.owner || "System"],
      ]),
    )}

    ${Section(
      "SECURITY METADATA",
      KV([
        ["Access Permissions", "Role-Based"],
        ["Encryption Method", node.encryption || "None"],
        ["SHA-256 Checksum", node.checksum || "—"],
        ["Verification Status", node.status || "—"],
      ]),
    )}

    ${Section(
      "TIMESTAMPS",
      KV([
        ["Created", node.created || "—"],
        ["Modified", node.modified || "—"],
        ["Accessed", node.accessed || "—"],
      ]),
    )}

    ${Section("RECENT ACTIVITY", ActivityList(node.activity || []))}
  `;
}

function WorkspaceWithModal() {
  const base =
    state.mode === "details" && state.selectedId
      ? DetailsWorkspace(findNodeById(state.data, state.selectedId))
      : state.mode === "preview" && state.previewId
        ? PreviewWorkspace(findNodeById(state.data, state.previewId))
        : EmptyWorkspace();

  return `${base}${DeleteModal()}`;
}

function DeleteModal() {
  const node = findNodeById(state.data, state.deleteTargetId);
  const name = node?.name || "this file";

  return `
    <div class="modalOverlay" role="dialog" aria-modal="true" aria-label="Delete confirmation">
      <div class="modal">
        <div class="modal__top">
          <div class="modal__icon" aria-hidden="true">!</div>
          <button class="btn btn--ghost" type="button" data-action="close-delete" aria-label="Close">✕</button>
        </div>

        <div class="modal__title">Are you sure this action?</div>
        <p class="modal__desc">Deleting <b>${escapeHtml(name)}</b> is not reversible.</p>

        <div class="modal__actions">
          <button class="btn" type="button" data-action="close-delete">Cancel</button>
          <button class="btn btn--danger" type="button" data-action="confirm-delete">Yes, delete</button>
        </div>
      </div>
    </div>
  `;
}

function Section(title, bodyHtml) {
  return `<div class="section"><h3>${escapeHtml(title)}</h3>${bodyHtml}</div>`;
}

function KV(rows) {
  return `
    <div class="kv">
      ${rows
        .map(
          ([k, v]) =>
            `<div class="kv__k">${escapeHtml(k)}</div><div class="kv__v">${escapeHtml(String(v))}</div>`,
        )
        .join("")}
    </div>
  `;
}

function Badge(text, variant) {
  const cls =
    variant === "accent"
      ? "badge badge--accent"
      : variant === "good"
        ? "badge badge--good"
        : variant === "warn"
          ? "badge badge--warn"
          : "badge";

  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function ActivityList(items) {
  if (!items.length) return `<div class="muted">No activity yet.</div>`;

  return `
    <div class="activity">
      ${items
        .map(
          (it) => `
          <div class="activityItem">
            <div class="activityAvatar" aria-hidden="true">${escapeHtml(it.avatar || "👤")}</div>
            <div class="activityMeta">
              <div class="who">${escapeHtml(it.who)}</div>
              <div class="what">${escapeHtml(it.what)}</div>
              <div class="when">${escapeHtml(it.when)}</div>
            </div>
          </div>
        `,
        )
        .join("")}
    </div>
  `;
}

// -----------------------------
// Preview Rules
// -----------------------------
function getExt(name) {
  const parts = String(name).split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function isPreviewable(node) {
  if (!node || node.type !== "file") return false;

  const ext = getExt(node.name);
  const image = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext);
  const text = ["txt", "log", "md", "json", "yaml", "yml"].includes(ext);

  return image || text;
}

function previewKind(node) {
  const ext = getExt(node.name);
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext))
    return "image";
  if (["txt", "log", "md", "json", "yaml", "yml"].includes(ext)) return "text";
  return "none";
}

function generateTextPreview(file) {
  const ext = getExt(file.name);

  if (ext === "json") {
    return `{
  "file": "${file.name}",
  "preview": "generated",
  "size": "${file.size || "—"}"
}`;
  }

  if (ext === "yaml" || ext === "yml") {
    return `file: ${file.name}\npreview: generated\nsize: ${file.size || "—"}\n`;
  }

  return `# ${file.name}\n\nPreview generated.\nSize: ${file.size || "—"}\n\nTip: If you have file content from an API, fetch and render it here.\n`;
}

// -----------------------------
// Tree Helpers
// -----------------------------
function findNodeById(root, id) {
  let found = null;
  walk(root, (node) => {
    if (node.id === id) found = node;
  });
  return found;
}

function findParentOf(root, childId) {
  let parent = null;
  walk(root, (node) => {
    if (
      node.type === "folder" &&
      node.children?.some((c) => c.id === childId)
    ) {
      parent = node;
    }
  });
  return parent;
}

function walk(root, cb, parents = []) {
  cb(root, parents);
  if (root.type === "folder" && Array.isArray(root.children)) {
    for (const child of root.children) {
      walk(child, cb, [...parents, root]);
    }
  }
}

function filterNodeForQuery(node, query) {
  if (!query) return true;

  const selfMatch = node.name.toLowerCase().includes(query);
  if (node.type === "file") return selfMatch;

  const childMatch = (node.children || []).some((c) =>
    filterNodeForQuery(c, query),
  );
  return selfMatch || childMatch;
}

function deleteNodeById(root, targetId) {
  if (!targetId) return false;

  if (root.type !== "folder" || !Array.isArray(root.children)) return false;

  const idx = root.children.findIndex((c) => c.id === targetId);
  if (idx >= 0) {
    root.children.splice(idx, 1);
    return true;
  }

  for (const child of root.children) {
    if (child.type === "folder") {
      const removed = deleteNodeById(child, targetId);
      if (removed) return true;
    }
  }

  return false;
}

// -----------------------------
// HTML Utilities
// -----------------------------
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

  els.tree.innerHTML = "";
  els.inspector.innerHTML = "";

  els.workspace.innerHTML = `
    <div class="card" style="padding:18px;">
      <h2 style="margin:0 0 8px 0;">No file was found</h2>
      <p class="muted" style="margin:0 0 10px 0;">${escapeHtml(msg)}</p>
    </div>
  `;
}
