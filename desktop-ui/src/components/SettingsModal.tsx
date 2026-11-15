import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { X, FolderOpen, Palette, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const THEMES = [
  { id: 'zinc', name: 'Zinc Dark', desc: 'Default Zed & Cursor Charcoal', bg: '#09090b', border: '#27272a' },
  { id: 'oled', name: 'OLED Black', desc: 'Pure Pitch Black (Zero Ambient)', bg: '#000000', border: '#18181b' },
  { id: 'slate', name: 'Slate Navy', desc: 'Deep Blue-Gray Slate', bg: '#0b0f19', border: '#1e293b' },
  { id: 'tokyo', name: 'Tokyo Night', desc: 'Modern Japanese Indigo', bg: '#1a1b26', border: '#2f354a' },
  { id: 'monokai', name: 'Monokai Pro', desc: 'Warm Classic Dark Palette', bg: '#19181a', border: '#2d2a2e' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { theme, setTheme, projects, activeProjectId, pickAndOpenFolder } = useWorkspaceStore();
  const currentProject = activeProjectId ? projects[activeProjectId] : Object.values(projects)[0];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs font-mono select-none">
      <div
        className="w-full max-w-md bg-[#09090b] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="h-10 px-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Preferences & Themes
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5">
          {/* Section: Themes */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
              Color Theme
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {THEMES.map((t) => {
                const isSelected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`w-full px-3 py-2 rounded border flex items-center justify-between transition-colors text-left ${
                      isSelected
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-100'
                        : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full border shrink-0"
                        style={{ backgroundColor: t.bg, borderColor: t.border }}
                      />
                      <div className="truncate">
                        <div className="text-xs font-medium">{t.name}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{t.desc}</div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-zinc-200 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Directory / Workspace */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/60">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
              Working Directory
            </label>
            <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800/80 space-y-2">
              <div className="text-xs text-zinc-300 font-medium truncate">
                {currentProject?.name || 'Local Folder'}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono break-all">
                {currentProject?.rootPath || 'None'}
              </div>
              <button
                onClick={async () => {
                  await pickAndOpenFolder();
                  onClose();
                }}
                className="w-full mt-1 px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white text-xs font-medium transition-colors flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
                <span>Choose Any PC Directory...</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-10 px-4 border-t border-zinc-800/60 bg-zinc-950 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
