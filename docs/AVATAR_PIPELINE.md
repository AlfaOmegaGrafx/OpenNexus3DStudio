# Avatar pipeline (OpenNexus3DStudio)

## Quick path

1. Connect to **3DAIGC-API** (DGX)  
2. Task: **Avatar from Image (TRELLIS to VRM)**  
3. Upload photo → wait for TRELLIS to VRM  
4. Viewport loads rigged GLB  
5. Optional: **Download VRM after pipeline** → browser saves `*.vrm`  

## What “VRM export from rigged GLB” means

**Yes — it downloads a file.** The API returns a rigged **GLB**. OpenNexus3DStudio’s existing `VRMExporter` (Save panel or post-pipeline hook) builds a **`.vrm`** blob and triggers a **browser download**. Nothing is uploaded unless you Mint/save elsewhere.

Flow:

```
Photo → API (TRELLIS) → GLB
     → API (template rig) → rigged GLB
     → load in viewport
     → exportAvatarPipelineVrm() → user downloads avatar.vrm
```

Template **expression names** can be embedded in VRM meta; **mesh morphs** require Body+Cloth / `template_wrap`.

## Task types

| Task | API | Viewport |
|------|-----|----------|
| Image to 3D | mesh-generation | GLB mesh |
| Auto Rigging → Template VRM | auto-rigging `rig_mode: template` | Rigged GLB |
| Avatar from Image | TRELLIS to VRM | Rigged GLB + optional VRM download |
| Image to Gaussian Splat | splat-generation | Spark `SplatMesh` |
| Avatar from Image + splat checkbox | above + TripoSplat parallel | Body GLB + splat preview |

## Rig alignment & contract

API export is validated against [API_AVATAR_RIG_CONTRACT.md](API_AVATAR_RIG_CONTRACT.md). After a new avatar-from-image job, grep remote log for `[API-Contract] PASS`.

If the rig was **backward** or **floating at hips**, re-run after pulling latest API. The Blender script aligns on **Z-up** (Blender's vertical after glTF import), not glTF Y.

- Feet (foot bones) aligned to mesh ground  
- Skeleton no longer inverted (head at top, feet at bottom)  
- OpenNexus3DStudio skips auto 180° re-orient and rig-repair heuristics for `fromAigc` loads  
- Client validates pre-process and post-viewport-layout (no client-side rig hacks)


## Blend shapes direction

| Source | Expressions |
|--------|-------------|
| Template morph head | Face morphs on template topology |
| `template_wrap` | Morph head + generated body (Body+Cloth) |
| Bones-only `template` rig | Skeleton only on AIGC mesh (no face morphs) |
| Head splat overlay | Optional photoreal head `.ply` on Head bone |
| TripoSplat | Preview only, not rigged VRM |
| SkinTokens / creature_template | Bone-level jaw/eye mapping when morph targets are absent (see `creatureFaceRetarget.js`) |

## Studio: Body+Cloth (head track)

OpenNexus Studio template **`krea_composable_avatar_body`** (UI: Body+Cloth):

1. **Head track** — Image options chips (Ethnicity + Likeness / 3DGSavatar / Both). Selfie required when 3DGSavatar is selected.
2. **Body** — text prompt → image → mesh → `template_wrap`.
3. **Clothing** — Appearance slots via `parseClothingAccessoryLines` with smart layering. Culling layers **0 / 1 / 2** — see [Appearance](docs/Developers/Pages/appearance.md).
4. **Compose** — optional head splat parents to Head bone when ready.

Selfie is never the body image. Internal wrap notes stay in gitignored `src/moat/wrap/` (never publish).

See `HEAD_TRACK` in `avatarPipelineCatalog.js` and API `docs/ARC2AVATAR_TRACK.md`.

## Uploaded VRM (not AIGC)

User-uploaded `.vrm` files use a **separate** path from rigged GLBs. See [VRM_UPLOAD_DISPLAY_EXPORT.md](VRM_UPLOAD_DISPLAY_EXPORT.md) (scene-root transforms, multi-skin rebind, skeleton viz, export round-trip).

## VRM drag-drop metadata

`CombinedImport` + `vrmTemplateMetadata.js`:

- Drag `.vrm` → parse extensions (`VRM` / `VRMC_vrm`)  
- Store presets in `sessionStorage`  
- Optional pairing with splat preview URL (`attachSplatPreviewMetadata`)  

## Key files

| File | Role |
|------|------|
| `src/library/avatarPipelineCatalog.js` | Template id, rig modes |
| `src/library/taskManager.js` | `executeAvatarFromImage`, template rig API |
| `src/library/avatarPipelineExport.js` | Post-pipeline VRM **download** |
| `src/library/vrmTemplateMetadata.js` | VRM file parse + splat pairing |
| `src/library/sparkSplatManager.js` | Spark.js splats |
| `src/components/TaskManager.jsx` | UI tasks + export checkbox |

## Tests

```bash
node node_modules/vitest/vitest.mjs run src/__tests__/avatarPipelineCatalog.test.js src/__tests__/taskManagerTemplateRig.test.js
```
