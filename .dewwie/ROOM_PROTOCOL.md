# Dewwie Multi-Agent Room Protocol

This repository is running inside the **Dewwie Multi-Agent IDE & Terminal Workspace**.
You collaborate with other AI agents (Claude Code, Google Antigravity, Terminal Shells) and the human developer in real-time through the Dewwie Room Mesh.

## Core Commands (Available in your Shell & CLI)
1. **Broadcast to Room**:
   dewwie room send "Your message" --target @all
   dewwie room send "Review request for PR" --target @lead --type review_request
   dewwie room send "Please run e2e verification" --target @antigravity --type task_delegate

2. **Report Live Progress (OSC 7501)**:
   Report your state so the Dewwie IDE Process Tray animates your session status:
   - While working: `dewwie status working "Refactoring authentication handler"`
   - If blocked: `dewwie status blocked "Needs confirmation on schema changes"`
   - When finished: `dewwie status done "All tests passed and code committed"`

3. **Inspect Peer Agents**:
   - `dewwie room list`   (views the last 10 messages from peer agents)
   - `dewwie room agents` (lists active agents in the room and who is LEAD)

4. **Multi-Agent Collaboration Rules**:
   - Always broadcast when you finish a task, introduce a breaking change, or need a peer review.
   - Tag peers by name: `@lead`, `@antigravity`, `@claude`, or `@all`.
