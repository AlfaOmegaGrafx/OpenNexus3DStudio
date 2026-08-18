#!/usr/bin/env bash
# Run all locked contract verifiers for protected OpenNexus domains.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0

echo "=== Protected contracts (OpenNexus) ==="

echo ""
echo "--- Krea 2 -> Image-to-3D pipeline ---"
if ! bash "$ROOT/scripts/verify_krea2_text_to_3d_pipeline.sh"; then
  fail=1
fi

echo ""
echo "--- VRM animation regression ---"
if [[ -f "$ROOT/node_modules/vitest/vitest.mjs" ]]; then
  if ! node node_modules/vitest/vitest.mjs run \
    src/__tests__/loadMixamoAnimation.test.js \
    src/__tests__/animationManager.playback.test.js \
    src/__tests__/kimodoMotionLoader.test.js \
    src/__tests__/vrmMixamoPlaybackGuard.test.js 2>/dev/null; then
  echo "  WARN: animation regression tests failed (check protected VRM animation state)" >&2
  fail=1
  fi
else
  echo "  skip vitest (node_modules missing)"
fi

echo ""
echo "--- Spatial fabric adapter ---"
if [[ -f "$ROOT/node_modules/vitest/vitest.mjs" ]]; then
  if ! node node_modules/vitest/vitest.mjs run src/__tests__/spatialFabricAdapter.test.js 2>/dev/null; then
  echo "  WARN: spatialFabricAdapter tests failed" >&2
  fail=1
  fi
fi

echo ""
echo "--- XR avatar view / locomotion / menu ---"
if ! bash "$ROOT/scripts/verify_xr_avatar_view_locomotion.sh"; then
  fail=1
fi

echo ""
if [[ "$fail" -eq 0 ]]; then
  echo "PROTECTED_CONTRACTS_OK"
  exit 0
fi
echo "PROTECTED_CONTRACTS_FAILED" >&2
exit 1
