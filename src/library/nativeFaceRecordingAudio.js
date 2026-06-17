/**
 * Mic audio captured alongside face relay recordings (dev server storage).
 * Synced to face playback via the same timeline (performance.now clock).
 *
 * Recording starts from a user gesture (HUD Record button). Upload uses
 * POST /__native_face_record_audio?id=<recordingId>.
 * Playback fetches GET /__native_face_recording_audio?id=<id> (optional; face-only if missing).
 */

const AUDIO_RECORD_PATH = '/__native_face_record_audio';
const AUDIO_PLAYBACK_PATH = '/__native_face_recording_audio';
const MAX_RECORDING_BYTES = 32 * 1024 * 1024;
const MIN_PLAYBACK_BYTES = 256;

let _mediaRecorder = null;
let _micStream = null;
let _chunks = [];
let _recordingId = null;
/** @type {HTMLAudioElement|null} */
let _playbackAudio = null;
let _playbackObjectUrl = null;
let _unlockGestureAttached = false;
let _lastPlayErrorLogAt = 0;
/** Web Audio fallback when HTMLAudio cannot decode MediaRecorder WebM (common on Galaxy XR Chrome). */
let _useWebAudio = false;
/** @type {AudioContext|null} */
let _waContext = null;
/** @type {AudioBuffer|null} */
let _waBuffer = null;
/** @type {AudioBufferSourceNode|null} */
let _waSource = null;
/** @type {GainNode|null} */
let _waGain = null;
let _waContextStart = 0;
let _waOffsetSec = 0;
/** Target timeline position (sec) from last sync — used after gesture unlock. */
let _lastSyncTargetSec = 0;
let _waitingUnlockLogged = false;
let _xrUnlockLastAttemptAt = 0;
let _xrUnlockAttempts = 0;
let _xrSessionStateLogged = false;
const XR_UNLOCK_INTERVAL_MS = 400;
const XR_UNLOCK_MAX_ATTEMPTS = 150;

function stopWebAudioPlayback() {
  if (_waSource) {
    try {
      _waSource.stop();
    } catch {
      /* ignore */
    }
    try {
      _waSource.disconnect();
    } catch {
      /* ignore */
    }
  }
  _waSource = null;
  if (_waGain) {
    try {
      _waGain.disconnect();
    } catch {
      /* ignore */
    }
  }
  _waGain = null;
  if (_waContext) {
    void _waContext.close().catch(() => {});
  }
  _waContext = null;
  _waBuffer = null;
  _waContextStart = 0;
  _waOffsetSec = 0;
  _useWebAudio = false;
}

function getWebAudioPlaybackTimeSec() {
  if (!_waContext) return _waOffsetSec;
  if (!_waSource) return _waOffsetSec;
  return _waOffsetSec + Math.max(0, _waContext.currentTime - _waContextStart);
}

function restartWebAudioAt(tSec) {
  const ctx = _waContext;
  const buffer = _waBuffer;
  if (!ctx || !buffer) return;
  if (_waSource) {
    try {
      _waSource.stop();
    } catch {
      /* ignore */
    }
    try {
      _waSource.disconnect();
    } catch {
      /* ignore */
    }
    _waSource = null;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(_waGain || ctx.destination);
  _waSource = src;
  _waContextStart = ctx.currentTime;
  _waOffsetSec = Math.max(0, tSec);
  try {
    src.start(0, _waOffsetSec);
  } catch {
    _waOffsetSec = 0;
    try {
      src.start(0, 0);
    } catch {
      /* ignore */
    }
  }
}

function syncWebAudioPlayback(elapsedMs, options = {}) {
  const ctx = _waContext;
  const buffer = _waBuffer;
  if (!ctx || !buffer) return;

  const loop = options.loop !== false;
  const faceDur = options.durationMs || 0;
  let t = Math.max(0, elapsedMs) / 1000;
  if (loop && faceDur > 0) {
    t = (elapsedMs % faceDur) / 1000;
  }
  const bufDur = buffer.duration;
  if (bufDur > 0) {
    if (loop && faceDur > 0 && t > bufDur) {
      t %= bufDur;
    } else if (t > bufDur) {
      t = bufDur;
    }
  }
  _lastSyncTargetSec = t;

  if (ctx.state !== 'running') {
    void ctx.resume().catch(() => {});
    if (!_waitingUnlockLogged) {
      _waitingUnlockLogged = true;
      console.info(
        '[nativeFaceRecordingAudio] WebAudio waiting for user gesture (tap screen or Enter VR)',
      );
    }
    return;
  }
  _waitingUnlockLogged = false;

  const current = getWebAudioPlaybackTimeSec();
  if (!_waSource || Math.abs(current - t) > 0.25) {
    restartWebAudioAt(t);
  }
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return 'audio/webm';
  }
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

/**
 * @param {string} id
 * @param {string|null} [base]
 * @returns {string}
 */
export function buildFaceRecordingAudioUrl(id, base) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const u = new URL(base || AUDIO_PLAYBACK_PATH, origin);
  if (base && (u.pathname === '' || u.pathname === '/')) u.pathname = AUDIO_PLAYBACK_PATH;
  u.searchParams.set('id', id);
  u.searchParams.set('_', String(Date.now()));
  return u.href;
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function faceRecordingAudioExists(id) {
  if (!id || typeof window === 'undefined') return false;
  try {
    const res = await fetch(buildFaceRecordingAudioUrl(id), { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) return false;
    const len = Number(res.headers.get('content-length'));
    return !Number.isFinite(len) || len >= MIN_PLAYBACK_BYTES;
  } catch {
    return false;
  }
}

/**
 * Start mic capture for an active face recording id (call after server returns id).
 * @param {string} recordingId
 */
export async function startFaceRecordingAudio(recordingId) {
  if (typeof window === 'undefined' || !recordingId) return;
  await stopFaceRecordingAudio(false);
  if (!navigator.mediaDevices?.getUserMedia) {
    console.warn('[nativeFaceRecordingAudio] getUserMedia not available');
    return;
  }
  _recordingId = recordingId;
  _chunks = [];
  try {
    _micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    const mime = pickMimeType();
    _mediaRecorder = mime
      ? new MediaRecorder(_micStream, { mimeType: mime })
      : new MediaRecorder(_micStream);
    _mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size) _chunks.push(e.data);
    };
    _mediaRecorder.start(250);
    console.info('[nativeFaceRecordingAudio] mic recording started');
  } catch (e) {
    console.warn('[nativeFaceRecordingAudio] mic start failed:', e?.message || e);
    stopFaceRecordingAudio(false);
  }
}

/**
 * Stop mic, upload blob to dev server.
 * @returns {Promise<{ uploaded: boolean, bytes: number }>}
 */
export async function stopFaceRecordingAudio(upload = true) {
  const id = _recordingId;
  const recorder = _mediaRecorder;
  _mediaRecorder = null;
  _recordingId = null;

  if (_micStream) {
    _micStream.getTracks().forEach((t) => t.stop());
    _micStream = null;
  }

  if (!recorder) {
    _chunks = [];
    return { uploaded: false, bytes: 0 };
  }

  const blob = await new Promise((resolve) => {
    if (!recorder) {
      resolve(null);
      return;
    }
    const finalize = () => {
      const type = recorder.mimeType || 'audio/webm';
      resolve(_chunks.length ? new Blob(_chunks, { type }) : null);
      _chunks = [];
    };
    recorder.onstop = finalize;
    try {
      if (recorder.state === 'recording') {
        try {
          recorder.requestData();
        } catch {
          /* ignore */
        }
        recorder.stop();
      } else {
        finalize();
      }
    } catch {
      resolve(null);
      _chunks = [];
    }
  });

  if (!upload || !id || !blob?.size) {
    if (blob?.size && blob.size < MIN_PLAYBACK_BYTES) {
      console.warn(`[nativeFaceRecordingAudio] mic blob too small (${blob.size} bytes) — not uploaded`);
    }
    return { uploaded: false, bytes: blob?.size || 0 };
  }

  try {
    const url = new URL(AUDIO_RECORD_PATH, window.location.origin);
    url.searchParams.set('id', id);
    const res = await fetch(url.href, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.info(`[nativeFaceRecordingAudio] uploaded ${blob.size} bytes for ${id}`);
    return { uploaded: true, bytes: blob.size };
  } catch (e) {
    console.warn('[nativeFaceRecordingAudio] upload failed:', e?.message || e);
    return { uploaded: false, bytes: blob.size };
  }
}

export function isFaceRecordingAudioActive() {
  return !!_mediaRecorder && _mediaRecorder.state === 'recording';
}

/** Reset XR unlock polling (call when an immersive session ends). */
export function resetFaceRecordingAudioXrUnlock() {
  _xrUnlockLastAttemptAt = 0;
  _xrUnlockAttempts = 0;
  _xrSessionStateLogged = false;
}

function isFaceRecordingPlaybackAudible() {
  if (_useWebAudio && _waContext) {
    return _waContext.state === 'running' && !!_waSource;
  }
  return !!(_playbackAudio && !_playbackAudio.paused && !_playbackAudio.error);
}

/**
 * Retry unlock from the WebXR animation loop until audio is running (AR/VR autoplay policy).
 */
export function maybeUnlockFaceRecordingAudioOnXrFrame() {
  if (!_useWebAudio && !_playbackAudio) return;
  if (isFaceRecordingPlaybackAudible()) return;

  const now = Date.now();
  if (now - _xrUnlockLastAttemptAt < XR_UNLOCK_INTERVAL_MS) return;
  _xrUnlockLastAttemptAt = now;
  _xrUnlockAttempts += 1;

  if (!_xrSessionStateLogged) {
    _xrSessionStateLogged = true;
    console.info('[nativeFaceRecordingAudio] XR audio unlock polling started', {
      webAudio: _useWebAudio,
      contextState: _waContext?.state ?? null,
      htmlPaused: _playbackAudio?.paused ?? null,
    });
  }

  if (_xrUnlockAttempts > XR_UNLOCK_MAX_ATTEMPTS) return;

  void unlockFaceRecordingAudioPlayback();
}

/** Attach one-shot unlock listeners (VR click, tap, key) for autoplay policy. */
export function ensureFaceRecordingAudioUnlockGestures() {
  if (
    typeof window === 'undefined' ||
    _unlockGestureAttached ||
    (!_playbackAudio && !_useWebAudio)
  ) {
    return;
  }
  _unlockGestureAttached = true;
  const unlock = () => {
    void unlockFaceRecordingAudioPlayback();
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}

/**
 * Resume playback after a user gesture (required in WebXR / mobile Chrome).
 * @returns {Promise<boolean>}
 */
export async function unlockFaceRecordingAudioPlayback() {
  if (_useWebAudio && _waContext) {
    try {
      await _waContext.resume();
      if (_waContext.state === 'running' && _waBuffer) {
        restartWebAudioAt(_lastSyncTargetSec);
        _waitingUnlockLogged = false;
        console.info('[nativeFaceRecordingAudio] WebAudio playback unlocked', {
          atSec: _lastSyncTargetSec,
        });
      } else if (_waContext.state !== 'running') {
        const now = Date.now();
        if (now - _lastPlayErrorLogAt > 3000) {
          _lastPlayErrorLogAt = now;
          console.info('[nativeFaceRecordingAudio] WebAudio still suspended after resume');
        }
      }
      return _waContext.state === 'running';
    } catch (e) {
      const now = Date.now();
      if (now - _lastPlayErrorLogAt > 3000) {
        _lastPlayErrorLogAt = now;
        console.warn('[nativeFaceRecordingAudio] WebAudio resume failed:', e?.message || e);
      }
      return false;
    }
  }

  const audio = _playbackAudio;
  if (!audio) return false;
  try {
    audio.muted = false;
    audio.volume = 1;
    if (audio.paused) await audio.play();
    if (!audio.paused) {
      console.info('[nativeFaceRecordingAudio] playback unlocked (playing)');
    }
    return !audio.paused;
  } catch (e) {
    const now = Date.now();
    if (now - _lastPlayErrorLogAt > 3000) {
      _lastPlayErrorLogAt = now;
      console.warn('[nativeFaceRecordingAudio] unlock/play failed:', e?.message || e);
    }
    return false;
  }
}

function resolvePlaybackAudioUrl(id, base) {
  let url = buildFaceRecordingAudioUrl(id, base ?? null);
  if (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    url.startsWith('http://') &&
    !url.startsWith(window.location.origin)
  ) {
    console.warn(
      '[nativeFaceRecordingAudio] HTTP playbackBase blocked on HTTPS; using same-origin audio URL',
    );
    url = buildFaceRecordingAudioUrl(id, null);
  }
  return url;
}

/**
 * @param {string} url
 * @returns {Promise<Blob|null>}
 */
async function fetchRecordingAudioBlob(url) {
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob?.size || blob.size < MIN_PLAYBACK_BYTES) {
      console.warn(`[nativeFaceRecordingAudio] audio blob too small (${blob?.size || 0} bytes)`);
      return null;
    }
    return blob;
  } catch (e) {
    console.warn('[nativeFaceRecordingAudio] audio fetch failed:', e?.message || e);
    return null;
  }
}

/**
 * Wait until the element can decode (blob URL fixes Galaxy/Chrome streaming WebM issues).
 * @param {HTMLAudioElement} audio
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
function waitForAudioElementReady(audio, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const check = () => {
      if (audio.error) {
        finish(false);
        return;
      }
      const HAVE_CURRENT_DATA = typeof HTMLMediaElement !== 'undefined'
        ? HTMLMediaElement.HAVE_CURRENT_DATA
        : 2;
      if (audio.readyState >= HAVE_CURRENT_DATA) {
        finish(true);
        return;
      }
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        finish(true);
      }
    };
    audio.addEventListener('loadedmetadata', check);
    audio.addEventListener('durationchange', check);
    audio.addEventListener('canplay', check);
    audio.addEventListener('loadeddata', check);
    audio.addEventListener('error', () => finish(false), { once: true });
    check();
    setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Load and prepare synced playback audio (returns false if no file on server).
 * @param {string} id
 * @param {{ base?: string|null, loop?: boolean }} [options]
 */
export async function prepareFaceRecordingAudioPlayback(id, options = {}) {
  stopFaceRecordingAudioPlayback();
  _unlockGestureAttached = false;
  if (!id || typeof window === 'undefined') return false;

  const url = resolvePlaybackAudioUrl(id, options.base ?? null);
  const blob = await fetchRecordingAudioBlob(url);
  if (!blob) {
    console.info(`[nativeFaceRecordingAudio] no audio file for ${id} (face-only playback)`);
    return false;
  }

  const AudioCtx = typeof window !== 'undefined'
    ? window.AudioContext || window.webkitAudioContext
    : null;
  if (AudioCtx) {
    try {
      const ctx = new AudioCtx();
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      _waContext = ctx;
      _waBuffer = buffer;
      _waGain = ctx.createGain();
      _waGain.gain.value = 1;
      _waGain.connect(ctx.destination);
      _useWebAudio = true;
      ensureFaceRecordingAudioUnlockGestures();
      try {
        await ctx.resume();
      } catch {
        /* autoplay — unlock on gesture / VR */
      }
      console.info('[nativeFaceRecordingAudio] playback audio ready (WebAudio)', {
        bytes: blob.size,
        durationSec: buffer.duration,
      });
      return true;
    } catch (e) {
      console.warn('[nativeFaceRecordingAudio] WebAudio decode failed, trying HTMLAudio:', e?.message || e);
      stopWebAudioPlayback();
    }
  }

  _playbackObjectUrl = URL.createObjectURL(blob);
  const audio = new Audio(_playbackObjectUrl);
  audio.loop = false;
  audio.preload = 'auto';
  audio.volume = 1;
  _playbackAudio = audio;

  const ready = await waitForAudioElementReady(audio);
  if (!ready || audio.error) {
    console.warn('[nativeFaceRecordingAudio] load/decode failed:', {
      id,
      bytes: blob.size,
      error: audio.error?.message || audio.error?.code || audio.error,
      duration: audio.duration,
      readyState: audio.readyState,
    });
    stopFaceRecordingAudioPlayback();
    return false;
  }

  audio.currentTime = 0;
  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
  } catch {
    /* autoplay policy — unlock on VR / pointer gesture */
  }
  ensureFaceRecordingAudioUnlockGestures();
  console.info('[nativeFaceRecordingAudio] playback audio ready', {
    bytes: blob.size,
    durationSec: Number.isFinite(audio.duration) ? audio.duration : null,
    readyState: audio.readyState,
  });
  return true;
}

/**
 * Keep audio aligned with face playback elapsed ms (0 … durationMs).
 * @param {number} elapsedMs
 * @param {{ loop?: boolean, durationMs?: number }} [options]
 */
export function syncFaceRecordingAudioPlayback(elapsedMs, options = {}) {
  if (_useWebAudio) {
    syncWebAudioPlayback(elapsedMs, options);
    return;
  }

  const audio = _playbackAudio;
  if (!audio || audio.error) return;
  const loop = options.loop !== false;
  const faceDur = options.durationMs || 0;
  let t = Math.max(0, elapsedMs) / 1000;
  const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  if (dur > 0) {
    if (loop && faceDur > 0) {
      t = (elapsedMs % faceDur) / 1000;
      if (t > dur) t %= dur;
    } else if (t > dur) {
      t = dur;
    }
    if (Math.abs(audio.currentTime - t) > 0.08) {
      audio.currentTime = t;
    }
  }
  if (audio.paused) {
    void audio.play().catch((e) => {
      ensureFaceRecordingAudioUnlockGestures();
      const now = Date.now();
      if (now - _lastPlayErrorLogAt > 3000) {
        _lastPlayErrorLogAt = now;
        console.warn('[nativeFaceRecordingAudio] play failed:', e?.message || e);
      }
    });
  }
}

export function stopFaceRecordingAudioPlayback() {
  _unlockGestureAttached = false;
  stopWebAudioPlayback();
  if (_playbackAudio) {
    try {
      _playbackAudio.pause();
      _playbackAudio.src = '';
    } catch {
      /* ignore */
    }
    _playbackAudio = null;
  }
  if (_playbackObjectUrl) {
    try {
      URL.revokeObjectURL(_playbackObjectUrl);
    } catch {
      /* ignore */
    }
    _playbackObjectUrl = null;
  }
}

export function hasFaceRecordingAudioPlayback() {
  return !!(_useWebAudio && _waBuffer) || (!!_playbackAudio && !_playbackAudio.error);
}
