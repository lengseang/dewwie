import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  Trash2,
  Copy,
  Check,
  Columns2,
  Terminal as TerminalIcon,
  RefreshCw,
  X,
} from 'lucide-react';

export const DualTerminalPane: React.FC = () => {
  const {
    activeWorkspaceId,
    activeProjectId,
    workspaces,
    projects,
    isSplitView,
    toggleSplitView,
    setActiveWorkspace,
    deleteWorkspace,
  } = useWorkspaceStore();

  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightContainerRef = useRef<HTMLDivElement>(null);
  const leftWsRef = useRef<WebSocket | null>(null);
  const rightWsRef = useRef<WebSocket | null>(null);
  const leftTermRef = useRef<Terminal | null>(null);
  const rightTermRef = useRef<Terminal | null>(null);
  const leftFitRef = useRef<FitAddon | null>(null);
  const rightFitRef = useRef<FitAddon | null>(null);

  const [copied, setCopied] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;

  // Secondary workspace for right pane in split mode
  const allList = Object.values(workspaces);
  const secondaryWs = allList.find((w) => w.id !== activeWorkspaceId) || allList[0];

  // Helper: Setup real PTY WebSocket connection for an xterm instance
  const attachPty = useCallback((container: HTMLDivElement | null, workspaceId: string, isLeft: boolean) => {
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', Cascadia Code, Menlo, monospace",
      theme: {
        background: '#09090b',
        foreground: '#f4f4f5',
        cursor: '#a1a1aa',
        selectionBackground: 'rgba(255, 255, 255, 0.15)',
        black: '#18181b',
        red: '#f43f5e',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#38bdf8',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#f4f4f5',
        brightBlack: '#71717a',
        brightRed: '#fb7185',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#e879f9',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
      convertEol: true,
      scrollback: 10000,
      allowTransparency: true,
      smoothScrollDuration: 80,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    if (isLeft) {
      leftTermRef.current = term;
      leftFitRef.current = fit;
    } else {
      rightTermRef.current = term;
      rightFitRef.current = fit;
    }

    // Connect to native PTY WebSocket server (Port 7501)
    const wsUrl = `ws://127.0.0.1:7501?workspaceId=${encodeURIComponent(workspaceId)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log(`[PTY Client] Connected live to ${workspaceId}`);
      if (isLeft) setIsLiveConnected(true);
      fit.fit();
      // Send initial terminal geometry
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        term.write(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      }
    };

    ws.onerror = () => {
      console.warn(`[PTY Client] WebSocket error for ${workspaceId}.`);
      if (isLeft) setIsLiveConnected(false);
    };

    ws.onclose = () => {
      if (isLeft) setIsLiveConnected(false);
    };

    // Forward raw keyboard data to real PTY stdin
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle resize
    term.onResize((size) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
      }
    });

    if (isLeft) {
      leftWsRef.current = ws;
    } else {
      rightWsRef.current = ws;
    }
  }, []);

  useEffect(() => {
    // Cleanup previous instances
    leftWsRef.current?.close();
    rightWsRef.current?.close();
    leftTermRef.current?.dispose();
    rightTermRef.current?.dispose();

    if (activeWorkspaceId) {
      attachPty(leftContainerRef.current, activeWorkspaceId, true);
    }

    if (isSplitView && secondaryWs) {
      attachPty(rightContainerRef.current, secondaryWs.id, false);
    }

    const handleResize = () => {
      leftFitRef.current?.fit();
      rightFitRef.current?.fit();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      leftWsRef.current?.close();
      rightWsRef.current?.close();
      leftTermRef.current?.dispose();
      rightTermRef.current?.dispose();
    };
  }, [activeWorkspaceId, isSplitView, secondaryWs?.id, attachPty]);

  const handleCopyLogs = () => {
    // Select all terminal buffer text and copy
    leftTermRef.current?.selectAll();
    const selection = leftTermRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
      leftTermRef.current?.clearSelection();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleRestartShell = () => {
    if (activeWorkspaceId) {
      leftWsRef.current?.close();
      leftTermRef.current?.reset();
      attachPty(leftContainerRef.current, activeWorkspaceId, true);
    }
  };

  if (!activeWs) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-zinc-950 text-zinc-600 font-mono text-xs">
        No active workspace. Select or create one from the sidebar.
      </div>
    );
  }

  const projectSessions = Object.values(workspaces).filter(
    (w) => !activeProjectId || w.projectId === activeProjectId || w.repository === projects[activeProjectId]?.name
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090b] text-zinc-100 overflow-hidden relative select-none font-mono">
      {/* Minimal Precision Terminal Header Strip */}
      <div className="h-8 px-2 border-b border-zinc-800/80 bg-zinc-950 flex items-center justify-between gap-2 shrink-0">
        {/* Terminal Tabs */}
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
          {projectSessions.map((ws) => {
            const isActive = activeWs.id === ws.id;
            const isLocal = ws.sessionMode === 'local' || !ws.sessionMode;

            return (
              <div
                key={ws.id}
                onClick={() => setActiveWorkspace(ws.id)}
                className={`group flex items-center gap-2 px-2.5 py-1 rounded text-xs cursor-pointer transition-all shrink-0 ${
                  isActive
                    ? 'bg-zinc-900 text-zinc-100 font-semibold border border-zinc-800 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40 border border-transparent'
                }`}
              >
                <TerminalIcon className={`w-3 h-3 ${isActive ? 'text-blue-400' : 'text-zinc-600'}`} />
                <span className="truncate max-w-[140px]">{ws.name}</span>

                {isActive && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isLiveConnected ? 'bg-emerald-400' : 'bg-blue-400'
                    }`}
                  />
                )}

                {ws.id !== 'ws-main' && !isLocal && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWorkspace(ws.id);
                    }}
                    title="Close session"
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Minimal Terminal Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleSplitView}
            title={isSplitView ? 'Single View' : 'Split Terminals Side-by-Side'}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
              isSplitView
                ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800/60'
            }`}
          >
            <Columns2 className="w-3 h-3" />
            <span className="hidden sm:inline">{isSplitView ? 'Split (Dual)' : 'Split View'}</span>
          </button>

          <button
            onClick={handleRestartShell}
            title="Restart Shell Process"
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
          </button>

          <button
            onClick={handleCopyLogs}
            title="Copy Buffer"
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>

          <button
            onClick={() => leftTermRef.current?.clear()}
            title="Clear Terminal Buffer"
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Full-Height Terminal Viewports (Single or Side-by-Side Dual Panes) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane (Primary Agent PTY) */}
        <div
          onClick={() => leftTermRef.current?.focus()}
          className="flex-1 h-full bg-[#09090b] relative overflow-hidden cursor-text"
        >
          <div ref={leftContainerRef} className="w-full h-full" />
        </div>

        {/* Right Pane (Secondary Agent PTY in Split View) */}
        {isSplitView && secondaryWs && (
          <div
            onClick={() => rightTermRef.current?.focus()}
            className="flex-1 h-full bg-[#09090b] border-l border-zinc-800/80 relative overflow-hidden cursor-text"
          >
            <div ref={rightContainerRef} className="w-full h-full" />
          </div>
        )}
      </div>
    </div>
  );
};
