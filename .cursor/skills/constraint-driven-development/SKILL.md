---
name: constraint-driven-development
description: >-
  Treats the quality bar as a written, mechanical contract so agents cannot
  quietly lower it. Use when setting standards, adding quality gates, stopping
  agents from silencing checks or skipping tests, defining coverage or
  performance thresholds, or when the user says set up constraints / define our
  standards. Prefer extending OpenNexus verify scripts over inventing parallel
  prose-only rules.
---

# Constraint-driven development (OpenNexus cherry-pick)

Adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `constraint-driven-development` (MIT). Condensed and wired to this repo — do not install the full upstream pack.

## Principle

Spec says what to build. Tests prove it works. **Constraints** define “good enough to ship” with numbers/checks that outlive the chat.

## OpenNexus floor (already mechanical — obey these)

Do **not** invent a parallel `CONSTRAINTS.md` that duplicates these. Extend the scripts/rules instead.

| Constraint | Check |
|------------|--------|
| Studio Stop + generic labels + garbed preview | `bash scripts/verify-studio-sync-invariants.sh` |
| Companion navbar floating chips | `bash scripts/verify-companion-navbar.sh` |
| Cross-chat dirty / no silent `git checkout HEAD` | `bash scripts/agent-workboard.sh status` + `bash scripts/guard-destructive-git.sh --check` |
| Continuity helpers | `bash scripts/verify-agent-continuity.sh --all-repos` |
| DGX → Surface after `src/` | `bash scripts/sync-changes-to-pc.sh --include-src --retry-until-complete` |
| No new Studio browser tab | hard-refresh existing `:3000` only |
| Commercial license gate | `3DAIGC-API/docs/MODEL_LICENSES.md` — BLOCKED/UNKNOWN scrap |
| Secrets / moat | never commit `.brain/`, `src/moat/`, `.env`, staging-ardy |

## When the user asks for new constraints

1. **Detect** existing gates (scripts above, vitest, eslint, CI) — report in ≤2 lines.
2. Ask **one** question at a time if a number is missing; offer a default.
3. Encode the bar as a **script or alwaysApply rule**, not chat prose.
4. Prefer **block** on floor checks; **warn** on new experimental gates for ~2 weeks.

## Diff watch (never “get to green” by weakening the bar)

Reject or revert agent changes that:

- Add `@ts-ignore` / eslint-disable without user OK
- Skip/delete tests to pass CI
- Strip assertions or stub with `not implemented`
- Edit thresholds downward without recording why in STATE/SessionMem
- Bypass `verify-studio-sync-invariants` or sync with a broken tree

## When NOT to use

- Spikes / throwaway prototypes
- Constraints already covered by the floor table — just run the scripts
- Immediate code review only (use judgment; don’t spawn a full Osmani review pack)
