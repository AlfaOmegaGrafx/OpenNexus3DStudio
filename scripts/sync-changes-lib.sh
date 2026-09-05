#!/usr/bin/env bash
# Shared helpers for git-changed incremental sync (DGX <-> Surface).
# Source from sync-changes-to-pc.sh — do not run directly.

set -euo pipefail

SYNC_REPO_ROOT="${SYNC_REPO_ROOT:-}"
SYNC_SSH_TARGET="${SYNC_SSH_TARGET:-}"
SYNC_REMOTE_ROOT="${SYNC_REMOTE_ROOT:-}"
SYNC_MAX_RETRIES="${SYNC_MAX_RETRIES:-3}"
SYNC_FAILED_ITEMS=()

sync_win_path() {
  printf '%s' "$1" | tr '/' '\\'
}

sync_ensure_remote_dir() {
  local rel="$1"
  local win="${SYNC_REMOTE_ROOT}/${rel}"
  win="$(sync_win_path "$win")"
  ssh -o ConnectTimeout=15 "$SYNC_SSH_TARGET" \
    "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '${win}' | Out-Null\""
}

sync_scp_with_retry() {
  local label="$1"
  shift
  local attempt=1
  while [[ "$attempt" -le "$SYNC_MAX_RETRIES" ]]; do
    if "$@"; then
      return 0
    fi
    if [[ "$attempt" -ge "$SYNC_MAX_RETRIES" ]]; then
      echo "  FAIL $label (after $attempt tries)" >&2
      SYNC_FAILED_ITEMS+=("$label")
      return 1
    fi
    echo "  retry $attempt/$SYNC_MAX_RETRIES $label" >&2
    sleep "$((attempt * 2))"
    attempt=$((attempt + 1))
  done
  return 1
}

sync_push_file() {
  local rel="$1"
  local parent
  parent="$(dirname "$rel")"
  if [[ "$parent" != '.' ]]; then
    sync_ensure_remote_dir "$parent"
  fi
  sync_scp_with_retry "$rel" scp "${SYNC_REPO_ROOT}/${rel}" "${SYNC_SSH_TARGET}:${SYNC_REMOTE_ROOT}/${rel}"
  echo "  OK $rel"
}

sync_get_git_changed_paths() {
  local root="$1"
  (
    cd "$root"
    git status --porcelain -u 2>/dev/null | while IFS= read -r line; do
      [[ ${#line} -lt 4 ]] && continue
      local path="${line:3}"
      path="${path#"${path%%[![:space:]]*}"}"
      if [[ "$path" == *" -> "* ]]; then
        path="${path##* -> }"
        path="${path#"${path%%[![:space:]]*}"}"
      fi
      printf '%s\n' "$path"
    done | sort -u
  )
}

# DGX-owned paths (mirror of sync-to-pc.sh defaults).
sync_is_dgx_owned_path() {
  local rel="$1"
  local include_src="${2:-0}"
  local include_agent="${3:-0}"
  local include_docs="${4:-0}"

  rel="${rel//\\//}"

  if [[ "$rel" =~ ^(graphify-out|\.env|uploads/|MONETIZATION_ROADMAP\.md|\.brain/|\.sessionmem-team/|scripts/staging-ardy/|scripts/tmp-) ]]; then
    return 1
  fi
  # Secrets / local MCP — never scp to Surface as part of change sync
  if [[ "$rel" =~ ^\.cursor/mcp\.json$ ]]; then
    return 1
  fi

  if [[ "$include_src" -eq 1 && "$rel" =~ ^src/ ]]; then
    return 0
  fi
  # Gitignored companion overlay still syncs to Surface (not via GitHub).
  if [[ "$include_src" -eq 1 && "$rel" =~ ^scripts/(companion-|start-companion|ensure-companion|sync-companion) ]]; then
    return 0
  fi
  if [[ "$rel" =~ ^src/ ]]; then
    return 1
  fi

  if [[ "$rel" =~ ^Pitch\ Deck/ ]]; then return 0; fi
  if [[ "$rel" =~ ^public/worlds/ ]]; then return 0; fi

  case "$rel" in
    README.md|package.json|package-lock.json|vite.config.js|vercel.json|index.html|.env.example|.env.production.example)
      return 0
      ;;
  esac

  if [[ "$include_agent" -eq 1 && "$rel" =~ ^memory-bank/ ]]; then return 0; fi
  if [[ "$include_agent" -eq 1 && "$rel" =~ ^graphify-out/ ]]; then return 0; fi

  if [[ "$include_docs" -eq 1 && "$rel" =~ ^docs/ ]]; then return 0; fi
  if [[ "$rel" =~ ^docs/PUBLIC_DEPLOY\.md || "$rel" =~ ^docs/package\.json || "$rel" =~ ^docs/jsconfig\.json ]]; then
    return 0
  fi
  if [[ "$rel" =~ ^docs/docusaurus\.config\.js || "$rel" =~ ^docs/docs/ ]]; then return 0; fi
  if [[ "$rel" =~ ^docs/DEV_MACHINE_TOPOLOGY\.md ]]; then return 0; fi

  if [[ "$rel" =~ ^scripts/ ]]; then
    case "$(basename "$rel")" in
      sync-to-dgx.ps1|sync-from-dgx.ps1|sync-dgx.ps1|sync-changes-to-dgx.ps1|sync-dgx-push-lib.ps1)
        return 0
        ;;
      sync-to-pc.sh|sync-changes-to-pc.sh|sync-changes-lib.sh|prune-sync-duplicates.sh|prune-sync-duplicates.ps1|sync-pitch-deck-to-dgx.ps1|ensure-dgx-sync-ready.sh)
        return 0
        ;;
      sync-cheatsheet-to-desktop.sh|sync-cheatsheet-to-desktop.ps1|sync-lock-utils.sh)
        return 0
        ;;
      sync-sessionmem-team.sh|sync-sessionmem-team.ps1|verify-agent-continuity.sh|verify-agent-continuity.ps1|verify-agent-continuity-hook.ps1)
        return 0
        ;;
      verify-public-build-env.mjs|pre-commit-block-secrets.sh|verify_krea2_text_to_3d_pipeline.sh)
        return 0
        ;;
      companion-chat-proxy.mjs|companion-surface-proxy.mjs|ensure-dev-certs.mjs|start-companion-chat.sh|start-companion-chat-surface.ps1|start-companion-surface-proxy.ps1|start-companion-surface-proxy.sh|ensure-companion-stack-dgx.sh|sync-companion-to-surface.sh|grounding-dino-proxy.mjs)
        return 0
        ;;
      *)
        return 1
        ;;
    esac
  fi

  if [[ "$rel" =~ ^\.agent/ || "$rel" == "CLAUDE.md" || "$rel" == "AGENTS.md" ]]; then
    return 0
  fi
  if [[ "$rel" =~ ^\.cursor/hooks\.json$ || "$rel" =~ ^\.cursor/hooks/ ]]; then
    return 0
  fi
  if [[ "$rel" =~ ^\.cursor/rules/surface-sync-reminder\.mdc || "$rel" =~ ^\.cursor/rules/dgx-sync-reminder\.mdc ]]; then
    return 0
  fi
  if [[ "$rel" =~ ^\.cursor/rules/krea2-text-to-3d-pipeline-protected\.mdc || "$rel" =~ ^\.cursor/rules/image-preview-sizing-protected\.mdc ]]; then
    return 0
  fi
  if [[ "$rel" =~ ^\.cursor/rules/new-scripts-ops-cheatsheet\.mdc || "$rel" =~ ^\.cursor/rules/terse-debug-ops\.mdc ]]; then
    return 0
  fi
  if [[ "$rel" =~ ^\.cursor/rules/agent-continuity-startup\.mdc || "$rel" =~ ^\.cursor/rules/agent-run-instructions\.mdc ]]; then
    return 0
  fi
  if [[ "$include_docs" -eq 1 && "$rel" == "docs/scripts-cheatsheet.md" ]]; then
    return 0
  fi

  return 1
}

sync_collect_changed_paths() {
  local root="$1"
  local include_src="${2:-0}"
  local include_agent="${3:-0}"
  local include_docs="${4:-0}"
  local -a out=()
  local rel abs
  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    sync_is_dgx_owned_path "$rel" "$include_src" "$include_agent" "$include_docs" || continue
    abs="${root}/${rel}"
    [[ -f "$abs" ]] || continue
    out+=("$rel")
  done < <(sync_get_git_changed_paths "$root")

  if [[ "$include_src" -eq 1 ]]; then
    local overlay
    while IFS= read -r overlay; do
      [[ -z "$overlay" ]] && continue
      abs="${root}/${overlay}"
      [[ -f "$abs" ]] || continue
      out+=("$overlay")
    done < <(sync_local_overlay_paths "$root")
  fi

  printf '%s\n' "${out[@]}" | sort -u
}

# Gitignored live companion files — still scp to Surface when --include-src.
sync_local_overlay_paths() {
  local root="$1"
  if [[ -d "${root}/src/moat" ]]; then
    find "${root}/src/moat" -type f -printf '%P\n' | while IFS= read -r rel; do
      [[ -z "$rel" ]] && continue
      # Agent graph cache — local-only; never sync (Vite watch noise + moat hygiene).
      [[ "$rel" == graphify-out/* ]] && continue
      printf 'src/moat/%s\n' "$rel"
    done
  fi
  local name
  for name in \
    companion-chat-proxy.mjs \
    companion-surface-proxy.mjs \
    start-companion-chat.sh \
    start-companion-chat-surface.ps1 \
    start-companion-surface-proxy.ps1 \
    start-companion-surface-proxy.sh \
    ensure-companion-stack-dgx.sh \
    sync-companion-to-surface.sh
  do
    [[ -f "${root}/scripts/${name}" ]] && printf 'scripts/%s\n' "$name"
  done
}

sync_retry_failed_items() {
  local max_rounds="${1:-8}"
  local retry_until_complete="${2:-0}"
  local -a pending=("$@")
  pending=("${pending[@]:2}")
  local round=0 failed=()

  while [[ ${#pending[@]} -gt 0 ]]; do
    round=$((round + 1))
    if [[ "$round" -gt "$max_rounds" ]]; then
      echo "Stopped after $max_rounds rounds; ${#pending[@]} item(s) still failed." >&2
      printf '%s\n' "${pending[@]}"
      return 1
    fi
    if [[ "$round" -gt 1 ]]; then
      echo "Retry round $round/$max_rounds (${#pending[@]} item(s)) ..."
    fi
    SYNC_FAILED_ITEMS=()
    failed=()
    local rel
    for rel in "${pending[@]}"; do
      sync_push_file "$rel" || failed+=("$rel")
    done
    if [[ ${#failed[@]} -eq 0 ]]; then
      return 0
    fi
    if [[ "$retry_until_complete" -eq 0 ]]; then
      printf '%s\n' "${failed[@]}"
      return 1
    fi
    pending=("${failed[@]}")
    sleep 2
  done
  return 0
}
