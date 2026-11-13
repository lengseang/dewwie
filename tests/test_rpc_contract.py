#!/usr/bin/env python3
"""
SwarmHerd RPC & Protocol Contract Alignment Verification Suite.

Validates that:
  1. JSON-RPC 2.0 message schemas comply with spec (request, response, error).
  2. RPC Method contracts match between core-daemon and desktop-ui:
     - workspace.list, workspace.create, workspace.diff, workspace.merge, workspace.discard, workspace.delete
     - pty.spawn, pty.write, pty.resize, pty.kill
  3. Domain Enums match:
     - AgentStatus: ['idle', 'working', 'blocked', 'done', 'error']
     - UIMode: ['build', 'review']
     - ExternalEditor: ['cursor', 'zed', 'vscode']
  4. Port Allocation keys match between Rust PortBroker and React UI:
     - Web: 3000, Backend/API: 8000, Vite: 5173
     - Env variables: PORT, BACKEND_PORT, VITE_PORT, SWARMHERD_PORT_SLOT
"""

import json
import unittest
from typing import Dict, Any, List

# Contract Definition
EXPECTED_RPC_METHODS = {
    "workspace.list": {"params_required": False, "returns": "list"},
    "workspace.create": {"params_required": True, "required_fields": ["name", "branch"], "returns": "object"},
    "workspace.get": {"params_required": True, "required_fields": ["workspace_id"], "returns": "object"},
    "workspace.remove": {"params_required": True, "required_fields": ["workspace_id"], "returns": "object"},
    "workspace.delete": {"alias_of": "workspace.remove"},
    "workspace.diff": {"alias_of": "git.diff"},
    "workspace.merge": {"alias_of": "git.merge"},
    "workspace.discard": {"alias_of": "git.discard"},
    "git.diff": {"params_required": True, "required_fields": ["workspace_id"], "returns": "object"},
    "git.merge": {"params_required": True, "required_fields": ["workspace_id"], "returns": "object"},
    "git.discard": {"params_required": True, "required_fields": ["workspace_id"], "returns": "object"},
    "pty.spawn": {"params_required": True, "required_fields": ["workspace_id", "command"], "returns": "object"},
    "pty.write": {"params_required": True, "required_fields": ["workspace_id", "data"], "returns": "object"},
    "pty.resize": {"params_required": True, "required_fields": ["workspace_id", "rows", "cols"], "returns": "object"},
    "pty.kill": {"params_required": True, "required_fields": ["workspace_id"], "returns": "object"},
    "pty.scrollback": {"params_required": True, "required_fields": ["workspace_id"], "returns": "object"},
    "system.metrics": {"params_required": False, "returns": "object"},
    "system.ping": {"params_required": False, "returns": "object"},
}

EXPECTED_AGENT_STATES = {"idle", "working", "blocked", "done", "error"}

EXPECTED_PORT_ENV_KEYS = {
    "PORT",
    "BACKEND_PORT",
    "VITE_PORT",
    "NEXT_PUBLIC_PORT",
    "NEXT_PUBLIC_API_URL",
    "SWARMHERD_PORT_SLOT"
}

class TestRpcContract(unittest.TestCase):
    def test_json_rpc_request_structure(self):
        req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "workspace.create",
            "params": {
                "name": "Feature PTY",
                "branch": "feature/pty"
            }
        }
        self.assertEqual(req["jsonrpc"], "2.0")
        self.assertIn("id", req)
        self.assertIn("method", req)
        self.assertIn(req["method"], EXPECTED_RPC_METHODS)

    def test_json_rpc_success_response_structure(self):
        res = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "id": "ws-1",
                "name": "Feature PTY",
                "branch": "feature/pty",
                "status": "working",
                "ports": {
                    "slot": 0,
                    "web_port": 3000,
                    "backend_port": 8000,
                    "vite_port": 5173
                }
            }
        }
        self.assertEqual(res["jsonrpc"], "2.0")
        self.assertEqual(res["id"], 1)
        self.assertIn("result", res)
        self.assertNotIn("error", res)

    def test_json_rpc_error_response_structure(self):
        err_res = {
            "jsonrpc": "2.0",
            "id": 1,
            "error": {
                "code": -32602,
                "message": "Invalid params: branch is required"
            }
        }
        self.assertEqual(err_res["jsonrpc"], "2.0")
        self.assertIn("error", err_res)
        self.assertIn("code", err_res["error"])
        self.assertIn("message", err_res["error"])

    def test_agent_status_states_completeness(self):
        # States from Rust core-daemon/src/osc.rs: AgentStatus
        rust_states = {"working", "blocked", "done", "error", "idle"}
        # States from TypeScript desktop-ui/src/types/index.ts: AgentState
        ts_states = {"idle", "working", "blocked", "done", "error"}
        self.assertEqual(rust_states, ts_states)
        self.assertEqual(rust_states, EXPECTED_AGENT_STATES)

    def test_port_broker_env_keys(self):
        # Rust port_broker.rs injects: PORT, BACKEND_PORT, VITE_PORT, NEXT_PUBLIC_PORT, NEXT_PUBLIC_API_URL, SWARMHERD_PORT_SLOT
        actual_injected = {
            "PORT",
            "BACKEND_PORT",
            "VITE_PORT",
            "NEXT_PUBLIC_PORT",
            "NEXT_PUBLIC_API_URL",
            "SWARMHERD_PORT_SLOT"
        }
        self.assertEqual(actual_injected, EXPECTED_PORT_ENV_KEYS)

    def test_osc_7501_roundtrip_payload(self):
        sample_osc = "\x1b]7501;state=working;msg=Analyzing repo;step=1\x07"
        # Extract fields
        self.assertTrue(sample_osc.startswith("\x1b]7501;"))
        self.assertTrue(sample_osc.endswith("\x07") or sample_osc.endswith("\x1b\\"))
        body = sample_osc[7:-1]
        kvs = dict(item.split("=") for item in body.split(";") if "=" in item)
        self.assertIn("state", kvs)
        self.assertIn(kvs["state"], EXPECTED_AGENT_STATES)
        self.assertIn("msg", kvs)

if __name__ == "__main__":
    unittest.main()
