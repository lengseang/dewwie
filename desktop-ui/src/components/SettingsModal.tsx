import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { X, FolderOpen, Palette, Check, Save, Zap, Radio } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const THEMES = [
  { id: 'zinc', name: 'Zinc Dark', desc: 'Default Linear & Cursor Charcoal', bg: '#09090b', border: '#27272a' },
  { id: 'oled', name: 'OLED Black', desc: 'Pure Pitch Black (Zero Ambient Glow)', bg: '#000000', border: '#18181b' },
  { id: 'slate', name: 'Slate Navy', desc: 'Deep Blue-Gray Slate & VSCode Dark Pro', bg: '#0b0f19', border: '#1e293b' },
  { id: 'catppuccin', name: 'Catppuccin Macchiato', desc: 'Warm Espresso & Soft Pastel Accents', bg: '#181926', border: '#363a4f' },
  { id: 'transparent', name: 'Frosted Glass (Transparent)', desc: 'Lightweight Acrylic Glassmorphism', bg: 'rgba(20, 24, 34, 0.72)', border: 'rgba(255, 255, 255, 0.15)' },
  { id: 'nord', name: 'Nordic Arctic', desc: 'Subtle Frost Polar Night & Ice Blue', bg: '#242933', border: '#434c5e' },
  { id: 'tokyo', name: 'Tokyo Night', desc: 'Modern Japanese Indigo & Purple Glow', bg: '#1a1b26', border: '#2f354a' },
  { id: 'monokai', name: 'Monokai Pro', desc: 'Warm Classic Dark & Vintage Highlights', bg: '#19181a', border: '#2d2a2e' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    theme,
    setTheme,
    projects,
    activeProjectId,
    pickAndOpenFolder,
    restoreSessionsOnStartup,
    setRestoreSessionsOnStartup,
    restoreScrollback,
    setRestoreScrollback,
    persistActiveMesh,
    setPersistActiveMesh,
    ecoModeFps,
    setEcoModeFps,
  } = useWorkspaceStore();

  const currentProject = activeProjectId ? projects[activeProjectId] : Object.values(projects)[0];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs font-mono select-none">
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="w-full max-w-lg max-h-[85vh] border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div
          style={{ backgroundColor: 'var(--app-nav-bg)', borderColor: 'var(--app-border)' }}
          className="h-10 px-4 border-b flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <Palette className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Preferences & Configuration
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
        <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(85vh-80px)] no-scrollbar">
          {/* Section: Themes */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
              Color Theme ({THEMES.length} Presets)
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {THEMES.map((t) => {
                const isSelected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`w-full px-2.5 py-2 rounded border flex items-center justify-between transition-colors text-left ${
                      isSelected
                        ? 'bg-zinc-900 border-zinc-600 text-zinc-100 shadow-xs'
                        : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full border shrink-0"
                        style={{ backgroundColor: t.bg, borderColor: t.border }}
                      />
                      <div className="truncate">
                        <div className="text-[11px] font-medium truncate">{t.name}</div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-3 h-3 text-zinc-200 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: CLI & AI Agent Session Management (Always Rememberable) */}
          <div className="space-y-3 pt-3 border-t border-zinc-800/60">
            <div className="flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5 text-zinc-400" />
              <label className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">
                Session Persistence & Memory
              </label>
            </div>

            <div className="space-y-2 bg-zinc-950/60 p-3 rounded border border-zinc-800/80 text-xs">
              {/* Toggle 1: Restore Sessions on Startup */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-zinc-200 font-medium">Restore CLI & AI Agent Sessions</div>
                  <div className="text-[10px] text-zinc-500">
                    Always remember terminal tabs and active AI agents across app restarts
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRestoreSessionsOnStartup(!restoreSessionsOnStartup)}
                  className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                    restoreSessionsOnStartup ? 'bg-zinc-200 justify-end' : 'bg-zinc-800 justify-start'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full transition-transform ${
                      restoreSessionsOnStartup ? 'bg-zinc-950' : 'bg-zinc-400'
                    }`}
                  />
                </button>
              </div>

              <div className="h-px bg-zinc-800/60 my-1" />

              {/* Toggle 2: Restore Terminal Scrollback */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-zinc-200 font-medium">Restore Terminal Scrollback</div>
                  <div className="text-[10px] text-zinc-500">
                    Hydrate full command history and outputs upon re-attaching
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRestoreScrollback(!restoreScrollback)}
                  className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                    restoreScrollback ? 'bg-zinc-200 justify-end' : 'bg-zinc-800 justify-start'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full transition-transform ${
                      restoreScrollback ? 'bg-zinc-950' : 'bg-zinc-400'
                    }`}
                  />
                </button>
              </div>

              <div className="h-px bg-zinc-800/60 my-1" />

              {/* Toggle 3: Persist Multi-Agent Mesh Rooms */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-zinc-200 font-medium">Persist Multi-Agent Mesh Rooms</div>
                  <div className="text-[10px] text-zinc-500">
                    Keep room assignments, lead architect bindings, and mesh topologies
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPersistActiveMesh(!persistActiveMesh)}
                  className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                    persistActiveMesh ? 'bg-zinc-200 justify-end' : 'bg-zinc-800 justify-start'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full transition-transform ${
                      persistActiveMesh ? 'bg-zinc-950' : 'bg-zinc-400'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Section: Orbital Foundry Performance & Eco Mode */}
          <div className="space-y-2 pt-3 border-t border-zinc-800/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-zinc-400" />
                <label className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider">
                  Agent Room Canvas Rendering
                </label>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">{ecoModeFps} FPS</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEcoModeFps(15)}
                className={`px-3 py-2 rounded border text-left transition-colors ${
                  ecoModeFps === 15
                    ? 'bg-zinc-900 border-zinc-600 text-zinc-100'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="text-xs font-semibold text-emerald-400">15fps Eco (Recommended)</div>
                <div className="text-[10px] text-zinc-500">Minimal CPU usage (&lt;0.5%), cool and silent</div>
              </button>

              <button
                type="button"
                onClick={() => setEcoModeFps(60)}
                className={`px-3 py-2 rounded border text-left transition-colors ${
                  ecoModeFps === 60
                    ? 'bg-zinc-900 border-zinc-600 text-zinc-100'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="text-xs font-semibold text-sky-400">60fps Ultra</div>
                <div className="text-[10px] text-zinc-500">Silky smooth orbital visual animations</div>
              </button>
            </div>
          </div>

          {/* Section: Directory / Workspace */}
          <div className="space-y-2 pt-3 border-t border-zinc-800/60">
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
        <div className="h-10 px-4 border-t border-zinc-800/60 bg-zinc-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span>Dewwie Daemon v0.1.13</span>
          </div>
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
