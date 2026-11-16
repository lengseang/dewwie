import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from './workspaceStore';

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    // Reset store state with test workspaces
    const mockWs = (id: string, branch = 'main') => ({
      id,
      name: `Test ${id}`,
      sessionMode: 'branch' as const,
      branch,
      baseBranch: 'main',
      worktreePath: `D:\\test\\${id}`,
      agentStatus: {
        state: 'idle' as const,
        message: 'Ready',
        timestamp: Date.now(),
      },
      metrics: { cpuPercent: 0.5, memoryMb: 50 },
      ports: [{ service: 'App', port: 5173, status: 'active' as const, url: 'http://localhost:5173' }],
      diffSummary: { filesChanged: 2, additions: 10, deletions: 2 },
      createdAt: new Date().toISOString(),
      lastActivity: 'Just now',
      commitSha: 'HEAD',
      terminalSessionId: `term-${id}`,
    });

    useWorkspaceStore.setState({
      workspaces: {
        'ws-1': mockWs('ws-1', 'feature/test-1'),
        'ws-2': mockWs('ws-2', 'feature/test-2'),
        'ws-3': mockWs('ws-3', 'feature/test-3'),
      },
      workspaceOrder: ['ws-1', 'ws-2', 'ws-3'],
      activeWorkspaceId: 'ws-1',
      mode: 'build',
    });
  });

  it('switches between Build and Review modes', () => {
    const store = useWorkspaceStore.getState();
    expect(store.mode).toBe('build');

    store.setMode('review');
    expect(useWorkspaceStore.getState().mode).toBe('review');

    store.setMode('build');
    expect(useWorkspaceStore.getState().mode).toBe('build');
  });

  it('selects active workspace correctly', () => {
    const store = useWorkspaceStore.getState();
    expect(store.activeWorkspaceId).toBe('ws-1');

    store.setActiveWorkspace('ws-2');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-2');
  });

  it('creates new worktree workspace with initial status and terminal hydration', async () => {
    const store = useWorkspaceStore.getState();
    const newId = await store.createWorkspace('AI Auth Migration', 'feature/auth-v2', 'main');

    const updated = useWorkspaceStore.getState();
    expect(updated.workspaces[newId]).toBeDefined();
    expect(updated.workspaces[newId].branch).toBe('feature/auth-v2');
    expect(updated.workspaces[newId].baseBranch).toBe('main');
    expect(updated.activeWorkspaceId).toBe(newId);
    expect(updated.terminalScrollbacks[newId]).toContain('SwarmHerd Worktree Initialized');
  });

  it('parses OSC 7501 sequences and updates agent status in real-time', () => {
    const store = useWorkspaceStore.getState();
    const wsId = 'ws-1';

    // 1. Emit working state
    store.appendTerminalChunk(wsId, '\x1b]7501;state=working;msg=Building AST dependency graph\x07');
    let ws = useWorkspaceStore.getState().workspaces[wsId];
    expect(ws.agentStatus.state).toBe('working');
    expect(ws.agentStatus.message).toBe('Building AST dependency graph');

    // 2. Emit blocked state (human approval needed)
    store.appendTerminalChunk(wsId, '\x1b]7501;state=blocked;msg=Awaiting approval for .env patch\x07');
    ws = useWorkspaceStore.getState().workspaces[wsId];
    expect(ws.agentStatus.state).toBe('blocked');
    expect(ws.agentStatus.message).toBe('Awaiting approval for .env patch');

    // 3. Emit done state
    store.appendTerminalChunk(wsId, '\x1b]7501;state=done;msg=All 12 tests passed\x07');
    ws = useWorkspaceStore.getState().workspaces[wsId];
    expect(ws.agentStatus.state).toBe('done');
    expect(ws.agentStatus.message).toBe('All 12 tests passed');
  });

  it('handles 1-click merge workflow', async () => {
    const store = useWorkspaceStore.getState();
    const wsId = 'ws-1';

    const result = await store.mergeWorktree(wsId, 'feat(pty): integrate session manager');
    expect(result.success).toBe(true);

    const ws = useWorkspaceStore.getState().workspaces[wsId];
    expect(ws.agentStatus.state).toBe('done');
    expect(ws.diffSummary.filesChanged).toBe(0);
  });

  it('handles 1-click rebase workflow', async () => {
    const store = useWorkspaceStore.getState();
    const wsId = 'ws-2';

    const result = await store.rebaseWorktree(wsId);
    expect(result.success).toBe(true);
    expect(useWorkspaceStore.getState().workspaces[wsId].agentStatus.state).toBe('working');
  });

  it('handles discard worktree workflow', async () => {
    const store = useWorkspaceStore.getState();
    const wsId = 'ws-3';

    const result = await store.discardWorktree(wsId);
    expect(result.success).toBe(true);
    expect(useWorkspaceStore.getState().workspaces[wsId]).toBeUndefined();
  });

  it('switches and persists color themes correctly', () => {
    const store = useWorkspaceStore.getState();
    expect(store.theme).toBeDefined();

    store.setTheme('tokyo');
    expect(useWorkspaceStore.getState().theme).toBe('tokyo');

    store.setTheme('oled');
    expect(useWorkspaceStore.getState().theme).toBe('oled');

    store.setTheme('slate');
    expect(useWorkspaceStore.getState().theme).toBe('slate');

    store.setTheme('monokai');
    expect(useWorkspaceStore.getState().theme).toBe('monokai');

    store.setTheme('zinc');
    expect(useWorkspaceStore.getState().theme).toBe('zinc');
  });
});
