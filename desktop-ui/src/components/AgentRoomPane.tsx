import React, { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { RoomMessageType, AgentRole } from '../types';
import { getAgentIcon } from './AgentIcons';
import {
  Users,
  Send,
  MessageSquare,
  ChevronDown,
  Play,
  Check,
  GitMerge,
  AlertCircle,
  Plus,
  ExternalLink,
  Crown,
  Zap,
  RotateCw,
  Terminal,
  FolderGit2,
} from 'lucide-react';

interface AgentRoomPaneProps {
  onOpenDelegateModal?: () => void;
}

export const AgentRoomPane: React.FC<AgentRoomPaneProps> = ({ onOpenDelegateModal }) => {
  const {
    workspaces,
    activeWorkspaceId,
    activeProjectId,
    projects,
    roomMessages,
    leadSessionId,
    postRoomMessage,
    setSessionRole,
    runWorktreeTests,
    mergeWorktree,
    setActiveWorkspace,
    createSession,
    sendTerminalInput,
    syncMeshSkills,
  } = useWorkspaceStore();

  const [inputContent, setInputContent] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string>('@all');
  const [selectedType, setSelectedType] = useState<RoomMessageType>('chat');
  const [injectToStdin, setInjectToStdin] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [sentFeedback, setSentFeedback] = useState<Record<string, boolean>>({});
  const [testStates, setTestStates] = useState<Record<string, { running: boolean; success?: boolean; output?: string }>>({});
  const [mergeStates, setMergeStates] = useState<Record<string, { merging: boolean; success?: boolean; message?: string }>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentProject = activeProjectId ? projects[activeProjectId] : Object.values(projects)[0];

  // Filter sessions belonging to active project
  const projectSessions = Object.values(workspaces).filter(
    (w) => !activeProjectId || w.projectId === activeProjectId || w.repository === currentProject?.name
  );

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputContent.trim()) return;

    setIsSending(true);
    const content = inputContent.trim();
    try {
      await postRoomMessage({
        content,
        target: selectedTarget,
        type: selectedType,
      });

      // If Inject to Terminal is checked and target is a specific session, also feed stdin!
      if (injectToStdin && selectedTarget !== '@all') {
        const targetClean = selectedTarget.replace('@', '').toLowerCase();
        const matched = projectSessions.find(
          (w) => w.name.toLowerCase() === targetClean || w.branch?.toLowerCase() === targetClean || w.id === targetClean
        );
        if (matched) {
          await sendTerminalInput(matched.id, content);
        }
      }

      setInputContent('');
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickPrompt = (target: string, type: RoomMessageType, text: string) => {
    setSelectedTarget(target);
    setSelectedType(type);
    setInputContent(text);
  };

  const handleToggleLead = (sessionId: string, currentRole?: AgentRole) => {
    const newRole: AgentRole = currentRole === 'lead' ? 'worker' : 'lead';
    setSessionRole(sessionId, newRole);
  };

  const handleAddAgent = async (agentType: string, isWorktree = false) => {
    setIsAddMenuOpen(false);
    if (isWorktree) {
      onOpenDelegateModal?.();
      return;
    }
    const targetProjId = activeProjectId || currentProject?.id;
    const newId = await createSession({
      projectId: targetProjId,
      name: `${agentType === 'terminal' ? 'Terminal' : agentType === 'claude-code' ? 'Claude' : 'Antigravity'} ${projectSessions.length + 1}`,
      sessionMode: 'local',
      agentType,
    });
    if (newId) {
      setActiveWorkspace(newId);
      // Announce new agent in room
      await postRoomMessage({
        content: `New session created with agent [${agentType}] and joined the room.`,
        target: '@all',
        type: 'status_update',
      });
    }
  };

  const handleSyncSkills = async () => {
    setSyncStatus('syncing');
    try {
      const res = await syncMeshSkills(currentProject?.rootPath);
      if (res.success) {
        setSyncStatus('synced');
        setSyncMessage('✔ Skills & protocols synced');
        setTimeout(() => setSyncStatus('idle'), 3500);
      } else {
        setSyncStatus('error');
        setSyncMessage(res.message);
        setTimeout(() => setSyncStatus('idle'), 3500);
      }
    } catch (err: any) {
      setSyncStatus('error');
      setSyncMessage(err?.message || 'Sync failed');
      setTimeout(() => setSyncStatus('idle'), 3500);
    }
  };

  const handleSendToTerminal = async (msgId: string, targetSession: any, text: string) => {
    if (!targetSession?.id || !text) return;
    setSentFeedback((prev) => ({ ...prev, [msgId]: true }));
    await sendTerminalInput(targetSession.id, text);
    setTimeout(() => {
      setSentFeedback((prev) => ({ ...prev, [msgId]: false }));
    }, 2000);
  };

  const handleRunTests = async (msgId: string, ws: any) => {
    setTestStates((prev) => ({ ...prev, [msgId]: { running: true } }));
    try {
      const res = await runWorktreeTests({
        worktreePath: ws.worktreePath,
        repo: ws.repository,
      });
      setTestStates((prev) => ({
        ...prev,
        [msgId]: { running: false, success: res.success, output: res.output },
      }));
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        [msgId]: { running: false, success: false, output: err?.message || 'Test execution failed' },
      }));
    }
  };

  const handleMerge = async (msgId: string, ws: any) => {
    setMergeStates((prev) => ({ ...prev, [msgId]: { merging: true } }));
    try {
      const res = await mergeWorktree(ws.id, `feat: merge ${ws.branch} verified by autonomous quality gate`);
      setMergeStates((prev) => ({
        ...prev,
        [msgId]: { merging: false, success: res.success, message: res.message },
      }));
      if (res.success) {
        await postRoomMessage({
          content: `Merged @${ws.name} into main. Quality gate passed.`,
          target: '@all',
          type: 'status_update',
        });
      }
    } catch (err: any) {
      setMergeStates((prev) => ({
        ...prev,
        [msgId]: { merging: false, success: false, message: err?.message || 'Merge failed' },
      }));
    }
  };

  const getAgentVisual = (fromName: string, role?: string) => {
    const lower = fromName.toLowerCase();
    if (role === 'lead' || lower.includes('lead') || lower.includes('main')) {
      return {
        label: 'LEAD',
        border: 'border-amber-600/60',
        text: 'text-amber-400',
        bg: 'bg-amber-950/40',
        icon: <Crown className="w-3.5 h-3.5 text-amber-400" />,
      };
    }
    if (lower.includes('claude')) {
      return {
        label: 'CLAUDE',
        border: 'border-orange-600/60',
        text: 'text-orange-400',
        bg: 'bg-orange-950/40',
        icon: getAgentIcon('claude-code', 'w-3.5 h-3.5'),
      };
    }
    if (lower.includes('antigravity') || lower.includes('agy')) {
      return {
        label: 'ANTIGRAVITY',
        border: 'border-cyan-600/60',
        text: 'text-cyan-400',
        bg: 'bg-cyan-950/40',
        icon: getAgentIcon('antigravity', 'w-3.5 h-3.5'),
      };
    }
    if (lower.includes('human') || role === 'human') {
      return {
        label: 'HUMAN',
        border: 'border-emerald-600/60',
        text: 'text-emerald-400',
        bg: 'bg-emerald-950/40',
        icon: <span className="w-2 h-2 rounded-full bg-emerald-400" />,
      };
    }
    return {
      label: 'AGENT',
      border: 'border-zinc-700',
      text: 'text-zinc-300',
      bg: 'bg-zinc-900',
      icon: <Terminal className="w-3.5 h-3.5 text-zinc-400" />,
    };
  };

  const getTypeStyle = (type?: RoomMessageType) => {
    switch (type) {
      case 'task_delegate':
        return 'bg-purple-950/70 text-purple-300 border-purple-800/80';
      case 'review_request':
        return 'bg-amber-950/70 text-amber-300 border-amber-800/80';
      case 'status_update':
        return 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80';
      default:
        return 'bg-zinc-900 text-zinc-400 border-zinc-800';
    }
  };

  return (
    <div
      style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
      className="flex-1 flex flex-col h-full overflow-hidden font-mono select-none"
    >
      {/* 1. Top Header Bar: Room Title, 1-Click Sync Skills, and 1-Click + Add Agent */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="h-9 px-3 border-b flex items-center justify-between gap-2 shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="text-xs font-bold text-zinc-100 tracking-wider uppercase truncate">
            Agent Room Mesh
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 shrink-0">
            {projectSessions.length} sessions
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 1-Click Sync Skills & Protocols Button */}
          <button
            onClick={handleSyncSkills}
            disabled={syncStatus === 'syncing'}
            title={syncMessage || "Inject Dewwie room protocol, CLAUDE.md, and .gemini rules into project"}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              syncStatus === 'synced'
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                : syncStatus === 'error'
                ? 'bg-rose-950/80 border-rose-800 text-rose-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
            }`}
          >
            {syncStatus === 'syncing' ? (
              <RotateCw className="w-3 h-3 text-zinc-400 animate-spin" />
            ) : syncStatus === 'synced' ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Zap className="w-3 h-3 text-amber-400" />
            )}
            <span>{syncStatus === 'synced' ? 'Skills Synced' : 'Sync Skills'}</span>
          </button>

          {/* 1-Click + Add Session Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 active:scale-[0.98] transition-colors"
            >
              <Plus className="w-3 h-3 text-zinc-400" />
              <span>Add Agent</span>
              <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
            </button>

            {isAddMenuOpen && (
              <div
                className="absolute right-0 top-7 w-48 bg-zinc-950 border border-zinc-800 rounded shadow-xl py-1 z-50 text-xs font-mono"
                onMouseLeave={() => setIsAddMenuOpen(false)}
              >
                <div className="px-2 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold border-b border-zinc-900">
                  Spawn Agent CLI
                </div>
                <button
                  onClick={() => handleAddAgent('claude-code')}
                  className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-900 text-left text-zinc-200 hover:text-white"
                >
                  {getAgentIcon('claude-code', 'w-3.5 h-3.5')}
                  <span>Claude Code</span>
                </button>
                <button
                  onClick={() => handleAddAgent('antigravity')}
                  className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-900 text-left text-zinc-200 hover:text-white"
                >
                  {getAgentIcon('antigravity', 'w-3.5 h-3.5')}
                  <span>Google Antigravity</span>
                </button>
                <button
                  onClick={() => handleAddAgent('terminal')}
                  className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-900 text-left text-zinc-200 hover:text-white"
                >
                  <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Shell Terminal</span>
                </button>
                {currentProject?.isGitRepo && (
                  <button
                    onClick={() => handleAddAgent('claude-code', true)}
                    className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-900 text-left text-zinc-200 hover:text-white border-t border-zinc-900"
                  >
                    <FolderGit2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>New Worktree Branch...</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Active Agents Roster Strip */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="px-3 py-1.5 border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
      >
        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider shrink-0 mr-1">
          Roster:
        </span>
        {projectSessions.map((ws, sIdx) => {
          const isLead = ws.agentRole === 'lead' || ws.id === leadSessionId;
          const isCurrentActive = ws.id === activeWorkspaceId;
          const visual = getAgentVisual(ws.name, ws.agentRole);

          return (
            <div
              key={ws.id}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-colors border shrink-0 ${
                isCurrentActive
                  ? 'bg-zinc-900 text-zinc-100 border-zinc-700 shadow-xs'
                  : 'bg-zinc-950/80 text-zinc-400 border-zinc-800/80 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <button
                onClick={() => setActiveWorkspace(ws.id)}
                title={`Jump to session: ${ws.name} (${ws.agentType || 'shell'})`}
                className="flex items-center gap-1.5 hover:underline"
              >
                {visual.icon}
                <span className="font-semibold text-zinc-200">{sIdx + 1}.</span>
                <span className="truncate max-w-[100px]">{ws.name}</span>
              </button>

              {/* Lead Toggle Badge */}
              <button
                onClick={() => handleToggleLead(ws.id, ws.agentRole)}
                title={isLead ? 'Session is Lead Agent (click to demote)' : 'Promote session to Lead Agent'}
                className={`p-0.5 rounded transition-colors ${
                  isLead
                    ? 'text-amber-400 hover:bg-amber-950/60'
                    : 'text-zinc-600 hover:text-amber-400 hover:bg-zinc-800'
                }`}
              >
                <Crown className={`w-3 h-3 ${isLead ? 'fill-amber-400/30' : ''}`} />
              </button>
            </div>
          );
        })}
      </div>

      {/* 3. Messages Stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {roomMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-3">
            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
              <Users className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-300">Room Mesh Ready</p>
              <p className="text-[11px] text-zinc-500 max-w-xs mt-1">
                Claude Code, Google Antigravity, and Terminal Shells broadcast and hand off tasks here in real-time.
              </p>
            </div>
          </div>
        ) : (
          roomMessages.map((msg) => {
            const visual = getAgentVisual(msg.fromSessionName, msg.fromRole);
            const typeStyle = getTypeStyle(msg.type);

            // Match target workspace
            const targetClean = msg.target?.replace('@', '').toLowerCase();
            const targetWs = projectSessions.find(
              (w) =>
                w.name.toLowerCase() === targetClean ||
                w.branch?.toLowerCase() === targetClean ||
                w.id.toLowerCase() === targetClean ||
                (targetClean === 'lead' && (w.agentRole === 'lead' || w.id === leadSessionId))
            );

            const testState = testStates[msg.id];
            const mergeState = mergeStates[msg.id];
            const isSent = sentFeedback[msg.id];

            return (
              <div
                key={msg.id}
                className="p-3 rounded border border-zinc-800/80 bg-zinc-950/80 hover:bg-zinc-900/40 hover:border-zinc-700/80 transition-all text-xs space-y-2 shadow-xs"
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* Agent Avatar Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${visual.border} ${visual.bg} ${visual.text}`}
                    >
                      {visual.icon}
                      <span>{visual.label}</span>
                    </span>

                    <span className="font-semibold text-zinc-200 truncate">
                      {msg.fromSessionName}
                    </span>

                    <span className="text-zinc-600 font-sans">→</span>

                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800">
                      {msg.target}
                    </span>

                    {msg.type && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${typeStyle}`}>
                        {msg.type.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                {/* Content */}
                <div className="text-[11px] leading-relaxed break-words whitespace-pre-wrap text-zinc-200 pl-1 font-mono bg-zinc-900/30 p-2 rounded border border-zinc-800/40">
                  {msg.content}
                </div>

                {/* Interactive Action Strip on Message Card */}
                <div className="pt-1.5 flex flex-wrap items-center gap-1.5">
                  {/* Direct Stdin Injection: Send to Terminal */}
                  {targetWs && (
                    <button
                      onClick={() => handleSendToTerminal(msg.id, targetWs, msg.content)}
                      title={`Write this prompt/task directly to @${targetWs.name}'s running terminal stdin`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
                        isSent
                          ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {isSent ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Zap className="w-2.5 h-2.5 text-amber-400" />}
                      <span>{isSent ? 'Sent to Terminal!' : '⚡ Send to Terminal'}</span>
                    </button>
                  )}

                  {/* Jump to Workspace */}
                  {targetWs && (
                    <button
                      onClick={() => setActiveWorkspace(targetWs.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Switch active tab to this agent workspace"
                    >
                      <ExternalLink className="w-2.5 h-2.5 text-zinc-500" />
                      <span>Focus Tab</span>
                    </button>
                  )}

                  {/* Run Tests Quality Gate */}
                  {targetWs && targetWs.sessionMode === 'branch' && (
                    <button
                      onClick={() => handleRunTests(msg.id, targetWs)}
                      disabled={testState?.running}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
                        testState?.success === true
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                          : testState?.success === false
                          ? 'bg-zinc-900 border-rose-900/60 text-rose-400'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-zinc-100'
                      }`}
                    >
                      {testState?.running ? (
                        <>
                          <span className="w-2.5 h-2.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                          <span>Testing...</span>
                        </>
                      ) : testState?.success === true ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-zinc-300" />
                          <span>Tests Passed</span>
                        </>
                      ) : testState?.success === false ? (
                        <>
                          <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
                          <span>Tests Failed</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-2.5 h-2.5 text-zinc-400" />
                          <span>Run Tests</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* 1-Click Fast-Forward Merge Gate */}
                  {targetWs && targetWs.sessionMode === 'branch' && (
                    <button
                      onClick={() => handleMerge(msg.id, targetWs)}
                      disabled={mergeState?.merging || mergeState?.success === true}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
                        mergeState?.success === true
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-400 cursor-default'
                          : mergeState?.success === false
                          ? 'bg-zinc-900 border-rose-900/60 text-rose-400'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200 hover:text-white'
                      }`}
                    >
                      {mergeState?.merging ? (
                        <>
                          <span className="w-2.5 h-2.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                          <span>Merging...</span>
                        </>
                      ) : mergeState?.success === true ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-zinc-400" />
                          <span>Merged into main</span>
                        </>
                      ) : (
                        <>
                          <GitMerge className="w-2.5 h-2.5 text-zinc-400" />
                          <span>1-Click Merge</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Test Failure Output */}
                  {testState?.success === false && testState?.output && (
                    <div className="w-full mt-1 p-2 bg-black/90 rounded border border-rose-950 text-[10px] font-mono text-rose-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {testState.output}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. Quick Broadcast Preset Chips */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="px-3 py-1.5 border-t flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
      >
        <span className="text-[10px] text-zinc-500 shrink-0 uppercase font-semibold">Presets:</span>
        <button
          onClick={() => handleQuickPrompt('@all', 'chat', 'Status check: report your active tasks and test progress.')}
          className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 hover:text-white transition-colors shrink-0"
        >
          @all Status Check
        </button>
        <button
          onClick={() => handleQuickPrompt('@lead', 'review_request', 'Ready for code review. Branch diffs are verified.')}
          className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 hover:text-white transition-colors shrink-0"
        >
          @lead Review Diff
        </button>
        <button
          onClick={() => handleQuickPrompt('@antigravity', 'task_delegate', 'Please run e2e verification and adversarial review.')}
          className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 hover:text-white transition-colors shrink-0"
        >
          Claude ➔ Antigravity Handoff
        </button>
        <button
          onClick={() => handleQuickPrompt('@all', 'task_delegate', 'Run full test suite and verify clean build.')}
          className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 hover:text-white transition-colors shrink-0"
        >
          ⚡ Verify All
        </button>
      </div>

      {/* 5. Broadcaster / Input Form */}
      <form
        onSubmit={handleSend}
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="p-3 border-t shrink-0 space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Target Selector */}
            <div className="relative">
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="appearance-none bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 pr-6 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-700 transition-colors font-mono"
              >
                <option value="@all">@all (Broadcast)</option>
                <option value="@lead">@lead (Lead Agent)</option>
                {projectSessions.map((ws) => (
                  <option key={ws.id} value={`@${ws.name}`}>
                    @{ws.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Type Selector */}
            <div className="relative">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as RoomMessageType)}
                className="appearance-none bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 pr-6 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-700 transition-colors font-mono"
              >
                <option value="chat">Chat</option>
                <option value="task_delegate">Task Delegate</option>
                <option value="status_update">Status Update</option>
                <option value="review_request">Review Request</option>
              </select>
              <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Stdin Injection Toggle */}
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={injectToStdin}
              onChange={(e) => setInjectToStdin(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-0 focus:ring-offset-0"
            />
            <span className="text-zinc-300 font-medium">⚡ Send to Terminal Stdin</span>
          </label>
        </div>

        {/* Text Input & Submit */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            placeholder={`Message or instruct ${selectedTarget}...`}
            className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors font-mono"
          />

          <button
            type="submit"
            disabled={!inputContent.trim() || isSending}
            className="px-3 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-bold disabled:opacity-40 transition-all shrink-0 inline-flex items-center gap-1.5 text-xs active:scale-[0.98]"
            title="Broadcast Message"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Broadcast</span>
          </button>
        </div>
      </form>
    </div>
  );
};
