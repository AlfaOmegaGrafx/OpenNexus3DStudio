---
name: incremental-implementation
description: >-
  Delivers changes in thin, verifiable slices with implement → test → verify →
  commit. Use when a feature touches more than one file, when picking up the
  next task from a plan, when tempted to write a large amount of code at once,
  or when a task feels too big to land in one step. OpenNexus-adapted: claim
  INFLIGHT, run Studio guards, sync --include-src, no new browser tab.
---

# Incremental implementation (OpenNexus cherry-pick)

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `incremental-implementation` (MIT). Condensed for DGX/Surface Studio work.

## Principle

Thin vertical slices. Each slice leaves the system working. Avoid implementing an entire feature in one pass.

## Cycle

```
Implement → Test → Verify → WIP-commit (or INFLIGHT claim) → Next slice
```

For each slice:

1. **Implement** the smallest complete piece
2. **Test** — targeted vitest / existing suite for touched area
3. **Verify** — build/guards that apply (`verify-studio-sync-invariants` if Studio files)
4. **Persist** — prefer WIP commit; else `bash scripts/agent-workboard.sh claim …`
5. **Sync** if `src/` changed: `bash scripts/sync-changes-to-pc.sh --include-src --retry-until-complete`
6. Tell user: **hard-refresh** existing OpenNexus 3D / Studio tab — no new browser tab

## Slicing (prefer vertical)

One path through the stack per slice (e.g. catalog label → Task Manager option → one test), not “rename everything then sync.”

Risk-first: land the uncertain piece (API contract, cancel route, guard script) before UI polish.

## OpenNexus hard stops mid-slice

- Before `git checkout HEAD` / `restore` / `stash -u`: `bash scripts/guard-destructive-git.sh --check`
- Do not rewrite whole files from HEAD “to isolate a small patch”
- Do not open Studio in a new browser tab to verify

## When NOT to use

Single-file, single-function changes where scope is already minimal.
