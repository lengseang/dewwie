import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { OrbitalCanvasDeck, LIFECYCLE, LifecycleState } from './OrbitalCanvasDeck';
import { getAgentIcon } from './AgentIcons';
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
  Send,
  Sparkles,
} from 'lucide-react';

interface AgentRoomPaneProps {
  onOpenDelegateModal?: () => void;
  onClose?: () => void;
}

export const AgentRoomPane: React.FC<AgentRoomPaneProps> = ({ onOpenDelegateModal: _onOpenDelegateModal, onClose }) => {
  const {
    rooms,
    activeRoomId,
    setActiveRoomId,
    addRoom,
    removeRoom,
    setSessionRoom,
    setSessionRole,
    postRoomMessage,
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
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isNewRoomPromptOpen, setIsNewRoomPromptOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  // In-room quick CLI & chat state
  const [commandInput, setCommandInput] = useState('');
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);

  const currentProject = activeProjectId ? projects[activeProjectId] : Object.values(projects)[0];
  const allSessions = Object.values(workspaces);

  // Active room isolation
  const currentRoomId = activeRoomId || rooms[0]?.id || 'room-1';
  const currentRoom = rooms.find((r) => r.id === currentRoomId) || rooms[0] || { id: 'room-1', name: 'Frontend Team' };

  // Sessions assigned to THIS room (strict 1-room-max)
  const roomSessions = allSessions.filter((w) => w.roomId === currentRoomId);

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
    const newId = addRoom(newRoomName.trim());
    if (newId) setActiveRoomId(newId);
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

  const handleSpawnNewSessionIntoRoom = async (agentType: string) => {
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
      setIsAssignModalOpen(false);
    }
  };

  const handleClosePane = () => {
    if (onClose) {
      onClose();
    } else {
      toggleRightPanel();
    }
  };

  // In-Room CLI command parser & chat dispatcher
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = commandInput.trim();
    if (!raw) return;

    if (raw.startsWith('/assign ') || raw.startsWith('/add ')) {
      const targetName = raw.replace(/^\/(assign|add)\s+/, '').replace(/^@/, '').trim().toLowerCase();
      const matched = allSessions.find(
        (s) => s.name.toLowerCase() === targetName || s.id.toLowerCase() === targetName || s.branch?.toLowerCase() === targetName
      );
      if (matched) {
        setSessionRoom(matched.id, currentRoomId);
        setCommandFeedback(`✓ Assigned @${matched.name} to ${currentRoom.name}`);
      } else {
        setCommandFeedback(`⚠ Session '${targetName}' not found`);
      }
    } else if (raw.startsWith('/remove ') || raw.startsWith('/unassign ')) {
      const targetName = raw.replace(/^\/(remove|unassign)\s+/, '').replace(/^@/, '').trim().toLowerCase();
      const matched = allSessions.find(
        (s) => s.name.toLowerCase() === targetName || s.id.toLowerCase() === targetName || s.branch?.toLowerCase() === targetName
      );
      if (matched) {
        setSessionRoom(matched.id, null);
        setCommandFeedback(`✓ Removed @${matched.name} from room`);
      } else {
        setCommandFeedback(`⚠ Session '${targetName}' not found`);
      }
    } else if (raw.startsWith('/room new ') || raw.startsWith('/create ') || raw.startsWith('/new ')) {
      const roomName = raw.replace(/^\/(room new|create|new)\s+/, '').trim();
      if (roomName) {
        const newId = addRoom(roomName);
        if (newId) setActiveRoomId(newId);
        setCommandFeedback(`✓ Created room '${roomName}'`);
      }
    } else if (raw.startsWith('/lead ')) {
      const targetName = raw.replace(/^\/lead\s+/, '').replace(/^@/, '').trim().toLowerCase();
      const matched = allSessions.find(
        (s) => s.name.toLowerCase() === targetName || s.id.toLowerCase() === targetName
      );
      if (matched) {
        setSessionRole(matched.id, 'lead');
        setCommandFeedback(`✓ Promoted @${matched.name} to Lead Agent`);
      } else {
        setCommandFeedback(`⚠ Session '${targetName}' not found`);
      }
    } else {
      // Normal broadcast chat message into room stream
      postRoomMessage({ content: raw, target: '@all', type: 'chat' });
      setCommandFeedback(`✓ Broadcast sent to room`);
    }

    setCommandInput('');
    setTimeout(() => setCommandFeedback(null), 3500);
  };

  // Filter room stream messages
  const currentRoomMessages = roomMessages.filter(
    (m) => !m.roomId || m.roomId === 'all' || m.roomId === currentRoomId
  );

  // Derive active status & lifecycle badge
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
      {/* 1. Top Header Bar: AGENT ROOM MESH + FPS + Segmented Switcher + Sync + Close */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="h-10 px-2.5 border-b flex items-center justify-between gap-1.5 shrink-0"
      >
        {/* Brand Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)' }}
            className="w-5 h-5 rounded border flex items-center justify-center shrink-0"
          >
            <Radio className="w-3 h-3 text-amber-400" />
          </div>
          <span className="font-bold text-[11px] tracking-wider truncate" style={{ color: 'var(--app-text)' }}>
            AGENT MESH
          </span>
          <span className="text-[10px] font-normal" style={{ color: 'var(--app-text-muted)' }}>
            ({roomSessions.length})
          </span>
        </div>

        {/* Right Actions */}
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
          <div
            style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)' }}
            className="inline-flex border p-0.5 rounded gap-0.5"
          >
            <button
              onClick={() => setViewMode('office')}
              style={viewMode === 'office' ? {
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              } : undefined}
              className={`h-5 px-2 rounded text-[10px] font-semibold transition-colors ${
                viewMode === 'office'
                  ? 'border shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Office
            </button>
            <button
              onClick={() => setViewMode('stream')}
              style={viewMode === 'stream' ? {
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              } : undefined}
              className={`h-5 px-2 rounded text-[10px] font-semibold transition-colors ${
                viewMode === 'stream'
                  ? 'border shadow-xs'
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

          {/* Close Panel Button */}
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
          const count = allSessions.filter((s) => s.roomId === r.id).length;

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
        <div
          style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
          className="p-2 border-b z-20"
        >
          <form onSubmit={handleCreateRoom} className="flex items-center gap-1.5">
            <input
              autoFocus
              type="text"
              placeholder="Room name (e.g. Frontend, QA, Core)..."
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              }}
              className="flex-1 px-2 py-1 border rounded text-xs placeholder-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/60 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 transition-colors"
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
              title={`${ws.name} • Click to focus terminal`}
              style={!isFocused ? {
                backgroundColor: 'var(--app-surface-elevated)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              } : undefined}
              className={`group flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] cursor-pointer transition-all shrink-0 ${
                isFocused
                  ? 'bg-amber-950/40 border border-amber-500/70 text-zinc-100 shadow-xs'
                  : 'hover:opacity-90 border'
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

        {/* Dedicated Assign Sessions Button (Opens full modal) */}
        <button
          onClick={() => setIsAssignModalOpen(true)}
          title="Assign or move sessions into this room"
          className="h-5 px-2 rounded border border-dashed border-amber-500/60 hover:border-amber-400 text-amber-400 hover:text-amber-300 text-[10px] flex items-center gap-1 transition-colors shrink-0"
        >
          <Plus className="w-2.5 h-2.5" />
          <span>Assign ({roomSessions.length})</span>
        </button>
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

            {/* If room has zero assigned sessions, render clear invitation card */}
            {roomSessions.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
                <div
                  style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
                  className="pointer-events-auto max-w-xs p-3.5 rounded-lg border backdrop-blur-md shadow-lg"
                >
                  <Users className="w-6 h-6 text-amber-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--app-text)' }}>Empty Room</p>
                  <p className="text-[11px] mb-2.5" style={{ color: 'var(--app-text-muted)' }}>
                    No agents in <span className="font-semibold text-amber-400">{currentRoom.name}</span>
                  </p>
                  <button
                    onClick={() => setIsAssignModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Agent</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Stream View Panel: Passive Chronological Room Activity Feed */
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {currentRoomMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center" style={{ color: 'var(--app-text-muted)' }}>
                <Radio className="w-6 h-6 mb-1.5 opacity-60" />
                <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--app-text)' }}>No Activity</p>
                <p className="text-[11px]">Room messages will stream here</p>
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

      {/* 5. Interactive In-Room CLI Bar & Status Strip */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="border-t flex flex-col shrink-0 text-[10px] font-mono"
      >
        {/* CLI Command / Chat Input Bar */}
        <form onSubmit={handleCommandSubmit} className="flex items-center gap-1.5 px-2 py-1.5 border-b border-zinc-800/80 bg-zinc-950/90">
          <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold shrink-0">
            <span>#{currentRoom.name.toLowerCase().replace(/\s+/g, '-')}&gt;</span>
          </div>
          <input
            type="text"
            placeholder="Type /assign @name, /remove @name, /create <room>, or broadcast..."
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            className="flex-1 bg-transparent text-[11px] font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none"
          />
          <button
            type="submit"
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-semibold flex items-center gap-1 transition-colors shrink-0"
          >
            <Send className="w-2.5 h-2.5" />
            <span>Send</span>
          </button>
        </form>

        {/* Command Feedback Banner */}
        {commandFeedback && (
          <div className="px-2.5 py-1 bg-amber-950/60 border-b border-amber-800/80 text-amber-300 text-[10px] flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
            <span>{commandFeedback}</span>
          </div>
        )}

        {/* Status Strip: Active PTY & Lifecycle Badge */}
        <div className="h-8 px-2.5 flex items-center justify-between">
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
      </div>

      {/* 6. Clean Session Assignment Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs font-mono text-xs">
          <div
            style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
            className="border rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden"
          >
            {/* Modal Header */}
            <div
              style={{ backgroundColor: 'var(--app-nav-bg)', borderColor: 'var(--app-border)' }}
              className="px-3.5 py-2.5 border-b flex items-center justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-xs truncate" style={{ color: 'var(--app-text)' }}>
                    Agents • {currentRoom.name}
                  </h3>
                  <p className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
                    Assign sessions to this room (1 room max)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1 rounded transition-colors hover:opacity-80"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Modal Body: Available Sessions */}
            <div className="p-3.5 overflow-y-auto space-y-3 flex-1">
              <div className="flex items-center justify-between pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                <span>Sessions ({allSessions.length})</span>
                <button
                  onClick={() => {
                    allSessions.forEach((s) => {
                      if (s.projectId === currentProject?.id || !s.roomId) {
                        setSessionRoom(s.id, currentRoomId);
                      }
                    });
                  }}
                  className="text-amber-400 hover:text-amber-300 transition-colors"
                >
                  + Assign All
                </button>
              </div>

              <div className="space-y-1.5">
                {allSessions.map((s) => {
                  const isCurrent = s.roomId === currentRoomId;
                  const otherRoomName = rooms.find((r) => r.id === s.roomId)?.name;

                  return (
                    <div
                      key={s.id}
                      style={{
                        backgroundColor: isCurrent ? 'var(--app-surface-elevated)' : 'var(--app-bg)',
                        borderColor: isCurrent ? 'var(--app-accent)' : 'var(--app-border)',
                      }}
                      className="p-2 rounded border flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {getAgentIcon(s.agentType, 'w-3.5 h-3.5 shrink-0')}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-xs truncate" style={{ color: 'var(--app-text)' }}>@{s.name}</span>
                            {s.agentRole === 'lead' && (
                              <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                            )}
                            <span
                              style={{ backgroundColor: 'var(--app-surface)', color: 'var(--app-text-muted)' }}
                              className="text-[9px] px-1 py-0.2 rounded font-mono"
                            >
                              {s.projectName || 'Default'}
                            </span>
                          </div>
                          <div className="text-[10px] truncate flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                            <span>{s.branch ? `branch: ${s.branch}` : 'local'}</span>
                            <span>•</span>
                            <span className={isCurrent ? 'text-emerald-500 font-semibold' : s.roomId ? 'text-amber-500' : ''}>
                              {isCurrent ? `In Room` : otherRoomName ? `In ${otherRoomName}` : 'Unassigned'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 1-Click Assign / Remove Button */}
                      <div>
                        {isCurrent ? (
                          <button
                            onClick={() => setSessionRoom(s.id, null)}
                            className="px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setSessionRoom(s.id, currentRoomId)}
                            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 text-amber-300 text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>{s.roomId ? 'Move' : 'Add'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Spawn New Agent Section */}
              <div className="pt-2.5 border-t" style={{ borderColor: 'var(--app-border)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--app-text-muted)' }}>
                  Spawn New Agent
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => handleSpawnNewSessionIntoRoom('terminal')}
                    style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    className="p-1.5 rounded border text-[10px] flex items-center justify-center gap-1 transition-colors hover:opacity-80"
                  >
                    <Terminal className="w-3 h-3" style={{ color: 'var(--app-text-muted)' }} />
                    <span>Terminal</span>
                  </button>
                  <button
                    onClick={() => handleSpawnNewSessionIntoRoom('claude-code')}
                    style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    className="p-1.5 rounded border text-[10px] flex items-center justify-center gap-1 transition-colors hover:opacity-80"
                  >
                    {getAgentIcon('claude-code', 'w-3 h-3')}
                    <span>Claude</span>
                  </button>
                  <button
                    onClick={() => handleSpawnNewSessionIntoRoom('antigravity')}
                    style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    className="p-1.5 rounded border text-[10px] flex items-center justify-center gap-1 transition-colors hover:opacity-80"
                  >
                    {getAgentIcon('antigravity', 'w-3 h-3')}
                    <span>Antigravity</span>
                  </button>
                  <button
                    onClick={() => handleSpawnNewSessionIntoRoom('gemini')}
                    style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    className="p-1.5 rounded border text-[10px] flex items-center justify-center gap-1 transition-colors hover:opacity-80"
                  >
                    {getAgentIcon('gemini', 'w-3 h-3')}
                    <span>Gemini</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{ backgroundColor: 'var(--app-nav-bg)', borderColor: 'var(--app-border)' }}
              className="px-3.5 py-2 border-t flex items-center justify-between"
            >
              <span className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
                {roomSessions.length} session{roomSessions.length !== 1 ? 's' : ''} in room
              </span>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                className="px-3 py-1 rounded border text-xs font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentRoomPane;
