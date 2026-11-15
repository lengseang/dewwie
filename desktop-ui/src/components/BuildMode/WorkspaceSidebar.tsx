import React, { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { SessionMode } from '../../types';
import {
  FolderGit2,
  Folder,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  X,
  FolderPlus,
  Terminal,
  Bot,
  Settings,
  RotateCw,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Command,
} from 'lucide-react';

interface WorkspaceSidebarProps {
  onOpenSettings?: () => void;
  onOpenCommandPalette?: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  onOpenSettings,
  onOpenCommandPalette,
}) => {
  const {
    projects,
    workspaces,
    activeWorkspaceId,
    activeProjectId,
    setActiveWorkspace,
    setActiveProject,
    addProject,
    createSession,
    deleteWorkspace,
    leadSessionId,
    setSessionRole,
    sidebarWidth,
    pickAndOpenFolder,
  } = useWorkspaceStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newProjectName, setNewProjectName] = useState('');

  // New Session Form State
  const [sessionName, setSessionName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [sessionMode, setSessionMode] = useState<SessionMode>('local');
  const [branchName, setBranchName] = useState('');
  const [agentType, setAgentType] = useState('terminal');
  const [isCreating, setIsCreating] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  const isNarrow = sidebarWidth < 140;

  const projectList = Object.values(projects);
  const allSessions = Object.values(workspaces);

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const handlePickFolder = async () => {
    if (typeof window !== 'undefined' && window.swarmherdNative?.pickFolder) {
      const chosen = await window.swarmherdNative.pickFolder();
      if (chosen) {
        setNewFolderPath(chosen);
      }
    }
  };

  const handleAddProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderPath.trim()) return;
    await addProject(newFolderPath.trim(), newProjectName.trim() || undefined);
    setNewFolderPath('');
    setNewProjectName('');
    setIsAddProjectOpen(false);
  };

  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) return;
    setIsCreating(true);
    try {
      const targetProjId = selectedProjectId || activeProjectId || projectList[0]?.id;
      await createSession({
        projectId: targetProjId,
        name: sessionName.trim(),
        sessionMode,
        branch: sessionMode === 'branch' ? (branchName.trim() || sessionName.trim().replace(/\s+/g, '-')) : undefined,
        baseBranch: 'main',
        agentType,
      });
      setSessionName('');
      setBranchName('');
      setIsModalOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <aside className="w-full h-full flex flex-col bg-zinc-950/90 border-r border-zinc-800/80 text-zinc-300 select-none shrink-0 font-mono">
      {/* 1. Header: Dewwie Logo + Setting + Command Palette + New Session */}
      <div className={`h-9 border-b border-zinc-800/80 flex items-center justify-between gap-1.5 shrink-0 ${isNarrow ? 'px-1.5 justify-center' : 'px-3'}`}>
        {!isNarrow ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={onOpenSettings}
                title="Settings & Themes (Ctrl+,)"
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors shrink-0"
              >
                <img src="/logo.png" alt="Dewwie" className="w-4 h-4 rounded object-contain" />
              </button>
              <span className="text-xs font-bold tracking-wider text-zinc-200 uppercase truncate">
                Dewwie
              </span>
            </div>

            <div className="flex items-center gap-1">
              {onOpenCommandPalette && (
                <button
                  onClick={onOpenCommandPalette}
                  title="Command Palette & Shell (Ctrl+P / :)"
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <Command className="w-3 h-3" />
                </button>
              )}

              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  title="Preferences & Themes"
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                </button>
              )}

              <button
                onClick={() => {
                  setSelectedProjectId(activeProjectId || projectList[0]?.id || '');
                  setIsModalOpen(true);
                }}
                title="Create New Agent Session"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-[11px] transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 py-1">
            <button
              onClick={onOpenSettings}
              title="Settings & Themes"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <img src="/logo.png" alt="Dewwie" className="w-3.5 h-3.5 rounded object-contain" />
            </button>
          </div>
        )}
      </div>

      {/* 2. Open Directory Shortcut Bar */}
      <div className={`p-1.5 border-b border-zinc-800/60 shrink-0 ${isNarrow ? 'flex justify-center' : ''}`}>
        <button
          onClick={handlePickFolder}
          title="Open Any Directory from your PC (Ctrl+O)"
          className={`rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center ${
            isNarrow ? 'p-1.5 justify-center' : 'w-full px-2 py-1 justify-between'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
            {!isNarrow && <span className="font-medium text-[11px]">Open Directory</span>}
          </div>
          {!isNarrow && <span className="text-[9px] text-zinc-600">Ctrl+O</span>}
        </button>
      </div>

      {/* 3. Projects & Sessions Tree with Number Badges & Hollow Dots */}
      <div className={`flex-1 overflow-y-auto no-scrollbar space-y-2 ${isNarrow ? 'p-1' : 'p-2'}`}>
        {projectList.map((proj, projIdx) => {
          const projectSessions = allSessions.filter(
            (w) => w.projectId === proj.id || w.repository === proj.name
          );
          const isCollapsed = collapsedProjects[proj.id];

          return (
            <div key={proj.id} className="space-y-1">
              {/* Project Row: Numbered Badge [1], [2] */}
              <div
                onClick={() => {
                  setActiveProject(proj.id);
                  toggleProject(proj.id);
                }}
                className={`flex items-center rounded transition-colors cursor-pointer ${
                  isNarrow
                    ? 'justify-center p-1 hover:bg-zinc-900'
                    : 'justify-between px-2 py-1 text-xs hover:bg-zinc-900/40'
                } ${
                  activeProjectId === proj.id
                    ? 'text-zinc-100 bg-zinc-900/60 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={`${proj.name} (${proj.rootPath})`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Clean Number Badge [1] */}
                  <span className="w-4 h-4 rounded bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-[10px] font-bold text-zinc-200 shrink-0 shadow-xs">
                    {projIdx + 1}
                  </span>

                  {!isNarrow && (
                    <>
                      <span className="truncate text-xs">{proj.name}</span>
                      {isCollapsed ? (
                        <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0 ml-auto" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0 ml-auto" />
                      )}
                    </>
                  )}
                </div>

                {!isNarrow && (
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                    {projectSessions.length}
                  </span>
                )}
              </div>

              {/* Sessions Tree with Hollow Circles (○) & Clean Guide Lines */}
              {!isCollapsed && (
                <div className={isNarrow ? 'flex flex-col items-center gap-2 py-1' : 'relative ml-4 pl-3.5 space-y-1 py-0.5'}>
                  {projectSessions.map((ws, sIdx) => {
                    const isActive = activeWorkspaceId === ws.id;
                    const isLocal = ws.sessionMode === 'local' || !ws.sessionMode;
                    const isLead = ws.agentRole === 'lead' || ws.id === leadSessionId;

                    if (isNarrow) {
                      // Ultra-compact Narrow Rail: Hollow Dot (○) or Filled (●)
                      return (
                        <div
                          key={ws.id}
                          onClick={() => setActiveWorkspace(ws.id)}
                          title={`${ws.name} (${ws.agentType || 'shell'})\nStatus: ${ws.agentStatus?.message || 'idle'}`}
                          className="relative flex items-center justify-center cursor-pointer py-0.5 group"
                        >
                          <span
                            className={`rounded-full transition-all ${
                              isActive
                                ? 'w-2.5 h-2.5 bg-zinc-100 ring-2 ring-zinc-700'
                                : ws.agentStatus?.state === 'blocked'
                                ? 'w-2 h-2 bg-rose-500'
                                : ws.agentStatus?.state === 'working'
                                ? 'w-2 h-2 border border-zinc-300 bg-zinc-500 animate-pulse'
                                : 'w-2 h-2 border border-zinc-600 bg-transparent group-hover:border-zinc-300'
                            }`}
                          />
                        </div>
                      );
                    }

                    // Full Width Mode: Hollow Dot + Title + Diff & Actions
                    return (
                      <div
                        key={ws.id}
                        onClick={() => setActiveWorkspace(ws.id)}
                        className={`group relative flex items-center justify-between px-2 py-1 rounded cursor-pointer text-xs font-mono transition-all ${
                          isActive
                            ? 'bg-zinc-900 text-white font-medium border border-zinc-800 shadow-xs'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                        }`}
                      >
                        {/* Vertical tree trunk through this item */}
                        <span className="absolute -left-3.5 top-0 bottom-0 w-px bg-zinc-800/80" />

                        {/* Horizontal connector tick from vertical guide line */}
                        <span
                          className={`absolute -left-3.5 top-1/2 -translate-y-1/2 w-2.5 h-px ${
                            isActive ? 'bg-zinc-400' : 'bg-zinc-800/80'
                          }`}
                        />

                        {/* Hollow Circle Dot (○) / Filled (●) & Session Name */}
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <span
                            className={`rounded-full shrink-0 transition-colors ${
                              isActive
                                ? 'w-2 h-2 bg-zinc-200 border border-zinc-200 shadow-xs'
                                : ws.agentStatus?.state === 'blocked'
                                ? 'w-2 h-2 bg-rose-500 border border-rose-500'
                                : 'w-2 h-2 border border-zinc-600 bg-transparent group-hover:border-zinc-300'
                            }`}
                          />
                          <span className="truncate text-[11px]">{ws.name}</span>
                        </div>

                        {/* Right: Role, Diff & delete */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isLead && (
                            <span className="px-1 py-0.2 rounded text-[8px] uppercase font-mono text-zinc-300 bg-zinc-800 border border-zinc-700">
                              Lead
                            </span>
                          )}

                          {ws.diffSummary && (ws.diffSummary.additions > 0 || ws.diffSummary.deletions > 0) && (
                            <span className="text-[9px] font-mono text-zinc-500">
                              <span className="text-emerald-500">+{ws.diffSummary.additions}</span>{' '}
                              <span className="text-rose-500">-{ws.diffSummary.deletions}</span>
                            </span>
                          )}

                          {ws.id !== 'ws-local-proj-dewwie' && ws.id !== 'ws-local-proj-exbytelab' && !ws.id.startsWith('ws-local-proj-') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteWorkspace(ws.id);
                              }}
                              title="Delete Session"
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-600 hover:text-rose-400 hover:bg-zinc-800 transition-opacity"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {!isNarrow && (
                    <div
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setIsModalOpen(true);
                      }}
                      className="group relative flex items-center gap-2 px-2 py-0.5 text-xs font-mono text-zinc-600 hover:text-zinc-300 cursor-pointer transition-colors"
                    >
                      <span className="absolute -left-3.5 top-0 w-2.5 h-1/2 border-b border-l border-zinc-800/80 rounded-bl-sm" />
                      <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 select-none">
                        + session
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Live Session Process Status Tray (Bottom Section from User Sketch) */}
      <div className={`border-t border-zinc-800/80 bg-zinc-950/80 shrink-0 ${isNarrow ? 'p-1' : 'p-2'}`}>
        {!isNarrow && (
          <div className="flex items-center justify-between pb-1.5 text-[9px] uppercase font-semibold text-zinc-500 tracking-wider">
            <span>Process Status</span>
            <span className="text-[9px] text-zinc-600 font-mono">{allSessions.length} live</span>
          </div>
        )}

        <div className={`flex flex-wrap gap-1 ${isNarrow ? 'flex-col items-center' : 'items-center'}`}>
          {allSessions.map((s, idx) => {
            const isActive = activeWorkspaceId === s.id;
            const state = s.agentStatus?.state;
            const isWorking = state === 'working';
            const isBlocked = state === 'blocked';
            const isError = state === 'error' || state === 'failed';
            const isDone = state === 'done';

            return (
              <button
                key={s.id}
                onClick={() => setActiveWorkspace(s.id)}
                title={`[${idx + 1}] ${s.name}\nState: ${state || 'idle'}\n${s.agentStatus?.message || ''}`}
                className={`flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-all ${
                  isActive
                    ? 'ring-1 ring-zinc-500 bg-zinc-800 text-zinc-100 font-semibold'
                    : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <span className="font-bold">{idx + 1}</span>

                {/* Status Indicator Icon from User Sketch */}
                {isWorking && (
                  <RotateCw className="w-2.5 h-2.5 text-zinc-200 animate-spin" />
                )}
                {isError && (
                  <span className="text-rose-400 font-black">!</span>
                )}
                {isBlocked && (
                  <span className="text-amber-400 font-black">?</span>
                )}
                {isDone && (
                  <span className="text-emerald-400 font-black">✓</span>
                )}
                {!isWorking && !isError && !isBlocked && !isDone && (
                  <span className="text-zinc-600 font-mono">~</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Bottom Add Project / Repository Action */}
      <div className={`border-t border-zinc-800/80 bg-zinc-950 shrink-0 ${isNarrow ? 'p-1 flex justify-center' : 'p-2'}`}>
        <button
          onClick={() => setIsAddProjectOpen(true)}
          className={`flex items-center rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors ${
            isNarrow ? 'p-1.5 justify-center' : 'w-full justify-center gap-1.5 py-1.5 px-3 text-xs'
          }`}
          title="Add Repository / Folder"
        >
          <FolderPlus className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          {!isNarrow && <span>+ Add Repository</span>}
        </button>
      </div>

      {/* Add Project Modal */}
      {isAddProjectOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-semibold text-zinc-200">
                Register Project / Folder
              </span>
              <button
                onClick={() => setIsAddProjectOpen(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddProjectSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Folder Path
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    required
                    value={newFolderPath}
                    onChange={(e) => setNewFolderPath(e.target.value)}
                    placeholder="e.g. D:\1111-Works\ThinkFolio"
                    className="flex-1 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                  />
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded border border-zinc-700"
                  >
                    Browse...
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Project Display Name (Optional)
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Defaults to folder name"
                  className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setIsAddProjectOpen(false)}
                  className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderPath.trim()}
                  className="px-3 py-1 rounded text-xs bg-zinc-100 hover:bg-white text-zinc-950 font-semibold disabled:opacity-40"
                >
                  Add Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Agent Session Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-semibold text-zinc-200">
                Create Agent Session
              </span>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSessionSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Target Project
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none"
                >
                  {projectList.map((p, idx) => (
                    <option key={p.id} value={p.id}>
                      [{idx + 1}] {p.name} ({p.rootPath})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Session Name
                </label>
                <input
                  type="text"
                  required
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. terminal 2, claude-code, codex"
                  className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Execution Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setSessionMode('local')}
                    className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                      sessionMode === 'local'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100'
                        : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900/40'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5 mt-0.5 text-zinc-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold">Local (In-Place)</div>
                      <div className="text-[10px] text-zinc-500">
                        Runs directly in project folder.
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => setSessionMode('branch')}
                    className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                      sessionMode === 'branch'
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100'
                        : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900/40'
                    }`}
                  >
                    <FolderGit2 className="w-3.5 h-3.5 mt-0.5 text-zinc-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold">Branch (Worktree)</div>
                      <div className="text-[10px] text-zinc-500">
                        Isolated git branch worktree.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {sessionMode === 'branch' && (
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Git Branch Name
                  </label>
                  <input
                    type="text"
                    required
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="e.g. feat/my-agent-task"
                    className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Agent Tool / CLI
                </label>
                <div className="flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <select
                    value={agentType}
                    onChange={(e) => setAgentType(e.target.value)}
                    className="flex-1 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="terminal">Terminal Shell (PowerShell)</option>
                    <option value="claude-code">Claude Code</option>
                    <option value="codex">OpenAI Codex</option>
                    <option value="gemini">Gemini CLI</option>
                    <option value="antigravity">Antigravity</option>
                    <option value="hermes">Hermes</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !sessionName.trim() || (sessionMode === 'branch' && !branchName.trim())}
                  className="px-3 py-1 rounded text-xs bg-zinc-100 hover:bg-white text-zinc-950 font-semibold disabled:opacity-40"
                >
                  {isCreating ? 'Creating...' : 'Start Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};
