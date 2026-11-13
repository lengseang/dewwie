import React, { useEffect, useState } from 'react';
import { useWorkspaceStore } from './store/workspaceStore';
import { WorkspaceSidebar } from './components/BuildMode/WorkspaceSidebar';
import { DualTerminalPane } from './components/BuildMode/DualTerminalPane';
import { ExplorerPane } from './components/ExplorerPane';
import { DiffViewer } from './components/ReviewMode/DiffViewer';
import { MergeBar } from './components/ReviewMode/MergeBar';
import {
  Terminal,
  FolderTree,
  GitCompare,
  Cpu,
  HardDrive,
  Radio,
  Code2,
  Zap,
  Check,
  Copy,
  FolderOpen,
  PanelRightClose,
  PanelRight,
  PanelLeftClose,
  PanelLeft,
  Search,
} from 'lucide-react';
import { ExternalEditor } from './types';

export const App: React.FC = () => {
  const {
    activeWorkspaceId,
    workspaces,
    daemonStatus,
    launchEditor,
    activeTab,
    setActiveTab,
    initNativeSync,
  } = useWorkspaceStore();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelView, setRightPanelView] = useState<'files' | 'changes'>('files');
  const [copiedPath, setCopiedPath] = useState(false);
  const [launchingEditor, setLaunchingEditor] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');

  const isNative = typeof window !== 'undefined' && !!window.swarmherdNative?.isNative;

  useEffect(() => {
    initNativeSync();
  }, [initNativeSync]);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;
  const currentPath = activeWs ? activeWs.worktreePath : 'D:\\1111-Works\\exbytelab';

  // Keyboard shortcut routing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl && e.key === '1') {
        e.preventDefault();
        setActiveTab('terminal');
      } else if (isCmdOrCtrl && e.key === '2') {
        e.preventDefault();
        setActiveTab('changes');
      } else if (isCmdOrCtrl && e.key === '3') {
        e.preventDefault();
        setActiveTab('files');
      } else if (isCmdOrCtrl && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        handleLaunch('cursor');
      } else if (isCmdOrCtrl && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, activeWorkspaceId]);

  const handleLaunch = async (editor: ExternalEditor) => {
    setLaunchingEditor(editor);
    try {
      await launchEditor(editor, activeWorkspaceId || undefined);
    } finally {
      setTimeout(() => setLaunchingEditor(null), 1000);
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(currentPath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  const allWorkspacesList = Object.values(workspaces);
  const totalCpu = allWorkspacesList.reduce((acc, ws) => acc + ws.metrics.cpuPercent, 0);
  const totalMemory = allWorkspacesList.reduce((acc, ws) => acc + ws.metrics.memoryMb, 0);
  const activePorts = allWorkspacesList.flatMap((ws) => ws.ports);
  const blockedCount = allWorkspacesList.filter((w) => w.agentStatus.state === 'blocked').length;
  const totalFilesChanged = activeWs?.diffSummary.filesChanged || 0;

  return (
    <div className="flex h-screen w-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans select-none antialiased">
      {/* 1. DevSwarm & VSCode-Style Hierarchical Workspaces Sidebar (Collapsible) */}
      {sidebarOpen && <WorkspaceSidebar />}

      {/* 2. Main Stage Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Precision Top Tab Bar */}
        <header className={`h-10 px-3 border-b border-zinc-800/80 bg-zinc-950 flex items-center justify-between gap-3 shrink-0 z-20 font-mono ${isNative ? 'pr-36' : ''}`}>
          {/* Left: Sidebar Toggle + Active Workspace Path */}
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle Sidebar (Ctrl+B)"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors shrink-0"
            >
              {sidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
            </button>

            <div
              onClick={handleCopyPath}
              title="Click to copy worktree path"
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white cursor-pointer truncate max-w-xs md:max-w-md transition-colors"
            >
              <FolderOpen className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="font-semibold text-zinc-200 truncate">
                {activeWs ? `${activeWs.repository || 'exbytelab'} / ${activeWs.branch}` : 'exbytelab'}
              </span>
              {copiedPath ? (
                <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0 ml-0.5" />
              ) : (
                <Copy className="w-2.5 h-2.5 text-zinc-600 hover:text-zinc-400 shrink-0 ml-0.5" />
              )}
            </div>

            {activeWs?.agentStatus.state === 'blocked' && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 agent-blocked-dot">
                needs you
              </span>
            )}
          </div>

          {/* Center: Search / Command Palette Input (DevSwarm style) */}
          <div className="flex-1 max-w-sm hidden sm:flex items-center relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder={`Search in ${activeWs?.name || 'workspace'}...`}
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-zinc-900/80 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
            />
          </div>

          {/* Right: View Toggles & Tools */}
          <div className="flex items-center gap-1.5">
            {/* View Mode Pills */}
            <div className="flex items-center bg-zinc-900/80 p-0.5 rounded border border-zinc-800">
              <button
                onClick={() => {
                  setActiveTab('terminal');
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs transition-colors ${
                  activeTab === 'terminal'
                    ? 'bg-zinc-800 text-zinc-100 font-medium shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Terminal className="w-3 h-3" />
                <span>Terminal</span>
              </button>

              <button
                onClick={() => {
                  if (activeTab === 'terminal') {
                    setRightPanelView('files');
                    setRightPanelOpen(true);
                  } else {
                    setActiveTab('files');
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs transition-colors ${
                  activeTab === 'files' || (activeTab === 'terminal' && rightPanelOpen && rightPanelView === 'files')
                    ? 'bg-zinc-800 text-zinc-100 font-medium shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <FolderTree className="w-3 h-3" />
                <span>Files</span>
              </button>

              <button
                onClick={() => {
                  if (activeTab === 'terminal') {
                    setRightPanelView('changes');
                    setRightPanelOpen(true);
                  } else {
                    setActiveTab('changes');
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs transition-colors ${
                  activeTab === 'changes' || (activeTab === 'terminal' && rightPanelOpen && rightPanelView === 'changes')
                    ? 'bg-zinc-800 text-zinc-100 font-medium shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <GitCompare className="w-3 h-3" />
                <span>Changes</span>
                {totalFilesChanged > 0 && (
                  <span className="px-1 py-0.2 text-[9px] rounded bg-zinc-700 text-zinc-200">
                    {totalFilesChanged}
                  </span>
                )}
              </button>
            </div>

            {/* Toggle Docked Right Panel */}
            {activeTab === 'terminal' && (
              <button
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                title={rightPanelOpen ? 'Hide Right Inspector Panel' : 'Show Right Inspector Panel'}
                className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
              >
                {rightPanelOpen ? (
                  <PanelRightClose className="w-3.5 h-3.5" />
                ) : (
                  <PanelRight className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {/* External Editors */}
            <button
              onClick={() => handleLaunch('cursor')}
              disabled={!!launchingEditor}
              title="Open in Cursor IDE (Ctrl+O)"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
            >
              <Code2 className="w-3 h-3 text-zinc-400" />
              <span>Cursor</span>
            </button>

            <button
              onClick={() => handleLaunch('zed')}
              disabled={!!launchingEditor}
              title="Open in Zed"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
            >
              <Zap className="w-3 h-3 text-zinc-400" />
              <span>Zed</span>
            </button>

            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  daemonStatus === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span className="text-zinc-400">:7500</span>
            </div>
          </div>
        </header>

        {/* Dynamic Center Stage Viewport */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {activeTab === 'terminal' && (
            <div className="flex-1 flex h-full overflow-hidden">
              <div className="flex-1 h-full overflow-hidden">
                <DualTerminalPane />
              </div>
              {rightPanelOpen && (
                <div className="w-80 h-full border-l border-zinc-800/80 bg-zinc-950 flex flex-col shrink-0">
                  {rightPanelView === 'files' ? (
                    <ExplorerPane sidebarOnly />
                  ) : (
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                      <DiffViewer />
                      <MergeBar />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {activeTab === 'files' && <ExplorerPane />}
          {activeTab === 'changes' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="flex-1 h-full overflow-hidden">
                <DiffViewer />
              </div>
              <MergeBar />
            </div>
          )}
        </main>

        {/* Herdr-Style Bottom Signature Status Bar */}
        <footer className="h-6 px-3 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono text-zinc-500 shrink-0 select-none">
          {/* Left: Host, Active Branch & Agent Rollup */}
          <div className="flex items-center gap-2.5">
            <span className="text-zinc-400">This computer</span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-300 font-semibold">{activeWs?.branch || 'main'}</span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-400">
              • {allWorkspacesList.length} agents
            </span>
            {blockedCount > 0 && (
              <span className="text-amber-400 font-bold">
                · {blockedCount} needs you
              </span>
            )}
          </div>

          {/* Center: Live Port Registry */}
          <div className="hidden md:flex items-center gap-2">
            <Radio className="w-2.5 h-2.5 text-zinc-600" />
            <span className="text-zinc-600">PORTS:</span>
            {activePorts.slice(0, 3).map((p, idx) => (
              <a
                key={idx}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {p.service}:<span className="text-zinc-300 font-semibold">:{p.port}</span>
              </a>
            ))}
          </div>

          {/* Right: Metrics & Shortcut Hints */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-zinc-400">
              <Cpu className="w-2.5 h-2.5 text-zinc-600" />
              <span>{totalCpu.toFixed(1)}%</span>
            </div>

            <div className="flex items-center gap-1 text-zinc-400">
              <HardDrive className="w-2.5 h-2.5 text-zinc-600" />
              <span>{totalMemory}MB</span>
            </div>

            <span className="text-zinc-700 hidden lg:inline">
              ^1 Terminal · ^2 Changes · ^B Sidebar
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
