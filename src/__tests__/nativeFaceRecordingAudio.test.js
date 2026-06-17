import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildFaceRecordingAudioUrl,
  stopFaceRecordingAudioPlayback,
  unlockFaceRecordingAudioPlayback,
  prepareFaceRecordingAudioPlayback,
  resetFaceRecordingAudioXrUnlock,
  maybeUnlockFaceRecordingAudioOnXrFrame,
} from '../library/nativeFaceRecordingAudio.js';

describe('nativeFaceRecordingAudio', () => {
  afterEach(() => {
    stopFaceRecordingAudioPlayback();
    vi.unstubAllGlobals();
  });

  it('buildFaceRecordingAudioUrl uses playback path and id', () => {
    const url = new URL(buildFaceRecordingAudioUrl('demo-1'));
    expect(url.pathname).toBe('/__native_face_recording_audio');
    expect(url.searchParams.get('id')).toBe('demo-1');
  });

  it('buildFaceRecordingAudioUrl respects playbackBase origin', () => {
    const url = new URL(buildFaceRecordingAudioUrl('x', 'http://127.0.0.1:8137'));
    expect(url.origin).toBe('http://127.0.0.1:8137');
    expect(url.pathname).toBe('/__native_face_recording_audio');
  });

  it('unlockFaceRecordingAudioPlayback returns false when no element', async () => {
    expect(await unlockFaceRecordingAudioPlayback()).toBe(false);
  });

  it('prepareFaceRecordingAudioPlayback returns false when server has no audio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const ok = await prepareFaceRecordingAudioPlayback('missing-id');
    expect(ok).toBe(false);
  });

  it('prepareFaceRecordingAudioPlayback returns false when audio blob is too small', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob([new Uint8Array(10)], { type: 'audio/webm' }),
      }),
    );
    const ok = await prepareFaceRecordingAudioPlayback('tiny-id');
    expect(ok).toBe(false);
  });

  it('maybeUnlockFaceRecordingAudioOnXrFrame is a no-op when no playback prepared', () => {
    expect(() => maybeUnlockFaceRecordingAudioOnXrFrame()).not.toThrow();
  });

  it('resetFaceRecordingAudioXrUnlock clears XR polling state', () => {
    resetFaceRecordingAudioXrUnlock();
    expect(() => maybeUnlockFaceRecordingAudioOnXrFrame()).not.toThrow();
  });
});
