/**
 * Studio mic / Galaxy screen-record contract (user-locked 2026-08-25 rt7).
 *
 * While talking to the avatar AND headset screen recording:
 *   - Mic stays OPEN in XR (do not release on session start)
 *   - Prefer AEC + NS + AGC on — never raw-first (avatar self-talk)
 *   - One shared getUserMedia stream (sharedMicManager) — never duplicate opens
 *   - Suspend = pause visemes only; never stop hardware tracks
 */

export const STUDIO_MIC_LOG_TAG = '[studio-mic]'


export const STUDIO_MIC_RAW_AUDIO = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  sampleRate: Object.freeze({ ideal: 48000 }),
})

export const STUDIO_MIC_WEBRTC_AUDIO = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
})

/** Preferred: AEC + NS + AGC. */
export const STUDIO_MIC_PREFERRED_AUDIO = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
})

export function buildStudioMicAudioConstraints() {
  return { ...STUDIO_MIC_PREFERRED_AUDIO }
}

/** Legacy raw constraints — emergency only, never first. */
export function buildStudioMicRawAudioConstraints() {
  return { ...STUDIO_MIC_RAW_AUDIO, sampleRate: { ...STUDIO_MIC_RAW_AUDIO.sampleRate } }
}

export function buildStudioMicFallbackConstraints() {
  return {
    audio: { ...STUDIO_MIC_WEBRTC_AUDIO },
    video: false,
  }
}

export function buildStudioMicConstraints() {
  return {
    audio: buildStudioMicAudioConstraints(),
    video: false,
  }
}

export function buildStudioMicPermissiveConstraints() {
  return { audio: true, video: false }
}

/** Ordered: full WebRTC → permissive (never raw-first). */
export function studioMicGetUserMediaAttempts() {
  return [
    buildStudioMicConstraints(),
    buildStudioMicPermissiveConstraints(),
  ]
}

function audioTrackConstraints(constraints) {
  const audio = constraints?.audio
  if (audio === true || audio == null) return null
  if (typeof audio !== 'object') return null
  return audio
}

export function isRawStudioMicConstraints(constraints) {
  const audio = audioTrackConstraints(constraints)
  if (!audio) return false
  return (
    audio.echoCancellation === false
    && audio.noiseSuppression === false
    && audio.autoGainControl === false
  )
}

export function isPreferredStudioMicConstraints(constraints) {
  const audio = audioTrackConstraints(constraints)
  if (!audio) return false
  return (
    audio.echoCancellation === true
    && audio.noiseSuppression === true
    && audio.autoGainControl === true
  )
}

export function isWebRtcStudioMicConstraints(constraints) {
  const audio = audioTrackConstraints(constraints)
  if (!audio) return false
  return (
    audio.echoCancellation === true
    && audio.noiseSuppression === true
    && audio.autoGainControl === true
  )
}

export function isPermissiveStudioMicConstraints(constraints) {
  return constraints?.audio === true && constraints?.video === false
}

/** Dev guard: preferred profile first, never raw-first. */
export function assertStudioMicCapturePolicy(attempts = studioMicGetUserMediaAttempts()) {
  if (!Array.isArray(attempts) || attempts.length < 2) {
    throw new Error(`${STUDIO_MIC_LOG_TAG} fallback chain must have at least 2 attempts`)
  }
  if (!isPreferredStudioMicConstraints(attempts[0])) {
    throw new Error(`${STUDIO_MIC_LOG_TAG} first getUserMedia attempt must be AEC+NS+AGC on`)
  }
  if (isRawStudioMicConstraints(attempts[0])) {
    throw new Error(`${STUDIO_MIC_LOG_TAG} must not use raw mic first (avatar self-talk)`)
  }
  if (!isPermissiveStudioMicConstraints(attempts[attempts.length - 1])) {
    throw new Error(`${STUDIO_MIC_LOG_TAG} last attempt must be { audio: true, video: false }`)
  }
}

/** @deprecated use assertStudioMicCapturePolicy */
export function assertStudioMicRawFirst(attempts = studioMicGetUserMediaAttempts()) {
  assertStudioMicCapturePolicy(attempts)
}

export function assertStudioMicStaysOpenInXr(options = {}) {
  if (options.releaseMicOnXrEnter === true) {
    throw new Error(`${STUDIO_MIC_LOG_TAG} must not release mic on XR enter`)
  }
  if (options.suspendMicOnXrEnter === true) {
    throw new Error(`${STUDIO_MIC_LOG_TAG} must not suspend mic on XR enter (visemes only; hardware stays open)`)
  }
}

export function assertStudioMicSuspendDoesNotStopTracks(options = {}) {
  if (options.stopTracksOnSuspend === true) {
    throw new Error(`${STUDIO_MIC_LOG_TAG} suspend must not stop mic tracks`)
  }
}
