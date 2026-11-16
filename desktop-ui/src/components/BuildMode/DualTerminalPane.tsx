import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { THEMES_CONFIG } from '../../theme/themes';

export const DualTerminalPane: React.FC = () => {
  const {
    activeWorkspaceId,
    workspaces,
    isSplitView,
    theme,
  } = useWorkspaceStore();

  const [splitRatio, setSplitRatio] = useState(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightContainerRef = useRef<HTMLDivElement>(null);
  const leftWsRef = useRef<WebSocket | null>(null);
  const rightWsRef = useRef<WebSocket | null>(null);
  const leftTermRef = useRef<Terminal | null>(null);
  const rightTermRef = useRef<Terminal | null>(null);
  const leftFitRef = useRef<FitAddon | null>(null);
  const rightFitRef = useRef<FitAddon | null>(null);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;

  // Secondary workspace for right pane in split mode
  const allList = Object.values(workspaces);
  const secondaryWs = allList.find((w) => w.id !== activeWorkspaceId) || allList[0];

  // Helper: Setup real PTY WebSocket connection for an xterm instance
  const attachPty = useCallback(async (container: HTMLDivElement | null, workspaceId: string, isLeft: boolean) => {
    if (!container) return;
    container.innerHTML = ''; // Ensure clean container with zero duplicate DOM artifacts

    const currentThemeDef = THEMES_CONFIG[theme] || THEMES_CONFIG.zinc;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', Cascadia Code, Menlo, monospace",
      theme: currentThemeDef.terminal,
      convertEol: true,
      scrollback: 10000,
      allowTransparency: true,
      smoothScrollDuration: 80,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();
    term.focus();

    if (isLeft) {
      leftTermRef.current = term;
      leftFitRef.current = fit;
    } else {
      rightTermRef.current = term;
      rightFitRef.current = fit;
    }

    let targetPort = 7501;
    if (typeof window !== 'undefined' && window.swarmherdNative?.getWsPort) {
      try {
        targetPort = await window.swarmherdNative.getWsPort();
      } catch (_) {}
    } else if (typeof window !== 'undefined' && window.swarmherdNative?.wsPort) {
      targetPort = window.swarmherdNative.wsPort;
    }

    // Connect to native PTY WebSocket server
    const wsUrl = `ws://127.0.0.1:${targetPort}?workspaceId=${encodeURIComponent(workspaceId)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log(`[PTY Client] Connected live to ${workspaceId}`);
      fit.fit();
      term.focus();
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
    };

    ws.onclose = () => {
      console.log(`[PTY Client] Connection closed for ${workspaceId}.`);
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
      try {
        leftFitRef.current?.fit();
        rightFitRef.current?.fit();
      } catch (_) {}
    };

    const ro = new ResizeObserver(() => {
      handleResize();
    });

    if (leftContainerRef.current) ro.observe(leftContainerRef.current);
    if (rightContainerRef.current) ro.observe(rightContainerRef.current);

    window.addEventListener('resize', handleResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
      leftWsRef.current?.close();
      rightWsRef.current?.close();
      leftTermRef.current?.dispose();
      rightTermRef.current?.dispose();
      if (leftContainerRef.current) leftContainerRef.current.innerHTML = '';
      if (rightContainerRef.current) rightContainerRef.current.innerHTML = '';
    };
  }, [activeWorkspaceId, isSplitView, isSplitView ? secondaryWs?.id : null, attachPty]);

  const handleCopyLogs = () => {
    // Select all terminal buffer text and copy
    leftTermRef.current?.selectAll();
    const selection = leftTermRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
      leftTermRef.current?.clearSelection();
    }
  };

  const handleRestartShell = () => {
    if (activeWorkspaceId) {
      leftWsRef.current?.close();
      leftTermRef.current?.dispose();
      if (leftContainerRef.current) leftContainerRef.current.innerHTML = '';
      attachPty(leftContainerRef.current, activeWorkspaceId, true);
    }
  };

  // Listen for terminal actions triggered from unified top bar
  useEffect(() => {
    const handleAction = (e: Event) => {
      const custom = e as CustomEvent<{ action: string }>;
      if (custom.detail?.action === 'restart') {
        handleRestartShell();
      } else if (custom.detail?.action === 'copy') {
        handleCopyLogs();
      } else if (custom.detail?.action === 'clear') {
        leftTermRef.current?.clear();
      }
    };
    window.addEventListener('dewwie:terminal-action', handleAction);
    return () => window.removeEventListener('dewwie:terminal-action', handleAction);
  }, [handleRestartShell, handleCopyLogs]);

  // Terminal drag splitter listener
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = Math.max(20, Math.min(80, (relativeX / rect.width) * 100));
      setSplitRatio(percentage);
      try {
        leftFitRef.current?.fit();
        rightFitRef.current?.fit();
      } catch (_) {}
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
      try {
        leftFitRef.current?.fit();
        rightFitRef.current?.fit();
      } catch (_) {}
    };

    if (isDraggingSplit) {
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
  }, [isDraggingSplit]);

  // Dynamic Live Theme Synchronization
  useEffect(() => {
    const tDef = THEMES_CONFIG[theme] || THEMES_CONFIG.zinc;
    if (leftTermRef.current) {
      leftTermRef.current.options.theme = tDef.terminal;
    }
    if (rightTermRef.current) {
      rightTermRef.current.options.theme = tDef.terminal;
    }
  }, [theme]);

  if (!activeWs) {
    return (
      <div
        style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
        className="flex-1 h-full flex items-center justify-center font-mono text-xs"
      >
        No active workspace. Select or create one from the sidebar.
      </div>
    );
  }

  return (
    <div
      ref={splitContainerRef}
      style={{ backgroundColor: 'var(--app-bg)' }}
      className="flex-1 flex h-full overflow-hidden relative"
    >
      {/* Left Pane (Primary Agent PTY) */}
      <div
        onClick={() => leftTermRef.current?.focus()}
        style={{
          width: isSplitView && secondaryWs ? `${splitRatio}%` : '100%',
          backgroundColor: 'var(--app-bg)',
        }}
        className="h-full relative overflow-hidden cursor-text shrink-0"
      >
        <div ref={leftContainerRef} className="w-full h-full" />
      </div>

      {/* Draggable Terminal Split Resizer */}
      {isSplitView && secondaryWs && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDraggingSplit(true);
          }}
          onDoubleClick={() => {
            setSplitRatio(50);
            setTimeout(() => {
              leftFitRef.current?.fit();
              rightFitRef.current?.fit();
            }, 50);
          }}
          title="Drag to resize split terminals (double-click to reset 50/50)"
          className="w-1 hover:w-1.5 bg-zinc-800/80 hover:bg-zinc-500 active:bg-zinc-300 cursor-col-resize z-20 shrink-0 transition-colors"
        />
      )}

      {/* Right Pane (Secondary Agent PTY in Split View) */}
      {isSplitView && secondaryWs && (
        <div
          onClick={() => rightTermRef.current?.focus()}
          style={{
            width: `${100 - splitRatio}%`,
            backgroundColor: 'var(--app-bg)',
          }}
          className="h-full relative overflow-hidden cursor-text shrink-0"
        >
          <div ref={rightContainerRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
};
