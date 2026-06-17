# VRM upload, display, and export

**Canonical split with AIGC rigs:** [API_AVATAR_RIG_CONTRACT.md](API_AVATAR_RIG_CONTRACT.md) (VRM path vs avatar-from-image GLB path).

This guide documents the **uploaded `.vrm` pipeline** we settled on after multi-skin VRM0 alignment work (UniGLTF exports such as Sifr2: body, head, eyes, cornea, hair — each with its own skin index, bones as scene siblings).

## Problem we fixed

Other VRM viewers load the file and render it. Character Studio was **mutating** the model after load:

| Wrong (breaks eyes / fingers) | Right |
|-------------------------------|--------|
| Rotate **hips / armature only** | Rotate **`vrm.scene` root only** |
| Run AIGC rig-repair (`alignSkinnedMeshToRig`, skeleton display offsets) | Skip repair when `userData.vrmNormalized` |
| Skeleton viz from humanoid `Normalized_*` nodes | Viz from primary skinned mesh (`AvatarBody` skeleton) |
| Export always `rotateY(π)` | Export yaw only when `getWorldDirection().z > 0.5` |

VRM0 UniGLTF layout: **skinned mesh nodes and the Hips bone tree are siblings**. Rotating only the armature changes bone world matrices relative to mesh nodes; per-skin bind drifts (worst on eyes and finger extremities).

Reference pattern (original Character Studio / `@pixiv/three-vrm`):

- `VRMUtils.rotateVRM0` → `scene.rotation.y += Math.PI` when needed
- `src/library/load-utils.js` `loadVRM()` — scene root, not hips
- `src/library/modelOrientationUtils.js` → `applyVrm0SceneForwardFix(scene)`

## Upload path

**Entry:** drag-drop / file picker → `SceneManager.loadVRM` → `VRMLoader.processVRM` → `normalizeVRM`.

**Only** `normalizeVRM` may change layout for uploads:

1. **Facing (VRM0):** `applyVrm0SceneForwardFix(vrm.scene)` — scene root only  
2. **Scale + center:** uniform on `vrm.scene` (~2 m max dimension)  
3. **Floor:** snap feet to y = 0 on scene root  
4. **Rebind:** `rebindSkinnedMeshes(vrm.scene)` for every skinned mesh (e.g. 10 skins)  
5. **Flags:** `vrm.scene.userData.vrmNormalized = true` — **not** `preserveExportedOrientation` (that flag is for AIGC GLBs per contract)

`processModel` must **early-return** when `vrmNormalized` (no autoScale, no AIGC yaw repair).

**Do not** call `validateAigcRigContract` or `normalizeRiggedModelTransforms` repair paths on uploaded VRM.

### Remote log (Surface: `?remoteLog=1` → `logs/remote-log.txt`)

After re-upload, grep for:

```text
[VRM] Multi-skin layout after normalize
rotated scene root (all skins move together)
```

Regression signals:

```text
rotated armature via hips parent
VRM0 normalization: rotated model to face camera { beforeZ: 1, afterZ: -1 }
Processing bone … Normalized_Hips
```

See also `.cursor/rules/remote-log-first.mdc`.

## Display path

| Concern | Rule |
|---------|------|
| Skeleton overlay | `getPrimarySkeletonBones(modelRoot)` from primary skinned mesh |
| Bone gizmo position | `getBoneDisplayWorldPosition` — **no** AIGC display offset when `userData.vrm` or `vrmNormalized` |
| `updateSkeletonDisplayCorrection` | Skip for uploaded VRM |
| Trait / loot load | `characterManager`, `vrmManager`, `load-utils` — same scene-root forward fix + rebind, **never** hips-only rotation |

## Export path

**Entry:** Save panel / `VRMExporter.exportToVRM` / `SceneManager.exportToVRM`.

1. **Rebind** skinned meshes before GLTF parse when `userData.vrm` or `vrmNormalized`  
2. **Yaw:** only if model world forward has `z > 0.5` (same rule as upload); do not blind `rotateY(π)` on already-correct uploads  
3. **Strip** internal flags from exported GLB: `vrmNormalized`, `preserveExportedOrientation`, `fromAigc`, etc. (`glbExportUtils.stripInternalExportUserData`)  
4. Restore viewport quaternion after export if a temporary yaw was applied  

Round-trip test: export Sifr2 → re-import → eyes and finger bones still align in skeleton mode.

## Implementation map

| Area | File |
|------|------|
| Upload normalize | `src/library/vrmLoader.js` → `normalizeVRM` |
| Forward fix | `src/library/modelOrientationUtils.js` → `applyVrm0SceneForwardFix` |
| Rebind / skeleton viz | `src/library/rigBoneUtils.js` |
| Skip AIGC processModel | `src/library/sceneManager.js` → `processModel` |
| Trait loot load | `src/library/characterManager.js`, `vrmManager.js`, `load-utils.js` |
| Export | `src/library/VRMExporter.js`, `glbExportUtils.js` |
| Contract (VRM vs AIGC) | `docs/API_AVATAR_RIG_CONTRACT.md` |
| Tests | `src/__tests__/rigBoneUtils.test.js` |

## Re-test checklist

1. Hard refresh dev tab (`Ctrl+Shift+R`)  
2. Upload Sifr2 (or any multi-skin VRM0)  
3. Grep remote log for `[VRM] Multi-skin layout` and scene-root rotation line  
4. Solid mode: textures OK; skeleton mode: eye bones on eye mesh, finger joints on finger mesh  
5. Export VRM → re-import → same alignment  
