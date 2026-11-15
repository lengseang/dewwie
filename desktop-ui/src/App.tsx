import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from './store/workspaceStore';
import { WorkspaceSidebar } from './components/BuildMode/WorkspaceSidebar';
import { DualTerminalPane } from './components/BuildMode/DualTerminalPane';
import { AgentRoomPane } from './components/AgentRoomPane';
import { ExplorerPane } from './components/ExplorerPane';
import { DiffViewer } from './components/ReviewMode/DiffViewer';
import { MergeBar } from './components/ReviewMode/MergeBar';
import { DelegateTaskModal } from './components/DelegateTaskModal';
import { AgentMenuDropdown } from './components/AgentMenuDropdown';
import { SettingsModal } from './components/SettingsModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { getAgentIcon, TerminalAgentIcon } from './components/AgentIcons';
import {
  MessageSquare,
  FolderTree,
  GitCompare,
  Code2,
  Copy,
  Check,
  PanelRightClose,
  PanelRight,
  PanelLeftClose,
  PanelLeft,
  Columns2,
  RefreshCw,
  Trash2,
  X,
  Radio,
  Plus,
  Palette,
  FolderOpen,
  Command,
  Settings,
} from 'lucide-react';
import { ExternalEditor } from './types';

const THEME_STYLES: Record<string, { bg: string; navBg: string; border: string }> = {
  zinc: { bg: 'bg-[#09090b]', navBg: 'bg-zinc-950', border: 'border-zinc-800/80' },
  oled: { bg: 'bg-[#000000]', navBg: 'bg-[#0a0a0a]', border: 'border-zinc-900' },
  slate: { bg: 'bg-[#0b0f19]', navBg: 'bg-[#0f172a]', border: 'border-slate-800' },
  tokyo: { bg: 'bg-[#1a1b26]', navBg: 'bg-[#16161e]', border: 'border-indigo-950' },
  monokai: { bg: 'bg-[#19181a]', navBg: 'bg-[#221f22]', border: 'border-stone-800' },
};

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
    createSession,
    theme,
    sidebarWidth,
    setSidebarWidth,
    rightPanelWidth,
    setRightPanelWidth,
    pickAndOpenFolder,
    renameWorkspace,
  } = useWorkspaceStore();

  const [launchingEditor, setLaunchingEditor] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState(false);
  const [isDelegateModalOpen, setIsDelegateModalOpen] = useState(false);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');

  // Resize drag states
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const isNative = typeof window !== 'undefined' && !!window.swarmherdNative?.isNative;

  useEffect(() => {
    initNativeSync();
  }, [initNativeSync]);

  // Window resize mouse drag listener
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        setSidebarWidth(e.clientX);
      } else if (isResizingRight) {
        setRightPanelWidth(window.innerWidth - e.clientX);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isResizingLeft, isResizingRight, setSidebarWidth, setRightPanelWidth]);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;
  const currentProject = activeProjectId ? projects[activeProjectId] : Object.values(projects)[0];

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
      } else if (isCmdOrCtrl && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        pickAndOpenFolder();
      } else if (isCmdOrCtrl && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      } else if ((isCmdOrCtrl && (e.key === 'p' || e.key === 'P' || e.key === 'k' || e.key === 'K')) || e.key === ':') {
        const target = e.target as HTMLElement;
        const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.classList?.contains('xterm-helper-textarea');
        if (e.key === ':' && isEditing) return;
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, toggleSidebar, toggleRightPanel, setRightPanelView, pickAndOpenFolder]);

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

  const handleSpawnAgent = async (agentType: string, isWorktree = false) => {
    if (isWorktree) {
      setIsDelegateModalOpen(true);
      return;
    }
    const targetProjId = activeProjectId || currentProject?.id;
    const newId = await createSession({
      projectId: targetProjId,
      name: `${agentType === 'terminal' ? 'terminal' : agentType} ${projectSessions.length + 1}`,
      sessionMode: 'local', // Default is local folder-based session!
      agentType,
    });
    if (newId) {
      setActiveWorkspace(newId);
      setActiveTab('terminal');
    }
  };

  const currentTheme = THEME_STYLES[theme] || THEME_STYLES.zinc;
  const totalFilesChanged = activeWs?.diffSummary?.filesChanged || 0;
  const blockedCount = Object.values(workspaces).filter((w) => w.agentStatus?.state === 'blocked').length;

  return (
    <div className={`flex h-screen w-screen ${currentTheme.bg} text-zinc-100 overflow-hidden font-sans select-none antialiased`}>
      {/* 1. Left Hierarchical Navigation Sidebar with Drag-Resize Handle */}
      {sidebarOpen && (
        <div className="relative flex shrink-0" style={{ width: `${sidebarWidth}px` }}>
          <WorkspaceSidebar
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          />
          {/* Left Edge Resize Splitter */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingLeft(true);
            }}
            onDoubleClick={toggleSidebar}
            title="Drag to resize sidebar (double-click to collapse)"
            className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-zinc-600 active:bg-zinc-400 z-30 transition-colors"
          />
        </div>
      )}

      {/* 2. Main Center Workspace Stage */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Compact Single Unified Top Bar */}
        <header
          className={`h-9 px-2 ${currentTheme.navBg} border-b ${currentTheme.border} flex items-center justify-between gap-2 shrink-0 z-20 font-mono ${
            isNative ? 'pr-36' : ''
          }`}
        >
          {/* Left: Left Sidebar Toggle + Herdr-Style Agent Navigation Tabs */}
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

            {/* Herdr-Style Agent Navigation Tabs Strip */}
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              {projectSessions.map((ws, idx) => {
                const isActive = activeWs?.id === ws.id;
                const isLocal = ws.sessionMode === 'local' || !ws.sessionMode;

                return (
                  <div
                    key={ws.id}
                    onClick={() => setActiveWorkspace(ws.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingTabId(ws.id);
                      setEditingTabName(ws.name);
                    }}
                    title={`${ws.name} (${ws.agentType || 'terminal'})${ws.branch ? ` • ${ws.branch}` : ''} - Double click to rename`}
                    className={`group flex items-center gap-1.5 px-2 py-0.5 rounded text-xs cursor-pointer transition-colors shrink-0 ${
                      isActive
                        ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-700 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60 border border-transparent'
                    }`}
                  >
                    {getAgentIcon(ws.agentType, 'w-3.5 h-3.5 shrink-0')}

                    {editingTabId === ws.id ? (
                      <input
                        autoFocus
                        value={editingTabName}
                        onChange={(e) => setEditingTabName(e.target.value)}
                        onBlur={() => {
                          if (editingTabName.trim()) renameWorkspace(ws.id, editingTabName);
                          setEditingTabId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (editingTabName.trim()) renameWorkspace(ws.id, editingTabName);
                            setEditingTabId(null);
                          } else if (e.key === 'Escape') {
                            setEditingTabId(null);
                          }
                        }}
                        className="w-20 px-1 py-0 bg-zinc-950 border border-zinc-600 rounded text-[11px] font-mono text-zinc-100 focus:outline-none"
                      />
                    ) : (
                      <span className="font-mono text-[11px] font-medium max-w-[120px] truncate">
                        {ws.name.toLowerCase().startsWith('terminal') || ws.name.toLowerCase().startsWith(ws.agentType?.toLowerCase() || '') ? idx + 1 : ws.name}
                      </span>
                    )}

                    {/* Subtle Status Indicator */}
                    <span
                      className={`w-1 h-1 rounded-full shrink-0 ${
                        ws.agentStatus?.state === 'blocked'
                          ? 'bg-rose-500'
                          : isActive
                          ? 'bg-zinc-300'
                          : 'bg-zinc-600'
                      }`}
                    />

                    {/* Close Tab Button */}
                    {ws.id !== 'ws-local-proj-dewwie' && ws.id !== 'ws-local-proj-exbytelab' && !ws.id.startsWith('ws-local-proj-') && (
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

              {/* Herdr Agent Dropdown Trigger (+) */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
                  title="Start an Agent (Ctrl+Shift+T)"
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <AgentMenuDropdown
                  isOpen={isAgentMenuOpen}
                  onClose={() => setIsAgentMenuOpen(false)}
                  onSelectAgent={(agentType, isWorktree) => handleSpawnAgent(agentType, isWorktree)}
                  onNewSpace={() => handleSpawnAgent('terminal')}
                  onOpenDirectory={pickAndOpenFolder}
                  isGitRepo={currentProject?.isGitRepo}
                />
              </div>
            </div>

            {/* Quick Open Directory Button */}
            <button
              onClick={pickAndOpenFolder}
              title="Open Directory (Ctrl+O)"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors shrink-0"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: Ultra-Compact Icon Toolbar */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Linux Terminal / Vim-style Command Palette Prompt (Ctrl+P / :) */}
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              title="Command Palette & Shell (Ctrl+P / :)"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              <Command className="w-3.5 h-3.5" />
            </button>

            <span className="h-3.5 w-px bg-zinc-800/80 shrink-0" />

            {/* Terminal Actions (Split View, Restart, Copy, Clear) */}
            <button
              onClick={toggleSplitView}
              title={isSplitView ? 'Single View' : 'Split Terminals Side-by-Side'}
              className={`p-1 rounded transition-colors ${
                isSplitView
                  ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => dispatchTerminal('restart')}
              title="Restart Shell Process"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => dispatchTerminal('copy')}
              title="Copy Terminal Logs"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              {copiedAction ? <Check className="w-3.5 h-3.5 text-zinc-200" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => dispatchTerminal('clear')}
              title="Clear Terminal Buffer"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <span className="h-3.5 w-px bg-zinc-800/80 shrink-0" />

            {/* Quick External IDE Button */}
            <button
              onClick={() => handleLaunch('cursor')}
              disabled={launchingEditor === 'cursor'}
              title="Open in External IDE (Cursor / Zed)"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>

            {/* Settings & Themes Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="Preferences & Themes (Ctrl+,)"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>

            {/* Right Panel Toggle Button */}
            <button
              onClick={toggleRightPanel}
              title={rightPanelOpen ? 'Collapse Right Panel (Ctrl+Alt+B)' : 'Expand Right Panel (Ctrl+Alt+B)'}
              className={`p-1 rounded transition-colors relative flex items-center ${
                rightPanelOpen
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              {rightPanelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
              {(totalFilesChanged > 0 || roomMessages.length > 0) && !rightPanelOpen && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-zinc-400" />
              )}
            </button>
          </div>
        </header>

        {/* Dynamic Center Stage Viewport with Toggleable Right Navigation */}
        <main className="flex-1 flex overflow-hidden relative">
          {/* Main Stage (Terminal or Full-Page Views) */}
          <div className="flex-1 flex h-full overflow-hidden">
            {activeTab === 'terminal' && <DualTerminalPane />}
            {activeTab === 'room' && <AgentRoomPane onOpenDelegateModal={() => setIsDelegateModalOpen(true)} />}
            {activeTab === 'files' && <ExplorerPane />}
            {activeTab === 'changes' && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <DiffViewer />
                <MergeBar />
              </div>
            )}
          </div>

          {/* Right Navigation Inspector Sidebar with Drag-Resize Handle */}
          {rightPanelOpen && activeTab === 'terminal' && (
            <aside
              className="relative h-full border-l border-zinc-800/80 bg-zinc-950 flex flex-col shrink-0 font-mono"
              style={{ width: `${rightPanelWidth}px` }}
            >
              {/* Left Edge Resize Splitter for Right Panel */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizingRight(true);
                }}
                onDoubleClick={toggleRightPanel}
                title="Drag to resize panel (double-click to collapse)"
                className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-zinc-600 active:bg-zinc-400 z-30 transition-colors"
              />

              {/* Right Panel Header Tabs */}
              <div className="h-8 px-2 border-b border-zinc-800/80 bg-zinc-950 flex items-center justify-between gap-1 shrink-0">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setRightPanelView('room')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                      rightPanelView === 'room'
                        ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-800 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 text-zinc-400" />
                    <span>Room</span>
                  </button>

                  <button
                    onClick={() => setRightPanelView('files')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                      rightPanelView === 'files'
                        ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-800 shadow-xs'
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
                        ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-800 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <GitCompare className="w-3 h-3" />
                    <span>Diff</span>
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
                {rightPanelView === 'room' && <AgentRoomPane onOpenDelegateModal={() => setIsDelegateModalOpen(true)} />}
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
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">{currentProject?.name || 'Local'}</span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-400 font-mono text-[9px] truncate max-w-[200px]">{currentProject?.rootPath}</span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-400">{projectSessions.length} sessions</span>
            {blockedCount > 0 && (
              <span className="text-rose-400 font-medium">· {blockedCount} blocked</span>
            )}
          </div>

          {/* Center: Linux / tmux Hotkey Cheatline */}
          <div className="hidden lg:flex items-center gap-3 text-[9px] text-zinc-600 font-mono">
            <span><kbd className="text-zinc-400 font-semibold">^P</kbd> cmd</span>
            <span><kbd className="text-zinc-400 font-semibold">^B</kbd> rail</span>
            <span><kbd className="text-zinc-400 font-semibold">^⌥B</kbd> panel</span>
            <span><kbd className="text-zinc-400 font-semibold">^O</kbd> dir</span>
            <span><kbd className="text-zinc-400 font-semibold">^,</kbd> config</span>
          </div>

          {/* Right: Telemetry & Port */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5">
              <Radio className="w-2.5 h-2.5 text-zinc-600" />
              <span className="text-zinc-500">:7501</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  daemonStatus === 'connected' ? 'bg-zinc-400' : 'bg-rose-500'
                }`}
              />
              <span className="text-zinc-400">
                {daemonStatus === 'connected' ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Autonomous Lead Delegation Modal */}
      <DelegateTaskModal
        isOpen={isDelegateModalOpen}
        onClose={() => setIsDelegateModalOpen(false)}
      />

      {/* Preferences & Themes Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Linux Terminal / Vim-style Command Palette Modal */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
    </div>
  );
};

export default App;
