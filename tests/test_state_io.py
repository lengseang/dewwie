#!/usr/bin/env python3
"""
Test Suite: shared state file IO used by the shipped CLI (cli/dewwie.py read_json_safe / write_json_atomic).
Imports the real CLI module (not a copy). Runs entirely in a temp dir; never touches ~/.swarmherd.
"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "cli"))
import dewwie  # noqa: E402


class TestStateIO(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="dewwie_state_io_"))
        self.file = self.dir / "workspaces.json"

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_roundtrip_bak_and_no_tmp_left(self):
        dewwie.write_json_atomic(self.file, [{"id": "a"}])
        dewwie.write_json_atomic(self.file, [{"id": "a"}, {"id": "b"}])
        self.assertEqual(dewwie.read_json_safe(self.file), [{"id": "a"}, {"id": "b"}])
        self.assertEqual(json.loads((self.dir / "workspaces.json.bak").read_text(encoding="utf-8")), [{"id": "a"}])
        self.assertEqual([p.name for p in self.dir.glob("*.tmp")], [])

    def test_torn_file_falls_back_to_bak(self):
        dewwie.write_json_atomic(self.file, [{"id": "keep-me"}])
        dewwie.write_json_atomic(self.file, [{"id": "keep-me"}, {"id": "newer"}])
        self.file.write_text('[{"id": "keep-me"}, {"id": "ne', encoding="utf-8")
        self.assertEqual(dewwie.read_json_safe(self.file), [{"id": "keep-me"}])

    def test_corrupt_file_is_moved_aside_not_destroyed(self):
        self.file.write_text("{ not json", encoding="utf-8")
        dewwie.write_json_atomic(self.file, [{"id": "fresh"}])
        aside = list(self.dir.glob("workspaces.json.corrupt-*"))
        self.assertEqual(len(aside), 1)
        self.assertEqual(aside[0].read_text(encoding="utf-8"), "{ not json")
        self.assertEqual(dewwie.read_json_safe(self.file), [{"id": "fresh"}])

    def test_unreadable_main_and_bak_raises(self):
        self.file.write_text("x", encoding="utf-8")
        (self.dir / "workspaces.json.bak").write_text("y", encoding="utf-8")
        with self.assertRaises(ValueError):
            dewwie.read_json_safe(self.file)

    def test_files_written_by_cli_are_readable_by_app_format(self):
        # Same on-disk format as jsonstore.cjs (indent=2 JSON) so either writer can read the other's files.
        dewwie.write_json_atomic(self.file, {"k": [1, 2]})
        self.assertEqual(json.loads(self.file.read_text(encoding="utf-8")), {"k": [1, 2]})


if __name__ == "__main__":
    unittest.main()
