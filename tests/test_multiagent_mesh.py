import os
import sys
import json
import tempfile
import io
import unittest
from pathlib import Path

# Add cli directory to sys.path
CLI_DIR = Path(__file__).resolve().parent.parent / "cli"
if str(CLI_DIR) not in sys.path:
    sys.path.insert(0, str(CLI_DIR))

import dewwie


class TestMultiAgentMesh(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.project_path = Path(self.test_dir.name)

    def tearDown(self):
        self.test_dir.cleanup()

    def test_mesh_sync_creates_all_protocols(self):
        """Test that dewwie mesh sync creates CLAUDE.md, .gemini rules, and dewwie skills."""
        class Args:
            dir = str(self.project_path)

        dewwie.cmd_mesh_sync(Args())

        dewwie_dir = self.project_path / ".dewwie"
        claude_md = self.project_path / "CLAUDE.md"
        gemini_rule = self.project_path / ".gemini" / "rules" / "dewwie_mesh.md"
        skill_md = dewwie_dir / "skills" / "dewwie-mesh" / "SKILL.md"
        env_ps1 = dewwie_dir / "dewwie_env.ps1"
        protocol_md = dewwie_dir / "ROOM_PROTOCOL.md"

        self.assertTrue(dewwie_dir.exists(), ".dewwie directory must exist")
        self.assertTrue(claude_md.exists(), "CLAUDE.md must be generated for Claude Code")
        self.assertTrue(gemini_rule.exists(), ".gemini/rules/dewwie_mesh.md must be generated for Antigravity")
        self.assertTrue(skill_md.exists(), "SKILL.md must be generated for universal agent skills")
        self.assertTrue(env_ps1.exists(), "dewwie_env.ps1 must exist")
        self.assertTrue(protocol_md.exists(), "ROOM_PROTOCOL.md must exist")

        # Verify contents contain room protocol
        claude_content = claude_md.read_text(encoding="utf-8")
        self.assertIn("Dewwie Multi-Agent Room Protocol", claude_content)
        self.assertIn("dewwie room send", claude_content)

        gemini_content = gemini_rule.read_text(encoding="utf-8")
        self.assertIn("Dewwie Multi-Agent Room Protocol", gemini_content)

    def test_status_command_emits_osc7501(self):
        """Test that dewwie status emits standard OSC 7501 sequence."""
        class Args:
            state = "working"
            message = "Refactoring auth system"

        buf = io.StringIO()
        old_stdout = sys.stdout
        try:
            sys.stdout = buf
            dewwie.cmd_status(Args())
            output = buf.getvalue()
        finally:
            sys.stdout = old_stdout

        self.assertIn("\033]7501;state=working;msg=Refactoring auth system\007", output)
        self.assertIn("✔ Agent Status Reported", output)

    def test_room_send_with_custom_types(self):
        """Test sending room messages with typed payloads: task_delegate, review_request."""
        temp_msg_path = self.project_path / "room_messages.json"
        old_path = dewwie.ROOM_MESSAGES_PATH
        dewwie.ROOM_MESSAGES_PATH = temp_msg_path

        try:
            class Args:
                room_action = "send"
                message = "Handoff to Antigravity for verification"
                target = "@antigravity"
                type = "task_delegate"

            dewwie.cmd_room(Args())

            self.assertTrue(temp_msg_path.exists())
            with open(temp_msg_path, "r", encoding="utf-8") as f:
                msgs = json.load(f)

            self.assertEqual(len(msgs), 1)
            msg = msgs[0]
            self.assertEqual(msg["target"], "@antigravity")
            self.assertEqual(msg["type"], "task_delegate")
            self.assertEqual(msg["content"], "Handoff to Antigravity for verification")
        finally:
            dewwie.ROOM_MESSAGES_PATH = old_path


if __name__ == "__main__":
    unittest.main()
