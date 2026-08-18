# World Package Format

Explorable Gaussian-splat environments with optional mesh props for OpenNexus3DStudio / Galaxy XR.

## Layout

```
worlds/
  my-world-v1/
    world.manifest.json
    reference.jpg
    environment.ply
    props/
      lamp.glb
```

## Manifest (`world.manifest.json`)

```json
{
  "id": "my-world-v1",
  "version": 1,
  "name": "My World",
  "spawn": { "position": [0, 0, 0], "rotation_y": 0, "player_height": 1.6 },
  "environment": {
    "type": "gaussian_splat",
    "url": "environment.ply",
    "format": "ply",
    "renderer": "spark",
    "mesh_url": "environment_mesh.glb",
    "collider_url": "collider.glb"
  },
  "props": [
    {
      "id": "lamp",
      "role": "interactable",
      "mesh_url": "props/lamp.glb",
      "transform": { "position": [1, 0, -1], "rotation_y": 0, "scale": 1 },
      "interaction": { "type": "grabbable", "collider": "auto_bbox" }
    }
  ]
}
```

- `environment.url` — Spark splat (viewport). Never published to RP1/OMB as-is.
- `environment.mesh_url` — optional OMB/RP1 GLB from `POST /bake-env-mesh` (LingBot env-scan with `gs_dataset/`).
- `environment.collider_url` — optional walk/physics mesh (often `collider.glb` from the same bake).
- `props[]` — TRELLIS (or other) GLBs; Image-to-World RP1 path when no env mesh.

## Scene layers

| Layer | Root | Contents |
|-------|------|----------|
| Player | `playerRoot` | Rigged avatar (VRM/GLB) |
| World | `worldRoot` | Environment splat |
| Props | `propsRoot` | Interactable mesh props |

Avatar loads never replace world/props. World loads never replace avatar.

## XR interaction (Galaxy XR)

Mesh props are grabbable in the **main app** (`/`) via SceneManager IWSDK Option A — distance/proximity grab, thumbstick locomotion, grip → context menu on hit / pan on miss.

| Input (Galaxy XR) | Main `/` session |
|-------------------|------------------|
| **Trigger (select)** | Grab (distance + proximity) |
| **Grip (squeeze)** | Ray hit → right-click / model menu; miss → Ctrl+pan |
| **Right stick** | Locomotion / teleport aim |

The **`/xr`** IWSDK lab remains for regression (`iwsdkWorldPackage.js`):

| Input | IWSDK component | Galaxy XR action |
|-------|-----------------|------------------|
| Far grab | `DistanceGrabbable` | Aim ray + trigger |
| Near grab | `OneHandGrabbable` | Walk up + grip squeeze |

Environment splats are **visual only** (Spark.js). Optional `environment.collider_url` supplies a walk mesh for locomotion.

Open a world on headset:

```
https://<PC-IP>:3000/?worldManifest=/worlds/my-world/world.manifest.json
```

Or from World Library → **XR** button. Implementation: `worldSceneLoader.js` (main `/`) and `iwsdkWorldPackage.js` (`/xr` lab).

## API jobs and Redis TTL

`POST /api/v1/world-generation/image-to-world` registers the job in **Redis** (~24h TTL). On-disk outputs remain under `3DAIGC-API/outputs/worlds/{job_id}/`.

Walk / Galaxy XR physical replica scans use `POST /api/v1/world-generation/environment-scan` (LingBot-Map). Pass `metric_calibration` so `environment.transform.scale` is meters (1:1). Manifest metadata includes `metric_calibration.one_to_one` and `coordinate_units: "meters"`.

**Phase A / Phase B:** set `refine_to_3dgs: true` for isotropic Spark Gaussians (Phase A). Optionally `train_3dgs: true` (or later `POST /train-3dgs`) for photometric gsplat train — prefer **7–10k** steps, densify **off**. Door metric: `mode: reference_length`, `axis: horizontal`, `true_meters: 0.762` (30 in), measured `recon_length`. Gravity uses floor RANSAC by default (`prefer_floor`); wall-heavy close-ups fall back to camera-up. Client loads LingBot Gaussians with `orientationMode: 'none'`. See `3DAIGC-API/docs/LINGBOT_MAP_ENVIRONMENT_SCAN.md`.

**Env mesh bake (OMB):** `POST /bake-env-mesh` (or `bake_env_mesh: true` on env-scan) writes `environment.mesh_url` for Scene Assembler. Image-to-world (TripoSplat) has no cameras — RP1 uses TRELLIS props only.

If the API returns **404** for a job whose files still exist on DGX, rehydrate Redis on DGX:

```bash
<path-to-3DAIGC-API-venv>/bin/python \
  <OPENNEXUS_REPO_ROOT>/scripts/dgx-rehydrate-world-job.py <job_id>
```

Client: `worldPackage.js` builds manifest URL candidates and surfaces a clearer 404 hint when rehydrate may help.

## API

`POST /api/v1/world-generation/image-to-world` — DGX-local pipeline (TripoSplat + optional TRELLIS props).

`POST /api/v1/world-generation/environment-scan` — walk video / ≥3 frames → LingBot-Map world package (optional Phase A/B 3DGS) + `metric_calibration` for 1:1 meters.

`POST /api/v1/world-generation/train-3dgs` — Phase B gsplat train on an existing env-scan world with `gs_dataset/`.

`POST /api/v1/world-generation/bake-env-mesh` — TSDF bake → `environment_mesh.glb` for RP1/OMB (requires `gs_dataset/`; not TripoSplat I2W).

See `3DAIGC-API/docs/LINGBOT_MAP_ENVIRONMENT_SCAN.md`.
