# Cross-chat workboard (agents MUST read)

Updated by `scripts/agent-workboard.sh`. Authority for “what other chats left dirty”
alongside `.agent/STATE.md`. Cap: keep under ~60 lines.

## How to use

```bash
bash scripts/agent-workboard.sh status
bash scripts/agent-workboard.sh claim --id short-id --note "what" --files "path1,path2"
bash scripts/agent-workboard.sh release --id short-id
bash scripts/agent-workboard.sh refresh-dirty
```

Before `git checkout HEAD --`, `git restore`, `git stash -u`, or `git filter-repo` on `src/`:

```bash
bash scripts/guard-destructive-git.sh --check
# then for specific paths:
bash scripts/guard-destructive-git.sh --paths path1 path2
```

## Active claims

<!-- CLAIMS_START -->
<!-- CLAIMS_END -->

## Auto dirty (from last refresh-dirty)

<!-- DIRTY_START -->
_(2026-09-09T22:06:11-04:00 — no protected paths dirty)_
<!-- DIRTY_END -->
