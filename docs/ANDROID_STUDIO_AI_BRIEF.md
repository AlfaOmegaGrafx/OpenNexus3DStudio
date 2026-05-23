# Android Studio AI brief — CS XR Face Bridge APK

Copy-paste this document (or sections) into **Android Studio AI Assistant** when working on `native/android-xr-face-bridge/`. It explains the product goal, architecture, what works, what is broken, and what we need help with.

## Product goal

We are building **Character Studio** — a web app (React + Three.js + VRM) that runs in **Chrome WebXR** on **Galaxy XR / Android XR**. We need **live facial blend shapes** on the VRM avatar during **immersive AR/VR**.

**Problem:** Chrome on Android XR does **not** grant WebXR **`expression-tracking`** / `XRFrame.expressions`, so the web app cannot read the face from inside Chrome.

**Solution:** A companion APK (`com.characterstudio.xrfacebridge`, folder `native/android-xr-face-bridge/`) that:

1. Runs **native face tracking** (Jetpack XR + optional OpenXR `XR_ANDROID_face_tracking`).
2. While the user is in **Chrome WebXR**, **POSTs face JSON** to the dev PC over LAN.
3. Chrome loads the same Character Studio URL with **`?nativeFaceRelay=1`** and applies weights to the VRM (same code path as native WebView injection).

This is a **dev workflow** today (Vite relay on PC). Production would need WebXR expressions, a hosted relay, or a native immersive host.

## End-to-end data flow

```
[Galaxy XR headset]
  CS XR Face APK
    Jetpack XR Session + Face (BLEND_SHAPES)  ─┐
    OpenXR xrGetFaceStateANDROID (parallel) ─┤
                                             ▼
    FaceHttpRelay → POST https://<PC_LAN_IP>:3000/__native_face_ingest
                                             │
[Dev PC] npm run dev (Vite)                  │
    relay plugin → SSE /__native_face_sse    │
                                             ▼
  Chrome WebXR (immersive AR/VR)
    ?nativeFaceRelay=1 → nativeFaceBridge.js → VRM morph targets
```

**WebView path (works without relay):** APK loads Character Studio in `WebView` → `evaluateJavascript("__characterStudioNativeFace.push(...)")`. **WebView does not support `navigator.xr`**, so AR/VR must use Chrome.

**Chrome path (needs relay):** User uses menu **⋮ → Open in Chrome for WebXR (+ face)**. APK must **keep face tracking alive** while Chrome is foreground (PiP + `FaceKeeperActivity` + foreground service).

## What is already implemented

| Area | Status |
|------|--------|
| Gradle app, WebView shell, dev HTTPS (debug SSL proceed) | Done |
| `XrFaceTrackingEngine` — Jetpack `Session`, `Face.getUserFace`, ~30 Hz | Done |
| `FaceHttpRelay` — OkHttp POST to `/__native_face_ingest` | Done |
| `FaceBridgeForegroundService` + notification | Done |
| `FaceKeeper` / `FaceKeeperActivity` — transparent 1×1 host during Chrome handoff | Done |
| `FaceHandoffState` — `SharedPreferences` for `chromeHandoff`, 30s stale threshold | Done |
| `FaceTrackingCoordinator` — Jetpack + OpenXR, picks freshest `lastPostAgeMs()` | Done |
| OpenXR native (`libcs_openxr_face.so`, `OpenXrFaceEngine`, GLES/PBuffer Phase 1b) | Scaffolded / partial |
| Permissions: `FACE_TRACKING`, notifications, camera, audio for WebView | Done |
| Web side: `nativeFaceBridge.js`, `nativeFaceRelay.js`, Vite plugin, tests | Done (see repo `src/`) |

### Payload contract (JSON POST body)

- **Preferred:** WebXR-style keys: `{ "weights": { "jaw_drop": 0.6, ... }, "t": <epochMs> }`
- **Or dense array:** `{ "openxrParameters": [68 floats], "t": ... }` (Khronos `XrFaceParameterIndicesANDROID` order)

Web maps via `src/library/openxrFaceParameterMap.js` → `applyExpressionWeightRecordToVRMS` in `src/library/xrExpressionTrackingDriver.js`.

See also [`OPENXR_FACE_TRACKING_ANDROID_XR.md`](./OPENXR_FACE_TRACKING_ANDROID_XR.md) and [`native/android-xr-face-bridge/README.md`](../native/android-xr-face-bridge/README.md).

## Status after May 2026 Android Studio pass (verify on device)

| Mode | Behavior (before fix) | Expected after fix |
|------|------------------------|-------------------|
| **Flat Chrome / WebView** | Works: `nativeKeys` 25–42 | Unchanged |
| **Chrome immersive AR (Full Space)** | Relay stale; `nativeKeys=0`; Jetpack `not TRACKING` | OpenXR **PBuffer** path + `FaceKeeperActivity` host; Jetpack fallback |

### Implemented in repo (May 2026)

1. **Headless OpenXR (Phase 1b):** `openxr_face_engine.cpp` prefers PBuffer EGL; `OpenXrFaceEngine.tryStartNative` does **not** require `TextureView` / `surfaceReady`.
2. **Chrome handoff:** `FaceKeeperActivity.onResume` → `setActivity`, `setSessionHost`, `ensureFacePipeline("keeper-onResume")`.
3. **Coordinator:** `OpenXrFaceEngine.ensureFacePipeline` always; Jetpack also when `!OpenXrFaceEngine.isCollecting() || chromeHandoff`.
4. **Watchdog / recycle:** `CHROME_HANDOFF_STALE_MS` = **10s**; force recycle when relay quiet **2×** stale (~20s) even if collector ticks; `COLLECTOR_STUCK_CHROME_MS` = **20s**.
5. **FG service:** `dataSync|camera|microphone` (microphone type gated **API 34+**); manifest `FOREGROUND_SERVICE_MICROPHONE`.
6. **Handoff expiry:** Restored handoff only if last successful relay ingest < **60s**; launcher cold start clears handoff; `FaceKeeperActivity` finishes if handoff is false (transparent theme, no spurious `setChromeHandoff(true)` in keeper).

### Known gaps / review notes (not fully fixed in code)

| Issue | Detail |
|-------|--------|
| **Web vs APK stale mismatch** | Web holds last weights **30s** during `xrPresenting`; APK handoff stale **10s** — intentional (UI stability vs faster recovery). |
| **Jetpack + OpenXR parallel during handoff** | Coordinator still starts Jetpack while `chromeHandoff` even if OpenXR is collecting — may compete for GLES on Galaxy XR; watch logcat for session failures. |
| **FGS `microphone` type** | Declared for process priority; face tracking does not use the mic — only add if WebView/FG path actually records audio, or Play policy may question it. |
| **Assistant summary typo** | Claimed “1.5× stale = 15s”; code uses **2×** `effectiveStaleMs()` → **~20s** during handoff. |
| **OpenXrFaceEngine.kt** | `setSurface` still only nudges pipeline when `surfaceReady` — headless path is via `ensureFacePipeline` without surface (OK). |

### Success criteria (re-test after rebuild)

- In Chrome AR: **`nativeKeys > 25`**, **`relay=poll+sse/<500ms`**, sustained while **`xrPresenting=true`** (live ingest, not frozen cache).
- Logcat: `CS-OpenXrFace` `OpenXR GLES face started` / `First OpenXR face push`; or `CS-JetpackFace` `TRACKING` + `CS-FaceHttpRelay` posts.

## Key Kotlin / native files (open these first)

| File | Role |
|------|------|
| `MainActivity.kt` | WebView, permissions, ⋮ → Chrome handoff, PiP, FaceKeeper acquire/release |
| `XrFaceTrackingEngine.kt` | Jetpack face collect loop, `FaceHttpRelay.post`, watchdog / recycle logic |
| `FaceKeeper.kt` / `FaceKeeperActivity.kt` | Session host while Chrome in XR |
| `FaceHandoffState.kt` | Persistent chrome handoff flag |
| `FaceBridgeForegroundService.kt` | FG service, keeper restart, reconfigure when relay stale |
| `FaceTrackingCoordinator.kt` | Start/stop Jetpack + OpenXR |
| `FaceHttpRelay.kt` | LAN POST to dev server |
| `OpenXrFaceEngine.kt` + `app/src/main/cpp/*` | OpenXR 1.0.x, `XR_ANDROID_face_tracking`, GLES binding |
| `FaceBlendShapeMaps.kt` | Jetpack → WebXR key mapping |
| `AndroidXrBridgeInterface.kt` | JS `AndroidXRBridge.onBridgeReady()` |

**Log tags:** `CS-JetpackFace`, `CS-FaceKeeper`, `CS-FaceBridgeSvc`, `CS-FaceHttpRelay`, `CS-OpenXrNative`, `CS-XR-WebView`

## Platform constraints (do not violate)

1. **WebView ≠ WebXR** — do not try to enter immersive XR inside WebView; Chrome only for AR/VR.
2. **Galaxy XR OpenXR runtime** — API **1.0.x** only (1.1 rejected: “Max supported version is 1.0.34”).
3. **`android.permission.FACE_TRACKING`** — required before `xrCreateFaceTrackerANDROID`.
4. **Chrome cannot share OpenXR session** with our APK — headless / separate OpenXR instance is the intended Phase 1b approach.
5. **Dev URL** — `local.properties` → `characterStudio.url=https://<PC_LAN_IP>:3000/` (gitignored). PC runs `npm run dev` with `--host`; firewall allows TCP 3000.
6. **HTTPS** — debug builds trust dev certs for relay POST; release must not blindly `proceed()` on SSL errors.

## Follow-up tasks (if Full Space AR still fails after May 2026 build)

1. **Verify OpenXR actually posts in AR** — logcat `CS-OpenXrFace`; remote log `faceSrc=openxr` or payload `"source":"openxr"`.
2. **Reduce Jetpack/OpenXR contention** — consider Jetpack **only** when `!OpenXrFaceEngine.isCollecting()` during handoff (today Jetpack always runs on handoff).
3. **Runtime permission** — ensure `FACE_TRACKING` granted before OpenXR `xrCreateFaceTrackerANDROID`.
4. **Optional:** If Google documents face → Chrome WebXR without relay, prefer that for production.

**Do not:** Remove HTTP relay without a Chrome replacement; break WebView `evaluateJavascript`; commit secrets or LAN IPs in source.

## How to test (repro steps)

1. PC: `npm run dev` → `https://<PC_IP>:3000/?remoteLog=1&nativeFaceRelay=1`
2. Install debug APK; grant face + notifications + camera.
3. Open app → load site → **⋮ → Open in Chrome for WebXR (+ face)**.
4. Keep CS XR Face visible or PiP bubble in Home Space.
5. Enter AR in Chrome; watch PC `logs/remote-log.txt` for `[CS-NATIVE-FACE-DIAG] nativeKeys=… relay=… xrPresenting=…`
6. `adb logcat` with tags above, or repo script `scripts/capture-apk-logcat.ps1`

## Related web repo paths

| Path | Role |
|------|------|
| `src/library/nativeFaceBridge.js` | Consumes native weights |
| `src/library/nativeFaceRelay.js` | Chrome SSE/poll from dev server |
| `vite.config.js` | `__native_face_ingest` / `__native_face_sse` plugins |
| `docs/OPENXR_FACE_TRACKING_ANDROID_XR.md` | Spec links, payload contract |
| `docs/WEBCAM_AVATAR_CONTROL.md` | WebXR expression notes, remote logging |

## One-sentence summary

**Keep Jetpack XR (and/or OpenXR `XR_ANDROID_face_tracking`) posting ~30 Hz face blend shapes to a LAN HTTP relay while Chrome runs Full Space WebXR, because Chrome does not expose `expression-tracking` and WebView cannot run WebXR.**
