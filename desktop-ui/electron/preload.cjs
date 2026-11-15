const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('swarmherdNative', {
  isNative: true,
  wsPort: 7501,

  pickFolder: () => ipcRenderer.invoke('project:pickFolder'),
  getProjects: () => ipcRenderer.invoke('projects:get'),
  addProject: (params) => ipcRenderer.invoke('projects:add', params),
  removeProject: (projectId) => ipcRenderer.invoke('projects:remove', { id: projectId }),

  getWorkspaces: () => ipcRenderer.invoke('workspaces:get'),
  createSession: (params) => ipcRenderer.invoke('sessions:create', params),
  createWorktree: (params) => ipcRenderer.invoke('workspaces:create', params),
  getGitDiff: (params) => ipcRenderer.invoke('git:diff', params),
  mergeWorktree: (params) => ipcRenderer.invoke('git:merge', params),
  launchIde: (ide, targetPath) => ipcRenderer.invoke('ide:open', { ide, targetPath }),
  getFilesTree: (params) => ipcRenderer.invoke('fs:tree', params || {}),
  readFile: (params) => ipcRenderer.invoke('fs:read', params),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  onAgentStatus: (callback) => {
    ipcRenderer.on('agent:status', (_, data) => callback(data));
  },
  getRoomMessages: (params) => ipcRenderer.invoke('room:getMessages', params || {}),
  postRoomMessage: (params) => ipcRenderer.invoke('room:postMessage', params),
  onRoomMessage: (callback) => {
    ipcRenderer.on('room:message', (_, data) => callback(data));
  },
  setSessionRole: (params) => ipcRenderer.invoke('session:setRole', params),
  getWorkspaceState: () => ipcRenderer.invoke('workspace:getState'),
  saveWorkspaceState: (state) => ipcRenderer.invoke('workspace:saveState', state),
  delegateTask: (params) => ipcRenderer.invoke('task:delegate', params),
  runWorktreeTests: (params) => ipcRenderer.invoke('worktree:runTests', params || {}),
});
