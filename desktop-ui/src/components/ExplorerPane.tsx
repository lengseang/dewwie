import React, { useState, useEffect, useCallback } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { FileItem } from '../types';
import {
  Folder,
  FolderOpen,
  FileCode,
  ChevronRight,
  ChevronDown,
  Search,
  ExternalLink,
  FileText,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';

const FALLBACK_TREE: FileItem[] = [
  {
    name: 'core-daemon',
    type: 'folder',
    path: 'core-daemon',
    children: [
      {
        name: 'src',
        type: 'folder',
        path: 'core-daemon/src',
        children: [
          { name: 'main.rs', type: 'file', path: 'core-daemon/src/main.rs', size: '12.2 KB' },
          { name: 'pty.rs', type: 'file', path: 'core-daemon/src/pty.rs', size: '9.9 KB' },
          { name: 'osc.rs', type: 'file', path: 'core-daemon/src/osc.rs', size: '11.2 KB' },
          { name: 'git_worktree.rs', type: 'file', path: 'core-daemon/src/git_worktree.rs', size: '13.8 KB' },
          { name: 'port_broker.rs', type: 'file', path: 'core-daemon/src/port_broker.rs', size: '9.5 KB' },
          { name: 'session_store.rs', type: 'file', path: 'core-daemon/src/session_store.rs', size: '9.9 KB' },
          { name: 'rpc.rs', type: 'file', path: 'core-daemon/src/rpc.rs', size: '21.2 KB' },
        ],
      },
      { name: 'Cargo.toml', type: 'file', path: 'core-daemon/Cargo.toml', size: '1.4 KB' },
    ],
  },
  {
    name: 'desktop-ui',
    type: 'folder',
    path: 'desktop-ui',
    children: [
      {
        name: 'src',
        type: 'folder',
        path: 'desktop-ui/src',
        children: [
          { name: 'App.tsx', type: 'file', path: 'desktop-ui/src/App.tsx', size: '8.4 KB' },
          { name: 'index.css', type: 'file', path: 'desktop-ui/src/index.css', size: '1.8 KB' },
          { name: 'types/index.ts', type: 'file', path: 'desktop-ui/src/types/index.ts', size: '4.2 KB' },
          { name: 'store/workspaceStore.ts', type: 'file', path: 'desktop-ui/src/store/workspaceStore.ts', size: '18.5 KB' },
        ],
      },
      { name: 'package.json', type: 'file', path: 'desktop-ui/package.json', size: '890 B' },
      { name: 'vite.config.ts', type: 'file', path: 'desktop-ui/vite.config.ts', size: '340 B' },
    ],
  },
  { name: 'README.md', type: 'file', path: 'README.md', size: '2.4 KB' },
];

export const ExplorerPane: React.FC<{ sidebarOnly?: boolean }> = ({ sidebarOnly = false }) => {
  const { activeWorkspaceId, workspaces, launchEditor } = useWorkspaceStore();
  const [tree, setTree] = useState<FileItem[]>(FALLBACK_TREE);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    'core-daemon': true,
    'core-daemon/src': true,
    'desktop-ui': true,
    'desktop-ui/src': true,
  });
  const [selectedFilePath, setSelectedFilePath] = useState<string>('desktop-ui/src/App.tsx');
  const [fileContent, setFileContent] = useState<string>('// Select a file to view code');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const activeWs = activeWorkspaceId ? workspaces[activeWorkspaceId] : null;
  const basePath = activeWs ? activeWs.worktreePath : 'D:\\1111-Works\\exbytelab';

  // Load real workspace tree from native backend
  const refreshTree = useCallback(async () => {
    if (typeof window !== 'undefined' && window.swarmherdNative?.getFilesTree) {
      try {
        const items = await window.swarmherdNative.getFilesTree({ targetPath: basePath });
        if (Array.isArray(items) && items.length > 0) {
          setTree(items);
        }
      } catch (err) {
        console.error('Failed to load file tree:', err);
      }
    }
  }, [basePath]);

  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

  // Read file content when a file is selected
  const handleSelectFile = async (filePath: string) => {
    setSelectedFilePath(filePath);
    setIsLoadingFile(true);
    if (typeof window !== 'undefined' && window.swarmherdNative?.readFile) {
      try {
        const res = await window.swarmherdNative.readFile({ filePath, basePath });
        if (res.content !== undefined) {
          setFileContent(res.content);
        } else {
          setFileContent(`// Error loading file: ${res.error || 'Unknown error'}`);
        }
      } catch (err: unknown) {
        setFileContent(`// Failed to read file: ${String(err)}`);
      } finally {
        setIsLoadingFile(false);
      }
    } else {
      setFileContent(`// [Preview Mode] Simulated content for ${filePath}\n\nexport const example = () => {\n  console.log("Viewing ${filePath}");\n};`);
      setIsLoadingFile(false);
    }
  };

  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderNode = (node: FileItem) => {
    const fullPath = node.path || node.name;
    const isOpen = !!openFolders[fullPath];
    const isSelected = selectedFilePath === fullPath;

    // Filter by search
    if (search && !node.name.toLowerCase().includes(search.toLowerCase()) && node.type === 'file') {
      return null;
    }

    if (node.type === 'folder') {
      return (
        <div key={fullPath} className="space-y-0.5">
          <div
            onClick={() => toggleFolder(fullPath)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-900/60 cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {isOpen ? (
              <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            )}
            <span className="font-semibold truncate">{node.name}</span>
          </div>

          {isOpen && node.children && (
            <div className="pl-3.5 space-y-0.5 border-l border-zinc-900 ml-2">
              {node.children.map((child) => renderNode(child))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={fullPath}
        onClick={() => handleSelectFile(fullPath)}
        className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
          isSelected
            ? 'bg-zinc-900 text-zinc-100 font-medium border border-zinc-800'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <FileCode className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <span className="truncate">{node.name}</span>
        </div>
        {node.size && <span className="text-[10px] text-zinc-600">{node.size}</span>}
      </div>
    );
  };

  if (sidebarOnly) {
    return (
      <div className="w-full h-full bg-zinc-950 flex flex-col font-mono select-none overflow-hidden">
        {/* Explorer Header */}
        <div className="h-9 px-3 border-b border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
            EXPLORER
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={refreshTree}
              title="Refresh tree"
              className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              onClick={() => launchEditor('cursor')}
              title="Open in Cursor IDE"
              className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Project Name Header */}
        <div className="px-3 py-1.5 border-b border-zinc-900 bg-zinc-950/60 flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-200 tracking-wide uppercase truncate">
            {activeWs?.projectName || activeWs?.repository || 'EXBYTELAB'}
          </span>
          <span className="text-[10px] text-zinc-600 font-mono">
            {tree.length} items
          </span>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-zinc-900 shrink-0">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Filter files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-0.5 bg-zinc-900/60 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {tree.map((node) => renderNode(node))}
        </div>

        {/* DevSwarm Bottom Sections (Outline & Timeline) */}
        <div className="border-t border-zinc-800/80 bg-zinc-950 text-xs text-zinc-500 select-none shrink-0">
          <div className="px-3 py-1.5 border-b border-zinc-900 flex items-center justify-between hover:text-zinc-300 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3" />
              <span className="text-[10px] uppercase font-semibold tracking-wider">OUTLINE</span>
            </div>
          </div>
          <div className="px-3 py-1.5 flex items-center justify-between hover:text-zinc-300 cursor-pointer">
            <div className="flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3" />
              <span className="text-[10px] uppercase font-semibold tracking-wider">TIMELINE</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full bg-[#09090b] text-zinc-200 overflow-hidden font-mono select-none">
      {/* Left Column: Explorer Directory Tree */}
      <div className="w-72 border-r border-zinc-800/80 bg-zinc-950 flex flex-col h-full shrink-0">
        {/* Explorer Header */}
        <div className="h-9 px-3 border-b border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider truncate">
            {activeWs?.repository || 'exbytelab'}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={refreshTree}
              title="Refresh tree"
              className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              onClick={() => launchEditor('cursor')}
              title="Open workspace in Cursor IDE"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors"
            >
              <span>IDE</span>
              <ExternalLink className="w-2.5 h-2.5 text-zinc-500" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-zinc-900 shrink-0">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1 bg-zinc-900/60 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {tree.map((node) => renderNode(node))}
        </div>
      </div>

      {/* Right Column: Code Viewer & Editor Preview */}
      <div className="flex-1 flex flex-col h-full bg-[#09090b] overflow-hidden">
        {/* Code Header Bar */}
        <div className="h-9 px-4 border-b border-zinc-800/80 bg-zinc-950 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs text-zinc-300 truncate">
            <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-semibold text-zinc-200">{selectedFilePath}</span>
            <span className="text-[10px] text-zinc-600 font-mono">
              ({fileContent.split('\n').length} lines)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              title="Copy code to clipboard"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-zinc-500" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              onClick={() => launchEditor('cursor')}
              title="Edit in Cursor"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
            >
              <span>Edit</span>
              <ExternalLink className="w-2.5 h-2.5 text-zinc-500" />
            </button>
          </div>
        </div>

        {/* Code Content Container */}
        <div className="flex-1 overflow-auto p-4 bg-[#09090b] font-mono text-xs text-zinc-300 leading-relaxed">
          {isLoadingFile ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              Loading file...
            </div>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {fileContent.split('\n').map((line, idx) => (
                  <tr key={idx} className="hover:bg-zinc-900/50">
                    <td className="w-10 pr-4 text-right text-zinc-600 select-none align-top font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="whitespace-pre font-mono text-zinc-300 align-top">
                      {line || ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
