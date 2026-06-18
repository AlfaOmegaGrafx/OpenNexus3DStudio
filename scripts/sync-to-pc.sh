#!/usr/bin/env bash
# Push DGX-owned files to Surface (mirror of sync-from-dgx.ps1). Run ON DGX.
#
# Requires OpenSSH on Surface (port 22) and key auth for SURFACE_USER.
#
# Usage:
#   bash scripts/sync-to-pc.sh
#   bash scripts/sync-to-pc.sh --include-src
#   bash scripts/sync-to-pc.sh --include-agent-context
#   bash scripts/sync-to-pc.sh --include-src --include-agent-context
#   SURFACE_ROOT='C:/Users/alfao/Documents/GitHub/OpenNexus3DStudio' bash scripts/sync-to-pc.sh
#
# Default Surface path — override SURFACE_ROOT if your clone lives elsewhere.

set -euo pipefail

INCLUDE_SRC=0
INCLUDE_AGENT_CONTEXT=0
for arg in "$@"; do
  case "$arg" in
    --include-src) INCLUDE_SRC=1 ;;
    --include-agent-context) INCLUDE_AGENT_CONTEXT=1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SURFACE_SSH="${SURFACE_SSH:-Surface-PC-Tailscale}"
SURFACE_HOST="${SURFACE_HOST:-100.94.108.18}"
SURFACE_USER="${SURFACE_USER:-alfao}"
SURFACE_ROOT="${SURFACE_ROOT:-C:/Users/alfao/Documents/GitHub/OpenNexus3DStudio}"
REMOTE="${SURFACE_SSH}:${SURFACE_ROOT}"

echo "=== DGX -> Surface (DGX-owned only) ==="
echo "Target: $REMOTE"
echo ""

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SURFACE_SSH" "echo ok" 2>/dev/null; then
  echo "ERROR: Cannot SSH to $SURFACE_SSH (expected Host Surface-PC in ~/.ssh/config or ${SURFACE_USER}@${SURFACE_HOST}:22)"
  echo "On Surface run: .\\scripts\\allow-dgx-ssh-to-surface.ps1"
  echo "Or pull from DGX on Surface: .\\scripts\\sync-from-dgx.ps1"
  exit 1
fi

win_path() {
  printf '%s' "$1" | tr '/' '\\'
}

ensure_remote_dir() {
  local rel="$1"
  local win="${SURFACE_ROOT}/${rel}"
  win="$(win_path "$win")"
  ssh "$SURFACE_SSH" "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '${win}' | Out-Null\""
}

push_dir() {
  local rel="$1"
  ensure_remote_dir "$rel"
  scp -r "${ROOT}/${rel}/." "${REMOTE}/${rel}/"
  echo "  OK $rel"
}

push_file() {
  local rel="$1"
  local parent
  parent="$(dirname "$rel")"
  if [[ "$parent" != '.' ]]; then
    ensure_remote_dir "$parent"
  fi
  scp "${ROOT}/${rel}" "${REMOTE}/${rel}"
  echo "  OK $rel"
}

lock_dgx_src() {
  bash "${ROOT}/scripts/sync-lock-utils.sh" lock "sync-to-pc.sh --include-src in progress"
}

unlock_dgx_src() {
  bash "${ROOT}/scripts/sync-lock-utils.sh" unlock 2>/dev/null || true
}

push_dir_if_exists() {
  local rel="$1"
  if [[ -d "${ROOT}/${rel}" ]]; then
    push_dir "$rel"
  else
    echo "  skip (missing): $rel" >&2
  fi
}

push_dir_if_exists 'Pitch Deck'

for f in \
  README.md \
  package.json \
  vite.config.js \
  vercel.json \
  index.html \
  .env.example \
  .env.production.example \
  docs/PUBLIC_DEPLOY.md \
  docs/package.json \
  docs/jsconfig.json \
  docs/docusaurus.config.js \
  docs/docs/about.md \
  docs/docs/quickstart.md \
  docs/docs/Modders/process-avatars.md \
  docs/DEV_MACHINE_TOPOLOGY.md \
  docs/docs/DEV_MACHINE_TOPOLOGY.md \
  scripts/sync-to-dgx.ps1 \
  scripts/sync-from-dgx.ps1 \
  scripts/sync-dgx.ps1 \
  scripts/prune-sync-duplicates.sh \
  scripts/ensure-dgx-sync-ready.sh \
  scripts/sync-to-pc.sh \
  scripts/sync-lock-utils.sh \
  scripts/verify-public-build-env.mjs \
  scripts/pre-commit-block-secrets.sh \
  .cursor/rules/surface-sync-reminder.mdc \
  .cursor/rules/dgx-sync-reminder.mdc
do
  push_file "$f"
done

if [[ "$INCLUDE_SRC" -eq 1 ]]; then
  echo ""
  echo "Pushing src/ (DGX viewport + task pipeline fixes) ..."
  lock_dgx_src
  trap unlock_dgx_src EXIT
  push_dir 'src'
  unlock_dgx_src
  trap - EXIT
fi

echo ""
echo "Pushing public/worlds/ (static world index + packaged worlds) ..."
push_dir_if_exists 'public/worlds'

if [[ "$INCLUDE_AGENT_CONTEXT" -eq 1 ]]; then
  echo ""
  echo "Pushing agent context (memory-bank/, graphify-out/) ..."
  push_dir_if_exists 'memory-bank'
  push_dir_if_exists 'graphify-out'
fi

echo ""
echo "NOT pushed: src/ unless --include-src (PC-owned by default)"
echo "NOT pushed: memory-bank/, graphify-out/ unless --include-agent-context"
echo "NOT pushed: .sessionmem-team/ — use bash scripts/sync-sessionmem-team.sh"
echo "NOT pushed: app scripts/, MONETIZATION_ROADMAP.md (PC-owned)"
echo "Done."
