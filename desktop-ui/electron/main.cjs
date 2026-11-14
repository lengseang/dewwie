const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');

// Configuration
const WS_PORT = 7501;
const SWARMHERD_DIR = path.join(os.homedir(), '.swarmherd');
const SESSIONS_DIR = path.join(SWARMHERD_DIR, 'sessions');
const WORKSPACES_FILE = path.join(SWARMHERD_DIR, 'workspaces.json');
const PROJECTS_FILE = path.join(SWARMHERD_DIR, 'projects.json');
const ROOM_MESSAGES_FILE = path.join(SWARMHERD_DIR, 'room_messages.json');
const WORKSPACE_STATE_FILE = path.join(SWARMHERD_DIR, 'workspace_state.json');

// Ensure storage directories exist
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Active PTY sessions map: workspaceId -> { ptyProcess, scrollbackFile, subscribers: Set }
const activePtys = new Map();

// -------------------------------------------------------------
// Real Git Operations Helper
// -------------------------------------------------------------
function execGit(args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd: cwd || 'D:\\1111-Works\\exbytelab', shell: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
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
      list = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
    } catch (_) {}
  }

  // Ensure Dewwie project exists
  const dewwieRoot = 'D:\\1111-Works\\Dewwie';
  const hasDewwie = list.some(p => p.rootPath.toLowerCase() === dewwieRoot.toLowerCase());
  if (!hasDewwie && fs.existsSync(dewwieRoot)) {
    list.unshift({
      id: 'proj-dewwie',
      name: 'Dewwie',
      rootPath: dewwieRoot,
      isGitRepo: fs.existsSync(path.join(dewwieRoot, '.git')),
      createdAt: new Date().toISOString()
    });
    saveProjects(list);
  }

  // Ensure default root project exists
  const defaultRoot = 'D:\\1111-Works\\exbytelab';
  const hasRoot = list.some(p => p.rootPath.toLowerCase() === defaultRoot.toLowerCase());
  if (!hasRoot && fs.existsSync(defaultRoot)) {
    list.push({
      id: 'proj-exbytelab',
      name: 'exbytelab',
      rootPath: defaultRoot,
      isGitRepo: fs.existsSync(path.join(defaultRoot, '.git')),
      createdAt: new Date().toISOString()
    });
    saveProjects(list);
  }

  return list;
}

function saveProjects(list) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function addProject({ path: folderPath, name }) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    throw new Error('Directory path does not exist');
  }
  const cleanPath = path.resolve(folderPath);
  const list = getProjects();
  const existing = list.find(p => p.rootPath.toLowerCase() === cleanPath.toLowerCase());
  if (existing) return existing;

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
// Sessions & Workspaces Management (Local vs Branch)
// -------------------------------------------------------------
async function getWorkspaces() {
  const projects = getProjects();
  let saved = [];
  if (fs.existsSync(WORKSPACES_FILE)) {
    try {
      saved = JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf-8'));
    } catch (_) {}
  }

  const allSessions = [];
  let portCounter = 5174;

  for (const proj of projects) {
    // 1. Ensure at least one primary Local session for this project
    const defaultLocalId = `ws-local-${proj.id}`;
    const existingLocal = saved.find(s => s.id === defaultLocalId || (s.projectId === proj.id && s.sessionMode === 'local' && s.worktreePath === proj.rootPath));

    allSessions.push({
      id: existingLocal?.id || defaultLocalId,
      projectId: proj.id,
      projectName: proj.name,
      repository: proj.name,
      name: existingLocal?.name || 'Local Main Shell',
      sessionMode: 'local',
      branch: 'main',
      baseBranch: 'main',
      worktreePath: proj.rootPath,
      agentType: existingLocal?.agentType || 'claude-code',
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
                const diffStat = await execGit(['diff', 'main', '--numstat'], worktreePath);
                if (diffStat.stdout) {
                  const statLines = diffStat.stdout.trim().split('\n').filter(Boolean);
                  let adds = 0;
                  let dels = 0;
                  for (const s of statLines) {
                    const parts = s.split('\t');
                    adds += parseInt(parts[0], 10) || 0;
                    dels += parseInt(parts[1], 10) || 0;
                  }
                  diffSummary = { filesChanged: statLines.length, additions: adds, deletions: dels };
                }
              } catch (_) {}
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
              agentType: existing?.agentType || 'codex',
              agentStatus: existing?.agentStatus || {
                state: 'idle',
                message: 'Branch worktree ready',
                timestamp: Date.now(),
              },
              metrics: existing?.metrics || { cpuPercent: 0.6, memoryMb: 75 },
              ports: existing?.ports || [{ service: 'App Dev', port: portCounter++, status: 'active', url: `http://localhost:${portCounter - 1}` }],
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
    for (const other of otherSavedSessions) {
      if (!allSessions.some(a => a.id === other.id)) {
        allSessions.push(other);
      }
    }
  }

  saveWorkspaces(allSessions);
  return allSessions;
}

function saveWorkspaces(list) {
  fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

// -------------------------------------------------------------
// Inter-Agent Room & Swarm Mesh Communication
// -------------------------------------------------------------
function getRoomMessages(roomId) {
  let list = [];
  if (fs.existsSync(ROOM_MESSAGES_FILE)) {
    try {
      list = JSON.parse(fs.readFileSync(ROOM_MESSAGES_FILE, 'utf-8'));
    } catch (_) {}
  }
  if (!roomId || roomId === 'all') return list;
  return list.filter(m => !m.roomId || m.roomId === roomId);
}

function saveRoomMessage(message) {
  const list = getRoomMessages();
  list.push(message);
  if (list.length > 1000) list.splice(0, list.length - 1000);
  fs.writeFileSync(ROOM_MESSAGES_FILE, JSON.stringify(list, null, 2), 'utf-8');

  // Broadcast to Electron window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('room:message', message);
  }

  // Also broadcast to connected WebSocket clients as JSON frame
  const frame = JSON.stringify({ type: 'room:message', data: message });
  for (const session of activePtys.values()) {
    for (const ws of session.subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(frame);
      }
    }
  }

  return message;
}

// Helper: Parse OSC escape sequences:
// OSC 7501: \x1b]7501;state=<state>;msg=<msg>\x07
// OSC 7502: \x1b]7502;to=<target>;from=<sender>;type=<type>;msg=<content>\x07
function parseOsc(chunk, workspaceId) {
  // 1. Status: OSC 7501
  const osc7501Regex = /\x1b\]7501;([^\x07\x1b]+)(?:\x07|\x1b\\)/g;
  let match7501;
  while ((match7501 = osc7501Regex.exec(chunk)) !== null) {
    const params = match7501[1];
    let state = 'idle';
    let msg = '';
    for (const part of params.split(';')) {
      const [k, v] = part.split('=');
      if (k === 'state') state = v;
      if (k === 'msg') msg = v || '';
    }
    broadcastAgentStatus(workspaceId, state, msg);
  }

  // 2. Inter-Agent Communication: OSC 7502
  const osc7502Regex = /\x1b\]7502;([^\x07\x1b]+)(?:\x07|\x1b\\)/g;
  let match7502;
  while ((match7502 = osc7502Regex.exec(chunk)) !== null) {
    const params = match7502[1];
    let to = '@all';
    let from = workspaceId;
    let type = 'chat';
    let msg = '';
    for (const part of params.split(';')) {
      const idx = part.indexOf('=');
      if (idx > -1) {
        const k = part.substring(0, idx);
        const v = part.substring(idx + 1);
        if (k === 'to') to = v || '@all';
        if (k === 'from') from = v || workspaceId;
        if (k === 'type') type = v || 'chat';
        if (k === 'msg') msg = v || '';
      }
    }

    const newMsg = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      roomId: 'general',
      fromSessionId: workspaceId,
      fromSessionName: from,
      fromRole: workspaceId.includes('main') || workspaceId.includes('lead') ? 'lead' : 'worker',
      target: to,
      type: type,
      content: msg,
      timestamp: Date.now(),
    };

    saveRoomMessage(newMsg);
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
    saveWorkspaces(list);
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

  const workDir = (cwd && fs.existsSync(cwd)) ? cwd : 'D:\\1111-Works\\exbytelab';
  const sessionDir = path.join(SESSIONS_DIR, workspaceId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const scrollbackPath = path.join(sessionDir, 'scrollback.bin');

  const hcBin = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'herdr-core', 'hc.exe');
  const hasHc = fs.existsSync(hcBin);

  let shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  let shellArgs = process.platform === 'win32' ? ['-NoLogo'] : [];

  if (hasHc) {
    try {
      const safeId = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
      // Ensure persistent background terminal in herdr-core
      spawn(hcBin, ['run', '--bg', '--name', safeId, '--cwd', workDir, 'powershell.exe'], { stdio: 'ignore' });
      shell = hcBin;
      shellArgs = ['attach', safeId];
      console.log(`[PTY] Bridged workspace ${workspaceId} to persistent Herdr terminal: ${safeId}`);
    } catch (err) {
      console.warn(`[PTY] Herdr bridge fallback to direct powershell: ${err}`);
      shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
      shellArgs = process.platform === 'win32' ? ['-NoLogo'] : [];
    }
  } else {
    console.log(`[PTY] Spawning direct shell '${shell}' for ${workspaceId} in: ${workDir}`);
  }

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 120,
    rows: 32,
    cwd: workDir,
    useConpty: false, // Rock-solid WinPTY on Windows
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      SWARMHERD_WORKSPACE: workspaceId,
    }
  });

  const scrollbackStream = fs.createWriteStream(scrollbackPath, { flags: 'a' });
  const subscribers = new Set();

  ptyProcess.onData((data) => {
    // 1. Write to append-only disk scrollback
    scrollbackStream.write(data);

    // 2. Intercept OSC 7501
    parseOsc(data, workspaceId);

    // 3. Broadcast to connected WebSocket clients
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] Shell for ${workspaceId} exited with code ${exitCode}`);
    activePtys.delete(workspaceId);
  });

  const sessionObj = {
    ptyProcess,
    scrollbackPath,
    subscribers,
    cwd: workDir,
  };

  activePtys.set(workspaceId, sessionObj);
  return sessionObj;
}

// -------------------------------------------------------------
// WebSocket Terminal Server (Port 7501)
// -------------------------------------------------------------
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('SwarmHerd Native PTY Server Running');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let workspaceId = url.searchParams.get('workspaceId') || '';
  const list = await getWorkspaces();
  if ((!workspaceId || workspaceId === 'ws-main') && list.length > 0) {
    workspaceId = list[0].id;
  }
  const matched = list.find(w => w.id === workspaceId);
  const cwd = matched ? matched.worktreePath : (list[0]?.worktreePath || 'D:\\1111-Works\\Dewwie');

  console.log(`[WS] Client attached to workspace: ${workspaceId} (${cwd})`);
  const session = getOrCreatePty(workspaceId, cwd);

  // Send scrollback history from disk to newly connected client
  if (fs.existsSync(session.scrollbackPath)) {
    try {
      const history = fs.readFileSync(session.scrollbackPath);
      // Send last 64KB if huge
      const sliceStart = Math.max(0, history.length - 64 * 1024);
      ws.send(history.subarray(sliceStart));
    } catch (e) {
      console.error('Error reading scrollback:', e);
    }
  }

  session.subscribers.add(ws);

  ws.on('message', (message) => {
    const strMsg = message.toString();
    try {
      if (strMsg.startsWith('{')) {
        const parsed = JSON.parse(strMsg);
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          session.ptyProcess.resize(parsed.cols, parsed.rows);
          return;
        }
      }
    } catch (_) {}

    // Deliver raw keystrokes to real PTY stdin
    session.ptyProcess.write(strMsg);
  });

  ws.on('close', () => {
    session.subscribers.delete(ws);
  });
});

server.listen(WS_PORT, '127.0.0.1', () => {
  console.log(`[SWARMHERD] Native PTY & WebSocket server live on 127.0.0.1:${WS_PORT}`);
});

// -------------------------------------------------------------
// Electron Window Creation
// -------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#09090b',
    title: 'Dewwie - Autonomous AI Agent IDE',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#a1a1aa',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    ...(fs.existsSync(path.join(__dirname, '../public/icon.png')) ? { icon: path.join(__dirname, '../public/icon.png') } : {}),
  });

  // Real scanDir helper
  const distIndex = path.join(__dirname, '../dist/index.html');
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
ipcMain.handle('fs:tree', (_, { targetPath }) => {
  const root = (targetPath && fs.existsSync(targetPath)) ? targetPath : 'D:\\1111-Works\\exbytelab';
  return scanDir(root);
});

ipcMain.handle('fs:read', (_, { filePath, basePath }) => {
  const root = (basePath && fs.existsSync(basePath)) ? basePath : 'D:\\1111-Works\\exbytelab';
  const full = path.resolve(root, filePath);
  if (!full.startsWith(root) || !fs.existsSync(full)) {
    return { error: 'File not found or outside workspace' };
  }
  try {
    const content = fs.readFileSync(full, 'utf-8');
    return { content };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('window:close', () => mainWindow?.close());

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
ipcMain.handle('workspaces:get', () => getWorkspaces());

ipcMain.handle('sessions:create', async (_, { projectId, name, sessionMode, branch, baseBranch, agentType }) => {
  const projects = getProjects();
  const proj = projects.find(p => p.id === projectId) || projects[0];
  const rootDir = proj ? proj.rootPath : 'D:\\1111-Works\\exbytelab';
  const mode = sessionMode || (branch ? 'branch' : 'local');
  const safeName = name?.trim() || (mode === 'branch' ? branch : `${proj.name} Session`);

  let targetPath = rootDir;
  let allocatedPort = 5173;
  const list = await getWorkspaces();
  const nextPort = 5174 + list.length;

  if (mode === 'branch' && branch) {
    const safeFolder = branch.replace(/[\/\\]/g, '-');
    targetPath = path.join(rootDir, '.worktrees', safeFolder);
    const gitRes = await execGit(['worktree', 'add', '-b', branch, targetPath, baseBranch || 'main'], rootDir);
    console.log('[GIT WORKTREE]', gitRes.stdout, gitRes.stderr);

    allocatedPort = nextPort;
    const envContent = `PORT=${allocatedPort}\nAPI_PORT=${allocatedPort + 3000}\n`;
    try {
      fs.writeFileSync(path.join(targetPath, '.env.local'), envContent, 'utf-8');
    } catch (_) {}
  }

  const newSession = {
    id: `ws-${Date.now().toString(36)}`,
    projectId: proj.id,
    projectName: proj.name,
    repository: proj.name,
    name: safeName,
    sessionMode: mode,
    branch: mode === 'branch' ? branch : 'main',
    baseBranch: baseBranch || 'main',
    worktreePath: targetPath,
    agentType: agentType || 'claude-code',
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
  return newSession;
});

ipcMain.handle('workspaces:create', async (_, { name, branch, baseBranch, repository }) => {
  const safeFolder = branch.replace(/[\/\\]/g, '-');
  const baseDir = 'D:\\1111-Works\\exbytelab';
  const worktreePath = path.join(baseDir, '.worktrees', safeFolder);

  // Run real git worktree add
  const gitRes = await execGit(['worktree', 'add', '-b', branch, worktreePath, baseBranch || 'main'], baseDir);
  console.log('[GIT WORKTREE]', gitRes.stdout, gitRes.stderr);

  // Allocate dynamic port
  const list = await getWorkspaces();
  const nextPort = 5174 + list.length;
  const envContent = `PORT=${nextPort}\nAPI_PORT=${nextPort + 3000}\n`;
  try {
    fs.writeFileSync(path.join(worktreePath, '.env.local'), envContent, 'utf-8');
  } catch (_) {}

  const newWs = {
    id: `ws-${Date.now().toString(36)}`,
    repository: repository || 'exbytelab',
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
  const cwd = (worktreePath && fs.existsSync(worktreePath)) ? worktreePath : 'D:\\1111-Works\\exbytelab';
  const target = sessionMode === 'local' ? 'HEAD' : (baseBranch || 'main');
  const res = await execGit(['diff', target, '--numstat'], cwd);
  const patchRes = await execGit(['diff', '-u', target], cwd);

  return {
    rawPatch: patchRes.stdout,
    numstat: res.stdout,
  };
});

ipcMain.handle('git:merge', async (_, { worktreePath, branch, baseBranch, commitMsg }) => {
  const baseDir = 'D:\\1111-Works\\exbytelab';
  await execGit(['checkout', baseBranch || 'main'], baseDir);
  const mergeRes = await execGit(['merge', '--no-ff', branch, '-m', commitMsg || `Merge ${branch}`], baseDir);
  if (mergeRes.code === 0 && worktreePath) {
    await execGit(['worktree', 'remove', worktreePath], baseDir);
  }
  return { success: mergeRes.code === 0, message: mergeRes.stdout || mergeRes.stderr };
});

ipcMain.handle('ide:open', (_, { ide, targetPath }) => {
  const bin = ide === 'cursor' ? 'cursor' : ide === 'zed' ? 'zed' : 'code';
  const p = targetPath || 'D:\\1111-Works\\exbytelab';
  spawn('cmd', ['/C', bin, p], { detached: true, stdio: 'ignore' });
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
      const banner = `\r\n\x1b[36m[Dewwie Room Message from ${msgObj.fromSessionName} (${msgObj.fromRole})]:\x1b[0m ${msgObj.content}\r\n`;
      ptySess.ptyProcess.write(banner);
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
      return JSON.parse(fs.readFileSync(WORKSPACE_STATE_FILE, 'utf-8'));
    } catch (_) {}
  }
  return {
    activeProjectId: 'proj-dewwie',
    activeWorkspaceId: 'ws-local-proj-dewwie',
    activeTab: 'terminal',
    isSplitView: false,
    sidebarOpen: true,
    rightPanelOpen: false,
    rightPanelView: 'room',
    leadSessionId: null,
  };
}

function saveWorkspaceState(state) {
  try {
    const current = getWorkspaceState();
    const updated = { ...current, ...state, lastSaved: Date.now() };
    fs.writeFileSync(WORKSPACE_STATE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
