const API = '';

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatTime(iso) {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 8);
}

function syntaxHighlight(obj) {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (match) => {
    if (/^"/.test(match)) {
      if (/:$/.test(match)) return `<span class="key">${match}</span>`;
      return `<span class="val-str">${match}</span>`;
    }
    if (/true|false/.test(match)) return `<span class="val-bool">${match}</span>`;
    if (/null/.test(match)) return `<span class="val-null">${match}</span>`;
    return `<span class="val-num">${match}</span>`;
  });
}

function showResponse(elId, data) {
  const el = document.getElementById(elId);
  const status = data.statusCode || '';
  const isGood = status === 'Good';
  const statusHtml = status
    ? `<span class="${isGood ? 'status-good' : 'status-bad'}">${status}</span>\n`
    : '';
  el.innerHTML = statusHtml + syntaxHighlight(data);
}

function addLogEntry(type, summary, statusCode) {
  const entries = document.getElementById('log-entries');
  const empty = entries.querySelector('.log-empty');
  if (empty) empty.remove();

  const isGood = statusCode === 'Good';
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `
    <span class="log-time">${formatTime(new Date().toISOString())}</span>
    <span class="log-type ${type}">${type}</span>
    <span class="log-summary">${summary}</span>
    <span class="log-status ${isGood ? 'good' : 'bad'}">${statusCode}</span>
  `;
  entries.prepend(el);

  const count = entries.querySelectorAll('.log-entry').length;
  document.getElementById('log-count').textContent = `${count} entr${count === 1 ? 'y' : 'ies'}`;
}

// ── Panel navigation ──────────────────────────────────────────────────────────

const panelTitles = {
  browse: 'Browse Node Tree',
  read: 'Read Node Values',
  write: 'Write Node Value',
  subscribe: 'Subscribe to Changes',
  call: 'Call Method',
  endpoints: 'Get Endpoints'
};

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.dataset.panel;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${panel}`).classList.add('active');
    document.getElementById('panel-title').textContent = panelTitles[panel];
  });
});

document.getElementById('clear-log-btn').addEventListener('click', async () => {
  await fetch(`${API}/api/log`, { method: 'DELETE' });
  const entries = document.getElementById('log-entries');
  entries.innerHTML = '<div class="log-empty">No activity yet</div>';
  document.getElementById('log-count').textContent = '0 entries';
});

// ── Load nodes ────────────────────────────────────────────────────────────────

let allNodes = [];
let allMethods = [];

async function loadNodes() {
  const res = await fetch(`${API}/api/nodes`);
  allNodes = await res.json();

  // Read panel: all nodes as checkboxes
  const readList = document.getElementById('read-node-list');
  readList.innerHTML = allNodes.map(n => `
    <label class="node-item">
      <input type="checkbox" value="${n.nodeId}" checked />
      <div class="node-item-label">
        <div class="node-item-name">${n.displayName}</div>
        <div class="node-item-id">${n.nodeId}</div>
      </div>
      <span class="node-item-badge">${n.dataType}</span>
    </label>
  `).join('');

  // Subscribe panel: checkboxes
  const subList = document.getElementById('sub-node-list');
  subList.innerHTML = allNodes.map(n => `
    <label class="node-item">
      <input type="checkbox" value="${n.nodeId}" checked />
      <div class="node-item-label">
        <div class="node-item-name">${n.displayName}</div>
        <div class="node-item-id">${n.nodeId}</div>
      </div>
    </label>
  `).join('');

  // Write panel: writable nodes only
  const writeSelect = document.getElementById('write-nodeid');
  allNodes.filter(n => n.writable).forEach(n => {
    const opt = document.createElement('option');
    opt.value = n.nodeId;
    opt.textContent = `${n.displayName} (${n.dataType})`;
    writeSelect.appendChild(opt);
  });

  writeSelect.addEventListener('change', () => {
    const node = allNodes.find(n => n.nodeId === writeSelect.value);
    if (node) {
      document.getElementById('write-hint').textContent =
        `Type: ${node.dataType}${node.unit ? ' · Unit: ' + node.unit : ''}`;
    }
  });
}

async function loadMethods() {
  const res = await fetch(`${API}/api/methods`);
  allMethods = await res.json();

  const sel = document.getElementById('call-method');
  allMethods.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.methodId;
    opt.textContent = m.displayName;
    sel.appendChild(opt);
  });

  sel.addEventListener('change', () => {
    const method = allMethods.find(m => m.methodId === sel.value);
    const container = document.getElementById('call-args-container');
    container.innerHTML = '';
    if (!method || method.inputArgs.length === 0) return;

    method.inputArgs.forEach(arg => {
      const fg = document.createElement('div');
      fg.className = 'field-group';
      fg.innerHTML = `
        <label>${arg.name} <span class="hint">${arg.dataType}</span></label>
        <input type="text" id="arg-${arg.name}" placeholder="Enter ${arg.name}" />
      `;
      container.appendChild(fg);
    });
  });
}

// ── Browse ────────────────────────────────────────────────────────────────────

const breadcrumbStack = [];

async function browseNode(nodeId, name) {
  const res = await fetch(`${API}/api/browse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId })
  });
  const data = await res.json();
  showResponse('browse-response', data);
  addLogEntry('Browse', `${name || nodeId}`, data.statusCode);

  if (data.statusCode !== 'Good') return;

  const resultEl = document.getElementById('browse-result');
  if (!data.references || data.references.length === 0) {
    resultEl.innerHTML = '<div class="tree-empty">No child nodes</div>';
    return;
  }

  resultEl.innerHTML = data.references.map(ref => {
    const icon = ref.nodeClass === 'Variable' ? '◈' : ref.hasChildren ? '▸' : '○';
    return `
      <div class="tree-node" data-nodeid="${ref.nodeId}" data-name="${ref.displayName}" data-has-children="${ref.hasChildren}">
        <span class="tree-node-icon">${icon}</span>
        <div class="tree-node-info">
          <div class="tree-node-name">${ref.displayName}</div>
          <div class="tree-node-id">${ref.nodeId}</div>
        </div>
        <span class="tree-node-class">${ref.nodeClass}</span>
        ${ref.hasChildren ? '<span class="tree-node-arrow">›</span>' : ''}
      </div>
    `;
  }).join('');

  resultEl.querySelectorAll('.tree-node').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.nodeid;
      const name = el.dataset.name;
      const hasChildren = el.dataset.hasChildren === 'true';

      document.getElementById('browse-nodeid').value = id;

      if (hasChildren) {
        breadcrumbStack.push({ id, name });
        updateBreadcrumb();
        browseNode(id, name);
      }
    });
  });
}

function updateBreadcrumb() {
  const el = document.getElementById('browse-breadcrumb');
  const parts = [{ id: '', name: 'Root' }, ...breadcrumbStack];
  el.innerHTML = parts.map((p, i) =>
    `<span data-idx="${i}" style="color:${i === parts.length - 1 ? 'var(--text)' : 'var(--accent)'}">${p.name}</span>`
  ).join(' <span style="color:var(--muted)">›</span> ');

  el.querySelectorAll('span[data-idx]').forEach(s => {
    s.addEventListener('click', () => {
      const idx = parseInt(s.dataset.idx);
      breadcrumbStack.splice(idx);
      updateBreadcrumb();
      const target = idx === 0 ? { id: '', name: 'Root' } : breadcrumbStack[idx - 1];
      browseNode(target.id || null, target.name);
    });
  });
}

document.getElementById('browse-btn').addEventListener('click', () => {
  const nodeId = document.getElementById('browse-nodeid').value.trim() || null;
  breadcrumbStack.length = 0;
  updateBreadcrumb();
  browseNode(nodeId, nodeId || 'Root');
});

// ── Read ──────────────────────────────────────────────────────────────────────

document.getElementById('read-btn').addEventListener('click', async () => {
  const checked = [...document.querySelectorAll('#read-node-list input:checked')].map(i => i.value);
  if (!checked.length) return;

  const res = await fetch(`${API}/api/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeIds: checked })
  });
  const data = await res.json();
  showResponse('read-response', data);
  addLogEntry('Read', `${checked.length} node(s)`, data.statusCode);
});

// ── Write ─────────────────────────────────────────────────────────────────────

document.getElementById('write-btn').addEventListener('click', async () => {
  const nodeId = document.getElementById('write-nodeid').value;
  const value = document.getElementById('write-value').value.trim();
  if (!nodeId || value === '') return;

  const res = await fetch(`${API}/api/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, value })
  });
  const data = await res.json();
  showResponse('write-response', data);
  addLogEntry('Write', `${nodeId} → ${value}`, data.statusCode);
});

// ── Subscribe ─────────────────────────────────────────────────────────────────

let evtSource = null;
const feedData = {};

document.getElementById('sub-start-btn').addEventListener('click', () => {
  const checked = [...document.querySelectorAll('#sub-node-list input:checked')].map(i => i.value);
  if (!checked.length) return;
  if (evtSource) evtSource.close();

  const feed = document.getElementById('sub-feed');
  feed.innerHTML = checked.map(id => {
    const node = allNodes.find(n => n.nodeId === id) || { displayName: id };
    return `
      <div class="feed-row" id="feed-${id.replace(/[^a-z0-9]/gi, '_')}">
        <div>
          <div class="feed-node-name">${node.displayName}</div>
          <div class="feed-node-id">${id}</div>
        </div>
        <div class="feed-value" id="fval-${id.replace(/[^a-z0-9]/gi, '_')}">—</div>
        <div class="feed-ts" id="fts-${id.replace(/[^a-z0-9]/gi, '_')}">—</div>
      </div>
    `;
  }).join('');

  const url = `${API}/api/subscribe?nodeIds=${checked.join(',')}`;
  evtSource = new EventSource(url);

  evtSource.onmessage = (e) => {
    const updates = JSON.parse(e.data);
    updates.forEach(u => {
      const key = u.nodeId.replace(/[^a-z0-9]/gi, '_');
      const valEl = document.getElementById(`fval-${key}`);
      const tsEl = document.getElementById(`fts-${key}`);
      const rowEl = document.getElementById(`feed-${key}`);
      if (valEl) {
        const prev = feedData[u.nodeId];
        feedData[u.nodeId] = u.value;
        valEl.textContent = u.value !== null && u.value !== undefined
          ? (typeof u.value === 'boolean' ? (u.value ? 'TRUE' : 'FALSE') : u.value)
          : '—';
        if (tsEl && u.timestamp) tsEl.textContent = formatTime(u.timestamp);
        if (rowEl && prev !== u.value) {
          rowEl.classList.add('flash');
          setTimeout(() => rowEl.classList.remove('flash'), 600);
        }
      }
    });
  };

  evtSource.onerror = () => {
    document.getElementById('sub-status').textContent = 'Connection error';
    document.getElementById('sub-status').className = 'sub-status';
  };

  const status = document.getElementById('sub-status');
  status.textContent = `Subscribed to ${checked.length} node(s)`;
  status.className = 'sub-status active';

  document.getElementById('sub-start-btn').disabled = true;
  document.getElementById('sub-stop-btn').disabled = false;

  addLogEntry('Subscribe', `${checked.length} node(s)`, 'Good');
});

document.getElementById('sub-stop-btn').addEventListener('click', () => {
  if (evtSource) { evtSource.close(); evtSource = null; }
  document.getElementById('sub-status').textContent = 'Unsubscribed';
  document.getElementById('sub-status').className = 'sub-status';
  document.getElementById('sub-start-btn').disabled = false;
  document.getElementById('sub-stop-btn').disabled = true;
  document.getElementById('sub-feed').innerHTML = '<div class="feed-empty">No active subscription</div>';
});

// ── Call Method ───────────────────────────────────────────────────────────────

document.getElementById('call-btn').addEventListener('click', async () => {
  const methodId = document.getElementById('call-method').value;
  if (!methodId) return;

  const method = allMethods.find(m => m.methodId === methodId);
  const inputArguments = {};
  (method?.inputArgs || []).forEach(arg => {
    const el = document.getElementById(`arg-${arg.name}`);
    if (el) inputArguments[arg.name] = el.value;
  });

  const res = await fetch(`${API}/api/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ methodId, inputArguments })
  });
  const data = await res.json();
  showResponse('call-response', data);
  addLogEntry('Call', method?.displayName || methodId, data.statusCode);
});

// ── Get Endpoints ─────────────────────────────────────────────────────────────

document.getElementById('endpoints-btn').addEventListener('click', async () => {
  const res = await fetch(`${API}/api/get-endpoints`, { method: 'POST' });
  const data = await res.json();
  showResponse('endpoints-response', data);
  addLogEntry('GetEndpoints', `${data.endpoints?.length || 0} endpoint(s)`, data.statusCode);
});

// ── Init ──────────────────────────────────────────────────────────────────────

(async () => {
  await Promise.all([loadNodes(), loadMethods()]);
  browseNode(null, 'Root');
})();

// ── Mobile: sidebar overlay ───────────────────────────────────────────────────

(function initMobileNav() {
  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  document.querySelector('.layout').prepend(backdrop);

  const sidebar = document.querySelector('.sidebar');
  const menuBtn = document.getElementById('menu-toggle-btn');
  if (!menuBtn) return;

  function openSidebar() { sidebar.classList.add('open'); backdrop.classList.add('visible'); }
  function closeSidebar() { sidebar.classList.remove('open'); backdrop.classList.remove('visible'); }

  menuBtn.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
  backdrop.addEventListener('click', closeSidebar);
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', closeSidebar));
})();

// ── Mobile: collapsible log panel ─────────────────────────────────────────────

(function initLogToggle() {
  const logPanel = document.querySelector('.log-panel');
  const logToggleBtn = document.getElementById('log-toggle-btn');
  if (!logToggleBtn) return;

  const header = document.querySelector('.log-header');
  const toggle = () => logPanel.classList.toggle('expanded');

  logToggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  header.addEventListener('click', toggle);
})();
