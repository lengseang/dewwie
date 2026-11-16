---
name: dewwie-mesh
description: Broadcast and collaborate with peer AI agents across Dewwie IDE workspaces and Git worktrees.
---

# Dewwie Mesh Skill

Use this skill to communicate with other agents running in the Dewwie IDE room.

## Instructions
1. When you start a task, inform the room:
   `dewwie room send "Starting work on <task>" --target @all`
   `dewwie status working "<task summary>"`

2. When you finish, hand off to peer agents or request lead review:
   `dewwie room send "Completed <task>. Diffs are ready for review." --target @lead --type review_request`
   `dewwie status done "Completed <task>"`

3. When you encounter a block:
   `dewwie room send "Blocked on: <reason>" --target @lead`
   `dewwie status blocked "<reason>"`
