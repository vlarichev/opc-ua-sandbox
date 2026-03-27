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
  endpoints: 'Get Endpoints',
  code: 'Code Snippets'
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

// ── Code panel ────────────────────────────────────────────────────────────────

const CODE_SNIPPETS = {
  nodejs: {
    _install: 'npm install node-opcua',
    browse: `const { OPCUAClient, NodeId } = require("node-opcua");

const client = OPCUAClient.create({ endpointMustExist: false });
await client.connect("opc.tcp://localhost:4840");
const session = await client.createSession();

// Browse the root Objects folder
const result = await session.browse({
  nodeId: "ns=0;i=85",           // Objects folder
  browseDirection: "Forward",
  referenceTypeId: "Organizes",
  includeSubtypes: true,
  nodeClassMask: 0,
  resultMask: 63,
});

for (const ref of result.references) {
  console.log(ref.displayName.text, ref.nodeId.toString());
}

await session.close();
await client.disconnect();`,

    read: `const { OPCUAClient, AttributeIds, DataType } = require("node-opcua");

const client = OPCUAClient.create({ endpointMustExist: false });
await client.connect("opc.tcp://localhost:4840");
const session = await client.createSession();

// Read multiple nodes in one request
const nodesToRead = [
  { nodeId: "ns=2;s=Temperature.Sensor1", attributeId: AttributeIds.Value },
  { nodeId: "ns=2;s=Pressure.MainLine",   attributeId: AttributeIds.Value },
  { nodeId: "ns=2;s=Motor.Speed",          attributeId: AttributeIds.Value },
];

const dataValues = await session.read(nodesToRead);

dataValues.forEach((dv, i) => {
  console.log(
    nodesToRead[i].nodeId,
    "=", dv.value.value,
    "| status:", dv.statusCode.toString()
  );
});

await session.close();
await client.disconnect();`,

    write: `const { OPCUAClient, DataType, Variant } = require("node-opcua");

const client = OPCUAClient.create({ endpointMustExist: false });
await client.connect("opc.tcp://localhost:4840");
const session = await client.createSession();

// Write a new setpoint value
const statusCode = await session.writeSingleNode(
  "ns=2;s=SetPoint.Temperature",
  new Variant({ dataType: DataType.Double, value: 80.5 })
);

console.log("Write result:", statusCode.toString());

// Write a boolean (valve open/close)
const valveStatus = await session.writeSingleNode(
  "ns=2;s=Valve.Control",
  new Variant({ dataType: DataType.Boolean, value: false })
);

console.log("Valve write result:", valveStatus.toString());

await session.close();
await client.disconnect();`,

    subscribe: `const { OPCUAClient, TimestampsToReturn, AttributeIds } = require("node-opcua");

const client = OPCUAClient.create({ endpointMustExist: false });
await client.connect("opc.tcp://localhost:4840");
const session = await client.createSession();

// Create a subscription (publishingInterval in ms)
const subscription = await session.createSubscription2({
  requestedPublishingInterval: 2000,
  requestedLifetimeCount: 100,
  requestedMaxKeepAliveCount: 10,
  maxNotificationsPerPublish: 100,
  publishingEnabled: true,
  priority: 10,
});

subscription.on("keepalive", () => console.log("keepalive"));
subscription.on("terminated", () => console.log("subscription ended"));

// Monitor a node
const monitoredItem = await subscription.monitor(
  { nodeId: "ns=2;s=Temperature.Sensor1", attributeId: AttributeIds.Value },
  { samplingInterval: 2000, discardOldest: true, queueSize: 10 },
  TimestampsToReturn.Both
);

monitoredItem.on("changed", (dataValue) => {
  console.log("Temperature:", dataValue.value.value, "°C");
});

// Keep alive for 30 seconds then clean up
await new Promise(r => setTimeout(r, 30_000));
await subscription.terminate();
await session.close();
await client.disconnect();`,

    call: `const { OPCUAClient, DataType, Variant } = require("node-opcua");

const client = OPCUAClient.create({ endpointMustExist: false });
await client.connect("opc.tcp://localhost:4840");
const session = await client.createSession();

// Call a method: Reset all alarms (no input args)
const resetResult = await session.call({
  objectId: "ns=2;s=Plant",
  methodId: "ns=2;s=Methods.ResetAlarms",
  inputArguments: [],
});
console.log("Reset alarms:", resetResult.statusCode.toString());
console.log("Output:", resetResult.outputArguments);

// Call a method with arguments: Set motor speed
const speedResult = await session.call({
  objectId: "ns=2;s=Plant",
  methodId: "ns=2;s=Methods.SetMotorSpeed",
  inputArguments: [
    new Variant({ dataType: DataType.Int32, value: 1800 })
  ],
});
console.log("Motor speed set:", speedResult.outputArguments);

await session.close();
await client.disconnect();`,

    endpoints: `const { OPCUAClient } = require("node-opcua");

// GetEndpoints does not require an active session
const client = OPCUAClient.create({ endpointMustExist: false });

const endpoints = await client.getEndpoints("opc.tcp://localhost:4840");

for (const ep of endpoints) {
  console.log("URL:", ep.endpointUrl);
  console.log("Security mode:", ep.securityMode.toString());
  console.log("Security policy:", ep.securityPolicyUri);
  console.log("---");
}

await client.disconnect();`,
  },

  python: {
    _install: 'pip install asyncua',
    browse: `import asyncio
from asyncua import Client

async def main():
    async with Client(url="opc.tcp://localhost:4840") as client:
        # Get the Objects folder node and browse its children
        objects = client.get_node("ns=0;i=85")
        children = await objects.get_children()

        for child in children:
            name = await child.read_display_name()
            print(f"{name.Text}  ->  {child}")

asyncio.run(main())`,

    read: `import asyncio
from asyncua import Client

async def main():
    async with Client(url="opc.tcp://localhost:4840") as client:
        node_ids = [
            "ns=2;s=Temperature.Sensor1",
            "ns=2;s=Pressure.MainLine",
            "ns=2;s=Motor.Speed",
        ]

        nodes = [client.get_node(nid) for nid in node_ids]

        # Read all values concurrently
        values = await asyncio.gather(*[n.read_value() for n in nodes])

        for nid, val in zip(node_ids, values):
            print(f"{nid} = {val}")

asyncio.run(main())`,

    write: `import asyncio
from asyncua import Client
from asyncua.ua import DataValue, Variant, VariantType

async def main():
    async with Client(url="opc.tcp://localhost:4840") as client:
        # Write a Double value (temperature setpoint)
        sp_node = client.get_node("ns=2;s=SetPoint.Temperature")
        await sp_node.write_value(
            DataValue(Variant(80.5, VariantType.Double))
        )
        print("Setpoint written")

        # Write a Boolean (open/close valve)
        valve = client.get_node("ns=2;s=Valve.Control")
        await valve.write_value(
            DataValue(Variant(False, VariantType.Boolean))
        )
        print("Valve closed")

asyncio.run(main())`,

    subscribe: `import asyncio
from asyncua import Client
from asyncua.common.subscription import SubHandler

class DataChangeHandler(SubHandler):
    def datachange_notification(self, node, val, data):
        print(f"Change: {node}  ->  {val}")

async def main():
    async with Client(url="opc.tcp://localhost:4840") as client:
        handler = DataChangeHandler()
        subscription = await client.create_subscription(
            period=2000,   # ms
            handler=handler
        )

        node = client.get_node("ns=2;s=Temperature.Sensor1")
        handle = await subscription.subscribe_data_change([node])

        print("Subscribed — waiting 30 s for updates...")
        await asyncio.sleep(30)

        await subscription.unsubscribe(handle)
        await subscription.delete()

asyncio.run(main())`,

    call: `import asyncio
from asyncua import Client
from asyncua.ua import Variant, VariantType

async def main():
    async with Client(url="opc.tcp://localhost:4840") as client:
        plant = client.get_node("ns=2;s=Plant")

        # Call method with no arguments — reset alarms
        reset_method = client.get_node("ns=2;s=Methods.ResetAlarms")
        result = await plant.call_method(reset_method)
        print("Reset alarms:", result)

        # Call method with an Int32 argument — set motor speed
        speed_method = client.get_node("ns=2;s=Methods.SetMotorSpeed")
        result = await plant.call_method(
            speed_method,
            Variant(1800, VariantType.Int32)
        )
        print("Motor speed result:", result)

asyncio.run(main())`,

    endpoints: `import asyncio
from asyncua import Client

async def main():
    # GetEndpoints works without connecting a session
    client = Client(url="opc.tcp://localhost:4840")
    endpoints = await client.connect_and_get_server_endpoints()

    for ep in endpoints:
        print("URL:", ep.EndpointUrl)
        print("Security mode:", ep.SecurityMode)
        print("Security policy:", ep.SecurityPolicyUri)
        print("---")

asyncio.run(main())`,
  },

  rest: {
    _install: null,
    browse: `// Browse the simulator's node tree via HTTP POST
// Works against this simulator's REST API

const response = await fetch("http://localhost:3000/api/browse", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nodeId: "ns=0;i=85",   // omit or set null to browse root
  }),
});

const data = await response.json();
// data.references — array of child nodes
// data.statusCode — "Good" or an OPC-UA error code

console.log(data.statusCode);
data.references.forEach(ref => {
  console.log(ref.displayName, "|", ref.nodeId, "|", ref.nodeClass);
});`,

    read: `// Read one or more node values via HTTP POST

const response = await fetch("http://localhost:3000/api/read", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nodeIds: [
      "ns=2;s=Temperature.Sensor1",
      "ns=2;s=Pressure.MainLine",
      "ns=2;s=Motor.Speed",
    ],
  }),
});

const data = await response.json();
// data.results — array matching the nodeIds order
// Each result: { nodeId, displayName, value, dataType, unit, statusCode, timestamp }

data.results.forEach(r => {
  console.log(\`\${r.displayName}: \${r.value} \${r.unit} [\${r.statusCode}]\`);
});`,

    write: `// Write a value to a writable node via HTTP POST

const response = await fetch("http://localhost:3000/api/write", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nodeId: "ns=2;s=SetPoint.Temperature",
    value: 82.5,
  }),
});

const data = await response.json();
// data.statusCode — "Good", "BadNotWritable", or "BadNodeIdUnknown"
// data.previousValue — value before the write
// data.newValue     — value after the write

console.log(\`\${data.previousValue} -> \${data.newValue} [\${data.statusCode}]\`);

// Toggle the valve (Boolean node)
await fetch("http://localhost:3000/api/write", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nodeId: "ns=2;s=Valve.Control", value: false }),
});`,

    subscribe: `// Subscribe to live updates via Server-Sent Events (SSE)

const nodeIds = [
  "ns=2;s=Temperature.Sensor1",
  "ns=2;s=Pressure.MainLine",
].join(",");

const evtSource = new EventSource(
  \`http://localhost:3000/api/subscribe?nodeIds=\${nodeIds}\`
);

evtSource.onmessage = (event) => {
  const updates = JSON.parse(event.data);
  // updates — array of { nodeId, value, statusCode, timestamp }

  updates.forEach(u => {
    console.log(\`[\${u.timestamp}] \${u.nodeId} = \${u.value}\`);
  });
};

evtSource.onerror = () => {
  console.error("SSE connection lost");
  evtSource.close();
};

// Stop after 30 seconds
setTimeout(() => evtSource.close(), 30_000);`,

    call: `// Call a server-side method via HTTP POST

// 1. List available methods
const methodsRes = await fetch("http://localhost:3000/api/methods");
const methods = await methodsRes.json();
console.log(methods);
// [ { methodId, displayName, inputArgs }, ... ]

// 2. Call a method with no arguments
const resetRes = await fetch("http://localhost:3000/api/call", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    methodId: "ns=2;s=Methods.ResetAlarms",
    inputArguments: {},
  }),
});
console.log(await resetRes.json());

// 3. Call a method with arguments
const speedRes = await fetch("http://localhost:3000/api/call", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    methodId: "ns=2;s=Methods.SetMotorSpeed",
    inputArguments: { targetRPM: 1800 },
  }),
});
console.log(await speedRes.json());`,

    endpoints: `// Retrieve server endpoint configurations via HTTP POST

const response = await fetch("http://localhost:3000/api/get-endpoints", {
  method: "POST",
});

const data = await response.json();
// data.endpoints — array of endpoint descriptors

data.endpoints.forEach(ep => {
  console.log("URL:", ep.endpointUrl);
  console.log("Security mode:", ep.securityMode);
  console.log("Policy:", ep.securityPolicy);
  console.log("---");
});`,
  },
};

const INSTALL_LABELS = {
  nodejs: 'Install: <code>npm install node-opcua</code>',
  python: 'Install: <code>pip install asyncua</code>',
  rest:   'No dependencies — runs in any browser or Node.js environment',
};

function highlightCode(code, lang) {
  // Escape HTML first
  let s = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (lang === 'python') {
    s = s
      .replace(/(#[^\n]*)/g, '<span class="tok-cmt">$1</span>')
      .replace(/\b(import|from|async|await|def|class|with|as|for|in|if|return|print|True|False|None)\b/g, '<span class="tok-kw">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|"""[\s\S]*?""")/g, '<span class="tok-str">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
  } else {
    // JS / REST
    s = s
      .replace(/(\/\/[^\n]*)/g, '<span class="tok-cmt">$1</span>')
      .replace(/\b(const|let|var|async|await|function|return|new|for|of|import|require|from|class|if|throw)\b/g, '<span class="tok-kw">$1</span>')
      .replace(/(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="tok-str">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?(?:_\d+)?)\b/g, '<span class="tok-num">$1</span>')
      .replace(/\b([A-Z][A-Za-z0-9]+)\b/g, '<span class="tok-cls">$1</span>');
  }

  return s;
}

(function initCodePanel() {
  let currentLang = 'nodejs';
  let currentReq  = 'browse';

  const snippetEl  = document.getElementById('code-snippet-inner');
  const installEl  = document.getElementById('code-install-hint');
  const copyBtn    = document.getElementById('code-copy-btn');

  function render() {
    const code = CODE_SNIPPETS[currentLang][currentReq] || '';
    snippetEl.innerHTML = highlightCode(code, currentLang);
    installEl.innerHTML = INSTALL_LABELS[currentLang];
  }

  document.getElementById('code-lang-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.code-lang-tab');
    if (!btn) return;
    currentLang = btn.dataset.lang;
    document.querySelectorAll('.code-lang-tab').forEach(b => b.classList.toggle('active', b === btn));
    render();
  });

  document.getElementById('code-request-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.code-req-tab');
    if (!btn) return;
    currentReq = btn.dataset.req;
    document.querySelectorAll('.code-req-tab').forEach(b => b.classList.toggle('active', b === btn));
    render();
  });

  copyBtn.addEventListener('click', () => {
    const raw = CODE_SNIPPETS[currentLang][currentReq] || '';
    navigator.clipboard.writeText(raw).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1800);
    });
  });

  render();
})();

// ── Onboarding modal ──────────────────────────────────────────────────────────

(function initOnboarding() {
  const backdrop = document.getElementById('onboard-backdrop');
  const closeBtn = document.getElementById('onboard-close');
  const startBtn = document.getElementById('onboard-start');
  const helpBtn  = document.getElementById('help-btn');

  function openModal()  { backdrop.classList.remove('hidden'); }
  function closeModal() { backdrop.classList.add('hidden'); localStorage.setItem('opc-onboarded', '1'); }

  closeBtn.addEventListener('click', closeModal);
  startBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  helpBtn.addEventListener('click', openModal);

  // Show on first visit
  if (!localStorage.getItem('opc-onboarded')) openModal();
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
