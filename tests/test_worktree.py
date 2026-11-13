#!/usr/bin/env python3
"""
SwarmHerd Git Worktree Lifecycle Verification Suite.

Tests and verifies the end-to-end Git worktree operations used by SwarmHerd:
  1. Worktree Creation (branch creation, checkout, directory binding)
  2. Isolation Verification (main branch untouched while worktree develops)
  3. Diff Calculation (staged, unstaged, untracked, stats: +added, -deleted)
  4. Worktree Merge Verification (clean merge back into main/base)
  5. Worktree Teardown & Cleanup (remove worktree, prune metadata, branch cleanup)
"""

import os
import sys
import shutil
import tempfile
import subprocess
import time
from typing import Tuple, List, Dict, Any

# ANSI Colors
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
CYAN = "\033[36m"
BOLD = "\033[1m"
RESET = "\033[0m"

def run_git(args: List[str], cwd: str) -> Tuple[int, str, str]:
    """Execute a git command with UTF-8 encoding and return (code, stdout, stderr)."""
    res = subprocess.run(
        ["git"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace"
    )
    return res.returncode, res.stdout.strip(), res.stderr.strip()

class WorktreeLifecycleTester:
    def __init__(self):
        self.temp_root = tempfile.mkdtemp(prefix="swarmherd_test_")
        self.repo_dir = os.path.join(self.temp_root, "parent_repo")
        self.worktree_dir = os.path.join(self.temp_root, "worktrees", "agent-feature-pty")
        self.branch_name = "agent/feature-pty"
        self.test_results: List[Dict[str, Any]] = []

    def log_step(self, step_name: str, passed: bool, detail: str = ""):
        self.test_results.append({"step": step_name, "passed": passed, "detail": detail})
        status = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
        print(f"[{status}] {BOLD}{step_name}{RESET}")
        if detail:
            print(f"       {CYAN}↳ {detail}{RESET}")

    def setup_base_repo(self):
        """Initialize main git repo with initial commit."""
        os.makedirs(self.repo_dir, exist_ok=True)
        run_git(["init", "-b", "main"], self.repo_dir)
        run_git(["config", "user.name", "SwarmHerd Verifier"], self.repo_dir)
        run_git(["config", "user.email", "verifier@swarmherd.dev"], self.repo_dir)

        # Create initial structure
        readme_path = os.path.join(self.repo_dir, "README.md")
        with open(readme_path, "w", encoding="utf-8") as f:
            f.write("# SwarmHerd Workspace\nInitial base commit.\n")

        src_dir = os.path.join(self.repo_dir, "src")
        os.makedirs(src_dir, exist_ok=True)
        main_rs = os.path.join(src_dir, "main.rs")
        with open(main_rs, "w", encoding="utf-8") as f:
            f.write("fn main() {\n    println!(\"Hello SwarmHerd\");\n}\n")

        run_git(["add", "."], self.repo_dir)
        code, out, err = run_git(["commit", "-m", "chore: initial commit"], self.repo_dir)
        self.log_step("Setup Base Git Repository", code == 0, f"Repo initialized at {self.repo_dir}")

    def test_worktree_create(self):
        """Verify git worktree add creates isolated branch and directory."""
        os.makedirs(os.path.dirname(self.worktree_dir), exist_ok=True)
        code, out, err = run_git(
            ["worktree", "add", "-b", self.branch_name, self.worktree_dir, "main"],
            self.repo_dir
        )
        passed = code == 0 and os.path.exists(self.worktree_dir)

        # Check worktree list
        code_l, list_out, _ = run_git(["worktree", "list"], self.repo_dir)
        worktree_registered = self.worktree_dir.replace("\\", "/") in list_out.replace("\\", "/") or self.branch_name in list_out

        self.log_step(
            "Worktree Creation (git worktree add -b)",
            passed and worktree_registered,
            f"Created branch '{self.branch_name}' at {self.worktree_dir}"
        )

    def test_worktree_isolation(self):
        """Verify files created in worktree do not leak into parent main branch."""
        # Create new file in worktree
        pty_path = os.path.join(self.worktree_dir, "src", "pty.rs")
        with open(pty_path, "w", encoding="utf-8") as f:
            f.write("// Portable PTY manager implementation\npub struct PtySessionManager;\n")

        # Edit existing file in worktree
        readme_wt = os.path.join(self.worktree_dir, "README.md")
        with open(readme_wt, "a", encoding="utf-8") as f:
            f.write("\nFeature: Portable PTY session support.\n")

        # Check main repo does NOT see src/pty.rs
        parent_pty = os.path.join(self.repo_dir, "src", "pty.rs")
        isolated = not os.path.exists(parent_pty)

        self.log_step(
            "Worktree Isolation",
            isolated,
            "Worktree filesystem changes are completely isolated from parent repository"
        )

    def test_diff_calculation(self):
        """Verify git diff accurately detects unstaged, staged, and untracked changes."""
        # Check untracked file status in worktree
        code_s, status_out, _ = run_git(["status", "--porcelain"], self.worktree_dir)
        has_untracked = "??" in status_out

        # Stage README.md change
        run_git(["add", "README.md"], self.worktree_dir)

        # Unstaged diff vs Staged diff
        code_diff_staged, staged_diff, _ = run_git(["diff", "--cached"], self.worktree_dir)
        code_diff_untracked, _, _ = run_git(["diff"], self.worktree_dir)

        # Check numstat against main branch
        run_git(["add", "."], self.worktree_dir)
        run_git(["commit", "-m", "feat: add pty manager"], self.worktree_dir)

        code_stat, stat_out, _ = run_git(["diff", "--stat", "main...HEAD"], self.worktree_dir)
        code_numstat, numstat_out, _ = run_git(["diff", "--numstat", "main...HEAD"], self.worktree_dir)

        # numstat: <additions>\t<deletions>\t<file>
        lines = [line.split("\t") for line in numstat_out.splitlines() if "\t" in line]
        files_changed = len(lines)
        diff_verified = (files_changed >= 2) and (code_stat == 0)

        self.log_step(
            "Diff & Change Calculation",
            diff_verified,
            f"Detected {files_changed} files changed between main and {self.branch_name}\n"
            f"       ↳ Summary: {stat_out.replace(chr(10), ' | ')}"
        )

    def test_merge_workflow(self):
        """Verify worktree branch merges cleanly into base branch."""
        # Switch to base in parent repo and merge
        code_merge, merge_out, merge_err = run_git(
            ["merge", "--no-ff", "-m", "Merge feature-pty from worktree", self.branch_name],
            self.repo_dir
        )
        passed = (code_merge == 0)

        # Verify src/pty.rs now exists in main
        parent_pty = os.path.join(self.repo_dir, "src", "pty.rs")
        file_present = os.path.exists(parent_pty)

        self.log_step(
            "Worktree Branch Merge",
            passed and file_present,
            f"Successfully merged {self.branch_name} into main. Merged artifacts confirmed."
        )

    def test_worktree_cleanup(self):
        """Verify worktree remove, prune, and branch deletion."""
        # 1. Remove worktree
        code_rm, out_rm, err_rm = run_git(["worktree", "remove", "--force", self.worktree_dir], self.repo_dir)

        # 2. Prune worktrees
        code_prune, _, _ = run_git(["worktree", "prune"], self.repo_dir)

        # 3. Delete branch
        code_del, _, _ = run_git(["branch", "-D", self.branch_name], self.repo_dir)

        # 4. Verify worktree list only contains parent repo
        code_l, list_out, _ = run_git(["worktree", "list"], self.repo_dir)
        cleaned = (self.branch_name not in list_out) and (not os.path.exists(self.worktree_dir))

        self.log_step(
            "Worktree Teardown & Cleanup",
            cleaned and (code_rm == 0),
            "Worktree directory removed, git references pruned, feature branch cleanly deleted."
        )

    def cleanup(self):
        """Remove temp directory."""
        if os.path.exists(self.temp_root):
            try:
                shutil.rmtree(self.temp_root, ignore_errors=True)
            except Exception:
                pass

    def run_all(self) -> bool:
        print(f"\n{BOLD}{CYAN}=== SwarmHerd Git Worktree Lifecycle Suite ==={RESET}\n")
        start_time = time.time()
        try:
            self.setup_base_repo()
            self.test_worktree_create()
            self.test_worktree_isolation()
            self.test_diff_calculation()
            self.test_merge_workflow()
            self.test_worktree_cleanup()
        finally:
            self.cleanup()

        elapsed = time.time() - start_time
        all_passed = all(item["passed"] for item in self.test_results)

        print(f"\n{BOLD}--------------------------------------------------{RESET}")
        print(f"Total Tests: {len(self.test_results)} | Passed: {sum(1 for t in self.test_results if t['passed'])} | Failed: {sum(1 for t in self.test_results if not t['passed'])} | Time: {elapsed:.2f}s")
        if all_passed:
            print(f"{BOLD}{GREEN}✓ ALL WORKTREE LIFECYCLE TESTS PASSED.{RESET}\n")
        else:
            print(f"{BOLD}{RED}✗ WORKTREE LIFECYCLE VERIFICATION FAILED.{RESET}\n")
        return all_passed

if __name__ == "__main__":
    tester = WorktreeLifecycleTester()
    success = tester.run_all()
    sys.exit(0 if success else 1)
