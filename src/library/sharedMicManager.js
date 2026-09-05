/**
 * One microphone stream shared by lip-sync, face recording, etc.
 *
 * Prefer a single WebRTC stream (AEC/NS/AGC on).
 * Raw → avatar self-talk. Fan the same stream out — never duplicate getUserMedia.
 */

import {
  STUDIO_MIC_LOG_TAG,
  assertStudioMicCapturePolicy,
  studioMicGetUserMediaAttempts,
} from './micConstraints.js';

/** @type {MediaStream|null} */
let _stream = null;
let _refCount = 0;
/** @type {Promise<MediaStream>|null} */
let _pending = null;

async function openMicHardwareStream() {
  const attempts = studioMicGetUserMediaAttempts();
  assertStudioMicCapturePolicy(attempts);
  let lastErr = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.info(`${STUDIO_MIC_LOG_TAG} opened mic stream`, constraints);
      return stream;
    }
    catch (err) {
      lastErr = err;
      console.warn(`${STUDIO_MIC_LOG_TAG} getUserMedia failed:`, err?.message || err, constraints);
    }
  }
  throw lastErr || new Error('Microphone unavailable');
}

/**
 * @returns {Promise<MediaStream>}
 */
export async function acquireSharedMicStream() {
  _refCount += 1;
  if (_stream) return _stream;
  if (_pending) {
    await _pending;
    return _stream;
  }
  _pending = openMicHardwareStream()
    .then((s) => {
      _stream = s;
      _pending = null;
      return s;
    })
    .catch((err) => {
      _pending = null;
      _refCount = Math.max(0, _refCount - 1);
      throw err;
    });
  return _pending;
}

export function releaseSharedMicStream() {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount === 0 && _stream) {
    _stream.getTracks().forEach((t) => t.stop());
    _stream = null;
  }
}

/** @returns {MediaStream|null} */
export function getSharedMicStreamIfActive() {
  return _stream;
}

export function sharedMicRefCount() {
  return _refCount;
}
