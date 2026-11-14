import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from './store/workspaceStore';
import { WorkspaceSidebar } from './components/BuildMode/WorkspaceSidebar';
import { DualTerminalPane } from './components/BuildMode/DualTerminalPane';
import { AgentRoomPane } from './components/AgentRoomPane';
import { ExplorerPane } from './components/ExplorerPane';
import { DiffViewer } from './components/ReviewMode/DiffViewer';
import { MergeBar } from './components/ReviewMode/MergeBar';
import {
  Terminal as TerminalIcon,
  MessageSquare,
  FolderTree,
  GitCompare,
  Code2,
  Zap,
  Check,
  Copy,
  PanelRightClose,
  PanelRight,
  PanelLeftClose,
  PanelLeft,
  Columns2,
  RefreshCw,
  Trash2,
  Crown,
  X,
  Radio,
} from 'lucide-react';
import { ExternalEditor } from './types';

export const App: React.FC = () => {
  const {
    activeWorkspaceId,
    activeProjectId,
    projects,
    workspaces,
    daemonStatus,
    launchEditor,
    activeTab,
    setActiveTab,
    isSplitView,
    toggleSplitView,
    sidebarOpen,
    toggleSidebar,
    rightPanelOpen,
    toggleRightPanel,
    rightPanelView,
    setRightPanelView,
    roomMessages,
    leadSessionId,
    setActiveWorkspace,
    deleteWorkspace,
    initNativeSync,
  } = useWorkspaceStore();

  const [launchingEditor, setLaunchingEditor] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState(false);

  const isNative = typeof window !== 'undefined' && !!window.swarmherdNative?.isNative;

  useEffect(() => {
    initNativeSync();
  }, [initNativeSync]);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;
  const currentProject = activeProjectId ? projects[activeProjectId] : null;

  // Filter project sessions
  const projectSessions = Object.values(workspaces).filter(
    (w) => !activeProjectId || w.projectId === activeProjectId || w.repository === currentProject?.name
  );

  // Keyboard shortcut routing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl && e.key === '1') {
        e.preventDefault();
        setActiveTab('terminal');
      } else if (isCmdOrCtrl && e.key === '2') {
        e.preventDefault();
        setRightPanelView('room');
      } else if (isCmdOrCtrl && e.key === '3') {
        e.preventDefault();
        setRightPanelView('files');
      } else if (isCmdOrCtrl && e.key === '4') {
        e.preventDefault();
        setRightPanelView('changes');
      } else if (isCmdOrCtrl && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebar();
      } else if (isCmdOrCtrl && e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleRightPanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, toggleSidebar, toggleRightPanel, setRightPanelView]);

  const handleLaunch = async (editor: ExternalEditor) => {
    setLaunchingEditor(editor);
    try {
      await launchEditor(editor, activeWorkspaceId || undefined);
    } finally {
      setTimeout(() => setLaunchingEditor(null), 1000);
    }
  };

  const dispatchTerminal = (action: 'restart' | 'copy' | 'clear') => {
    if (action === 'copy') {
      setCopiedAction(true);
      setTimeout(() => setCopiedAction(false), 1500);
    }
    window.dispatchEvent(new CustomEvent('dewwie:terminal-action', { detail: { action } }));
  };

  const allWorkspacesList = Object.values(workspaces);
  const totalFilesChanged = activeWs?.diffSummary?.filesChanged || 0;
  const blockedCount = allWorkspacesList.filter((w) => w.agentStatus?.state === 'blocked').length;

  return (
    <div className="flex h-screen w-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans select-none antialiased">
      {/* 1. Left Hierarchical Navigation Sidebar (Toggle Expand / Minimize like VS Code) */}
      {sidebarOpen && <WorkspaceSidebar />}

      {/* 2. Main Center Workspace Stage */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Compact Single Unified Top Bar (Combined Tabs, Toggles, and Actions into 1 Row) */}
        <header
          className={`h-9 px-2 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between gap-2 shrink-0 z-20 font-mono ${
            isNative ? 'pr-36' : ''
          }`}
        >
          {/* Left: Left Sidebar Toggle + Compact Session Tabs */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            {/* Left Sidebar Toggle Button */}
            <button
              onClick={toggleSidebar}
              title={sidebarOpen ? 'Collapse Left Sidebar (Ctrl+B)' : 'Expand Left Sidebar (Ctrl+B)'}
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors shrink-0"
            >
              {sidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
            </button>

            <span className="h-3.5 w-px bg-zinc-800/80 shrink-0" />

            {/* Precision Session Tabs Strip */}
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              {projectSessions.map((ws) => {
                const isActive = activeWs?.id === ws.id;
                const isLead = ws.agentRole === 'lead' || ws.id === leadSessionId;
                const isLocal = ws.sessionMode === 'local' || !ws.sessionMode;

                return (
                  <div
                    key={ws.id}
                    onClick={() => setActiveWorkspace(ws.id)}
                    className={`group flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs cursor-pointer transition-all shrink-0 ${
                      isActive
                        ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-800 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40 border border-transparent'
                    }`}
                  >
                    {isLead ? (
                      <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                    ) : (
                      <TerminalIcon
                        className={`w-3 h-3 shrink-0 ${isActive ? 'text-blue-400' : 'text-zinc-600'}`}
                      />
                    )}

                    <span className="truncate max-w-[120px]">{ws.name}</span>

                    {/* Status Dot */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        ws.agentStatus?.state === 'blocked'
                          ? 'bg-amber-400 agent-blocked-dot'
                          : ws.agentStatus?.state === 'working'
                          ? 'bg-blue-400 agent-working-dot'
                          : isActive
                          ? 'bg-emerald-400'
                          : 'bg-zinc-700'
                      }`}
                    />

                    {/* Close Tab Button */}
                    {ws.id !== 'ws-local-proj-dewwie' && ws.id !== 'ws-local-proj-exbytelab' && !isLocal && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteWorkspace(ws.id);
                        }}
                        title="Close session"
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-opacity ml-0.5"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: View Pills + Actions + Right Sidebar Toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Switcher Pills */}
            <div className="flex items-center bg-zinc-900/80 p-0.5 rounded border border-zinc-800 text-xs">
              <button
                onClick={() => setActiveTab('terminal')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                  activeTab === 'terminal'
                    ? 'bg-zinc-800 text-zinc-100 font-medium shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <TerminalIcon className="w-3 h-3" />
                <span>Terminal</span>
              </button>

              <button
                onClick={() => {
                  setRightPanelView('room');
                }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                  rightPanelOpen && rightPanelView === 'room'
                    ? 'bg-zinc-800 text-zinc-100 font-medium shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <MessageSquare className="w-3 h-3 text-blue-400" />
                <span>Room</span>
                {roomMessages.length > 0 && (
                  <span className="px-1 py-0.2 text-[9px] rounded bg-blue-500/20 text-blue-300">
                    {roomMessages.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setRightPanelView('files');
                }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                  rightPanelOpen && rightPanelView === 'files'
                    ? 'bg-zinc-800 text-zinc-100 font-medium shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <FolderTree className="w-3 h-3" />
                <span>Files</span>
              </button>

              <button
                onClick={() => {
                  setRightPanelView('changes');
                }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                  rightPanelOpen && rightPanelView === 'changes'
                    ? 'bg-zinc-800 text-zinc-100 font-medium shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <GitCompare className="w-3 h-3" />
                <span>Diff</span>
                {totalFilesChanged > 0 && (
                  <span className="px-1 py-0.2 text-[9px] rounded bg-zinc-700 text-zinc-200">
                    {totalFilesChanged}
                  </span>
                )}
              </button>
            </div>

            <span className="h-3.5 w-px bg-zinc-800/80 shrink-0" />

            {/* Terminal Actions (Split View, Restart, Copy, Clear) */}
            <button
              onClick={toggleSplitView}
              title={isSplitView ? 'Single View' : 'Split Terminals Side-by-Side'}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                isSplitView
                  ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Columns2 className="w-3 h-3" />
            </button>

            <button
              onClick={() => dispatchTerminal('restart')}
              title="Restart Shell Process"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>

            <button
              onClick={() => dispatchTerminal('copy')}
              title="Copy Terminal Logs"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              {copiedAction ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>

            <button
              onClick={() => dispatchTerminal('clear')}
              title="Clear Terminal Buffer"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>

            <span className="h-3.5 w-px bg-zinc-800/80 shrink-0" />

            {/* External IDE Launchers */}
            <button
              onClick={() => handleLaunch('cursor')}
              disabled={!!launchingEditor}
              title="Open in Cursor IDE"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >
              <Code2 className="w-3 h-3" />
              <span>Cursor</span>
            </button>

            <button
              onClick={() => handleLaunch('zed')}
              disabled={!!launchingEditor}
              title="Open in Zed"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >
              <Zap className="w-3 h-3" />
              <span>Zed</span>
            </button>

            <span className="h-3.5 w-px bg-zinc-800/80 shrink-0" />

            {/* Right Navigation Sidebar Toggle Button */}
            <button
              onClick={toggleRightPanel}
              title={rightPanelOpen ? 'Collapse Right Panel (Ctrl+Alt+B)' : 'Expand Right Panel (Ctrl+Alt+B)'}
              className={`p-1 rounded transition-colors ${
                rightPanelOpen
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              {rightPanelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>

        {/* Dynamic Center Stage Viewport with Toggleable Right Navigation */}
        <main className="flex-1 flex overflow-hidden relative">
          {/* Main Stage (Terminal or Full-Page Views) */}
          <div className="flex-1 flex h-full overflow-hidden">
            {activeTab === 'terminal' && <DualTerminalPane />}
            {activeTab === 'room' && <AgentRoomPane />}
            {activeTab === 'files' && <ExplorerPane />}
            {activeTab === 'changes' && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <DiffViewer />
                <MergeBar />
              </div>
            )}
          </div>

          {/* Right Navigation Inspector Sidebar (Toggle Expand / Minimize like VS Code) */}
          {rightPanelOpen && activeTab === 'terminal' && (
            <aside className="w-80 md:w-92 h-full border-l border-zinc-800/80 bg-zinc-950 flex flex-col shrink-0 font-mono">
              {/* Right Panel Header Tabs */}
              <div className="h-8 px-2 border-b border-zinc-800/80 bg-zinc-950 flex items-center justify-between gap-1 shrink-0">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setRightPanelView('room')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                      rightPanelView === 'room'
                        ? 'bg-zinc-900 text-zinc-100 font-semibold border border-zinc-800 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 text-blue-400" />
                    <span>Agent Room</span>
                  </button>

                  <button
                    onClick={() => setRightPanelView('files')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                      rightPanelView === 'files'
                        ? 'bg-zinc-900 text-zinc-100 font-semibold border border-zinc-800 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <FolderTree className="w-3 h-3" />
                    <span>Files</span>
                  </button>

                  <button
                    onClick={() => setRightPanelView('changes')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                      rightPanelView === 'changes'
                        ? 'bg-zinc-900 text-zinc-100 font-semibold border border-zinc-800 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <GitCompare className="w-3 h-3" />
                    <span>Changes</span>
                  </button>
                </div>

                <button
                  onClick={toggleRightPanel}
                  title="Close right panel (Ctrl+Alt+B)"
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Right Panel Content View */}
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {rightPanelView === 'room' && <AgentRoomPane />}
                {rightPanelView === 'files' && <ExplorerPane sidebarOnly />}
                {rightPanelView === 'changes' && (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    <DiffViewer />
                    <MergeBar />
                  </div>
                )}
              </div>
            </aside>
          )}
        </main>

        {/* Minimal Footer Status Bar */}
        <footer className="h-6 px-3 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-500 shrink-0 select-none">
          {/* Left: Active session & Agent stats */}
          <div className="flex items-center gap-2.5">
            <span className="text-zinc-400">Dewwie Mesh</span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-300 font-semibold">{activeWs?.branch || activeWs?.name || 'main'}</span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-400">• {projectSessions.length} agents</span>
            {leadSessionId && (
              <span className="text-amber-400 inline-flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" />
                Lead: {workspaces[leadSessionId]?.name || 'Local'}
              </span>
            )}
            {blockedCount > 0 && (
              <span className="text-amber-400 font-bold">· {blockedCount} needs you</span>
            )}
          </div>

          {/* Center: Live Port Registry */}
          <div className="hidden md:flex items-center gap-2">
            <Radio className="w-2.5 h-2.5 text-zinc-600" />
            <span className="text-zinc-600">PORT:</span>
            <span className="text-zinc-400 font-mono">7501 (PTY + Room)</span>
          </div>

          {/* Right: Telemetry & Daemon */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  daemonStatus === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span className="text-zinc-400">
                {daemonStatus === 'connected' ? 'Native PTY Live' : 'Offline'}
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
