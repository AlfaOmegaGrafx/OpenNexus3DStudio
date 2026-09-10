#!/usr/bin/env bash
# Cross-chat workboard: who owns dirty / uncommitted Studio work.
# Lives in .agent/INFLIGHT.md so every Cursor chat can see every other chat's claims.
#
# Usage:
#   bash scripts/agent-workboard.sh status
#   bash scripts/agent-workboard.sh refresh-dirty
#   bash scripts/agent-workboard.sh claim --id ID --note "..." [--files "a,b"] [--chat "title"]
#   bash scripts/agent-workboard.sh release --id ID
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOARD="${ROOT}/.agent/INFLIGHT.md"
STATE="${ROOT}/.agent/STATE.md"

# Paths other chats must not silently restore from HEAD.
PROTECTED_RE='^(src/(library/(aiModelsCatalog|textToImagePromptOptions|studioGraph|studioGraphExecutor|appearanceClothing|avatarPipelineCatalog|taskManager)\.js|context/TaskContext\.jsx|components/(TaskManager\.jsx|studio/)|pages/StudioPage\.(jsx|css))|scripts/(verify-studio-sync-invariants|agent-workboard|guard-destructive-git)\.sh)'

ensure_board() {
  if [[ ! -f "$BOARD" ]]; then
    mkdir -p "$(dirname "$BOARD")"
    cat >"$BOARD" <<'EOF'
# Cross-chat workboard (agents MUST read)

## Active claims

<!-- CLAIMS_START -->
<!-- CLAIMS_END -->

## Auto dirty (from last refresh-dirty)

<!-- DIRTY_START -->
<!-- DIRTY_END -->
EOF
  fi
}

list_dirty_protected() {
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
      if [[ "$path" =~ $PROTECTED_RE ]]; then
        printf '%s\n' "$path"
      fi
    done
  ) | sort -u
}

cmd_status() {
  ensure_board
  echo "=== Cross-chat workboard ==="
  echo "Board: $BOARD"
  echo ""
  if grep -q 'id: `' "$BOARD" 2>/dev/null; then
    sed -n '/<!-- CLAIMS_START -->/,/<!-- CLAIMS_END -->/p' "$BOARD" | sed '1d;$d'
  else
    echo "(no active claims)"
  fi
  echo ""
  echo "=== Protected paths currently dirty vs git ==="
  local dirty
  dirty="$(list_dirty_protected || true)"
  if [[ -z "${dirty}" ]]; then
    echo "(none)"
  else
    printf '%s\n' "$dirty"
    echo ""
    echo "WARN: Other chats must NOT git checkout HEAD / restore / stash -u these without user OK."
  fi
}

cmd_refresh_dirty() {
  ensure_board
  local dirty stamp block
  dirty="$(list_dirty_protected || true)"
  stamp="$(date -Iseconds)"
  if [[ -z "$dirty" ]]; then
    block="_($stamp — no protected paths dirty)_"
  else
    block="_($stamp)_"$'\n'"$(printf '%s\n' "$dirty" | sed 's/^/- /')"
  fi
  python3 - "$BOARD" "$block" <<'PY'
import pathlib, sys
board = pathlib.Path(sys.argv[1])
block = sys.argv[2]
text = board.read_text()
start = "<!-- DIRTY_START -->"
end = "<!-- DIRTY_END -->"
i, j = text.find(start), text.find(end)
if i < 0 or j < 0:
    raise SystemExit("DIRTY markers missing in INFLIGHT.md")
board.write_text(text[: i + len(start)] + "\n" + block + "\n" + text[j:])
print("Refreshed auto-dirty section.")
PY
}

cmd_claim() {
  local id="" note="" files="" chat="unspecified"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id) id="$2"; shift 2 ;;
      --note) note="$2"; shift 2 ;;
      --files) files="$2"; shift 2 ;;
      --chat) chat="$2"; shift 2 ;;
      *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
  done
  [[ -n "$id" && -n "$note" ]] || {
    echo "Usage: claim --id ID --note \"...\" [--files a,b] [--chat title]" >&2
    exit 2
  }
  ensure_board
  if grep -q "id: \`$id\`" "$BOARD"; then
    echo "Claim id already exists: $id (release first or pick a new id)" >&2
    exit 1
  fi
  local stamp files_block
  stamp="$(date -Iseconds)"
  files_block="    (none listed)"
  if [[ -n "$files" ]]; then
    files_block="$(printf '%s\n' "${files//,/ }" | tr ' ' '\n' | sed '/^$/d' | sed 's/^/    /')"
  fi
  local entry
  entry=$(
    cat <<EOF
- id: \`$id\`
  chat: $chat
  status: active
  note: $note
  files: |
$files_block
  updated: $stamp
EOF
  )
  python3 - "$BOARD" "$entry" <<'PY'
import pathlib, sys
board = pathlib.Path(sys.argv[1])
entry = sys.argv[2].rstrip() + "\n"
text = board.read_text()
start = "<!-- CLAIMS_START -->"
end = "<!-- CLAIMS_END -->"
i, j = text.find(start), text.find(end)
if i < 0 or j < 0:
    raise SystemExit("CLAIMS markers missing")
mid = text[i + len(start) : j].strip("\n")
if mid.strip():
    mid = mid + "\n" + entry
else:
    mid = entry
board.write_text(text[: i + len(start)] + "\n" + mid + text[j:])
print("Claimed:", entry.splitlines()[0])
PY
  # Nudge STATE watch-outs (non-destructive append if marker present)
  if [[ -f "$STATE" ]] && ! grep -q "INFLIGHT:" "$STATE"; then
    printf '\n## INFLIGHT\n- See `.agent/INFLIGHT.md` (cross-chat dirty claims) — run `bash scripts/agent-workboard.sh status`\n' >>"$STATE"
  fi
}

cmd_release() {
  local id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id) id="$2"; shift 2 ;;
      *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
  done
  [[ -n "$id" ]] || {
    echo "Usage: release --id ID" >&2
    exit 2
  }
  ensure_board
  python3 - "$BOARD" "$id" <<'PY'
import pathlib, re, sys
board = pathlib.Path(sys.argv[1])
cid = sys.argv[2]
text = board.read_text()
start = "<!-- CLAIMS_START -->"
end = "<!-- CLAIMS_END -->"
i, j = text.find(start), text.find(end)
if i < 0 or j < 0:
    raise SystemExit("CLAIMS markers missing")
mid = text[i + len(start) : j]
# Drop claim block starting with "- id: `cid`"
pat = re.compile(rf"(?ms)^- id: `{re.escape(cid)}`\n(?:  .*\n)*")
new_mid, n = pat.subn("", mid)
if n == 0:
    raise SystemExit(f"No claim id={cid}")
board.write_text(text[: i + len(start)] + new_mid + text[j:])
print(f"Released claim: {cid}")
PY
}

usage() {
  cat <<'EOF'
Usage:
  bash scripts/agent-workboard.sh status
  bash scripts/agent-workboard.sh refresh-dirty
  bash scripts/agent-workboard.sh claim --id ID --note "..." [--files "a,b"] [--chat "title"]
  bash scripts/agent-workboard.sh release --id ID
EOF
}

main() {
  local cmd="${1:-status}"
  shift || true
  case "$cmd" in
    status) cmd_status "$@" ;;
    refresh-dirty) cmd_refresh_dirty "$@" ;;
    claim) cmd_claim "$@" ;;
    release) cmd_release "$@" ;;
    -h|--help|help) usage ;;
    *) usage; exit 2 ;;
  esac
}

main "$@"
