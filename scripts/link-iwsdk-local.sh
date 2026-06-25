#!/usr/bin/env bash
# Build AlfaOmegaGrafx/immersive-web-sdk and install local @iwsdk/* tgz into OpenNexus3DStudio.
#
# Usage (DGX or Surface):
#   bash scripts/link-iwsdk-local.sh           # build tgz if missing, npm install
#   bash scripts/link-iwsdk-local.sh --rebuild # force rebuild tgz
#
# Expects sibling clone:
#   ../immersive-web-sdk  (from OpenNexus3DStudio root)
# Override:
#   IWSDK_ROOT=/path/to/immersive-web-sdk bash scripts/link-iwsdk-local.sh

set -euo pipefail

REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IWSDK_ROOT="${IWSDK_ROOT:-$(cd "$ROOT/../immersive-web-sdk" 2>/dev/null && pwd || true)}"

if [[ -z "$IWSDK_ROOT" || ! -d "$IWSDK_ROOT/packages/core" ]]; then
  echo "ERROR: immersive-web-sdk not found."
  echo "Clone: git clone https://github.com/AlfaOmegaGrafx/immersive-web-sdk.git $ROOT/../immersive-web-sdk"
  exit 1
fi

need_build=0
for pkg in core locomotor xr-input cli vite-plugin-dev reference; do
  tgz="$IWSDK_ROOT/packages/$pkg/iwsdk-$pkg.tgz"
  if [[ ! -f "$tgz" ]]; then
    need_build=1
    break
  fi
done

if [[ "$REBUILD" -eq 1 || "$need_build" -eq 1 ]]; then
  echo "=== Building @iwsdk tgz packages in $IWSDK_ROOT ==="
  if ! command -v pnpm >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@latest --activate
  fi
  cd "$IWSDK_ROOT"
  pnpm install
  npm run build:tgz:skip-reference-assets
fi

cd "$ROOT"
echo "=== Installing local @iwsdk/* from $IWSDK_ROOT ==="

npm install --no-save \
  "@iwsdk/core@file:$IWSDK_ROOT/packages/core/iwsdk-core.tgz" \
  "@iwsdk/locomotor@file:$IWSDK_ROOT/packages/locomotor/iwsdk-locomotor.tgz" \
  "@iwsdk/xr-input@file:$IWSDK_ROOT/packages/xr-input/iwsdk-xr-input.tgz" \
  "@iwsdk/cli@file:$IWSDK_ROOT/packages/cli/iwsdk-cli.tgz" \
  "@iwsdk/vite-plugin-dev@file:$IWSDK_ROOT/packages/vite-plugin-dev/iwsdk-vite-plugin-dev.tgz" \
  "@iwsdk/reference@file:$IWSDK_ROOT/packages/reference/iwsdk-reference.tgz"

echo ""
echo "Done. Local IWSDK linked."
echo "Verify: npm ls @iwsdk/core @iwsdk/locomotor @iwsdk/xr-input"
echo "Rebuild fork: IWSDK_ROOT=$IWSDK_ROOT bash scripts/link-iwsdk-local.sh --rebuild"
