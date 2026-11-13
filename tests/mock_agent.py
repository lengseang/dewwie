#!/usr/bin/env python3
"""
SwarmHerd Mock Agent Simulator.

Simulates an autonomous AI coding agent running in a PTY/terminal.
Emits OSC 7501 sequences to notify the SwarmHerd core daemon of agent state transitions:
  - working: Agent is executing steps or subagent tasks.
  - blocked: Agent requires human input/approval or external resources.
  - done: Agent has finished work successfully.
  - error: Agent encountered a fatal error.

OSC 7501 Specification:
  \x1b]7501;state=<state>;msg=<message>\x07
  (Terminated by BEL \x07 or ST \x1b\\)
"""

import sys
import time
import argparse

# ANSI color codes
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
MAGENTA = "\033[35m"
RED = "\033[31m"

def emit_osc(state: str, msg: str, use_bel: bool = True) -> None:
    """Emit an OSC 7501 escape sequence directly to stdout."""
    term = "\x07" if use_bel else "\x1b\\"
    sequence = f"\x1b]7501;state={state};msg={msg}{term}"
    sys.stdout.write(sequence)
    sys.stdout.flush()

def log(text: str) -> None:
    """Print log message with timestamp and flush immediately."""
    timestamp = time.strftime("%H:%M:%S")
    sys.stdout.write(f"{DIM}[{timestamp}]{RESET} {text}\n")
    sys.stdout.flush()

def run_standard_scenario(delay: float, interactive: bool) -> int:
    log(f"{BOLD}{CYAN}=== SwarmHerd Mock Agent Initialized ==={RESET}")
    log(f"{DIM}PID: {sys.argv[0]} | Mode: Autonomous Agent Loop{RESET}")
    time.sleep(delay * 0.5)

    # 1. State: working (Analyzing repository)
    emit_osc("working", "Analyzing repo")
    log(f"{BLUE}⚙ [1/4] Scanning repository AST and dependency graph...{RESET}")
    time.sleep(delay)
    log(f"      Found 48 source files, 12 test suites, 3 worktrees.")
    time.sleep(delay * 0.5)

    # 2. State: working (Generating code modifications)
    emit_osc("working", "Generating code modifications")
    log(f"{BLUE}⚙ [2/4] Synthesizing patch for task: 'Implement PTY session manager'...{RESET}")
    time.sleep(delay)
    log(f"      + Added src/pty.rs (184 lines)")
    log(f"      ~ Updated src/main.rs (+22, -4)")
    time.sleep(delay * 0.5)

    # 3. State: blocked (Waiting for human approval)
    emit_osc("blocked", "Needs human approval")
    log(f"{YELLOW}⚠ [3/4] Security Policy Gate: File modification requires user confirmation.{RESET}")
    log(f"{YELLOW}      Target: core-daemon/src/session_store.rs (destructive rollback){RESET}")

    if interactive:
        sys.stdout.write(f"{BOLD}Press ENTER to approve patch or Ctrl+C to abort: {RESET}")
        sys.stdout.flush()
        try:
            input()
            log(f"{GREEN}✓ Approval received from operator.{RESET}")
        except (KeyboardInterrupt, EOFError):
            emit_osc("error", "Aborted by user")
            log(f"\n{RED}✗ Operator aborted execution.{RESET}")
            return 1
    else:
        log(f"{DIM}(Non-interactive mode: Simulating 2s wait for approval...){RESET}")
        time.sleep(delay * 2)
        log(f"{GREEN}✓ Simulated auto-approval granted.{RESET}")

    # 4. State: working (Running verification tests)
    emit_osc("working", "Running cargo test")
    log(f"{BLUE}⚙ [4/4] Executing test suite in isolated git worktree...{RESET}")
    time.sleep(delay)
    log(f"      running 12 tests...")
    log(f"      test pty::test_pty_spawn ... {GREEN}ok{RESET}")
    log(f"      test osc::test_osc_parse ... {GREEN}ok{RESET}")
    log(f"      test worktree::test_branch_lifecycle ... {GREEN}ok{RESET}")
    log(f"      test port_broker::test_alloc ... {GREEN}ok{RESET}")
    time.sleep(delay * 0.5)

    # 5. State: done
    emit_osc("done", "All 12 tests passed")
    log(f"{BOLD}{GREEN}✓ Done: All 12 tests passed. Worktree ready for review/merge.{RESET}")
    return 0

def run_infinite_scenario(delay: float) -> int:
    log(f"{BOLD}{CYAN}=== SwarmHerd Mock Agent (Streaming Loop) ==={RESET}")
    step = 1
    states = [
        ("working", "Indexing code dependencies"),
        ("working", "Compiling Rust workspace"),
        ("working", "Running vitest suites"),
        ("blocked", "Waiting for remote API quota reset"),
        ("working", "Resuming agent synthesis"),
        ("done", "Cycle complete")
    ]
    try:
        while True:
            state, msg = states[(step - 1) % len(states)]
            emit_osc(state, f"{msg} (step {step})")
            log(f"[{state.upper()}] Step {step}: {msg}")
            time.sleep(delay)
            step += 1
    except KeyboardInterrupt:
        emit_osc("done", "Terminated by SIGINT")
        log(f"\n{YELLOW}Terminated cleanly.{RESET}")
        return 0

def run_fail_scenario(delay: float) -> int:
    log(f"{BOLD}{RED}=== SwarmHerd Mock Agent (Failing Scenario) ==={RESET}")
    emit_osc("working", "Building crate core-daemon")
    time.sleep(delay)
    log(f"{RED}error[E0425]: cannot find value `unresolved_symbol` in this scope{RESET}")
    time.sleep(delay * 0.5)
    emit_osc("error", "Build compilation failed with E0425")
    return 1

def main():
    parser = argparse.ArgumentParser(description="SwarmHerd Mock Agent for OSC 7501 parser verification")
    parser.add_argument("--scenario", choices=["standard", "infinite", "fail", "quick"], default="standard",
                        help="Scenario to run: standard, infinite, fail, quick")
    parser.add_argument("--delay", type=float, default=1.0, help="Base delay between actions (seconds)")
    parser.add_argument("--interactive", action="store_true", help="Prompt for actual user input at blocked state")
    parser.add_argument("--use-st", action="store_true", help="Use ST (\\x1b\\\\) instead of BEL (\\x07)")
    args = parser.parse_args()

    if args.scenario == "quick":
        emit_osc("working", "Analyzing repo", not args.use_st)
        emit_osc("blocked", "Needs human approval", not args.use_st)
        emit_osc("done", "All 12 tests passed", not args.use_st)
        return 0
    elif args.scenario == "fail":
        return run_fail_scenario(args.delay)
    elif args.scenario == "infinite":
        return run_infinite_scenario(args.delay)
    else:
        return run_standard_scenario(args.delay, args.interactive)

if __name__ == "__main__":
    sys.exit(main())
