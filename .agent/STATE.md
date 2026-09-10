# State — rewritten in full at session END. Cap: 40 lines.

Session: 47
Focus: Cross-chat workboard + Studio sync guards
Active: API :7842 stack; Studio labels/Stop/garbed restored
Next: hard-refresh existing OpenNexus 3D / Studio tab; WIP-commit Studio slice when ready
Blocked: none

## Watch-outs
- **NO EXCEPTIONS:** Checklist A (8) / B every turn
- **HARD STOP:** never open a new Studio browser tab
- **Cross-chat:** read `.agent/INFLIGHT.md` + `bash scripts/agent-workboard.sh status`
- **Never** `git checkout HEAD --` / `restore` / `stash -u` on Studio paths without `guard-destructive-git.sh`
- PersonaPlex ~19GB resident — Krea 24GB gate should fit

## Recently shipped
- verify-studio-sync-invariants + sync fail-closed
- agent-workboard + guard-destructive-git (unify chats)
- Studio labels / Stop / garbed restored from Surface
- Cherry-pick skills: constraint-driven-development + incremental-implementation (Osmani MIT adapted; no full packs)

## INFLIGHT
- See `.agent/INFLIGHT.md` — claim `studio-labels-stop-garbed`

## INFLIGHT
- See `.agent/INFLIGHT.md` (cross-chat dirty claims) — run `bash scripts/agent-workboard.sh status`
