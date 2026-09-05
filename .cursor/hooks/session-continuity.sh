#!/usr/bin/env bash
# Project copy of user session-continuity hook (synced to Surface).
# Prefer repo-local verify script.
set -euo pipefail
cat >/dev/null || true

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HOOK_DIR}/../.." && pwd)"
export PATH="${HOME}/.nvm/versions/node/v22.22.2/bin:${HOME}/.local/bin:/usr/bin:/bin:${PATH}"

VERIFY="${ROOT}/scripts/verify-agent-continuity.sh"
STATUS="unknown"
SUMMARY="verify script missing"

if [[ -f "$VERIFY" ]]; then
  set +e
  OUT="$(cd "$ROOT" && bash "$VERIFY" 2>&1)"
  RC=$?
  set -e
  SUMMARY="$(printf '%s\n' "$OUT" | tail -n 80)"
  if [[ "$RC" -eq 0 ]]; then STATUS="pass"; else STATUS="fail"; fi
else
  STATUS="fail"
fi

export CONT_STATUS="$STATUS"
export CONT_SUMMARY="$SUMMARY"
python3 - <<'PY'
import json, os
status = os.environ.get("CONT_STATUS", "unknown")
summary = os.environ.get("CONT_SUMMARY", "")
ctx = (
    "## Agent continuity (auto-verified at session start)\n\n"
    f"Status: **{status}**\n\n"
    "Mandatory: load RepoResident (`.agent/STATE.md`), MindLink (`.brain/`), "
    "memory-bank, then sync DGX→Surface after src edits.\n"
    "Companion: Companion UI on Surface :5173 (iframe :8464); PersonaPlex on DGX :8998.\n\n"
    "### Verify tail\n```\n" + summary[-3500:] + "\n```\n"
)
print(json.dumps({
    "env": {
        "OPENNEXUS_CONTINUITY_STATUS": status,
        "OPENNEXUS_CONTINUITY_VERIFIED": "1",
    },
    "additional_context": ctx,
}))
PY
exit 0
