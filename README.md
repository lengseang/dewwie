<div align="center">

<img src="./doc/logo/dewwie_logo.png" alt="Dewwie Logo" width="140" height="140" />

# Dewwie

### Autonomous AI Agent IDE & Multi-Tasking Terminal Workspace

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#)
[![TypeScript](https://img.shields.io/badge/frontend-React%2019%20%2B%20TypeScript-3178C6.svg)](#)
[![Electron](https://img.shields.io/badge/desktop-Electron%2045-47848F.svg)](#)
[![Terminal](https://img.shields.io/badge/terminal-ConPTY%20%2B%20WinPTY-black.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#)

*Dewwie is a high-performance desktop IDE and terminal orchestrator engineered for multi-tasking AI coding agents (Claude Code, OpenAI Codex, Aider, OpenHands, and custom CLI tools).*

</div>

---

## 🌟 Key Capabilities

- **⚡ Native Terminals**: Every session is a real shell (PowerShell on Windows, bash elsewhere) run by `node-pty` inside the Electron main process and streamed to xterm.js over in-memory IPC. Terminals live as long as the app is open; on relaunch the last 64 KB of output is restored (Settings → Save Scrollback). Herdr Core (`hc.exe`) is optional and only used by `dewwie delegate` to launch background workers when it is installed.
- **👑 Autonomous Lead Agent Delegation**: Root session orchestrator with `👑 LEAD` badge that autonomously decomposes complex goals into subtasks, provisions isolated git worktrees, launches background workers, and collects completion diffs via `dewwie delegate "<task>"`.
- **💬 Cross-Directory Inter-Agent Room Mesh**: Real-time communication mesh connecting agents across disparate root folders and branch worktrees using OSC 7502 escape sequences (`@all`, `@lead`, `@<worker>`).
- **📁 Project & Session Tree**: Intuitive hierarchical worktree tree with continuous vertical branch guide lines (`├── •`, `└── •`) supporting both **Local (In-Place)** sessions and **Branch (Isolated Git Worktree)** sessions.
- **🎨 Unified Single 36px Compact Bar**: Zero-clutter minimal header combining tabs, status dots, view switcher pills (`Terminal`, `Room`, `Files`, `Diff`), action buttons (`Split View`, `Restart`, `Copy`, `Clear`), external IDE triggers (`Cursor`, `Zed`), and collapsible sidebars (`Ctrl+B` / `Ctrl+Alt+B`).
- **💾 Crash-Safe State Persistence**: Active workspace, tabs, split and sidebar state persist across restarts in `~/.swarmherd/`. Writes are atomic (temp file + rename) with a `.bak` of the last good version, and a corrupt file is set aside instead of overwritten. The three Settings → Session Persistence switches are enforced.
- **🤖 Built-in Agent Templates**: Ready-to-run templates in `~/.config/herdr-core/templates/` (`dewwie-lead`, `dewwie-worker`, `dewwie-reviewer`).
- **🔒 Dynamic Port Allocation**: Each branch worktree gets a `PORT` / `API_PORT` (+3000) pair written to `.env.local`, chosen from 5174 upwards by skipping ports already registered to another session and probing that both are actually free on the machine.

---

## 🛠️ CLI Reference (Autonomous Orchestration)

Dewwie provides a unified CLI (`dewwie`) and Herdr Core bridge (`hc`):

```bash
# Autonomous Lead Delegation
dewwie delegate "Implement Stripe payment flow"     # Auto-creates worktree, dynamic port & launches worker agent
dewwie wait feat/task-implement-stripe             # Awaits agent completion and prints git diff summary

# Inter-Agent Room Mesh
dewwie room send "Database migration complete" --target @lead
dewwie room list                                   # View recent mesh message stream
dewwie room agents                                 # List all agents currently active in the mesh
dewwie room lead "Local Main Shell"                # Inspect or promote session to 👑 LEAD

# Worktree & Session Management
dewwie ls                                          # List all active worktrees, ports, and agent states
dewwie spawn feat/user-auth --repo exbytelab       # Manual worktree provisioning
dewwie diff feat/user-auth                         # Inspect git diff against main
dewwie open feat/user-auth --ide cursor            # Open worktree in Cursor / Zed / VS Code
```

---

## 🏗️ Architecture

```
 Renderer (React 19 + Zustand + xterm.js)         Electron main process (desktop-ui/electron)
 ─────────────────────────────────────────        ─────────────────────────────────────────────
  Sidebar · terminals · Agent Mesh canvas  ◄─IPC─► main.cjs: ~35 IPC handlers
  (window.swarmherdNative via preload.cjs)          ├─ node-pty shells (WinPTY on Windows) + scrollback
                                                    ├─ osc.cjs       OSC 7501/7502 parser (status / room)
                                                    ├─ jsonstore.cjs atomic state files
                                                    ├─ pathguard.cjs fs:read / fs:tree confined to projects
                                                    ├─ ports.cjs     dev-port allocation
                                                    └─ git (worktrees, diff, merge) via argv, no shell
                                                                 │
                                   ~/.swarmherd/*.json  ◄────────┴────────►  cli/dewwie.py (Python CLI)
                                   projects · workspaces · rooms · room_messages · workspace_state
```

- **One backend:** the Electron main process. There is no separate daemon or network port; the renderer talks to it over Electron IPC only.
- **Shared state:** the app and the `dewwie` CLI both read and write `~/.swarmherd/*.json` (atomic writes on both sides). The app watches that folder and reloads when the CLI changes it.
- **Room mesh:** messages are stored in `room_messages.json`. The CLI writes them directly; OSC 7502 printed inside a Dewwie terminal is parsed by `osc.cjs`. On Windows, WinPTY currently strips OSC sequences, so the CLI file path is what works there (see `doc/FIX_LOOP_PLAN.md`, T12).
- **Legacy:** `core-daemon/` (Rust) and the `hc` bridge are from an earlier design. The app does not use the daemon, and it does not build on a machine without a Rust C toolchain.

---

## 🚀 Quickstart

### 1. Launch with Native Binary Launcher

Double-click `dewwie.exe` or execute from PowerShell / Terminal:

```powershell
.\dewwie.exe
```

### 2. CLI Commands

Dewwie provides a fast command-line interface for headless management:

```powershell
# Autonomous Lead Delegation: Decompose goal, provision worktree, and launch Herdr agent
.\dewwie.exe delegate "Implement resilient retry loop with exponential backoff for database"

# Await agent completion and display git diff summary
.\dewwie.exe wait <session-id-or-branch>

# List all active sessions, branches, agents, and allocated ports
.\dewwie.exe ls

# Live Agent Room Mesh: send broadcast or direct messages
.\dewwie.exe room send "@all" "Status check: report your active tasks and test progress"

# Spawn an isolated git worktree branch with dynamic port allocation
.\dewwie.exe spawn feat-payment-api --agent dewwie-worker

# Inspect live git diff
.\dewwie.exe diff feat-payment-api

# Open session directly in Cursor IDE or Zed
.\dewwie.exe open feat-payment-api --ide cursor
```

### 3. Build & Run Desktop UI from Source

```bash
cd desktop-ui
npm install
npm run build
npm run app
```

---

## 📦 Project Structure

```
Dewwie/
├── cli/                 # Python CLI interface (dewwie.py)
├── cmd/launcher/        # Go compiled native desktop launcher (main.go)
├── core-daemon/         # Legacy Rust supervisor (not used by the app)
├── desktop-ui/          # React 19 + Electron 45 + Tailwind CSS Desktop Software
│   ├── src/             # Component tree & Zustand store
│   ├── electron/        # Electron main process, IPC handlers + tested modules (*.test.mjs)
│   └── public/          # Dewwie logo and icons
├── doc/                 # Logo, FIX_LOOP_PLAN.md (open issues and verified fixes)
├── tests/               # run_all_tests.py: boot smoke test, vitest, CLI state IO, worktree/mesh/E2E suites
├── dewwie.exe           # Precompiled 1.9MB native launcher
└── start.bat            # Quick launcher script
```

---

## 📄 License

MIT © 2026 Leng Seang
