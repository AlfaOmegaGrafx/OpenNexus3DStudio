## IWSDK Option A Migration Blueprint (least resistance)

This document is a **reference checklist** for migrating IWSDK XR capabilities from `/xr` into the main Character Studio app (`/`) while keeping **`SceneManager` as the owner** of:

- the **Three.js renderer**
- the **WebXR session lifecycle**
- the **render loop**
- the **VRM / toolchain / editor UX**

In other words: **IWSDK behaviors become subsystems**, not a second engine that owns the app.

---

### Core rule (prevents “two engines” bugs)

In the final state, there must be **exactly one** of each:

- **One** `WebGLRenderer` (owned by `SceneManager`)
- **One** XR session (`renderer.xr.setSession(...)` or `navigator.xr.requestSession(...)`, owned by `SceneManager`)
- **One** XR animation loop (`renderer.setAnimationLoop(...)`, owned by `SceneManager`)
- **One** input pipeline that produces: rays/pointers, select/squeeze, grab, locomotion (IWSDK-derived or IWSDK-wrapped)

If a migration step introduces a second renderer/session/loop, treat it as a **stop-ship integration bug** and refactor.

---

### What “migrates” from IWSDK (and what doesn’t)

- **Migrate (high-value)**:
  - hand/controller abstraction
  - ray/pointer + cursor behavior
  - grabbing (distance + proximity)
  - locomotion (turn, move, teleport)
  - headset-specific robustness patches (Galaxy XR quirks)

- **Do not migrate as-is**:
  - IWSDK `World.create(...)` owning its own renderer/session/loop
  - route-level separation assumptions (`/xr`-only world)

---

## World building stack (Spark / sensai / image-blaster)

**One-line direction:** Character Studio Core owns the scene and XR session; **Spark** renders splat environments; **IWSDK** (Option A) drives presence; **DGX Hunyuan** builds props; **image-blaster-style pipelines** produce world packages—not a fourth runtime.

Use all three repos as **layers**, not as three parallel apps:

```text
[Generation]     image-blaster workflow + DGX Hunyuan (meshes) + Marble/splat sources when wired
       ↓          world package: environment.spz, collision.glb, props/*.glb, manifest.json
[Core /]         SceneManager — one renderer, one XR session, VRM + tools + staging
       ↓          SparkRenderer + SplatMesh in the same Three.js scene as avatars/meshes
[XR interaction] IWSDK patterns ported via Option A (hands, grab, locomotion)
       ↓
[Capture]        in-app spectator camera (near-term); WebXR observer view if runtime grants it
```

| Repo | Role | Use in Character Studio |
|------|------|-------------------------|
| [spark](https://github.com/AlfaOmegaGrafx/spark) | Gaussian splat **renderer** for Three.js | npm dependency when Core loads `.spz`/`.ply` worlds in SceneManager |
| [sensai-webxr-worldmodels](https://github.com/AlfaOmegaGrafx/sensai-webxr-worldmodels) | IWSDK + Spark **XR world template** | Reference lab only—copy splat loader, collision mesh for locomotion, LoD/render-order patterns; do not ship as second app |
| [image-blaster](https://github.com/AlfaOmegaGrafx/image-blaster) | Image → world **generation pipeline** | Pipeline spec (static splat + dynamic meshes + optional SFX); implement via DGX/API where possible, not a second Hunyuan path in-app |

**Redundancy rules**

| Overlap | Keep |
|---------|------|
| Hunyuan (image-blaster FAL vs DGX) | **DGX only** in Core; image-blaster as optional offline/cloud pipeline |
| Spark (spark vs sensai) | **One** Spark integration in SceneManager; sensai is cookbook, not second renderer |
| IWSDK (sensai vs `/xr`) | **One** interaction stack after Option A; `/xr` stays regression lab |
| Marble / `.spz` generation | Import + URL first (sensai pattern); generation via Marble/image-blaster when API is ready |

**Relation to Option A phases**

- **Phases 0–5** (this doc): IWSDK interaction in `/` — required before worlds feel good in XR.
- **World building** (after core XR is stable): add Spark + world package import; use sensai-webxr-worldmodels for integration pitfalls (collision GLB, LoD, UI depth).
- **Authoring + experiencing**: desktop precision + DGX for meshes; XR for spatial staging and performance; hybrid is expected.

See also `docs/IWSDK_INTEGRATION.md` (Gaussian splat worlds noted as a later track).

---

## Capture / VTubing (spectator camera vs observer view)

**Spectator camera (near-term, in-app)** — not deferred to a distant future.

- A normal Three.js camera in the scene, rendered to a stream/canvas/OBS (third-person or staged framing).
- Works on Galaxy XR and desktop without relying on optional WebXR APIs.
- Integrate **after Phases 3–4** (input + grab stable) or in parallel once a VRM is present in XR; before full world-building (Spark) if VTubing is a priority.

**WebXR observer / first-person observer view (optional bonus)**

- Runtime-provided extra view in `XRViewerPose.views` when `secondary-views` is granted—not the same as multiplayer.
- Use when available for watchable capture; do not block VTubing on it.
- VRM first-person (embedded look) handles “hide head from wearer”; observer view handles “camera for audience.”

---

## Phase 0 — Preconditions (make migration safe)

### 0.1 Define a “XR ownership contract” in `SceneManager`

Create a single place in `SceneManager` that is the **only authority** for:

- session start/stop
- reference space selection + fallback order
- XR frame loop

Everything else (hands, grabbing, locomotion) must plug into this contract.

**Success criteria**
- There is one XR start/stop pathway used by the app.
- It is obvious which code owns the session and loop.

### 0.2 Add an XR capability log (baseline)

Add a one-shot diagnostic log on XR session start that prints:

- session mode (immersive-vr / immersive-ar)
- reference space type selected (bounded-floor/local-floor/local/viewer)
- enabled features (if available)
- whether hands/controllers are present

This becomes the baseline for comparing `/` vs `/xr`.

---

## Phase 1 — Unify XR SessionMode + Reference Spaces

Your `/xr` world uses:

- `SessionMode.ImmersiveVR` by default
- `LocalFloor` reference space with fallback order
- `features.layers=false` for Galaxy XR stability

For Option A, replicate the **same intent** in `SceneManager` XR start:

- **SessionMode**: ensure `/` can request VR and AR with the same default choices as `/xr`
- **Reference space**: use the same fallback order (`bounded-floor` → `local-floor` → `local` → `viewer`)
- **Layers**: keep the “do not request layers” stance if Galaxy XR is unstable

**Success criteria**
- Starting XR in `/` yields the same stable session creation behavior as `/xr`.

---

## Phase 2 — Port IWSDK headset robustness patches (no gameplay yet)

IWSDK-side code contains Galaxy XR survivability fixes (e.g. safe controller animation update, pointer update behavior).

Goal: take the *principles* of these fixes into the `/` XR input layer:

- avoid “throw in frame loop” failure modes
- handle reduced gamepad mappings safely
- ensure hands can become primary when controllers are dormant

**Success criteria**
- XR session no longer black-screens due to a thrown exception in the loop.
- Controllers/hands behave predictably across dock/undock.

---

## Phase 3 — Input model: rays + select/squeeze events

Build an IWSDK-inspired “input surface” inside `/` that produces a stable, device-agnostic set of events:

- pointer ray pose (per hand)
- grip pose (per hand)
- `selectStart/selectEnd`
- `squeezeStart/squeezeEnd`

Do not implement grab/locomotion yet—just normalize input.

**Success criteria**
- Both controllers and hands can produce select events.
- You can place a cursor/dot reliably at intersection points.

---

## Phase 4 — Grabbing (distance first, then proximity)

Implement distance grab first (ray + trigger/pinch), then add proximity grab.

Suggested minimal order:

1. **Distance grab**:
   - raycast into scene
   - on selectStart: pick target
   - while held: move target toward a hand-relative anchor point (IWSDK’s “move towards target” feel)
   - on selectEnd: release

2. **Proximity grab**:
   - if hand is near an object and squeeze/pinch occurs, grab without ray

**Success criteria**
- You can grab a simple test cube in `/` with the same “feel” as `/xr`.
- Grabbing does not interfere with VRM animation updates or editor UI.

---

## Phase 5 — Locomotion (turn/move/teleport)

Port locomotion in the order that minimizes side effects:

1. snap/continuous turn
2. slide movement
3. teleport (optional)

Key integration point: locomotion should move the **XR world root** (or a dedicated player rig group), not break SceneManager’s model anchoring rules.

**Success criteria**
- Locomotion works without moving “anchored” content that must remain fixed (e.g. floor-anchored VRM stage).
- No drift between camera origin and world origin after recenter/reset.

---

## Phase 6 — AR-only: hit-test + anchors (when needed)

Only implement these in `/` if you intend to support AR placement in the main app.

- **Hit-test**: place a reticle and allow placement
- **Anchors**: persist placement across minor tracking adjustments

**Success criteria**
- AR placement is stable and doesn’t regress VR behavior.

---

## Phase 7 — Compositor policy + UI policy

Treat these as policies, not “features”:

- environment blend mode (opaque vs passthrough)
- scene background + renderer clear alpha rules
- overlay UI vs world-space UI

The important migration rule is: **don’t add a second policy engine**. Keep a single “XR compositor policy” in `SceneManager`.

**Success criteria**
- Passthrough (if used) doesn’t break skyboxes/opaque VR.
- UI is readable and consistent in VR vs AR.

---

## Phase 8 — Decommission `/xr` as a dependency (keep it as a lab)

Even after migration, `/xr` can remain a:

- regression lab for hands/grab/locomotion
- place to test new IWSDK features quickly

But `/` becomes the product path.

**Success criteria**
- `/` no longer depends on `/xr` code at runtime.
- `/xr` remains useful for rapid iteration/testing.

---

### “Definition of done” for Option A

Option A migration is “done” when:

- `/` can enter XR and has:
  - reliable hands/controllers input
  - distance + proximity grab
  - locomotion
  - (optional) AR placement features if you choose
- and there is **no parallel XR engine** (no separate IWSDK renderer/session/loop).

**Parallel tracks (not blocking Option A “done”, but ordered)**

1. **Spectator camera** — in-app capture for VTubing/streaming (sooner; see Capture / VTubing above).
2. **World building** — Spark + world package import (after core XR interaction is stable).
3. **Observer view** — only if the runtime exposes it; optional enhancement on top of spectator camera.

