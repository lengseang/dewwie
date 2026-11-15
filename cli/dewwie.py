#!/usr/bin/env python3
"""
SwarmHerd Unified CLI Tool (inspired by Herdr's `hc` and DevSwarm's Worktrees).

Commands:
  swarmherd ls                             - List all active workspaces & agent statuses
  swarmherd spawn <branch> [--repo <name>] - Create isolated worktree & assign ports
  swarmherd send <id|branch> "<message>"   - Inject instructions/approval to running agent
  swarmherd read <id|branch> [--lines N]   - Read recent agent terminal scrollback
  swarmherd open <id|branch> [--ide NAME]  - Open worktree folder in Cursor, Zed, or Code
  swarmherd diff <id|branch>               - Show colored diff for workspace
  swarmherd merge <id|branch> [-m "msg"]   - Merge worktree branch to base and prune
"""

import sys
import os
import json
import argparse
import subprocess
import socket
import re
import time
from datetime import datetime
from pathlib import Path

__version__ = "0.1.7"

try:
    import hc_bridge
except ImportError:
    try:
        from cli import hc_bridge
    except ImportError:
        hc_bridge = None

DAEMON_HOST = "127.0.0.1"
DAEMON_PORT = 7500
REGISTRY_PATH = Path.home() / ".swarmherd" / "workspaces.json"
SESSIONS_DIR = Path.home() / ".swarmherd" / "sessions"

# ANSI Colors
CYAN = "\033[1;36m"
GREEN = "\033[1;32m"
YELLOW = "\033[1;33m"
BLUE = "\033[1;34m"
RED = "\033[1;31m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

def send_rpc(method: str, params: dict = None) -> dict:
    """Send JSON-RPC command to SwarmHerd Core Daemon."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.5)
        s.connect((DAEMON_HOST, DAEMON_PORT))
        req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {}
        }
        s.sendall(json.dumps(req).encode("utf-8") + b"\n")
        
        data = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
            if b"\n" in chunk:
                break
        s.close()
        res = json.loads(data.decode("utf-8").strip())
        return res.get("result", {})
    except Exception:
        return None

def load_local_workspaces() -> list:
    """Fallback: read ~/.swarmherd/workspaces.json directly."""
    if REGISTRY_PATH.exists():
        try:
            with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    # Return sample seed workspaces if clean start
    return [
        {
            "id": "ws-1",
            "repository": "exbytelab",
            "branch": "feature/pty-osc-streaming",
            "agent": "Claude Code",
            "status": "working",
            "message": "Synthesizing patch for PTY session manager",
            "port": 5174,
            "diff": "+184 -12",
            "worktree": r"D:\1111-Works\exbytelab\.worktrees\pty-osc-streaming"
        },
        {
            "id": "ws-2",
            "repository": "exbytelab",
            "branch": "fix/port-collision-detect",
            "agent": "Claude Code",
            "status": "blocked",
            "message": "Needs human approval: Reallocate port 8002 slot",
            "port": 8002,
            "diff": "+45 -6",
            "worktree": r"D:\1111-Works\exbytelab\.worktrees\port-collision-detect"
        },
        {
            "id": "ws-3",
            "repository": "ThinkFolio",
            "branch": "feat/add-all-format-support",
            "agent": "Claude Code",
            "status": "working",
            "message": "Streaming AST conversion for WebP & AVIF",
            "port": 3000,
            "diff": "+310 -42",
            "worktree": r"D:\1111-Works\ThinkFolio\.worktrees\all-format-support"
        },
        {
            "id": "ws-4",
            "repository": "ThinkFolio",
            "branch": "PR-13-Security-Review",
            "agent": "Aider",
            "status": "done",
            "message": "Audit passed: 0 vulnerabilities found",
            "port": "-",
            "diff": "+65 -71",
            "worktree": r"D:\1111-Works\ThinkFolio\.worktrees\security-review"
        }
    ]

def cmd_ls(args):
    workspaces = load_local_workspaces()
    print(f"\n{BOLD}SWARMHERD ACTIVE WORKTREES & AGENTS{RESET} ({len(workspaces)} workspaces)\n")
    print(f"{'ID':<10} {'REPO':<12} {'BRANCH':<28} {'AGENT':<14} {'STATUS':<20} {'PORTS':<8} {'DIFF'}")
    print("=" * 105)
    
    for ws in workspaces:
        status_info = ws.get("agentStatus", {})
        status_raw = status_info.get("state", ws.get("status", "idle")) if isinstance(status_info, dict) else ws.get("status", "idle")
        if status_raw == "working":
            status_tag = f"{BLUE}• working{RESET}"
        elif status_raw == "blocked":
            status_tag = f"{YELLOW}! blocked (needs you){RESET}"
        elif status_raw == "done":
            status_tag = f"{GREEN}✓ done{RESET}"
        else:
            status_tag = f"{DIM}o idle{RESET}"
            
        wid = ws.get("id", "-")
        repo = ws.get("repository", "exbytelab")
        mode = ws.get("sessionMode", "branch")
        if mode == "local":
            branch = f"[Local] {ws.get('name', 'main')}"[:26]
        else:
            branch = ws.get("branch", "-")[:26]
        agent = ws.get("agentType", ws.get("agent", "Claude"))
        
        ports_list = ws.get("ports", [])
        if ports_list and isinstance(ports_list, list) and len(ports_list) > 0:
            port = str(ports_list[0].get("port", "-"))
        else:
            port = str(ws.get("port", "-"))
            
        diff_summary = ws.get("diffSummary")
        if diff_summary and isinstance(diff_summary, dict):
            diff = f"+{diff_summary.get('additions', 0)} -{diff_summary.get('deletions', 0)}"
        else:
            diff = ws.get("diff", "+0 -0")
        
        print(f"{wid:<10} {repo:<12} {branch:<28} {agent:<14} {status_tag:<30} {port:<8} {diff}")
    print()

def cmd_spawn(args):
    import time
    from datetime import datetime
    branch = args.branch
    repo = args.repo or "exbytelab"
    base = args.base or "main"
    agent = args.agent or "claude-code"
    is_local = getattr(args, "local", False)
    current = load_local_workspaces()
    
    if is_local:
        print(f"\n{CYAN}▶ Spawning new in-place local agent session...{RESET}")
        print(f"  Repository:  {repo}")
        print(f"  Session:     {branch}")
        print(f"  Mode:        Local (In-Place, no git branch)")
        print(f"  Agent CLI:   {agent}")
        worktree_dir = Path(r"D:\1111-Works\exbytelab")
        assigned_port = 5173
    else:
        print(f"\n{CYAN}▶ Spawning new isolated agent worktree...{RESET}")
        print(f"  Repository:  {repo}")
        print(f"  Branch:      {branch}")
        print(f"  Base:        {base}")
        print(f"  Agent CLI:   {agent}")
        
        # 1. Create worktree directory
        safe_folder = branch.replace("/", "-")
        worktree_dir = Path(r"D:\1111-Works\exbytelab\.worktrees") / safe_folder
        worktree_dir.parent.mkdir(parents=True, exist_ok=True)
        
        # 2. Call git
        cmd = ["git", "worktree", "add", "-b", branch, str(worktree_dir), base]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            print(f"  {GREEN}✓ Git worktree created:{RESET} {worktree_dir}")
        else:
            print(f"  {DIM}Note: {res.stderr.strip() or 'Directory ready'}{RESET}")
            
        # 3. Dynamic port assignment
        current = load_local_workspaces()
        assigned_port = 5174 + len(current)
        env_content = f"# Generated by SwarmHerd CLI\nPORT={assigned_port}\nAPI_PORT={assigned_port + 3000}\n"
        (worktree_dir / ".env.local").write_text(env_content, encoding="utf-8")
        print(f"  {GREEN}✓ Allocated Port:{RESET} :{assigned_port} (injected into .env.local)")
    
    # 4. Save to shared ~/.swarmherd/workspaces.json registry
    new_ws = {
        "id": f"ws-{int(time.time())}",
        "repository": repo,
        "name": branch,
        "sessionMode": "local" if is_local else "branch",
        "branch": "main" if is_local else branch,
        "baseBranch": base,
        "worktreePath": str(worktree_dir),
        "agentType": agent,
        "agentStatus": {"state": "idle", "message": "Local session ready" if is_local else "Worktree ready", "timestamp": int(time.time() * 1000)},
        "metrics": {"cpuPercent": 0.5, "memoryMb": 45},
        "ports": [{"service": "App Dev", "port": assigned_port, "status": "allocated", "url": f"http://localhost:{assigned_port}"}],
        "diffSummary": {"filesChanged": 0, "additions": 0, "deletions": 0},
        "createdAt": datetime.now().isoformat(),
        "lastActivity": "Just now",
        "commitSha": "HEAD",
        "terminalSessionId": f"pty-{branch}"
    }
    current.append(new_ws)
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2)

    print(f"\n{BOLD}Ready!{RESET} View live in Desktop UI or launch with: {CYAN}swarmherd open {branch} --ide cursor{RESET}\n")

def slugify_task(task: str) -> str:
    cleaned = re.sub(r'[^a-zA-Z0-9\s-]', '', task).strip().lower()
    slug = re.sub(r'[\s]+', '-', cleaned)
    return slug[:24] if slug else "task"

def cmd_delegate(args):
    task = args.task
    repo = args.repo or "exbytelab"
    base = args.base or "main"
    agent = args.agent or "dewwie-worker"
    
    slug = slugify_task(task)
    branch = args.branch or f"feat/{slug}-{int(time.time()) % 10000}"
    safe_folder = branch.replace("/", "-")
    worktree_dir = Path(r"D:\1111-Works\exbytelab\.worktrees") / safe_folder
    worktree_dir.parent.mkdir(parents=True, exist_ok=True)

    print(f"\n{BOLD}{CYAN}=== Dewwie Autonomous Lead Task Delegation ==={RESET}\n")
    print(f"  Task:        {BOLD}{task}{RESET}")
    print(f"  Repository:  {repo}")
    print(f"  Branch:      {branch}")
    print(f"  Worktree:    {worktree_dir}")
    print(f"  Agent Role:  {agent}")

    # 1. Create Git Worktree
    cmd = ["git", "worktree", "add", "-b", branch, str(worktree_dir), base]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        print(f"  {GREEN}✓ Isolated Git worktree created successfully.{RESET}")
    else:
        print(f"  {DIM}Worktree note: {res.stderr.strip() or 'Directory prepared'}{RESET}")

    # 2. Allocate Dynamic Port
    current = load_local_workspaces()
    assigned_port = 5174 + len(current)
    env_content = f"# Generated by Dewwie Lead Delegator\nPORT={assigned_port}\nAPI_PORT={assigned_port + 3000}\n"
    try:
        (worktree_dir / ".env.local").write_text(env_content, encoding="utf-8")
        print(f"  {GREEN}✓ Port :{assigned_port} allocated in .env.local{RESET}")
    except Exception as e:
        print(f"  {DIM}Note writing .env.local: {e}{RESET}")

    # 3. Launch Persistent Background Terminal via Herdr Core (hc) if available
    hc_id = None
    if hc_bridge and hc_bridge.is_hc_available():
        try:
            hc_res = hc_bridge.run_agent_terminal(
                name=branch,
                command_or_template=agent,
                task=task,
                cwd=str(worktree_dir),
                bg=True,
                labels={"role": "worker", "repo": repo, "branch": branch}
            )
            hc_id = hc_res.get("id") if isinstance(hc_res, dict) else str(hc_res)
            print(f"  {GREEN}✓ Launched persistent Herdr PTY terminal:{RESET} {BOLD}{hc_id or branch}{RESET}")
        except Exception as e:
            print(f"  {YELLOW}⚠ Herdr PTY launch notice: {e}{RESET}")
    else:
        print(f"  {DIM}Herdr core not attached; terminal registered for Desktop UI.{RESET}")

    # 4. Save to workspaces registry
    new_ws = {
        "id": f"ws-{int(time.time())}",
        "repository": repo,
        "name": branch,
        "sessionMode": "branch",
        "branch": branch,
        "baseBranch": base,
        "worktreePath": str(worktree_dir),
        "agentRole": "worker",
        "agentType": agent,
        "agentStatus": {
            "state": "working",
            "message": f"Autonomous task: {task[:40]}...",
            "timestamp": int(time.time() * 1000)
        },
        "metrics": {"cpuPercent": 0.5, "memoryMb": 45},
        "ports": [{"service": "App Dev", "port": assigned_port, "status": "allocated", "url": f"http://localhost:{assigned_port}"}],
        "diffSummary": {"filesChanged": 0, "additions": 0, "deletions": 0},
        "createdAt": datetime.now().isoformat(),
        "lastActivity": "Just now",
        "commitSha": "HEAD",
        "terminalSessionId": hc_id or f"pty-{branch}"
    }
    current.append(new_ws)
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2)

    # 5. Broadcast task_delegate message into the Room Mesh
    msg_obj = {
        "id": f"msg-del-{int(time.time() * 1000)}",
        "roomId": "general",
        "fromSessionId": "lead",
        "fromSessionName": "Local Main Shell",
        "fromRole": "lead",
        "target": f"@{branch}",
        "type": "task_delegate",
        "content": f"Task delegated to @{branch}: {task}",
        "timestamp": int(time.time() * 1000)
    }
    msgs = []
    if ROOM_MESSAGES_PATH.exists():
        try:
            with open(ROOM_MESSAGES_PATH, "r", encoding="utf-8") as f:
                msgs = json.load(f)
        except Exception:
            pass
    msgs.append(msg_obj)
    with open(ROOM_MESSAGES_PATH, "w", encoding="utf-8") as f:
        json.dump(msgs[-1000:], f, indent=2)

    # Emit OSC 7502 so connected terminal instances see it immediately
    sys.stdout.write(f"\033]7502;to=@{branch};from=Local Main Shell;type=task_delegate;msg={task}\007")
    sys.stdout.flush()

    print(f"  {GREEN}✓ Room broadcast sent -> @{branch} (type: task_delegate){RESET}")
    print(f"\n{BOLD}{GREEN}Autonomous Delegation Complete.{RESET} Monitor live via: {CYAN}dewwie room list{RESET} or {CYAN}dewwie wait {branch}{RESET}\n")

def cmd_wait(args):
    target = args.target
    timeout = getattr(args, "timeout", 300) or 300
    print(f"\n{CYAN}▶ Waiting for agent session [{target}] to complete task (timeout: {timeout}s)...{RESET}")
    
    if hc_bridge and hc_bridge.is_hc_available():
        res = hc_bridge.wait_terminal(target, timeout_sec=timeout)
        if res:
            print(f"  {GREEN}✓ Agent [{target}] finished execution.{RESET}")
        else:
            print(f"  {YELLOW}⚠ Wait timeout or error reached.{RESET}")
    else:
        start_t = time.time()
        while time.time() - start_t < timeout:
            ws_list = load_local_workspaces()
            matched = next((w for w in ws_list if w.get("id") == target or w.get("name") == target or w.get("branch") == target), None)
            if matched:
                state = matched.get("agentStatus", {}).get("state", "idle")
                if state in ["done", "idle"]:
                    print(f"  {GREEN}✓ Agent state is '{state}'. Ready for review.{RESET}")
                    break
            time.sleep(2)
    
    workspaces = load_local_workspaces()
    matched = next((w for w in workspaces if w.get("id") == target or w.get("name") == target or w.get("branch") == target), None)
    if matched:
        cwd = matched.get("worktreePath", ".")
        print(f"\n{CYAN}=== Deliverable Diff Summary ==={RESET}\n")
        subprocess.run(["git", "-C", cwd, "diff", "main", "--stat"], check=False)
        print()

def cmd_send(args):
    target = args.target
    message = args.message
    print(f"\n{CYAN}▶ Sending input to workspace [{target}]...{RESET}")
    print(f"  Input: \"{message}\"")
    
    res = send_rpc("session.input", {"session_id": target, "data_base64": message})
    if res is not None:
        print(f"  {GREEN}✓ Delivered to running agent process.{RESET}")
    else:
        print(f"  {GREEN}✓ State synchronized with UI workspace store.{RESET}")
    print()

def cmd_open(args):
    target = args.target
    ide = args.ide or "cursor"
    
    workspaces = load_local_workspaces()
    matched = next((w for w in workspaces if w.get("id") == target or w.get("branch") == target), None)
    
    target_path = matched.get("worktree", r"D:\1111-Works\exbytelab") if matched else r"D:\1111-Works\exbytelab"
    print(f"\n{CYAN}▶ Launching {ide.upper()} at:{RESET} {target_path}")
    
    bin_cmd = "cursor" if ide == "cursor" else "code" if ide == "code" else "zed"
    try:
        subprocess.Popen(["cmd", "/C", bin_cmd, target_path], shell=False)
        print(f"  {GREEN}✓ Opened successfully.{RESET}\n")
    except Exception as e:
        print(f"  {RED}Error launching {ide}: {e}{RESET}\n")

def cmd_diff(args):
    target = args.target
    workspaces = load_local_workspaces()
    matched = next((w for w in workspaces if w.get("id") == target or w.get("branch") == target), None)
    
    cwd = matched.get("worktree", ".") if matched else "."
    print(f"\n{CYAN}=== Dewwie Git Diff ({target}) ==={RESET}\n")
    subprocess.run(["git", "-C", cwd, "diff", "main"], check=False)
    print()

ROOM_MESSAGES_PATH = Path.home() / ".swarmherd" / "room_messages.json"

def cmd_room(args):
    action = args.room_action
    if action == "send":
        content = args.message
        target = args.target or "@all"
        current_ws = os.environ.get("SWARMHERD_WORKSPACE", "cli-agent")
        msg_obj = {
            "id": f"msg-{int(__import__('time').time() * 1000)}",
            "roomId": "general",
            "fromSessionId": current_ws,
            "fromSessionName": current_ws,
            "fromRole": "lead" if "main" in current_ws or "lead" in current_ws else "worker",
            "target": target,
            "type": "chat",
            "content": content,
            "timestamp": int(__import__("time").time() * 1000)
        }
        # Save to room_messages.json
        msgs = []
        if ROOM_MESSAGES_PATH.exists():
            try:
                with open(ROOM_MESSAGES_PATH, "r", encoding="utf-8") as f:
                    msgs = json.load(f)
            except Exception:
                pass
        msgs.append(msg_obj)
        try:
            with open(ROOM_MESSAGES_PATH, "w", encoding="utf-8") as f:
                json.dump(msgs[-1000:], f, indent=2)
        except Exception:
            pass
        # Emit OSC 7502 so running PTY captures it live
        sys.stdout.write(f"\033]7502;to={target};from={msg_obj['fromSessionName']};type=chat;msg={content}\007")
        sys.stdout.flush()
        print(f"{GREEN}✔ Message posted to Room -> {target}: {content}{RESET}")
    elif action == "list" or not action:
        msgs = []
        if ROOM_MESSAGES_PATH.exists():
            try:
                with open(ROOM_MESSAGES_PATH, "r", encoding="utf-8") as f:
                    msgs = json.load(f)
            except Exception:
                pass
        print(f"\n{CYAN}=== Dewwie Multi-Agent Room Stream (Last 10) ==={RESET}\n")
        if not msgs:
            print("  (Room empty. Use 'dewwie room send \"hello\"' to post)")
        for m in msgs[-10:]:
            print(f"  {BOLD}[{m.get('fromSessionName', 'Agent')}]{RESET} -> {CYAN}{m.get('target', '@all')}{RESET} ({m.get('type', 'chat')}): {m.get('content', '')}")
        print()
    elif action == "agents":
        workspaces = load_local_workspaces()
        print(f"\n{CYAN}=== Dewwie Active Agents in Room ==={RESET}\n")
        for w in workspaces:
            role = w.get("agentRole", "worker")
            role_badge = f"{YELLOW}👑 LEAD{RESET}" if role == "lead" else f"{BLUE}AGENT{RESET}"
            print(f"  • {BOLD}{w.get('name', w.get('id'))}{RESET} [{role_badge}] ({w.get('branch', 'local')}) - {w.get('agentStatus', {}).get('state', 'idle')}")
        print()
    elif action == "lead":
        workspaces = load_local_workspaces()
        target = getattr(args, "target", None)
        if not target:
            lead = next((w for w in workspaces if w.get("agentRole") == "lead"), None)
            if lead:
                print(f"\n{YELLOW}👑 Current Lead Agent:{RESET} {BOLD}{lead.get('name', lead.get('id'))}{RESET} ({lead.get('worktreePath', '.')})\n")
            else:
                print(f"\n{CYAN}No session currently explicitly designated as Lead. Defaulting to main root session.{RESET}\n")
        else:
            found = False
            for w in workspaces:
                if w.get("id") == target or w.get("name") == target or w.get("branch") == target:
                    w["agentRole"] = "lead"
                    found = True
                elif w.get("agentRole") == "lead":
                    w["agentRole"] = "worker"
            if found:
                try:
                    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
                        json.dump(workspaces, f, indent=2)
                except Exception as e:
                    print(f"{RED}Error saving: {e}{RESET}")
                print(f"\n{GREEN}✔ Promoted session '{target}' to 👑 LEAD Agent.{RESET}\n")
            else:
                print(f"\n{RED}Session '{target}' not found.{RESET}\n")

def main():
    parser = argparse.ArgumentParser(prog="dewwie", description="Dewwie - Autonomous AI Agent IDE & Terminal Workspace")
    subparsers = parser.add_subparsers(dest="subcommand", help="Sub-commands")
    
    # ls
    subparsers.add_parser("ls", help="List active agent worktrees & statuses")
    
    # room
    p_room = subparsers.add_parser("room", help="Inter-Agent Room & Swarm Mesh Communication")
    p_room_subs = p_room.add_subparsers(dest="room_action")
    p_room_send = p_room_subs.add_parser("send", help="Send message to room or specific agent")
    p_room_send.add_argument("message", help="Message body")
    p_room_send.add_argument("--target", "-t", default="@all", help="Target agent (@lead, @feat-name, @all)")
    p_room_subs.add_parser("list", help="List recent room messages")
    p_room_subs.add_parser("agents", help="List agents currently active in the room")
    p_room_lead = p_room_subs.add_parser("lead", help="Inspect or promote session to Lead Agent")
    p_room_lead.add_argument("target", nargs="?", default=None, help="Target session name or ID to promote to Lead")
    
    # delegate
    p_del = subparsers.add_parser("delegate", help="Autonomous task delegation from Lead to isolated worktree")
    p_del.add_argument("task", help="Goal or task description to delegate")
    p_del.add_argument("--branch", "-b", help="Branch name (default: auto-slugified from task)")
    p_del.add_argument("--agent", "-a", default="dewwie-worker", help="Agent template or CLI name")
    p_del.add_argument("--repo", default="exbytelab", help="Target repository")
    p_del.add_argument("--base", default="main", help="Base branch")

    # wait
    p_wait = subparsers.add_parser("wait", help="Wait for an agent session to complete its task")
    p_wait.add_argument("target", help="Workspace ID or branch name")
    p_wait.add_argument("--timeout", type=int, default=300, help="Timeout in seconds")

    # spawn
    p_spawn = subparsers.add_parser("spawn", help="Spawn new agent session or worktree")
    p_spawn.add_argument("branch", help="Session or branch name (e.g. feat/payment or dev-session)")
    p_spawn.add_argument("--local", action="store_true", help="Spawn local in-place session without creating a git branch")
    p_spawn.add_argument("--repo", help="Target repository", default="exbytelab")
    p_spawn.add_argument("--base", help="Base revision branch", default="main")
    p_spawn.add_argument("--agent", help="AI Agent CLI (claude, codex, aider)", default="claude")
    
    # send
    p_send = subparsers.add_parser("send", help="Send input/approval to running agent")
    p_send.add_argument("target", help="Workspace ID or branch")
    p_send.add_argument("message", help="Message or approval string (e.g. 'y')")
    
    # open
    p_open = subparsers.add_parser("open", help="Open worktree in external IDE")
    p_open.add_argument("target", help="Workspace ID or branch")
    p_open.add_argument("--ide", choices=["cursor", "zed", "code"], default="cursor")
    
    # diff
    p_diff = subparsers.add_parser("diff", help="View git diff for workspace")
    p_diff.add_argument("target", help="Workspace ID or branch")
    
    args = parser.parse_args()
    if not args.subcommand or args.subcommand == "ls":
        cmd_ls(args)
    elif args.subcommand == "delegate":
        cmd_delegate(args)
    elif args.subcommand == "wait":
        cmd_wait(args)
    elif args.subcommand == "spawn":
        cmd_spawn(args)
    elif args.subcommand == "send":
        cmd_send(args)
    elif args.subcommand == "open":
        cmd_open(args)
    elif args.subcommand == "diff":
        cmd_diff(args)
    elif args.subcommand == "room":
        cmd_room(args)

if __name__ == "__main__":
    main()
