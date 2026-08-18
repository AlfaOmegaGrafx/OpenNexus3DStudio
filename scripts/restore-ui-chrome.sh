#!/usr/bin/env bash
# Restore Studio UI chrome from backups/ui-chrome-good-state/
# Use when an agent (or edit) regresses layout relative to the locked good state.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAP="$ROOT/backups/ui-chrome-good-state"

if [[ ! -d "$SNAP" ]]; then
  echo "ERROR: snapshot missing: $SNAP" >&2
  echo "Create one with: bash scripts/snapshot-ui-chrome.sh" >&2
  exit 1
fi

if [[ ! -f "$SNAP/MANIFEST.md" ]]; then
  echo "ERROR: $SNAP/MANIFEST.md missing — snapshot incomplete" >&2
  exit 1
fi

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  echo "Dry run — no files will be written"
fi

restored=0
missing=0

while IFS= read -r -d '' src; do
  rel="${src#"$SNAP/"}"
  [[ "$rel" == "MANIFEST.md" ]] && continue
  dest="$ROOT/$rel"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "would restore  $rel"
    restored=$((restored + 1))
    continue
  fi
  mkdir -p "$(dirname "$dest")"
  cp -a "$src" "$dest"
  echo "restore  $rel"
  restored=$((restored + 1))
done < <(find "$SNAP" -type f -print0)

if [[ "$DRY_RUN" -eq 0 ]]; then
  echo
  echo "Restored $restored file(s) from $SNAP"
  echo "Next: if on DGX with Surface testing, run:"
  echo "  bash scripts/sync-changes-to-pc.sh --include-src --retry-until-complete"
  echo "Then tell the user to hard-refresh their existing Studio tab (do not open a new tab)."
else
  echo
  echo "Would restore $restored file(s)"
fi

exit 0
