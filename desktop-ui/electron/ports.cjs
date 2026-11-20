// Dev-port allocation for sessions/worktrees. Replaces `5174 + list.length`, which handed out a port that was
// still in use after any session was deleted, and never checked whether the OS port was actually free.
// Each session gets PORT=p and API_PORT=p+3000 (see .env.local), so both must be free.
'use strict';
const net = require('net');

const API_OFFSET = 3000;

function probeFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen(port, host, () => srv.close(() => resolve(true)));
  });
}

// Ports recorded in the workspace registry (ws.ports[].port), including their API twins.
function registryPorts(list) {
  const used = new Set();
  for (const w of list || []) {
    for (const p of w?.ports || []) {
      if (Number.isInteger(p?.port)) {
        used.add(p.port);
        used.add(p.port + API_OFFSET);
      }
    }
  }
  return used;
}

// First port >= start that is not in `used` and whose app + API ports are both free on the OS.
// Adds the chosen pair to `used` so back-to-back calls in one pass never collide.
async function allocatePort(used, { start = 5174, end = 5999, isFree = probeFree } = {}) {
  for (let p = start; p <= end; p++) {
    if (used.has(p) || used.has(p + API_OFFSET)) continue;
    if ((await isFree(p)) && (await isFree(p + API_OFFSET))) {
      used.add(p);
      used.add(p + API_OFFSET);
      return p;
    }
  }
  throw new Error(`No free dev port pair in ${start}-${end}`);
}

module.exports = { allocatePort, registryPorts, probeFree, API_OFFSET };
