import React, { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { RoomMessageType, AgentRole } from '../types';
import {
  Users,
  Crown,
  Bot,
  Send,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';

export const AgentRoomPane: React.FC = () => {
  const {
    workspaces,
    activeWorkspaceId,
    activeProjectId,
    projects,
    roomMessages,
    leadSessionId,
    postRoomMessage,
    setSessionRole,
  } = useWorkspaceStore();

  const [inputContent, setInputContent] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string>('@all');
  const [selectedType, setSelectedType] = useState<RoomMessageType>('chat');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;
  const currentProject = activeProjectId ? projects[activeProjectId] : null;

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
    try {
      await postRoomMessage({
        content: inputContent.trim(),
        target: selectedTarget,
        type: selectedType,
      });
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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090b] text-zinc-200 overflow-hidden font-mono select-none">
      {/* Top Header Bar */}
      <div className="h-9 px-3 border-b border-zinc-800/80 bg-zinc-950 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="text-xs font-semibold text-zinc-100 uppercase tracking-wider truncate">
            Agent Mesh Room
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 shrink-0">
            {projectSessions.length} agents
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="flex h-1.5 w-1.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-[10px] text-zinc-500">mesh live</span>
        </div>
      </div>

      {/* Active Agents Roster & Lead Designation Strip */}
      <div className="px-3 py-2 border-b border-zinc-800/60 bg-zinc-950/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider shrink-0 mr-1">
          Roster:
        </span>
        {projectSessions.map((ws) => {
          const isLead = ws.agentRole === 'lead' || ws.id === leadSessionId;
          const isCurrentActive = ws.id === activeWorkspaceId;

          return (
            <button
              key={ws.id}
              onClick={() => handleToggleLead(ws.id, ws.agentRole)}
              title={`Click to toggle Lead role for ${ws.name}`}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-all border shrink-0 ${
                isLead
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 shadow-xs'
                  : isCurrentActive
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                  : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              {isLead ? (
                <Crown className="w-3 h-3 text-amber-400 shrink-0" />
              ) : (
                <Bot className="w-3 h-3 text-zinc-500 shrink-0" />
              )}
              <span className="truncate max-w-[100px]">{ws.name}</span>
              {isLead && (
                <span className="text-[9px] uppercase font-bold px-1 rounded bg-amber-400/20 text-amber-300">
                  Lead
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {roomMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-3">
            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
              <Users className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-300">Room is Ready for Communication</p>
              <p className="text-[11px] text-zinc-500 max-w-xs mt-1">
                Agents communicate here automatically via OSC 7502 or CLI (<code className="text-zinc-400 font-mono">dewwie room send</code>).
              </p>
            </div>
          </div>
        ) : (
          roomMessages.map((msg) => {
            const isLead = msg.fromRole === 'lead';
            const isHuman = msg.fromSessionId === 'human' || msg.fromRole === ('human' as AgentRole);
            const isDirectToMe = activeWs && (msg.target === `@${activeWs.name}` || msg.target === `@${activeWs.branch}`);

            return (
              <div
                key={msg.id}
                className={`p-2.5 rounded-lg border transition-all text-xs ${
                  isDirectToMe
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-100 shadow-xs'
                    : isLead
                    ? 'bg-amber-500/5 border-amber-500/30 text-zinc-200'
                    : 'bg-zinc-900/50 border-zinc-800/80 text-zinc-300'
                }`}
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isLead ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <Crown className="w-2.5 h-2.5" />
                        LEAD
                      </span>
                    ) : isHuman ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        HUMAN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                        <Bot className="w-2.5 h-2.5" />
                        AGENT
                      </span>
                    )}

                    <span className="font-semibold text-zinc-200 truncate">
                      {msg.fromSessionName}
                    </span>

                    <span className="text-zinc-600">→</span>

                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      msg.target === '@all'
                        ? 'bg-zinc-800 text-zinc-400'
                        : msg.target === '@lead'
                        ? 'bg-amber-400/10 text-amber-300'
                        : 'bg-blue-400/10 text-blue-300'
                    }`}>
                      {msg.target}
                    </span>
                  </div>

                  <span className="text-[10px] text-zinc-600 shrink-0">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                {/* Content */}
                <div className="text-[11px] leading-relaxed break-words whitespace-pre-wrap text-zinc-200 pl-0.5">
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Suggestion Chips */}
      <div className="px-3 py-1.5 border-t border-zinc-800/60 bg-zinc-950 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] text-zinc-600 shrink-0">Quick:</span>
        <button
          onClick={() => handleQuickPrompt('@all', 'chat', 'Status check: report your active tasks and test progress.')}
          className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
        >
          @all Status Check
        </button>
        <button
          onClick={() => handleQuickPrompt('@lead', 'review_request', 'Ready for code review. Branch diffs are ready.')}
          className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
        >
          @lead Request Review
        </button>
        <button
          onClick={() => handleQuickPrompt('@all', 'task_delegate', 'Run full test suite and verify clean build.')}
          className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
        >
          @all Run Tests
        </button>
      </div>

      {/* Input / Post Box */}
      <form onSubmit={handleSend} className="p-3 border-t border-zinc-800/80 bg-zinc-950 shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          {/* Target Selector */}
          <div className="relative">
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="appearance-none bg-zinc-900 border border-zinc-800 rounded px-2 py-1 pr-6 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-700 transition-colors"
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
              className="appearance-none bg-zinc-900 border border-zinc-800 rounded px-2 py-1 pr-6 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-700 transition-colors"
            >
              <option value="chat">Chat</option>
              <option value="task_delegate">Task</option>
              <option value="status_update">Status</option>
              <option value="review_request">Review</option>
            </select>
            <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Text Input & Submit */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            placeholder={`Message ${selectedTarget}... (Enter to send)`}
            className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors font-mono"
          />

          <button
            type="submit"
            disabled={!inputContent.trim() || isSending}
            className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white transition-colors shrink-0"
            title="Send Message to Mesh Room"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};
