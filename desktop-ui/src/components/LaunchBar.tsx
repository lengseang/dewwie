import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { ExternalEditor } from '../types';
import {
  Code2,
  Zap,
  Terminal,
  Copy,
  Check,
  FolderOpen,
} from 'lucide-react';

interface LaunchBarProps {
  className?: string;
}

export const LaunchBar: React.FC<LaunchBarProps> = ({ className = '' }) => {
  const { activeWorkspaceId, workspaces, launchEditor } = useWorkspaceStore();
  const [activeEditorLaunching, setActiveEditorLaunching] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;
  const targetPath = activeWs ? activeWs.worktreePath : 'D:\\1111-Works\\exbytelab';

  const handleLaunch = async (editor: ExternalEditor) => {
    setActiveEditorLaunching(editor);
    try {
      await launchEditor(editor, activeWorkspaceId || undefined);
    } finally {
      setTimeout(() => {
        setActiveEditorLaunching(null);
      }, 1200);
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(targetPath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  return (
    <div
      className={`px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 select-none text-xs font-mono ${className}`}
    >
      {/* Left: Active Directory Path info */}
      <div className="flex items-center gap-2 min-w-0">
        <FolderOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className="text-zinc-500 hidden sm:inline">Path:</span>
        <span
          className="text-zinc-300 truncate max-w-[280px] md:max-w-md bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800/80 cursor-pointer hover:border-zinc-700 transition-colors"
          onClick={handleCopyPath}
          title="Click to copy full path"
        >
          {targetPath}
        </span>
        <button
          onClick={handleCopyPath}
          title="Copy path"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {copiedPath ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Right: External Editor buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-zinc-500 text-[11px] mr-1 hidden md:inline">
          Open in IDE (Ctrl+O):
        </span>

        {/* Cursor button */}
        <button
          onClick={() => handleLaunch('cursor')}
          disabled={!!activeEditorLaunching}
          title="Open worktree directory in Cursor IDE"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] border border-zinc-700/80 text-zinc-200 hover:text-white transition-all shadow-xs"
        >
          <Code2 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-medium">
            {activeEditorLaunching === 'cursor' ? 'Opening...' : 'Cursor'}
          </span>
        </button>

        {/* Zed button */}
        <button
          onClick={() => handleLaunch('zed')}
          disabled={!!activeEditorLaunching}
          title="Open worktree directory in Zed Editor"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] border border-zinc-700/80 text-zinc-200 hover:text-white transition-all shadow-xs"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-medium">
            {activeEditorLaunching === 'zed' ? 'Opening...' : 'Zed'}
          </span>
        </button>

        {/* VS Code button */}
        <button
          onClick={() => handleLaunch('vscode')}
          disabled={!!activeEditorLaunching}
          title="Open worktree directory in VS Code"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] border border-zinc-700/80 text-zinc-200 hover:text-white transition-all shadow-xs"
        >
          <Terminal className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-medium">
            {activeEditorLaunching === 'vscode' ? 'Opening...' : 'VS Code'}
          </span>
        </button>
      </div>
    </div>
  );
};
