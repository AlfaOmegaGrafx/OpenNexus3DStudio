/**
 * Dev-server relay: APK POSTs face payloads to the Vite host; Chrome WebXR on the
 * headset polls/subscribes on the same origin (avoids mixed-content blocking ws://).
 *
 * Enable with `?nativeFaceRelay=1` (APK “Open in Chrome for WebXR” adds this automatically).
 * Requires `npm run dev` and {@link nativeFaceRelayPlugin} in vite.config.js.
 */

const RELAY_PATH_SSE = '/__native_face_sse';
const RELAY_PATH_LATEST = '/__native_face_latest';
const POLL_MS = 50;
const RECONNECT_MS = 2000;
const MAX_RECONNECT_MS = 30000;

let _eventSource = null;
let _reconnectTimer = null;
let _reconnectDelay = RECONNECT_MS;
let _pollTimer = null;
let _pollInFlight = false;
let _lastRelayPushTs = 0;
let _lastPollOkTs = 0;
let _lastPollErrorLogged = false;
let _connectedLogged = false;
let _relayMode = 'off';

/**
 * @returns {{ mode: string, lastPushAgeMs: number|null, lastPollOkAgeMs: number|null }}
 */
export function getNativeFaceRelayStatus() {
  const now = Date.now();
  return {
    mode: _relayMode,
    lastPushAgeMs: _lastRelayPushTs > 0 ? now - _lastRelayPushTs : null,
    lastPollOkAgeMs: _lastPollOkTs > 0 ? now - _lastPollOkTs : null
  };
}

/**
 * @returns {boolean}
 */
export function isNativeFaceRelayEnabledInUrl() {
  if (typeof window === 'undefined') return false;
  try {
    const v = new URLSearchParams(window.location.search).get('nativeFaceRelay');
    return v === '1' || v === 'true' || v === 'yes';
  } catch {
    return false;
  }
}

/**
 * @param {unknown} obj
 */
function applyRelayPayload(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (!window.__characterStudioNativeFace?.push) return;
  window.__characterStudioNativeFace.push(obj);
  _lastRelayPushTs = typeof obj.t === 'number' ? obj.t : Date.now();
}

/**
 * @param {MessageEvent} evt
 */
function handleRelayMessage(evt) {
  try {
    const obj = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
    applyRelayPayload(obj);
  } catch (e) {
    console.warn('[nativeFaceRelay] message parse failed:', e?.message || e);
  }
}

function scheduleReconnect() {
  if (_reconnectTimer != null) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    connectNativeFaceRelaySse({ silent: true });
    _reconnectDelay = Math.min(_reconnectDelay * 1.5, MAX_RECONNECT_MS);
  }, _reconnectDelay);
}

function startPollLoop() {
  if (_pollTimer != null) return;
  _relayMode = 'poll';

  const tick = async () => {
    if (_pollInFlight) {
      _pollTimer = setTimeout(tick, POLL_MS);
      return;
    }
    _pollInFlight = true;
    try {
      const url = new URL(RELAY_PATH_LATEST, window.location.origin);
      url.searchParams.set('_', String(Date.now()));
      const res = await fetch(url.href, { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) {
        if (!_lastPollErrorLogged) {
          _lastPollErrorLogged = true;
          console.warn(
            `[nativeFaceRelay] poll HTTP ${res.status} — restart npm run dev after pulling relay changes`
          );
        }
      } else {
        _lastPollOkTs = Date.now();
        _lastPollErrorLogged = false;
        const obj = await res.json();
        if (obj && typeof obj === 'object' && Object.keys(obj).length > 0) {
          applyRelayPayload(obj);
        }
      }
    } catch (e) {
      if (!_lastPollErrorLogged) {
        _lastPollErrorLogged = true;
        console.warn('[nativeFaceRelay] poll failed:', e?.message || e);
      }
    } finally {
      _pollInFlight = false;
      _pollTimer = setTimeout(tick, POLL_MS);
    }
  };

  _pollTimer = setTimeout(tick, 0);
}

function stopPollLoop() {
  if (_pollTimer != null) {
    clearTimeout(_pollTimer);
    _pollTimer = null;
  }
}

/**
 * SSE subscription (optional; poll is primary).
 * @param {{ silent?: boolean }} [options]
 */
export function connectNativeFaceRelaySse(options = {}) {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return;
  }

  if (_eventSource) {
    try {
      _eventSource.close();
    } catch (_) {
      /* ignore */
    }
    _eventSource = null;
  }

  const url = new URL(RELAY_PATH_SSE, window.location.origin).href;
  try {
    _eventSource = new EventSource(url);
  } catch (e) {
    if (!options.silent) {
      console.warn('[nativeFaceRelay] EventSource failed:', e?.message || e);
    }
    scheduleReconnect();
    return;
  }

  _eventSource.onopen = () => {
    _reconnectDelay = RECONNECT_MS;
    _relayMode = 'poll+sse';
    if (!_connectedLogged) {
      _connectedLogged = true;
      console.info(
        '[nativeFaceRelay] SSE connected — keep CS XR Face APK open while in Chrome WebXR'
      );
    }
  };

  _eventSource.onmessage = handleRelayMessage;

  _eventSource.onerror = () => {
    try {
      _eventSource?.close();
    } catch (_) {
      /* ignore */
    }
    _eventSource = null;
    if (_relayMode === 'poll+sse') _relayMode = 'poll';
    scheduleReconnect();
  };
}

/**
 * Start relay ingest (poll + SSE).
 * @returns {() => void} disconnect
 */
export function connectNativeFaceRelay() {
  if (typeof window === 'undefined') return () => {};

  disconnectNativeFaceRelay();

  console.info(
    '[nativeFaceRelay] Starting (poll + SSE) — open CS XR Face APK first, then Chrome WebXR'
  );
  startPollLoop();
  connectNativeFaceRelaySse();

  return disconnectNativeFaceRelay;
}

export function disconnectNativeFaceRelay() {
  if (_reconnectTimer != null) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  stopPollLoop();
  if (_eventSource) {
    try {
      _eventSource.close();
    } catch (_) {
      /* ignore */
    }
    _eventSource = null;
  }
  _relayMode = 'off';
  _connectedLogged = false;
}

const RELAY_PATH_RECORD = '/__native_face_record';
const RELAY_PATH_RECORDINGS = '/__native_face_recordings';

/**
 * Tell the relay server to start recording the incoming face stream to JSONL.
 *
 * Free-tier recordings are capped server-side (~90s). `longSession: true` lifts the
 * cap and is the gated upgrade (subscription / x402 — see MONETIZATION_ROADMAP.md §10);
 * callers should only set it after verifying entitlement.
 *
 * @param {string|{ id?: string, longSession?: boolean }} [idOrOptions]
 * @returns {Promise<{ active: boolean, id: string|null, frames: number, longSession?: boolean }>}
 */
export async function startNativeFaceRecording(idOrOptions) {
  const opts =
    typeof idOrOptions === 'string' ? { id: idOrOptions } : idOrOptions || {};
  const url = new URL(RELAY_PATH_RECORD, window.location.origin).href;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', id: opts.id, longSession: !!opts.longSession }),
  });
  if (!res.ok) throw new Error(`record start failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * Stop the active relay-server recording.
 * @returns {Promise<{ active: boolean, id: string|null, frames: number }>}
 */
export async function stopNativeFaceRecording() {
  const url = new URL(RELAY_PATH_RECORD, window.location.origin).href;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop' }),
  });
  if (!res.ok) throw new Error(`record stop failed: HTTP ${res.status}`);
  return res.json();
}

/** @returns {Promise<{ active: boolean, id: string|null, frames: number, startedAt: number }>} */
export async function getNativeFaceRecordingStatus() {
  const url = new URL(RELAY_PATH_RECORD, window.location.origin).href;
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!res.ok) throw new Error(`record status failed: HTTP ${res.status}`);
  return res.json();
}

/** @returns {Promise<Array<{ id: string, bytes: number, mtimeMs: number }>>} */
export async function listNativeFaceRecordings() {
  const url = new URL(RELAY_PATH_RECORDINGS, window.location.origin).href;
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!res.ok) throw new Error(`list recordings failed: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.recordings) ? data.recordings : [];
}

/** Connect when `?nativeFaceRelay=1` is present (after nativeFaceBridge init). */
export function initNativeFaceRelayFromUrl() {
  if (!isNativeFaceRelayEnabledInUrl()) return;
  connectNativeFaceRelay();
  try {
    window.__CS_NATIVE_FACE_RELAY_STATUS = getNativeFaceRelayStatus;
  } catch (_) {
    /* ignore */
  }
}
