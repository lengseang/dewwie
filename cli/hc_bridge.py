#!/usr/bin/env python3
"""
Dewwie Herdr Core (hc) Bridge Module.
Provides programmatic integration between Dewwie Orchestrator and herdr-core (hc.exe),
enabling persistent background PTY sessions, agent template launching, and live terminal interaction.
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from typing import List, Dict, Optional, Any

# Primary search locations for hc.exe
DEFAULT_HC_PATHS = [
    Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "herdr-core" / "hc.exe",
    Path(os.environ.get("USERPROFILE", "")) / "AppData" / "Local" / "Programs" / "herdr-core" / "hc.exe",
    Path("C:/Users/BAMBOO/AppData/Local/Programs/herdr-core/hc.exe"),
]

def find_hc_binary() -> Optional[str]:
    """Locate the hc.exe binary on the host system."""
    for p in DEFAULT_HC_PATHS:
        if p.exists() and p.is_file():
            return str(p)
    which_path = shutil.which("hc")
    if which_path:
        return which_path
    return None

def is_hc_available() -> bool:
    """Check if hc.exe is installed and executable."""
    bin_path = find_hc_binary()
    if not bin_path:
        return False
    try:
        res = subprocess.run([bin_path, "--version"], capture_output=True, text=True, timeout=5)
        return res.returncode == 0
    except Exception:
        return False

def _run_hc_cmd(args: List[str], expect_json: bool = True) -> Any:
    """Internal helper to execute hc commands and parse output."""
    bin_path = find_hc_binary()
    if not bin_path:
        raise RuntimeError("herdr-core (hc.exe) binary not found on system.")

    full_cmd = [bin_path] + args
    res = subprocess.run(
        full_cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace"
    )

    if res.returncode != 0:
        raise RuntimeError(f"hc failed with code {res.returncode}: {res.stderr.strip() or res.stdout.strip()}")

    output = res.stdout.strip()
    if expect_json and output:
        try:
            return json.loads(output)
        except Exception:
            return output
    return output

def list_templates() -> List[Dict[str, Any]]:
    """List all registered templates from herdr-core."""
    try:
        res = _run_hc_cmd(["templates"], expect_json=True)
        if isinstance(res, dict) and "templates" in res:
            return res["templates"]
        return []
    except Exception:
        return []

def list_terminals(all_terminals: bool = True) -> List[Dict[str, Any]]:
    """List live/all terminals running under herdr-core."""
    args = ["ls"]
    if all_terminals:
        args.append("--all")
    try:
        res = _run_hc_cmd(args, expect_json=True)
        if isinstance(res, list):
            return res
        if isinstance(res, dict) and "terminals" in res:
            return res["terminals"]
        return []
    except Exception:
        return []

def get_terminal(target: str) -> Optional[Dict[str, Any]]:
    """Retrieve metadata and status for a specific terminal."""
    try:
        return _run_hc_cmd(["get", target], expect_json=True)
    except Exception:
        return None

def run_agent_terminal(
    name: str,
    command_or_template: str,
    task: Optional[str] = None,
    cwd: Optional[str] = None,
    bg: bool = True,
    labels: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Launch an interactive agent terminal in herdr-core that stays alive.
    Always uses --bg for autonomous agents.
    """
    args = ["run"]
    if bg:
        args.append("--bg")
    if name:
        args.extend(["--name", name])
    if cwd:
        args.extend(["--cwd", str(cwd)])
    
    args.append(command_or_template)
    if task:
        args.append(task)

    res = _run_hc_cmd(args, expect_json=True)

    if labels and isinstance(res, dict) and "id" in res:
        label_pairs = [f"{k}={v}" for k, v in labels.items()]
        try:
            _run_hc_cmd(["label", res["id"]] + label_pairs, expect_json=False)
        except Exception:
            pass

    return res if isinstance(res, dict) else {"raw": res}

def send_input(target: str, text: str) -> bool:
    """Deliver text or instructions into a running agent terminal."""
    try:
        _run_hc_cmd(["send", target, text], expect_json=False)
        return True
    except Exception:
        return False

def read_terminal_screen(target: str) -> str:
    """Read the current terminal screen buffer and history."""
    try:
        return _run_hc_cmd(["read", target], expect_json=False)
    except Exception as e:
        return f"Error reading terminal {target}: {e}"

def kill_terminal(target: str) -> bool:
    """Kill an active program inside herdr-core."""
    try:
        _run_hc_cmd(["kill", target], expect_json=False)
        return True
    except Exception:
        return False

def wait_terminal(target: str, timeout_sec: Optional[int] = 30) -> bool:
    """Wait for a running agent terminal to finish or become idle."""
    bin_path = find_hc_binary()
    if not bin_path:
        return False
    try:
        res = subprocess.run(
            [bin_path, "wait", target],
            capture_output=True,
            timeout=timeout_sec
        )
        return res.returncode == 0
    except Exception:
        return False
