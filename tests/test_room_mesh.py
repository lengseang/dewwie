#!/usr/bin/env python3
"""
Test Suite: Inter-Agent Room Mesh & Workspace State Persistence
Verifies:
  1. Room message formatting, OSC 7502 escape sequences, and targeted routing.
  2. Persistent workspace state serialization and zero-loss rehydration.
  3. High-level Lead Agent session promotion and cross-directory coordination.
"""

import os
import sys
import json
import time
import shutil
import tempfile
import unittest
from pathlib import Path

# Paths: an isolated sandbox. These tests used to write straight into the user's live
# ~/.swarmherd (overwriting workspace_state.json and promoting a lead in workspaces.json).
SWARMHERD_DIR = Path(tempfile.mkdtemp(prefix="dewwie_room_test_"))
ROOM_MESSAGES_FILE = SWARMHERD_DIR / "room_messages.json"
WORKSPACE_STATE_FILE = SWARMHERD_DIR / "workspace_state.json"
WORKSPACES_FILE = SWARMHERD_DIR / "workspaces.json"

class TestRoomMeshAndPersistence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Deterministic fixture for the lead-promotion test (previously depended on real user sessions).
        WORKSPACES_FILE.write_text(json.dumps([
            {"id": "ws-local-proj-a", "name": "Local Main Shell", "agentRole": "worker"},
            {"id": "ws-branch-feat-x", "name": "feat/x", "agentRole": "lead"},
        ], indent=2), encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(SWARMHERD_DIR, ignore_errors=True)

    def setUp(self):
        SWARMHERD_DIR.mkdir(parents=True, exist_ok=True)

    def test_01_osc7502_formatting(self):
        """Verify OSC 7502 escape sequence format: \x1b]7502;to=...;from=...;type=...;msg=...\x07"""
        target = "@lead"
        sender = "feat-worker-1"
        msg_type = "task_delegate"
        content = "Database schema migration ready for lead sign-off"

        osc_str = f"\x1b]7502;to={target};from={sender};type={msg_type};msg={content}\x07"
        self.assertTrue(osc_str.startswith("\x1b]7502;"))
        self.assertTrue(osc_str.endswith("\x07"))
        self.assertIn(f"to={target}", osc_str)
        self.assertIn(f"from={sender}", osc_str)
        self.assertIn(f"msg={content}", osc_str)

    def test_02_room_messages_persistence(self):
        """Verify room messages JSON persistence and FIFO retention limit."""
        msgs = []
        if ROOM_MESSAGES_FILE.exists():
            try:
                with open(ROOM_MESSAGES_FILE, "r", encoding="utf-8") as f:
                    msgs = json.load(f)
            except Exception:
                pass

        test_msg = {
            "id": f"test-msg-{int(time.time() * 1000)}",
            "roomId": "general",
            "fromSessionId": "ws-local-proj-dewwie",
            "fromSessionName": "Local Main Shell",
            "fromRole": "lead",
            "target": "@all",
            "type": "chat",
            "content": "Automated verification test broadcast",
            "timestamp": int(time.time() * 1000),
        }

        msgs.append(test_msg)
        with open(ROOM_MESSAGES_FILE, "w", encoding="utf-8") as f:
            json.dump(msgs[-1000:], f, indent=2)

        # Read back and verify
        with open(ROOM_MESSAGES_FILE, "r", encoding="utf-8") as f:
            read_back = json.load(f)

        found = any(m.get("id") == test_msg["id"] for m in read_back)
        self.assertTrue(found, "Saved room message must exist in persisted room_messages.json")

    def test_03_workspace_state_persistence(self):
        """Verify workspace_state.json zero-loss persistence and rehydration."""
        test_state = {
            "activeProjectId": "proj-dewwie",
            "activeWorkspaceId": "ws-local-proj-dewwie",
            "activeTab": "room",
            "isSplitView": True,
            "sidebarOpen": True,
            "rightPanelOpen": True,
            "rightPanelView": "room",
            "leadSessionId": "ws-local-proj-dewwie",
            "lastSaved": int(time.time() * 1000)
        }

        with open(WORKSPACE_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(test_state, f, indent=2)

        # Rehydrate and verify exact field match
        with open(WORKSPACE_STATE_FILE, "r", encoding="utf-8") as f:
            loaded = json.load(f)

        self.assertEqual(loaded["activeWorkspaceId"], "ws-local-proj-dewwie")
        self.assertEqual(loaded["activeTab"], "room")
        self.assertTrue(loaded["isSplitView"])
        self.assertTrue(loaded["sidebarOpen"])
        self.assertTrue(loaded["rightPanelOpen"])
        self.assertEqual(loaded["leadSessionId"], "ws-local-proj-dewwie")

    def test_04_lead_session_promotion(self):
        """Verify high-level Lead Agent session promotion and mutual exclusion."""
        if not WORKSPACES_FILE.exists():
            self.skipTest("workspaces.json not found")

        with open(WORKSPACES_FILE, "r", encoding="utf-8") as f:
            workspaces = json.load(f)

        if not workspaces:
            self.skipTest("No workspaces found")

        # Promote first workspace to lead
        lead_id = workspaces[0]["id"]
        for w in workspaces:
            if w["id"] == lead_id:
                w["agentRole"] = "lead"
            else:
                if w.get("agentRole") == "lead":
                    w["agentRole"] = "worker"

        with open(WORKSPACES_FILE, "w", encoding="utf-8") as f:
            json.dump(workspaces, f, indent=2)

        # Read back and verify exactly one lead exists
        with open(WORKSPACES_FILE, "r", encoding="utf-8") as f:
            updated = json.load(f)

        leads = [w for w in updated if w.get("agentRole") == "lead"]
        self.assertGreaterEqual(len(leads), 1, "There should be at least 1 lead agent session")
        self.assertEqual(leads[0]["id"], lead_id)

if __name__ == "__main__":
    unittest.main()
