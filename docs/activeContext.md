# Active context

**Updated:** 2026-06-21

## Current focus

- **Dev ops (Jun 21):** Incremental sync both directions — `sync-changes-to-dgx.ps1` / `sync-changes-to-pc.sh` with `--retry-until-complete`; DGX rule + cheatsheet aligned.
- **XR (Jun 21):** Main `/` Galaxy XR — trigger grab, grip → context menu / pan; IWSDK Option A on SceneManager.
- **Worlds (Jun 21):** Image-to-world Redis TTL + `dgx-rehydrate-world-job.py`; World Library RP1 publishes mesh props only (splat-only → `prop_count` 0).
- **MONETIZATION_ROADMAP v3.3.4 (2026-06-21):** Sync ops, XR/worlds, phygital mock; Pitch Decks revised.
- **Spatial fabric / RP1 (locked good state 2026-06-19):** Task Manager **Publish RP1** working; see [spatial-fabric-rp1-protected-state.md](spatial-fabric-rp1-protected-state.md).
- **Phygital Phase 0:** Mock `/verify/:serialId` + passport API contract docs.

## Locked decisions

- **Spatial fabric RP1:** user-confirmed good (2026-06-19); rule `.cursor/rules/spatial-fabric-rp1-protected.mdc`.
- **Incremental sync:** preferred over full `sync-to-*` for routine edits; never pipe sync output through `head` / `Select-Object -First`.
- VRM upload passthrough + app chrome layout — separate protected states.
- OSS client ≠ moat; trademark + hosted API + registry + asset graph = moat.
- `MONETIZATION_ROADMAP.md` and `memory-bank/` stay gitignored; never push to GitHub.

## Next implementation (moat-unlocking)

1. x402 middleware on 3DAIGC-API (quote before queue) — §6.1 checklist.
2. Thirdweb ConnectButton + x402 UI (`THIRDWEB_BENEFITS_AND_UI.md`).
3. §11 `personality_context` schema + Pro import flow.
4. Phygital passport API (hosted) + NFC supplier Phase 2.
5. World Library RP1 for splat-only worlds (optional prop generation path).
