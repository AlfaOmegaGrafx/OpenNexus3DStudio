#!/usr/bin/env bash
# Mirror DGX quick-reference docs to Surface Desktop (C:\Users\alfao\Desktop\DGX).
# Run ON DGX (needs SSH to Surface). Safe to run standalone after editing any listed source.
#
# Usage:
#   bash scripts/sync-cheatsheet-to-desktop.sh
#   SURFACE_SSH=Surface-PC bash scripts/sync-cheatsheet-to-desktop.sh
#
# Targets (override SURFACE_DESKTOP_DIR):
#   DGX Terminal Commands.md / .txt  <- docs/scripts-cheatsheet.md
#   XR_VOICE_COMMANDS.md           <- 3DAIGC-API/mcp/docs/XR_VOICE_COMMANDS.md

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHEATSHEET="${ROOT}/docs/scripts-cheatsheet.md"
XR_VOICE="${HOME}/3DAIGC-API/mcp/docs/XR_VOICE_COMMANDS.md"

SURFACE_SSH="${SURFACE_SSH:-Surface-PC-Tailscale}"
SURFACE_DESKTOP_DIR="${SURFACE_DESKTOP_DIR:-C:/Users/alfao/Desktop/DGX}"
MD_NAME="DGX Terminal Commands.md"
TXT_NAME="DGX Terminal Commands.txt"
XR_NAME="XR_VOICE_COMMANDS.md"
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

echo "=== DGX quick refs -> Surface Desktop ==="
echo "Target:  ${SURFACE_DESKTOP_DIR}/"
echo ""

scp "$CHEATSHEET" "${REMOTE_BASE}/${MD_NAME}"
echo "  OK ${MD_NAME}  (from docs/scripts-cheatsheet.md)"

scp "$CHEATSHEET" "${REMOTE_BASE}/${TXT_NAME}"
echo "  OK ${TXT_NAME}  (from docs/scripts-cheatsheet.md)"

if [[ -f "$XR_VOICE" ]]; then
  scp "$XR_VOICE" "${REMOTE_BASE}/${XR_NAME}"
  echo "  OK ${XR_NAME}  (from 3DAIGC-API/mcp/docs/)"
else
  echo "  SKIP ${XR_NAME}  (not found: $XR_VOICE)" >&2
fi

echo "Done."
