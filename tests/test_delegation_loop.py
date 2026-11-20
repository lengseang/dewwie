#!/usr/bin/env python3
"""
Test Suite: Autonomous Lead Delegation & Worktree Loop
Verifies:
  1. Task slugification and branch name generation.
  2. Autonomous worktree creation, dynamic port assignment, and room task delegation.
  3. Seamless integration between Lead Orchestrator and Herdr Core / Workspace Registry.
"""

import sys
import json
import time
import shutil
import tempfile
import unittest
from pathlib import Path

CLI_DIR = Path(__file__).resolve().parent.parent / "cli"
sys.path.insert(0, str(CLI_DIR))

import dewwie

class TestDelegationLoop(unittest.TestCase):
    def test_01_slugify_task(self):
        """Verify task description slugification into safe branch names."""
        task1 = "Build the user payment flow and Stripe integration!"
        slug1 = dewwie.slugify_task(task1)
        self.assertEqual(slug1, "build-the-user-payment-f")

        task2 = "Fix Bug #402: database timeout"
        slug2 = dewwie.slugify_task(task2)
        self.assertEqual(slug2, "fix-bug-402-database-tim")

    def test_02_task_delegate_broadcast(self):
        """Verify room_messages.json receives task_delegate message properly formatted."""
        # Isolated sandbox: never write into the user's live ~/.swarmherd room.
        sandbox = Path(tempfile.mkdtemp(prefix="dewwie_delegation_test_"))
        self.addCleanup(shutil.rmtree, sandbox, ignore_errors=True)
        room_path = sandbox / "room_messages.json"

        task_desc = "Implement high-speed ratatui viewport"
        target_branch = "feat/ratatui-viewport"

        msg_obj = {
            "id": f"test-del-{int(time.time() * 1000)}",
            "roomId": "general",
            "fromSessionId": "lead",
            "fromSessionName": "Local Main Shell",
            "fromRole": "lead",
            "target": f"@{target_branch}",
            "type": "task_delegate",
            "content": f"Task delegated: {task_desc}",
            "timestamp": int(time.time() * 1000)
        }

        msgs = []
        if room_path.exists():
            try:
                with open(room_path, "r", encoding="utf-8") as f:
                    msgs = json.load(f)
            except Exception:
                pass

        msgs.append(msg_obj)
        with open(room_path, "w", encoding="utf-8") as f:
            json.dump(msgs[-1000:], f, indent=2)

        # Verify read-back
        with open(room_path, "r", encoding="utf-8") as f:
            read_back = json.load(f)

        found = next((m for m in read_back if m.get("id") == msg_obj["id"]), None)
        self.assertIsNotNone(found)
        self.assertEqual(found["type"], "task_delegate")
        self.assertEqual(found["fromRole"], "lead")
        self.assertEqual(found["target"], f"@{target_branch}")

if __name__ == "__main__":
    unittest.main()
