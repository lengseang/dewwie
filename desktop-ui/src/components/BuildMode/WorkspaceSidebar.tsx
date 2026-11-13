import React, { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { SessionMode } from '../../types';
import {
  FolderGit2,
  Folder,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  X,
  FolderPlus,
  Terminal,
  Bot,
} from 'lucide-react';

export const WorkspaceSidebar: React.FC = () => {
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
  } = useWorkspaceStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newProjectName, setNewProjectName] = useState('');

  // New Session Form State
  const [sessionName, setSessionName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [sessionMode, setSessionMode] = useState<SessionMode>('local');
  const [branchName, setBranchName] = useState('');
  const [agentType, setAgentType] = useState('claude-code');
  const [isCreating, setIsCreating] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

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
    <aside className="w-64 h-full flex flex-col bg-[#09090b] border-r border-zinc-800/80 text-zinc-300 select-none shrink-0 font-mono">
      {/* Header */}
      <div className="h-10 px-3 border-b border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Dewwie" className="w-4 h-4 rounded object-contain shrink-0" />
          <span className="text-xs font-bold tracking-wider text-zinc-200 uppercase">
            Dewwie
          </span>
        </div>

        <button
          onClick={() => {
            setSelectedProjectId(activeProjectId || projectList[0]?.id || '');
            setIsModalOpen(true);
          }}
          title="Create New Agent Session"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-[11px] transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>New Agent</span>
        </button>
      </div>

      {/* Filter */}
      <div className="p-2 border-b border-zinc-800/60 shrink-0">
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            placeholder="Filter workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2.5 py-1 bg-zinc-900/60 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>
      </div>

      {/* Projects & Sessions Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {projectList.map((proj) => {
          const projectSessions = allSessions.filter(
            (w) => (w.projectId === proj.id) || (w.repository === proj.name)
          );

          const filtered = projectSessions.filter(
            (w) =>
              w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (w.branch && w.branch.toLowerCase().includes(searchQuery.toLowerCase())) ||
              w.agentStatus.message.toLowerCase().includes(searchQuery.toLowerCase())
          );

          if (filtered.length === 0 && searchQuery) return null;

          const isCollapsed = collapsedProjects[proj.id];

          return (
            <div key={proj.id} className="space-y-1">
              {/* Project Folder Row */}
              <div
                onClick={() => {
                  setActiveProject(proj.id);
                  toggleProject(proj.id);
                }}
                className={`flex items-center justify-between px-2 py-1 text-xs cursor-pointer rounded transition-colors ${
                  activeProjectId === proj.id
                    ? 'text-zinc-100 bg-zinc-900/60 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                }`}
                title={proj.rootPath}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  )}
                  {proj.isGitRepo ? (
                    <FolderGit2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  )}
                  <span className="truncate">{proj.name}</span>
                </div>
                <span className="text-[11px] font-mono text-zinc-500">
                  {filtered.length}
                </span>
              </div>

              {/* Sessions Tree with Continuous Guide Line */}
              {!isCollapsed && (
                <div className="relative ml-4 pl-3.5 space-y-1 py-1">
                  {filtered.map((ws) => {
                    const isActive = activeWorkspaceId === ws.id;
                    const isLocal = ws.sessionMode === 'local' || !ws.sessionMode;

                    return (
                      <div
                        key={ws.id}
                        onClick={() => setActiveWorkspace(ws.id)}
                        className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer text-xs font-mono transition-all ${
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
                            isActive ? 'bg-blue-400' : 'bg-zinc-800/80'
                          }`}
                        />

                        {/* Bullet Dot & Session Name */}
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              ws.agentStatus?.state === 'blocked'
                                ? 'bg-amber-400 agent-blocked-dot'
                                : ws.agentStatus?.state === 'working'
                                ? 'bg-blue-400 agent-working-dot'
                                : isActive
                                ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]'
                                : 'bg-zinc-600 group-hover:bg-zinc-400'
                            }`}
                          />
                          <span className="truncate">{ws.name}</span>
                        </div>

                        {/* Right: Diff & delete */}
                        <div className="flex items-center gap-1 shrink-0">
                          {ws.diffSummary && (ws.diffSummary.additions > 0 || ws.diffSummary.deletions > 0) && (
                            <span className="text-[9px] font-mono text-zinc-500">
                              <span className="text-emerald-500">+{ws.diffSummary.additions}</span>{' '}
                              <span className="text-rose-500">-{ws.diffSummary.deletions}</span>
                            </span>
                          )}

                          {ws.id !== 'ws-local-proj-dewwie' && ws.id !== 'ws-local-proj-exbytelab' && !isLocal && (
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

                  {/* Branch Line Hook (Curving out at bottom: ╰── + new session) */}
                  <div
                    onClick={() => {
                      setSelectedProjectId(proj.id);
                      setIsModalOpen(true);
                    }}
                    className="group relative flex items-center gap-2 px-2.5 py-1 text-xs font-mono text-zinc-600 hover:text-zinc-300 cursor-pointer transition-colors"
                  >
                    <span className="absolute -left-3.5 top-0 w-2.5 h-1/2 border-b border-l border-zinc-800/80 rounded-bl-sm" />
                    <span className="text-[11px] text-zinc-600 group-hover:text-zinc-400 select-none">
                      + new session
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Add Project Action */}
      <div className="p-2 border-t border-zinc-800/80 bg-zinc-950 shrink-0">
        <button
          onClick={() => setIsAddProjectOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5 text-zinc-500" />
          <span>+ Add Repository</span>
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

      {/* Create Agent Session Modal (Local vs Branch) */}
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
              {/* Project Target */}
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Target Project
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none"
                >
                  {projectList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.rootPath})
                    </option>
                  ))}
                </select>
              </div>

              {/* Session Name */}
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Session Name
                </label>
                <input
                  type="text"
                  required
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. Refactor API, Test Terminal, Fix Auth"
                  className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>

              {/* Mode Selection: Local vs Branch */}
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
                        Runs directly in project folder. No new git branch.
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => setSessionMode('branch')}
                    className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                      sessionMode === 'branch'
                        ? 'bg-zinc-900 border-blue-700/80 text-zinc-100'
                        : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900/40'
                    }`}
                  >
                    <FolderGit2 className="w-3.5 h-3.5 mt-0.5 text-blue-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold">Branch (Worktree)</div>
                      <div className="text-[10px] text-zinc-500">
                        Isolated git branch with non-colliding port.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Branch Name if mode === 'branch' */}
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

              {/* Agent Tool CLI */}
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
                    <option value="claude-code">Claude Code</option>
                    <option value="codex">OpenAI Codex</option>
                    <option value="aider">Aider</option>
                    <option value="custom">Custom Agent / Shell</option>
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
