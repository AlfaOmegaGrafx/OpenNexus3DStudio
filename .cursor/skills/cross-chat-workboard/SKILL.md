---
name: cross-chat-workboard
description: >-
  Unifies Cursor chats via the OpenNexus INFLIGHT workboard and fail-closed
  destructive-git guard. Use when starting a session that touches src/, before
  git checkout HEAD / restore / stash -u / filter-repo / reset --hard, when
  shipping uncommitted Studio or Task Manager work, when another chat may have
  dirty files, or when the user mentions workboard, INFLIGHT, cross-chat, or
  purge/history rewrite.
---

# Cross-chat workboard

Cursor chats do **not** share context. Shared truth is disk + `.agent/INFLIGHT.md` + SessionMem.

## Required commands (OpenNexus3DStudio)

```bash
bash scripts/agent-workboard.sh status
bash scripts/agent-workboard.sh refresh-dirty
```

Read `.agent/INFLIGHT.md` when status shows claims or dirty protected paths.

## Before destructive git (NO EXCEPTIONS)

Never run without the guard:

- `git checkout HEAD -- …`
- `git restore …`
- `git stash push -u` (or stash including Studio/`src/` paths)
- `git reset --hard` / `git filter-repo` that resets the working tree

```bash
bash scripts/guard-destructive-git.sh --check
bash scripts/guard-destructive-git.sh --paths <each path you will restore>
```

If exit code is **1**, stop. Do not “copy dirty aside then checkout HEAD” unless the user explicitly OK’d discarding those files **in this turn**. Only then:

```bash
bash scripts/guard-destructive-git.sh --allow-with-user-ok --paths …
```

## When shipping uncommitted Studio / Task work

```bash
bash scripts/agent-workboard.sh claim \
  --id short-kebab \
  --chat "short topic" \
  --note "what is dirty / do not restore from HEAD" \
  --files "src/library/aiModelsCatalog.js,src/pages/StudioPage.jsx"
bash scripts/agent-workboard.sh refresh-dirty
```

Prefer a **WIP git commit** when the slice is usable. After commit or abandon:

```bash
bash scripts/agent-workboard.sh release --id short-kebab
```

Also `storeMemory` (SessionMem, importance ≥ 8) with claim id + files.

## After OpenNexus `src/` edits

```bash
bash scripts/sync-changes-to-pc.sh --include-src --retry-until-complete
```

Sync runs `verify-studio-sync-invariants.sh` first — do not bypass. Tell the user to hard-refresh the existing OpenNexus 3D / Studio tab (no new browser tab).

## Related

- Rule: `.cursor/rules/cross-chat-workboard.mdc` (alwaysApply)
- Scripts: `scripts/agent-workboard.sh`, `scripts/guard-destructive-git.sh`, `scripts/verify-studio-sync-invariants.sh`
