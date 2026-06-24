# Spatial Fabric / Open Metaverse Browser

OpenNexus3DStudio integrates with the **[Open Metaverse Browser](https://omb.metaverse-standards.org/)** stack via **RP1 / OMB spatial fabric** on DGX.

## Architecture

```text
[OpenNexus3DStudio]  World Library, GLB Export, Task Manager
        │  spatialFabricAdapter.js + useSpatialFabric hook
        ▼
[3DAIGC-API :7842]  /api/v1/spatial-fabric/*
        │  publish_glb_to_msf, OMB validation
        ▼
[MSF_Map_Svc on DGX]  Scene Assembler + fabric/*.msf
        ▼
[Open Metaverse Browser]  VR/AR spatial fabric (OMB ecosystem)
```

This is **separate** from in-app world packages (Spark splats + `worldSceneLoader.js`) and the `/xr` IWSDK lab.

## Client entry points

| UI | Action |
|----|--------|
| **Task Manager** | **Publish RP1** on completed mesh jobs; **OMB** opens Scene Assembler |
| **GLB Export** | **Validate OMB tier**; **Send To Metaverse Browser** (viewport GLB + compression settings) |
| **World Library** | **Open Metaverse Browser** / per-world **RP1** (publishes **mesh props** from manifest); **XR** loads splat + props in main `/` session |

## API endpoints (3DAIGC-API)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/spatial-fabric/config` | Public MSF URLs + company id |
| `GET` | `/api/v1/spatial-fabric/assets/{job_id}` | Mesh stats + OMB tier before publish |
| `POST` | `/api/v1/spatial-fabric/validate-glb` | Upload GLB for OMB tier analysis |
| `POST` | `/api/v1/spatial-fabric/publish` | Copy completed job GLB into MSF object library |
| `POST` | `/api/v1/spatial-fabric/publish-glb` | Upload viewport/export GLB into MSF object library |

## Environment mapping (DGX ↔ Surface)

| DGX (3DAIGC-API `.env`) | Surface (`.env`) |
|-------------------------|------------------|
| `MSF_PUBLIC_BASE_URL` | `VITE_MSF_PUBLIC_URL` |
| `MSF_FABRIC_MSF_URL` | `VITE_RP1_FABRIC_MSF_URL` |
| `RP1_COMPANY_ID` | `VITE_RP1_COMPANY_ID` |

On DGX, run `3DAIGC-API/scripts/sync-spatial-fabric-env.sh` to copy values from `~/.config/rp1-spatial-fabric/rp1.env` into the API `.env`.

**API restart required** after adding spatial-fabric routes or MSF env vars. `start_services_detached.sh` sources `.env` so `MSF_PUBLIC_BASE_URL` is available to workers.

Verify: `curl http://127.0.0.1:7842/api/v1/spatial-fabric/config` should return `"enabled": true`.

When `VITE_API_ENDPOINT` is set, the client **prefers** `/spatial-fabric/config` over static `VITE_*` values.

## OMB tier budgets

Client-side hints mirror the API (`spatialFabricAdapter.js` → `OMB_TIER_LIMITS`). Use **Validate OMB tier** in GLB Export or **Publish RP1** preview in Task Manager for authoritative server analysis.

Guidelines: [OMB spatial fabric model guidelines](https://omb.wiki/en/spatial-fabric/model-guidelines).

## Task Manager vs World Library RP1

| Entry point | Publishes | Works when |
|-------------|-----------|------------|
| **Task Manager → Publish RP1** | Completed **mesh job** GLB → MSF object library | Any finished text/image-to-3D job with on-disk GLB |
| **World Library → RP1** | **Mesh props** listed in `world.manifest.json` | World has `props[]` with `mesh_url` (TRELLIS props). **Splat-only** worlds (`prop_count` 0) cannot RP1-publish — environment splats are not MSF props |

Log markers: `[SpatialFabric] publish complete` (mesh job) vs `[SpatialFabric] world publish complete` (world props).

## Code

| File | Role |
|------|------|
| `src/library/spatialFabricAdapter.js` | API client, URL resolution, OMB helpers |
| `src/hooks/useSpatialFabric.js` | Shared React hook for config + open/publish |
| `src/components/TaskManager.jsx` | Publish completed mesh jobs |
| `src/components/GLBExport.jsx` | Validate export + open browser |
| `src/components/WorldLibrary.jsx` | Load worlds, XR, RP1 props publish, Scene Assembler links |

## Related

- [World Package Format](docs/WORLD_PACKAGE.md) — splat + props in SceneManager (not MSF fabric)
- [IWSDK Option A Migration Blueprint](IWSDK_OPTION_A_MIGRATION_BLUEPRINT.md) — XR interaction in main `/` session
- DGX: `/home/sifr/MSF_Map_Svc` — MSF Map Service + Scene Assembler
