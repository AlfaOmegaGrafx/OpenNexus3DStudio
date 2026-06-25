# HY-World 2.0 full image-to-world — integration scope

Scope for replacing/enhancing `opennexus_image_to_world` (TripoSplat env + TRELLIS props) with Tencent [HY-World 2.0](https://github.com/AlfaOmegaGrafx/HY-World-2.0) **World Generation** pipeline.

**Status:** WorldMirror 2.0 reconstruction is **shipped** (`worldmirror2_reconstruct`). This doc covers the **full navigable world** path.

---

## Current vs target

| | Today (`opennexus_image_to_world`) | Target (`hyworld2_image_to_world`) |
|--|-----------------------------------|-------------------------------------|
| Input | 1 reference photo | 1 photo or text → panorama |
| Environment | TripoSplat single-view `.ply` | Trained 3DGS world (multi-view consistent) |
| Scale | Room-ish splat blob | Navigable scene with trajectory |
| Props | Optional TRELLIS.2 bbox crops | WorldStereo keyframes + composition |
| Client | `world.manifest.json` + Spark + IWSDK | Same manifest contract (extend) |
| DGX cost | ~20 GB VRAM, minutes | **Multi-stage, hours; 17B+ models** |

---

## HY-World pipeline (5 stages + pano)

From `thirdparty/HY-World-2.0/hyworld2/worldgen/README.md`:

| Stage | Script | GPU | External deps |
|-------|--------|-----|----------------|
| 0. Panorama | `hyworld2/panogen` (HY-Pano-2) | 1+ | HF `HY-Pano-2.0` (~80B or 425M Qwen LoRA) |
| 1. Trajectory | `traj_generate.py` | 1 | **vLLM** + Qwen3-VL-8B |
| 2. Trajectory render | `traj_render.py` | multi (8 tested) | vLLM |
| 3. World expansion | `video_gen.py` | multi + FSDP | WorldStereo-2 (~17B) |
| 4. GS data prep | `gen_gs_data.py` | CPU/GPU | WorldMirror depth/normals |
| 5. 3DGS train | `world_gs_trainer.py` | 1+ | `gsplat_maskgaussian` |

Output: optimized Gaussian splat world + cameras → export `.ply` for Spark.js.

---

## Proposed API shape

### New model (keep TripoSplat path)

```yaml
# config/models.yaml
image_to_world:
  opennexus_image_to_world:  # existing — fast path
    enabled: true
  hyworld2_image_to_world:   # new — quality path
    enabled: false             # flip when staged pipeline verified
    vram_requirement: 81920    # peak across stages
    max_workers: 1
```

### Job inputs

```json
{
  "image_file_id": "...",
  "model_preference": "hyworld2_image_to_world",
  "model_parameters": {
    "pano_model": "hy-pano-2-qwen",
    "worldstereo_checkpoint": "auto",
    "llm_addr": "127.0.0.1",
    "llm_port": 8000,
    "llm_name": "Qwen/Qwen3-VL-8B-Instruct",
    "target_path_subdir": "job_{job_id}",
    "skip_stages": []
  }
}
```

### Job outputs (extend world manifest v2)

```json
{
  "version": 2,
  "generator": "hyworld2_image_to_world",
  "environment": {
    "type": "gaussian_splat",
    "url": "environment.ply",
    "scale": 1.0,
    "origin": "floor_center"
  },
  "props": [],
  "collider": null,
  "metadata": {
    "stages_completed": ["pano", "traj", "expand", "gs_train"],
    "hyworld_scene_dir": "outputs/worlds/{job_id}/"
  }
}
```

Client: no new task type — same **Image to World** with model picker `hyworld2_image_to_world`.

---

## Adapter architecture (3DAIGC-API)

**`adapters/hyworld2_image_to_world_adapter.py`** — orchestrator, not monolithic inference:

```
_process_request():
  1. Stage images → workspace outputs/worlds/{job_id}/
  2. If no panorama: run panogen CLI / HunyuanPanoPipeline
  3. subprocess traj_generate.py (needs vLLM)
  4. subprocess torchrun traj_render.py
  5. subprocess torchrun video_gen.py
  6. subprocess gen_gs_data.py
  7. subprocess world_gs_trainer.py
  8. Copy final .ply → manifest paths
  9. Emit world.manifest.json (reuse image_to_world_adapter helpers)
```

Progress callbacks: write `job_progress.json` per stage for client polling.

**Failure policy:** stage timeout + log tail; do not partial-publish manifest unless stage ≥5 completes.

---

## Infrastructure prerequisites (DGX)

| Requirement | Notes |
|-------------|--------|
| HY-World repo | `thirdparty/HY-World-2.0` ✅ cloned |
| WorldMirror | ✅ shipped for splat reconstruction |
| worldgen deps | `requirements_git.txt`, submodules, `gsplat_maskgaussian`, navmesh |
| **vLLM server** | Separate process; Qwen3-VL-8B for traj stages 1–2 |
| HF weights | HY-Pano-2, WorldStereo-2, WorldMirror (partial ✅) |
| Disk | 50–100 GB per world job (intermediates) |
| GPU policy | Serialize with other 23GB+ jobs; dedicated queue recommended |

**Not on single Spark GPU today:** Full 8-GPU torchrun paths. Phase rollout should support **reduced GPU count** or stage skipping for smoke tests.

---

## Phased rollout

### Phase A — Panorama only (smoke)
- Adapter runs HY-Pano-2-Qwen on input photo → 360° panorama PNG
- Client preview in IWSDK skybox / world layer placeholder
- **Validates:** panogen install, HF auth, VRAM

### Phase B — Trajectory + render (no WorldStereo)
- vLLM sidecar in `scripts/start_vllm_worldgen.sh`
- Stages 1–2 only; export camera path JSON on manifest
- **Validates:** LLM integration, navmesh submodule

### Phase C — WorldStereo expansion
- Stage 3 `video_gen.py` on 1–2 GPUs (reduced config)
- **Validates:** 17B model load, FSDP on GB200

### Phase D — Full 3DGS train + manifest
- Stages 4–5 → `.ply` → existing Spark/IWSDK world loader
- Feature flag `hyworld2_image_to_world.enabled: true`
- A/B vs TripoSplat on same photos

### Phase E — Text-to-world
- Optional prompt → HY-Pano text mode → same pipeline

---

## Client changes (OpenNexus3DStudio)

| Area | Change |
|------|--------|
| `aiModelsCatalog.js` | `hyworld2_image_to_world` entry |
| `TaskManager.jsx` | Model picker for image-to-world; progress UI for multi-stage |
| `taskManager.js` | Poll `job_progress` / stage field if API adds it |
| `worldPackage.js` | Manifest v2 `generator` field; same splat load path |
| `iwsdkWorldPackage.js` | No change if `.ply` + manifest unchanged |

---

## Risks

| Risk | Mitigation |
|------|------------|
| 8-GPU assumption in upstream | Patch torchrun `--nproc_per_node=1` for Spark; document quality tradeoff |
| vLLM ops burden | Optional: skip VLM traj, use fixed camera orbit for MVP |
| Job runtime hours | `max_workers: 1`, queue priority, user-facing ETA |
| License | Tencent HY-World license — add to `docs/MODEL_LICENSES.md` |

---

## Testing plan

```bash
# API unit
pytest tests/test_hyworld2_available.py

# Stage A smoke (after panogen install)
python -m hyworld2.panogen... --image assets/open3dstudio_demo.jpg

# End-to-end (Phase D)
curl -X POST .../world-generation/image-to-world \
  -d '{"model_preference":"hyworld2_image_to_world", ...}'
```

---

## Related docs

- `docs/MULTI_IMAGE_SPLAT_ROADMAP.md` — WorldMirror reconstruction (done)
- `thirdparty/HY-World-2.0/hyworld2/worldgen/README.md` — upstream stages
- `OpenNexus3DStudio/docs/WORLD_PACKAGE.md` — client manifest contract
