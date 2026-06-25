#!/usr/bin/env bash
# Bidirectional SessionMem team sync: DGX <-> Surface via .sessionmem-team/
# Run ON DGX after coding sessions (or from cron). Safe to re-run.
#
# What it does:
#   1. sessionmem sync on DGX (writes ~/.sessionmem + team folder)
#   2. Push .sessionmem-team/ to Surface
#   3. sessionmem sync on Surface (merges teammate snapshots)
#   4. Pull .sessionmem-team/ back to DGX
#   5. sessionmem sync on DGX again (merge Surface memories)
#
# Usage (on DGX):
#   bash scripts/sync-sessionmem-team.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SURFACE_SSH="${SURFACE_SSH:-Surface-PC-Tailscale}"
SURFACE_ROOT="${SURFACE_ROOT:-C:/Users/alfao/Documents/GitHub/CharacterStudio}"
TEAM_DIR="${ROOT}/.sessionmem-team"

export PATH="${HOME}/.nvm/versions/node/v22.22.2/bin:${HOME}/.local/bin:${PATH}"

if ! command -v sessionmem >/dev/null 2>&1; then
  echo "ERROR: sessionmem not installed. Run: npm install -g sessionmem"
  exit 1
fi

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SURFACE_SSH" "echo ok" 2>/dev/null; then
  echo "ERROR: Cannot SSH to $SURFACE_SSH"
  echo "On Surface run: .\\scripts\\allow-dgx-ssh-to-surface.ps1"
  exit 1
fi

mkdir -p "$TEAM_DIR"

echo "=== SessionMem team sync (DGX <-> Surface) ==="
echo "DGX repo:  $ROOT"
echo "Surface:   ${SURFACE_SSH}:${SURFACE_ROOT}"
echo ""

echo "[1/5] DGX sessionmem sync ..."
sessionmem sync

echo "[2/5] Push .sessionmem-team/ -> Surface ..."
win_team="${SURFACE_ROOT}/.sessionmem-team"
win_team_ps="$(printf '%s' "$win_team" | tr '/' '\\')"
ssh "$SURFACE_SSH" "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '${win_team_ps}' | Out-Null\""
scp -r "${TEAM_DIR}/." "${SURFACE_SSH}:${SURFACE_ROOT}/.sessionmem-team/"

echo "[3/5] Surface sessionmem sync ..."
ssh "$SURFACE_SSH" "powershell -NoProfile -Command \"\$env:Path = 'C:\\Users\\alfao\\.local\\bin;' + \$env:Path; cd 'C:\\Users\\alfao\\Documents\\GitHub\\CharacterStudio'; sessionmem sync\""

echo "[4/5] Pull .sessionmem-team/ <- Surface ..."
scp -r "${SURFACE_SSH}:${SURFACE_ROOT}/.sessionmem-team/." "${TEAM_DIR}/"

echo "[5/5] DGX sessionmem sync (merge Surface) ..."
sessionmem sync

echo ""
echo "Done. Team folder: $TEAM_DIR"
sessionmem team status
