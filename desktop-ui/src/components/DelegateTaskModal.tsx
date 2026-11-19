import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { isLightTheme } from '../theme/themes';
import { Plus, Bot, GitBranch, FolderGit2, X, ArrowRight } from 'lucide-react';

interface DelegateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DelegateTaskModal: React.FC<DelegateTaskModalProps> = ({ isOpen, onClose }) => {
  const { delegateTask, activeProjectId, projects, theme } = useWorkspaceStore();
  const currentProject = activeProjectId ? projects[activeProjectId] : null;

  const [task, setTask] = useState('');
  const [agent, setAgent] = useState('dewwie-worker');
  const [repo, setRepo] = useState(currentProject?.name === 'Dewwie' ? 'Dewwie' : 'exbytelab');
  const baseBranch = 'main';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setRepo(currentProject?.name === 'Dewwie' ? 'Dewwie' : 'exbytelab');
    }
  }, [isOpen, currentProject]);

  if (!isOpen) return null;

  const computedSlug = task.trim()
    ? task.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 24)
    : 'autonomous-task';
  const previewBranch = `feat/${computedSlug}-xxxx`;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!task.trim()) {
      setError('Please specify a task or goal for the agent.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const sessionId = await delegateTask({
        task: task.trim(),
        agent,
        repo,
        baseBranch,
      });
      if (sessionId) {
        onClose();
        setTask('');
      } else {
        setError('Failed to delegate task. Check Herdr Core daemon status.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected delegation error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs font-mono select-none">
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
        className="w-full max-w-lg border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div
          style={{ backgroundColor: 'var(--app-nav-bg)', borderColor: 'var(--app-border)' }}
          className="h-9 px-3 border-b flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" style={{ color: 'var(--app-text-muted)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text)' }}>
              Delegate Task
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors hover:opacity-80"
            style={{ color: 'var(--app-text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-3.5 space-y-3">
          {error && (
            <div className="px-2.5 py-1.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {/* Goal Prompt Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--app-text-muted)' }}>
              <span>Task Instructions</span>
              <span className="text-[9px]">Ctrl+Enter to run</span>
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="e.g. Implement resilient retry loop with exponential backoff"
              rows={3}
              autoFocus
              style={{
                backgroundColor: 'var(--app-surface-elevated)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              }}
              className="w-full px-2.5 py-1.5 border rounded text-xs focus:outline-none resize-none font-mono"
            />
          </div>

          {/* Settings Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Agent Template */}
            <div className="space-y-1">
              <label className="text-[10px] flex items-center gap-1" style={{ color: 'var(--app-text-muted)' }}>
                <Bot className="w-3 h-3" />
                <span>Agent</span>
              </label>
              <select
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                style={{
                  backgroundColor: 'var(--app-surface-elevated)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                }}
                className="w-full px-2 py-1 border rounded text-xs focus:outline-none"
              >
                <option value="dewwie-worker">Worker (Executor)</option>
                <option value="dewwie-lead">Lead (Planner)</option>
                <option value="dewwie-reviewer">Reviewer (QA)</option>
              </select>
            </div>

            {/* Target Repository */}
            <div className="space-y-1">
              <label className="text-[10px] flex items-center gap-1" style={{ color: 'var(--app-text-muted)' }}>
                <FolderGit2 className="w-3 h-3" />
                <span>Repository</span>
              </label>
              <select
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                style={{
                  backgroundColor: 'var(--app-surface-elevated)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                }}
                className="w-full px-2 py-1 border rounded text-xs focus:outline-none"
              >
                <option value="exbytelab">exbytelab</option>
                <option value="Dewwie">Dewwie</option>
              </select>
            </div>
          </div>

          {/* Auto-Isolation Summary Preview */}
          <div
            style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)' }}
            className="p-2 rounded border text-[11px] space-y-1"
          >
            <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
              <span>WORKTREE PLAN</span>
              <span className="font-mono">Isolated</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
              <GitBranch className="w-3 h-3 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
              <span style={{ color: 'var(--app-text-muted)' }}>Branch:</span>
              <span className="font-mono truncate">{previewBranch}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1 rounded text-xs transition-colors hover:opacity-80"
              style={{ color: 'var(--app-text-muted)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !task.trim()}
              style={{
                backgroundColor: 'var(--app-accent)',
                color: isLightTheme(theme) ? '#ffffff' : '#000000',
              }}
              className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Provisioning...</span>
                </>
              ) : (
                <>
                  <span>Run Agent</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
