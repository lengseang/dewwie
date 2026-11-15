import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { Sparkles, Bot, GitBranch, FolderGit2, X, Terminal, ArrowRight } from 'lucide-react';

interface DelegateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DelegateTaskModal: React.FC<DelegateTaskModalProps> = ({ isOpen, onClose }) => {
  const { delegateTask, activeProjectId, projects } = useWorkspaceStore();
  const currentProject = activeProjectId ? projects[activeProjectId] : null;

  const [task, setTask] = useState('');
  const [agent, setAgent] = useState('dewwie-worker');
  const [repo, setRepo] = useState(currentProject?.name === 'Dewwie' ? 'Dewwie' : 'exbytelab');
  const [baseBranch, setBaseBranch] = useState('main');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs font-mono select-none">
      <div
        className="w-full max-w-lg bg-[#09090b] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="h-11 px-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
              Autonomous Lead Delegation
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Herdr Engine
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Goal Prompt Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-300 flex items-center justify-between">
              <span>Agent Goal / Instructions</span>
              <span className="text-[10px] text-zinc-500">Ctrl+Enter to run</span>
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
              placeholder="e.g. Implement resilient retry loop with exponential backoff for database queries and add unit test"
              rows={3}
              autoFocus
              className="w-full px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 resize-none font-mono"
            />
          </div>

          {/* Settings Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Agent Template */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 flex items-center gap-1">
                <Bot className="w-3 h-3 text-zinc-500" />
                <span>Agent Template</span>
              </label>
              <select
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              >
                <option value="dewwie-worker">dewwie-worker (Autonomous Executor)</option>
                <option value="dewwie-lead">dewwie-lead (Task Decomposer)</option>
                <option value="dewwie-reviewer">dewwie-reviewer (Adversarial Quality)</option>
              </select>
            </div>

            {/* Target Repository */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 flex items-center gap-1">
                <FolderGit2 className="w-3 h-3 text-zinc-500" />
                <span>Target Repository</span>
              </label>
              <select
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              >
                <option value="exbytelab">exbytelab (D:\1111-Works\exbytelab)</option>
                <option value="Dewwie">Dewwie (D:\1111-Works\Dewwie)</option>
              </select>
            </div>
          </div>

          {/* Auto-Isolation Summary Preview */}
          <div className="p-2.5 bg-zinc-950 rounded border border-zinc-900 text-[11px] space-y-1 text-zinc-400">
            <div className="flex items-center justify-between text-zinc-500 text-[10px]">
              <span>ISOLATION PLAN</span>
              <span className="text-emerald-400/80">Herdr Core Managed</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-300">
              <GitBranch className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="text-zinc-500">Branch:</span>
              <span className="font-mono text-zinc-200 truncate">{previewBranch}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Terminal className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="text-zinc-500">Worktree:</span>
              <span className="font-mono text-zinc-400 truncate">.worktrees/{computedSlug}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !task.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  <span>Provisioning Worktree...</span>
                </>
              ) : (
                <>
                  <span>Delegate to Herdr Agent</span>
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
