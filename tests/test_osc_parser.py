#!/usr/bin/env python3
r"""
SwarmHerd OSC 7501 Parser Unit Test Suite.

Verifies parser logic for extracting agent status sequences from terminal stdout:
  Format: \x1b]7501;state=<state>;msg=<message><TERM>
  Where <TERM> is BEL (\x07) or ST (\x1b\)
"""

import re
import sys
import unittest
from typing import List, Tuple, Optional

# Reference implementation of OSC 7501 parser matching the Rust & UI specs
OSC_REGEX = re.compile(r"\x1b\]7501;state=([a-zA-Z0-9_\-]+);msg=([^\x07\x1b]*)(?:\x07|\x1b\\)")

class OscEvent:
    def __init__(self, state: str, msg: str):
        self.state = state
        self.msg = msg

    def __repr__(self):
        return f"OscEvent(state='{self.state}', msg='{self.msg}')"

    def __eq__(self, other):
        return isinstance(other, OscEvent) and self.state == other.state and self.msg == other.msg

class OscStreamParser:
    """Stream parser that extracts OSC 7501 events and strips them from clean stdout."""
    def __init__(self):
        self.buffer = ""

    def feed(self, chunk: str) -> Tuple[str, List[OscEvent]]:
        self.buffer += chunk
        events = []
        clean_text_parts = []
        last_idx = 0

        for match in OSC_REGEX.finditer(self.buffer):
            # Text before the OSC match is clean terminal output
            clean_text_parts.append(self.buffer[last_idx:match.start()])
            state = match.group(1)
            msg = match.group(2)
            events.append(OscEvent(state=state, msg=msg))
            last_idx = match.end()

        # Keep any trailing unparsed partial sequence in buffer
        # Check if tail looks like the start of an escape sequence
        tail = self.buffer[last_idx:]
        esc_idx = tail.rfind("\x1b")
        if esc_idx != -1 and ("\x07" not in tail[esc_idx:] and "\x1b\\" not in tail[esc_idx:]):
            clean_text_parts.append(tail[:esc_idx])
            self.buffer = tail[esc_idx:]
        else:
            clean_text_parts.append(tail)
            self.buffer = ""

        return "".join(clean_text_parts), events

class TestOscParser(unittest.TestCase):
    def setUp(self):
        self.parser = OscStreamParser()

    def test_bel_terminated_osc(self):
        raw = "Starting process...\r\n\x1b]7501;state=working;msg=Analyzing repo\x07Line 2 output\r\n"
        clean, events = self.parser.feed(raw)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0], OscEvent("working", "Analyzing repo"))
        self.assertNotIn("\x1b]7501", clean)
        self.assertEqual(clean, "Starting process...\r\nLine 2 output\r\n")

    def test_st_terminated_osc(self):
        raw = "\x1b]7501;state=blocked;msg=Needs human approval\x1b\\Awaiting prompt:\n"
        clean, events = self.parser.feed(raw)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0], OscEvent("blocked", "Needs human approval"))
        self.assertEqual(clean, "Awaiting prompt:\n")

    def test_multiple_osc_in_single_chunk(self):
        raw = (
            "\x1b]7501;state=working;msg=Step 1\x07"
            "Build output log...\n"
            "\x1b]7501;state=working;msg=Step 2\x07"
            "\x1b]7501;state=done;msg=All 12 tests passed\x07"
        )
        clean, events = self.parser.feed(raw)
        self.assertEqual(len(events), 3)
        self.assertEqual(events[0], OscEvent("working", "Step 1"))
        self.assertEqual(events[1], OscEvent("working", "Step 2"))
        self.assertEqual(events[2], OscEvent("done", "All 12 tests passed"))
        self.assertEqual(clean, "Build output log...\n")

    def test_chunked_stream_split_across_escape(self):
        # First chunk ends mid-escape sequence
        chunk1 = "Compiling... \x1b]7501;state=wor"
        clean1, events1 = self.parser.feed(chunk1)
        self.assertEqual(events1, [])
        self.assertEqual(clean1, "Compiling... ")

        # Second chunk completes the sequence
        chunk2 = "king;msg=Compiling crate\x07Complete!\n"
        clean2, events2 = self.parser.feed(chunk2)
        self.assertEqual(len(events2), 1)
        self.assertEqual(events2[0], OscEvent("working", "Compiling crate"))
        self.assertEqual(clean2, "Complete!\n")

    def test_malformed_sequences_do_not_crash(self):
        # Missing state, or missing semicolon
        raw = "\x1b]7501;broken_sequence\x07Normal text\n"
        clean, events = self.parser.feed(raw)
        self.assertEqual(len(events), 0)
        self.assertIn("Normal text", clean)

    def test_all_agent_states(self):
        states = ["idle", "working", "blocked", "done", "error"]
        for st in states:
            raw = f"\x1b]7501;state={st};msg=Status test for {st}\x07"
            clean, events = self.parser.feed(raw)
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0].state, st)

if __name__ == "__main__":
    unittest.main()
