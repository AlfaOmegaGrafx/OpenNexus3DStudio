#!/usr/bin/env bash
# Bidirectional DGX <-> Surface reconcile for OpenNexus3DStudio.
# Protected paths (scripts/protected-paths.manifest) are DGX-canonical:
#   - always pushed DGX -> Surface
#   - never pulled Surface -> DGX
# Non-protected WIP is merged both ways. Cruft only is removed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SURFACE_SSH="${SURFACE_SSH:-Surface-PC-Tailscale}"
SURFACE_ROOT="${SURFACE_ROOT:-C:/Users/alfao/Documents/GitHub/OpenNexus3DStudio}"
MANIFEST="$ROOT/scripts/protected-paths.manifest"

# shellcheck source=scripts/protected-paths-lib.sh
source "$ROOT/scripts/protected-paths-lib.sh"
protected_load_manifest "$MANIFEST"

echo "=== Reconcile OpenNexus: DGX <-> Surface ==="
echo "DGX:     $ROOT"
echo "Surface: ${SURFACE_SSH}:${SURFACE_ROOT}"
echo "Protected paths in manifest: ${#PROTECTED_PATHS[@]}"
echo ""

if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SURFACE_SSH" "echo ok" >/dev/null 2>&1; then
  echo "ERROR: Cannot SSH to $SURFACE_SSH" >&2
  exit 1
fi

echo "Step 1/6: Prune known sync cruft on DGX..."
bash "$ROOT/scripts/prune-sync-duplicates.sh" 2>/dev/null || true
rm -rf "$ROOT/.claude" /home/sifr/3DAIGC-API/.claude 2>/dev/null || true

echo ""
echo "Step 2/6: Protected contract preflight (DGX)..."
bash "$ROOT/scripts/verify-protected-contracts.sh"

echo ""
echo "Step 3/6: DGX -> Surface (all protected manifest paths)..."
for rel in "${PROTECTED_PATHS[@]}"; do
  protected_push_to_surface "$ROOT" "$rel" "$SURFACE_SSH" "$SURFACE_ROOT"
done

echo ""
echo "Step 4/6: DGX -> Surface (full src + agent context bundle)..."
bash "$ROOT/sync-to-pc.sh" --include-src --include-agent-context

echo ""
echo "Step 5/6: Surface -> DGX (non-protected WIP only)..."
bash "$ROOT/scripts/reconcile-surface-to-dgx.sh"

echo ""
echo "Step 6/6: Re-assert protected paths (DGX canonical) + checksum verify..."
for rel in "${PROTECTED_PATHS[@]}"; do
  protected_push_to_surface "$ROOT" "$rel" "$SURFACE_SSH" "$SURFACE_ROOT"
done
mismatch=0
protected_verify_surface_checksums "$ROOT" "$SURFACE_SSH" "$SURFACE_ROOT" || mismatch=$?

echo ""
bash "$ROOT/scripts/verify-protected-contracts.sh"

if [[ "$mismatch" -gt 0 ]]; then
  echo "WARN: fixed $mismatch protected checksum mismatch(es)." >&2
fi

echo ""
echo "RECONCILE_OPENNEXUS_OK (${#PROTECTED_PATHS[@]} protected paths)"
