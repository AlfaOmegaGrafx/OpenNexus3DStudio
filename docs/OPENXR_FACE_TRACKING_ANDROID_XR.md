# OpenXR face tracking (Android XR) and OpenNexus3DStudio

This document ties **native OpenXR** face data to the **web** OpenNexus3DStudio app when the browser does not expose WebXR **`expression-tracking`** / **`XRFrame.expressions`** (common on current Chrome builds; see remote-log diagnostics).

## Local spec copies (this repository)

The folder **`OpenXR/`** at the repo root holds PDFs for offline reading (including **`OpenXR/XR_ANDROID_face_tracking.pdf`**, **`OpenXR/1.0/Wayback/XR_ANDROID_face_tracking OpenXR extension.pdf`**, and **`OpenXR/Open XR 1.1.54 Spec.pdf`**). **Do not assume the PDFs are newer than the web registry:** Khronos manual pages track the live **OpenXR 1.1.x** spec (e.g. man pages show **Version 1.1.59** while a bundled PDF may say 1.1.54).

**Practical note:** In this environment those PDFs are **raster / non-searchable** (no reliable text extraction). Use the **Khronos HTML man pages** below for copy-paste API names, structs, and enum order. Keep the PDFs for diagrams and offline reading; prefer the registry when anything disagrees.

## Canonical online references (prefer for implementation)

**Extension**

- [XR_ANDROID_face_tracking](https://registry.khronos.org/OpenXR/specs/1.1/man/html/XR_ANDROID_face_tracking.html) — instance extension **459**, revision **1** (not ratified; OpenXR 1.0+)

**Core calls and structs (current naming)**

- [xrCreateFaceTrackerANDROID](https://registry.khronos.org/OpenXR/specs/1.1/man/html/xrCreateFaceTrackerANDROID.html)
- [xrGetFaceStateANDROID](https://registry.khronos.org/OpenXR/specs/1.1/man/html/xrGetFaceStateANDROID.html) — returns blend weights at a time (fills [`XrFaceStateANDROID`](https://registry.khronos.org/OpenXR/specs/1.1/man/html/XrFaceStateANDROID.html))
- [XrFaceTrackerCreateInfoANDROID](https://registry.khronos.org/OpenXR/specs/1.1/man/html/XrFaceTrackerCreateInfoANDROID.html)
- [XrFaceStateGetInfoANDROID](https://registry.khronos.org/OpenXR/specs/1.1/man/html/XrFaceStateGetInfoANDROID.html)
- [XrFaceParameterIndicesANDROID](https://registry.khronos.org/OpenXR/specs/1.1/man/html/XrFaceParameterIndicesANDROID.html) — **68** scalar parameters (indices `0`–`67`), then `MAX_ENUM`

**Android**

- Android XR OpenXR extensions hub: [Android XR for OpenXR](https://developer.android.com/develop/xr/openxr/extensions) (exact extension article URLs may move; start there if a deep link 404s).

**Web (string keys for the bridge)**

- [WebXR Expression Tracking draft (index.bs)](https://github.com/immersive-web/webxr-face-tracking-1/blob/main/index.bs) — **string keys** reused in `inferVRMMorphTargets`

### Android permission

`xrCreateFaceTrackerANDROID` requires **`android.permission.FACE_TRACKING`** (dangerous): declare in the manifest and request at runtime. See the [xrCreateFaceTrackerANDROID](https://registry.khronos.org/OpenXR/specs/1.1/man/html/xrCreateFaceTrackerANDROID.html) man page.

## Jetpack XR / ARCore face (Google stack)

On Android XR, Google documents **[ARCore face tracking for Jetpack XR](https://developer.android.com/develop/xr/jetpack-xr-sdk/arcore/face)** with **`FaceTrackingMode.BLEND_SHAPES`** and the same style of **68 blend shapes** as in the tables above. The OpenNexus3DStudio wrapper APK implements this path in **`native/android-xr-face-bridge/XrFaceTrackingEngine.kt`** (foreground service + HTTP relay for Chrome WebXR) and forwards weights into **`nativeFaceBridge.js`** (no raw OpenXR C required for that route).

## Native OpenXR runtime loop (C API) — optional

1. Enable **`XR_ANDROID_face_tracking`** on the `XrInstance` / session per your loader setup.
2. **`xrCreateFaceTrackerANDROID`** → `XrFaceTrackerANDROID`.
3. Each frame (or 30–60 Hz): **`xrGetFaceStateANDROID`** with **`XrFaceStateGetInfoANDROID`**, filling **`XrFaceStateANDROID`**.
4. Read the **`parameters`** float buffer (capacity **`XR_ANDROID_FACE_PARAMETER_COUNT`** = **68** per current enum). Optionally use **`isValid`**, **`sampleTime`**, **`regionConfidences`**.
5. Either:
   - Map indices to WebXR key names in Kotlin/Java, **or**
   - Send the dense array as **`openxrParameters`** in the JS bridge (see below).

Older drafts or slides sometimes mention different function names; **trust the Khronos man pages** linked above.

## Web vs native

| Path | Where it runs | Feature | Data shape | Implementation in repo |
|------|----------------|---------|------------|-------------------------|
| WebXR | Chrome immersive session | Optional `expression-tracking` | `XRFrame.expressions` | [`src/library/xrExpressionTrackingDriver.js`](../src/library/xrExpressionTrackingDriver.js) → `applyXRFrameExpressionsToVRMS` |
| Native bridge | Android XR host (OpenXR) | `XR_ANDROID_face_tracking` | Serialized weights or `openxrParameters[]` | Native app → `window.__openNexus3dStudioNativeFace.push()` → [`src/library/nativeFaceBridge.js`](../src/library/nativeFaceBridge.js) → `applyExpressionWeightRecordToVRMS` |

**Index → key mapping in repo:** [`src/library/openxrFaceParameterMap.js`](../src/library/openxrFaceParameterMap.js) (`OPENXR_ANDROID_FACE_PARAMETER_WEBXR_KEYS`, `openxrFloatParametersToWebXRRecord`).

When **both** are inactive, the avatar face in XR stays neutral (webcam driver is intentionally off during WebXR).

**Precedence in XR:** If [`getNativeFaceWeightsIfFresh`](../src/library/nativeFaceBridge.js) returns data, it **overrides** WebXR `expressions` for that frame in [`sceneManager.js`](../src/library/sceneManager.js).

### Dev relay: Chrome WebXR + APK face (Galaxy XR)

When the browser does not grant **`expression-tracking`**, use the **OpenNexus XR Face** APK plus the Vite dev relay:

| Step | Component |
|------|-----------|
| 1 | `npm run dev` on PC — enables `POST /__native_face_ingest` and `GET /__native_face_sse` |
| 2 | APK **Jetpack** and/or **OpenXR** (`XR_ANDROID_face_tracking`) → HTTP POST to ingest (~30 Hz); OpenXR uses **PBuffer GLES** so ingest can continue during Chrome **Full Space** when `FaceKeeperActivity` is host |
| 3 | Chrome opens `?nativeFaceRelay=1` → [`nativeFaceRelay.js`](../src/library/nativeFaceRelay.js) EventSource → `nativeFaceBridge` |
| 4 | XR frame loop uses native weights (same as WebView); web cache **30s** while `xrPresenting`, APK handoff stale **10s** |

See [`native/android-xr-face-bridge/README.md`](../native/android-xr-face-bridge/README.md) and [`ANDROID_STUDIO_AI_BRIEF.md`](./ANDROID_STUDIO_AI_BRIEF.md).

## Payload contract (native → web)

Call from Android **after** obtaining face parameters:

### Option A — WebXR-shaped object (preferred for debugging)

Same strings as the WebXR draft `XRExpression` enum (e.g. `jaw_drop`, `eyes_closed_left`). See `index.bs` and the `XRE_KEYS` list in `xrExpressionTrackingDriver.js`.

```json
{ "jaw_drop": 0.6, "eyes_closed_left": 0.1, "eyes_closed_right": 0.1 }
```

```json
{ "weights": { "jaw_drop": 0.6 }, "t": 1735689600000 }
```

### Option B — Dense OpenXR `parameters` array

Compact JSON for **`xrGetFaceStateANDROID`** output: **68** floats in **`XrFaceParameterIndicesANDROID`** order. The web layer maps to the same keys as Option A. **Named keys in the same payload override** array slots (for per-shape fixes).

```json
{ "openxrParameters": [0, 0, ... , 0.85], "t": 1735689600000 }
```

(`jaw_drop` is index **24** in current Khronos enum.)

From Kotlin/Java WebView:

```java
webView.evaluateJavascript(
  "window.__openNexus3dStudioNativeFace.push(" + json + ");",
  null
);
```

## Native project scaffold

See [`native/android-xr-face-bridge/README.md`](../native/android-xr-face-bridge/README.md). A **Gradle WebView app** lives under [`native/android-xr-face-bridge/`](../native/android-xr-face-bridge/):

- **Jetpack XR** — `XrFaceTrackingEngine` (activity-visible)
- **OpenXR** — `libcs_openxr_face.so` + `OpenXrFaceEngine` (parallel; `openxrParameters` JSON)
- **`FaceTrackingCoordinator`** — starts both; FG service watchdog uses freshest relay age

## Related docs

- [Webcam Avatar Control](./WEBCAM_AVATAR_CONTROL.md) — WebXR expression tracking, Galaxy XR notes, remote logging
- [THREEJS_WEBGPU_WEBXR_MIGRATION.md](./THREEJS_WEBGPU_WEBXR_MIGRATION.md) — WebXR checklist and face-tracking roadmap link

## Mapping fidelity

[`inferVRMMorphTargets`](../src/library/xrExpressionTrackingDriver.js) is **heuristic**. OpenXR indices **63–67** are **tongue** shapes in current Khronos enum; they are mapped to `tongue_out`, `tongue_left`, `tongue_right`, `tongue_up`, `tongue_down` in [`openxrFaceParameterMap.js`](../src/library/openxrFaceParameterMap.js) for forward compatibility (mouth heuristics may ignore them until you add explicit tongue drive).

Once native data is live, compare runtime weights to the **Khronos** enum table and adjust mapping or add a normalizer in the native layer if a vendor orders parameters differently (should not happen if you use the spec indices).
