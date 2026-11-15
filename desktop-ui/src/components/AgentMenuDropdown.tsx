import React, { useEffect, useRef } from 'react';
import {
  TerminalAgentIcon,
  ClaudeAgentIcon,
  CodexAgentIcon,
  GeminiAgentIcon,
  AntigravityAgentIcon,
  HermesAgentIcon,
} from './AgentIcons';
import { Plus, GitFork, FolderOpen } from 'lucide-react';

interface AgentMenuDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent: (agentType: string, isWorktree?: boolean) => void;
  onNewSpace: () => void;
  onOpenDirectory: () => void;
  isGitRepo?: boolean;
}

export const AgentMenuDropdown: React.FC<AgentMenuDropdownProps> = ({
  isOpen,
  onClose,
  onSelectAgent,
  onNewSpace,
  onOpenDirectory,
  isGitRepo = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '1') { onSelectAgent('claude-code'); onClose(); }
      if (e.key === '2') { onSelectAgent('codex'); onClose(); }
      if (e.key === '3') { onSelectAgent('gemini'); onClose(); }
      if (e.key === '4') { onSelectAgent('antigravity'); onClose(); }
      if (e.key === '5') { onSelectAgent('hermes'); onClose(); }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, onSelectAgent]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute top-9 left-2 z-50 w-64 bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl py-1 text-xs font-mono select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 1. Terminal Default */}
      <button
        onClick={() => {
          onSelectAgent('terminal');
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-200 hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <TerminalAgentIcon className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-medium">Terminal</span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">Ctrl+Shift+T</span>
      </button>

      {/* 2. Section Header: Start an Agent */}
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase font-semibold text-zinc-600 tracking-wider">
        Start an agent
      </div>

      {/* Supported Agentic AIs */}
      <button
        onClick={() => {
          onSelectAgent('claude-code');
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-200 hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ClaudeAgentIcon className="w-3.5 h-3.5" />
          <span>Claude Code</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">1</span>
      </button>

      <button
        onClick={() => {
          onSelectAgent('codex');
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-200 hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <CodexAgentIcon className="w-3.5 h-3.5" />
          <span>Codex</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">2</span>
      </button>

      <button
        onClick={() => {
          onSelectAgent('gemini');
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-200 hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <GeminiAgentIcon className="w-3.5 h-3.5 text-zinc-300" />
          <span>Gemini</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">3</span>
      </button>

      <button
        onClick={() => {
          onSelectAgent('antigravity');
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-200 hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <AntigravityAgentIcon className="w-3.5 h-3.5" />
          <span>Antigravity</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">4</span>
      </button>

      <button
        onClick={() => {
          onSelectAgent('hermes');
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-200 hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <HermesAgentIcon className="w-3.5 h-3.5" />
          <span>Hermes</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">5</span>
      </button>

      {/* Disabled / Planned agents */}
      <div className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-600 opacity-60 cursor-not-allowed">
        <div className="flex items-center gap-2.5">
          <span className="w-3.5 h-3.5 inline-flex items-center justify-center font-bold text-[10px]">π</span>
          <span>Pi</span>
        </div>
        <span className="text-[9px]">not installed</span>
      </div>

      <div className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-600 opacity-60 cursor-not-allowed">
        <div className="flex items-center gap-2.5">
          <span className="w-3.5 h-3.5 inline-flex items-center justify-center font-bold text-[10px]">□</span>
          <span>OpenCode</span>
        </div>
        <span className="text-[9px]">not installed</span>
      </div>

      {/* Divider */}
      <div className="my-1 border-t border-zinc-800/80" />

      {/* 3. Space & Directory Controls */}
      <button
        onClick={() => {
          onOpenDirectory();
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
          <span>Open Directory...</span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">Ctrl+O</span>
      </button>

      <button
        onClick={() => {
          onNewSpace();
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Plus className="w-3.5 h-3.5 text-zinc-400" />
          <span>New space</span>
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">Ctrl+Shift+N</span>
      </button>

      {/* Only if git repo is detected */}
      {isGitRepo && (
        <>
          <button
            onClick={() => {
              onSelectAgent('claude-code', true);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
          >
            <GitFork className="w-3.5 h-3.5 text-zinc-400" />
            <span>New worktree...</span>
          </button>
        </>
      )}
    </div>
  );
};
