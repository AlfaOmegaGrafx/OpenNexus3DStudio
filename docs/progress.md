# Progress

**Updated:** 2026-08-05

## What works

- **OpenNexus3DStudio rebrand** + spatial fabric **Publish RP1** (Task Manager, user-confirmed 2026-06-19).
- **Incremental DGX ↔ Surface sync** — `sync-changes-to-dgx.ps1`, `sync-changes-to-pc.sh`, retry-until-complete.
- **Galaxy XR on main `/`** — grab (trigger), context menu / pan (grip), locomotion; `sceneManagerXrMouseEmulation.js`.
- **Image-to-world** — load + rehydrate (`dgx-rehydrate-world-job.py`) when Redis TTL expires; disk outputs persist on DGX.
- **World Library** — splat worlds in viewport; RP1 publishes manifest mesh props; task persistence for world jobs.
- **LingBot Environment Scan** (Jul 2026) — walk video → gravity-aligned world; Phase A isotropic Spark Gaussians; Phase B `/train-3dgs` (7–10k, densify off); floor RANSAC + wall-vs-camera fallback; door metric `0.762` m; Task Manager mm-precision true-length field.
- **Env mesh bake for OMB** (Aug 2026) — `POST /bake-env-mesh` / World Library **Bake** → `environment_mesh.glb`; RP1 publishes env GLB + props. Image-to-world RP1 remains TRELLIS props (no TripoSplat cameras for TSDF).
- **Phygital mock** — `/verify/:serialId`, `docs/PHYGITAL_*`, passport schema in `src/library/phygital/`.
- VRM upload passthrough protected; app chrome layout protected.
- DGX **3DAIGC-API** `:7842` with `/api/v1/spatial-fabric/*` after restart + `.env` MSF vars.
- **Docs canonicalization** (Aug 2026) — twin `docs/*.md` removed; content under `docs/docs/`; JSX scrub placeholder verify for production builds.
- **Space-Time Host OpenXR face+body** (Aug 2026) — Sneeze `XR_RUNTIME` probe/fixtures/Android session APIs; Galaxy XR `FACE_TRACKING`+`BODY_TRACKING` in android-xr-face-bridge; Host `--xr-probe` / `--xr-fixture-demo` / `--xr-relay`; `OPENXR_WEB_ENABLED` for dense `openxrParameters`.

## Tracker (where todos live)

| Doc | Role | Git |
|-----|------|-----|
| **`MONETIZATION_ROADMAP.md`** (repo root) | Canonical timed roadmap + checkboxes | **Gitignored moat** — sync via scp only |
| **`FUTURE_RD.md`** (repo root) | Parked R&D for later versions (e.g. age-aware body) | **Gitignored moat** — stub: `docs/FUTURE_RD.md` |
| **`3DAIGC-API/MESH_WRAP_ROADMAP.md`** (API root) | Mesh-wrap / GNM head-stitch roadmap | **Gitignored moat** — stub: `3DAIGC-API/docs/MESH_WRAP_ROADMAP.md` |
| **`memory-bank/`** (OpenNexus + 3DAIGC-API) | Agent ops / protected-state / strategy | **Gitignored moat** — scp only |
| **`backups/`** | UI chrome good-state snapshots | **Gitignored** — restore via `scripts/restore-ui-chrome.sh` |
| **`docs/progress.md`** (this file) | Shipped / not-done snapshot | **Tracked** — keep **public-safe** only (no pricing, no unreleased model/strategy names) |
| Feature roadmaps | e.g. `docs/MULTI_IMAGE_SPLAT_ROADMAP.md`, `docs/PHYGITAL_NFC_APPAREL_ROADMAP.md` | Tracked when public |

Internal timed waves, unreleased companion/speech/motion strategy, and parked R&D live **only** in gitignored moat docs (and `memory-bank/`), not here.

## Moat documentation (pointers only)

- Full strategy: `memory-bank/spacetime-moat-strategy.md` (gitignored)
- Public overview: `docs/SPACETIME_MOAT_OVERVIEW.md`
- Dev topology: `docs/docs/DEV_MACHINE_TOPOLOGY.md`
- Env-scan API: `3DAIGC-API/docs/LINGBOT_MAP_ENVIRONMENT_SCAN.md`

## Not done (public-safe)

- OMB publish + enterprise hosted-fabric packaging
- World Library RP1 for splat-only worlds without bake (use **Bake** on env-scan, or TRELLIS props on I2W)
- Micropayments on API before job queue (hosted)
- Env-scan Phase A/B billing tiers + denser-frame options (pricing in local roadmap)
- Live passport registry + SUN validation
- Wallet / pay UI wired
- §11 personalized import + API fields
- Companion handoff docs (Pro) — details in local roadmap only
