import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import {
  Plus,
  Settings,
  PanelLeftClose,
  PanelLeft,
  AlertTriangle,
} from 'lucide-react';

interface LeftDockProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const LeftDock: React.FC<LeftDockProps> = ({
  sidebarOpen,
  onToggleSidebar,
}) => {
  const {
    activeSpaceIndex,
    setActiveSpaceIndex,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
  } = useWorkspaceStore();

  const allWorkspaces = Object.values(workspaces);
  const blockedCount = allWorkspaces.filter((w) => w.agentStatus.state === 'blocked').length;

  return (
    <aside className="w-11 h-full bg-[#09090b] border-r border-zinc-800/80 flex flex-col items-center justify-between py-2.5 shrink-0 select-none z-30">
      {/* Top: Space & Project Switcher */}
      <div className="flex flex-col items-center gap-2 w-full">
        {/* Toggle Sidebar */}
        <button
          onClick={onToggleSidebar}
          title="Toggle Workspaces Tree (Ctrl+B)"
          className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeft className="w-3.5 h-3.5" />
          )}
        </button>

        <div className="w-4 h-px bg-zinc-800 my-0.5" />

        {/* Space 1 (Active) */}
        <button
          onClick={() => setActiveSpaceIndex(1)}
          title="Space 1 (exbytelab)"
          className={`w-7 h-7 rounded text-xs font-mono font-medium flex items-center justify-center relative transition-all ${
            activeSpaceIndex === 1
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
          }`}
        >
          <span>1</span>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 absolute top-1 right-1" />
        </button>

        {/* Space 2 (With Alert) */}
        <button
          onClick={() => setActiveSpaceIndex(2)}
          title="Space 2 (ThinkFolio - 1 Agent Needs You)"
          className={`w-7 h-7 rounded text-xs font-mono font-medium flex items-center justify-center relative transition-all ${
            activeSpaceIndex === 2
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
          }`}
        >
          <span>2</span>
          {blockedCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-0.5 right-0.5 agent-blocked-dot" />
          )}
        </button>

        {/* Space 3 */}
        <button
          onClick={() => setActiveSpaceIndex(3)}
          title="Space 3 (dotclaude)"
          className={`w-7 h-7 rounded text-xs font-mono font-medium flex items-center justify-center relative transition-all ${
            activeSpaceIndex === 3
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
          }`}
        >
          <span>3</span>
        </button>

        {/* Add Space */}
        <button
          title="Add Space / Repository"
          className="w-7 h-7 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Middle: Herdr-Style Stacked Agent Status Indicators */}
      <div className="flex flex-col items-center gap-1.5 py-3 border-y border-zinc-900 w-full">
        {allWorkspaces.slice(0, 5).map((ws, idx) => {
          const isSelected = ws.id === activeWorkspaceId;
          const isBlocked = ws.agentStatus.state === 'blocked';
          const isWorking = ws.agentStatus.state === 'working';
          const isDone = ws.agentStatus.state === 'done';

          return (
            <button
              key={ws.id}
              onClick={() => setActiveWorkspace(ws.id)}
              title={`${ws.branch}: ${ws.agentStatus.message}`}
              className={`w-6 h-5 rounded text-[10px] font-mono flex items-center justify-center gap-0.5 transition-colors ${
                isSelected
                  ? 'bg-zinc-800 text-zinc-100 font-bold'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              <span>{idx + 1}</span>
              {isBlocked ? (
                <span className="text-amber-400 font-bold text-[9px]">!</span>
              ) : isWorking ? (
                <span className="w-1 h-1 rounded-full bg-blue-400" />
              ) : isDone ? (
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
              ) : (
                <span className="w-1 h-1 rounded-full bg-zinc-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom: Settings & Alerts */}
      <div className="flex flex-col items-center gap-2">
        {blockedCount > 0 && (
          <div
            title={`${blockedCount} agent needs operator input`}
            className="w-6 h-6 rounded flex items-center justify-center text-amber-400 bg-amber-500/10 border border-amber-500/30"
          >
            <AlertTriangle className="w-3 h-3" />
          </div>
        )}

        <button
          title="Settings (Ctrl+,)"
          className="w-7 h-7 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
