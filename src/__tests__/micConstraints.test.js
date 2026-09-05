import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  STUDIO_MIC_LOG_TAG,
  assertStudioMicCapturePolicy,
  assertStudioMicRawFirst,
  assertStudioMicStaysOpenInXr,
  assertStudioMicSuspendDoesNotStopTracks,
  buildStudioMicAudioConstraints,
  isPermissiveStudioMicConstraints,
  isPreferredStudioMicConstraints,
  isRawStudioMicConstraints,
  studioMicGetUserMediaAttempts,
} from '../library/micConstraints.js';

describe('studio mic screen-record contract (AEC+NS+AGC, 20260825-rt7)', () => {
  it('locks preferred capture (AEC/NS/AGC on)', () => {
    expect(buildStudioMicAudioConstraints()).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(() => assertStudioMicCapturePolicy()).not.toThrow();
    expect(() => assertStudioMicRawFirst()).not.toThrow();
  });

  it('orders fallbacks: preferred → permissive', () => {
    const attempts = studioMicGetUserMediaAttempts();
    expect(attempts).toHaveLength(2);
    expect(isPreferredStudioMicConstraints(attempts[0])).toBe(true);
    expect(isPermissiveStudioMicConstraints(attempts[1])).toBe(true);
    expect(isRawStudioMicConstraints(attempts[0])).toBe(false);
  });

  it('rejects raw as the first attempt', () => {
    const rawFirst = [
      { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false },
      { audio: true, video: false },
    ];
    expect(() => assertStudioMicCapturePolicy(rawFirst)).toThrow(
      new RegExp(STUDIO_MIC_LOG_TAG.replace(/[[\]]/g, '\\$&')),
    );
  });

  it('forbids releasing or suspending the mic on XR enter', () => {
    expect(() => assertStudioMicStaysOpenInXr({})).not.toThrow();
    expect(() => assertStudioMicStaysOpenInXr({ releaseMicOnXrEnter: true })).toThrow(/XR enter/);
    expect(() => assertStudioMicStaysOpenInXr({ suspendMicOnXrEnter: true })).toThrow(/XR enter/);
  });

  it('forbids stopping tracks on viseme suspend', () => {
    expect(() => assertStudioMicSuspendDoesNotStopTracks({})).not.toThrow();
    expect(() => assertStudioMicSuspendDoesNotStopTracks({ stopTracksOnSuspend: true })).toThrow(/stop mic tracks/);
  });
});

describe('sharedMicManager uses the locked chain', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('tries preferred constraints first (NS on)', async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const { acquireSharedMicStream, releaseSharedMicStream } = await import(
      '../library/sharedMicManager.js'
    );
    await acquireSharedMicStream();
    expect(getUserMedia.mock.calls[0][0].audio.echoCancellation).toBe(true);
    expect(getUserMedia.mock.calls[0][0].audio.noiseSuppression).toBe(true);
    expect(getUserMedia.mock.calls[0][0].audio.autoGainControl).toBe(true);
    releaseSharedMicStream();
  });

  it('falls back to permissive when preferred is rejected', async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new Error('OverconstrainedError'))
      .mockResolvedValueOnce(stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const { acquireSharedMicStream, releaseSharedMicStream } = await import(
      '../library/sharedMicManager.js'
    );
    await acquireSharedMicStream();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0].audio).toBe(true);
    releaseSharedMicStream();
  });
});
