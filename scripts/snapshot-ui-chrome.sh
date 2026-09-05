#!/usr/bin/env bash
# Snapshot current Studio UI chrome into backups/ui-chrome-good-state/
# Run only when the user confirms the live UI is a good state to lock.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAP="$ROOT/backups/ui-chrome-good-state"

FILES=(
  src/App.jsx
  src/App.css
  src/components/App.css
  src/components/SceneControlsCompact.jsx
  src/components/SceneControlsCompact.css
  src/components/TaskProgressBar.jsx
  src/components/TaskProgressBar.css
  src/components/BottomDisplayMenu.jsx
  src/components/BottomDisplayMenu.module.css
  src/components/KimodoMotionPromptBar.jsx
  src/components/KimodoMotionPromptBar.module.css
  src/components/Mesh2MotionControllerOverlay.jsx
  src/components/Mesh2MotionControllerOverlay.css
  src/library/viewportLayoutSync.js
  src/components/NativeFaceRelayHud.jsx
  src/pages/AppearanceSimple.jsx
  src/pages/Appearance.module.css
  src/pages/SaveSimple.jsx
  src/pages/MintSimple.jsx
  src/pages/LoadSimple.jsx
  src/pages/ToolsSimple.jsx
  memory-bank/app-chrome-layout-protected-state.md
  .cursor/rules/app-chrome-layout-protected.mdc
  .cursor/rules/sidebar-z-index.mdc
  .cursor/rules/collapsed-rail-icons.mdc
  .cursor/rules/no-new-browser-tab-after-fix.mdc
)

mkdir -p "$SNAP"
missing=0
for f in "${FILES[@]}"; do
  src="$ROOT/$f"
  if [[ ! -f "$src" ]]; then
    echo "MISSING (skip): $f" >&2
    missing=$((missing + 1))
    continue
  fi
  mkdir -p "$SNAP/$(dirname "$f")"
  cp -a "$src" "$SNAP/$f"
  echo "snap  $f"
done

DATE="$(date -Iseconds)"
{
  echo "# UI chrome good-state snapshot"
  echo
  echo "**Captured:** $DATE"
  echo "**Label:** User-confirmed Studio chrome good state"
  echo "**Restore:** \`bash scripts/restore-ui-chrome.sh\`"
  echo "**Refresh:** \`bash scripts/snapshot-ui-chrome.sh\` (only after user confirms a new good UI)"
  echo
  echo "## Files in this snapshot"
  echo
  for f in "${FILES[@]}"; do
    if [[ -f "$SNAP/$f" ]]; then
      bytes="$(wc -c < "$SNAP/$f" | tr -d ' ')"
      echo "- \`$f\` ($bytes bytes)"
    fi
  done
} > "$SNAP/MANIFEST.md"

echo
echo "Wrote $SNAP/MANIFEST.md"
echo "Done. missing=$missing"
