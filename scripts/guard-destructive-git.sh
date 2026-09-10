#!/usr/bin/env bash
# Fail closed before destructive git that can wipe another chat's uncommitted work.
#
# Usage:
#   bash scripts/guard-destructive-git.sh --check
#   bash scripts/guard-destructive-git.sh --paths src/library/aiModelsCatalog.js ...
#   bash scripts/guard-destructive-git.sh --allow-with-user-ok --paths ...   # still prints WARN
#
# Agents MUST run this before:
#   git checkout HEAD -- <paths>
#   git restore <paths>
#   git stash push -u (especially with src/)
#   git filter-repo / reset --hard that touches working tree
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOW=0
CHECK_ALL=0
PATHS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ALL=1; shift ;;
    --allow-with-user-ok) ALLOW=1; shift ;;
    --paths)
      shift
      while [[ $# -gt 0 && "$1" != --* ]]; do
        PATHS+=("$1")
        shift
      done
      ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

PROTECTED_RE='^(src/(library/(aiModelsCatalog|textToImagePromptOptions|studioGraph|studioGraphExecutor|appearanceClothing|avatarPipelineCatalog|taskManager)\.js|context/TaskContext\.jsx|components/(TaskManager\.jsx|studio/)|pages/StudioPage\.(jsx|css))|scripts/(verify-studio-sync-invariants|agent-workboard|guard-destructive-git)\.sh)'

is_protected() {
  [[ "$1" =~ $PROTECTED_RE ]]
}

list_dirty() {
  (
    cd "$ROOT"
    git status --porcelain -u 2>/dev/null | while IFS= read -r line; do
      [[ ${#line} -lt 4 ]] && continue
      local path="${line:3}"
      path="${path#"${path%%[![:space:]]*}"}"
      if [[ "$path" == *" -> "* ]]; then
        path="${path##* -> }"
        path="${path#"${path%%[![:space:]]*}"}"
      fi
      printf '%s\n' "$path"
    done
  ) | sort -u
}

echo "=== Destructive-git guard ==="
echo "Also read: .agent/INFLIGHT.md  |  bash scripts/agent-workboard.sh status"
echo ""

if [[ -f "${ROOT}/.agent/INFLIGHT.md" ]]; then
  if grep -q 'id: `' "${ROOT}/.agent/INFLIGHT.md"; then
    echo "Active INFLIGHT claims:"
    sed -n '/<!-- CLAIMS_START -->/,/<!-- CLAIMS_END -->/p' "${ROOT}/.agent/INFLIGHT.md" \
      | grep -E '^- id:|^  note:|^  status:' | sed 's/^/  /'
    echo ""
  fi
fi

dirty="$(list_dirty || true)"
blocked=()

if [[ "$CHECK_ALL" -eq 1 ]]; then
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    if is_protected "$p"; then
      blocked+=("$p")
    fi
  done <<<"$dirty"
elif [[ ${#PATHS[@]} -gt 0 ]]; then
  for p in "${PATHS[@]}"; do
    p="${p#./}"
    if ! is_protected "$p"; then
      continue
    fi
    if printf '%s\n' "$dirty" | grep -qxF "$p"; then
      blocked+=("$p")
    elif grep -q "$p" "${ROOT}/.agent/INFLIGHT.md" 2>/dev/null; then
      blocked+=("$p (listed in INFLIGHT)")
    fi
  done
else
  echo "Pass --check or --paths ..." >&2
  exit 2
fi

if [[ ${#blocked[@]} -eq 0 ]]; then
  echo "OK — no protected dirty / claimed paths in scope."
  exit 0
fi

echo "BLOCKED — would discard another chat's uncommitted work:" >&2
printf '  %s\n' "${blocked[@]}" >&2
echo "" >&2
echo "Fix: WIP-commit those files, or release the INFLIGHT claim, or get explicit user OK." >&2
echo "Then re-run with: bash scripts/guard-destructive-git.sh --allow-with-user-ok --paths ..." >&2

if [[ "$ALLOW" -eq 1 ]]; then
  echo "" >&2
  echo "WARN: --allow-with-user-ok set; proceeding is caller's responsibility." >&2
  exit 0
fi
exit 1
