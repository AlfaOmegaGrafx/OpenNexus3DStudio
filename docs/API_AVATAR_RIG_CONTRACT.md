# API avatar rig export contract

**Status (2026-06-24):** Template-rig export, API gate, and client validation are aligned on **Y-up**, **-Z forward**, and **feet on the floor**. Upright/inverted and yaw-after-parenting regressions from the June 2026 Blender path are fixed on DGX; the client validates on load and applies only targeted skinned-mesh repair — it does **not** reuse VRM loader flags on AIGC GLBs.

OpenNexus3DStudio and the DGX API share this contract for **skinned humanoid GLB** exports
(template VRM rig, UniRig merge, etc.). Both sides log ``[API-Contract] PASS|FAIL``; the API
**must** validate on export and fail the job when **critical** codes are present.

**Canonical spec:** this file. **API mirror:** `3DAIGC-API/docs/API_AVATAR_RIG_CONTRACT.md`
(keep in lockstep).

## Coordinate system (glTF / three.js)

| Axis | Role |
|------|------|
| **Y** | Up |
| **-Z** | Character forward (faces the default camera) |
| **X** | Right |

Blender scripts run in **Z-up** internally; glTF import/export converts to/from this contract.

## Export requirements

1. **Skinned mesh** — at least one skin, ≥ 40 joints for humanoid template rig  
2. **Applied transforms** — armature + mesh transforms baked (`export_apply=True`)  
3. **Same space** — mesh vertices and joint rest positions in one coordinate frame  
4. **Upright** — spine above hips (client) / head above feet (API glTF check)  
5. **Forward** — character forward aligns with **-Z**  
6. **Vertical co-location** — mesh vs bone centers within ~35% of mesh height  
7. **Hips at torso** — hips near 52% ± 15% of mesh height (client) or 25–70% from feet (API)  
8. **Feet on floor** — foot bones and mesh feet share the same ground plane (client feet check)

## Failure codes

| Code | Blocks API export | Client |
|------|-------------------|--------|
| `character_upside_down` | yes | failures |
| `character_facing_backwards` | yes | failures |
| `missing_skinned_mesh` | yes | failures |
| `insufficient_joints` | yes (< 40 joints) | — |
| `mesh_bone_vertical_mismatch` | no (advisory) | failures |
| `hips_not_at_mesh_torso` | no (advisory) | failures |
| `api_validation_failed` | — | failures (when `rig_info.validation.passed === false`) |

**Client-only structural codes:** `no_model_root`, `empty_mesh_bounds`, `empty_bone_bounds`,
`missing_hips_bone`, `no_bones_in_glb`, `mesh_bone_feet_mismatch`.

**Severity split:** the API fails the job only on **critical** codes (`character_upside_down`,
`character_facing_backwards`, `missing_skinned_mesh`, `insufficient_joints`). Advisory codes
still appear in `rig_info.validation.codes` and `metrics.advisoryCodes`. The client logs **FAIL**
when any row above fires in the viewport — a stricter second check after download.

## Design split (VRM vs AIGC)

| Path | Source | Client behavior |
|------|--------|-----------------|
| **VRM load** | `.vrm` file, loot assets, etc. | `vrmLoader.normalizeVRM` only — **no** contract flags, **no** `preserveExportedOrientation`. Full pipeline: [VRM_UPLOAD_DISPLAY_EXPORT.md](VRM_UPLOAD_DISPLAY_EXPORT.md) |
| **AIGC GLB** | Avatar-from-image / template rig on DGX | Validate contract; targeted skinned-mesh repair when `needsSkinnedMeshRigRepair` (contract FAIL, feet/XZ mismatch, or template-rig export); feet anchored to y=0 |

DGX template rig **should** export a GLB in the same coordinate frame as `template.vrm`
(`humanoid_template_id: "template"` → `assets/example_autorig/template.vrm`). Contract
violations mean the Blender export step drifted from that reference — fix on DGX, not by
reusing VRM loader flags on VRM files.

## Implementation

| Side | File |
|------|------|
| Client validate + log | `src/library/aigcRigContract.js` |
| Client rig repair | `src/library/rigBoneUtils.js` — `needsSkinnedMeshRigRepair` + `normalizeRiggedModelTransforms`; feet anchored via `anchorModelFeetToFloor` |
| API export gate | `3DAIGC-API/core/utils/aigc_rig_contract.py` → `validate_aigc_rigged_glb()` |
| Blender template rig | `3DAIGC-API/scripts/blender/apply_humanoid_template_rig.py` |
| Job payload | `rig_info.validation = { passed, codes, metrics }` on template rig completion |

### Template rig Blender path

`3DAIGC-API/scripts/blender/apply_humanoid_template_rig.py`:

1. Uniform scale from armature bone span → target mesh height (**Blender Z-up** after glTF import)  
2. Yaw / flip armature to face glTF **-Z** (before parenting — must not rotate skinned mesh)  
3. Foot bones → mesh floor (min Z in Blender)  
4. Center on Blender **XY** ground plane  
5. Envelope skin → export GLB with `export_apply=True`

**Do not** align on Blender Y for height — that was the root cause of inverted rigs (2026-06).  
**Do not** yaw the armature after parenting — that rotates the mesh away from the upload (2026-06).

## Validation timing (client)

1. **pre-process** — raw GLB after load, before `processModel` scale/ground  
2. **post-viewport-layout** — after scale/ground  

Remote log grep: `[API-Contract]`

## Re-test

1. Hard reload OpenNexus3DStudio  
2. Run **Avatar from Image** (new job)  
3. Grep remote log for `[API-Contract] PASS`  
4. Upright mesh + skeleton in Solid and Skeleton modes  
