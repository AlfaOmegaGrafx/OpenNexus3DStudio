#!/usr/bin/env bash
# Pull Surface-owned git-changed paths to DGX — skips ALL protected manifest paths.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SURFACE_SSH="${SURFACE_SSH:-Surface-PC-Tailscale}"
SURFACE_ROOT="${SURFACE_ROOT:-C:/Users/alfao/Documents/GitHub/OpenNexus3DStudio}"
MANIFEST="$ROOT/scripts/protected-paths.manifest"

# shellcheck source=scripts/protected-paths-lib.sh
source "$ROOT/scripts/protected-paths-lib.sh"
protected_load_manifest "$MANIFEST"

mapfile -t CHANGED < <(
  ssh -o ConnectTimeout=15 "$SURFACE_SSH" \
    "powershell -NoProfile -Command \"Set-Location '$SURFACE_ROOT'; git status --porcelain -u\"" \
    | while IFS= read -r line; do protected_trim_git_path "$line" || true; done | sort -u
)

pulled=0
skipped=0
for rel in "${CHANGED[@]}"; do
  [[ -z "$rel" ]] && continue
  [[ "$rel" =~ ^(src/|memory-bank/|\.cursor/rules/|docs/|scripts/|sync-) ]] || continue
  if protected_is_path "$rel"; then
    skipped=$((skipped + 1))
    continue
  fi
  parent="$(dirname "$rel")"
  mkdir -p "$ROOT/$parent"
  if scp -q "${SURFACE_SSH}:${SURFACE_ROOT}/${rel}" "$ROOT/$rel" 2>/dev/null; then
    echo "  OK $rel"
    pulled=$((pulled + 1))
  else
    echo "  skip $rel" >&2
  fi
done

echo ""
echo "Pulled $pulled file(s); skipped $skipped protected file(s)."
