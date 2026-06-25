/**
 * Record-and-replay face tracking for Chrome WebXR.
 *
 * The dev relay ({@link nativeFaceRelay.js}) only flows while the CS XR Face APK
 * (the tracking source) stays foregrounded — but entering an immersive Chrome
 * WebXR session backgrounds/throttles that APK, so live weights stop arriving.
 *
 * This module replays a previously recorded relay stream entirely inside the
 * Chrome WebXR session: it feeds interpolated weights into {@link pushNativeFaceWeights}
 * (or the full bridge `push()` path, to preserve `source`) on a `requestAnimationFrame`
 * scheduler while flat; during immersive WebXR, {@link tickNativeFacePlaybackOnXrFrame}
 * is called from `sceneManager`'s `setAnimationLoop` (document rAF is throttled in XR).
 * The consumer (`sceneManager` → `getNativeFaceWeightsIfFresh`) is unchanged — to it,
 * playback is indistinguishable from a live relay.
 *
 * ## Memory model (long sessions)
 * Frames are stored **columnar**: a single key list + a `Float64Array` of relative
 * timestamps + a flat `Float32Array` of weights (`frameCount * keyCount`). This keeps
 * an hour-long recording at ~tens of bytes/frame in memory instead of allocating one
 * JS object per frame. Two input formats are accepted:
 *  - **JSONL** (`{ id, frames: [{ weights, t }] }`) — dev relay; convenient, verbose.
 *  - **Binary `.csfr`** (quantized columnar, see {@link decodeBinaryRecording}) — ~20×
 *    smaller; the production / long-session format (served by the APK loopback server).
 *
 * ## Sources
 * Enable with `?nativeFacePlayback=<recordingId>`:
 *  - `&nativeFacePlaybackLoop=0` — play once instead of looping.
 *  - `&playbackBase=<url>` — fetch the recording from an arbitrary base (e.g. the APK
 *    on-device loopback server `http://127.0.0.1:8137`); defaults to same-origin
 *    `/__native_face_recording` (the Vite dev relay).
 */

import { pushNativeFaceWeights } from './nativeFaceBridge.js';
import {
  prepareFaceRecordingAudioPlayback,
  syncFaceRecordingAudioPlayback,
  stopFaceRecordingAudioPlayback,
  hasFaceRecordingAudioPlayback,
  ensureFaceRecordingAudioUnlockGestures,
  unlockFaceRecordingAudioPlayback,
  maybeUnlockFaceRecordingAudioOnXrFrame,
} from './nativeFaceRecordingAudio.js';

const RECORDING_PATH = '/__native_face_recording';
const CSFR_MAGIC = 0x43534652; // 'CSFR'

let _rafId = 0;
let _timerId = null;
/** @type {string[]} */
let _keys = [];
let _keyCount = 0;
/** @type {Float64Array|null} */
let _relTimes = null;
/** @type {Float32Array|null} */
let _weights = null;
let _frameCount = 0;
let _durationMs = 0;
let _source = /** @type {string|undefined} */ (undefined);
let _loop = true;
let _startWallClock = 0;
let _playing = false;
let _recordingId = null;
let _cursor = 0;
let _hasAudio = false;
let _playbackBase = null;

/** @returns {boolean} */
export function isNativeFacePlaybackEnabledInUrl() {
  return getNativeFacePlaybackIdFromUrl() != null;
}

/** @returns {string|null} */
export function getNativeFacePlaybackIdFromUrl() {
  if (typeof window === 'undefined') return null;
  try {
    const v = new URLSearchParams(window.location.search).get('nativeFacePlayback');
    if (!v) return null;
    const trimmed = v.trim();
    if (!trimmed || trimmed === '0' || trimmed === 'false') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/** @returns {string|null} — `?playbackBase` (e.g. APK loopback origin), else null. */
export function getNativeFacePlaybackBaseFromUrl() {
  if (typeof window === 'undefined') return null;
  try {
    const v = new URLSearchParams(window.location.search).get('playbackBase');
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} — loop unless `?nativeFacePlaybackLoop=0`. */
function getLoopFromUrl() {
  if (typeof window === 'undefined') return true;
  try {
    const v = new URLSearchParams(window.location.search).get('nativeFacePlaybackLoop');
    return !(v === '0' || v === 'false' || v === 'no');
  } catch {
    return true;
  }
}

/**
 * Normalize a raw frame array into time-relative playback frames sorted by `t`.
 * Kept as a readable object-array (used by the JSONL path + tests); converted to
 * the columnar model by {@link framesToColumnar} before playback.
 * @param {Array<Record<string, unknown>>} rawFrames
 * @returns {Array<{ rel: number, weights: Record<string, number>, source?: string }>}
 */
export function normalizeRecordingFrames(rawFrames) {
  if (!Array.isArray(rawFrames) || rawFrames.length === 0) return [];
  /** @type {Array<{ t: number, weights: Record<string, number>, source?: string }>} */
  const parsed = [];
  for (const f of rawFrames) {
    if (!f || typeof f !== 'object') continue;
    const weightsObj =
      f.weights && typeof f.weights === 'object' && !Array.isArray(f.weights) ? f.weights : f;
    /** @type {Record<string, number>} */
    const weights = {};
    for (const k of Object.keys(weightsObj)) {
      if (k === 'weights' || k === 't' || k === 'ts' || k === 'source' || k === 'openxrParameters') {
        continue;
      }
      const n = typeof weightsObj[k] === 'number' ? weightsObj[k] : Number(weightsObj[k]);
      if (!Number.isNaN(n)) weights[k] = n;
    }
    if (Object.keys(weights).length === 0) continue;
    const t = typeof f.t === 'number' ? f.t : typeof f.ts === 'number' ? f.ts : NaN;
    parsed.push({
      t: Number.isNaN(t) ? parsed.length : t,
      weights,
      source: typeof f.source === 'string' ? f.source : undefined,
    });
  }
  if (parsed.length === 0) return [];
  parsed.sort((a, b) => a.t - b.t);
  const t0 = parsed[0].t;
  return parsed.map((p) => ({ rel: Math.max(0, p.t - t0), weights: p.weights, source: p.source }));
}

/**
 * @typedef {Object} ColumnarRecording
 * @property {string[]} keys
 * @property {number} keyCount
 * @property {number} frameCount
 * @property {Float64Array} relTimes
 * @property {Float32Array} weights - flat, length frameCount*keyCount
 * @property {number} durationMs
 * @property {string} [source]
 */

/**
 * Convert a normalized object-array into the columnar model.
 * @param {Array<{ rel: number, weights: Record<string, number>, source?: string }>} frames
 * @returns {ColumnarRecording}
 */
export function framesToColumnar(frames) {
  const list = Array.isArray(frames) ? frames : [];
  const keySet = new Set();
  for (const f of list) {
    if (f && f.weights) for (const k of Object.keys(f.weights)) keySet.add(k);
  }
  const keys = [...keySet].sort();
  const keyCount = keys.length;
  const frameCount = list.length;
  const relTimes = new Float64Array(frameCount);
  const weights = new Float32Array(frameCount * keyCount);
  let source;
  for (let i = 0; i < frameCount; i += 1) {
    const f = list[i];
    relTimes[i] = typeof f.rel === 'number' ? f.rel : 0;
    if (!source && f.source) source = f.source;
    const base = i * keyCount;
    for (let k = 0; k < keyCount; k += 1) {
      const v = f.weights?.[keys[k]];
      weights[base + k] = typeof v === 'number' ? v : 0;
    }
  }
  return {
    keys,
    keyCount,
    frameCount,
    relTimes,
    weights,
    durationMs: frameCount ? relTimes[frameCount - 1] : 0,
    source,
  };
}

/**
 * Encode a columnar recording to the compact binary `.csfr` format (quantized uint8
 * weights). Layout (little-endian):
 *   magic u32 'CSFR' | version u8 | flags u8 | keyCount u16 | frameCount u32 |
 *   sourceLen u8 + source bytes | (keyLen u8 + key bytes)*keyCount |
 *   (relMs u32 + weightQuant u8*keyCount)*frameCount
 * @param {ColumnarRecording} rec
 * @returns {ArrayBuffer}
 */
export function encodeBinaryRecording(rec) {
  const enc = new TextEncoder();
  const sourceBytes = enc.encode(rec.source || '');
  const keyByteArrays = rec.keys.map((k) => enc.encode(k));
  let size = 4 + 1 + 1 + 2 + 4; // header
  size += 1 + sourceBytes.length;
  for (const kb of keyByteArrays) size += 1 + kb.length;
  size += rec.frameCount * (4 + rec.keyCount);

  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let o = 0;
  dv.setUint32(o, CSFR_MAGIC, true); o += 4;
  dv.setUint8(o, 1); o += 1; // version
  dv.setUint8(o, 1); o += 1; // flags: bit0 = uint8 quantized weights
  dv.setUint16(o, rec.keyCount, true); o += 2;
  dv.setUint32(o, rec.frameCount, true); o += 4;
  dv.setUint8(o, sourceBytes.length); o += 1;
  bytes.set(sourceBytes, o); o += sourceBytes.length;
  for (const kb of keyByteArrays) {
    dv.setUint8(o, kb.length); o += 1;
    bytes.set(kb, o); o += kb.length;
  }
  for (let i = 0; i < rec.frameCount; i += 1) {
    dv.setUint32(o, Math.max(0, Math.round(rec.relTimes[i])), true); o += 4;
    const base = i * rec.keyCount;
    for (let k = 0; k < rec.keyCount; k += 1) {
      const w = rec.weights[base + k];
      bytes[o] = Math.max(0, Math.min(255, Math.round((w || 0) * 255))); o += 1;
    }
  }
  return buf;
}

/**
 * Decode a `.csfr` binary recording into the columnar model.
 * @param {ArrayBuffer} buf
 * @returns {ColumnarRecording}
 */
export function decodeBinaryRecording(buf) {
  const dv = new DataView(buf);
  const dec = new TextDecoder();
  let o = 0;
  const magic = dv.getUint32(o, true); o += 4;
  if (magic !== CSFR_MAGIC) throw new Error('not a CSFR recording');
  o += 1; // version
  o += 1; // flags (only quantized supported)
  const keyCount = dv.getUint16(o, true); o += 2;
  const frameCount = dv.getUint32(o, true); o += 4;
  const sourceLen = dv.getUint8(o); o += 1;
  const source = sourceLen ? dec.decode(new Uint8Array(buf, o, sourceLen)) : undefined;
  o += sourceLen;
  const keys = [];
  for (let k = 0; k < keyCount; k += 1) {
    const len = dv.getUint8(o); o += 1;
    keys.push(dec.decode(new Uint8Array(buf, o, len))); o += len;
  }
  const relTimes = new Float64Array(frameCount);
  const weights = new Float32Array(frameCount * keyCount);
  for (let i = 0; i < frameCount; i += 1) {
    relTimes[i] = dv.getUint32(o, true); o += 4;
    const base = i * keyCount;
    for (let k = 0; k < keyCount; k += 1) {
      weights[base + k] = dv.getUint8(o) / 255; o += 1;
    }
  }
  return {
    keys,
    keyCount,
    frameCount,
    relTimes,
    weights,
    durationMs: frameCount ? relTimes[frameCount - 1] : 0,
    source,
  };
}

/**
 * Build the recording fetch URL. `base` may be a full endpoint URL, a bare origin
 * (e.g. APK loopback `http://127.0.0.1:8137`), or null (same-origin dev relay).
 * @param {string} id
 * @param {string|null} [base]
 * @returns {string}
 */
function buildRecordingUrl(id, base) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const u = new URL(base || RECORDING_PATH, origin);
  if (base && (u.pathname === '' || u.pathname === '/')) u.pathname = RECORDING_PATH;
  u.searchParams.set('id', id);
  u.searchParams.set('_', String(Date.now()));
  return u.href;
}

/**
 * Fetch + decode a recording from the relay/loopback server into the columnar model.
 * Detects binary (`application/octet-stream` / `.csfr`) vs JSONL automatically.
 * @param {string} id
 * @param {{ base?: string|null }} [options]
 * @returns {Promise<ColumnarRecording>}
 */
export async function loadNativeFaceRecording(id, options = {}) {
  if (typeof window === 'undefined' || !id) return framesToColumnar([]);
  const url = buildRecordingUrl(id, options.base ?? null);
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(`recording "${id}" fetch failed: HTTP ${res.status}`);
  }
  const ct =
    (res.headers && typeof res.headers.get === 'function' && res.headers.get('content-type')) || '';
  if (ct.includes('octet-stream') || ct.includes('csfr') || url.includes('.csfr')) {
    const buf = await res.arrayBuffer();
    return decodeBinaryRecording(buf);
  }
  const data = await res.json();
  return framesToColumnar(normalizeRecordingFrames(data?.frames || []));
}

/**
 * Accept columnar, normalized object-array, or raw frame array → columnar.
 * @param {ColumnarRecording|Array<Record<string, unknown>>} input
 * @returns {ColumnarRecording}
 */
function toColumnar(input) {
  if (input && input.weights instanceof Float32Array && Array.isArray(input.keys)) {
    return /** @type {ColumnarRecording} */ (input);
  }
  let frames = Array.isArray(input) ? input : [];
  if (frames.length && typeof frames[0]?.rel !== 'number') {
    frames = normalizeRecordingFrames(frames);
  }
  return framesToColumnar(frames);
}

/**
 * Build an interpolated weight record for the given elapsed time (ms).
 * @param {number} elapsed
 * @returns {Record<string, number>}
 */
function sampleAt(elapsed) {
  // Advance/reset the cursor to the segment containing `elapsed`.
  let i = _cursor >= 0 && _cursor < _frameCount && _relTimes[_cursor] <= elapsed ? _cursor : 0;
  while (i < _frameCount - 1 && _relTimes[i + 1] <= elapsed) i += 1;
  _cursor = i;
  const j = Math.min(i + 1, _frameCount - 1);
  const span = _relTimes[j] - _relTimes[i];
  const f = span > 0 ? Math.min(1, Math.max(0, (elapsed - _relTimes[i]) / span)) : 0;
  const baseI = i * _keyCount;
  const baseJ = j * _keyCount;
  /** @type {Record<string, number>} */
  const out = {};
  for (let k = 0; k < _keyCount; k += 1) {
    const a = _weights[baseI + k];
    const b = _weights[baseJ + k];
    out[_keys[k]] = span > 0 ? a + (b - a) * f : a;
  }
  return out;
}

/**
 * Push a record into the face pipeline. Prefer the full bridge `push()` path so
 * `source` (jetpack/openxr) is preserved; fall back to the direct setter.
 * @param {Record<string, number>} weights
 */
function feed(weights) {
  const api = typeof window !== 'undefined' ? window.__characterStudioNativeFace : null;
  if (api?.push) {
    api.push({ weights, source: _source, t: Date.now() });
  } else {
    pushNativeFaceWeights(weights, Date.now());
  }
}

function step() {
  if (!_playing || _frameCount === 0) return;
  const now =
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  let elapsed = now - _startWallClock;

  if (_durationMs > 0 && elapsed >= _durationMs) {
    if (_loop) {
      elapsed %= _durationMs;
      _startWallClock = now - elapsed;
      _cursor = 0;
      } else {
        feed(sampleAt(_durationMs));
        stopNativeFacePlayback();
        return;
      }
  }

  if (_hasAudio) {
    syncFaceRecordingAudioPlayback(elapsed, { loop: _loop, durationMs: _durationMs });
  }
  feed(sampleAt(elapsed));
  scheduleNext();
}

function isWebXrPresenting() {
  try {
    const xr = typeof window !== 'undefined' && window.__characterStudioWebXrRenderer?.xr;
    return !!(xr?.isPresenting);
  } catch {
    return false;
  }
}

function scheduleNext() {
  if (!_playing) return;
  // Immersive WebXR uses renderer.setAnimationLoop; window rAF stalls → frozen face.
  if (isWebXrPresenting()) return;
  if (typeof requestAnimationFrame === 'function') {
    _rafId = requestAnimationFrame(step);
  } else {
    _timerId = setTimeout(step, 16);
  }
}

/** Advance one playback frame from the WebXR render loop (see sceneManager). */
export function tickNativeFacePlaybackOnXrFrame() {
  if (!_playing || !isWebXrPresenting()) return;
  maybeUnlockFaceRecordingAudioOnXrFrame();
  step();
}

/** Restart document rAF after leaving immersive WebXR. */
export function resumeNativeFacePlaybackScheduling() {
  if (_playing && !isWebXrPresenting()) scheduleNext();
}

/**
 * Begin replaying a recording (columnar, normalized array, or raw frames).
 * @param {ColumnarRecording|Array<Record<string, unknown>>} input
 * @param {{ loop?: boolean }} [options]
 */
function dispatchPlaybackEvent(playing) {
  try {
    window.dispatchEvent(
      new CustomEvent('characterstudio-native-face-playback', { detail: { playing } }),
    );
  } catch {
    /* ignore */
  }
}

export function startNativeFacePlayback(input, options = {}) {
  stopNativeFacePlayback();
  const rec = toColumnar(input);
  if (!rec.frameCount) {
    console.warn('[nativeFacePlayback] no frames to play');
    return;
  }
  _keys = rec.keys;
  _keyCount = rec.keyCount;
  _relTimes = rec.relTimes;
  _weights = rec.weights;
  _frameCount = rec.frameCount;
  _durationMs = rec.durationMs;
  _source = rec.source;
  _loop = options.loop !== undefined ? options.loop : true;
  _playbackBase = options.base ?? _playbackBase ?? null;
  _cursor = 0;
  _startWallClock =
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  _playing = true;
  _hasAudio = !!options.hasAudio;
  if (_hasAudio) {
    ensureFaceRecordingAudioUnlockGestures();
    void unlockFaceRecordingAudioPlayback();
  }
  try {
    window.__characterStud__characterStudioNativeFaceonNeutral?.();
  } catch {
    /* ignore */
  }
  dispatchPlaybackEvent(true);
  console.info(
    `[nativeFacePlayback] playing ${_frameCount} frames (${Math.round(_durationMs)}ms${_loop ? ', loop' : ''}${_hasAudio ? ', audio' : ''})`,
  );
  scheduleNext();
}

export function stopNativeFacePlayback() {
  const wasPlaying = _playing;
  _playing = false;
  if (_rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(_rafId);
  if (_timerId != null) clearTimeout(_timerId);
  _rafId = 0;
  _timerId = null;
  _cursor = 0;
  _hasAudio = false;
  stopFaceRecordingAudioPlayback();
  if (wasPlaying) dispatchPlaybackEvent(false);
}

/** @returns {{ playing: boolean, id: string|null, frames: number, durationMs: number, loop: boolean }} */
export function getNativeFacePlaybackStatus() {
  return {
    playing: _playing,
    id: _recordingId,
    frames: _frameCount,
    durationMs: _durationMs,
    loop: _loop,
    hasAudio: hasFaceRecordingAudioPlayback(),
  };
}

/** Bootstrap playback when `?nativeFacePlayback=<id>` is present. */
export function initNativeFacePlaybackFromUrl() {
  const id = getNativeFacePlaybackIdFromUrl();
  if (!id) return;
  _recordingId = id;
  const loop = getLoopFromUrl();
  const base = getNativeFacePlaybackBaseFromUrl();
  _playbackBase = base;
  Promise.all([
    loadNativeFaceRecording(id, { base }),
    prepareFaceRecordingAudioPlayback(id, { base, loop }),
  ])
    .then(([rec, hasAudio]) => {
      if (getNativeFacePlaybackIdFromUrl() !== id) return; // navigated away
      startNativeFacePlayback(rec, { loop, base, hasAudio });
    })
    .catch((e) => {
      console.warn('[nativeFacePlayback] load failed:', e?.message || e);
    });
  try {
    window.__CS_NATIVE_FACE_PLAYBACK_STATUS = getNativeFacePlaybackStatus;
  } catch {
    /* ignore */
  }
}
