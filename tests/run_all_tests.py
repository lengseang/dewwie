#!/usr/bin/env python3
"""
SwarmHerd Master Verification Runner.

Runs every suite in SUITES below, starting with the ones that exercise shipped code:
  - Electron Boot Smoke Test (smoke_electron.py): the app must actually boot (needs `npm run build`)
  - Shipped JS Unit Tests: vitest over desktop-ui (electron/*.test.mjs + src store tests)
  - Shared State File IO: the shipped CLI's read/write helpers
  followed by the worktree, room-mesh, delegation and E2E scenario suites.

Provides clean colorized table reporting and non-zero exit codes on failure.
"""

import sys
import time
import subprocess
from typing import Dict, List, Tuple

# ANSI Colors
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

from pathlib import Path
TESTS_DIR = Path(__file__).resolve().parent
UI_DIR = TESTS_DIR.parent / "desktop-ui"

SUITES = [
    # Shipped code first. These replaced test_osc_parser.py / test_port_broker.py, which tested Python
    # re-implementations that nothing in the product used (the app could crash on boot with all suites green).
    ("Electron Boot Smoke Test (sandboxed)", ["python", str(TESTS_DIR / "smoke_electron.py")]),
    ("Shipped JS Unit Tests (vitest)", ["node", str(UI_DIR / "node_modules" / "vitest" / "vitest.mjs"), "run", "--root", str(UI_DIR)]),
    ("RPC & Protocol Contract Suite", ["python", str(TESTS_DIR / "test_rpc_contract.py")]),
    ("Mock Agent Simulation", ["python", str(TESTS_DIR / "mock_agent.py"), "--scenario", "quick"]),
    ("Git Worktree Lifecycle Suite", ["python", str(TESTS_DIR / "test_worktree.py")]),
    ("Inter-Agent Room & Mesh Persistence", ["python", str(TESTS_DIR / "test_room_mesh.py")]),
    ("Herdr Core (hc) Bridge Suite", ["python", str(TESTS_DIR / "test_hc_bridge.py")]),
    ("Autonomous Lead Delegation Loop", ["python", str(TESTS_DIR / "test_delegation_loop.py")]),
    ("Visual Delegation & Quality Gate", ["python", str(TESTS_DIR / "test_visual_delegation.py")]),
    ("Desktop Launcher Health & Reliability", ["python", str(TESTS_DIR / "test_launcher_health.py")]),
    ("Multi-Agent Mesh Protocol & Skill Sync", ["python", str(TESTS_DIR / "test_multiagent_mesh.py")]),
    ("Comprehensive E2E Scenarios (A-E)", ["python", str(TESTS_DIR / "e2e_scenarios.py")]),
    ("Shared State File IO (shipped CLI)", ["python", str(TESTS_DIR / "test_state_io.py")]),
]

def run_suite(name: str, cmd: List[str]) -> Tuple[bool, float, str]:
    start = time.time()
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    duration = time.time() - start
    passed = (res.returncode == 0)
    output = res.stdout if passed else (res.stdout + "\n" + res.stderr)
    return passed, duration, output.strip()

def main() -> int:
    print(f"\n{BOLD}{CYAN}======================================================================{RESET}")
    print(f"{BOLD}{CYAN}           DEWWIE END-TO-END VERIFICATION HARNESS                     {RESET}")
    print(f"{BOLD}{CYAN}======================================================================{RESET}\n")

    results = []
    total_start = time.time()

    for name, cmd in SUITES:
        sys.stdout.write(f"  → Running {BOLD}{name:<32}{RESET} ... ")
        sys.stdout.flush()
        passed, duration, out = run_suite(name, cmd)
        status = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
        print(f"[{status}]  ({duration:.2f}s)")
        results.append((name, passed, duration, out))

    total_duration = time.time() - total_start
    all_passed = all(r[1] for r in results)

    print(f"\n{BOLD}----------------------------------------------------------------------{RESET}")
    print(f"{BOLD}{'Test Suite':<36} | {'Status':<10} | {'Duration':<10}{RESET}")
    print(f"----------------------------------------------------------------------")
    for name, passed, duration, _ in results:
        status_str = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
        print(f"{name:<36} | {status_str:<19} | {duration:.2f}s")
    print(f"----------------------------------------------------------------------")
    print(f"Total Suites: {len(results)} | Passed: {sum(1 for r in results if r[1])} | Failed: {sum(1 for r in results if not r[1])} | Time: {total_duration:.2f}s\n")

    if all_passed:
        print(f"{BOLD}{GREEN}✓ ALL VERIFICATION SUITES PASSED SUCCESSFULLY.{RESET}\n")
        return 0
    else:
        print(f"{BOLD}{RED}✗ VERIFICATION FAILED. Review failed test suites above.{RESET}\n")
        for name, passed, _, out in results:
            if not passed:
                print(f"{BOLD}{RED}=== Failure Detail: {name} ==={RESET}\n{out}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
