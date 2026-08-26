# Project — OpenNexus3DStudio. Cap: 80 lines.

## Architecture
- Vite React app; Three.js viewport; tasks POST to 3DAIGC-API and poll jobs.
- `src/library/taskManager.js` owns HTTP job lifecycle; `aiModelsCatalog.js` mirrors API models.
- Avatar/VRM path: trait assembly + export; AIGC mesh→rig results follow API avatar rig contract.
- XR: WebXR in-browser; IWSDK lab on `/xr`; Galaxy XR face relay is separate from `/xr` voice proxy.
- Desktop builds via Electron (`dist-win` / `dist-mac` / `dist-linux`).

## Constraints & non-goals
- Public Vercel demo must not ship LAN/DGX secrets (`verify:public-env`).
- Default: Surface runs UI; DGX runs API — don't flip without user intent.
- Sync ownership: PC owns `src/` + monetization roadmap push; DGX-owned Pitch Deck/README pull via sync scripts.
- Space-Time Host is a separate native app — OpenNexus may spawn it later (phase 2).

## Glossary
- **Task** — one generation job in the UI backed by an API feature/model.
- **Environment scan** — walk video → LingBot-Map world package (API `environment_scan`).
- **Template rig** — API Blender path applying the ICT humanoid template to AIGC mesh.
- **MSF** — fabric hosted on DGX MSF `:8443`; Surface often proxies `:8453`.

## Landmines
- Wrong Surface path (`OpenNexus3DStudio\CharacterStudio`) → real clone is often `Documents\GitHub\CharacterStudio`.
- Nested `docs/docs/docs` from bad scp → prune; use selective doc sync.
- Mixing VRM upload loader vs template-rig GLB orientation → see API_AVATAR_RIG_CONTRACT / aigcRigContract.
- Pointing headset at `localhost` hits the headset, not Surface Vite.
