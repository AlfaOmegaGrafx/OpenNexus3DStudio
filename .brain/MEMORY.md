# Project Memory

> Permanent facts about this project. Your AI reads this at the start of every session.
> Managed by MindLink — https://github.com/404-not-found/mindlink

---

<!--
  MEMORY.md is a form, not a notebook. Fill in each section — don't free-write.
  Keep Core tight: the agent reads it every session. Extended sections are
  read on demand when the task touches that area.

  Total Core target: under 50 lines. If it grows beyond that, consolidate.
  Merge related entries, remove redundant ones. A bloated memory is as
  useless as no memory.
-->

## Core  <!-- READ EVERY SESSION — keep under 50 lines total -->

### What this project is
**OpenNexus3DStudio** — cross-platform 3D AIGC app (Web, Electron, XR) for VRM avatars, AI mesh generation via 3DAIGC-API, WebXR/WebGPU, and optional blockchain hooks. <!-- added: 2026-06-26 -->
Canonical repo: AlfaOmegaGrafx/OpenNexus3DStudio (`opennexus` remote, `main`).

### Stack
Frontend: React 19, Vite, Three.js, @pixiv/three-vrm, IWSDK (`@iwsdk/core`) on `/xr`
Desktop: Electron | API: Axios → 3DAIGC-API | Tests: Vitest
Surface dev: `npm run dev` (:3000 HTTPS) | DGX backend: 3DAIGC-API :7842

### Top decisions
- DGX runs API only; OpenNexus dev server runs on Surface unless user explicitly asks otherwise <!-- added: 2026-06-26 -->
- DGX ↔ Surface sync via scp scripts — agents must not git push/pull unless user asks <!-- added: 2026-06-26 -->
- XR Voice stays on Surface `:8443` xr-hub-proxy → DGX hub `:8088`; not OpenNexus `/xr` route <!-- added: 2026-06-26 -->
- MSF browser URL: `https://10.0.0.32:8453` (Surface msf-proxy → DGX MSF :8443); not Tailscale hostname until funnel fixed <!-- added: 2026-06-26 -->
- Backend + frontend API contract changes must land in both repos (models.yaml ↔ aiModelsCatalog.js, taskManager.js, etc.) <!-- added: 2026-06-26 -->

### Current focus
Publish RP1 / Scene Assembler + MSF proxy hardening; MindLink installed Jun 26 2026.
Surface IP `10.0.0.32`, DGX `10.0.0.158`. Galaxy XR testing from Surface.

---

## Architecture  <!-- Read when the task involves project structure -->

| Machine | Role | Path |
|---------|------|------|
| Surface PC | Vite dev, Galaxy XR, msf-proxy :8453, xr-hub-proxy :8443 | `C:\Users\alfao\Documents\GitHub\OpenNexus3DStudio` |
| DGX Spark | 3DAIGC-API :7842, MSF :8443, XR hub :8088 | `/home/sifr/OpenNexus3DStudio` (sync mirror) |

Key client modules: `src/library/taskManager.js`, `spatialFabricAdapter.js`, `xrHubConfig.js`, `aiModelsCatalog.js`
SessionMem team: `.sessionmem-team/` | Cursor memory-bank: `memory-bank/` | Graphify: `graphify-out/`

---

## Decisions  <!-- Read when making a choice, or when unsure why something is the way it is -->

| Decision | What was decided | Why |
|---|---|---|
| MSF public URL | `https://10.0.0.32:8453` via Surface proxy | Tailscale hostname had no funnel/serve; connection refused |
| SpatialFabric popups | `preopenSpatialFabricTab()` before async publish | Browser popup blocker on Assembler/Publish |
| XR embed remoteLog | Parent `?remoteLog=1` propagates to iframe via `buildXrHubEmbedUrl` | Embedded XR RemoteLog debugging |
| MindLink | `.brain/` git-tracked per repo | Shared team memory alongside SessionMem + memory-bank |
| Solid Skills | `.agents/skills/solid` + `skills-lock.json` | SOLID/clean-code skill; project rules override strict TDD <!-- added: 2026-06-26 --> |

---

## Conventions  <!-- Read when writing code -->

- Code quality: `.cursor/rules/solid-skills.mdc` + `.agents/skills/solid/` — SOLID for new/refactor work; minimize scope + meaningful tests over mandatory TDD <!-- added: 2026-06-26 -->
- After DGX edits to sync-owned paths: `bash scripts/sync-changes-to-pc.sh` (add `--include-src` when `src/` changed)
- HTTPS required for WebXR — see `docs/HTTPS_SETUP.md`
- Prefer dynamic model lists from `/api/v1/system/models` over hardcoded dropdowns

---

## User Profile  <!-- READ EVERY SESSION — personal facts about the user -->

3DAIGC / OpenNexus developer; Surface + DGX Spark split workflow. Agents execute ops directly (no "run this script" handoffs).

---

## Important Context  <!-- Read when something feels off or context is missing -->

- Surface must run `npm run msf-proxy` and `npm run dev:surface` for MSF Publish/Assembler from browser
- Never commit `.env` or secrets; agent SSH key removed from GitHub after prior leak
- `spatialFabricAdapter.js` prefers env `VITE_MSF_PUBLIC_URL` over API Tailscale URL when set
