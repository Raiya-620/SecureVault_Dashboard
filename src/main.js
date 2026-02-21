/**
 * SecureVault — Vanilla JS File Explorer
 * - Recursive tree rendering
 * - Keyboard navigation (Up/Down/Left/Right/Enter)
 * - Search with auto-expand for matches
 * - Reusable render functions (component-like)
 */

/** ---------------------------
 *  Sample data (replace with data.json later)
 *  Expected node shape:
 *  { id, type: 'folder'|'file', name, size?, owner?, encryption?, checksum?, created?, modified?, accessed?, children? }
 * -------------------------- */
const DATA = {
  id: "root",
  type: "folder",
  name: "Root",
  children: [
    {
      id: "prod",
      type: "folder",
      name: "Production_Cluster_Alpha",
      children: [
        {
          id: "secrets",
          type: "folder",
          name: "Config_Secrets",
          children: [
            mkFile("envkey", "env_encryption.key", "8 KB", {
              encryption: "AES-256-GCM",
              checksum: "sha256:7b9d...f021",
            }),
            mkFile("db", "db_access_v4.json", "3 KB", {
              encryption: "None",
              checksum: "sha256:91ac...c922",
            }),
          ],
        },
        {
          id: "legacy",
          type: "folder",
          name: "Legacy_Backups",
          children: [
            mkFile("sql1", "prod_db_backup_2023_Q4.sql.enc", "4.28 GB", {
              encryption: "AES-256-GCM",
              checksum: "sha256:f3e9...a2b8",
            }),
          ],
        },
      ],
    },
    {
      id: "audits",
      type: "folder",
      name: "Security_Audits_2024",
      children: [
        mkFile("log1", "audit_report_Q1.pdf", "12.4 MB", {
          encryption: "AES-256-GCM",
          checksum: "sha256:0c11...77a1",
        }),
      ],
    },
  ],
};

function mkFile(id, name, size, extra = {}) {
  const now = new Date();
  return {
    id,
    type: "file",
    name,
    size,
    owner: extra.owner ?? "System",
    encryption: extra.encryption ?? "AES-256-GCM",
    checksum: extra.checksum ?? "sha256:—",
    created: extra.created ?? isoDate(addDays(now, -120)),
    modified: extra.modified ?? isoDate(addDays(now, -30)),
    accessed: extra.accessed ?? isoDate(now),
    activity: extra.activity ?? defaultActivity(),
  };
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
      when: "18 mins ago",
      avatar: "🤖",
    },
    {
      who: "Dev_Jake",
      what: "modified security flags",
      when: "1 hour ago",
      avatar: "🧑🏽‍💻",
    },
  ];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function isoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** ---------------------------
 *  State
 * -------------------------- */
const state = {
  data: DATA,
  expanded: new Set(["root", "prod"]), // expanded folder ids
  selectedId: null, // selected file id
  focusedId: null, // focused visible node id (for keyboard)
  query: "", // search query for tree
  filteredVisibleIds: [], // cache visible ids after render
};

const els = {
  tree: document.getElementById("tree"),
  inspector: document.getElementById("inspector"),
  workspace: document.getElementById("workspace"),
  treeSearch: document.getElementById("treeSearch"),
  globalSearch: document.getElementById("globalSearch"),
};

/** ---------------------------
 *  Init
 * -------------------------- */
function init() {
  // shared search inputs
  const onSearch = (value) => {
    state.query = value.trim();
    autoExpandForSearch();
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

    // clicking twisty toggles folder expand
    const clickedTwisty = e.target.closest("[data-action='toggle']");
    if (node.type === "folder" && clickedTwisty) {
      toggleExpand(node.id);
      return;
    }

    // clicking folder label toggles (common UX)
    if (node.type === "folder") {
      toggleExpand(node.id);
      setFocus(node.id);
      return;
    }

    // clicking file selects
    if (node.type === "file") {
      selectFile(node.id);
      setFocus(node.id);
    }
  });

  // set initial focus
  state.focusedId = "root";
  renderAll();
}

init();

/** ---------------------------
 *  Actions
 * -------------------------- */
function toggleExpand(folderId) {
  if (state.expanded.has(folderId)) state.expanded.delete(folderId);
  else state.expanded.add(folderId);
  renderAll();
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
      if (
        currentNode?.type === "folder" &&
        !state.expanded.has(currentNode.id)
      ) {
        state.expanded.add(currentNode.id);
        renderAll({ preserveScroll: true });
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
        renderAll({ preserveScroll: true });
      } else {
        // move focus to parent if possible
        const parent = findParentOf(state.data, currentId);
        if (parent) {
          setFocus(parent.id);
          scrollFocusedIntoView();
        }
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
  const el = els.tree.querySelector(
    `[data-node-id="${cssEscape(state.focusedId)}"]`,
  );
  if (!el) return;
  el.scrollIntoView({ block: "nearest" });
}

function cssEscape(value) {
  // minimal escape for attribute selectors
  return String(value).replace(/"/g, '\\"');
}

/** ---------------------------
 *  Search: auto-expand folders containing matches
 * -------------------------- */
function autoExpandForSearch() {
  if (!state.query) return;

  const q = state.query.toLowerCase();
  const matchedIds = new Set();

  walk(state.data, (node, parents) => {
    if (node.name.toLowerCase().includes(q)) {
      matchedIds.add(node.id);
      // expand all parents
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
  const prevScroll = els.tree.scrollTop;
  renderTree();
  renderWorkspace();
  renderInspector();

  if (options.preserveScroll) {
    els.tree.scrollTop = prevScroll;
  }
}

function renderTree() {
  const q = state.query.toLowerCase();
  const visibleIds = [];

  const treeHtml = Tree({
    node: state.data,
    level: 0,
    expanded: state.expanded,
    query: q,
    selectedId: state.selectedId,
    focusedId: state.focusedId,
    onVisible: (id) => visibleIds.push(id),
  });

  els.tree.innerHTML = treeHtml;
  state.filteredVisibleIds = visibleIds;

  // If focus is missing after filtering, move focus to first visible
  if (visibleIds.length && !visibleIds.includes(state.focusedId)) {
    state.focusedId = visibleIds[0];
    renderTree(); // rerender once with updated focus
  }
}

function renderWorkspace() {
  const selected = state.selectedId
    ? findNodeById(state.data, state.selectedId)
    : null;

  if (!selected) {
    els.workspace.innerHTML = EmptyWorkspace();
    return;
  }

  els.workspace.innerHTML = FileWorkspace(selected);
}

function renderInspector() {
  const selected = state.selectedId
    ? findNodeById(state.data, state.selectedId)
    : null;
  els.inspector.innerHTML = Inspector(selected);
}

/** ---------------------------
 *  “Components” (reusable renderers)
 * -------------------------- */
function Tree({
  node,
  level,
  expanded,
  query,
  selectedId,
  focusedId,
  onVisible,
}) {
  // Filter: show folders if they contain match in subtree OR themselves match; show files only if match (when query exists)
  const visible = filterNodeForQuery(node, query);
  if (!visible) return "";

  onVisible(node.id);

  const isFolder = node.type === "folder";
  const isExpanded = isFolder && expanded.has(node.id);
  const hasChildren =
    isFolder && Array.isArray(node.children) && node.children.length > 0;

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
      }),
    )
    .join("");

  return `
    ${item}
    <div class="treeChildren" role="group">
      ${childrenHtml}
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
          Select a restricted file from the explorer tree to initiate deep inspection and integrity verification.
        </p>
      </div>
    </div>
  `;
}

function FileWorkspace(file) {
  const badges = [
    Badge(
      file.encryption && file.encryption !== "None"
        ? "Encrypted"
        : "Not Encrypted",
      file.encryption !== "None" ? "accent" : "",
    ),
    Badge("Verified Signature", "good"),
    Badge("Production Grade", "warn"),
  ].join("");

  return `
    <div class="hero">
      <div class="fileHeader">
        <div class="fileIcon" aria-hidden="true">🗄️</div>
        <div class="fileTitle">
          <h1>${escapeHtml(file.name)}</h1>
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
      <div class="kv__k">FILE SIZE</div><div class="kv__v">${escapeHtml(file.size || "—")}</div>
      <div class="kv__k">MIME TYPE</div><div class="kv__v">application/octet-stream</div>
      <div class="kv__k">SECURITY OWNER</div><div class="kv__v">${escapeHtml(file.owner || "System")}</div>
    </div>

    <div class="lockPreview">
      <div class="lockPreview__inner">
        <div class="lockPreview__icon" aria-hidden="true">🔒</div>
        <div class="lockPreview__title">Encrypted Content Shielded</div>
        <div class="lockPreview__desc">
          Direct preview is disabled for encrypted assets to preserve integrity and compliance.
          Verify checksum or request authorized access for local inspection.
        </div>
        <div class="lockPreview__buttons">
          <button class="btn" type="button">Verify Checksum</button>
          <button class="btn btn--primary" type="button">Request Decryption Key</button>
        </div>
      </div>
    </div>
  `;
}

function Inspector(selected) {
  if (!selected) {
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

  const isFile = selected.type === "file";
  const baseKv = [
    ["Name", selected.name],
    ["Type", isFile ? "FILE" : "FOLDER"],
    ["Size", isFile ? selected.size || "—" : "N/A"],
    ["Owner", isFile ? selected.owner || "System" : "System"],
  ];

  const secKv = [
    ["Encryption", isFile ? selected.encryption || "None" : "None"],
    [
      "Status",
      isFile
        ? selected.encryption !== "None"
          ? "Verified"
          : "Unverified ⚠️"
        : "Available",
    ],
    ["Checksum", isFile ? selected.checksum || "—" : "Not Calculated"],
    ["Permissions", isFile ? "755 (Global)" : "—"],
  ];

  const timeKv = [
    ["Created", isFile ? selected.created || "—" : "—"],
    ["Modified", isFile ? selected.modified || "—" : "—"],
    ["Accessed", isFile ? selected.accessed || "—" : "—"],
  ];

  const activityHtml = isFile
    ? ActivityList(selected.activity || [])
    : `<div class="muted">Select a file to view activity.</div>`;

  return `
    ${Section("GENERAL INFO", KV(baseKv))}
    ${Section("SECURITY METADATA", KV(secKv))}
    ${Section("TIMESTAMPS", KV(timeKv))}
    ${Section("RECENT ACTIVITY", activityHtml + `<div style="margin-top:10px;"><button class="btn" type="button">View Full Audit Log</button></div>`)}
  `;
}

function Section(title, bodyHtml) {
  return `
    <div class="section">
      <h3>${escapeHtml(title)}</h3>
      ${bodyHtml}
    </div>
  `;
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

/** ---------------------------
 *  Helpers: tree walking, find, filter
 * -------------------------- */
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

/**
 * filterNodeForQuery:
 * - if no query => show everything
 * - if folder => show if it matches OR any child matches
 * - if file => show if it matches
 */
function filterNodeForQuery(node, query) {
  if (!query) return true;

  const selfMatch = node.name.toLowerCase().includes(query);
  if (node.type === "file") return selfMatch;

  // folder: check subtree
  const childMatch = (node.children || []).some((c) =>
    filterNodeForQuery(c, query),
  );
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
