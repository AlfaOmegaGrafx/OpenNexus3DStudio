#!/usr/bin/env bash
# Contract verifier: XR avatar view / locomotion / menu (locked 2026-07-26)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== XR avatar view / locomotion / menu ==="

if [[ ! -f "$ROOT/node_modules/vitest/vitest.mjs" ]]; then
  echo "  skip vitest (node_modules missing)"
  exit 0
fi

node node_modules/vitest/vitest.mjs run \
  src/__tests__/sceneManagerXrAvatarView.test.js \
  src/__tests__/sceneManagerXrLocomotion.test.js \
  src/__tests__/sceneManagerXrMenu.test.js

# Smoke: disembody must force viewpoint mode + 1 m behind constant
grep -q 'XR_LOCOMOTION_MODE_VIEWPOINT' src/library/sceneManagerXrAvatarView.js
grep -q 'THIRD_PERSON_BEHIND_M' src/library/sceneManagerXrAvatarView.js
grep -q '_offsetViewerBehindAvatar' src/library/sceneManagerXrAvatarView.js
grep -q 'stickPressed && !this._prevLeftStick' src/library/sceneManagerXrMenu.js
grep -q 'PANEL_GRIP_DOWN_M' src/library/sceneManagerXrMenu.js
grep -q 'alignXrLocomotionRigToViewport' src/library/sceneManagerXrLocomotion.js

echo "XR_AVATAR_VIEW_LOCOMOTION_OK"
