#!/usr/bin/env python3
"""
Smoke Suite: does the shipped Electron app actually boot?
Nothing else in this repo loads main.cjs, which is how v0.1.18 shipped with a SyntaxError and every suite green.

  1. `node --check` on every electron/*.cjs file.
  2. Launch the real app (desktop-ui/, loading the built dist/) with DEWWIE_SMOKE_TEST=1 in a sandboxed
     HOME/APPDATA (own single-instance lock and own ~/.swarmherd, so it never touches the user's running app or
     state), and require the main process to print `DEWWIE_SMOKE OK` (window loaded + React rendered) in time.

Usage: python tests/smoke_electron.py [app_dir]   (app_dir defaults to desktop-ui; used to test broken copies)
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

UI = Path(__file__).resolve().parent.parent / "desktop-ui"
TIMEOUT_S = 45


def fail(msg: str) -> int:
    print(f"[FAIL] {msg}")
    return 1


def main(app_dir: Path) -> int:
    electron_files = sorted((app_dir / "electron").glob("*.cjs"))
    for f in electron_files:
        r = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True)
        if r.returncode != 0:
            return fail(f"node --check {f.name}:\n{(r.stderr or r.stdout).strip()[:600]}")
    print(f"[OK] node --check {len(electron_files)} electron/*.cjs files")

    if not (app_dir / "dist" / "index.html").exists():
        return fail("dist/index.html missing (run `npm run build` in desktop-ui first)")

    electron_bin = subprocess.run(["node", "-e", "process.stdout.write(require('electron'))"],
                                  cwd=UI, capture_output=True, text=True).stdout.strip()
    if not electron_bin or not Path(electron_bin).exists():
        return fail("electron binary not found (npm install in desktop-ui)")

    home = Path(tempfile.mkdtemp(prefix="dewwie_smoke_home_"))
    # The AppData dirs must exist, otherwise Electron falls back to the real profile (and the user's instance lock).
    for sub in ("AppData/Roaming", "AppData/Local"):
        (home / sub).mkdir(parents=True, exist_ok=True)
    try:
        env = dict(os.environ, DEWWIE_SMOKE_TEST="1", USERPROFILE=str(home), HOME=str(home),
                   APPDATA=str(home / "AppData" / "Roaming"), LOCALAPPDATA=str(home / "AppData" / "Local"),
                   ELECTRON_ENABLE_LOGGING="1")
        try:
            r = subprocess.run([electron_bin, "."], cwd=app_dir, env=env, capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=TIMEOUT_S)
            out = (r.stdout or "") + (r.stderr or "")
            code = r.returncode
        except subprocess.TimeoutExpired as e:
            out = ((e.stdout or b"").decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")) + \
                  ((e.stderr or b"").decode("utf-8", "replace") if isinstance(e.stderr, bytes) else (e.stderr or ""))
            code = "timeout"
        ok_line = next((l for l in out.splitlines() if "DEWWIE_SMOKE" in l), None)
        if code == 0 and ok_line and "DEWWIE_SMOKE OK" in ok_line:
            print(f"[OK] app booted in sandbox: {ok_line.strip()}")
            return 0
        tail = "\n".join(l for l in out.splitlines() if l.strip())[-1200:]
        return fail(f"app did not boot (exit={code}, marker={ok_line!r})\n{tail}")
    finally:
        shutil.rmtree(home, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else UI))
