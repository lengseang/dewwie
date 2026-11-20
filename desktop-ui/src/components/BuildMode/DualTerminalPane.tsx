import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
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
  const leftTermRef = useRef<Terminal | null>(null);
  const rightTermRef = useRef<Terminal | null>(null);
  const leftFitRef = useRef<FitAddon | null>(null);
  const rightFitRef = useRef<FitAddon | null>(null);
  const lastLeftWsId = useRef<string | null>(null);
  const lastRightWsId = useRef<string | null>(null);
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;

  // Secondary workspace for right pane in split mode
  const allList = Object.values(workspaces);
  const secondaryWs = allList.find((w) => w.id !== activeWorkspaceId) || allList[0];

  // Helper: Setup real PTY in-memory IPC connection for an xterm instance
  const attachPty = useCallback(async (container: HTMLDivElement | null, workspaceId: string, isLeft: boolean) => {
    if (!container || !workspaceId) return;
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

    requestAnimationFrame(() => {
      try {
        fit.fit();
        term.focus();
      } catch (_) {}
    });

    if (isLeft) {
      leftTermRef.current = term;
      leftFitRef.current = fit;
      lastLeftWsId.current = workspaceId;
    } else {
      rightTermRef.current = term;
      rightFitRef.current = fit;
      lastRightWsId.current = workspaceId;
    }

    // 1. Attach to real Native PTY over In-Memory IPC (Zero network ports)
    if (typeof window !== 'undefined' && window.swarmherdNative?.attachTerminal) {
      try {
        const initialScrollback = await window.swarmherdNative.attachTerminal(workspaceId);
        // Size xterm to its container and the PTY to xterm BEFORE replaying history; replaying first laid
        // the history out at xterm's default 80x24 and then reflowed it (mid-token wraps, broken TUI frames).
        try {
          fit.fit();
        } catch (_) {}
        if (term.cols > 0 && term.rows > 0) {
          window.swarmherdNative?.resizeTerminal?.(workspaceId, term.cols, term.rows);
        }
        if (initialScrollback) {
          term.write(initialScrollback);
        }
        try {
          term.focus();
        } catch (_) {}
      } catch (err) {
        console.error(`[PTY IPC] Failed to attach workspace ${workspaceId}:`, err);
      }
    } else {
      // Browser fallback simulation if running outside Electron
      const currentWs = workspacesRef.current[workspaceId];
      const workingDir = currentWs?.worktreePath || '~';
      term.writeln('\x1b[38;5;244m[Dewwie Web Mode] PTY shell simulation ready • ' + workingDir + '\x1b[0m');
      term.writeln('\x1b[38;5;248mPowerShell 7.5.0\x1b[0m');
      term.write(`\r\n\x1b[38;5;39mPS ${workingDir}>\x1b[0m `);
    }

    let inputBuf = '';
    const currentWs = workspacesRef.current[workspaceId];
    const workingDir = currentWs?.worktreePath || '~';

    // Forward raw keyboard data to real PTY stdin via direct in-memory IPC
    term.onData((data) => {
      if (typeof window !== 'undefined' && window.swarmherdNative?.writeTerminal) {
        window.swarmherdNative.writeTerminal(workspaceId, data);
      } else {
        // Fallback simulation
        if (data === '\r') {
          term.writeln('');
          const trimmed = inputBuf.trim();
          if (trimmed === 'clear' || trimmed === 'cls') {
            term.clear();
          } else if (trimmed) {
            term.writeln(`\x1b[38;5;245m[sim] ${trimmed}\x1b[0m`);
          }
          inputBuf = '';
          term.write(`\r\n\x1b[38;5;39mPS ${workingDir}>\x1b[0m `);
        } else if (data === '\u007F' || data === '\b') {
          if (inputBuf.length > 0) {
            inputBuf = inputBuf.slice(0, -1);
            term.write('\b \b');
          }
        } else {
          inputBuf += data;
          term.write(data);
        }
      }
    });

    // Handle resize over IPC
    term.onResize((size) => {
      if (typeof window !== 'undefined' && window.swarmherdNative?.resizeTerminal && size.cols > 0 && size.rows > 0) {
        window.swarmherdNative.resizeTerminal(workspaceId, size.cols, size.rows);
      }
    });
  }, [theme]);

  // Global listener for PTY data stream from Electron Main over in-memory IPC
  useEffect(() => {
    if (typeof window === 'undefined' || !window.swarmherdNative?.onTerminalData) return;
    const unsub = window.swarmherdNative.onTerminalData(({ workspaceId, data }) => {
      if (workspaceId === lastLeftWsId.current && leftTermRef.current) {
        leftTermRef.current.write(data);
      }
      if (workspaceId === lastRightWsId.current && rightTermRef.current) {
        rightTermRef.current.write(data);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    // Only re-attach if workspace has actually changed
    if (activeWorkspaceId && activeWorkspaceId !== lastLeftWsId.current) {
      leftTermRef.current?.dispose();
      if (leftContainerRef.current) leftContainerRef.current.innerHTML = '';
      attachPty(leftContainerRef.current, activeWorkspaceId, true);
    } else if (!leftTermRef.current && activeWorkspaceId) {
      attachPty(leftContainerRef.current, activeWorkspaceId, true);
    }

    if (isSplitView && secondaryWs) {
      if (secondaryWs.id !== lastRightWsId.current || !rightTermRef.current) {
        rightTermRef.current?.dispose();
        if (rightContainerRef.current) rightContainerRef.current.innerHTML = '';
        attachPty(rightContainerRef.current, secondaryWs.id, false);
      }
    } else {
      rightTermRef.current?.dispose();
      lastRightWsId.current = null;
      if (rightContainerRef.current) rightContainerRef.current.innerHTML = '';
    }

    let resizeTimer: any = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          leftFitRef.current?.fit();
          rightFitRef.current?.fit();
        } catch (_) {}
      }, 60);
    };

    const ro = new ResizeObserver(() => {
      handleResize();
    });

    if (leftContainerRef.current) ro.observe(leftContainerRef.current);
    if (rightContainerRef.current) ro.observe(rightContainerRef.current);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(handleResize, 50);
        setTimeout(handleResize, 200);
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
        className="flex-1 h-full flex flex-col items-center justify-center font-mono text-xs gap-3 select-none"
      >
        <div
          style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
          className="w-10 h-10 rounded-lg border flex items-center justify-center"
        >
          <TerminalIcon className="w-5 h-5" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="font-semibold text-sm" style={{ color: 'var(--app-text)' }}>Terminal Ready</span>
          <span className="text-[11px]" style={{ color: 'var(--app-text-muted)' }}>Select a workspace or start a shell</span>
        </div>
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
          flex: isSplitView && secondaryWs ? `${splitRatio} 1 0%` : '1 1 0%',
          minWidth: 160,
          backgroundColor: 'var(--app-bg)',
        }}
        className="h-full relative overflow-hidden cursor-text"
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
          style={{ backgroundColor: 'var(--app-border)' }}
          className="w-1 hover:w-1.5 hover:bg-zinc-500 active:bg-zinc-300 cursor-col-resize z-20 shrink-0 transition-colors"
        />
      )}

      {/* Right Pane (Secondary Agent PTY in Split View) */}
      {isSplitView && secondaryWs && (
        <div
          onClick={() => rightTermRef.current?.focus()}
          style={{
            flex: `${100 - splitRatio} 1 0%`,
            minWidth: 160,
            backgroundColor: 'var(--app-bg)',
          }}
          className="h-full relative overflow-hidden cursor-text"
        >
          <div ref={rightContainerRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
};
