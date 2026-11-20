import React, { useEffect } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { X, FolderOpen, Palette, Check, Save, Zap, Radio } from 'lucide-react';
import { THEMES_CONFIG } from '../theme/themes';
import { version as APP_VERSION } from '../../package.json';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Derived from the single theme registry so names, colours and count never drift.
const THEMES = Object.values(THEMES_CONFIG).map((t) => ({ id: t.id, name: t.name, desc: t.desc, bg: t.bg, border: t.border }));

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

  // Escape closes the dialog (capture phase so a focused xterm can't swallow it).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 font-mono select-none" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
        className="w-full max-w-lg max-h-[85vh] border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div
          style={{ backgroundColor: 'var(--app-nav-bg)', borderColor: 'var(--app-border)' }}
          className="h-9 px-3 border-b flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <Palette className="w-3.5 h-3.5" style={{ color: 'var(--app-text-muted)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text)' }}>
              Settings
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

        {/* Content */}
        <div className="p-3.5 space-y-4 overflow-y-auto max-h-[calc(85vh-80px)] no-scrollbar">
          {/* Section: Themes */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--app-text-muted)' }}>
              Theme ({THEMES.length})
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {THEMES.map((t) => {
                const isSelected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    style={{
                      backgroundColor: isSelected ? 'var(--app-surface-elevated)' : 'var(--app-surface)',
                      borderColor: isSelected ? 'var(--app-accent)' : 'var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                    className={`w-full px-2.5 py-1.5 rounded border flex items-center justify-between transition-colors text-left ${
                      isSelected ? 'font-semibold shadow-xs' : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full border shrink-0"
                        style={{ backgroundColor: t.bg, borderColor: t.border }}
                      />
                      <div className="truncate">
                        <div className="text-[11px] truncate">{t.name}</div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-3 h-3 shrink-0" style={{ color: 'var(--app-accent)' }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Session Persistence */}
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
            <div className="flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" style={{ color: 'var(--app-text-muted)' }} />
              <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                Session Persistence
              </label>
            </div>

            <div
              style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
              className="space-y-2 p-2.5 rounded border text-xs"
            >
              {/* Toggle 1: Restore Sessions on Startup */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium" style={{ color: 'var(--app-text)' }}>Restore Sessions</div>
                  <div className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
                    Reopen tabs on launch
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={restoreSessionsOnStartup}
                  aria-label="Restore Sessions"
                  onClick={() => setRestoreSessionsOnStartup(!restoreSessionsOnStartup)}
                  className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                    restoreSessionsOnStartup ? 'bg-emerald-500 justify-end' : 'bg-zinc-700 justify-start'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              <div className="h-px my-1" style={{ backgroundColor: 'var(--app-border)' }} />

              {/* Toggle 2: Restore Terminal Scrollback */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium" style={{ color: 'var(--app-text)' }}>Save Scrollback</div>
                  <div className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
                    Keep terminal output history
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={restoreScrollback}
                  aria-label="Save Scrollback"
                  onClick={() => setRestoreScrollback(!restoreScrollback)}
                  className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                    restoreScrollback ? 'bg-emerald-500 justify-end' : 'bg-zinc-700 justify-start'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              <div className="h-px my-1" style={{ backgroundColor: 'var(--app-border)' }} />

              {/* Toggle 3: Persist Multi-Agent Mesh Rooms */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium" style={{ color: 'var(--app-text)' }}>Save Mesh Rooms</div>
                  <div className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
                    Keep rooms & agent assignments
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={persistActiveMesh}
                  aria-label="Save Mesh Rooms"
                  onClick={() => setPersistActiveMesh(!persistActiveMesh)}
                  className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                    persistActiveMesh ? 'bg-emerald-500 justify-end' : 'bg-zinc-700 justify-start'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                </button>
              </div>
            </div>
          </div>

          {/* Section: Agent Room Canvas FPS */}
          <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--app-text-muted)' }} />
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                  Visual Deck FPS
                </label>
              </div>
              <span className="text-[10px] font-mono" style={{ color: 'var(--app-text-muted)' }}>{ecoModeFps} FPS</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setEcoModeFps(15)}
                style={{
                  backgroundColor: ecoModeFps === 15 ? 'var(--app-surface-elevated)' : 'var(--app-surface)',
                  borderColor: ecoModeFps === 15 ? 'var(--app-accent)' : 'var(--app-border)',
                  color: 'var(--app-text)',
                }}
                className={`p-2 rounded border text-left transition-colors ${
                  ecoModeFps === 15 ? 'font-semibold' : 'opacity-80 hover:opacity-100'
                }`}
              >
                <div className="text-[11px] font-semibold text-emerald-500">15 FPS Eco</div>
                <div className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>Low CPU (&lt;0.5%)</div>
              </button>

              <button
                type="button"
                onClick={() => setEcoModeFps(60)}
                style={{
                  backgroundColor: ecoModeFps === 60 ? 'var(--app-surface-elevated)' : 'var(--app-surface)',
                  borderColor: ecoModeFps === 60 ? 'var(--app-accent)' : 'var(--app-border)',
                  color: 'var(--app-text)',
                }}
                className={`p-2 rounded border text-left transition-colors ${
                  ecoModeFps === 60 ? 'font-semibold' : 'opacity-80 hover:opacity-100'
                }`}
              >
                <div className="text-[11px] font-semibold text-cyan-500">60 FPS Ultra</div>
                <div className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>Smooth motion</div>
              </button>
            </div>
          </div>

          {/* Section: Directory / Workspace */}
          <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--app-border)' }}>
            <label className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--app-text-muted)' }}>
              Working Directory
            </label>
            <div
              style={{ backgroundColor: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
              className="p-2.5 rounded border space-y-1.5"
            >
              <div className="text-xs font-medium truncate" style={{ color: 'var(--app-text)' }}>
                {currentProject?.name || 'Local Folder'}
              </div>
              <div className="text-[10px] font-mono break-all" style={{ color: 'var(--app-text-muted)' }}>
                {currentProject?.rootPath || 'None'}
              </div>
              <button
                onClick={async () => {
                  await pickAndOpenFolder();
                  onClose();
                }}
                className="w-full mt-1 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: 'var(--app-surface-elevated)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                }}
              >
                <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--app-text-muted)' }} />
                <span>Open Folder...</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{ backgroundColor: 'var(--app-nav-bg)', borderColor: 'var(--app-border)' }}
          className="h-10 px-3 border-t flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: 'var(--app-text-muted)' }}>
            <Radio className="w-2.5 h-2.5 text-emerald-400" />
            <span>Dewwie v{APP_VERSION}</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded text-xs font-semibold transition-colors"
            style={{
              backgroundColor: 'var(--app-surface-elevated)',
              color: 'var(--app-text)',
              border: '1px solid var(--app-border)',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
