import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  Play,
  Trash2,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  AlertTriangle,
} from 'lucide-react';

export const TerminalPane: React.FC = () => {
  const {
    activeWorkspaceId,
    workspaces,
    terminalScrollbacks,
    appendTerminalChunk,
    clearTerminal,
    parseAndDispatchOsc,
    startAgentSimulation,
  } = useWorkspaceStore();

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastHydratedWorkspaceRef = useRef<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(13);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;

  // Initialize or re-attach xterm instance
  const setupTerminal = useCallback(() => {
    if (!terminalContainerRef.current) return;

    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose();
      terminalInstanceRef.current = null;
    }

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize,
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
      smoothScrollDuration: 100,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.parser.registerOscHandler(7501, (data) => {
      if (activeWorkspaceId) {
        parseAndDispatchOsc(activeWorkspaceId, `\x1b]7501;${data}\x07`);
      }
      return true;
    });

    term.open(terminalContainerRef.current);
    fitAddon.fit();

    terminalInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      term.write(data);
      if (activeWorkspaceId) {
        appendTerminalChunk(activeWorkspaceId, data);
      }
    });

    // Replay initial scrollback
    if (activeWorkspaceId) {
      const scrollback = terminalScrollbacks[activeWorkspaceId] || '';
      if (scrollback) {
        term.write(scrollback);
        lastHydratedWorkspaceRef.current = activeWorkspaceId;
      }
    }
  }, [fontSize, activeWorkspaceId, appendTerminalChunk, parseAndDispatchOsc, terminalScrollbacks]);

  useEffect(() => {
    setupTerminal();

    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // ignore transient resize bounds
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
        terminalInstanceRef.current = null;
      }
    };
  }, [setupTerminal]);

  // Workspace switch scrollback hydration
  useEffect(() => {
    if (!terminalInstanceRef.current || !activeWorkspaceId) return;

    if (lastHydratedWorkspaceRef.current !== activeWorkspaceId) {
      terminalInstanceRef.current.reset();
      const scrollback = terminalScrollbacks[activeWorkspaceId] || '';
      if (scrollback) {
        terminalInstanceRef.current.write(scrollback);
      }
      lastHydratedWorkspaceRef.current = activeWorkspaceId;
    }
  }, [activeWorkspaceId, terminalScrollbacks]);

  const handleCopyLogs = () => {
    if (!activeWorkspaceId) return;
    const text = terminalScrollbacks[activeWorkspaceId] || '';
    // Strip ANSI sequences for clean clipboard
    const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\]7501;[^\x07]*\x07/g, '');
    navigator.clipboard.writeText(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClear = () => {
    if (activeWorkspaceId && terminalInstanceRef.current) {
      clearTerminal(activeWorkspaceId);
      terminalInstanceRef.current.reset();
      terminalInstanceRef.current.writeln('\x1b[2m[Terminal buffer cleared]\x1b[0m\r\n');
    }
  };

  if (!activeWs) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-zinc-950 text-zinc-600 font-mono text-xs">
        <span>No active workspace selected. Select or create a worktree.</span>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50' : 'relative'
      }`}
    >
      {/* Precision Terminal Header */}
      <div className="h-10 px-3 border-b border-zinc-800/80 bg-zinc-950 flex items-center justify-between gap-3 shrink-0">
        {/* Left: Terminal Session Info */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
            {activeWs.branch}
          </span>
          <span className="text-zinc-600 text-xs font-mono">/</span>
          <span className="text-[11px] font-mono text-zinc-500 truncate hidden sm:inline">
            {activeWs.worktreePath}
          </span>
        </div>

        {/* Right: Clean Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Simulation controls */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-zinc-800">
            <button
              onClick={() => startAgentSimulation(activeWs.id, 'standard')}
              title="Simulate Autonomous Agent Steps (OSC 7501 Stream)"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
            >
              <Play className="w-2.5 h-2.5 text-zinc-400" />
              <span>Simulate</span>
            </button>

            <button
              onClick={() => startAgentSimulation(activeWs.id, 'fail')}
              title="Simulate Agent Error Event"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-500 hover:text-amber-400 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>Fail</span>
            </button>
          </div>

          {/* Copy Logs */}
          <button
            onClick={handleCopyLogs}
            title="Copy Clean Terminal Logs"
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            title="Clear Terminal Buffer"
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Font size */}
          <button
            onClick={() => setFontSize((s) => (s >= 16 ? 12 : s + 1))}
            title={`Font size (${fontSize}px)`}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            {fontSize}px
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Terminal Canvas */}
      <div
        ref={terminalContainerRef}
        className="flex-1 w-full h-full bg-[#09090b] overflow-hidden"
      />
    </div>
  );
};
