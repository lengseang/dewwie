# SwarmHerd Verification & Test Harness

This directory contains the automated test suites, contract alignment verifications, and mock agent simulators for **SwarmHerd**.

## Test Suite Inventory

| Script | Purpose | Execution |
|---|---|---|
| `mock_agent.py` | Simulates an autonomous coding agent running in terminal PTY, emitting **OSC 7501** status sequences (`working`, `blocked`, `done`, `error`) and ANSI logs. | `python swarmherd/tests/mock_agent.py [--scenario standard\|quick\|fail\|infinite]` |
| `mock_agent.sh` | Bash equivalent of the mock agent simulator for Linux/macOS environments. | `bash swarmherd/tests/mock_agent.sh` |
| `test_worktree.py` | End-to-end Git worktree lifecycle test: base repo creation, branch worktree add, filesystem isolation verification, diff calculation (`--stat`, `--numstat`, untracked), clean merge, and teardown/prune. | `python swarmherd/tests/test_worktree.py` |
| `test_worktree.ps1` | Native Windows PowerShell script verifying the Git worktree lifecycle. | `powershell -ExecutionPolicy Bypass -File swarmherd/tests/test_worktree.ps1` |
| `smoke_electron.py` | Boot smoke test of the shipped app: `node --check` on every `electron/*.cjs`, then launches Electron against `dist/` in a sandboxed HOME/APPDATA and requires `DEWWIE_SMOKE OK` (window loaded, React rendered). Needs `npm run build` first. | `python tests/smoke_electron.py` |
| `desktop-ui/electron/*.test.mjs` | Vitest unit tests of the shipped main-process modules (OSC parser, port allocator, state-file IO, path guard, scrollback trim). Run via `run_all_tests.py` or `npx vitest run` in `desktop-ui`. | `npx vitest run` |
| `test_state_io.py` | Shared state file IO of the shipped CLI (`read_json_safe` / `write_json_atomic`) in a temp dir. | `python tests/test_state_io.py` |
| `test_rpc_contract.py` | Verifies JSON-RPC 2.0 schema alignment, method name consistency, enum matching (`AgentStatus`, `UIMode`), and port allocation keys between Rust daemon and React UI. | `python swarmherd/tests/test_rpc_contract.py` |
| `run_all_tests.py` | Master test runner executing every suite in sequence (boot smoke + shipped JS first), displaying formatted execution tables, and providing exit codes for CI/CD gates. | `python swarmherd/tests/run_all_tests.py` |

## Quick Start

### Run Master Verification Suite
```bash
python swarmherd/tests/run_all_tests.py
```

### Run Mock Agent
```bash
# Standard 4-step scenario (working -> blocked -> approval -> done)
python swarmherd/tests/mock_agent.py --delay 0.5

# Quick verification mode (emits OSC sequences instantly)
python swarmherd/tests/mock_agent.py --scenario quick

# Failure simulation
python swarmherd/tests/mock_agent.py --scenario fail
```

## Contract Alignment Summary

### 1. Agent Status Protocol (OSC 7501)
- **Escape Sequence**: `\x1b]7501;state=<state>;msg=<message><TERM>` where `<TERM>` is BEL (`\x07`) or ST (`\x1b\`).
- **States**: `idle`, `working`, `blocked`, `done`, `error`.
- **Rust Enum**: `AgentStatus` in `swarmherd/core-daemon/src/osc.rs`.
- **React Type**: `AgentState` in `swarmherd/desktop-ui/src/types/index.ts`.
- **Status**: **100% Aligned**.

### 2. JSON-RPC 2.0 Methods
- `workspace.list`: List all active/persisted workspaces.
- `workspace.create`: Create new worktree branch and allocate port slot.
- `workspace.get`: Get metadata for specific workspace.
- `workspace.remove` / `workspace.delete`: Remove worktree and optionally delete branch.
- `git.diff` / `workspace.diff`: Get structured diff summary (+additions, -deletions, patch, untracked).
- `git.merge` / `workspace.merge`: Fast-forward, squash, or merge worktree branch into base.
- `git.discard` / `workspace.discard`: Hard reset worktree changes and clean untracked files.
- `pty.spawn`: Launch agent process inside isolated worktree.
- `pty.write`: Deliver user input / stdin keystrokes to terminal.
- `pty.resize`: Update terminal dimensions (cols, rows).
- `pty.kill`: Terminate running PTY process.
- `pty.scrollback`: Fetch historical terminal buffer from `scrollback.bin`.
- `system.metrics`: Query CPU & RAM utilization.
- `system.ping`: Health check.
- **Status**: **100% Aligned with dual alias support**.

### 3. Port Broker Allocations
- **Base Ports**: Web (3000), Backend (8000), Vite (5173).
- **Slot Formula**: `base_port + slot * 10` (or `+ slot` sequential probing).
- **Injected `.env.local` Keys**: `PORT`, `BACKEND_PORT`, `VITE_PORT`, `NEXT_PUBLIC_PORT`, `NEXT_PUBLIC_API_URL`, `SWARMHERD_PORT_SLOT`.
- **Status**: **100% Aligned**.
