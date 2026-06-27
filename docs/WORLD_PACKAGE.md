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
    "renderer": "spark"
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

If the API returns **404** for a job whose files still exist on DGX, rehydrate Redis on DGX:

```bash
/home/sifr/3DAIGC-API/venv/bin/python \
  /home/sifr/OpenNexus3DStudio/scripts/dgx-rehydrate-world-job.py <job_id>
```

Client: `worldPackage.js` builds manifest URL candidates and surfaces a clearer 404 hint when rehydrate may help.

## API

`POST /api/v1/world-generation/image-to-world` — DGX-local pipeline (TripoSplat + optional TRELLIS props).
