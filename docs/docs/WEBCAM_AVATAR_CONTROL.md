# Webcam Avatar Control

Webcam Avatar Control drives the current VRM avatar’s face (and optional head rotation) from your webcam using [Kalidokit](https://github.com/AlfaOmegaGrafx/kalidokit) and [MediaPipe Holistic](https://google.github.io/mediapipe/solutions/holistic.html), in the same spirit as [XR Animator](https://github.com/AlfaOmegaGrafx/SystemAnimatorOnline) and Kalidoface-style VTuber apps.

## Features

- **Face tracking**: Blink (and optional left/right blink), mouth shapes (Ah, Ee, Oh, Ou) from Kalidokit `Face.solve()`.
- **Head rotation**: Neck and head bone rotation from face landmarks (smoothed).
- **WebXR-safe**: The driver does **not** run or apply when WebXR is presenting (VR/AR). When you enter VR or AR mode, webcam control **auto-stops**: the camera is released, the detection loop ends, and the avatar returns to neutral so nothing conflicts with headset tracking or Galaxy XR. You can turn Cam back on after exiting VR/AR.

## Usage

1. Load a VRM model.
2. In the bottom control bar, click **Cam** to start webcam avatar control.
3. Allow camera access when prompted. The avatar’s face will follow your face (blinks, mouth, head).
4. Click **Cam on** (or the same button again) to stop.

## Technical notes

- **Stack**: MediaPipe Holistic (face landmarks) → Kalidokit `Face.solve()` → VRM `expressionManager` and humanoid bones.
- **Module**: `src/library/webcamAvatarDriver.js`. It is created and started/stopped from `SceneContext`; the UI toggle lives in `BottomDisplayMenu`.
- **VRMs**: The driver applies to the same VRM(s) as the rest of the app (character manager avatars or the current scene VRM). It does not modify WebXR, `enableVR()` / `enableAR()`, or reference spaces.

## Galaxy XR and WebXR Expression Tracking

**Native OpenXR path:** When the browser does not grant `expression-tracking`, use a **WebView-wrapped** Android XR app and OpenXR **`XR_ANDROID_face_tracking`**, forwarding weights into the page via [`nativeFaceBridge.js`](../src/library/nativeFaceBridge.js). See **[OpenXR face tracking (Android XR)](./OPENXR_FACE_TRACKING_ANDROID_XR.md)** and [`native/android-xr-face-bridge/README.md`](../native/android-xr-face-bridge/README.md).

On supported UAs (Chrome on **Android XR**, e.g. Samsung Galaxy XR where enabled), immersive **VR** and **AR** sessions request the optional [`expression-tracking`](https://github.com/immersive-web/webxr-face-tracking-1/blob/main/index.bs) feature descriptor. When granted, each `XRFrame` may expose **`frame.expressions`** (draft WebXR Expression Tracking): a map of facial expression weights (~FACS-like keys). The runtime maps headset sensors to OpenXR **`XR_ANDROID_face_tracking`** semantics under the hood.

**Implemented:**

- **`src/library/xrExpressionTrackingDriver.js`** — reads `XRFrame.expressions`, maps weights heuristically to VRM presets (`Blink`, `Ah`, `Ee`, `Oh`, `Ou`), with light smoothing per VRM instance.
- **`SceneManager`** — adds `expression-tracking` to **`optionalFeatures`** for AR (`ARButton`) and manual VR (`requestSession('immersive-vr')`), logs once when `session.enabledFeatures` includes `expression-tracking`, and applies mappings each XR render frame.
- **`SceneContext`** — registers the same **VRM list** resolver as webcam control (`characterManager` avatars, else `sceneManager.currentVRM`).

OpenXR naming for native stacks:

- **`XR_ANDROID_face_tracking`** extension (underlying blend shapes).

Web platform naming:

- **Feature descriptor**: `"expression-tracking"` on `immersive-ar` / `immersive-vr`.
- **`XRFrame.expressions`**: iterable / `.get()` style weight map.

**Debugging:** append `?xrExpressionProbe=1` to log `XRFrame` introspection once (see `maybeProbeXRFrame`).

### Why you might not see a “second” permission for face

On **Android XR**, Chrome can fold several sensitive capabilities into the **initial WebXR / spatial mapping consent** rather than showing a separate dialog per sensor. The [Develop for the web on Android XR](https://developer.android.com/develop/xr/web) page notes that permissions can include **access to tracked face, eye, and hand data** when the experience needs them—so **no extra prompt** after entering AR/VR is often expected.

Separately, **`expression-tracking` is optional**: if your Chrome build does not implement the draft **`XRFrame.expressions`** API yet, `session.enabledFeatures` may **not** list `expression-tracking`, and you will not get XR-driven mouth/blink (the avatar face stays neutral in XR unless you use another path).

**Galaxy XR workaround (dev):** Use the **main app** at `https://<dev-workstation-LAN-IP>:3000/` (not `/xr`) — typically your **Surface Laptop** on the LAN, not the DGX Spark. Install the [**OpenNexus XR Face** APK](../native/android-xr-face-bridge/README.md), run **`npm run dev`** on that workstation, open **⋮ → Open in Chrome for WebXR (+ face)** (`?nativeFaceRelay=1` + `?remoteLog=1`), and **keep the APK visible or in PiP** so **Jetpack XR** can relay to the dev server during Chrome **Full Space** AR (see [OpenXR face tracking](./OPENXR_FACE_TRACKING_ANDROID_XR.md), [Android Studio AI brief](./ANDROID_STUDIO_AI_BRIEF.md), and [dev machine topology](./DEV_MACHINE_TOPOLOGY.md)). OpenXR face is **disabled** in current APK builds (`OPENXR_ENABLED=false`).

**What to look for in logs:** on the first XR frame the app logs:

`[XR][expression] First-frame diagnostics` with `enabledFeatures`, `expressionTrackingGranted`, and `expressionsNonNull`. Use **`?remoteLog=1`** (see below) to forward that line from the headset to your dev machine.

### Remote logging from the headset (`?remoteLog=1`)

See also [`DEV_MACHINE_TOPOLOGY.md`](./DEV_MACHINE_TOPOLOGY.md) for which machine each client IP represents (Surface vs Galaxy XR vs DGX).

1. Start the dev server on your **dev workstation** (`npm run dev` on the Surface — default **https://** on port **3000** when certs exist; see `docs/HTTPS_SETUP.md`).
2. On the **headset**, open the app at **`https://<Surface-LAN-IP>:3000/?remoteLog=1`** (and add `&xrExpressionProbe=1` if you want the extra probe). **`https://localhost:3000` on the headset** targets the **headset itself**, not the Surface—use the workstation’s LAN address.
3. Logs are **POSTed** to `/__remote_log` on the same origin; Vite prints them and appends **`logs/remote-log.txt`**. The prefix `[::ffff:…]` is the **browser client** (headset `10.0.0.224`, Surface `10.0.0.32`, etc.).
4. You should see a browser console line: **`[RemoteLog] Forwarding console to /__remote_log`** when the client is active.

**`webcamDebug=1`** is normally used on the **Surface** browser, not the headset; check the client IP in `remote-log` before attributing a line to Galaxy XR.

References:

- [WebXR Expression Tracking draft (index.bs)](https://github.com/immersive-web/webxr-face-tracking-1/blob/main/index.bs)
- [OpenXR XR_ANDROID_face_tracking](https://registry.khronos.org/OpenXR/specs/1.1/man/html/XR_ANDROID_face_tracking.html)

Current behavior: **Webcam Avatar Control stays off during WebXR**. **XR Expression Tracking applies only inside an immersive session** when the UA exposes `expressions`; otherwise avatar face stays unchanged from non-XR drivers.
