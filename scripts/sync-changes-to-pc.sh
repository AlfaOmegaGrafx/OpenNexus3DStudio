#!/usr/bin/env bash
# Push only git-changed DGX-owned files to Surface (fast incremental sync).
# Run ON DGX after editing docs, README, sync scripts, etc.
#
# Usage:
#   bash scripts/sync-changes-to-pc.sh
#   bash scripts/sync-changes-to-pc.sh --retry-until-complete
#   bash scripts/sync-changes-to-pc.sh --include-src          # when DGX edited src/
#   bash scripts/sync-changes-to-pc.sh --include-agent-context  # memory-bank + graphify-out
#   bash scripts/sync-changes-to-pc.sh --include-docs
#
# Mirror of Surface: .\scripts\sync-changes-to-dgx.ps1 -RetryUntilComplete

set -euo pipefail

INCLUDE_SRC=0
INCLUDE_AGENT=0
INCLUDE_DOCS=0
RETRY_UNTIL=0
MAX_ROUNDS=8

for arg in "$@"; do
  case "$arg" in
    --include-src) INCLUDE_SRC=1 ;;
    --include-agent-context) INCLUDE_AGENT=1 ;;
    --include-docs) INCLUDE_DOCS=1 ;;
    --retry-until-complete) RETRY_UNTIL=1 ;;
    --max-rounds=*) MAX_ROUNDS="${arg#*=}" ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/sync-changes-lib.sh
source "${ROOT}/scripts/sync-changes-lib.sh"

SURFACE_SSH="${SURFACE_SSH:-Surface-PC-Tailscale}"
SURFACE_ROOT="${SURFACE_ROOT:-C:/Users/alfao/Documents/GitHub/OpenNexus3DStudio}"

SYNC_REPO_ROOT="$ROOT"
SYNC_SSH_TARGET="$SURFACE_SSH"
SYNC_REMOTE_ROOT="$SURFACE_ROOT"

echo ""
echo "=== DGX -> Surface (changes only) ==="
echo "DGX:     $ROOT"
echo "Surface: ${SURFACE_SSH}:${SURFACE_ROOT}"
echo ""

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SURFACE_SSH" "echo ok" >/dev/null 2>&1; then
  echo "ERROR: Cannot SSH to $SURFACE_SSH"
  echo "On Surface run: .\\scripts\\allow-dgx-ssh-to-surface.ps1"
  exit 1
fi

if [[ "$INCLUDE_SRC" -eq 1 ]]; then
  bash "${ROOT}/scripts/sync-lock-utils.sh" lock "sync-changes-to-pc.sh --include-src"
  trap 'bash "${ROOT}/scripts/sync-lock-utils.sh" unlock 2>/dev/null || true' EXIT
fi

mapfile -t CHANGED < <(sync_collect_changed_paths "$ROOT" "$INCLUDE_SRC" "$INCLUDE_AGENT" "$INCLUDE_DOCS")

if [[ ${#CHANGED[@]} -eq 0 ]]; then
  echo "No DGX-owned git changes to push."
  exit 0
fi

echo "Pushing ${#CHANGED[@]} changed file(s) ..."
set +e
sync_retry_failed_items "$MAX_ROUNDS" "$RETRY_UNTIL" "${CHANGED[@]}"
rc=$?
set -e

if [[ "$INCLUDE_SRC" -eq 1 ]]; then
  bash "${ROOT}/scripts/sync-lock-utils.sh" unlock 2>/dev/null || true
  trap - EXIT
fi

if [[ "$rc" -ne 0 ]]; then
  echo ""
  echo "Re-run: bash scripts/sync-changes-to-pc.sh --retry-until-complete"
  exit 1
fi

if printf '%s\n' "${CHANGED[@]}" | grep -qE '^Pitch Deck/'; then
  echo ""
  echo "Pitch Deck changed — pruning nested sync duplicates on DGX ..."
  bash "${ROOT}/scripts/prune-sync-duplicates.sh"
fi

echo ""
echo "Done (changes -> Surface)."
