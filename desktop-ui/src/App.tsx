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
import { getAgentIcon } from './components/AgentIcons';
import {
  PanelRightClose,
  PanelRight,
  PanelLeftClose,
  PanelLeft,
  Columns2,
  X,
  Plus,
  Settings,
  Radio,
  ChevronDown,
  FolderOpen,
  GitBranch,
  Sun,
  Moon,
} from 'lucide-react';
import { THEMES_CONFIG, isLightTheme, getOppositeModeTheme } from './theme/themes';

export const App: React.FC = () => {
  const {
    activeWorkspaceId,
    openTabIds,
    closeTab,
    activeProjectId,
    projects,
    workspaces,
    daemonStatus,
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
    setActiveWorkspace,
    initNativeSync,
    createSession,
    theme,
    setTheme,
    sidebarWidth,
    setSidebarWidth,
    rightPanelWidth,
    setRightPanelWidth,
    pickAndOpenFolder,
    renameWorkspace,
    workspaceOrder,
  } = useWorkspaceStore();

  const [isDelegateModalOpen, setIsDelegateModalOpen] = useState(false);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');

  // Resize drag states
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const isNative = typeof window !== 'undefined' && !!(window.swarmherdNative?.isNative || (window as any).electronAPI);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const api = (window as any).swarmherdNative || (window as any).electronAPI;
    if (api?.isWindowMaximized) {
      api.isWindowMaximized().then(setIsMaximized);
    }
    if (api?.onWindowMaximized) {
      return api.onWindowMaximized(setIsMaximized);
    }
  }, []);

  useEffect(() => {
    initNativeSync();
  }, [initNativeSync]);

  // Synchronize dynamic active theme with document and xterm viewports
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const tDef = THEMES_CONFIG[theme] || THEMES_CONFIG.zinc;
    document.body.style.backgroundColor = tDef.bg;
    const root = document.documentElement;
    root.style.setProperty('--app-bg', tDef.bg);
    root.style.setProperty('--app-surface', tDef.surface);
    root.style.setProperty('--app-surface-elevated', tDef.surfaceElevated);
    root.style.setProperty('--app-nav-bg', tDef.navBg);
    root.style.setProperty('--app-border', tDef.border);
    root.style.setProperty('--app-border-subtle', tDef.borderSubtle);
    root.style.setProperty('--app-text', tDef.text);
    root.style.setProperty('--app-text-muted', tDef.textMuted);
    root.style.setProperty('--app-accent', tDef.accent);
    root.style.setProperty('--app-ok', tDef.terminal.green);
    root.style.setProperty('--app-err', tDef.terminal.red);
  }, [theme]);

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
      if (isResizingLeft || isResizingRight) {
        useWorkspaceStore.getState().persistState();
      }
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

  // Filter project sessions with stable order
  const orderedList = workspaceOrder
    .map((id) => workspaces[id])
    .filter((w): w is NonNullable<typeof w> => !!w);
  const remainingWorkspaces = Object.values(workspaces).filter(
    (w) => !workspaceOrder.includes(w.id)
  );
  const projectSessions = [...orderedList, ...remainingWorkspaces].filter(
    (w) => !activeProjectId || w.projectId === activeProjectId || w.repository === currentProject?.name || w.id === activeWorkspaceId
  );

  // Clean, focused active tab strip (Only actively opened tabs, matching minimal Image 1 aesthetic)
  const renderedTabs = openTabIds
    .map((id) => workspaces[id])
    .filter((w): w is NonNullable<typeof w> => !!w);
  const activeTabsList = renderedTabs.length > 0 ? renderedTabs : (activeWs ? [activeWs] : []);

  // Keyboard shortcut routing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        handleSpawnAgent('terminal');
      } else if (isCmdOrCtrl && e.key === '1') {
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
      } else if (isCmdOrCtrl && e.altKey && (e.key === 'b' || e.key === 'B')) {
        // Must be checked before plain Ctrl+B, otherwise it is unreachable.
        e.preventDefault();
        toggleRightPanel();
      } else if (isCmdOrCtrl && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebar();
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

    // xterm cancels the keys it handles, so the bubble-phase listener above never fires while a terminal
    // has focus. Claim only the two escape hatches (Ctrl+P palette, Ctrl+, settings) in capture phase;
    // everything else stays with the shell/agent (Claude Code uses Ctrl+B and Ctrl+T itself).
    const handleTerminalEscapeHatch = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (!(e.target as HTMLElement | null)?.classList?.contains('xterm-helper-textarea')) return;
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        e.stopPropagation();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === ',') {
        e.preventDefault();
        e.stopPropagation();
        setIsSettingsOpen(true);
      }
    };

    window.addEventListener('keydown', handleTerminalEscapeHatch, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleTerminalEscapeHatch, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setActiveTab, toggleSidebar, toggleRightPanel, setRightPanelView, pickAndOpenFolder]);

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

  const blockedCount = Object.values(workspaces).filter((w) => w.agentStatus?.state === 'blocked').length;

  return (
    <div
      style={{
        backgroundColor: 'var(--app-bg)',
        color: 'var(--app-text)',
      }}
      className="flex h-screen w-screen overflow-hidden font-sans select-none antialiased"
    >
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
          style={{
            backgroundColor: 'var(--app-nav-bg)',
            borderColor: 'var(--app-border)',
            WebkitAppRegion: 'drag',
          } as React.CSSProperties}
          onDoubleClick={(e) => {
            // Only trigger maximize/restore if double clicking empty drag area, not buttons/tabs/inputs
            if ((e.target as HTMLElement).closest('button, input, select, textarea, [data-no-drag]')) return;
            if (window.swarmherdNative?.maximizeWindow) {
              window.swarmherdNative.maximizeWindow().then((newMax: any) => {
                if (typeof newMax === 'boolean') setIsMaximized(newMax);
              });
            }
          }}
          className="h-9 pl-2 pr-0 border-b flex items-center justify-between gap-2 shrink-0 z-20 font-mono select-none"
        >
          {/* Left: Left Sidebar Toggle + Herdr-Style Agent Navigation Tabs */}
          <div
            className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* Left Sidebar Toggle Button */}
            <button
              onClick={toggleSidebar}
              title={sidebarOpen ? 'Collapse Left Sidebar (Ctrl+B)' : 'Expand Left Sidebar (Ctrl+B)'}
              style={{ color: 'var(--app-text-muted)' }}
              className="p-1 rounded transition-colors shrink-0 hover:opacity-80"
            >
              {sidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
            </button>

            <span className="h-3.5 w-px shrink-0" style={{ backgroundColor: 'var(--app-border)' }} />

            {/* Project & Workspace Scope Breadcrumb */}
            {/* Clean Focused Agent Navigation Tabs Strip (Only actively opened tabs, zero messy clutter) */}
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              {activeTabsList.map((ws) => {
                const isActive = activeWs?.id === ws.id;

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
                    style={{
                      backgroundColor: isActive ? 'var(--app-surface-elevated)' : 'transparent',
                      borderColor: isActive ? 'var(--app-border)' : 'transparent',
                      color: isActive ? 'var(--app-text)' : 'var(--app-text-muted)',
                    }}
                    className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition-colors shrink-0 border ${
                      isActive ? 'font-medium shadow-xs' : 'hover:opacity-100'
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
                        style={{
                          backgroundColor: 'var(--app-surface-elevated)',
                          borderColor: 'var(--app-border)',
                          color: 'var(--app-text)',
                        }}
                        className="w-24 px-1 py-0 border rounded text-[11px] font-mono focus:outline-none"
                      />
                    ) : (
                      <span className="font-mono text-[11px] font-medium max-w-[200px] truncate flex items-center gap-1">
                        {ws.sessionMode === 'branch' && <GitBranch className="w-3 h-3 text-cyan-400 shrink-0" />}
                        <span>{ws.name}</span>
                      </span>
                    )}

                    {/* Subtle Status Indicator */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        ws.agentStatus?.state === 'blocked'
                          ? 'bg-rose-500'
                          : isActive
                          ? 'bg-emerald-400'
                          : 'bg-zinc-600'
                      }`}
                    />

                    {/* Close Tab Button (Unpins tab from top strip, keeps session safe in sidebar) */}
                    {activeTabsList.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(ws.id);
                        }}
                        title="Close tab (keeps session in sidebar)"
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-opacity ml-0.5"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Quick Add Terminal Tab (+) & Agent Dropdown & Folder Picker */}
              <div className="relative shrink-0 flex items-center">
                <button
                  onClick={() => handleSpawnAgent('terminal')}
                  title="New Terminal Tab (Ctrl+T)"
                  style={{ color: 'var(--app-text-muted)' }}
                  className="p-1 rounded transition-colors hover:opacity-80"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
                  title="Start AI Agent (Claude, Antigravity, Shell)..."
                  style={{ color: 'var(--app-text-muted)' }}
                  className="p-1 transition-colors -ml-0.5 hover:opacity-80"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  onClick={pickAndOpenFolder}
                  title="Open Project Directory (Ctrl+O)"
                  style={{ color: 'var(--app-text-muted)' }}
                  className="p-1 transition-colors ml-0.5 hover:opacity-80"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
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
          </div>

          {/* Right: Clean Minimal Essential Controls & Titlebar Controls */}
          <div
            className={`flex items-stretch h-full shrink-0 ${!isNative ? 'pr-2' : ''}`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* View Actions: Split, Agent Room, Dark/Light Mode, Settings */}
            <div className="flex items-center gap-1.5 pr-1.5">
              {/* 1. Split Terminal Side-by-Side */}
              <button
                onClick={toggleSplitView}
                title={isSplitView ? 'Switch to Single Terminal' : 'Split Terminals Side-by-Side'}
                style={isSplitView ? {
                  backgroundColor: 'var(--app-surface-elevated)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                } : {
                  color: 'var(--app-text-muted)',
                }}
                className={`p-1.5 rounded transition-colors ${
                  isSplitView
                    ? 'font-semibold border shadow-xs'
                    : 'hover:opacity-90'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
              </button>

              {/* 2. Toggle Agent Room / Side Panel */}
              <button
                onClick={toggleRightPanel}
                title={rightPanelOpen ? 'Collapse Agent Room Panel (Ctrl+Alt+B)' : 'Expand Agent Room Panel (Ctrl+Alt+B)'}
                style={rightPanelOpen ? {
                  backgroundColor: 'var(--app-surface-elevated)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                } : {
                  color: 'var(--app-text-muted)',
                }}
                className={`p-1.5 rounded transition-colors relative flex items-center ${
                  rightPanelOpen
                    ? 'font-semibold border shadow-xs'
                    : 'hover:opacity-90'
                }`}
              >
                {rightPanelOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
                {roomMessages.length > 0 && !rightPanelOpen && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                )}
              </button>

              {/* 3. Quick 1-Click Dark/Light Mode Toggle */}
              <button
                onClick={() => setTheme(getOppositeModeTheme(theme))}
                title={isLightTheme(theme) ? 'Dark Mode' : 'Light Mode'}
                style={{ color: 'var(--app-text-muted)' }}
                className="p-1.5 rounded transition-colors hover:opacity-90"
              >
                {isLightTheme(theme) ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              </button>

              {/* 4. Settings & Themes */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                title="Settings (Ctrl+,)"
                style={{ color: 'var(--app-text-muted)' }}
                className="p-1.5 rounded transition-colors hover:opacity-90"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Native-Style Windows 11 Titlebar Window Controls */}
            {isNative && (
              <div
                className="flex items-stretch h-full select-none"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <div
                  className="w-[1px] h-3.5 self-center mx-1"
                  style={{ backgroundColor: 'var(--app-border)' }}
                />

                {/* Minimize Button */}
                <button
                  onClick={() => {
                    const api = (window as any).swarmherdNative || (window as any).electronAPI;
                    api?.minimizeWindow?.();
                  }}
                  title="Minimize"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                  className={`w-[46px] h-full flex items-center justify-center transition-colors focus:outline-none ${
                    isLightTheme(theme)
                      ? 'text-zinc-600 hover:text-zinc-950 hover:bg-black/5 active:bg-black/10'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/10 active:bg-white/15'
                  }`}
                >
                  <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                    <path d="M 0.5 5.5 L 9.5 5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                  </svg>
                </button>

                {/* Maximize / Restore Button */}
                <button
                  onClick={async () => {
                    const api = (window as any).swarmherdNative || (window as any).electronAPI;
                    if (api?.maximizeWindow) {
                      const newMax = await api.maximizeWindow();
                      if (typeof newMax === 'boolean') {
                        setIsMaximized(newMax);
                      } else {
                        setIsMaximized((prev) => !prev);
                      }
                    }
                  }}
                  title={isMaximized ? "Restore" : "Maximize"}
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                  className={`w-[46px] h-full flex items-center justify-center transition-colors focus:outline-none ${
                    isLightTheme(theme)
                      ? 'text-zinc-600 hover:text-zinc-950 hover:bg-black/5 active:bg-black/10'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/10 active:bg-white/15'
                  }`}
                >
                  {isMaximized ? (
                    <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                      {/* Crisp double-box restore glyph */}
                      <rect x="1" y="3" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1" />
                      <path d="M 3 3 V 1.5 C 3 1.2 3.2 1 3.5 1 H 8.5 C 8.8 1 9 1.2 9 1.5 V 6.5 C 9 6.8 8.8 7 8.5 7 H 7" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  ) : (
                    <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                      {/* Crisp single-box maximize glyph */}
                      <rect x="1" y="1" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  )}
                </button>

                {/* Close Button */}
                <button
                  onClick={() => {
                    const api = (window as any).swarmherdNative || (window as any).electronAPI;
                    api?.closeWindow?.();
                  }}
                  title="Close"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                  className={`w-[46px] h-full flex items-center justify-center transition-colors focus:outline-none hover:bg-[#e81123] hover:text-white active:bg-[#c42b1c] ${
                    isLightTheme(theme) ? 'text-zinc-600' : 'text-zinc-400'
                  }`}
                >
                  <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                    <path d="M 1 1 L 9 9 M 9 1 L 1 9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}
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
              style={{
                width: `${rightPanelWidth}px`,
                backgroundColor: 'var(--app-surface)',
                borderColor: 'var(--app-border)',
              }}
              className="relative h-full border-l flex flex-col shrink-0 font-mono"
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

              {/* Right Panel Content View */}
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {rightPanelView === 'room' && (
                  <AgentRoomPane
                    onOpenDelegateModal={() => setIsDelegateModalOpen(true)}
                    onClose={toggleRightPanel}
                  />
                )}
                {rightPanelView === 'files' && <ExplorerPane sidebarOnly onClose={toggleRightPanel} />}
                {rightPanelView === 'changes' && (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    <DiffViewer onClose={toggleRightPanel} />
                    <MergeBar />
                  </div>
                )}
              </div>
            </aside>
          )}
        </main>

        {/* Minimal Footer Status Bar */}
        <footer
          style={{
            backgroundColor: 'var(--app-nav-bg)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text-muted)',
          }}
          className="h-6 px-3 border-t flex items-center justify-between text-[10px] font-mono shrink-0 select-none"
        >
          {/* Left: Active session & Agent stats */}
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--app-text)' }}>{currentProject?.name || 'Local'}</span>
            <span style={{ color: 'var(--app-border)' }}>|</span>
            <span className="font-mono text-[9px] truncate max-w-[200px]" style={{ color: 'var(--app-text-muted)' }}>{currentProject?.rootPath}</span>
            <span style={{ color: 'var(--app-border)' }}>|</span>
            <span style={{ color: 'var(--app-text-muted)' }}>{projectSessions.length} sessions</span>
            {blockedCount > 0 && (
              <span className="text-rose-400 font-medium">· {blockedCount} blocked</span>
            )}
          </div>

          {/* Center: Linux / tmux Hotkey Cheatline */}
          <div className="hidden lg:flex items-center gap-3 text-[9px] font-mono" style={{ color: 'var(--app-text-muted)' }}>
            <span><kbd className="font-semibold" style={{ color: 'var(--app-text)' }}>^P</kbd> cmd</span>
            <span><kbd className="font-semibold" style={{ color: 'var(--app-text)' }}>^B</kbd> rail</span>
            <span><kbd className="font-semibold" style={{ color: 'var(--app-text)' }}>^⌥B</kbd> panel</span>
            <span><kbd className="font-semibold" style={{ color: 'var(--app-text)' }}>^O</kbd> dir</span>
            <span><kbd className="font-semibold" style={{ color: 'var(--app-text)' }}>^,</kbd> config</span>
          </div>

          {/* Right: Telemetry & Port (Zero Network Ports: Pure In-Memory PTY IPC) */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5">
              <Radio className={`w-2.5 h-2.5 ${isNative ? 'text-emerald-500' : 'text-zinc-500'}`} />
              <span className="font-mono text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
                {isNative ? 'In-Memory IPC' : 'Web Simulation'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  daemonStatus === 'connected' ? 'bg-emerald-400' : 'bg-rose-500'
                }`}
              />
              <span style={{ color: 'var(--app-text-muted)' }}>
                {daemonStatus === 'connected' ? 'Ready' : 'Offline'}
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
