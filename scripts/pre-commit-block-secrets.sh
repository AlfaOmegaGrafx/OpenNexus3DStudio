#!/bin/sh
# Block commits that contain likely secrets (local-only paths should be gitignored).
set -e
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

# Refuse staging of paths that must stay local
BLOCKED=$(git diff --cached --name-only | grep -iE '^\.env$|^\.env\.(local|production|backup|default)$|MONETIZATION_ROADMAP|Pitch Deck/|^uploads/|\.pem$|^certs/|\.mcp\.json$|^\.codex/|^\.iwsdk/' || true)
if [ -n "$BLOCKED" ]; then
  echo "ERROR: Refusing to commit local-only files:"
  echo "$BLOCKED"
  echo "These paths must stay gitignored. Use .env.example for templates."
  exit 1
fi

# Pattern scan on staged text (not binary); skip security maintenance manifests
SCAN_FILES=$(git diff --cached --name-only | grep -vE '^scripts/security-replace-text\.txt$|^scripts/security-purge-paths\.txt$' || true)
if [ -n "$SCAN_FILES" ]; then
  PATTERNS='THIRDWEB_SECRET_KEY=[a-zA-Z0-9_]{20,}|VITE_AVATARSDK_CLIENT_SECRET=[A-Za-z0-9]{20,}|PLAYWRIGHT_MCP_EXTENSION_TOKEN=[a-zA-Z0-9_-]{10,}|ghp_[a-zA-Z0-9]{20,}|sk-[a-zA-Z0-9]{20,}'
  if git diff --cached -U0 --no-color -- $SCAN_FILES 2>/dev/null | grep -iE "$PATTERNS" >/dev/null 2>&1; then
    echo "ERROR: Staged diff matches secret patterns. Remove credentials before committing."
    exit 1
  fi
fi

exit 0
