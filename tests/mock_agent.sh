#!/usr/bin/env bash
# SwarmHerd Mock Agent Simulator (Bash version)
set -euo pipefail

USE_BEL=true
DELAY=1

emit_osc() {
  local state="$1"
  local msg="$2"
  if [ "$USE_BEL" = true ]; then
    printf "\033]7501;state=%s;msg=%s\007" "$state" "$msg"
  else
    printf "\033]7501;state=%s;msg=%s\033\\" "$state" "$msg"
  fi
}

echo "=== SwarmHerd Mock Agent Initialized ==="
sleep "$DELAY"

emit_osc "working" "Analyzing repo"
echo "[1/3] Analyzing repo..."
sleep "$DELAY"

emit_osc "blocked" "Needs human approval"
echo "[2/3] Needs human approval..."
sleep "$DELAY"

emit_osc "done" "All 12 tests passed"
echo "[3/3] All 12 tests passed!"
