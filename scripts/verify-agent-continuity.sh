#!/usr/bin/env bash
# Verify agent continuity stack for OpenNexus / product repos.
# Safe to re-run. Exit 0 = all required checks pass; 1 = failures.
#
# Usage:
#   bash scripts/verify-agent-continuity.sh
#   bash scripts/verify-agent-continuity.sh --all-repos
#   VERIFY_CONTINUITY_JSON=1 bash scripts/verify-agent-continuity.sh
#
# Checked: Cursor rules, RepoResident (.agent/), MindLink (.brain/),
# memory-bank, SessionMem, CLAUDE/AGENTS, optional graphify.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALL_REPOS=0
EMIT_JSON="${VERIFY_CONTINUITY_JSON:-0}"
FAILS=0
WARNS=0
REPORT_LINES=()

for arg in "$@"; do
  case "$arg" in
    --all-repos) ALL_REPOS=1 ;;
    --json) EMIT_JSON=1 ;;
  esac
done

note() { REPORT_LINES+=("$1"); echo "$1"; }
ok() { note "  OK  $1"; }
warn() { WARNS=$((WARNS + 1)); note "  WARN $1"; }
fail() { FAILS=$((FAILS + 1)); note "  FAIL $1"; }

check_file() {
  local path="$1"
  local label="${2:-$1}"
  if [[ -f "$path" ]]; then
    ok "$label"
  else
    fail "missing $label"
  fi
}

check_dir() {
  local path="$1"
  local label="${2:-$1}"
  if [[ -d "$path" ]]; then
    ok "$label"
  else
    fail "missing $label"
  fi
}

check_repo() {
  local repo="$1"
  local name
  name="$(basename "$repo")"
  note ""
  note "=== $name ($repo) ==="
  if [[ ! -d "$repo" ]]; then
    fail "repo not found"
    return
  fi

  check_file "$repo/CLAUDE.md" "CLAUDE.md (RepoResident ops)"
  check_file "$repo/AGENTS.md" "AGENTS.md"
  check_dir "$repo/.agent" ".agent/ (RepoResident)"
  check_file "$repo/.agent/STATE.md" ".agent/STATE.md"
  check_file "$repo/.agent/MAP.md" ".agent/MAP.md"
  check_file "$repo/.agent/PROJECT.md" ".agent/PROJECT.md"
  check_file "$repo/.agent/DECISIONS.md" ".agent/DECISIONS.md"

  if [[ -d "$repo/.brain" ]]; then
    ok ".brain/ (MindLink present)"
    [[ -f "$repo/.brain/MEMORY.md" ]] && ok ".brain/MEMORY.md" || warn ".brain/MEMORY.md missing"
    [[ -f "$repo/.brain/SESSION.md" ]] && ok ".brain/SESSION.md" || warn ".brain/SESSION.md missing"
    if [[ -f "$repo/.agent/areas/mindlink.md" ]]; then
      ok ".agent/areas/mindlink.md"
    else
      warn "MindLink present but .agent/areas/mindlink.md missing"
    fi
  else
    warn ".brain/ absent (MindLink optional)"
  fi

  if [[ -d "$repo/memory-bank" ]]; then
    ok "memory-bank/ (Cursor memory bank)"
    [[ -f "$repo/memory-bank/activeContext.md" ]] && ok "memory-bank/activeContext.md" || warn "memory-bank/activeContext.md missing"
  else
    warn "memory-bank/ absent"
  fi

  if [[ -d "$repo/.cursor/rules" ]]; then
    ok ".cursor/rules/"
    local required_rules=(
      "dgx-sync-reminder.mdc"
      "agent-run-instructions.mdc"
      "3daigc-opennexus3dstudio-workflow.mdc"
      "agent-continuity-startup.mdc"
    )
    # Only enforce OpenNexus-specific rules in that repo
    if [[ "$name" == "OpenNexus3DStudio" ]]; then
      local r
      for r in "${required_rules[@]}"; do
        [[ -f "$repo/.cursor/rules/$r" ]] && ok "rule $r" || fail "rule missing: $r"
      done
      [[ -f "$repo/.cursor/hooks.json" ]] && ok ".cursor/hooks.json" || fail ".cursor/hooks.json missing"
      [[ -x "$repo/.cursor/hooks/session-continuity.sh" || -f "$repo/.cursor/hooks/session-continuity.sh" ]] \
        && ok ".cursor/hooks/session-continuity.sh" \
        || fail ".cursor/hooks/session-continuity.sh missing"
      [[ -f "$repo/scripts/verify-agent-continuity.sh" ]] && ok "scripts/verify-agent-continuity.sh" \
        || fail "scripts/verify-agent-continuity.sh missing"
    fi
  else
    warn ".cursor/rules/ absent"
  fi

  if [[ -d "$repo/.sessionmem-team" ]]; then
    ok ".sessionmem-team/"
  else
    warn ".sessionmem-team/ absent (create on first sessionmem sync)"
  fi

  if [[ -d "$repo/graphify-out" ]]; then
    ok "graphify-out/"
  else
    warn "graphify-out/ absent (optional)"
  fi
}

check_sessionmem_cli() {
  note ""
  note "=== SessionMem CLI ==="
  export PATH="${HOME}/.nvm/versions/node/v22.22.2/bin:${HOME}/.local/bin:${PATH}"
  if command -v sessionmem >/dev/null 2>&1; then
    ok "sessionmem on PATH ($(command -v sessionmem))"
  else
    warn "sessionmem CLI not installed (npm i -g sessionmem)"
  fi
}

ensure_companion_stack() {
  note ""
  note "=== Companion stack (Surface UI + DGX PersonaPlex) ==="
  note "  Companion UI prefers Surface :5173; DGX :5173 is fallback. Git commits do not start these."

  local ensure="${ROOT}/scripts/ensure-companion-stack-dgx.sh"
  if [[ ! -f "$ensure" ]]; then
    fail "scripts/ensure-companion-stack-dgx.sh missing"
    return
  fi

  set +e
  OUT="$(bash "$ensure" 2>&1)"
  RC=$?
  set -e
  while IFS= read -r line; do
    [[ -n "$line" ]] && note "  $line"
  done <<<"$OUT"

  local surface_host="${SURFACE_LAN_IP:-10.0.0.32}"
  local surface_chat=""
  surface_chat="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 "http://${surface_host}:5173/" 2>/dev/null || echo 000)"
  local surface_proxy=""
  surface_proxy="$(curl -sk -o /dev/null -w '%{http_code}' --connect-timeout 2 "https://${surface_host}:8464/?embed=1" 2>/dev/null || echo 000)"

  if ss -ltn 2>/dev/null | grep -qE ':5173[[:space:]]'; then
    ok "Companion fallback listening on DGX :5173"
  elif [[ "$surface_chat" == "200" || "$surface_proxy" == "200" ]]; then
    ok "Companion UI reachable on Surface (5173 or proxy 8464)"
  else
    warn "Companion not on DGX :5173 and Surface :5173/:8464 not reachable yet"
  fi

  if ss -ltn 2>/dev/null | grep -qE ':8455[[:space:]]'; then
    ok "PersonaPlex WSS proxy on :8455"
  else
    warn "PersonaPlex WSS proxy not on :8455"
  fi

  if ss -ltn 2>/dev/null | grep -qE ':8998[[:space:]]'; then
    ok "PersonaPlex moshi.server on :8998"
  elif [[ "$RC" -ne 0 ]]; then
    warn "PersonaPlex :8998 still starting (first boot downloads HF weights)"
  else
    warn "PersonaPlex :8998 not listening yet"
  fi
}

check_user_hooks() {
  note ""
  note "=== User Cursor hooks (~/.cursor) ==="
  if [[ -f "${HOME}/.cursor/hooks.json" ]]; then
    ok "~/.cursor/hooks.json"
  else
    fail "~/.cursor/hooks.json missing"
  fi
  if [[ -f "${HOME}/.cursor/hooks/session-continuity.sh" ]]; then
    ok "~/.cursor/hooks/session-continuity.sh"
  else
    fail "~/.cursor/hooks/session-continuity.sh missing"
  fi
  if [[ -f "${HOME}/.cursor/rules/agent-continuity-startup.mdc" ]] \
    || [[ -f "${HOME}/.cursor/rules/3daigc-character-studio-workflow.mdc" ]]; then
    ok "~/.cursor/rules continuity/workflow present"
  else
    warn "~/.cursor/rules continuity rule not found (project rules still apply)"
  fi
}

STAMP_DIR="${HOME}/.cache/opennexus-continuity"
mkdir -p "$STAMP_DIR"

check_repo "$ROOT"
if [[ "$ALL_REPOS" -eq 1 ]]; then
  for extra in /home/sifr/3DAIGC-API /home/sifr/SpaceTimeHost /home/sifr/Sneeze; do
    [[ "$extra" == "$ROOT" ]] && continue
    [[ -d "$extra" ]] && check_repo "$extra"
  done
  check_user_hooks
  check_sessionmem_cli
  ensure_companion_stack
  note ""
  note "=== Companion navbar invariants ==="
  if [[ -x "${ROOT}/scripts/verify-companion-navbar.sh" ]] \
    || [[ -f "${ROOT}/scripts/verify-companion-navbar.sh" ]]; then
    if bash "${ROOT}/scripts/verify-companion-navbar.sh"; then
      ok "companion navbar floating-chips + Stage Suspense"
    else
      fail "companion navbar invariants (see companion-navbar-floating-chips.mdc)"
    fi
  else
    warn "scripts/verify-companion-navbar.sh missing"
  fi
fi

note ""
if [[ "$FAILS" -eq 0 ]]; then
  note "RESULT: PASS (warnings=$WARNS)"
  printf '%s\n' "$(date -Iseconds) PASS warns=$WARNS root=$ROOT" >"${STAMP_DIR}/last.txt"
  status=0
else
  note "RESULT: FAIL (fails=$FAILS warnings=$WARNS)"
  printf '%s\n' "$(date -Iseconds) FAIL fails=$FAILS warns=$WARNS root=$ROOT" >"${STAMP_DIR}/last.txt"
  status=1
fi

printf '%s\n' "${REPORT_LINES[@]}" >"${STAMP_DIR}/last-report.txt"

if [[ "$EMIT_JSON" == "1" ]]; then
  # Compact summary for hooks (python for JSON escaping)
  python3 - <<PY
import json, pathlib
report = pathlib.Path("${STAMP_DIR}/last-report.txt").read_text(encoding="utf-8", errors="replace")
out = {
  "ok": ${FAILS} == 0,
  "fails": ${FAILS},
  "warns": ${WARNS},
  "root": "${ROOT}",
  "report": report[-6000:],
}
print(json.dumps(out))
PY
fi

exit "$status"
