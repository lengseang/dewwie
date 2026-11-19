import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  GitMerge,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

export const MergeBar: React.FC = () => {
  const {
    activeWorkspaceId,
    workspaces,
    mergeWorktree,
    rebaseWorktree,
    discardWorktree,
    setMode,
  } = useWorkspaceStore();

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;

  const [commitMessage, setCommitMessage] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [isRebasing, setIsRebasing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (activeWs) {
      const currentBranch = activeWs.branch || 'main';
      const branchName = currentBranch.replace(/^(feature|fix|refactor|chore)\//, '');
      const prefix = currentBranch.startsWith('fix')
        ? 'fix'
        : currentBranch.startsWith('refactor')
        ? 'refactor'
        : 'feat';

      setCommitMessage(`${prefix}: implement ${branchName.replace(/-/g, ' ')}`);
      setStatusFeedback(null);
      setConfirmDiscard(false);
    }
  }, [activeWs?.id, activeWs?.branch]);

  if (!activeWs) return null;

  const handleMerge = async () => {
    if (!commitMessage.trim()) return;
    setIsMerging(true);
    setStatusFeedback(null);
    try {
      const res = await mergeWorktree(activeWs.id, commitMessage.trim());
      if (res.success) {
        setStatusFeedback({ type: 'success', message: res.message });
        setTimeout(() => setMode('build'), 1200);
      } else {
        setStatusFeedback({ type: 'error', message: res.message });
      }
    } finally {
      setIsMerging(false);
    }
  };

  const handleRebase = async () => {
    setIsRebasing(true);
    setStatusFeedback(null);
    try {
      const res = await rebaseWorktree(activeWs.id);
      if (res.success) {
        setStatusFeedback({ type: 'info', message: res.message });
      } else {
        setStatusFeedback({ type: 'error', message: res.message });
      }
    } finally {
      setIsRebasing(false);
    }
  };

  const handleDiscard = async () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    setIsDiscarding(true);
    try {
      await discardWorktree(activeWs.id);
      setMode('build');
    } finally {
      setIsDiscarding(false);
      setConfirmDiscard(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--app-surface)',
        borderColor: 'var(--app-border)',
        color: 'var(--app-text)',
      }}
      className="h-12 px-3 border-t flex items-center justify-between gap-3 shrink-0 font-mono text-xs select-none"
    >
      {/* Left: Commit message input */}
      <div className="flex-1 flex items-center gap-2 max-w-2xl">
        <GitMerge className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <input
          type="text"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          style={{
            backgroundColor: 'var(--app-bg)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text)',
          }}
          className="flex-1 px-2.5 py-1.5 border rounded text-xs placeholder-zinc-500 focus:outline-none transition-colors"
        />
      </div>

      {/* Center: Feedback badge */}
      {statusFeedback && (
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] truncate">
          {statusFeedback.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          )}
          <span
            className={
              statusFeedback.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
            }
          >
            {statusFeedback.message}
          </span>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleDiscard}
          disabled={isDiscarding}
          className={`px-2.5 py-1.5 rounded text-xs transition-colors ${
            confirmDiscard
              ? 'bg-rose-950 text-rose-300 border border-rose-800'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {confirmDiscard ? 'Confirm Discard' : 'Discard'}
        </button>

        <button
          onClick={handleRebase}
          disabled={isRebasing}
          style={{
            backgroundColor: 'var(--app-surface-elevated)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text)',
          }}
          className="px-2.5 py-1.5 rounded border text-xs transition-colors active:scale-[0.98] hover:opacity-90"
        >
          {isRebasing ? 'Rebasing...' : 'Rebase'}
        </button>

        <button
          onClick={handleMerge}
          disabled={isMerging || !commitMessage.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isMerging ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Merging...</span>
            </>
          ) : (
            <span>Merge to {activeWs.baseBranch || 'main'}</span>
          )}
        </button>
      </div>
    </div>
  );
};
