# API avatar rig export contract

Character Studio and the DGX API share this contract for **skinned humanoid GLB** exports
(template VRM rig, UniRig merge, etc.). The client validates on load and logs
``[API-Contract] PASS|FAIL``; the API **must** validate on export and fail the job when
**critical** codes are present.

**Canonical spec:** this file only. The API repo keeps a stub pointer at
`3DAIGC-API/docs/API_AVATAR_RIG_CONTRACT.md`.

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
6. **Vertical co-location (advisory)** — mesh vs bone centers within ~35% of mesh height  
7. **Hips at torso (advisory)** — hips near 52% ± 15% of mesh height (client) or 25–70% from feet (API)

## Failure codes

| Code | Critical | Client | API |
|------|----------|--------|-----|
| `character_upside_down` | yes | failures | codes |
| `character_facing_backwards` | yes | failures | codes |
| `missing_skinned_mesh` | yes | failures | codes |
| `no_bones_in_glb` | yes | failures | — |
| `insufficient_joints` | yes | — | codes (< 40 joints) |
| `mesh_bone_vertical_mismatch` | no | warnings | codes (advisory) |
| `hips_not_at_mesh_torso` | no | warnings | codes (advisory) |
| `api_validation_failed` | yes | failures | — (client reads `rig_info.validation.passed`) |

Client-only structural codes: `no_model_root`, `empty_mesh_bounds`, `empty_bone_bounds`, `missing_hips_bone`.

## Design split (VRM vs AIGC)

| Path | Source | Client behavior |
|------|--------|-----------------|
| **VRM load** | `.vrm` file, loot assets, etc. | `vrmLoader.normalizeVRM` only — **no** contract flags, **no** `preserveExportedOrientation` |
| **AIGC GLB** | Avatar-from-image / template rig on DGX | Validate contract; repair skinned mesh only on **FAIL**; anchor feet to y=0 |

DGX template rig **should** export a GLB in the same coordinate frame as `template.vrm`
(`humanoid_template_id: "template"` → `assets/example_autorig/template.vrm`). Contract
violations mean the Blender export step drifted from that reference — fix on DGX, not by
reusing VRM loader flags on VRM files.

## Implementation

| Side | File |
|------|------|
| Client validate + log | `src/library/aigcRigContract.js` |
| Client rig repair | **only when contract FAIL** or mesh/bone feet mismatch (`needsSkinnedMeshRigRepair`); feet always anchored to y=0 via mesh bounds |
| API export gate | `3DAIGC-API/core/utils/aigc_rig_contract.py` → `validate_aigc_rigged_glb()` |
| Blender template rig | `3DAIGC-API/scripts/blender/apply_humanoid_template_rig.py` |
| Job payload | `rig_info.validation = { passed, codes, metrics }` on template rig completion |

### Template rig Blender path

`scripts/blender/apply_humanoid_template_rig.py`:

1. Scale on Blender **Z** (height after glTF import)
2. Yaw around Blender **Z** (default **π** → glTF **-Z** forward)
3. Foot bones → mesh floor (min Z in Blender)
4. Center on Blender **XY** ground plane
5. Envelope skin → export GLB with `export_apply=True`

**Do not** align on Blender Y for height — that was the root cause of inverted rigs (2026-06).

## Validation timing (client)

1. **pre-process** — raw GLB after load, before `processModel` scale/ground  
2. **post-viewport-layout** — after scale/ground  

Remote log grep: `[API-Contract]`

## Re-test

1. Hard reload Character Studio  
2. Run **Avatar from Image** (new job)  
3. Grep remote log for `[API-Contract] PASS`  
4. Upright mesh + skeleton in Solid and Skeleton modes  
