import React, { useState, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { THEMES_CONFIG } from '../theme/themes';
import { Terminal, FolderOpen, Settings, Palette, Columns2, Trash2, X, Play } from 'lucide-react';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

interface CommandItem {
  id: string;
  prefix: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'core' | 'session' | 'theme' | 'navigation';
  action: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
}) => {
  const {
    projects,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    createSession,
    toggleSplitView,
    setTheme,
    setRightPanelView,
    pickAndOpenFolder,
    deleteWorkspace,
    renameWorkspace,
  } = useWorkspaceStore();

  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInput('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Build command list
  const commands: CommandItem[] = [
    {
      id: 'cmd-new-terminal',
      prefix: ':new',
      title: ':new, :term',
      description: 'Spawn a new local terminal shell session',
      icon: <Terminal className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'core',
      action: async () => {
        const proj = Object.values(projects)[0];
        await createSession({
          projectId: proj?.id,
          name: `Terminal ${Object.keys(workspaces).length + 1}`,
          sessionMode: 'local',
          agentType: 'terminal',
        });
        onClose();
      },
    },
    {
      id: 'cmd-open-dir',
      prefix: ':dir',
      title: ':dir, :open',
      description: 'Open a project directory from local disk',
      icon: <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'core',
      action: () => {
        pickAndOpenFolder();
        onClose();
      },
    },
    {
      id: 'cmd-split-view',
      prefix: ':split',
      title: ':split',
      description: 'Toggle dual terminal split view side-by-side',
      icon: <Columns2 className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'session',
      action: () => {
        toggleSplitView();
        onClose();
      },
    },
    {
      id: 'cmd-settings',
      prefix: ':settings',
      title: ':settings, :config',
      description: 'Open preferences and theme settings',
      icon: <Settings className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'core',
      action: () => {
        onClose();
        onOpenSettings();
      },
    },
    // Generated from the theme registry (previously 7 hand-written entries, 2 pointing at non-existent ids).
    ...Object.values(THEMES_CONFIG).map((t): CommandItem => ({
      id: `cmd-theme-${t.id}`,
      prefix: `:theme ${t.id}`,
      title: `:theme ${t.id}`,
      description: `Switch IDE to ${t.name}`,
      icon: <Palette className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'theme',
      action: () => {
        setTheme(t.id);
        onClose();
      },
    })),
    {
      id: 'cmd-view-room',
      prefix: ':room',
      title: ':room',
      description: 'Open Inter-Agent Communication Room in panel',
      icon: <Terminal className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'navigation',
      action: () => {
        setRightPanelView('room');
        onClose();
      },
    },
    {
      id: 'cmd-view-files',
      prefix: ':files',
      title: ':files',
      description: 'Open Workspace File Tree in right inspector',
      icon: <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'navigation',
      action: () => {
        setRightPanelView('files');
        onClose();
      },
    },
    {
      id: 'cmd-view-diff',
      prefix: ':diff',
      title: ':diff',
      description: 'Open Git Diff & Merge Gate inspector',
      icon: <Terminal className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'navigation',
      action: () => {
        setRightPanelView('changes');
        onClose();
      },
    },
    {
      id: 'cmd-clear',
      prefix: ':clear',
      title: ':clear',
      description: 'Clear the active terminal viewport output buffer',
      icon: <Trash2 className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'session',
      action: () => {
        window.dispatchEvent(new CustomEvent('dewwie:terminal-action', { detail: { action: 'clear' } }));
        onClose();
      },
    },
    {
      id: 'cmd-rename',
      prefix: ':rename',
      title: ':rename <name>',
      description: 'Rename active terminal workspace tab (e.g. :rename Server)',
      icon: <Terminal className="w-3.5 h-3.5 text-zinc-300" />,
      category: 'session',
      action: async () => {
        const parts = input.trim().split(/\s+/);
        const newName = parts.slice(1).join(' ');
        if (activeWorkspaceId && newName) {
          await renameWorkspace(activeWorkspaceId, newName);
        }
        onClose();
      },
    },
    {
      id: 'cmd-kill',
      prefix: ':kill',
      title: ':kill',
      description: 'Close active terminal shell session',
      icon: <X className="w-3.5 h-3.5 text-rose-400" />,
      category: 'session',
      action: () => {
        if (activeWorkspaceId && !activeWorkspaceId.startsWith('ws-local-proj-')) {
          deleteWorkspace(activeWorkspaceId);
        }
        onClose();
      },
    },
  ];

  // Also include jump-to-session entries
  const sessionEntries: CommandItem[] = Object.values(workspaces).map((ws, i) => ({
    id: `jump-${ws.id}`,
    prefix: `@${i + 1}`,
    title: `@${i + 1} ${ws.name}`,
    description: `Jump to session ${i + 1} (${ws.agentType || 'shell'}${ws.branch ? ` • ${ws.branch}` : ''})`,
    icon: <Play className="w-3.5 h-3.5 text-zinc-400" />,
    category: 'navigation',
    action: () => {
      setActiveWorkspace(ws.id);
      onClose();
    },
  }));

  const allItems = [...commands, ...sessionEntries];

  // Filter items based on input
  const query = input.trim().toLowerCase();
  const filtered = query
    ? allItems.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.prefix.toLowerCase().includes(query)
      )
    : allItems;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-start justify-center pt-20 px-4 font-mono select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
        className="w-full max-w-xl border rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Terminal Command Input Prompt */}
        <div
          style={{ backgroundColor: 'var(--app-nav-bg)', borderColor: 'var(--app-border)' }}
          className="h-10 px-3 border-b flex items-center gap-2"
        >
          <span className="text-xs font-bold font-mono" style={{ color: 'var(--app-accent)' }}>❯</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search command (:term, :split, :theme, :dir, :settings, @1)..."
            style={{ color: 'var(--app-text)' }}
            className="flex-1 bg-transparent border-none text-xs focus:outline-none font-mono"
          />
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
            <kbd className="px-1 py-0.5 rounded border text-[9px] font-mono" style={{ backgroundColor: 'var(--app-surface-elevated)', borderColor: 'var(--app-border)' }}>ESC</kbd>
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs font-mono" style={{ color: 'var(--app-text-muted)' }}>
              No commands found for "{input}"
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    backgroundColor: isSelected ? 'var(--app-surface-elevated)' : 'transparent',
                    color: isSelected ? 'var(--app-text)' : 'var(--app-text-muted)',
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-xs font-mono transition-colors ${
                    isSelected ? 'font-medium' : 'hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{item.icon}</span>
                    <span className="font-semibold" style={{ color: 'var(--app-text)' }}>{item.title}</span>
                    <span className="text-[11px] truncate hidden sm:inline" style={{ color: 'var(--app-text-muted)' }}>
                      — {item.description}
                    </span>
                  </div>
                  <span className="text-[9px] shrink-0 uppercase tracking-wider opacity-60">
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Status Bar Footer */}
        <div
          style={{ backgroundColor: 'var(--app-nav-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
          className="h-7 px-3 border-t flex items-center justify-between text-[10px] font-mono"
        >
          <div className="flex items-center gap-3">
            <span><kbd className="font-semibold">↑↓</kbd> navigate</span>
            <span><kbd className="font-semibold">↵</kbd> run</span>
          </div>
          <span>Commands</span>
        </div>
      </div>
    </div>
  );
};
