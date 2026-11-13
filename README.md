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

- **📁 Project & Session Tree**: Intuitive hierarchical worktree tree with continuous vertical branch guide lines (`├── •`, `└── •`) supporting both **Local (In-Place)** sessions and **Branch (Isolated Git Worktree)** sessions.
- **⚡ 100% Native ConPTY Terminals**: Direct real-time terminal streaming over WinPTY/ConPTY with full ANSI color support, resize negotiation, and zero intermediate prompt bloat.
- **🔄 Side-by-Side Multi-Agent Split**: Multi-tab agent switching (`Claude Code`, `OpenAI Codex`, etc.) and side-by-side split terminal view (`[⊞ Split View]`).
- **🌿 Integrated Git Diff Inspector**: Live uncommitted diff review (`git diff HEAD`) for local sessions and base-to-branch comparisons (`git diff <base>..<branch>`) with unified and split diff views.
- **🗂️ Built-in File Explorer**: Real-time project file tree with quick open actions for Cursor, Zed, and VS Code.
- **📡 OSC 7501 Protocol Integration**: Live background agent telemetry monitoring (`\x1b]7501;state=<state>;msg=<message>\x07`) with visual status pings.
- **🔒 Dynamic Port Allocation**: Automatic non-colliding port offset management (`PORT=5174+N`) injected into `.env.local` for parallel full-stack agent worktrees.

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
