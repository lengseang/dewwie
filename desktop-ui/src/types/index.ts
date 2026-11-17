/**
 * SwarmHerd Desktop Core Domain Types
 * Unified interface between React UI and Rust Core Daemon (JSON-RPC & OSC 7501).
 */

export type AgentState = 'idle' | 'working' | 'blocked' | 'done' | 'error';

export interface AgentStatus {
  state: AgentState;
  message: string;
  timestamp: number;
  step?: number;
  totalSteps?: number;
}

export type PortStatus = 'allocated' | 'active' | 'free';

export interface PortAllocation {
  service: string;
  port: number;
  status: PortStatus;
  url: string;
  description?: string;
}

export type FileDiffStatus = 'added' | 'modified' | 'deleted';

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  id: string;
  path: string;
  oldPath?: string;
  status: FileDiffStatus;
  additions: number;
  deletions: number;
  chunks: DiffChunk[];
  rawDiff?: string;
  isBinary?: boolean;
}

export interface WorkspaceMetrics {
  cpuPercent: number;
  memoryMb: number;
}

export interface DiffSummary {
  filesChanged: number;
  additions: number;
  deletions: number;
}

export type SessionMode = 'local' | 'branch';

export interface ProjectState {
  id: string;
  name: string;
  rootPath: string;
  isGitRepo: boolean;
  createdAt: string;
}

export type AgentRole = 'lead' | 'worker' | 'reviewer';

export type RoomMessageType = 'chat' | 'task_delegate' | 'status_update' | 'review_request' | 'system';

export interface RoomMessage {
  id: string;
  roomId: string;
  fromSessionId: string;
  fromSessionName: string;
  fromRole: AgentRole;
  target: string; // e.g. '@all', '@lead', '@feat-native-pty'
  type: RoomMessageType;
  content: string;
  timestamp: number;
}

export interface AgentRoomState {
  id: string;
  projectId: string;
  name: string;
  leadSessionId: string | null;
  messages: RoomMessage[];
}

export interface WorkspaceState {
  id: string;
  projectId?: string;
  projectName?: string;
  name: string;
  sessionMode: SessionMode; // 'local' (in-place project folder) or 'branch' (isolated git worktree)
  branch?: string;
  baseBranch?: string;
  worktreePath: string; // rootPath for local, or .worktrees/<branch> for branch
  repository?: string;
  parentId?: string; // Sub-agent hierarchy
  agentRole?: AgentRole; // 'lead' | 'worker' | 'reviewer'
  roomId?: string; // Room mesh membership (e.g. 'room-1'). One session belongs to at most one room.
  agentType?: 'claude-code' | 'codex' | 'aider' | 'gemini' | 'antigravity' | 'hermes' | 'terminal' | 'custom' | 'shell' | string;
  autoLaunch?: boolean; // Set true ONLY when user explicitly spawns an AI agent CLI session
  agentStatus: AgentStatus;
  metrics: WorkspaceMetrics;
  ports: PortAllocation[];
  diffSummary: DiffSummary;
  createdAt: string;
  lastActivity: string;
  commitSha: string;
  terminalSessionId: string;
}

export type ExternalEditor = 'cursor' | 'zed' | 'vscode';

export type UIMode = 'build' | 'review';

/**
 * JSON-RPC 2.0 Specification Protocol Types
 */
export interface JsonRpcRequest<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: T;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcNotification<T = unknown> {
  jsonrpc: '2.0';
  method: string;
  params?: T;
}

export interface PtyOutputNotificationParams {
  workspace_id: string;
  data: string;
}

export interface AgentStatusNotificationParams {
  workspace_id: string;
  state: AgentState;
  message: string;
  metadata?: Record<string, string>;
  timestamp_ms: number;
}

export interface PtyExitedNotificationParams {
  workspace_id: string;
  exit_code: number;
}

export type RpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/**
 * OSC 7501 Terminal Protocol Payload
 * Format: \x1b]7501;state=<state>;msg=<message>\x07
 */
export interface Osc7501Payload {
  state: AgentState;
  msg: string;
}

export interface FileItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: string;
  children?: FileItem[];
}

export interface WorkspacePersistedState {
  activeProjectId?: string | null;
  activeWorkspaceId?: string | null;
  activeTab?: 'terminal' | 'room' | 'files' | 'changes';
  isSplitView?: boolean;
  sidebarOpen?: boolean;
  rightPanelOpen?: boolean;
  rightPanelView?: 'room' | 'files' | 'changes';
  leadSessionId?: string | null;
  lastSaved?: number;
}

declare global {
  interface Window {
    swarmherdNative?: {
      isNative: boolean;
      wsPort: number;
      getWsPort?: () => Promise<number>;
      pickFolder: () => Promise<string | null>;
      getProjects: () => Promise<ProjectState[]>;
      addProject: (params: { path: string; name?: string }) => Promise<ProjectState>;
      removeProject: (projectId: string) => Promise<boolean>;
      getWorkspaces: () => Promise<WorkspaceState[]>;
      createSession: (params: {
        projectId?: string;
        name: string;
        sessionMode: SessionMode;
        branch?: string;
        baseBranch?: string;
        agentType?: string;
      }) => Promise<WorkspaceState>;
      deleteSession?: (sessionId: string) => Promise<boolean>;
      renameSession?: (sessionId: string, newName: string) => Promise<boolean>;
      createWorktree: (params: { name?: string; branch: string; baseBranch?: string; repository?: string }) => Promise<WorkspaceState>;
      getGitDiff: (params: { worktreePath?: string; baseBranch?: string; sessionMode?: SessionMode }) => Promise<{ rawPatch: string; numstat: string }>;
      mergeWorktree: (params: { worktreePath?: string; branch: string; baseBranch?: string; commitMsg?: string }) => Promise<{ success: boolean; message: string }>;
      launchIde: (ide: string, targetPath?: string) => Promise<boolean>;
      getFilesTree: (params?: { targetPath?: string }) => Promise<FileItem[]>;
      readFile: (params: { filePath: string; basePath?: string }) => Promise<{ content?: string; error?: string }>;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      onAgentStatus: (callback: (data: { workspaceId: string; state: AgentState; message: string }) => void) => void;
      getRoomMessages: (params?: { roomId?: string }) => Promise<RoomMessage[]>;
      postRoomMessage: (params: {
        roomId?: string;
        fromSessionId: string;
        fromSessionName: string;
        fromRole?: AgentRole;
        target?: string;
        type?: RoomMessageType;
        content: string;
      }) => Promise<RoomMessage>;
      onRoomMessage: (callback: (data: RoomMessage) => void) => void;
      setSessionRole: (params: { sessionId: string; role: AgentRole }) => Promise<boolean>;
      getWorkspaceState: () => Promise<WorkspacePersistedState>;
      saveWorkspaceState: (state: WorkspacePersistedState) => Promise<WorkspacePersistedState>;
      delegateTask: (params: {
        task: string;
        agent?: string;
        repo?: string;
        baseBranch?: string;
      }) => Promise<WorkspaceState>;
      runWorktreeTests: (params?: {
        worktreePath?: string;
        repo?: string;
      }) => Promise<{ success: boolean; output: string }>;
      sendTerminalInput?: (params: { workspaceId: string; text: string; pressEnter?: boolean }) => Promise<boolean>;
      syncMeshSkills?: (params?: { projectPath?: string }) => Promise<{ success: boolean; message: string }>;
    };
  }
}
