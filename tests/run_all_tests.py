#!/usr/bin/env python3
"""
SwarmHerd Master Verification Runner.

Runs all test suites:
  1. Git Worktree Lifecycle Suite (test_worktree.py)
  2. OSC 7501 Escape Sequence Parser Suite (test_osc_parser.py)
  3. TCP Port Broker & Collision Suite (test_port_broker.py)
  4. JSON-RPC Protocol & Contract Alignment Suite (test_rpc_contract.py)
  5. Mock Agent Execution Verification (mock_agent.py --scenario quick)

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

SUITES = [
    ("OSC 7501 Parser Suite", ["python", str(TESTS_DIR / "test_osc_parser.py")]),
    ("TCP Port Broker Suite", ["python", str(TESTS_DIR / "test_port_broker.py")]),
    ("RPC & Protocol Contract Suite", ["python", str(TESTS_DIR / "test_rpc_contract.py")]),
    ("Mock Agent Simulation", ["python", str(TESTS_DIR / "mock_agent.py"), "--scenario", "quick"]),
    ("Git Worktree Lifecycle Suite", ["python", str(TESTS_DIR / "test_worktree.py")]),
    ("Inter-Agent Room & Mesh Persistence", ["python", str(TESTS_DIR / "test_room_mesh.py")]),
    ("Herdr Core (hc) Bridge Suite", ["python", str(TESTS_DIR / "test_hc_bridge.py")]),
    ("Autonomous Lead Delegation Loop", ["python", str(TESTS_DIR / "test_delegation_loop.py")]),
    ("Comprehensive E2E Scenarios (A-E)", ["python", str(TESTS_DIR / "e2e_scenarios.py")]),
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
