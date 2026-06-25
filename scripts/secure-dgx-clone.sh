#!/usr/bin/env bash
# Sync DGX clone to cleaned GitHub main; preserve local .env and roadmap.
set -euo pipefail
REPO="${1:-$HOME/OpenNexus3DStudio}"
cd "$REPO"
echo "=== Securing DGX clone: $REPO ==="
BACKUP_DIR=$(mktemp -d)
for f in .env .mcp.json MONETIZATION_ROADMAP.md; do
  [ -f "$f" ] && cp -a "$f" "$BACKUP_DIR/" && echo "Backed up $f"
done
git remote remove opennexus 2>/dev/null || true
git remote add opennexus https://github.com/AlfaOmegaGrafx/OpenNexus3DStudio.git 2>/dev/null || \
  git remote set-url opennexus https://github.com/AlfaOmegaGrafx/OpenNexus3DStudio.git
git fetch opennexus main
git reset --hard opennexus/main
git clean -fd --exclude=.env --exclude=.mcp.json --exclude=MONETIZATION_ROADMAP.md 2>/dev/null || git clean -fd
for f in .env .mcp.json MONETIZATION_ROADMAP.md; do
  [ -f "$BACKUP_DIR/$f" ] && cp -a "$BACKUP_DIR/$f" "$f" && echo "Restored $f"
done
rm -rf "$BACKUP_DIR"
sh scripts/install-secret-guard-hook.sh 2>/dev/null || true
echo "=== Post-sync scan ==="
bash scripts/scan-repo-secrets.sh .
