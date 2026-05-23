# Android XR — OpenXR face bridge

Native **WebView** shell for Character Studio plus (TODO) **OpenXR `XR_ANDROID_face_tracking`** → `evaluateJavascript("__characterStudioNativeFace.push(...)")`.

The web side is implemented in:

- [`src/library/nativeFaceBridge.js`](../../src/library/nativeFaceBridge.js)
- [`src/library/xrExpressionTrackingDriver.js`](../../src/library/xrExpressionTrackingDriver.js) (`applyExpressionWeightRecordToVRMS`)
- [`docs/OPENXR_FACE_TRACKING_ANDROID_XR.md`](../../docs/OPENXR_FACE_TRACKING_ANDROID_XR.md)

## Gradle project (this folder)

| Path | Purpose |
|------|---------|
| `settings.gradle.kts` / `build.gradle.kts` | Root project |
| `app/` | Application module (`com.characterstudio.xrfacebridge`) |
| `gradle/wrapper/` | Wrapper 8.9 (also `gradlew` / `gradlew.bat`) |

**Open in Android Studio:** `File → Open` → select `native/android-xr-face-bridge`. Let it sync Gradle.

**Command line:** set `JAVA_HOME` to a **JDK 17** install (Android Studio’s JBR works, e.g. `…\Android Studio\jbr` on Windows), then:

```bash
cd native/android-xr-face-bridge
./gradlew :app:assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

## Configure Character Studio URL

The WebView URL is set at **build time** via `resValue` in `app/build.gradle.kts`:

1. **`local.properties`** (in this folder, gitignored — copy from `local.properties.example`):

   ```properties
   characterStudio.url=https://YOUR_PC_LAN_IP:3000/
   ```

   On Windows, `ipconfig` → **IPv4 Address** of the same Wi‑Fi as the headset (often `192.168.x.x`).

2. **Or** edit the fallback in `app/build.gradle.kts` → `readCharacterStudioUrl()` default (`https://192.168.1.100:3000/` is only an example).

**Important**

| Where you run | URL to use |
|---------------|------------|
| **Physical headset** | `https://<your-pc-lan-ip>:3000/` — must be reachable on the LAN. |
| **Android emulator** | `https://10.0.2.2:3000/` — special alias to the host PC (does **not** work on a real headset). |

**Dev server:** run Character Studio with `npm run dev` (Vite already uses `--host` so it listens on all interfaces).

**Firewall:** allow inbound **TCP 3000** (or your port) on the PC for private networks.

**HTTPS:** if the page fails with certificate errors, install/trust your dev CA on the headset or use a tunnel with a public certificate (same constraints as loading the site in Chrome on the device).

### White / blank WebView

1. **Self-signed / mkcert HTTPS:** Chrome may let you click through warnings; **WebView does not** and often stays blank. **Debug APK** (`assembleDebug`) now calls `SslErrorHandler.proceed()` only when `BuildConfig.DEBUG` is true so local dev certs load. **Release builds** still cancel bad certs — use a proper CA or network security config for production.
2. **Logcat:** filter tag `CS-XR-WebView` — you should see `loadUrl`, `onPageStarted` / `onPageFinished`, `console:` lines, and any `onReceivedError`.
3. **Remote inspect:** with a debug build, on desktop Chrome open `chrome://inspect` → inspect the WebView; check Console and Network.
4. **If the page loads but stays white:** watch JS `console:` lines in logcat — WebGL/WebGPU or a thrown error in React can leave a blank root (same as desktop devtools).

## Jetpack XR face → WebView (native bridge — implemented)

On **Android XR / supported** devices, after permissions and page load, [`XrFaceTrackingEngine.kt`](app/src/main/java/com/characterstudio/xrfacebridge/XrFaceTrackingEngine.kt) runs in the same activity as the WebView:

1. [`Session.create`](https://developer.android.com/develop/xr/jetpack-xr-sdk/add-session) → `configure(faceTracking = FaceTrackingMode.BLEND_SHAPES)`
2. [`Face.getUserFace`](https://developer.android.com/develop/xr/jetpack-xr-sdk/arcore/face) → blend shapes (~30 Hz)
3. Map to **WebXR-style keys** (`jaw_drop`, `mouth_left`, …) → inject into the WebView:
   - `window.onNativeFaceData(weights)` — optional thin hook
   - `window.__characterStudioNativeFace.push({ weights, t })` — used by Character Studio ([`nativeFaceBridge.js`](../../src/library/nativeFaceBridge.js))
4. Web calls `AndroidXRBridge.onBridgeReady()` after `initNativeFaceBridge()` ([`AndroidXrBridgeInterface.kt`](app/src/main/java/com/characterstudio/xrfacebridge/AndroidXrBridgeInterface.kt))

**No PC relay required** for face in the APK WebView. Load the dev site in the APK (or ship a build to the headset); VRM expressions apply via `sceneManager.js` like desktop.

**Note:** Standard Android **WebView does not support `navigator.xr`**. Native face works in the APK; immersive AR/VR still needs **Chrome** (relay below).

Requires dependencies in `app/build.gradle.kts` (`androidx.xr.runtime`, `androidx.xr.arcore`, `extensions-xr` compileOnly). On non-XR hardware, `Session.create` fails gracefully (see logcat `CS-JetpackFace`).

## WebXR (AR / VR) — **not in WebView**

**Android `WebView` does not support WebXR** (`navigator.xr` / immersive sessions). In-app **AR** and **VR** buttons will not enter XR inside this shell. That matches platform behavior; Chrome for Android / Android XR is where WebXR runs (see [Develop for the web on Android XR](https://developer.android.com/develop/xr/develop-with-webxr)).

### Chrome WebXR **with face** (dev relay — recommended)

1. On your PC: **`npm run dev`** (Vite serves HTTPS + **`/__native_face_ingest`** + **`/__native_face_sse`**).
2. Install this APK, grant **face tracking**, load Character Studio in the WebView once (Jetpack face starts).
3. Toolbar **⋮** → **Open in Chrome for WebXR (+ face)** — URL includes **`?nativeFaceRelay=1`**.
4. **Keep CS XR Face visible** after opening Chrome — Jetpack face only runs while the bridge stays active. The APK starts a transparent **`FaceKeeperActivity`** plus PiP (when available) so the Jetpack session host stays resumed while Chrome runs WebXR. On **Galaxy XR Home Space**, still leave the **CS XR Face panel** beside Chrome if PiP is unavailable. The foreground notification should say **“Relaying face tracking to Chrome”**.
5. **Permissions:** grant **Notifications**, **Face tracking**, and **Camera** when prompted (or all at once in App info). Crashes on first launch are often from starting the foreground service before notifications are allowed — fixed in recent builds.
5. Enter AR/VR in Chrome; remote log should show **`nativeKeys > 0`** and **`relay=poll/…ms`** while **`xrPresenting=true`**.

**Troubleshooting**

| Remote log | Meaning |
|------------|---------|
| `relay=enabled-not-running` | Chrome has `?nativeFaceRelay=1` but relay JS did not start — hard-refresh Chrome after `npm run dev` restart |
| `relay=poll/stale` + `nativeKeys=0` in Chrome AR | APK went fully background — use ⋮ → Open in Chrome again and **keep the PiP bubble** on screen; or bring CS XR Face to foreground briefly |
| `relay=poll+sse/50ms` + `nativeKeys=25+` | Relay working (often while APK or PiP is active) |
| `faceSrc=jetpack` / `faceSrc=openxr` | Which APK backend last posted weights (OpenXR needs Phase 1b APK + logcat `CS-OpenXrNative`) |
| `nativeKeys=25+` in WebView only | Jetpack works; relay not used — use ⋮ → **Open in Chrome for WebXR (+ face)** |
| No `[native-face-relay] ingest` on PC | APK not rebuilt, face permission denied, or Jetpack session failed (logcat `CS-JetpackFace`) |

**Restart `npm run dev`** after pulling relay changes (Vite plugin must load).

**What to do without the relay:** use **⋮ → Open in browser** only for XR without face, or wait for WebXR **`expression-tracking`** in Chrome.

Trade-off: the relay is **dev-only** (Vite plugin). Production would need WebXR expressions, a hosted relay, or a native immersive host (OpenXR Phase 1 in README below).

## What’s implemented now

- `MainActivity`: `MaterialToolbar` + full-screen `WebView`, JS enabled, loads `character_studio_url`.
- Menu action **Open in browser (WebXR)** for immersive sessions in Chrome.
- **File import:** `onShowFileChooser` **does not** call `FileChooserParams.createIntent()` (that keeps the site’s `accept`/image MIME and opens **Gallery** on many devices). Instead it builds **`ACTION_OPEN_DOCUMENT`** with **`*/*`**, **`EXTRA_INITIAL_URI`** at internal storage (`primary:`), optional **`EXTRA_SHOW_ADVANCED`**, then **`Intent.createChooser`** so you can pick **My Files / Files** instead of Photos. In the chooser, avoid **Photos** / **Gallery** if you want folder paths.
- Runtime request for **`android.permission.FACE_TRACKING`** (required before `xrCreateFaceTrackerANDROID` once OpenXR is wired).
- **`android.permission.RECORD_AUDIO`** and **`android.permission.CAMERA`** in the manifest + **`WebChromeClient.onPermissionRequest`** so the page can use **`getUserMedia`** (lip sync, webcam) inside the WebView.
- Background: `FaceBridgeForegroundService` + `FaceTrackingCoordinator` (Jetpack + OpenXR) watchdog → HTTP relay while Chrome WebXR runs.
- **Chrome handoff:** `FaceKeeperActivity` + PiP before Chrome (~450ms delay); `FaceHandoffState` persists across process restarts and widens stale thresholds (30s APK / 12s web during `xrPresenting`). The foreground service restarts FaceKeeper when handoff is active but no session host. `XrFaceTrackingEngine` does not cancel a live collector when relay is quiet but ticks are fresh; session recycle is debounced (15s). Logcat: `CS-FaceKeeper`, `CS-FaceBridgeSvc`, `CS-JetpackFace` (`face.state not TRACKING` during AR). Keep the PiP panel visible in Home Space during AR.

## Prerequisites (OpenXR — next steps)

- Android Studio + Android XR / OpenXR NDK as per [Android XR for OpenXR](https://developer.android.com/develop/xr/openxr/extensions)
- Optional: local PDFs under repo `OpenXR/` for offline diagrams; API names from [Khronos man pages](https://registry.khronos.org/OpenXR/specs/1.1/man/html/XR_ANDROID_face_tracking.html)

## Phase 1 — OpenXR (implemented, parallel to Jetpack)

**Goal:** Face ingest while Chrome is in **Full Space** WebXR, without breaking Jetpack + HTTP relay.

| Component | Role |
|-----------|------|
| [`FaceTrackingCoordinator.kt`](app/src/main/java/com/characterstudio/xrfacebridge/FaceTrackingCoordinator.kt) | Starts both backends; watchdog uses freshest `lastPostAgeMs()` |
| [`XrFaceTrackingEngine.kt`](app/src/main/java/com/characterstudio/xrfacebridge/XrFaceTrackingEngine.kt) | Jetpack XR (activity-visible) |
| [`OpenXrFaceEngine.kt`](app/src/main/java/com/characterstudio/xrfacebridge/OpenXrFaceEngine.kt) + `libcs_openxr_face.so` | OpenXR headless `xrGetFaceStateANDROID` → `openxrParameters` JSON |

Native code: [`app/src/main/cpp/`](app/src/main/cpp/) (CMake downloads OpenXR headers from [jetpack-xr-natives](https://github.com/google-ar/jetpack-xr-natives) on first build; cached under `third_party/openxr/`). First build needs network.

**Logcat:** `CS-OpenXrNative` / `CS-OpenXrFace` — look for `OpenXR instance ok at apiVersion 1.0.34`, then `OpenXR session created with GLES binding` / `OpenXR face tracker ready`. Galaxy runtime rejects **1.1.x** (`Max supported version is 1.0`). Requires Khronos loader in APK (`prefab = true` + `openxr_loader_for_android` + `uses-native-library libopenxr.google.so`).

**Phase 1b:** hidden `TextureView` (1×1 buffer; `SurfaceView` behind `WebView` often never gets a surface on Galaxy XR) + `xrGetOpenGLESGraphicsRequirementsKHR` + PBuffer EGL for `XrGraphicsBindingOpenGLESAndroidKHR` (`openxr_gfx_egl.cpp`). Remote log shows `faceSrc=jetpack|openxr` when relay is live.

## Phase 2 — WebView transport

1. After the page loads, ensure `window.__characterStudioNativeFace` exists (Character Studio calls `initNativeFaceBridge()` on startup).
2. From Kotlin on the **main thread**, periodically:

   ```kotlin
   val json = JSONObject().apply {
     put("openxrParameters", JSONArray(params)) // 68 floats, spec order
     put("t", System.currentTimeMillis())
   }
   webView.evaluateJavascript(
     "__characterStudioNativeFace.push(${json});",
     null
   )
   ```

Prefer **in-process** `evaluateJavascript` over headset `localhost` WebSocket unless you control network policy.

## Phase 3 — Lifecycle

- Throttle pushes (30 Hz is often enough).
- Foreground service + `XrFaceTrackingEngine` watchdog; do not `clear()` native weights on pause when relaying to Chrome.

## Phase 4 — Verification

- Web: `?remoteLog=1`; optional `?xrExpressionProbe=1`.
- Native: `adb logcat` for OpenXR / permission errors.

### Sharing logs with someone else (no guesswork)

1. **WebView + dev PC** — Append **`?remoteLog=1`** to the URL in `local.properties` (`characterStudio.url`). Run **`npm run dev`** on the PC. The page POSTs console output to `/__remote_log`; Vite appends **`logs/remote-log.txt`**. Every few seconds you should see **`[CS-NATIVE-FACE-DIAG]`** with `nativeKeys`, `vrms`, and `exprMgr` (confirms native weights vs. which VRM is wired).
2. **Native (Kotlin)** — From the repo root, run **`.\scripts\capture-apk-logcat.ps1`** after reproducing on device; it appends **`CS-JetpackFace`** / **`CS-XR-WebView`** lines to **`logs/apk-logcat.txt`**. Look for **`First native face push`** from Jetpack face.
