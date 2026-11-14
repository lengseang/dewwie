#!/usr/bin/env python3
"""
Test Suite: Herdr Core (hc) Bridge Integration
Verifies:
  1. Detection and availability of hc.exe binary.
  2. Querying registered templates (including dewwie-lead, dewwie-worker, dewwie-reviewer).
  3. Terminal listing and query capabilities.
"""

import sys
import unittest
from pathlib import Path

# Add cli directory to sys.path
CLI_DIR = Path(__file__).resolve().parent.parent / "cli"
sys.path.insert(0, str(CLI_DIR))

import hc_bridge

class TestHcBridge(unittest.TestCase):
    def test_01_binary_detection(self):
        """Verify hc.exe binary can be located and is executable."""
        bin_path = hc_bridge.find_hc_binary()
        self.assertIsNotNone(bin_path, "hc.exe binary should be detected on this host")
        self.assertTrue(hc_bridge.is_hc_available(), "hc.exe should report available and executable")

    def test_02_templates_registration(self):
        """Verify registered Dewwie agent templates exist in herdr-core."""
        templates = hc_bridge.list_templates()
        template_names = [t.get("name") for t in templates]
        self.assertIn("dewwie-lead", template_names, "dewwie-lead template should be registered")
        self.assertIn("dewwie-worker", template_names, "dewwie-worker template should be registered")
        self.assertIn("dewwie-reviewer", template_names, "dewwie-reviewer template should be registered")

    def test_03_terminal_list(self):
        """Verify querying terminal listings runs without throwing exceptions."""
        terminals = hc_bridge.list_terminals(all_terminals=True)
        self.assertIsInstance(terminals, list, "list_terminals should return a list")

if __name__ == "__main__":
    unittest.main()
