#!/usr/bin/env python3
"""
Dewwie Launcher Health and Startup Reliability Test Suite
Verifies binary availability, distribution assets, node_modules integrity,
and error handling configuration.
"""

import os
import sys
import subprocess
from pathlib import Path

def test_dewwie_launcher_binary():
    dewwie_root = Path("D:/1111-Works/Dewwie")
    exe_path = dewwie_root / "dewwie.exe"
    assert exe_path.exists(), f"dewwie.exe not found at {exe_path}"
    
    proc = subprocess.run(
        [str(exe_path), "--help"],
        capture_output=True,
        text=True,
        timeout=5,
        cwd=str(dewwie_root)
    )
    assert proc.returncode == 0, f"dewwie.exe --help returned {proc.returncode}"
    assert "Dewwie - Autonomous AI Agent IDE" in proc.stdout, "Unexpected help output from launcher"
    print("  [✓] dewwie.exe binary executable check passed")

def test_distribution_bundle_integrity():
    dist_index = Path("D:/1111-Works/Dewwie/desktop-ui/dist/index.html")
    assert dist_index.exists(), f"dist/index.html missing at {dist_index}"
    content = dist_index.read_text(encoding="utf-8")
    assert "Dewwie" in content or "<div id=\"root\">" in content, "Invalid dist/index.html contents"
    print("  [✓] desktop-ui/dist bundle integrity check passed")

def test_electron_runtime_available():
    electron_exe = Path("D:/1111-Works/Dewwie/desktop-ui/node_modules/electron/dist/electron.exe")
    assert electron_exe.exists(), f"Electron runtime binary missing at {electron_exe}"
    print("  [✓] Electron runtime binary exists")

def test_main_cjs_hardening():
    main_cjs = Path("D:/1111-Works/Dewwie/desktop-ui/electron/main.cjs")
    assert main_cjs.exists(), f"main.cjs missing at {main_cjs}"
    code = main_cjs.read_text(encoding="utf-8")
    assert "requestSingleInstanceLock" in code, "main.cjs missing single-instance lock"
    assert "uncaughtException" in code, "main.cjs missing uncaughtException logger"
    assert "workspacesCache" in code, "main.cjs missing in-memory workspaces cache"
    print("  [✓] main.cjs hardening (lock, logger, cache) verified")

def test_swarmherd_state_directory():
    swarmherd_dir = Path.home() / ".swarmherd"
    assert swarmherd_dir.exists(), f"~/.swarmherd directory does not exist at {swarmherd_dir}"
    test_file = swarmherd_dir / ".write_test"
    test_file.write_text("ok", encoding="utf-8")
    test_file.unlink()
    print("  [✓] ~/.swarmherd storage path is accessible and writable")

if __name__ == "__main__":
    print("\n========================================================")
    print("       DEWWIE LAUNCHER & STARTUP HEALTH TESTS           ")
    print("========================================================")
    try:
        test_dewwie_launcher_binary()
        test_distribution_bundle_integrity()
        test_electron_runtime_available()
        test_main_cjs_hardening()
        test_swarmherd_state_directory()
        print("\nAll launcher health tests passed successfully.\n")
        sys.exit(0)
    except AssertionError as e:
        print(f"\n[FAIL] {e}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}\n")
        sys.exit(1)
