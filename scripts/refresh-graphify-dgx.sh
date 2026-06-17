#!/usr/bin/env bash
# Refresh local Graphify AST graphs (no LLM cost). Run on DGX after meaningful code changes.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
if ! command -v graphify >/dev/null 2>&1; then
  echo "Install: curl -LsSf https://astral.sh/uv/install.sh | sh && uv tool install graphifyy"
  exit 1
fi
ROOT_CS="${HOME}/OpenNexus3DStudio"
ROOT_API="${HOME}/3DAIGC-API"
for repo in "$ROOT_CS" "$ROOT_API"; do
  if [[ -d "$repo" ]]; then
    echo "=== graphify update: $repo ==="
    (cd "$repo" && graphify update . --no-cluster)
  fi
done
echo "Done. Query: cd <repo> && graphify query \"your question\""
