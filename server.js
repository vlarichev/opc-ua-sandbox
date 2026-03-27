const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load mock node data (mutable in-memory state)
const nodesRaw = JSON.parse(fs.readFileSync(path.join(__dirname, 'mock-data/nodes.json'), 'utf8'));
const nodes = {};
for (const [id, node] of Object.entries(nodesRaw)) {
  nodes[id] = { ...node, timestamp: new Date().toISOString() };
}

// Simulate live value drift for read-only numeric nodes
function driftValues() {
  for (const node of Object.values(nodes)) {
    if (!node.writable && node.dataType !== 'Boolean') {
      const range = (node.max - node.min) * 0.02;
      const delta = (Math.random() - 0.5) * range;
      node.value = parseFloat(Math.min(node.max, Math.max(node.min, node.value + delta)).toFixed(2));
      node.timestamp = new Date().toISOString();
    }
  }
}
setInterval(driftValues, 2000);

const log = [];
function addLog(type, req, res, extra = {}) {
  const entry = {
    id: Date.now() + Math.random(),
    type,
    timestamp: new Date().toISOString(),
    request: req,
    response: res,
    ...extra
  };
  log.unshift(entry);
  if (log.length > 100) log.pop();
  return entry;
}

// ─── Browse ───────────────────────────────────────────────────────────────────
app.post('/api/browse', (req, res) => {
  const { nodeId } = req.body;

  const tree = {
    'Objects': {
      nodeId: 'ns=0;i=85',
      displayName: 'Objects',
      nodeClass: 'Object',
      children: {
        'Plant': {
          nodeId: 'ns=2;s=Plant',
          displayName: 'Plant',
          nodeClass: 'Object',
          children: {
            'Temperature': {
              nodeId: 'ns=2;s=Temperature',
              displayName: 'Temperature',
              nodeClass: 'Object',
              children: {
                'Sensor1': { nodeId: 'ns=2;s=Temperature.Sensor1', displayName: 'Temperature Sensor 1', nodeClass: 'Variable' },
                'Sensor2': { nodeId: 'ns=2;s=Temperature.Sensor2', displayName: 'Temperature Sensor 2', nodeClass: 'Variable' }
              }
            },
            'Pressure': {
              nodeId: 'ns=2;s=Pressure',
              displayName: 'Pressure',
              nodeClass: 'Object',
              children: {
                'MainLine': { nodeId: 'ns=2;s=Pressure.MainLine', displayName: 'Main Line Pressure', nodeClass: 'Variable' }
              }
            },
            'Control': {
              nodeId: 'ns=2;s=Control',
              displayName: 'Control',
              nodeClass: 'Object',
              children: {
                'Valve': { nodeId: 'ns=2;s=Valve.Control', displayName: 'Valve Control', nodeClass: 'Variable' },
                'SetPoint': { nodeId: 'ns=2;s=SetPoint.Temperature', displayName: 'Temperature Set Point', nodeClass: 'Variable' },
                'Motor': { nodeId: 'ns=2;s=Motor.Speed', displayName: 'Motor Speed', nodeClass: 'Variable' }
              }
            },
            'Flow': {
              nodeId: 'ns=2;s=Flow',
              displayName: 'Flow',
              nodeClass: 'Object',
              children: {
                'Output': { nodeId: 'ns=2;s=FlowRate.Output', displayName: 'Flow Rate Output', nodeClass: 'Variable' }
              }
            },
            'Alarms': {
              nodeId: 'ns=2;s=Alarms',
              displayName: 'Alarms',
              nodeClass: 'Object',
              children: {
                'HighTemp': { nodeId: 'ns=2;s=Alarm.HighTemp', displayName: 'High Temperature Alarm', nodeClass: 'Variable' }
              }
            }
          }
        }
      }
    }
  };

  function findNode(obj, id) {
    for (const [, v] of Object.entries(obj)) {
      if (v.nodeId === id) return v;
      if (v.children) {
        const found = findNode(v.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  let target = null;
  if (!nodeId || nodeId === 'ns=0;i=84' || nodeId === 'root') {
    target = { nodeId: 'ns=0;i=84', displayName: 'Root', nodeClass: 'Object', children: tree };
  } else {
    target = findNode(tree, nodeId);
  }

  if (!target) {
    const result = { statusCode: 'BadNodeIdUnknown', nodeId };
    addLog('Browse', { nodeId }, result);
    return res.status(404).json(result);
  }

  const references = Object.values(target.children || {}).map(child => ({
    nodeId: child.nodeId,
    displayName: child.displayName,
    nodeClass: child.nodeClass,
    hasChildren: !!child.children
  }));

  const result = {
    statusCode: 'Good',
    nodeId: target.nodeId,
    displayName: target.displayName,
    references
  };

  addLog('Browse', { nodeId: target.nodeId }, result);
  res.json(result);
});

// ─── Read ─────────────────────────────────────────────────────────────────────
app.post('/api/read', (req, res) => {
  const { nodeIds } = req.body;
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
    return res.status(400).json({ statusCode: 'BadInvalidArgument', message: 'nodeIds must be a non-empty array' });
  }

  const results = nodeIds.map(id => {
    const node = nodes[id];
    if (!node) return { nodeId: id, statusCode: 'BadNodeIdUnknown', value: null };
    return {
      nodeId: id,
      displayName: node.displayName,
      value: node.value,
      dataType: node.dataType,
      unit: node.unit,
      statusCode: 'Good',
      timestamp: node.timestamp
    };
  });

  const response = { statusCode: 'Good', results };
  addLog('Read', { nodeIds }, response);
  res.json(response);
});

// ─── Write ────────────────────────────────────────────────────────────────────
app.post('/api/write', (req, res) => {
  const { nodeId, value } = req.body;
  const node = nodes[nodeId];

  if (!node) {
    const result = { statusCode: 'BadNodeIdUnknown', nodeId };
    addLog('Write', { nodeId, value }, result, { success: false });
    return res.status(404).json(result);
  }
  if (!node.writable) {
    const result = { statusCode: 'BadNotWritable', nodeId };
    addLog('Write', { nodeId, value }, result, { success: false });
    return res.status(403).json(result);
  }

  const prev = node.value;
  if (node.dataType === 'Boolean') {
    node.value = value === true || value === 'true' || value === 1;
  } else if (node.dataType === 'Int32') {
    node.value = parseInt(value, 10);
  } else {
    node.value = parseFloat(value);
  }
  node.timestamp = new Date().toISOString();

  const result = { statusCode: 'Good', nodeId, previousValue: prev, newValue: node.value };
  addLog('Write', { nodeId, value }, result, { success: true });
  res.json(result);
});

// ─── Subscribe (simulated SSE) ────────────────────────────────────────────────
app.get('/api/subscribe', (req, res) => {
  const nodeIds = req.query.nodeIds ? req.query.nodeIds.split(',') : [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  addLog('Subscribe', { nodeIds }, { statusCode: 'Good', message: 'Subscription active' });

  const send = () => {
    const updates = nodeIds.map(id => {
      const node = nodes[id];
      if (!node) return { nodeId: id, statusCode: 'BadNodeIdUnknown' };
      return { nodeId: id, value: node.value, statusCode: 'Good', timestamp: node.timestamp };
    });
    res.write(`data: ${JSON.stringify(updates)}\n\n`);
  };

  send();
  const interval = setInterval(send, 2000);
  req.on('close', () => clearInterval(interval));
});

// ─── Call Method ──────────────────────────────────────────────────────────────
const methods = {
  'ns=2;s=Methods.ResetAlarms': {
    displayName: 'Reset Alarms',
    inputArgs: [],
    handler: () => {
      nodes['ns=2;s=Alarm.HighTemp'].value = false;
      nodes['ns=2;s=Alarm.HighTemp'].timestamp = new Date().toISOString();
      return { message: 'All alarms reset successfully', alarmsCleared: 1 };
    }
  },
  'ns=2;s=Methods.SetMotorSpeed': {
    displayName: 'Set Motor Speed',
    inputArgs: [{ name: 'targetRPM', dataType: 'Int32' }],
    handler: ({ targetRPM }) => {
      const rpm = Math.min(3000, Math.max(0, parseInt(targetRPM, 10)));
      nodes['ns=2;s=Motor.Speed'].value = rpm;
      nodes['ns=2;s=Motor.Speed'].timestamp = new Date().toISOString();
      return { message: `Motor speed set to ${rpm} RPM`, actualRPM: rpm };
    }
  },
  'ns=2;s=Methods.Diagnostics': {
    displayName: 'Run Diagnostics',
    inputArgs: [],
    handler: () => ({
      status: 'OK',
      uptime: Math.floor(process.uptime()),
      nodeCount: Object.keys(nodes).length,
      memoryMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
    })
  }
};

app.post('/api/call', (req, res) => {
  const { methodId, inputArguments = {} } = req.body;
  const method = methods[methodId];

  if (!method) {
    const result = { statusCode: 'BadMethodInvalid', methodId };
    addLog('Call', { methodId, inputArguments }, result, { success: false });
    return res.status(404).json(result);
  }

  try {
    const output = method.handler(inputArguments);
    const result = { statusCode: 'Good', methodId, displayName: method.displayName, outputArguments: output };
    addLog('Call', { methodId, inputArguments }, result, { success: true });
    res.json(result);
  } catch (e) {
    const result = { statusCode: 'BadInternalError', message: e.message };
    addLog('Call', { methodId, inputArguments }, result, { success: false });
    res.status(500).json(result);
  }
});

// ─── GetEndpoints ─────────────────────────────────────────────────────────────
app.post('/api/get-endpoints', (req, res) => {
  const result = {
    statusCode: 'Good',
    endpoints: [
      {
        endpointUrl: 'opc.tcp://localhost:4840',
        securityMode: 'None',
        securityPolicy: 'http://opcfoundation.org/UA/SecurityPolicy#None',
        transportProfile: 'http://opcfoundation.org/UA-Profile/Transport/uatcp-uasc-uabinary',
        serverCertificate: null
      },
      {
        endpointUrl: 'opc.tcp://localhost:4840',
        securityMode: 'SignAndEncrypt',
        securityPolicy: 'http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256',
        transportProfile: 'http://opcfoundation.org/UA-Profile/Transport/uatcp-uasc-uabinary',
        serverCertificate: 'MIIBxDCCAW6gAwIBAgI...(truncated)'
      }
    ]
  };
  addLog('GetEndpoints', {}, result);
  res.json(result);
});

// ─── Methods list ─────────────────────────────────────────────────────────────
app.get('/api/methods', (req, res) => {
  res.json(Object.entries(methods).map(([id, m]) => ({
    methodId: id,
    displayName: m.displayName,
    inputArgs: m.inputArgs
  })));
});

// ─── Nodes list ───────────────────────────────────────────────────────────────
app.get('/api/nodes', (req, res) => {
  res.json(Object.values(nodes).map(n => ({
    nodeId: n.nodeId,
    displayName: n.displayName,
    dataType: n.dataType,
    writable: n.writable,
    unit: n.unit
  })));
});

// ─── Log ──────────────────────────────────────────────────────────────────────
app.get('/api/log', (req, res) => res.json(log));
app.delete('/api/log', (req, res) => { log.length = 0; res.json({ ok: true }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OPC-UA Simulator running at http://localhost:${PORT}`));
