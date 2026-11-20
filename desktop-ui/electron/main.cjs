const { app, BrowserWindow, ipcMain, dialog, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');
const pty = require('node-pty');
const { createOscParser, createRateLimiter } = require('./osc.cjs');
const { readJsonSafe, writeJsonAtomic } = require('./jsonstore.cjs');
const { resolveInsideRoots } = require('./pathguard.cjs');
const { cutAtSafeBoundary, trimScrollback } = require('./scrollback.cjs');
const { allocatePort, registryPorts } = require('./ports.cjs');

// Configuration
const SWARMHERD_DIR = path.join(os.homedir(), '.swarmherd');
const SESSIONS_DIR = path.join(SWARMHERD_DIR, 'sessions');
const WORKSPACES_FILE = path.join(SWARMHERD_DIR, 'workspaces.json');
const PROJECTS_FILE = path.join(SWARMHERD_DIR, 'projects.json');
const ROOMS_FILE = path.join(SWARMHERD_DIR, 'rooms.json');
const ROOM_MESSAGES_FILE = path.join(SWARMHERD_DIR, 'room_messages.json');
const WORKSPACE_STATE_FILE = path.join(SWARMHERD_DIR, 'workspace_state.json');
const LOG_FILE = path.join(SWARMHERD_DIR, 'dewwie.log');

// Ensure storage directories exist
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Prevent system sleep or process suspension during overnight/background agent execution
try {
  powerSaveBlocker.start('prevent-app-suspension');
} catch (_) {}

function logToFile(msg, err) {
  const line = `[${new Date().toISOString()}] ${msg} ${err ? (err.stack || err.message || err) : ''}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch (_) {}
}

process.on('uncaughtException', (err) => {
  logToFile('Uncaught Exception:', err);
  console.error('[Dewwie Error]', err);
});

process.on('unhandledRejection', (reason) => {
  logToFile('Unhandled Rejection:', reason);
  console.error('[Dewwie Rejection]', reason);
});

// Single Instance Lock: Prevents port collisions and corrupted workspace states
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  const warnMsg = '[Dewwie] Another instance is already running. Quitting secondary process.';
  console.log(warnMsg);
  logToFile(warnMsg);
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// In-Memory Master Cache to prevent async race condition wipes
let workspacesCache = null;

// Active PTY sessions map: workspaceId -> { ptyProcess, scrollbackPath, cwd, isAttached, getBuffer, appendDisplay }
const activePtys = new Map();

// Helper: Resolve dynamic fallback root for portable execution on any machine
// First registered project that exists on disk, else the folder the app runs from (portable).
function defaultFallbackDir() {
  const first = getProjects().find((p) => p.rootPath && fs.existsSync(p.rootPath));
  return first ? first.rootPath : path.resolve(__dirname, '../..');
}

// -------------------------------------------------------------
// Real Git Operations Helper
// -------------------------------------------------------------
function execGit(args, cwd) {
  return new Promise((resolve) => {
    // No shell: args go to git verbatim. With shell:true, cmd.exe re-parsed them, so `&`/`|` in a
    // branch name ran extra commands and multi-word commit messages were split (merge always failed).
    const proc = spawn('git', args, { cwd: cwd || defaultFallbackDir(), windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('error', err => resolve({ code: -1, stdout, stderr: stderr + err.message }));
    proc.on('close', code => resolve({ code, stdout, stderr }));
  });
}

// -------------------------------------------------------------
// Projects Management (Top-Level Folders)
// -------------------------------------------------------------
function getProjects() {
  let list = [];
  if (fs.existsSync(PROJECTS_FILE)) {
    try {
      list = readJsonSafe(PROJECTS_FILE, list);
    } catch (_) {}
  }

  // Ensure portable fallback project exists for other users
  const validProjects = list.filter(p => p.rootPath && fs.existsSync(p.rootPath));
  if (validProjects.length === 0) {
    const fallbackRoot = path.resolve(__dirname, '../..');
    const folderName = path.basename(fallbackRoot) || 'Dewwie Project';
    list.push({
      id: `proj-${Date.now().toString(36)}`,
      name: folderName,
      rootPath: fallbackRoot,
      isGitRepo: fs.existsSync(path.join(fallbackRoot, '.git')),
      createdAt: new Date().toISOString()
    });
    saveProjects(list);
  }

  // Repos are never modified implicitly. Protocol files are written only by the explicit
  // mesh:syncSkills action (user clicks Sync in the Agent Mesh panel).
  return list;
}

function saveProjects(list) {
  writeJsonAtomic(PROJECTS_FILE, list);
}

function addProject({ path: folderPath, name }) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    throw new Error('Directory path does not exist');
  }
  const cleanPath = path.resolve(folderPath);
  const list = getProjects();
  const existing = list.find(p => p.rootPath.toLowerCase() === cleanPath.toLowerCase());
  if (existing) {
    return existing;
  }

  const projName = name?.trim() || path.basename(cleanPath);
  const newProj = {
    id: `proj-${Date.now().toString(36)}`,
    name: projName,
    rootPath: cleanPath,
    isGitRepo: fs.existsSync(path.join(cleanPath, '.git')),
    createdAt: new Date().toISOString()
  };
  list.push(newProj);
  saveProjects(list);
  return newProj;
}

function removeProject(id) {
  const list = getProjects().filter(p => p.id !== id);
  saveProjects(list);
  return true;
}

// -------------------------------------------------------------
// Multi-Agent Rooms Management
// -------------------------------------------------------------
function getRooms() {
  if (fs.existsSync(ROOMS_FILE)) {
    try {
      const data = readJsonSafe(ROOMS_FILE, null);
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (_) {}
  }
  const defaultRooms = [
    { id: 'room-1', name: 'Frontend Team', createdAt: new Date().toISOString() },
    { id: 'room-2', name: 'Core Engine', createdAt: new Date().toISOString() }
  ];
  try {
    writeJsonAtomic(ROOMS_FILE, defaultRooms);
  } catch (_) {}
  return defaultRooms;
}

function saveRooms(rooms) {
  try {
    writeJsonAtomic(ROOMS_FILE, rooms);
  } catch (err) {
    console.error('[Dewwie] Failed to save rooms:', err);
  }
}

function addRoom(name) {
  const rooms = getRooms();
  const safeName = name?.trim() || `Room ${rooms.length + 1}`;
  const newId = `room-${Date.now().toString(36)}`;
  const newRoom = { id: newId, name: safeName, createdAt: new Date().toISOString() };
  rooms.push(newRoom);
  saveRooms(rooms);
  return newRoom;
}

function removeRoom(id) {
  let rooms = getRooms().filter(r => r.id !== id);
  if (rooms.length === 0) {
    rooms = [{ id: 'room-1', name: 'General Room', createdAt: new Date().toISOString() }];
  }
  saveRooms(rooms);
  return rooms;
}

// -------------------------------------------------------------
// Sessions & Workspaces Management (Local vs Branch)
// -------------------------------------------------------------
// Trailing 500 ms debounce for high-frequency updates (agent status). Cache updates immediately.
let saveWorkspacesTimer = null;
function saveWorkspacesSoon(list) {
  workspacesCache = list;
  if (saveWorkspacesTimer) clearTimeout(saveWorkspacesTimer);
  saveWorkspacesTimer = setTimeout(() => { saveWorkspacesTimer = null; saveWorkspaces(workspacesCache); }, 500);
}

// Settings > Session Persistence. Default on; the renderer sends them via workspace:saveState.
let persistFlagsCache = null;
function persistFlags() {
  if (!persistFlagsCache) {
    const s = getWorkspaceState();
    persistFlagsCache = { restoreScrollback: s.restoreScrollback !== false, persistActiveMesh: s.persistActiveMesh !== false };
  }
  return persistFlagsCache;
}

function saveWorkspaces(list) {
  workspacesCache = list;
  try {
    writeJsonAtomic(WORKSPACES_FILE, list);
  } catch (err) {
    console.error('[Dewwie] Failed to save workspaces:', err);
  }
}

async function getWorkspaces(forceRefresh = false) {
  if (workspacesCache && !forceRefresh) {
    return workspacesCache;
  }
  // Flush a pending debounced save first, so a reload from disk never resurrects older state
  // (e.g. an agent status set <500 ms ago was reverted to idle by an fs.watch-triggered reload).
  if (saveWorkspacesTimer && workspacesCache) {
    clearTimeout(saveWorkspacesTimer);
    saveWorkspacesTimer = null;
    saveWorkspaces(workspacesCache);
  }

  const projects = getProjects();
  let saved = [];
  if (fs.existsSync(WORKSPACES_FILE)) {
    try {
      saved = readJsonSafe(WORKSPACES_FILE, saved);
    } catch (_) {}
  }
  // "Save Mesh Rooms" off: room assignments are not restored across launches (first load only;
  // runtime reloads keep them so the file watcher doesn't wipe live assignments).
  if (!workspacesCache && !persistFlags().persistActiveMesh && Array.isArray(saved)) saved = saved.map(({ roomId, ...rest }) => rest);

  // Preserve in-memory created sessions so they are never lost
  if (workspacesCache && Array.isArray(workspacesCache)) {
    for (const cached of workspacesCache) {
      if (!saved.some(s => s.id === cached.id)) {
        saved.push(cached);
      }
    }
  }

  const allSessions = [];
  const usedPorts = registryPorts(saved);

  for (const proj of projects) {
    // 1. Ensure at least one primary Local session for this project
    const defaultLocalId = `ws-local-${proj.id}`;
    const existingLocal = saved.find(s => s.id === defaultLocalId);

    allSessions.push({
      id: existingLocal?.id || defaultLocalId,
      projectId: proj.id,
      projectName: proj.name,
      repository: proj.name,
      name: existingLocal?.name || `${proj.name} Shell`,
      sessionMode: 'local',
      branch: 'main',
      baseBranch: 'main',
      worktreePath: proj.rootPath,
      roomId: existingLocal?.roomId || undefined,
      agentRole: existingLocal?.agentRole || undefined,
      agentType: existingLocal?.agentType || 'terminal',
      agentStatus: existingLocal?.agentStatus || {
        state: 'idle',
        message: 'Active PowerShell shell ready in project folder',
        timestamp: Date.now(),
      },
      metrics: existingLocal?.metrics || { cpuPercent: 0.8, memoryMb: 85 },
      ports: existingLocal?.ports || [{ service: 'App Dev', port: 5173, status: 'active', url: 'http://localhost:5173' }],
      diffSummary: { filesChanged: 0, additions: 0, deletions: 0 },
      createdAt: existingLocal?.createdAt || new Date().toISOString(),
      lastActivity: 'Just now',
      commitSha: 'HEAD',
      terminalSessionId: `pty-${existingLocal?.id || defaultLocalId}`
    });

    // 2. If project is a Git repository, query live worktrees (branch sessions)
    if (proj.isGitRepo) {
      try {
        const { stdout } = await execGit(['worktree', 'list', '--porcelain'], proj.rootPath);
        if (stdout && stdout.trim()) {
          const blocks = stdout.trim().split(/\n\s*\n/);
          for (const block of blocks) {
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            let worktreePath = '';
            let commitSha = 'HEAD';
            let branch = 'main';

            for (const line of lines) {
              if (line.startsWith('worktree ')) {
                worktreePath = line.replace('worktree ', '').trim().replace(/\//g, '\\');
              } else if (line.startsWith('HEAD ')) {
                commitSha = line.replace('HEAD ', '').trim().substring(0, 7);
              } else if (line.startsWith('branch ')) {
                branch = line.replace('branch refs/heads/', '').trim();
              }
            }

            if (!worktreePath || branch === 'main' || worktreePath.toLowerCase() === proj.rootPath.toLowerCase()) {
              continue; // Primary workspace already covered by local session
            }

            const wsId = `ws-branch-${branch.replace(/[\/\\]/g, '-')}`;
            const existing = saved.find(s => s.id === wsId || s.branch === branch);

            let diffSummary = existing?.diffSummary || { filesChanged: 0, additions: 0, deletions: 0 };
            if (fs.existsSync(worktreePath)) {
              try {
                // 1. Check real uncommitted working changes in worktree
                const statusRes = await execGit(['status', '--porcelain'], worktreePath);
                const hasUncommitted = statusRes.stdout && statusRes.stdout.trim().length > 0;

                if (hasUncommitted) {
                  const uncommittedDiff = await execGit(['diff', 'HEAD', '--numstat'], worktreePath);
                  if (uncommittedDiff.stdout && uncommittedDiff.stdout.trim().length > 0) {
                    const statLines = uncommittedDiff.stdout.trim().split('\n').filter(Boolean);
                    let adds = 0;
                    let dels = 0;
                    for (const s of statLines) {
                      const parts = s.split('\t');
                      adds += parseInt(parts[0], 10) || 0;
                      dels += parseInt(parts[1], 10) || 0;
                    }
                    diffSummary = { filesChanged: statLines.length, additions: adds, deletions: dels, isUncommitted: true, aheadCount: 0 };
                  } else {
                    const count = statusRes.stdout.trim().split('\n').filter(Boolean).length;
                    diffSummary = { filesChanged: count, additions: 0, deletions: 0, isUncommitted: true, aheadCount: 0 };
                  }
                } else {
                  // 2. Clean worktree: check if branch has commits ahead of main
                  const countAhead = await execGit(['rev-list', '--count', 'main..HEAD'], worktreePath);
                  const ahead = parseInt(countAhead.stdout?.trim() || '0', 10);
                  if (ahead > 0) {
                    // Use triple dot to diff only branch commits from merge base
                    const branchDiff = await execGit(['diff', 'main...HEAD', '--numstat'], worktreePath);
                    if (branchDiff.stdout) {
                      const statLines = branchDiff.stdout.trim().split('\n').filter(Boolean);
                      let adds = 0;
                      let dels = 0;
                      for (const s of statLines) {
                        const parts = s.split('\t');
                        adds += parseInt(parts[0], 10) || 0;
                        dels += parseInt(parts[1], 10) || 0;
                      }
                      diffSummary = { filesChanged: statLines.length, additions: adds, deletions: dels, isUncommitted: false, aheadCount: ahead };
                    }
                  } else {
                    diffSummary = { filesChanged: 0, additions: 0, deletions: 0, isUncommitted: false, aheadCount: 0 };
                  }
                }
              } catch (_) {
                diffSummary = { filesChanged: 0, additions: 0, deletions: 0 };
              }
            }

            allSessions.push({
              id: wsId,
              projectId: proj.id,
              projectName: proj.name,
              repository: proj.name,
              name: existing?.name || branch,
              sessionMode: 'branch',
              branch: branch,
              baseBranch: 'main',
              worktreePath: worktreePath,
              roomId: existing?.roomId || undefined,
              agentRole: existing?.agentRole || undefined,
              agentType: existing?.agentType || 'terminal',
              agentStatus: existing?.agentStatus || {
                state: 'idle',
                message: 'Branch worktree ready',
                timestamp: Date.now(),
              },
              metrics: existing?.metrics || { cpuPercent: 0.6, memoryMb: 75 },
              ports: existing?.ports || await (async () => { const p = await allocatePort(usedPorts); return [{ service: 'App Dev', port: p, status: 'active', url: `http://localhost:${p}` }]; })(),
              diffSummary,
              createdAt: existing?.createdAt || new Date().toISOString(),
              lastActivity: 'Just now',
              commitSha: commitSha,
              terminalSessionId: `pty-${wsId}`
            });
          }
        }
      } catch (err) {
        console.error(`Error querying git worktrees for ${proj.name}:`, err);
      }
    }

    // 3. Include any additional saved local sessions for this project
    const otherSavedSessions = saved.filter(s => s.projectId === proj.id && s.id !== defaultLocalId && !s.id.startsWith('ws-branch-'));
    const samePath = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
    for (const other of otherSavedSessions) {
      // One identity per worktree: skip a saved branch record when the worktree scan already listed it
      // (its name/role/room/ports were carried over above). Local sessions legitimately share the project
      // folder (extra terminals), so they are never deduped by path.
      const scannedTwin = other.sessionMode === 'branch' && allSessions.some((a) => a.sessionMode === 'branch' &&
        (samePath(a.worktreePath, other.worktreePath) || (a.branch && a.branch === other.branch)));
      if (scannedTwin) continue;
      if (!allSessions.some(a => a.id === other.id)) {
        allSessions.push(other);
      }
    }
  }

  saveWorkspaces(allSessions);
  return allSessions;
}

// -------------------------------------------------------------
// Inter-Agent Room & Swarm Mesh Communication
// -------------------------------------------------------------
function getRoomMessages(roomId) {
  let list = [];
  if (fs.existsSync(ROOM_MESSAGES_FILE)) {
    try {
      list = readJsonSafe(ROOM_MESSAGES_FILE, list);
    } catch (_) {}
  }
  if (!roomId || roomId === 'all') return list;
  return list.filter(m => !m.roomId || m.roomId === roomId);
}

function saveRoomMessage(message) {
  const list = getRoomMessages();
  list.push(message);
  if (list.length > 1000) list.splice(0, list.length - 1000);
  writeJsonAtomic(ROOM_MESSAGES_FILE, list);

  // Broadcast to Electron window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('room:message', message);
  }

  // (Removed: leftover WebSocket fan-out from the pre-IPC port servers. Sessions have no `subscribers`
  // and `WebSocket` is not defined here, so it threw on every room message while any terminal was open.)

  return message;
}

// OSC 7501 (status) / 7502 (room message) from PTY output, via the tested pure parser in osc.cjs.
// Output is untrusted (any `cat`-ed file can contain these bytes), so: sender = the emitting session,
// role = that session's stored agentRole, 7502 rate-limited per session, split chunks reassembled.
const oscParsers = new Map();   // workspaceId -> feed(chunk)
const oscLimiters = new Map();  // workspaceId -> allow()
function parseOsc(chunk, workspaceId) {
  if (!oscParsers.has(workspaceId)) {
    oscParsers.set(workspaceId, createOscParser());
    oscLimiters.set(workspaceId, createRateLimiter(5, 10000));
  }
  for (const ev of oscParsers.get(workspaceId)(chunk)) {
    if (ev.kind === 'status') {
      broadcastAgentStatus(workspaceId, ev.state, ev.msg);
      continue;
    }
    if (!oscLimiters.get(workspaceId)()) continue;
    const ws = (workspacesCache || []).find((w) => w.id === workspaceId);
    saveRoomMessage({
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      roomId: 'general',
      fromSessionId: workspaceId,
      fromSessionName: ws?.name || workspaceId,
      fromRole: ws?.agentRole === 'lead' ? 'lead' : 'worker',
      target: ev.to,
      type: ev.type,
      content: ev.msg,
      timestamp: Date.now(),
    });
  }
}

async function broadcastAgentStatus(workspaceId, state, message) {
  const list = await getWorkspaces();
  const ws = list.find(w => w.id === workspaceId);
  if (ws) {
    ws.agentStatus = {
      state: state || 'working',
      message: message || '',
      timestamp: Date.now()
    };
    saveWorkspacesSoon(list); // debounced: this runs from the PTY data path
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent:status', { workspaceId, state, message });
  }
}

// -------------------------------------------------------------
// Real Native PTY Supervisor via node-pty
// -------------------------------------------------------------
function getOrCreatePty(workspaceId, cwd) {
  if (activePtys.has(workspaceId)) {
    return activePtys.get(workspaceId);
  }

  const workDir = (cwd && fs.existsSync(cwd)) ? cwd : defaultFallbackDir();
  const sessionDir = path.join(SESSIONS_DIR, workspaceId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const scrollbackPath = path.join(sessionDir, 'scrollback.bin');

  let shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  let shellArgs = process.platform === 'win32' ? ['-NoLogo'] : [];

  const envPs1 = path.join(workDir, '.dewwie', 'dewwie_env.ps1');
  if (process.platform === 'win32' && fs.existsSync(envPs1)) {
    shellArgs = ['-NoLogo', '-NoExit', '-Command', `if (Test-Path '${envPs1}') { . '${envPs1}' }`];
  }

  console.log(`[PTY] Spawning rock-solid native shell '${shell}' for ${workspaceId} in: ${workDir}`);

  const agentBinPath = `${path.join(os.homedir(), '.local', 'bin')};${path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin')};${path.join(__dirname, '../../cli')}`;

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 120,
    rows: 32,
    cwd: workDir,
    // ConPTY: WinPTY scrapes the console screen buffer and drops OSC sequences, so `dewwie status` (OSC 7501)
    // and OSC 7502 never reached the app on Windows. Verified on Windows 11 22631: ConPTY passes both through.
    useConpty: true,
    env: {
      ...process.env,
      PATH: `${agentBinPath};${process.env.PATH || ''}`,
      TERM: 'xterm-256color',
      SWARMHERD_WORKSPACE: workspaceId,
      DEWWIE_WORKSPACE_ID: workspaceId,
      DEWWIE_ROOM_ID: 'general',
      DEWWIE_PROJECT_DIR: workDir,
    }
  });

  // Pre-load and cap historical scrollback into memory buffer (max 128KB, keeps app fast and lightweight)
  let inMemoryBuffer = Buffer.alloc(0);
  if (persistFlags().restoreScrollback && fs.existsSync(scrollbackPath)) {
    try {
      const stats = fs.statSync(scrollbackPath);
      if (stats.size > 131072) {
        const fd = fs.openSync(scrollbackPath, 'r');
        const tempBuf = Buffer.alloc(65536);
        fs.readSync(fd, tempBuf, 0, 65536, stats.size - 65536);
        fs.closeSync(fd);
        const safe = cutAtSafeBoundary(tempBuf, 0);
        fs.writeFileSync(scrollbackPath, safe);
        inMemoryBuffer = safe;
      } else {
        inMemoryBuffer = fs.readFileSync(scrollbackPath);
      }
    } catch (_) {}
  }

  let scrollbackStream = null; // opened lazily, only while "Save Scrollback" is on

  const sessionObj = {
    ptyProcess,
    scrollbackPath,
    cwd: workDir,
    isAttached: false,
    getBuffer: () => inMemoryBuffer,
    // Display-only text (e.g. room banners): goes to the screen buffer, never to the shell's stdin.
    appendDisplay: (text) => {
      inMemoryBuffer = Buffer.concat([inMemoryBuffer, Buffer.from(text)]);
    },
  };

  ptyProcess.onData((data) => {
    // 1. Write to append-only disk scrollback & in-memory rolling buffer
    if (persistFlags().restoreScrollback) {
      if (!scrollbackStream) scrollbackStream = fs.createWriteStream(scrollbackPath, { flags: 'a' });
      scrollbackStream.write(data);
    }
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    inMemoryBuffer = Buffer.concat([inMemoryBuffer, dataBuf]);
    if (inMemoryBuffer.length > 131072) {
      inMemoryBuffer = trimScrollback(inMemoryBuffer, 65536);
    }

    // 2. Intercept OSC 7501
    parseOsc(data, workspaceId);

    // 3. Direct in-memory IPC broadcast to renderer (only if attached to prevent double-echo)
    if (mainWindow && !mainWindow.isDestroyed() && sessionObj.isAttached) {
      mainWindow.webContents.send('terminal:data', { workspaceId, data: data.toString() });
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] Shell for ${workspaceId} exited with code ${exitCode}`);
    activePtys.delete(workspaceId);
    oscParsers.delete(workspaceId);
    oscLimiters.delete(workspaceId);
  });

  activePtys.set(workspaceId, sessionObj);
  return sessionObj;
}

// -------------------------------------------------------------
// Real Native In-Memory IPC Terminal Controller (Zero Ports)
// -------------------------------------------------------------
ipcMain.handle('terminal:attach', async (_, { workspaceId }) => {
  if (!workspaceId) return '';
  const list = await getWorkspaces();
  const matched = list.find(w => w.id === workspaceId);
  const cwd = matched ? matched.worktreePath : (list[0]?.worktreePath || defaultFallbackDir());
  const session = getOrCreatePty(workspaceId, cwd);

  session.isAttached = true;
  const memBuf = session.getBuffer ? session.getBuffer() : null;
  if (memBuf && memBuf.length > 0) {
    return memBuf.toString('utf-8');
  } else if (persistFlags().restoreScrollback && fs.existsSync(session.scrollbackPath)) {
    try {
      const history = trimScrollback(fs.readFileSync(session.scrollbackPath), 65536).toString('utf-8');
      if (history.length === 0) {
        return `\x1b[38;5;244mDewwie Native PTY [${matched?.agentType || 'shell'}] • ${cwd}\x1b[0m\r\n`;
      }
      return history;
    } catch (_) {}
  }
  return '';
});

ipcMain.on('terminal:write', (_, { workspaceId, data }) => {
  if (!workspaceId || !data) return;
  const session = activePtys.get(workspaceId);
  if (session && session.ptyProcess) {
    try {
      session.ptyProcess.write(data);
    } catch (err) {
      console.error('[Dewwie PTY] Write error:', err);
    }
  }
});

ipcMain.on('terminal:resize', (_, { workspaceId, cols, rows }) => {
  if (!workspaceId || !cols || !rows) return;
  const session = activePtys.get(workspaceId);
  if (session && session.ptyProcess && cols > 0 && rows > 0) {
    try {
      if (session.lastCols !== cols || session.lastRows !== rows) {
        session.lastCols = cols;
        session.lastRows = rows;
        session.ptyProcess.resize(cols, rows);
      }
    } catch (_) {}
  }
});

ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false);

// -------------------------------------------------------------
// Electron Window Creation
// -------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  const savedState = getWorkspaceState();
  const width = (savedState.windowWidth && savedState.windowWidth >= 1024) ? savedState.windowWidth : 1440;
  const height = (savedState.windowHeight && savedState.windowHeight >= 680) ? savedState.windowHeight : 920;

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#09090b',
    title: 'Dewwie - Autonomous AI Agent IDE',
    frame: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
    ...(fs.existsSync(path.join(__dirname, '../public/icon.png')) ? { icon: path.join(__dirname, '../public/icon.png') } : {}),
  });

  if (savedState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximizedChange', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximizedChange', false);
  });
  mainWindow.on('restore', () => {
    mainWindow?.webContents.send('window:maximizedChange', false);
  });
  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximizedChange', mainWindow.isMaximized());
    }
  });

  // Smoke test hook (tests/smoke_electron.py): prove the app actually boots and React renders, then exit.
  if (process.env.DEWWIE_SMOKE_TEST === '1') {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const rendered = await mainWindow.webContents
        .executeJavaScript('document.getElementById("root")?.childElementCount || 0')
        .catch(() => 0);
      console.log(`DEWWIE_SMOKE ${rendered > 0 ? 'OK' : 'EMPTY'} root_children=${rendered}`);
      app.exit(rendered > 0 ? 0 : 3);
    });
  }

  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const isMax = mainWindow.isMaximized();
        const bounds = mainWindow.getBounds();
        saveWorkspaceState({
          isMaximized: isMax,
          windowWidth: isMax ? undefined : bounds.width,
          windowHeight: isMax ? undefined : bounds.height,
        });
      } catch (_) {}
    }
  });

  const distIndex = path.join(__dirname, '../dist/index.html');
  const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

  if (isDev) {
    const req = http.get('http://127.0.0.1:5173', (res) => {
      if (res.statusCode < 400) {
        mainWindow.loadURL('http://127.0.0.1:5173');
      } else if (fs.existsSync(distIndex)) {
        mainWindow.loadFile(distIndex);
      }
    });
    req.on('error', () => {
      if (fs.existsSync(distIndex)) {
        mainWindow.loadFile(distIndex);
      }
    });
  } else {
    // Production launch: Prioritize compiled bundle instantly
    if (fs.existsSync(distIndex)) {
      mainWindow.loadFile(distIndex);
    } else {
      mainWindow.loadURL('http://127.0.0.1:5173');
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Helper: Scan workspace directory tree
function scanDir(dirPath, relativeRoot = '', maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dirPath)) return [];
  const entries = [];
  const ignored = new Set(['.git', 'node_modules', 'dist', '.worktrees', '.DS_Store', 'Thumbs.db', '.gemini']);
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (ignored.has(item.name)) continue;
      const fullPath = path.join(dirPath, item.name);
      const relPath = relativeRoot ? `${relativeRoot}/${item.name}` : item.name;
      if (item.isDirectory()) {
        const children = scanDir(fullPath, relPath, maxDepth, currentDepth + 1);
        entries.push({
          name: item.name,
          type: 'folder',
          path: relPath,
          children,
        });
      } else {
        const stats = fs.statSync(fullPath);
        const sizeFormatted = stats.size > 1024 * 1024
          ? (stats.size / (1024 * 1024)).toFixed(1) + ' MB'
          : stats.size > 1024
          ? (stats.size / 1024).toFixed(1) + ' KB'
          : stats.size + ' B';
        entries.push({
          name: item.name,
          type: 'file',
          path: relPath,
          size: sizeFormatted,
        });
      }
    }
  } catch (e) {
    console.error('Scan dir error:', e);
  }
  return entries;
}

// IPC Handlers
// Renderer-supplied paths are confined to registered project roots and known session worktrees.
function allowedFsRoots() {
  const roots = getProjects().map((p) => p.rootPath);
  for (const w of workspacesCache || []) if (w.worktreePath) roots.push(w.worktreePath);
  return roots;
}

ipcMain.handle('fs:tree', (_, { targetPath } = {}) => {
  const root = resolveInsideRoots(allowedFsRoots(), targetPath || defaultFallbackDir());
  return root && fs.existsSync(root) ? scanDir(root) : [];
});

ipcMain.handle('fs:read', (_, { filePath, basePath } = {}) => {
  const full = resolveInsideRoots(allowedFsRoots(), basePath || defaultFallbackDir(), filePath);
  if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return { error: 'File not found or outside workspace' };
  }
  try {
    const content = fs.readFileSync(full, 'utf-8');
    return { content };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
  return true;
});

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  } else {
    mainWindow.maximize();
    return true;
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
  return true;
});

// IPC Handlers: Projects
ipcMain.handle('project:pickFolder', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Project Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('projects:get', () => getProjects());

ipcMain.handle('projects:add', (_, params) => addProject(params));

ipcMain.handle('projects:remove', (_, { id }) => removeProject(id));

// IPC Handlers: Workspaces & Sessions
ipcMain.handle('app:getWsPort', () => 0);
ipcMain.handle('workspaces:get', (_, forceRefresh) => getWorkspaces(forceRefresh));

ipcMain.handle('sessions:create', async (_, { projectId, name, sessionMode, branch, baseBranch, agentType, roomId }) => {
  const projects = getProjects();
  let proj = projects.find(p => p.id === projectId);
  if (!proj) {
    proj = projects[0]; // getProjects() always yields at least the portable fallback project
  }
  const rootDir = proj.rootPath;
  const mode = sessionMode || (branch ? 'branch' : 'local');
  const safeName = name?.trim() || (mode === 'branch' ? branch : `${agentType || 'Terminal'} Session`);

  let targetPath = rootDir;
  let allocatedPort = 5173;
  const list = await getWorkspaces();

  if (mode === 'branch' && branch) {
    const safeFolder = branch.replace(/[\/\\]/g, '-');
    targetPath = path.join(rootDir, '.worktrees', safeFolder);
    const gitRes = await execGit(['worktree', 'add', '-b', branch, targetPath, baseBranch || 'main'], rootDir);
    console.log('[GIT WORKTREE]', gitRes.stdout, gitRes.stderr);

    allocatedPort = await allocatePort(registryPorts(list));
    const envContent = `PORT=${allocatedPort}\nAPI_PORT=${allocatedPort + 3000}\n`;
    try {
      fs.writeFileSync(path.join(targetPath, '.env.local'), envContent, 'utf-8');
    } catch (_) {}
  }

  const newSession = {
    id: mode === 'branch' && branch ? `ws-branch-${String(branch).replace(/[\/\\]/g, '-')}` : `ws-${Date.now().toString(36)}`,
    projectId: proj.id,
    projectName: proj.name,
    repository: proj.name,
    name: safeName,
    sessionMode: mode,
    branch: mode === 'branch' ? branch : 'main',
    baseBranch: baseBranch || 'main',
    worktreePath: targetPath,
    agentType: agentType || 'terminal',
    roomId: roomId || undefined,
    agentStatus: {
      state: 'idle',
      message: mode === 'local' ? 'Local shell ready in project folder' : 'Branch worktree ready',
      timestamp: Date.now()
    },
    metrics: { cpuPercent: 0.5, memoryMb: 45 },
    ports: [{ service: 'App Dev', port: allocatedPort, status: 'allocated', url: `http://localhost:${allocatedPort}` }],
    diffSummary: { filesChanged: 0, additions: 0, deletions: 0 },
    createdAt: new Date().toISOString(),
    lastActivity: 'Just now',
    commitSha: 'HEAD',
    terminalSessionId: `pty-${Date.now().toString(36)}`
  };

  list.push(newSession);
  saveWorkspaces(list);

  // Pre-spawn and warm the PTY shell process immediately so it's live before WebSocket connects
  try {
    getOrCreatePty(newSession.id, targetPath);
  } catch (err) {
    console.error('[Dewwie] Failed to pre-warm PTY for session:', err);
  }

  return newSession;
});

ipcMain.handle('sessions:delete', async (_, { sessionId }) => {
  if (!sessionId) return false;
  const list = await getWorkspaces();
  const filtered = list.filter(w => w.id !== sessionId);
  saveWorkspaces(filtered);

  if (activePtys.has(sessionId)) {
    const session = activePtys.get(sessionId);
    try {
      session.ptyProcess.kill();
    } catch (_) {}
    activePtys.delete(sessionId);
  }
  return true;
});

ipcMain.handle('sessions:rename', async (_, { sessionId, newName }) => {
  if (!sessionId || !newName) return false;
  const list = await getWorkspaces();
  const ws = list.find(w => w.id === sessionId);
  if (ws) {
    ws.name = newName.trim();
    saveWorkspaces(list);
    return true;
  }
  return false;
});

ipcMain.handle('sessions:setRoom', async (_, { sessionId, roomId }) => {
  if (!sessionId) return { success: false, message: 'Missing sessionId' };
  const list = await getWorkspaces();
  const ws = list.find(w => w.id === sessionId);
  if (ws) {
    ws.roomId = roomId || undefined;
    saveWorkspaces(list);
    mainWindow?.webContents.send('workspaces:updated', list);
    return { success: true, workspace: ws };
  }
  return { success: false, message: 'Session not found' };
});

ipcMain.handle('rooms:get', () => getRooms());

ipcMain.handle('rooms:create', (_, { name }) => {
  const newRoom = addRoom(name);
  mainWindow?.webContents.send('rooms:updated', getRooms());
  return newRoom;
});

ipcMain.handle('rooms:delete', async (_, { id }) => {
  const rooms = removeRoom(id);
  // Unassign any sessions that were assigned to this room
  const list = await getWorkspaces();
  let modified = false;
  for (const ws of list) {
    if (ws.roomId === id) {
      delete ws.roomId;
      modified = true;
    }
  }
  if (modified) {
    saveWorkspaces(list);
    mainWindow?.webContents.send('workspaces:updated', list);
  }
  mainWindow?.webContents.send('rooms:updated', rooms);
  return rooms;
});

ipcMain.handle('workspaces:create', async (_, { name, branch, baseBranch, repository }) => {
  const safeFolder = branch.replace(/[\/\\]/g, '-');
  const baseDir = (repository && getProjects().find(p => p.name === repository)?.rootPath) || defaultFallbackDir();
  const worktreePath = path.join(baseDir, '.worktrees', safeFolder);

  // Run real git worktree add
  const gitRes = await execGit(['worktree', 'add', '-b', branch, worktreePath, baseBranch || 'main'], baseDir);
  console.log('[GIT WORKTREE]', gitRes.stdout, gitRes.stderr);

  // Allocate dynamic port
  const list = await getWorkspaces();
  const nextPort = await allocatePort(registryPorts(list));
  const envContent = `PORT=${nextPort}\nAPI_PORT=${nextPort + 3000}\n`;
  try {
    fs.writeFileSync(path.join(worktreePath, '.env.local'), envContent, 'utf-8');
  } catch (_) {}

  const newWs = {
    id: `ws-branch-${String(branch).replace(/[\/\\]/g, '-')}`,
    repository: repository || path.basename(baseDir),
    name: name || branch,
    sessionMode: 'branch',
    branch,
    baseBranch: baseBranch || 'main',
    worktreePath,
    agentType: 'claude-code',
    agentStatus: { state: 'idle', message: 'Worktree ready', timestamp: Date.now() },
    metrics: { cpuPercent: 0.5, memoryMb: 45 },
    ports: [{ service: 'App Dev', port: nextPort, status: 'allocated', url: `http://localhost:${nextPort}` }],
    diffSummary: { filesChanged: 0, additions: 0, deletions: 0 },
    createdAt: new Date().toISOString(),
    lastActivity: 'Just now',
    commitSha: 'HEAD',
    terminalSessionId: `pty-${branch}`
  };

  list.push(newWs);
  saveWorkspaces(list);
  return newWs;
});

ipcMain.handle('git:diff', async (_, { worktreePath, baseBranch, sessionMode }) => {
  const cwd = (worktreePath && fs.existsSync(worktreePath)) ? worktreePath : defaultFallbackDir();
  const target = sessionMode === 'local' ? 'HEAD' : (baseBranch || 'main');
  const res = await execGit(['diff', target, '--numstat'], cwd);
  const patchRes = await execGit(['diff', '-u', target], cwd);

  return {
    rawPatch: patchRes.stdout,
    numstat: res.stdout,
  };
});

ipcMain.handle('git:merge', async (_, { worktreePath, branch, baseBranch, commitMsg, repo }) => {
  const baseDir = (repo && getProjects().find(p => p.name === repo)?.rootPath) || 
    (worktreePath && path.dirname(path.dirname(worktreePath))) || 
    defaultFallbackDir();
  const checkoutRes = await execGit(['checkout', baseBranch || 'main'], baseDir);
  if (checkoutRes.code !== 0) {
    // Never merge into whatever branch happens to be checked out (e.g. dirty working tree).
    return { success: false, message: `Could not check out ${baseBranch || 'main'}: ${checkoutRes.stderr || checkoutRes.stdout}`.trim() };
  }
  const mergeRes = await execGit(['merge', '--no-ff', branch, '-m', commitMsg || `Merge ${branch}`], baseDir);
  if (mergeRes.code === 0 && worktreePath && fs.existsSync(worktreePath)) {
    try {
      await execGit(['worktree', 'remove', worktreePath], baseDir);
    } catch (_) {}
  }
  return { success: mergeRes.code === 0, message: mergeRes.stdout || mergeRes.stderr };
});

ipcMain.handle('ide:open', (_, { ide, targetPath }) => {
  const bin = ide === 'cursor' ? 'cursor' : ide === 'zed' ? 'zed' : 'code';
  const p = targetPath || defaultFallbackDir();
  if (!fs.existsSync(p)) return false;
  // IDE launchers are .cmd shims, so cmd.exe is required; quote the path so `&` etc. in folder
  // names stay literal (Windows paths cannot contain `"`). `bin` comes from the fixed list above.
  spawn('cmd.exe', ['/d', '/s', '/c', `"${bin} "${p}""`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true, windowsHide: true });
  return true;
});

// Room & Inter-Agent IPC
ipcMain.handle('room:getMessages', (_, { roomId }) => {
  return getRoomMessages(roomId);
});

ipcMain.handle('room:postMessage', async (_, data) => {
  const list = await getWorkspaces();
  const senderWs = list.find(w => w.id === data.fromSessionId);
  const msgObj = {
    id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    roomId: data.roomId || 'general',
    fromSessionId: data.fromSessionId || 'human',
    fromSessionName: data.fromSessionName || senderWs?.name || 'User',
    fromRole: data.fromRole || (senderWs?.agentRole || 'worker'),
    target: data.target || '@all',
    type: data.type || 'chat',
    content: data.content || '',
    timestamp: Date.now(),
  };

  saveRoomMessage(msgObj);

  // If target mentions a specific session, also inject an unobtrusive banner into that session's PTY!
  if (data.target && data.target.startsWith('@') && data.target !== '@all') {
    const targetName = data.target.replace('@', '').toLowerCase();
    const targetWs = list.find(w => 
      w.name.toLowerCase() === targetName || 
      w.branch?.toLowerCase() === targetName ||
      w.id.toLowerCase() === targetName
    );
    if (targetWs && activePtys.has(targetWs.id)) {
      const ptySess = activePtys.get(targetWs.id);
      // Display-only. ptyProcess.write() is the shell's stdin, so the banner used to be submitted as
      // input to the target agent/shell. Control chars are stripped so content can't inject escapes.
      const clean = (s) => String(s).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
      const banner = `\r\n\x1b[36m[Dewwie Room Message from ${clean(msgObj.fromSessionName)} (${clean(msgObj.fromRole)})]:\x1b[0m ${clean(msgObj.content)}\r\n`;
      ptySess.appendDisplay?.(banner);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', { workspaceId: targetWs.id, data: banner });
      }
    }
  }

  return msgObj;
});

// -------------------------------------------------------------
// Workspace & Layout State Persistence (Zero-Loss Restore)
// -------------------------------------------------------------
function getWorkspaceState() {
  if (fs.existsSync(WORKSPACE_STATE_FILE)) {
    try {
      const s = readJsonSafe(WORKSPACE_STATE_FILE, null);
      if (s) return s;
    } catch (_) {}
  }
  return {
    activeProjectId: 'proj-dewwie',
    activeWorkspaceId: 'ws-local-proj-dewwie',
    activeTab: 'terminal',
    openTabIds: ['ws-local-proj-dewwie'],
    isSplitView: false,
    sidebarOpen: true,
    sidebarWidth: 260,
    rightPanelOpen: false,
    rightPanelWidth: 320,
    rightPanelView: 'room',
    leadSessionId: null,
    theme: 'zinc',
  };
}

function saveWorkspaceState(state) {
  try {
    const current = getWorkspaceState();
    const updated = { ...current, ...state, lastSaved: Date.now() };
    writeJsonAtomic(WORKSPACE_STATE_FILE, updated);
    persistFlagsCache = null;
    return updated;
  } catch (err) {
    console.error('Error saving workspace state:', err);
    return null;
  }
}

ipcMain.handle('workspace:getState', () => {
  return getWorkspaceState();
});

ipcMain.handle('workspace:saveState', (_, state) => {
  return saveWorkspaceState(state);
});

ipcMain.handle('session:setRole', async (_, { sessionId, role }) => {
  const list = await getWorkspaces();
  const ws = list.find(w => w.id === sessionId);
  if (ws) {
    ws.agentRole = role;
    saveWorkspaces(list);
    return true;
  }
  return false;
});

// -------------------------------------------------------------
// Autonomous Lead Task Delegation
// -------------------------------------------------------------
ipcMain.handle('task:delegate', async (_, { task, agent, repo, baseBranch }) => {
  const repository = repo || 'exbytelab';
  const cleanTask = (task || '').trim();
  const slug = cleanTask.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 24) || 'task';
  const branch = `feat/${slug}-${Math.floor(Date.now() / 1000) % 10000}`;
  const safeFolder = branch.replace(/[\/\\]/g, '-');
  const baseDir = (repo && getProjects().find(p => p.name === repo)?.rootPath) || defaultFallbackDir();
  const worktreePath = path.join(baseDir, '.worktrees', safeFolder);

  // 1. Git worktree creation
  await execGit(['worktree', 'add', '-b', branch, worktreePath, baseBranch || 'main'], baseDir);

  // 2. Allocate dynamic port
  const list = await getWorkspaces();
  const assignedPort = await allocatePort(registryPorts(list));
  try {
    fs.mkdirSync(worktreePath, { recursive: true });
    fs.writeFileSync(path.join(worktreePath, '.env.local'), `PORT=${assignedPort}\nAPI_PORT=${assignedPort + 3000}\n`, 'utf-8');
  } catch (_) {}

  // 3. Launch in herdr-core if available
  const hcBin = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'herdr-core', 'hc.exe');
  let hcId = null;
  if (fs.existsSync(hcBin)) {
    try {
      spawn(hcBin, ['run', '--bg', '--name', branch, '--cwd', worktreePath, agent || 'dewwie-worker', cleanTask], { stdio: 'ignore' });
      hcId = branch;
    } catch (_) {}
  }

  // 4. Register new workspace
  const newWs = {
    id: `ws-branch-${String(branch).replace(/[\/\\]/g, '-')}`,
    repository,
    name: branch,
    sessionMode: 'branch',
    branch,
    baseBranch: baseBranch || 'main',
    worktreePath,
    agentRole: 'worker',
    agentType: agent || 'dewwie-worker',
    agentStatus: {
      state: 'working',
      message: `Autonomous task: ${cleanTask.substring(0, 40)}...`,
      timestamp: Date.now()
    },
    metrics: { cpuPercent: 0.5, memoryMb: 45 },
    ports: [{ service: 'App Dev', port: assignedPort, status: 'allocated', url: `http://localhost:${assignedPort}` }],
    diffSummary: { filesChanged: 0, additions: 0, deletions: 0 },
    createdAt: new Date().toISOString(),
    lastActivity: 'Just now',
    commitSha: 'HEAD',
    terminalSessionId: hcId || `pty-${branch}`
  };

  list.push(newWs);
  saveWorkspaces(list);

  // 5. Broadcast task_delegate message to Room Mesh
  const msgObj = {
    id: `msg-del-${Date.now().toString(36)}`,
    roomId: 'general',
    fromSessionId: 'lead',
    fromSessionName: 'Local Main Shell',
    fromRole: 'lead',
    target: `@${branch}`,
    type: 'task_delegate',
    content: `Task delegated to @${branch}: ${cleanTask}`,
    timestamp: Date.now()
  };
  saveRoomMessage(msgObj);

  return newWs;
});

// -------------------------------------------------------------
// Quality Gate: Worktree Automated Test Runner
// -------------------------------------------------------------
ipcMain.handle('worktree:runTests', async (_, { worktreePath, repo }) => {
  const targetDir = worktreePath || (repo && getProjects().find(p => p.name === repo)?.rootPath) || defaultFallbackDir();
  return new Promise((resolve) => {
    // Check whether tests/run_all_tests.py, package.json test, or cargo test applies
    // No shell for user-influenced values: targetDir is only ever a cwd or a single argv entry.
    // npm is a .cmd shim on Windows, so it goes through cmd.exe with a fixed command string.
    let cmd = process.platform === 'win32' ? 'cmd.exe' : 'npm';
    let args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm test -- --run'] : ['test', '--', '--run'];
    if (fs.existsSync(path.join(targetDir, 'tests', 'run_all_tests.py'))) {
      cmd = 'python';
      args = [path.join(targetDir, 'tests', 'run_all_tests.py')];
    } else if (fs.existsSync(path.join(targetDir, 'Cargo.toml'))) {
      cmd = 'cargo';
      args = ['test'];
    }

    const testProc = spawn(cmd, args, { cwd: targetDir, windowsHide: true });
    let stdout = '';
    let stderr = '';

    testProc.stdout.on('data', (d) => { stdout += d.toString(); });
    testProc.stderr.on('data', (d) => { stderr += d.toString(); });

    testProc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: (stdout + '\n' + stderr).trim() || `Tests completed with exit code ${code}`
      });
    });

    testProc.on('error', (err) => {
      resolve({ success: false, output: `Execution error: ${err.message}` });
    });
  });
});

// -------------------------------------------------------------
// Terminal Stdin Input Dispatcher
// -------------------------------------------------------------
ipcMain.handle('terminal:sendInput', async (_, { workspaceId, text, pressEnter = true }) => {
  if (!workspaceId || !text) return false;
  const list = await getWorkspaces();
  const targetClean = workspaceId.replace('@', '').toLowerCase();
  const ws = list.find(w => 
    w.id === workspaceId || 
    w.name.toLowerCase() === targetClean || 
    w.branch?.toLowerCase() === targetClean
  );
  const targetId = ws ? ws.id : workspaceId;
  const session = getOrCreatePty(targetId, ws?.worktreePath);
  if (session && session.ptyProcess) {
    session.ptyProcess.write(text + (pressEnter ? '\r' : ''));
    return true;
  }
  return false;
});

// -------------------------------------------------------------
// Multi-Agent Mesh Skill & Configuration Synchronizer
// -------------------------------------------------------------
ipcMain.handle('mesh:syncSkills', async (_, { projectPath }) => {
  const projects = getProjects();
  const targetDir = projectPath || (projects[0]?.rootPath) || defaultFallbackDir();
  try {
    const dewwieDir = path.join(targetDir, '.dewwie');
    const skillsDir = path.join(dewwieDir, 'skills', 'dewwie-mesh');
    const geminiRulesDir = path.join(targetDir, '.gemini', 'rules');

    fs.mkdirSync(dewwieDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(geminiRulesDir, { recursive: true });

    const protocolDoc = `# Dewwie Multi-Agent Room Protocol\n\nThis repository is running inside the **Dewwie Multi-Agent IDE & Terminal Workspace**.\nYou collaborate with other AI agents (Claude Code, Google Antigravity, Terminal Shells) and the human developer in real-time through the Dewwie Room Mesh.\n\n## Core Commands (Available in your Shell & CLI)\n1. **Broadcast to Room**:\n   dewwie room send "Your message" --target @all\n   dewwie room send "Review request for PR" --target @lead --type review_request\n   dewwie room send "Please run e2e verification" --target @antigravity --type task_delegate\n\n2. **Report Live Progress (OSC 7501)**:\n   Report your state so the Dewwie IDE Process Tray animates your session status:\n   - While working: \`dewwie status working "Refactoring authentication handler"\`\n   - If blocked: \`dewwie status blocked "Needs confirmation on schema changes"\`\n   - When finished: \`dewwie status done "All tests passed and code committed"\`\n\n3. **Inspect Peer Agents**:\n   - \`dewwie room list\`   (views the last 10 messages from peer agents)\n   - \`dewwie room agents\` (lists active agents in the room and who is LEAD)\n\n4. **Multi-Agent Collaboration Rules**:\n   - Always broadcast when you finish a task, introduce a breaking change, or need a peer review.\n   - Tag peers by name: \`@lead\`, \`@antigravity\`, \`@claude\`, or \`@all\`.\n`;

    const skillDoc = `---\nname: dewwie-mesh\ndescription: Broadcast and collaborate with peer AI agents across Dewwie IDE workspaces and Git worktrees.\n---\n\n# Dewwie Mesh Skill\n\nUse this skill to communicate with other agents running in the Dewwie IDE room.\n\n## Instructions\n1. When you start a task, inform the room:\n   \`dewwie room send "Starting work on <task>" --target @all\`\n   \`dewwie status working "<task summary>"\`\n\n2. When you finish, hand off to peer agents or request lead review:\n   \`dewwie room send "Completed <task>. Diffs are ready for review." --target @lead --type review_request\`\n   \`dewwie status done "Completed <task>"\`\n\n3. When you encounter a block:\n   \`dewwie room send "Blocked on: <reason>" --target @lead\`\n   \`dewwie status blocked "<reason>"\`\n`;

    const ps1Doc = `# Dewwie PowerShell Collaboration Profile\nfunction broadcast($msg, $target = "@all") {\n    dewwie.exe room send "$msg" --target $target\n}\nfunction ask-lead($msg) {\n    dewwie.exe room send "$msg" --target "@lead" --type "review_request"\n}\nfunction status-report($state, $msg) {\n    dewwie.exe status "$state" "$msg"\n}\nfunction mesh-status {\n    dewwie.exe room agents\n}\nfunction mesh-listen {\n    dewwie.exe room list\n}\n`;

    fs.writeFileSync(path.join(dewwieDir, 'ROOM_PROTOCOL.md'), protocolDoc, 'utf-8');

    const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) {
      fs.writeFileSync(claudeMdPath, protocolDoc, 'utf-8');
    } else {
      const existing = fs.readFileSync(claudeMdPath, 'utf-8');
      if (!existing.includes('Dewwie Multi-Agent Room Protocol')) {
        fs.writeFileSync(claudeMdPath, existing + '\n\n' + protocolDoc, 'utf-8');
      }
    }

    fs.writeFileSync(path.join(geminiRulesDir, 'dewwie_mesh.md'), protocolDoc, 'utf-8');
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), skillDoc, 'utf-8');
    fs.writeFileSync(path.join(dewwieDir, 'dewwie_env.ps1'), ps1Doc, 'utf-8');

    return { success: true, message: `Synced skills and room protocol into ${targetDir}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

let fileWatchDebounce = null;
function setupFileWatchers() {
  const watchHandler = () => {
    if (fileWatchDebounce) clearTimeout(fileWatchDebounce);
    fileWatchDebounce = setTimeout(async () => {
      try {
        const list = await getWorkspaces(true);
        const roomsList = getRooms();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('workspaces:updated', list);
          mainWindow.webContents.send('rooms:updated', roomsList);
        }
      } catch (_) {}
    }, 150);
  };

  try {
    if (fs.existsSync(SWARMHERD_DIR)) {
      fs.watch(SWARMHERD_DIR, (_, filename) => {
        if (filename === 'workspaces.json' || filename === 'rooms.json') {
          watchHandler();
        }
      });
    }
  } catch (err) {
    console.warn('[Dewwie] File watcher notice:', err);
  }
}

app.whenReady().then(() => {
  createWindow();
  setupFileWatchers();
  try {
    const id = powerSaveBlocker.start('prevent-app-suspension');
    console.log('[Dewwie] Background powerSaveBlocker active, suspension prevented (id: ' + id + ')');
  } catch (err) {
    console.error('[Dewwie] powerSaveBlocker failed:', err);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});