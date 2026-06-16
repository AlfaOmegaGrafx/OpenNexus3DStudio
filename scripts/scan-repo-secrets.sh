#!/usr/bin/env bash
# Local security scan — run on PC or DGX clone (never commits results).
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"
echo "=== Repo: $(pwd) ==="
echo "=== HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo 'not a git repo') ==="
echo "--- Tracked sensitive paths ---"
git ls-files 2>/dev/null | grep -iE '^\.env$|MONETIZATION|\.pem$|mcp\.json|Pitch Deck|uploads/|WALLET_COMPARISON|protect-monetization|known_hosts|ssh\.config' || echo "(none)"
echo "--- History: .env commits ---"
git log --oneline -- .env 2>/dev/null | head -3 || echo "(none)"
echo "--- Local secret files present (ok if gitignored) ---"
for f in .env MONETIZATION_ROADMAP.md .mcp.json; do
  [ -f "$f" ] && echo "LOCAL: $f" || true
done
echo "--- Hardcoded tokens in tracked source ---"
git grep -nE 'PLAYWRIGHT_MCP_EXTENSION_TOKEN\s*=\s*['\''\"][a-zA-Z0-9_-]{8,}|THIRDWEB_SECRET_KEY=[a-zA-Z0-9]{20,}|CLIENT_SECRET=[A-Za-z0-9]{20,}' -- ':!*.example' 2>/dev/null | head -30 || echo "(none)"
