import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { getAgentIcon } from './AgentIcons';
import {
  Users,
  ChevronDown,
  Check,
  Plus,
  Crown,
  Zap,
  RotateCw,
  Terminal,
  X,
  ArrowRight,
  MinusCircle,
} from 'lucide-react';

interface AgentRoomPaneProps {
  onOpenDelegateModal?: () => void;
  onClose?: () => void;
}

export const AgentRoomPane: React.FC<AgentRoomPaneProps> = ({ onOpenDelegateModal, onClose }) => {
  const {
    rooms,
    activeRoomId,
    setActiveRoomId,
    addRoom,
    removeRoom,
    setSessionRoom,
    workspaces,
    activeWorkspaceId,
    activeProjectId,
    projects,
    leadSessionId,
    setSessionRole,
    setActiveWorkspace,
    setActiveTab,
    createSession,
    syncMeshSkills,
    toggleRightPanel,
  } = useWorkspaceStore();

  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isNewRoomPromptOpen, setIsNewRoomPromptOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  const currentProject = activeProjectId ? projects[activeProjectId] : Object.values(projects)[0];
  const allSessions = Object.values(workspaces);

  // Filter sessions that belong to the active room
  const currentRoomId = activeRoomId || rooms[0]?.id || 'room-1';
  const roomSessions = allSessions.filter((w) => (w.roomId || 'room-1') === currentRoomId);
  const availableSessions = allSessions.filter((w) => (w.roomId || 'room-1') !== currentRoomId);

  const handleSyncSkills = async () => {
    setSyncStatus('syncing');
    setSyncMessage('Injecting Dewwie protocols & rules...');
    try {
      const res = await syncMeshSkills(currentProject?.rootPath);
      if (res.success) {
        setSyncStatus('synced');
        setSyncMessage(res.message);
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        setSyncStatus('error');
        setSyncMessage(res.message);
        setTimeout(() => setSyncStatus('idle'), 4000);
      }
    } catch (err: unknown) {
      setSyncStatus('error');
      setSyncMessage(err instanceof Error ? err.message : 'Skill synchronization failed');
      setTimeout(() => setSyncStatus('idle'), 4000);
    }
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    addRoom(newRoomName.trim());
    setNewRoomName('');
    setIsNewRoomPromptOpen(false);
  };

  const handleSpawnAgentIntoRoom = async (agentType: string) => {
    setIsAddMenuOpen(false);
    const targetProjId = activeProjectId || currentProject?.id;
    const newId = await createSession({
      projectId: targetProjId,
      name: `${agentType === 'terminal' ? 'terminal' : agentType} ${allSessions.length + 1}`,
      sessionMode: 'local',
      agentType,
    });
    if (newId) {
      setSessionRoom(newId, currentRoomId);
      setActiveWorkspace(newId);
      setActiveTab('terminal');
    }
  };

  const handleAddExistingSession = (sessionId: string) => {
    setSessionRoom(sessionId, currentRoomId);
    setIsAddMenuOpen(false);
  };

  const handleFocusSession = (sessionId: string) => {
    setActiveWorkspace(sessionId);
    setActiveTab('terminal');
  };

  const handleRemoveFromRoom = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setSessionRoom(sessionId, null);
  };

  const handleClosePane = () => {
    if (onClose) {
      onClose();
    } else {
      toggleRightPanel();
    }
  };

  return (
    <div
      style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
      className="flex-1 flex flex-col h-full overflow-hidden font-mono select-none"
    >
      {/* 1. Header: Rooms Navigation Bar + Sync + Add Agent + Fullscreen TUI Close Button */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="h-9 px-2 border-b flex items-center justify-between gap-1.5 shrink-0"
      >
        {/* Left: Room Switcher Tabs */}
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
          {rooms.map((r) => {
            const isRoomActive = r.id === currentRoomId;
            const count = allSessions.filter((s) => (s.roomId || 'room-1') === r.id).length;

            return (
              <div
                key={r.id}
                onClick={() => setActiveRoomId(r.id)}
                className={`group flex items-center gap-1 px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors shrink-0 ${
                  isRoomActive
                    ? 'bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60 border border-transparent'
                }`}
              >
                <span>{r.name}</span>
                <span className="text-[10px] text-zinc-500 font-normal">({count})</span>

                {rooms.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRoom(r.id);
                    }}
                    title="Delete Room"
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 ml-0.5 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add Room Tab Button */}
          <button
            onClick={() => setIsNewRoomPromptOpen(true)}
            title="Create New Multi-Agent Room"
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors shrink-0"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Right Actions: Sync Skills + Add Session + Close Panel */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Sync Skills Button */}
          <button
            onClick={handleSyncSkills}
            disabled={syncStatus === 'syncing'}
            title={syncMessage || 'Inject Dewwie room protocol, CLAUDE.md, and .gemini rules into project'}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
              syncStatus === 'synced'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                : syncStatus === 'error'
                ? 'bg-rose-950/80 border-rose-800 text-rose-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
            }`}
          >
            {syncStatus === 'syncing' ? (
              <RotateCw className="w-2.5 h-2.5 text-zinc-400 animate-spin" />
            ) : syncStatus === 'synced' ? (
              <Check className="w-2.5 h-2.5 text-emerald-400" />
            ) : (
              <Zap className="w-2.5 h-2.5 text-zinc-400" />
            )}
            <span className="hidden sm:inline">{syncStatus === 'synced' ? 'Synced' : 'Sync'}</span>
          </button>

          {/* + Add Agent / Session Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 transition-colors"
            >
              <Plus className="w-3 h-3 text-zinc-400" />
              <span>Add</span>
              <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
            </button>

            {isAddMenuOpen && (
              <div
                className="absolute right-0 top-7 w-56 bg-zinc-950 border border-zinc-800 rounded shadow-xl py-1 z-50 text-xs font-mono"
                onMouseLeave={() => setIsAddMenuOpen(false)}
              >
                {/* Section A: Move Existing Session to this Room */}
                {availableSessions.length > 0 && (
                  <>
                    <div className="px-2.5 py-1 text-[9px] text-zinc-500 uppercase tracking-wider font-semibold border-b border-zinc-900">
                      Add Existing Session
                    </div>
                    <div className="max-h-32 overflow-y-auto no-scrollbar py-0.5">
                      {availableSessions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleAddExistingSession(s.id)}
                          className="w-full px-2.5 py-1 flex items-center justify-between hover:bg-zinc-900 text-left text-zinc-300 hover:text-white transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {getAgentIcon(s.agentType, 'w-3 h-3 shrink-0')}
                            <span className="truncate text-[11px]">{s.name}</span>
                          </div>
                          <span className="text-[9px] text-zinc-600 font-mono shrink-0 ml-1">
                            {s.roomId || 'unassigned'}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="h-px bg-zinc-800/80 my-1" />
                  </>
                )}

                {/* Section B: Spawn New Agent Directly Into This Room */}
                <div className="px-2.5 py-1 text-[9px] text-zinc-500 uppercase tracking-wider font-semibold border-b border-zinc-900">
                  Spawn Agent into Room
                </div>
                <button
                  onClick={() => handleSpawnAgentIntoRoom('claude-code')}
                  className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-900 text-left text-zinc-200 hover:text-white transition-colors"
                >
                  {getAgentIcon('claude-code', 'w-3.5 h-3.5')}
                  <span>Claude Code</span>
                </button>
                <button
                  onClick={() => handleSpawnAgentIntoRoom('antigravity')}
                  className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-900 text-left text-zinc-200 hover:text-white transition-colors"
                >
                  {getAgentIcon('antigravity', 'w-3.5 h-3.5')}
                  <span>Google Antigravity</span>
                </button>
                <button
                  onClick={() => handleSpawnAgentIntoRoom('gemini')}
                  className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-900 text-left text-zinc-200 hover:text-white transition-colors"
                >
                  {getAgentIcon('gemini', 'w-3.5 h-3.5')}
                  <span>Gemini</span>
                </button>
                <button
                  onClick={() => handleSpawnAgentIntoRoom('terminal')}
                  className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-900 text-left text-zinc-200 hover:text-white transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Shell Terminal</span>
                </button>
                {onOpenDelegateModal && (
                  <>
                    <div className="h-px bg-zinc-800/80 my-1" />
                    <button
                      onClick={() => {
                        setIsAddMenuOpen(false);
                        onOpenDelegateModal();
                      }}
                      className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-900 text-left text-zinc-300 hover:text-white transition-colors"
                    >
                      <Users className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Delegate Task to Worktree...</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Close Panel Button (Full Screen TUI) */}
          <button
            onClick={handleClosePane}
            title="Close Panel (Focus Fullscreen Terminal TUI)"
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. New Room Modal Form */}
      {isNewRoomPromptOpen && (
        <div className="p-2 border-b border-zinc-800 bg-zinc-950/80">
          <form onSubmit={handleCreateRoom} className="flex items-center gap-1.5">
            <input
              autoFocus
              type="text"
              placeholder="Room name (e.g. Backend Mesh, Code Review)..."
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="flex-1 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
            />
            <button
              type="submit"
              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setIsNewRoomPromptOpen(false)}
              className="p-1 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* 3. Room Sessions Grid / Cards Stack */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {roomSessions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-zinc-500">
            <Users className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-xs font-semibold text-zinc-300 mb-1">No Agents in this Room</p>
            <p className="text-[11px] text-zinc-500 max-w-xs mb-4">
              Add sessions to this room to collaborate in parallel. Each session belongs to one room.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAddMenuOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Session to Room</span>
              </button>
            </div>
          </div>
        ) : (
          roomSessions.map((ws, idx) => {
            const isActive = activeWorkspaceId === ws.id;
            const isLead = ws.agentRole === 'lead' || ws.id === leadSessionId;
            const state = ws.agentStatus?.state;
            const isWorking = state === 'working';
            const isError = state === 'blocked' && !!ws.agentStatus?.message?.toLowerCase().includes('err');
            const isBlocked = state === 'blocked' && !isError;
            const isDone = state === 'done';

            return (
              <div
                key={ws.id}
                onClick={() => handleFocusSession(ws.id)}
                className={`group relative rounded-lg border p-3 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-zinc-900/90 border-zinc-600 ring-1 ring-zinc-500 shadow-sm'
                    : 'bg-zinc-950/60 hover:bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                {/* Header Row: Agent Icon + Session Name + Status & Role */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {getAgentIcon(ws.agentType, 'w-4 h-4 shrink-0')}
                    <span className="font-semibold text-xs text-zinc-100 truncate">
                      {ws.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">#{idx + 1}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Active in Left Terminal Indicator Badge */}
                    {isActive && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-200">
                        Active Terminal
                      </span>
                    )}

                    {/* Lead Role Badge */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessionRole(ws.id, isLead ? 'worker' : 'lead');
                      }}
                      title={isLead ? 'Session is Room Lead (Click to demote)' : 'Click to promote to Lead'}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-semibold border transition-colors ${
                        isLead
                          ? 'bg-amber-950/60 border-amber-700/80 text-amber-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Crown className="w-2.5 h-2.5" />
                      <span>{isLead ? 'LEAD' : 'WORKER'}</span>
                    </button>
                  </div>
                </div>

                {/* Status Message Line */}
                <div className="flex items-center gap-2 text-xs mb-2">
                  <div className="shrink-0">
                    {isWorking ? (
                      <RotateCw className="w-3 h-3 text-zinc-300 animate-spin" />
                    ) : isError ? (
                      <span className="w-3 h-3 rounded-full bg-rose-500/20 text-rose-400 font-bold inline-flex items-center justify-center text-[10px]">
                        !
                      </span>
                    ) : isBlocked ? (
                      <span className="w-3 h-3 rounded-full bg-amber-500/20 text-amber-400 font-bold inline-flex items-center justify-center text-[10px]">
                        ?
                      </span>
                    ) : isDone ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <span className="text-zinc-600 font-mono text-xs">~</span>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-300 truncate">
                    {ws.agentStatus?.message || 'Idle in room'}
                  </span>
                </div>

                {/* Metadata & Diff Info */}
                <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono border-t border-zinc-900 pt-2">
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{ws.projectName || ws.repository}</span>
                    {ws.branch && ws.sessionMode === 'branch' && (
                      <>
                        <span>•</span>
                        <span className="text-zinc-400 truncate">{ws.branch}</span>
                      </>
                    )}
                  </div>

                  {ws.diffSummary && (ws.diffSummary.additions > 0 || ws.diffSummary.deletions > 0) && (
                    <span className="shrink-0">
                      <span className="text-emerald-400">+{ws.diffSummary.additions}</span>{' '}
                      <span className="text-rose-400">-{ws.diffSummary.deletions}</span>
                    </span>
                  )}
                </div>

                {/* Card Action Controls */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-zinc-900/60">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFocusSession(ws.id);
                    }}
                    title="Focus this session in the left terminal pane"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                  >
                    <ArrowRight className="w-2.5 h-2.5" />
                    <span>Focus Terminal</span>
                  </button>

                  <button
                    onClick={(e) => handleRemoveFromRoom(e, ws.id)}
                    title="Remove this session from current room"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 transition-colors"
                  >
                    <MinusCircle className="w-2.5 h-2.5" />
                    <span>Leave Room</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Minimal Bottom Room Footer */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="h-7 px-3 border-t flex items-center justify-between text-[10px] font-mono text-zinc-500 shrink-0"
      >
        <span>
          {roomSessions.length} {roomSessions.length === 1 ? 'agent' : 'agents'} active in {rooms.find((r) => r.id === currentRoomId)?.name || 'Room'}
        </span>
        <button
          onClick={handleClosePane}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Close room panel to work solely in fullscreen TUI"
        >
          Close Panel (Fullscreen TUI)
        </button>
      </div>
    </div>
  );
};

export default AgentRoomPane;
