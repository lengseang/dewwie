import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DiffFile } from '../../types';
import {
  GitCompare,
  Columns2,
  AlignLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Copy,
  Binary,
  X,
} from 'lucide-react';

function parseGitPatch(patch: string): DiffFile[] {
  if (!patch || !patch.trim()) return [];
  const files: DiffFile[] = [];
  const fileBlocks = patch.split(/^diff --git /m).filter(Boolean);

  for (let idx = 0; idx < fileBlocks.length; idx++) {
    const block = fileBlocks[idx];
    const lines = block.split('\n');
    const headerLine = lines[0] || '';
    const match = headerLine.match(/a\/(.*?)\s+b\/(.*)/);
    const filePath = match ? match[2] : `file-${idx}`;

    let status: DiffFile['status'] = 'modified';
    if (block.includes('new file mode')) status = 'added';
    if (block.includes('deleted file mode')) status = 'deleted';

    const chunks: DiffFile['chunks'] = [];
    let currentChunk: DiffFile['chunks'][0] | null = null;
    let additions = 0;
    let deletions = 0;
    let oldLineNum = 1;
    let newLineNum = 1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('@@')) {
        const chunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (chunkMatch) {
          oldLineNum = parseInt(chunkMatch[1], 10);
          newLineNum = parseInt(chunkMatch[2], 10);
        }
        currentChunk = {
          oldStart: oldLineNum,
          oldLines: 0,
          newStart: newLineNum,
          newLines: 0,
          header: line,
          lines: [],
        };
        chunks.push(currentChunk);
      } else if (currentChunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
          currentChunk.lines.push({
            type: 'add',
            content: line.substring(1),
            newLineNumber: newLineNum++,
          });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
          currentChunk.lines.push({
            type: 'delete',
            content: line.substring(1),
            oldLineNumber: oldLineNum++,
          });
        } else if (line.startsWith(' ')) {
          currentChunk.lines.push({
            type: 'context',
            content: line.substring(1),
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++,
          });
        }
      }
    }

    files.push({
      id: `diff-${idx}-${filePath.replace(/[\/\\]/g, '-')}`,
      path: filePath,
      status,
      additions,
      deletions,
      chunks,
    });
  }

  return files;
}

export const DiffViewer: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { activeWorkspaceId, workspaces, diffs, setWorkspaceDiffs } = useWorkspaceStore();
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;

  useEffect(() => {
    async function fetchDiff() {
      if (typeof window !== 'undefined' && window.swarmherdNative?.getGitDiff && activeWs) {
        try {
          const res = await window.swarmherdNative.getGitDiff({
            worktreePath: activeWs.worktreePath,
            baseBranch: activeWs.baseBranch || 'main',
            sessionMode: activeWs.sessionMode,
          });
          if (res?.rawPatch) {
            const parsed = parseGitPatch(res.rawPatch);
            setWorkspaceDiffs(activeWs.id, parsed);
          } else {
            setWorkspaceDiffs(activeWs.id, []);
          }
        } catch (e) {
          console.error('Failed to load real git diff:', e);
        }
      }
    }
    fetchDiff();
  }, [activeWs?.id, activeWs?.worktreePath, activeWs?.baseBranch, activeWs?.sessionMode, setWorkspaceDiffs]);

  const currentDiffs: DiffFile[] = (activeWorkspaceId && diffs[activeWorkspaceId]) || [];

  const activeFile = selectedFileId
    ? currentDiffs.find((d) => d.id === selectedFileId) || currentDiffs[0]
    : currentDiffs[0];

  const toggleExpand = (fileId: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [fileId]: prev[fileId] === undefined ? false : !prev[fileId],
    }));
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedFile(path);
    setTimeout(() => setCopiedFile(null), 1500);
  };

  const isBinaryFile = (file: DiffFile) => {
    if (file.isBinary) return true;
    const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.wasm', '.bin', '.pdf', '.zip'];
    return binaryExts.some((ext) => file.path.toLowerCase().endsWith(ext));
  };

  const getFileBadge = (status: DiffFile['status']) => {
    switch (status) {
      case 'added':
        return <span className="text-[10px] font-mono text-emerald-400 font-semibold">[A]</span>;
      case 'modified':
        return <span className="text-[10px] font-mono text-zinc-400 font-semibold">[M]</span>;
      case 'deleted':
        return <span className="text-[10px] font-mono text-rose-400 font-semibold">[D]</span>;
    }
  };

  if (!activeWs) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-zinc-600 font-mono text-xs">
        No active worktree selected
      </div>
    );
  }

  return (
    <div
      style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
      className="flex-1 flex flex-col h-full overflow-hidden select-none"
    >
      {/* Top Precision Bar */}
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="h-10 px-3 border-b flex items-center justify-between gap-3 shrink-0"
      >
        {/* Left: Branch comparison or Local changes */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <GitCompare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          {activeWs.sessionMode === 'local' ? (
            <>
              <span className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-[9px]">LOCAL</span>
              <span className="font-semibold text-zinc-200">{activeWs.projectName || activeWs.repository}</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-zinc-200">{activeWs.branch}</span>
              <span className="text-zinc-600">&rarr;</span>
              <span className="text-zinc-400">{activeWs.baseBranch || 'main'}</span>
            </>
          )}
          <span className="text-[10px] text-zinc-500 ml-1">
            ({currentDiffs.length})
          </span>
        </div>

        {/* Right: View Mode Toggle & Close Panel Button */}
        <div className="flex items-center gap-1.5">
          <div
            style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)' }}
            className="flex items-center p-0.5 rounded border"
          >
            <button
              onClick={() => setViewMode('unified')}
              title="Unified line-by-line view"
              style={viewMode === 'unified' ? {
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              } : {
                color: 'var(--app-text-muted)',
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                viewMode === 'unified' ? 'font-medium shadow-xs border' : 'hover:opacity-80'
              }`}
            >
              <AlignLeft className="w-3 h-3" />
              <span>Unified</span>
            </button>

            <button
              onClick={() => setViewMode('split')}
              title="Side-by-side split view"
              style={viewMode === 'split' ? {
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              } : {
                color: 'var(--app-text-muted)',
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                viewMode === 'split' ? 'font-medium shadow-xs border' : 'hover:opacity-80'
              }`}
            >
              <Columns2 className="w-3 h-3" />
              <span>Split</span>
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              title="Close Diff Panel"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Diff Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: File Tree Sidebar */}
        <aside
          style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
          className="w-64 h-full border-r flex flex-col shrink-0"
        >
          <div
            style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
            className="h-8 px-3 border-b flex items-center justify-between text-[11px] font-mono uppercase tracking-wider"
          >
            <span>Files Changed</span>
            <span>{currentDiffs.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {currentDiffs.map((file) => {
              const isSelected = activeFile?.id === file.id;
              const binary = isBinaryFile(file);

              return (
                <div
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  style={isSelected ? { backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)' } : undefined}
                  className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer font-mono text-xs transition-colors ${
                    isSelected
                      ? 'font-medium border'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate min-w-0">
                    {getFileBadge(file.status)}
                    <span className="truncate">{file.path}</span>
                  </div>

                  <div className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                    {binary ? (
                      <span className="text-[10px] text-zinc-400 font-mono">BIN</span>
                    ) : (
                      <>
                        <span className="text-emerald-400">+{file.additions}</span>
                        <span className="text-rose-400">-{file.deletions}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right: Code Diff Inspector */}
        <div
          style={{ backgroundColor: 'var(--app-bg)' }}
          className="flex-1 h-full overflow-y-auto p-3 font-mono text-xs"
        >
          {activeFile ? (
            <div
              style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
              className="border rounded overflow-hidden"
            >
              {/* File Title Bar */}
              <div
                style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)' }}
                className="h-9 px-3 border-b flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleExpand(activeFile.id)}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    {expandedFiles[activeFile.id] === false ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <span className="font-semibold text-zinc-200">{activeFile.path}</span>
                  {getFileBadge(activeFile.status)}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span>+{activeFile.additions}</span>
                  <span>-{activeFile.deletions}</span>
                  <button
                    onClick={() => handleCopyPath(activeFile.path)}
                    title="Copy File Path"
                    className="p-1 hover:text-zinc-200 transition-colors"
                  >
                    {copiedFile === activeFile.path ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Chunk Content */}
              {expandedFiles[activeFile.id] !== false && (
                <div>
                  {isBinaryFile(activeFile) ? (
                    <div className="p-8 text-center text-zinc-500 font-mono text-xs flex flex-col items-center gap-2">
                      <Binary className="w-6 h-6 text-zinc-600" />
                      <span>Binary file difference. Open in external editor to view.</span>
                    </div>
                  ) : activeFile.chunks.length === 0 ? (
                    <div className="p-8 text-center text-zinc-600">No textual changes</div>
                  ) : (
                    activeFile.chunks.map((chunk, cIdx) => (
                      <div key={cIdx} className="border-b border-zinc-900 last:border-0">
                        {/* Chunk header */}
                        <div className="px-3 py-1 bg-zinc-900/30 text-zinc-600 text-[11px]">
                          {chunk.header}
                        </div>

                        {/* Chunk lines */}
                        {viewMode === 'unified' ? (
                          <div className="divide-y divide-zinc-900/50">
                            {chunk.lines.map((line, lIdx) => (
                              <div
                                key={lIdx}
                                className={`flex items-start text-xs leading-5 hover:bg-zinc-900/40 ${
                                  line.type === 'add'
                                    ? 'bg-emerald-500/8 text-emerald-300'
                                    : line.type === 'delete'
                                    ? 'bg-rose-500/8 text-rose-300'
                                    : 'text-zinc-300'
                                }`}
                              >
                                <span className="w-10 px-2 text-right text-zinc-600 select-none text-[11px]">
                                  {line.oldLineNumber || ''}
                                </span>
                                <span className="w-10 px-2 text-right text-zinc-600 select-none text-[11px] border-r border-zinc-800/60">
                                  {line.newLineNumber || ''}
                                </span>
                                <span className="w-5 text-center select-none text-zinc-500">
                                  {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                                </span>
                                <span className="flex-1 px-2 whitespace-pre overflow-x-auto">
                                  {line.content}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* Split Mode */
                          <div className="divide-y divide-zinc-900/50">
                            {chunk.lines.map((line, lIdx) => (
                              <div key={lIdx} className="grid grid-cols-2 text-xs leading-5">
                                {/* Left: Old */}
                                <div
                                  className={`flex items-start border-r border-zinc-800/80 ${
                                    line.type === 'delete'
                                      ? 'bg-rose-500/8 text-rose-300'
                                      : 'text-zinc-300'
                                  }`}
                                >
                                  <span className="w-10 px-2 text-right text-zinc-600 select-none text-[11px]">
                                    {line.oldLineNumber || ''}
                                  </span>
                                  <span className="w-4 text-center select-none text-zinc-500">
                                    {line.type === 'delete' ? '-' : ' '}
                                  </span>
                                  <span className="flex-1 px-2 whitespace-pre overflow-x-auto">
                                    {line.type === 'delete' || line.type === 'context'
                                      ? line.content
                                      : ''}
                                  </span>
                                </div>

                                {/* Right: New */}
                                <div
                                  className={`flex items-start ${
                                    line.type === 'add'
                                      ? 'bg-emerald-500/8 text-emerald-300'
                                      : 'text-zinc-300'
                                  }`}
                                >
                                  <span className="w-10 px-2 text-right text-zinc-600 select-none text-[11px]">
                                    {line.newLineNumber || ''}
                                  </span>
                                  <span className="w-4 text-center select-none text-zinc-500">
                                    {line.type === 'add' ? '+' : ' '}
                                  </span>
                                  <span className="flex-1 px-2 whitespace-pre overflow-x-auto">
                                    {line.type === 'add' || line.type === 'context'
                                      ? line.content
                                      : ''}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-600">Select a file to inspect diff</div>
          )}
        </div>
      </div>
    </div>
  );
};
