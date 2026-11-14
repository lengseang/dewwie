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

- **⚡ Herdr Core (`hc`) Persistent Terminals**: Built on top of Herdr Core's rock-solid Rust engine (`hc.exe`). Terminals and coding agents run persistently in the background and stay alive even if the window closes, with instant re-attachment.
- **👑 Autonomous Lead Agent Delegation**: Root session orchestrator with `👑 LEAD` badge that autonomously decomposes complex goals into subtasks, provisions isolated git worktrees, launches background workers, and collects completion diffs via `dewwie delegate "<task>"`.
- **💬 Cross-Directory Inter-Agent Room Mesh**: Real-time communication mesh connecting agents across disparate root folders and branch worktrees using OSC 7502 escape sequences (`@all`, `@lead`, `@<worker>`).
- **📁 Project & Session Tree**: Intuitive hierarchical worktree tree with continuous vertical branch guide lines (`├── •`, `└── •`) supporting both **Local (In-Place)** sessions and **Branch (Isolated Git Worktree)** sessions.
- **🎨 Unified Single 36px Compact Bar**: Zero-clutter minimal header combining tabs, status dots, view switcher pills (`Terminal`, `Room`, `Files`, `Diff`), action buttons (`Split View`, `Restart`, `Copy`, `Clear`), external IDE triggers (`Cursor`, `Zed`), and collapsible sidebars (`Ctrl+B` / `Ctrl+Alt+B`).
- **💾 100% Zero-Loss State Persistence**: Automatically persists active workspace, tabs, split state, and sidebar states across app restarts in `~/.swarmherd/workspace_state.json`.
- **🤖 Built-in Agent Templates**: Ready-to-run templates in `~/.config/herdr-core/templates/` (`dewwie-lead`, `dewwie-worker`, `dewwie-reviewer`).
- **🔒 Dynamic Port Allocation**: Automatic non-colliding port offset management (`PORT=5174+N`) injected into `.env.local` for parallel full-stack agent worktrees.

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
┌────────────────────────────────────────────────────────────────────────┐
│                              Dewwie                                   │
├───────────────────┬────────────────────────────────────────────────────┤
│   WORKSPACES      │   TERMINAL (Dual & Split Panes)                    │
│                   │                                                    │
│  📁 Project       │   >_ main •   >_ feat-native-pty •                 │
│  ├── • main       ├────────────────────────────────────────────────────┤
│  └── • feat-xxx   │   PS D:\Project> claude                            │
│      ╰── + new    │                                                    │
│                   │   (Full-Height Interactive ConPTY Shell)           │
├───────────────────┼────────────────────────────────────────────────────┤
│  [+ Add Project]  │   PORTS: :5173  :5174  :5175 │ 2.1% CPU  215MB RAM │
└───────────────────┴────────────────────────────────────────────────────┘
```

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
# List all active sessions, branches, agents, and allocated ports
.\dewwie.exe ls

# Spawn a local in-place session without creating git branches
.\dewwie.exe spawn "my-local-task" --local --agent claude-code

# Spawn an isolated git worktree branch with dynamic port allocation
.\dewwie.exe spawn feat-payment-api --agent claude-code

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
├── core-daemon/         # Rust native supervisor (WinPTY, OSC 7501, port broker)
├── desktop-ui/          # React 19 + Electron 45 + Tailwind CSS Desktop Software
│   ├── src/             # Component tree & Zustand store
│   ├── electron/        # Electron main process & IPC handlers
│   └── public/          # Dewwie logo and icons
├── doc/logo/            # Official Dewwie logo
├── tests/               # 6-suite end-to-end verification harness
├── dewwie.exe           # Precompiled 1.9MB native launcher
└── start.bat            # Quick launcher script
```

---

## 📄 License

MIT © 2026 Leng Seang
