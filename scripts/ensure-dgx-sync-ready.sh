#!/usr/bin/env bash
# Validate DGX CharacterStudio tree after PC sync. Safe to re-run.
# Usage: bash scripts/ensure-dgx-sync-ready.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== ensure-dgx-sync-ready (DGX) ==="

bash scripts/prune-sync-duplicates.sh

errors=0

warn() {
  echo "  WARN: $1"
  errors=$((errors + 1))
}

ok() {
  echo "  OK: $1"
}

# Single monetization roadmap (PC is source of truth).
legacy_roadmaps=$(find . \
  \( -path ./node_modules -o -path ./.git -o -path ./build \) -prune \
  -o -name 'MONETIZATION_ROADMAP*' ! -path ./MONETIZATION_ROADMAP.md -print 2>/dev/null | wc -l)
if [[ "$legacy_roadmaps" -gt 0 ]]; then
  warn "legacy MONETIZATION_ROADMAP* copies still present — run prune again"
else
  ok "single MONETIZATION_ROADMAP.md (no legacy copies)"
fi

if [[ ! -f MONETIZATION_ROADMAP.md ]]; then
  warn "MONETIZATION_ROADMAP.md missing — push from PC with sync-to-dgx.ps1"
fi

for nested in \
  docs/docs/docs \
  docs/docs/docs/docs \
  scripts/scripts \
  src/components/components \
  src/pages/pages \
  src/pages/pages/pages \
  src/library/library; do
  if [[ -e "$nested" ]]; then
    warn "nested duplicate still present: $nested"
  fi
done

for required in \
  scripts/sync-from-dgx.ps1 \
  scripts/sync-to-dgx.ps1 \
  scripts/sync-dgx.ps1 \
  scripts/prune-sync-duplicates.sh \
  README.md \
  'Pitch Deck/README.md'
do
  if [[ -e "$required" ]]; then
    ok "present: $required"
  else
    warn "missing: $required"
  fi
done

if [[ -f docs/DEV_MACHINE_TOPOLOGY.md ]]; then
  cp docs/DEV_MACHINE_TOPOLOGY.md docs/docs/DEV_MACHINE_TOPOLOGY.md
  ok "docs/docs/DEV_MACHINE_TOPOLOGY.md synced from docs/"
fi

echo ""
if [[ $errors -eq 0 ]]; then
  echo "DGX sync state: OK"
else
  echo "DGX sync state: $errors issue(s) — review warnings above"
  exit 1
fi
