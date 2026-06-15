#!/usr/bin/env bash
# DGX src/ edit lock — prevents Surface sync-to-dgx from overwriting in-flight DGX work.
#
# Usage (on DGX, from repo root):
#   bash scripts/sync-lock-utils.sh lock "optional message"
#   bash scripts/sync-lock-utils.sh unlock
#   bash scripts/sync-lock-utils.sh status
#
# Surface sync-to-dgx.ps1 checks .sync-lock-dgx before pushing any src/ path.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="${ROOT}/.sync-lock-dgx"

cmd="${1:-status}"
msg="${2:-DGX editing src/}"

case "$cmd" in
  lock)
    printf '%s\npid=%s\n%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" "$msg" >"$LOCK"
    echo "Locked: $LOCK"
    ;;
  unlock)
    rm -f "$LOCK"
    echo "Unlocked: $LOCK"
    ;;
  status)
    if [[ -f "$LOCK" ]]; then
      echo "LOCKED:"
      cat "$LOCK"
      exit 0
    fi
    echo "No lock ($LOCK)"
    ;;
  *)
    echo "Usage: $0 {lock|unlock|status} [message]"
    exit 1
    ;;
esac
