#!/usr/bin/env bash
# Mirror memory-bank/scripts-cheatsheet.md to Surface Desktop quick-reference files.
# Run ON DGX (needs SSH to Surface). Safe to run standalone after editing the cheatsheet.
#
# Usage:
#   bash scripts/sync-cheatsheet-to-desktop.sh
#   SURFACE_SSH=Surface-PC bash scripts/sync-cheatsheet-to-desktop.sh
#
# Targets (override SURFACE_DESKTOP_DIR):
#   C:/Users/alfao/Desktop/DGX/DGX Terminal Commands.md
#   C:/Users/alfao/Desktop/DGX/DGX Terminal Commands.txt

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHEATSHEET="${ROOT}/memory-bank/scripts-cheatsheet.md"

SURFACE_SSH="${SURFACE_SSH:-Surface-PC-Tailscale}"
SURFACE_DESKTOP_DIR="${SURFACE_DESKTOP_DIR:-C:/Users/alfao/Desktop/DGX}"
MD_NAME="DGX Terminal Commands.md"
TXT_NAME="DGX Terminal Commands.txt"
REMOTE_BASE="${SURFACE_SSH}:${SURFACE_DESKTOP_DIR}"

if [[ ! -f "$CHEATSHEET" ]]; then
  echo "ERROR: Cheatsheet not found: $CHEATSHEET" >&2
  exit 1
fi

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SURFACE_SSH" "echo ok" 2>/dev/null; then
  echo "ERROR: Cannot SSH to $SURFACE_SSH" >&2
  echo "On Surface run: .\\scripts\\allow-dgx-ssh-to-surface.ps1" >&2
  exit 1
fi

win_path() {
  printf '%s' "$1" | tr '/' '\\'
}

DESKTOP_WIN="$(win_path "$SURFACE_DESKTOP_DIR")"
ssh "$SURFACE_SSH" "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '${DESKTOP_WIN}' | Out-Null\""

echo "=== Cheatsheet -> Surface Desktop ==="
echo "Source:  $CHEATSHEET"
echo "Target:  ${SURFACE_DESKTOP_DIR}/"
echo ""

scp "$CHEATSHEET" "${REMOTE_BASE}/${MD_NAME}"
echo "  OK ${MD_NAME}"

scp "$CHEATSHEET" "${REMOTE_BASE}/${TXT_NAME}"
echo "  OK ${TXT_NAME}"

echo "Done."
