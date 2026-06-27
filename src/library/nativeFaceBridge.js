/**
 * Ingest face expression weights from a native Android XR / OpenXR host (WebView bridge).
 * Keys should match WebXR Expression Tracking draft names (e.g. jaw_drop, eyes_closed_left)
 * so {@link applyExpressionWeightRecordToVRMS} can reuse {@link inferVRMMorphTargets}.
 *
 * Alternatively pass **`openxrParameters`**: a dense float array in
 * `XrFaceParameterIndicesANDROID` order; see `openxrFaceParameterMap.js`.
 *
 * Native side (OpenNexus XR Face APK WebView):
 * - `window.onNativeFaceData(weights)` — thin hook (weights use WebXR keys, e.g. `jaw_drop`)
 * - `window.__openNexus3dStudioNativeFace.push(payload)` — full payload `{ weights, t }`
 * - `window.AndroidXRBridge.onBridgeReady()` — call from web after init; native restarts pipeline
 *
 * Chrome WebXR still uses the dev HTTP relay (`nativeFaceRelay.js`), not this bridge.
 *
 * `clear()` and `resetExpressionNeutral()` reset the face neutral snapshot used by
 * `xrExpressionTrackingDriver` so the next frame can re-establish “zero” from your relaxed pose.
 */

import { openxrFloatParametersToWebXRRecord } from './openxrFaceParameterMap.js';
import { resetFaceExpressionNeutralBaseline } from './xrExpressionTrackingDriver.js';

/** Window global injected by `com.opennexus3dstudio.xrfacebridge` WebView evaluateJavascript. */
export const NATIVE_FACE_WINDOW_API = '__openNexus3dStudioNativeFace';

/**
 * Web-side OpenXR toggle.  When `false` the `openxrParameters` dense-float
 * path in the native face bridge is skipped entirely.  Mirror of the APK-side
 * `FaceTrackingCoordinator.OPENXR_ENABLED`.  Flip to `true` when the APK
 * re-enables the OpenXR face engine.
 */
export const OPENXR_WEB_ENABLED = false;

/** WebView / main-thread jank can delay rAF; keep native weights usable longer than one XR frame. */
const DEFAULT_MAX_AGE_MS = 2000;
/** Chrome WebXR: APK relay can gap while PiP/keeper catches up — match APK handoff stale (30s). */
const XR_PRESENTING_MAX_AGE_MS = 30_000;
const PUSH_SKIP_KEYS = new Set(['weights', 't', 'ts', 'openxrParameters', 'source']);

let _lastRecord = /** @type {Record<string, number>|null} */ (null);
let _lastTs = 0;
/** @type {'jetpack'|'openxr'|'unknown'} */
let _lastSource = 'unknown';

/**
 * @param {Record<string, number>} record
 * @param {number} [timestampMs] - defaults to Date.now()
 */
export function pushNativeFaceWeights(record, timestampMs = Date.now()) {
  if (!record || typeof record !== 'object') return;
  _lastRecord = { ...record };
  _lastTs = typeof timestampMs === 'number' ? timestampMs : Date.now();
}

export function getLastNativeFaceSource() {
  return _lastSource;
}

export function clearNativeFaceWeights() {
  _lastRecord = null;
  _lastTs = 0;
  _lastSource = 'unknown';
  try {
    resetFaceExpressionNeutralBaseline();
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {number} [maxAgeMs]
 * @param {boolean} [xrPresenting] — when true, uses longer hold during Chrome WebXR + relay gaps
 */
export function getNativeFaceWeightsIfFresh(
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  xrPresenting = false,
) {
  if (!_lastRecord) return null;
  const limit =
    maxAgeMs !== DEFAULT_MAX_AGE_MS
      ? maxAgeMs
      : xrPresenting
        ? XR_PRESENTING_MAX_AGE_MS
        : DEFAULT_MAX_AGE_MS;
  const age = Date.now() - _lastTs;
  if (age > limit) return null;
  return _lastRecord;
}

/** @param {boolean} [xrPresenting] */
export function getNativeFaceWeightsMaxAgeMs(xrPresenting = false) {
  return xrPresenting ? XR_PRESENTING_MAX_AGE_MS : DEFAULT_MAX_AGE_MS;
}

/** True when running inside the OpenNexus XR Face APK WebView (`AndroidXRBridge` injected). */
export function isAndroidXrWebView() {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.AndroidXRBridge?.onBridgeReady === 'function';
  } catch {
    return false;
  }
}

function notifyAndroidXrBridgeReady() {
  if (!isAndroidXrWebView()) return;
  try {
    window.AndroidXRBridge.onBridgeReady();
  } catch (e) {
    console.warn('[nativeFaceBridge] AndroidXRBridge.onBridgeReady failed:', e?.message || e);
  }
}

/**
 * @param {{ push: (payload: unknown) => void }} api
 */
function installOnNativeFaceDataHook(api) {
  window.onNativeFaceData = (weights) => {
    if (!weights || typeof weights !== 'object' || Array.isArray(weights)) return;
    api.push({ weights, t: Date.now() });
  };
}

function drainNativeFacePendingQueue() {
  /** @type {unknown[]} */
  let pending = [];
  try {
    for (const key of ['__ON_NATIVE_FACE_Q', '__CS_NATIVE_FACE_Q']) {
      const q = window[key];
      if (Array.isArray(q) && q.length) {
        pending = pending.concat(q.splice(0, q.length));
        window[key] = [];
      }
    }
  } catch (_) {
    /* ignore */
  }
  return pending;
}

export function initNativeFaceBridge() {
  if (typeof window === 'undefined') return;

  const pendingFromNative = drainNativeFacePendingQueue();

  const api = {
    /**
     * @param {string|Record<string, unknown>} payload - JSON string or object.
     * Shapes: `{ weights: { jaw_drop: 0.5 } }`, flat `{ jaw_drop: 0.5 }`, or
     * `{ openxrParameters: number[] }` (dense `XrFaceParameterIndicesANDROID` order).
     * Named keys override values from `openxrParameters` when both are present.
     */
    push(payload) {
      try {
        const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (!obj || typeof obj !== 'object') return;
        /** @type {Record<string, number>} */
        const rec = {};
        if (typeof obj.source === 'string') {
          _lastSource = obj.source === 'openxr' || obj.source === 'jetpack' ? obj.source : 'unknown';
        } else if (OPENXR_WEB_ENABLED && Array.isArray(obj.openxrParameters) && obj.openxrParameters.length > 0) {
          _lastSource = 'openxr';
        } else if (obj.weights && typeof obj.weights === 'object') {
          _lastSource = 'jetpack';
        }
        if (OPENXR_WEB_ENABLED && Array.isArray(obj.openxrParameters) && obj.openxrParameters.length > 0) {
          Object.assign(rec, openxrFloatParametersToWebXRRecord(obj.openxrParameters));
        }
        const weights =
          obj.weights && typeof obj.weights === 'object' && !Array.isArray(obj.weights)
            ? obj.weights
            : obj;
        for (const k of Object.keys(weights)) {
          if (PUSH_SKIP_KEYS.has(k)) continue;
          const v = weights[k];
          const n = typeof v === 'number' ? v : Number(v);
          if (!Number.isNaN(n)) rec[k] = n;
        }
        const ts =
          typeof obj.t === 'number'
            ? obj.t
            : typeof obj.ts === 'number'
              ? obj.ts
              : Date.now();
        pushNativeFaceWeights(rec, ts);
      } catch (e) {
        console.warn('[nativeFaceBridge] push failed:', e?.message || e);
      }
    },
    clear: clearNativeFaceWeights,
    /** Re-capture relaxed face as “zero” on the next preprocess (after you return to neutral). */
    resetExpressionNeutral: resetFaceExpressionNeutralBaseline,
    /** @param {number} [maxAgeMs] */
    getFresh: (maxAgeMs) => getNativeFaceWeightsIfFresh(maxAgeMs ?? DEFAULT_MAX_AGE_MS),
  };

  window[NATIVE_FACE_WINDOW_API] = api;
  installOnNativeFaceDataHook(api);
  notifyAndroidXrBridgeReady();

  for (const item of pendingFromNative) {
    try {
      api.push(item);
    } catch (_) {
      /* ignore */
    }
  }

  try {
    window.dispatchEvent(
      new CustomEvent('opennexus3dstudio-native-face-ready', { detail: { api } }),
    );
  } catch (_) {
    /* ignore */
  }
}
