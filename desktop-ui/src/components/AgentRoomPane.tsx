import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { OrbitalCanvasDeck, LIFECYCLE, LifecycleState } from './OrbitalCanvasDeck';
import {
  Users,
  Plus,
  Crown,
  X,
  Radio,
  Zap,
  Terminal,
  ArrowRight,
  RotateCw,
  Check,
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
    setActiveWorkspace,
    setActiveTab,
    createSession,
    syncMeshSkills,
    toggleRightPanel,
    ecoModeFps,
    setEcoModeFps,
    roomMessages,
  } = useWorkspaceStore();

  const [viewMode, setViewMode] = useState<'office' | 'stream'>('office');
  const [isAssignPopoverOpen, setIsAssignPopoverOpen] = useState(false);
  const [isNewRoomPromptOpen, setIsNewRoomPromptOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  const currentProject = activeProjectId ? projects[activeProjectId] : Object.values(projects)[0];
  const allSessions = Object.values(workspaces);

  // Active room isolation: current room id
  const currentRoomId = activeRoomId || rooms[0]?.id || 'room-1';
  const currentRoom = rooms.find((r) => r.id === currentRoomId) || rooms[0] || { id: 'room-1', name: 'Room 1' };

  // Sessions assigned to THIS room
  const roomSessions = allSessions.filter((w) => (w.roomId || 'room-1') === currentRoomId);
  // Sessions eligible to be assigned (1 room max: either unassigned or in another room)
  const assignableSessions = allSessions.filter((w) => (w.roomId || 'room-1') !== currentRoomId);

  const focusedSession = activeWorkspaceId ? workspaces[activeWorkspaceId] : roomSessions[0] || allSessions[0];

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

  const handleFocusSession = (sessionId: string) => {
    setActiveWorkspace(sessionId);
    setActiveTab('terminal');
  };

  const handleRemoveFromRoom = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setSessionRoom(sessionId, null);
  };

  const handleAssignSession = (sessionId: string) => {
    setSessionRoom(sessionId, currentRoomId);
    setIsAssignPopoverOpen(false);
  };

  const handleSpawnNewSessionIntoRoom = async (agentType: string) => {
    setIsAssignPopoverOpen(false);
    const targetProjId = activeProjectId || currentProject?.id;
    const newId = await createSession({
      projectId: targetProjId,
      name: `${agentType === 'terminal' ? 'Terminal' : agentType} ${allSessions.length + 1}`,
      sessionMode: 'local',
      agentType,
    });
    if (newId) {
      setSessionRoom(newId, currentRoomId);
      setActiveWorkspace(newId);
      setActiveTab('terminal');
    }
  };

  const handleClosePane = () => {
    if (onClose) {
      onClose();
    } else {
      toggleRightPanel();
    }
  };

  // Filter room stream messages
  const currentRoomMessages = roomMessages.filter(
    (m) => !m.roomId || m.roomId === 'all' || m.roomId === currentRoomId
  );

  // Derive active status & lifecycle badge for bottom passive strip
  const rawState = focusedSession?.agentStatus?.state;
  let derivedLifecycle: LifecycleState = 'IDLE';
  if (rawState === 'working') derivedLifecycle = 'CODING';
  else if (rawState === 'blocked') derivedLifecycle = 'NEEDS_INPUT';
  else if (rawState === 'done') derivedLifecycle = 'NEEDS_REVIEW';

  const lifecycleConfig = LIFECYCLE[derivedLifecycle] || LIFECYCLE.IDLE;

  return (
    <div
      style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
      className="flex-1 flex flex-col h-full overflow-hidden font-mono select-none relative"
    >
      {/* 1. Top Header Bar: AGENT ROOM MESH + FPS + Segmented Switcher + Close */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="h-10 px-2.5 border-b flex items-center justify-between gap-1.5 shrink-0"
      >
        {/* Brand Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded bg-zinc-800/80 border border-amber-500/40 flex items-center justify-center shrink-0">
            <Radio className="w-3 h-3 text-amber-400" />
          </div>
          <span className="font-bold text-[11px] tracking-wider text-zinc-100 truncate">
            AGENT ROOM MESH
          </span>
          <span className="text-[10px] text-zinc-500 font-normal">
            ({roomSessions.length})
          </span>
        </div>

        {/* Right Actions: FPS Eco/Ultra Switch + Office/Stream Segment + Sync + Close */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* FPS Toggle Button (15fps Eco vs 60fps Ultra) */}
          <button
            onClick={() => setEcoModeFps(ecoModeFps === 15 ? 60 : 15)}
            title={`Toggle rendering performance (Current: ${ecoModeFps} FPS)`}
            className={`h-5 px-1.5 rounded text-[9.5px] font-semibold border transition-colors ${
              ecoModeFps === 15
                ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400'
                : 'bg-cyan-950/60 border-cyan-700/80 text-cyan-300'
            }`}
          >
            {ecoModeFps}fps {ecoModeFps === 15 ? 'Eco' : 'Ultra'}
          </button>

          {/* Segmented View Switcher: Office | Stream */}
          <div className="inline-flex bg-zinc-950/80 border border-zinc-800 p-0.5 rounded gap-0.5">
            <button
              onClick={() => setViewMode('office')}
              className={`h-5 px-2 rounded text-[10px] font-semibold transition-colors ${
                viewMode === 'office'
                  ? 'bg-zinc-800 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Office
            </button>
            <button
              onClick={() => setViewMode('stream')}
              className={`h-5 px-2 rounded text-[10px] font-semibold transition-colors ${
                viewMode === 'stream'
                  ? 'bg-zinc-800 text-cyan-300 border border-cyan-500/30 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Stream
            </button>
          </div>

          {/* Sync Skills Quick Button */}
          <button
            onClick={handleSyncSkills}
            disabled={syncStatus === 'syncing'}
            title={syncMessage || 'Sync Dewwie room mesh rules & skills into project'}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            {syncStatus === 'syncing' ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin text-zinc-300" />
            ) : syncStatus === 'synced' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-zinc-400 hover:text-amber-300" />
            )}
          </button>

          {/* Close Panel Button (Enables Fullscreen TUI with 1 click) */}
          <button
            onClick={handleClosePane}
            title="Close Room Panel (Focus Fullscreen Terminal TUI)"
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Multi-Room Tab Bar */}
      <div
        style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
        className="h-8 px-2 border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
      >
        {rooms.map((r, idx) => {
          const isActive = r.id === currentRoomId;
          const count = allSessions.filter((s) => (s.roomId || 'room-1') === r.id).length;

          return (
            <div
              key={r.id}
              onClick={() => setActiveRoomId(r.id)}
              className={`group flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] cursor-pointer transition-colors shrink-0 ${
                isActive
                  ? 'bg-zinc-800/90 text-zinc-100 font-semibold border border-amber-500/50 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60 border border-transparent'
              }`}
            >
              <span>#{idx + 1} {r.name}</span>
              <span className={`text-[9px] px-1 rounded ${isActive ? 'bg-amber-950/60 text-amber-300' : 'bg-zinc-900 text-zinc-500'}`}>
                {count}
              </span>

              {rooms.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRoom(r.id);
                  }}
                  title="Remove Room"
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-rose-400 transition-opacity ml-0.5"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* Add Room Button */}
        <button
          onClick={() => setIsNewRoomPromptOpen(true)}
          title="Create New Room"
          className="h-5 px-2 rounded border border-dashed border-zinc-700 hover:border-amber-500 text-zinc-500 hover:text-amber-400 text-[10px] flex items-center gap-1 transition-colors shrink-0"
        >
          <Plus className="w-2.5 h-2.5" />
          <span>Room</span>
        </button>
      </div>

      {/* New Room Inline Form */}
      {isNewRoomPromptOpen && (
        <div className="p-2 border-b border-zinc-800 bg-zinc-950/90 z-20">
          <form onSubmit={handleCreateRoom} className="flex items-center gap-1.5">
            <input
              autoFocus
              type="text"
              placeholder="Room name (e.g. Frontend Team, QA Sandbox)..."
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="flex-1 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/60 text-amber-300 text-xs font-semibold"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setIsNewRoomPromptOpen(false)}
              className="p-1 text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3 h-3" />
            </button>
          </form>
        </div>
      )}

      {/* 3. Active Room Session Pill Strip + Assign Button */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="h-8 px-2 border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
      >
        {roomSessions.map((ws) => {
          const isFocused = activeWorkspaceId === ws.id;
          const isLead = ws.id === leadSessionId || ws.agentRole === 'lead';
          const isWorking = ws.agentStatus?.state === 'working';

          return (
            <div
              key={ws.id}
              onClick={() => handleFocusSession(ws.id)}
              title={`${ws.name} • Click to focus left terminal`}
              className={`group flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] cursor-pointer transition-all shrink-0 ${
                isFocused
                  ? 'bg-amber-950/40 border border-amber-500/70 text-zinc-100 shadow-xs'
                  : 'bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {isLead ? (
                <Crown className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              ) : (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isWorking ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                  }`}
                />
              )}
              <span className="truncate max-w-[90px]">@{ws.name}</span>

              {/* Remove from Room */}
              <button
                onClick={(e) => handleRemoveFromRoom(e, ws.id)}
                title="Remove session from room"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-rose-400 transition-opacity ml-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}

        {/* + Assign (1 room max) Button */}
        <div className="relative shrink-0">
          <button
            onClick={() => setIsAssignPopoverOpen(!isAssignPopoverOpen)}
            className="h-5 px-2 rounded border border-dashed border-cyan-700/80 hover:border-cyan-400 text-cyan-400 hover:text-cyan-300 text-[10px] flex items-center gap-1 transition-colors"
          >
            <Plus className="w-2.5 h-2.5" />
            <span>Assign (1 room max)</span>
          </button>

          {/* Exclusive Room Assignment Popover */}
          {isAssignPopoverOpen && (
            <div
              className="absolute left-0 top-7 w-64 bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl p-2 z-50 text-xs font-mono"
              onMouseLeave={() => setIsAssignPopoverOpen(false)}
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800 text-[9px] text-zinc-500 font-semibold uppercase tracking-wider">
                <span>Assign Session to {currentRoom.name}</span>
                <button onClick={() => setIsAssignPopoverOpen(false)} className="hover:text-zinc-300">
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Section A: Move Existing Sessions */}
              <div className="py-1 max-h-36 overflow-y-auto no-scrollbar space-y-1">
                {assignableSessions.length === 0 ? (
                  <div className="py-2 text-[10px] text-zinc-500 text-center">
                    All current sessions are in this room.
                  </div>
                ) : (
                  assignableSessions.map((s) => {
                    const otherRoomName = rooms.find((r) => r.id === s.roomId)?.name || 'Unassigned';
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleAssignSession(s.id)}
                        className="w-full px-2 py-1 flex items-center justify-between rounded bg-zinc-900/60 hover:bg-zinc-800 text-left text-zinc-300 hover:text-white transition-colors"
                      >
                        <span className="truncate text-[11px]">@{s.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-950 border border-zinc-800 text-amber-400 shrink-0 ml-1">
                          {s.roomId ? `Move from ${otherRoomName}` : 'Assign'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Section B: Spawn New Agent Directly */}
              <div className="pt-2 border-t border-zinc-800/80 space-y-1">
                <div className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider">
                  Spawn Agent into {currentRoom.name}
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <button
                    onClick={() => handleSpawnNewSessionIntoRoom('claude-code')}
                    className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white truncate"
                  >
                    Claude Code
                  </button>
                  <button
                    onClick={() => handleSpawnNewSessionIntoRoom('antigravity')}
                    className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white truncate"
                  >
                    Antigravity
                  </button>
                  <button
                    onClick={() => handleSpawnNewSessionIntoRoom('gemini')}
                    className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white truncate"
                  >
                    Gemini
                  </button>
                  <button
                    onClick={() => handleSpawnNewSessionIntoRoom('terminal')}
                    className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white truncate flex items-center justify-center gap-1"
                  >
                    <Terminal className="w-2.5 h-2.5" />
                    <span>Terminal</span>
                  </button>
                </div>
                {onOpenDelegateModal && (
                  <button
                    onClick={() => {
                      setIsAssignPopoverOpen(false);
                      onOpenDelegateModal();
                    }}
                    className="w-full mt-1 p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-amber-300/90 hover:text-amber-200 text-[10px] flex items-center justify-center gap-1"
                  >
                    <Users className="w-3 h-3 text-amber-400" />
                    <span>Delegate Task to Worktree...</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Main Body: Office (HTML5 Canvas Deck) OR Stream (Chronological Feed) */}
      <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        {viewMode === 'office' ? (
          <div className="w-full h-full relative">
            <OrbitalCanvasDeck
              workspaces={workspaces}
              activeRoomId={currentRoomId}
              focusedSessionId={activeWorkspaceId}
              leadSessionId={leadSessionId}
              ecoModeFps={ecoModeFps}
              onFocusSession={handleFocusSession}
              handoffTriggerKey={currentRoomMessages.length}
            />

            {/* If room is completely empty, render a non-intrusive floating helper overlay */}
            {roomSessions.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
                <div className="pointer-events-auto max-w-xs p-4 rounded-xl bg-zinc-950/85 border border-zinc-800 backdrop-blur-md shadow-2xl">
                  <Users className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-zinc-200 mb-1">Room Deck Standing By</p>
                  <p className="text-[11px] text-zinc-500 mb-3">
                    Assign existing sessions or spawn agents to populate the workstations in this room.
                  </p>
                  <button
                    onClick={() => setIsAssignPopoverOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Assign Sessions</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Stream View Panel: Passive Chronological Room Activity Feed */
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {currentRoomMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                <Radio className="w-8 h-8 text-zinc-700 mb-2" />
                <p className="text-xs font-semibold text-zinc-400 mb-1">No Room Activity Yet</p>
                <p className="text-[11px] text-zinc-600 max-w-xs">
                  Agents in {currentRoom.name} will stream lifecycle state transitions, tool calls, and delegations here.
                </p>
              </div>
            ) : (
              currentRoomMessages.map((msg, idx) => {
                const senderWs = allSessions.find((s) => s.id === msg.fromSessionId);
                const tag = msg.type?.toUpperCase() || 'CHAT';
                const tagColor =
                  tag === 'DELEGATE'
                    ? 'border-amber-600/80 text-amber-300 bg-amber-950/40'
                    : tag === 'REVIEW'
                    ? 'border-emerald-600/80 text-emerald-300 bg-emerald-950/40'
                    : tag === 'SIGNAL'
                    ? 'border-rose-600/80 text-rose-300 bg-rose-950/40'
                    : tag === 'TOOL'
                    ? 'border-sky-600/80 text-sky-300 bg-sky-950/40'
                    : 'border-zinc-700 text-zinc-300 bg-zinc-900/60';

                return (
                  <div
                    key={msg.id || idx}
                    onClick={() => msg.fromSessionId && handleFocusSession(msg.fromSessionId)}
                    title="Click to redirect left terminal to this session"
                    className="p-2.5 rounded-lg border border-zinc-800/80 bg-zinc-950/60 hover:bg-zinc-900/50 hover:border-zinc-700 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-zinc-200">
                          @{msg.fromSessionName || senderWs?.name || 'agent'}
                        </span>
                        {msg.target && msg.target !== '@all' && (
                          <span className="text-zinc-500 font-mono text-[9px] flex items-center gap-1">
                            <span>➔</span>
                            <span className="text-zinc-300 font-semibold">{msg.target}</span>
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded border text-[8.5px] font-semibold tracking-wider ${tagColor}`}>
                          {tag}
                        </span>
                      </div>
                      <span className="text-[9px] text-zinc-500 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-300 break-words leading-relaxed font-mono">
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 5. Bottom Passive Status Strip (Zero Chat Box, Zero Input Forms) */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="h-10 px-3 border-t flex flex-col justify-center text-[10px] font-mono shrink-0"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-zinc-500">PTY:</span>
            <span className="text-zinc-200 font-semibold truncate">
              @{focusedSession?.name || 'Local Shell'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              style={{
                color: lifecycleConfig.color,
                backgroundColor: `${lifecycleConfig.color}15`,
                borderColor: `${lifecycleConfig.color}40`,
              }}
              className="px-1.5 py-0.2 rounded text-[9px] font-bold border uppercase"
            >
              {lifecycleConfig.badge}
            </span>
            <button
              onClick={() => focusedSession && handleFocusSession(focusedSession.id)}
              title="Focus in left terminal"
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="text-[9px] text-zinc-500 truncate mt-0.5">
          {focusedSession?.agentStatus?.message || `${focusedSession?.projectName || 'Project'} workspace ready`}
        </div>
      </div>
    </div>
  );
};

export default AgentRoomPane;
