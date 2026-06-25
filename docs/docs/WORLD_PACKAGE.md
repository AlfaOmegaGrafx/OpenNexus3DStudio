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

## XR interaction (Galaxy XR / IWSDK)

Mesh props are grabbable in **`/xr`** via IWSDK — not custom Three.js raycast:

| Input | IWSDK component | Galaxy XR action |
|-------|-----------------|------------------|
| Far grab | `DistanceGrabbable` | Aim ray + trigger |
| Near grab | `OneHandGrabbable` | Walk up + grip squeeze |

Environment splats are **visual only** (Spark.js). Optional `environment.collider_url` supplies a walk mesh for `LocomotionEnvironment`.

Open a world on headset:

```
https://<PC-IP>:3000/xr?worldManifest=/worlds/my-world/world.manifest.json
```

Or from World Library → **XR** button. Implementation: `src/library/iwsdkWorldPackage.js`.

## API

`POST /api/v1/world-generation/image-to-world` — DGX-local pipeline (TripoSplat + optional TRELLIS props).
