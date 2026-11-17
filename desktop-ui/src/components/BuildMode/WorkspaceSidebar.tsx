import React, { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { SessionMode } from '../../types';
import { getAgentIcon } from '../AgentIcons';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  X,
  FolderPlus,
  Settings,
  RotateCw,
  Command,
  Terminal,
  FolderGit2,
  Bot,
  Folder,
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
    setActiveTab,
    setActiveProject,
    addProject,
    createSession,
    deleteWorkspace,
    leadSessionId,
    sidebarWidth,
    theme,
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
      const newId = await createSession({
        projectId: targetProjId,
        name: sessionName.trim(),
        sessionMode,
        branch: sessionMode === 'branch' ? (branchName.trim() || sessionName.trim().replace(/\s+/g, '-')) : undefined,
        baseBranch: 'main',
        agentType,
      });
      if (newId) {
        setActiveWorkspace(newId);
        setActiveTab('terminal');
      }
      setSessionName('');
      setBranchName('');
      setIsModalOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProject(projectId);
    if (collapsedProjects[projectId]) {
      toggleProject(projectId);
    }
    // Find project's root session
    const projectSessions = allSessions.filter(
      (w) => w.projectId === projectId || w.repository === projects[projectId]?.name
    );
    const rootSession = projectSessions.find(
      (s) => s.sessionMode === 'local' && (s.id.startsWith('ws-local-') || s.name.toLowerCase().includes('shell'))
    ) || projectSessions[0];
    if (rootSession) {
      setActiveWorkspace(rootSession.id);
      setActiveTab('terminal');
    }
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveWorkspace(sessionId);
    setActiveTab('terminal');
  };

  return (
    <aside
      style={{
        backgroundColor: 'var(--app-surface)',
        borderColor: 'var(--app-border)',
      }}
      className="w-full h-full flex flex-col border-r text-zinc-300 select-none shrink-0 font-mono"
    >
      {/* 1. Header: Dewwie Logo + Brand + New Session Quick Button */}
      <div
        style={{ borderColor: 'var(--app-border)' }}
        className={`h-9 border-b flex items-center justify-between gap-1.5 shrink-0 ${isNarrow ? 'px-1.5 justify-center' : 'px-3'}`}
      >
        {!isNarrow ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <img src="/logo.png" alt="Dewwie" className="w-4 h-4 rounded object-contain shrink-0" />
              <span className="text-xs font-bold tracking-wider text-zinc-100 uppercase truncate">
                DEWWIE
              </span>
            </div>

            <button
              onClick={() => {
                setSelectedProjectId(activeProjectId || projectList[0]?.id || '');
                setIsModalOpen(true);
              }}
              title="Create New Custom Agent Session"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-[11px] font-medium transition-colors"
            >
              <Plus className="w-3 h-3 text-zinc-400" />
              <span>New</span>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center py-1">
            <img src="/logo.png" alt="Dewwie" className="w-4 h-4 rounded object-contain" />
          </div>
        )}
      </div>

      {/* 2. Projects & Sessions Tree */}
      <div className={`flex-1 overflow-y-auto no-scrollbar space-y-3 ${isNarrow ? 'p-1' : 'p-2'}`}>
        {!isNarrow && (
          <div className="px-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Workspaces & Sessions</span>
            <span className="text-zinc-600 font-mono">{allSessions.length} active</span>
          </div>
        )}

        {projectList.map((proj, projIdx) => {
          const projectSessions = allSessions.filter(
            (w) => w.projectId === proj.id || w.repository === proj.name
          );
          const isProjectActive = activeProjectId === proj.id;
          const isCollapsed = collapsedProjects[proj.id];

          // Differentiate: Project Root Workspace vs Custom Sessions
          const rootSession = projectSessions.find(
            (s) => s.sessionMode === 'local' && (s.id.startsWith('ws-local-') || s.name.toLowerCase().includes('shell'))
          ) || projectSessions[0];
          const customSessions = projectSessions.filter((s) => s.id !== rootSession?.id);

          return (
            <div key={proj.id} className="space-y-1">
              {/* Project Row: Numbered Badge [1], Name, and Toggle */}
              <div
                onClick={() => handleSelectProject(proj.id)}
                className={`flex items-center rounded transition-colors cursor-pointer ${
                  isNarrow
                    ? 'justify-center p-1 hover:bg-zinc-900'
                    : 'justify-between px-2 py-1 text-xs hover:bg-zinc-900/40'
                } ${
                  isProjectActive
                    ? 'text-zinc-100 bg-zinc-900/70 font-semibold border border-zinc-800/80'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={`${proj.name} (${proj.rootPath}) • Click to activate project workspace`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isProjectActive ? 'bg-zinc-800 text-zinc-100 border border-zinc-700' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                  }`}>
                    {projIdx + 1}
                  </span>

                  {!isNarrow && (
                    <>
                      <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate text-xs">{proj.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleProject(proj.id);
                        }}
                        className="p-0.5 text-zinc-600 hover:text-zinc-300 ml-1"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    </>
                  )}
                </div>

                {!isNarrow && (
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                    {projectSessions.length}
                  </span>
                )}
              </div>

              {/* Workspaces List Under Project */}
              {!isCollapsed && (
                <div className={isNarrow ? 'flex flex-col items-center gap-1.5 py-1' : 'relative ml-3 pl-3 space-y-1 py-0.5 border-l border-zinc-800/80'}>
                  {/* A. Project Root Workspace (Project Shell) */}
                  {rootSession && (
                    <div
                      key={rootSession.id}
                      onClick={() => handleSelectSession(rootSession.id)}
                      title={`${rootSession.name} • Project Root Terminal Workspace`}
                      className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer text-xs font-mono transition-all ${
                        activeWorkspaceId === rootSession.id
                          ? 'bg-zinc-900 text-white font-medium border border-zinc-700/80 shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Terminal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        {!isNarrow && (
                          <span className="truncate text-[11px]">
                            {rootSession.name}
                          </span>
                        )}
                      </div>
                      {!isNarrow && (
                        <span className="text-[8.5px] px-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">
                          ROOT
                        </span>
                      )}
                    </div>
                  )}

                  {/* B. Custom Sessions & AI Agent Workspaces */}
                  {customSessions.map((ws) => {
                    const isActive = activeWorkspaceId === ws.id;
                    const isLead = ws.agentRole === 'lead' || ws.id === leadSessionId;

                    return (
                      <div
                        key={ws.id}
                        onClick={() => handleSelectSession(ws.id)}
                        title={`${ws.name} (${ws.agentType || 'shell'})\nWorktree: ${ws.worktreePath}`}
                        className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer text-xs font-mono transition-all ${
                          isActive
                            ? 'bg-zinc-900 text-white font-medium border border-zinc-700/80 shadow-xs'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {getAgentIcon(ws.agentType, 'w-3.5 h-3.5 shrink-0')}
                          {!isNarrow && (
                            <span className="truncate text-[11px]">{ws.name}</span>
                          )}
                        </div>

                        {!isNarrow && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isLead && (
                              <span className="px-1 py-0.2 rounded text-[8px] uppercase font-mono text-amber-300 bg-amber-950/60 border border-amber-800">
                                Lead
                              </span>
                            )}

                            {ws.sessionMode === 'branch' && (
                              <span className="text-[8.5px] px-1 rounded bg-cyan-950/60 border border-cyan-800 text-cyan-300 font-mono">
                                WT
                              </span>
                            )}

                            {ws.diffSummary && (ws.diffSummary.additions > 0 || ws.diffSummary.deletions > 0) && (
                              <span className="text-[9px] font-mono text-zinc-500">
                                <span className="text-emerald-400">+{ws.diffSummary.additions}</span>{' '}
                                <span className="text-rose-400">-{ws.diffSummary.deletions}</span>
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
                        )}
                      </div>
                    );
                  })}

                  {/* + New Session Shortcut under project */}
                  {!isNarrow && (
                    <div
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setIsModalOpen(true);
                      }}
                      className="group flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5 text-zinc-600 group-hover:text-zinc-400" />
                      <span className="text-[10px] select-none">+ session</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Live Session Process Status Tray */}
      <div
        style={{
          backgroundColor: 'var(--app-surface)',
          borderColor: 'var(--app-border)',
        }}
        className={`border-t shrink-0 ${isNarrow ? 'p-1' : 'p-2'}`}
      >
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
            const isError = state === 'blocked' && !!s.agentStatus?.message?.toLowerCase().includes('err');
            const isBlocked = state === 'blocked' && !isError;
            const isDone = state === 'done';

            return (
              <button
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                title={`[${idx + 1}] ${s.name}\nState: ${state || 'idle'}\n${s.agentStatus?.message || ''}`}
                className={`flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-all ${
                  isActive
                    ? 'ring-1 ring-zinc-500 bg-zinc-800 text-zinc-100 font-semibold'
                    : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <span className="font-bold">{idx + 1}</span>
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

      {/* 4. Bottom Utility Bar: Add Repository, Command Palette, and Settings (Moved to the Below!) */}
      <div
        style={{
          backgroundColor: 'var(--app-surface)',
          borderColor: 'var(--app-border)',
        }}
        className={`border-t shrink-0 p-1.5 space-y-1 ${isNarrow ? 'flex flex-col items-center' : ''}`}
      >
        {/* Open Directory / Add Repository */}
        <button
          onClick={handlePickFolder}
          title="Open Any Directory from your PC (Ctrl+O)"
          className={`rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center ${
            isNarrow ? 'p-1.5 justify-center' : 'w-full px-2 py-1 justify-between'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <FolderPlus className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            {!isNarrow && <span className="font-medium text-[11px]">Open Directory</span>}
          </div>
          {!isNarrow && <span className="text-[9px] text-zinc-600">Ctrl+O</span>}
        </button>

        {/* Command Palette Button */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            title="Command Palette (Ctrl+P / :)"
            className={`rounded bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono transition-colors flex items-center ${
              isNarrow ? 'p-1.5 justify-center' : 'w-full px-2 py-1 justify-between'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Command className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              {!isNarrow && <span className="text-[11px]">Commands</span>}
            </div>
            {!isNarrow && <span className="text-[9px] text-zinc-600">Ctrl+P</span>}
          </button>
        )}

        {/* Settings Button (Moved to the Below, as requested!) */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="Settings & Themes (Ctrl+,)"
            className={`rounded bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-mono transition-colors flex items-center ${
              isNarrow ? 'p-1.5 justify-center' : 'w-full px-2 py-1 justify-between'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              {!isNarrow && <span className="text-[11px]">Settings</span>}
            </div>
            {!isNarrow && (
              <span className="text-[9px] text-zinc-500 font-mono capitalize">
                {theme}
              </span>
            )}
          </button>
        )}
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

export default WorkspaceSidebar;
