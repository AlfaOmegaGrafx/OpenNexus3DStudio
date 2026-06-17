# XR Floor Anchoring + Backgrounds (AR Pass-Through / VR Sky)

Last updated: 2026-01-15

## Goals (Current Correct Behavior)

- **VR mode**
  - Uses a **virtual sky background** (the app’s sky image).
  - Background must be **opaque** (no pass-through).
  - Scene content (models) is **floor-anchored** using floor-aligned reference spaces.

- **AR mode**
  - Uses **video pass-through** (physical world visible).
  - Renderer must be **transparent** and `scene.background` must be **null** (so the camera feed shows through).
  - Scene content (models) is **floor-anchored** using floor-aligned reference spaces.

- **Positioning constraints (both AR + VR)**
  - **X is always 0** for the XR scene wrapper (centered).
  - **Z is -0.5** (content placed slightly in front of the user).
  - **Y is computed from the model bounding box** so the model bottom aligns with floor level \(Y=0\) in floor-aligned spaces.

## Implementation Location

- **Primary file**: `src/library/sceneManager.js`
- **Entry points**
  - `initialize()` creates the renderer with `alpha: true` (required for AR transparency).
  - `enableVR()` installs a **unified** `renderer.xr.setSession` override that handles **both VR and AR sessions**.

## Reference Space Priority (Floor Alignment)

We request reference spaces in this order:

1. `bounded-floor` (preferred on Android XR / Galaxy XR)
2. `local-floor`
3. `local`
4. `viewer`

### Why `bounded-floor` matters on Android XR

On Galaxy XR, `bounded-floor` uses the device’s **boundaries floor-level calibration**:

- Settings → XR → Boundaries → Adjust Floor Level
- In `bounded-floor`, **Y=0 corresponds to the physical floor level** configured by the user.

No additional “manual floor height” code is needed—WebXR provides a floor-aligned origin.

## Floor Anchoring (Model Bottom to Y=0)

When entering either VR or AR:

1. Create an XR wrapper group (`VRSceneWrapper` or `ARSceneWrapper`) that contains **only model content** (not lights/cameras/helpers).
2. Compute model bounding box and find bottom:
   - `modelBottomY = boundingBox.min.y`
3. Compute floor alignment:
   - `floorAlignmentY = -modelBottomY`
4. Set wrapper position:
   - `x = 0`
   - `y = floorAlignmentY`
   - `z = -0.5`

This aligns the model’s bottom to \(Y=0\) in the chosen reference space (physical floor in floor-aligned spaces).

## AR Pass-Through (Physical Background Visible)

AR must keep the scene transparent:

- `scene.background = null`
- `renderer.setClearColor(0x000000, 0)`
- `renderer.domElement.style.background = 'transparent'`

### Important: sky texture loaders must not override AR background

The sky texture can still be loaded and stored for VR use, but **AR must not re-apply it to** `scene.background`.
In AR, you may optionally set `scene.environment` for lighting, while keeping `scene.background = null`.

### Background State Snapshot and Restore

To ensure the 3D viewer returns to the exact same sky orientation after exiting AR, the app captures a **full snapshot** of the background state before entering any XR session:

- **For textures**: Stores `{ textureRef, mapping, colorSpace, flipY, needsUpdate }`
- **For colors**: Stores a cloned `THREE.Color` instance
- **For null**: Stores `{ type: 'null', value: null }`

On AR exit (`handleXRSessionEnd('ar')`), the snapshot is restored **exactly** as captured, including all texture properties. This prevents the sky from appearing flipped or incorrectly oriented after AR sessions.

**Implementation**: The snapshot is captured in the unified `setSession` override before any XR-specific background modifications occur. It's stored in `this.preXRBackgroundSnapshot` and cleared after restoration.

## VR Background (Sky in Immersive VR)

Some WebXR immersive VR runtimes can be unreliable with `scene.background` alone. The robust approach is:

- Keep an **opaque clear alpha** (`renderer.getClearAlpha() === 1`)
- Use a **mesh-based sky** (large sphere / skybox mesh) mapped with the sky texture, rendered behind everything.

## Wrapper Centering (X = 0)

XR wrapper X must remain centered:

- When we set the wrapper position, we set `x=0`.
- In AR, the wrapper is “anchored” and restored if it drifts; the anchor is also forced to `x=0`.
- In VR, the render loop enforces `VRSceneWrapper.position.x === 0` as a safety guard.

### Auto-centering on XR session start

On XR session start, the app also **auto-centers the reference space** once (on the first XR frame) so the viewer begins at **X=0** relative to the app's world/grid. This avoids the common "I start a couple squares to the left/right of the grid center" issue on some runtimes.

### Software Recenter (Long-Press Gesture)

The app supports software-based recenter via long-press gestures on XR input sources (controllers/headset touchpads). This is a fallback when platform-level recenter (Home button) doesn't affect the app.

**Implementation details**:

- **Hold tracking**: Uses `WeakMap` keyed by **stable `XRSpace` objects** (`inputSource.targetRaySpace`) instead of `XRInputSource` object refs. This ensures tracking persists even if `session.inputSources` yields different object instances than `event.inputSource`.
- **Long-press threshold**: 900ms
- **Supported inputs**:
  - `selectstart`/`selectend` events (for headsets/controllers without gamepad API)
  - Gamepad button long-press (via `pressed` or `touched` states)
  - Button indices are determined heuristically based on input source profiles/handedness
- **Cooldown**: 1.5 seconds between recenter triggers to prevent repeated triggers while holding

**Platform recenter support**: The app also listens for XR reference space `reset` events (fired by platform-level recenter, e.g., Home button). On reset, the auto-center flag is cleared so the next XR frame re-runs auto-centering to return the view to X=0.

### XR Input Diagnostics

For debugging XR input issues, enable diagnostic logging via the `?xrDebugInputs=1` query parameter. This logs (throttled to once per second):

- Input source profiles and handedness
- Gamepad button count
- Which button indices are currently `pressed`/`touched`

This helps identify which buttons/events are exposed by the headset/controller for recenter gestures.

## Troubleshooting Checklist

### AR shows sky (not physical world)

Confirm at runtime:

- `scene.background === null`
- `renderer.getClearAlpha() === 0`
- canvas background is transparent (CSS)

If AR still shows a sky:

- A texture loader may be re-setting `scene.background`.
- Renderer may have been created with `alpha:false` (must be `alpha:true` at creation time).

### VR shows black background

Confirm at runtime:

- `renderer.getClearAlpha() === 1`
- sky mesh exists (if using mesh-based sky)
- texture has loaded (`texture.image.complete === true`)

