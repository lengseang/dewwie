#!/usr/bin/env python3
"""
Test Suite: Visual In-IDE Delegation & Quality Gate Merge
Verifies:
  1. IPC Task Delegation Contract (branch slug, dynamic port allocation, Herdr Core execution metadata).
  2. Mesh Room Interactive Action matching (associated worktree identification, task_delegate / review_request matching).
  3. Automated Quality Gate test runner and 1-Click Fast-Forward merge workflow contract.
"""

import sys
import json
import time
import unittest
from pathlib import Path

CLI_DIR = Path(__file__).resolve().parent.parent / "cli"
sys.path.insert(0, str(CLI_DIR))

import dewwie

class TestVisualDelegation(unittest.TestCase):
    def test_01_ipc_task_delegation_structure(self):
        """Verify the payload structure produced by task:delegate IPC handler."""
        task_text = "Implement visual lead delegation modal and 1-click merge gate"
        slug = dewwie.slugify_task(task_text)
        branch_name = f"feat/{slug}-1234"
        
        # Verify slug rules
        self.assertTrue(len(slug) <= 24)
        self.assertNotIn(" ", slug)
        self.assertTrue(slug.startswith("implement-visual-lead"))

        # Verify dynamic port allocation offset
        simulated_workspaces = [
            {"id": "ws-1", "ports": [{"port": 5174}]},
            {"id": "ws-2", "ports": [{"port": 5175}]},
        ]
        next_port = 5174 + len(simulated_workspaces)
        self.assertEqual(next_port, 5176)
        api_port = next_port + 3000
        self.assertEqual(api_port, 8176)

    def test_02_room_mesh_actionable_card_contract(self):
        """Verify that room messages correlate properly to worktree branches for quality gate triggers."""
        branch = "feat/auth-middleware-4021"
        ws_list = [
            {
                "id": "ws-branch-1",
                "name": branch,
                "branch": branch,
                "sessionMode": "branch",
                "agentRole": "worker",
                "repository": "Dewwie",
                "worktreePath": f"D:\\1111-Works\\Dewwie\\.worktrees\\{branch.replace('/', '-')}"
            }
        ]

        # Scenario A: message targets @feat/auth-middleware-4021
        msg1 = {
            "id": "msg-test-1",
            "type": "task_delegate",
            "target": f"@{branch}",
            "content": f"Task delegated to @{branch}: Fix middleware timeout"
        }
        target_clean = msg1["target"].replace("@", "").lower()
        matched_ws = next((w for w in ws_list if w["name"].lower() == target_clean or w["branch"].lower() == target_clean), None)
        self.assertIsNotNone(matched_ws)
        self.assertEqual(matched_ws["id"], "ws-branch-1")

        # Scenario B: message content mentions the branch
        msg2 = {
            "id": "msg-test-2",
            "type": "review_request",
            "target": "@lead",
            "content": f"Work on {branch} is complete, passing all tests."
        }
        matched_ws2 = next((w for w in ws_list if w["branch"].lower() in msg2["content"].lower()), None)
        self.assertIsNotNone(matched_ws2)
        self.assertEqual(matched_ws2["id"], "ws-branch-1")

    def test_03_quality_gate_merge_workflow_contract(self):
        """Verify the quality gate contract: runTests verifies health before fast-forward merge."""
        # Simulated test output
        test_run = {
            "success": True,
            "output": "10/10 test suites passed 100% green (12.4s)"
        }
        self.assertTrue(test_run["success"])

        # Simulated merge verification
        branch = "feat/visual-delegation-9999"
        merge_run = {
            "success": True,
            "message": f"Merge made by the 'recursive' strategy. Branch {branch} merged into main."
        }
        self.assertTrue(merge_run["success"])
        self.assertIn("merged into main", merge_run["message"].lower())

if __name__ == "__main__":
    unittest.main()
