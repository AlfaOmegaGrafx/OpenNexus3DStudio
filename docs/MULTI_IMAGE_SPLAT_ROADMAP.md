# Multi-image splat & avatar roadmap

Three-tier plan for using **multiple photos** toward better splats and avatars.
OpenNexus3DStudio + 3DAIGC-API share this doc.

## Current state

| Path | Images | Engine |
|------|--------|--------|
| `image-to-splat` (1 photo) | **1** | TripoSplat |
| `image-to-splat` (2+ photos) | **2–8** | WorldMirror 2.0 → `gaussians.ply` (falls back to TripoSplat primary if unavailable) |
| `image-to-splat` (3+ photos, no WorldMirror) | **3–8** | COLMAP sparse → PLY |
| `image-to-world` | **1+** | TripoSplat env + optional TRELLIS props |
| Avatar mesh (2+ photos) | **2–8** | TRELLIS v1 `run_multi_image` (TRELLIS.2 delegates when multiview on) |
| Avatar → splat preview | **1+** | TripoSplat or COLMAP when 3+ refs |

---

## Phase 1 — Multi-image UX + API contract (shipped)

**Goal:** Users attach several photos; primary + references flow through API and job metadata.

### API

Optional on splat, world, and mesh requests:

| Field | Role |
|-------|------|
| `image_file_id` | **Primary** view (required for inference) |
| `reference_image_file_ids` | Up to 7 extra uploaded `file_id`s (8 total) |

### Client

- Multi-select on **Image to Splat**, **Image to World**, **Avatar from Image**
- User marks which thumbnail is **Primary**
- Uploads all files; sends `reference_image_file_ids` with the job

---

## Phase 2 — Multiview avatar mesh (shipped, partial splat turnaround)

**Goal:** Fuse multiple views for **mesh** quality.

### Backend (shipped)

- `mesh_generation` resolves all local paths; sets `use_multiview_mesh: true` when ≥2 images
- `trellis_adapter` → `pipeline.run_multi_image()` when multiview enabled
- `trellis2_adapter` delegates to TRELLIS v1 multiview when ≥2 views and `use_multiview_mesh` not false

### Client (shipped)

- Checkbox **“Use all photos for mesh (TRELLIS multiview)”** when ≥2 photos on supported tasks
- Avatar pipeline auto-selects `trellis_image_to_textured_mesh` when references present + multiview on

### Not yet shipped

- Blender turnaround render → splat from mesh (8–12 views)
- Hunyuan3D 2.1 multiview wiring

### Notes

- TRELLIS v1 multiview may fail on GB200-class GPUs (xformers). Single-photo avatar still uses TRELLIS.2 by default.

---

## Phase 3 — WorldMirror 2.0 + COLMAP reconstruction (shipped)

**Goal:** Photogrammetry splats from multiple photos.

### Backend (shipped)

| Component | Status |
|-----------|--------|
| `worldmirror2_reconstruct` | **Primary** — WorldMirror 2.0 feed-forward 3DGS (`thirdparty/HY-World-2.0`) |
| `colmap_3dgs_reconstruct` | Fallback when WorldMirror unavailable and 3+ photos |
| `splat_generation` router | Auto-selects WorldMirror when ≥2 images |

### Client (shipped)

- `worldmirror2_reconstruct` in model catalog
- Image-to-splat auto-routes: 1 photo → TripoSplat, 2+ → WorldMirror

### Host setup (DGX)

```bash
# Already cloned to thirdparty/HY-World-2.0
bash scripts/install_worldmirror2_deps.sh
# Weights download on first job from tencent/HY-World-2.0
```

Optional COLMAP fallback: `sudo apt install colmap`

### Future

- Full gsplat training/refinement from COLMAP cameras (not just sparse point PLY)
- Dedicated **Photos to Splat** task type with progress stages

---

## Related tracks

| Track | Relation |
|-------|----------|
| [ARC2AVATAR_TRACK.md](ARC2AVATAR_TRACK.md) | Single-image **head** splat composite on rigged body |
| [AVATAR_PIPELINE.md](AVATAR_PIPELINE.md) | Optional splat preview on avatar-from-image |
| [API_AVATAR_RIG_CONTRACT.md](API_AVATAR_RIG_CONTRACT.md) | Mesh bounds must match after template rig |

## Testing

```bash
# API (DGX)
./venv/bin/python -m pytest tests/test_multi_image_input.py -q

# Client (Surface)
npm test -- src/__tests__/multiImageInput.test.js
```
