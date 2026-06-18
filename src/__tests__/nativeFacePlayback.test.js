import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  normalizeRecordingFrames,
  framesToColumnar,
  encodeBinaryRecording,
  decodeBinaryRecording,
  loadNativeFaceRecording,
  startNativeFacePlayback,
  stopNativeFacePlayback,
  tickNativeFacePlaybackOnXrFrame,
  resumeNativeFacePlaybackScheduling,
  getNativeFacePlaybackStatus,
  isNativeFacePlaybackEnabledInUrl,
  getNativeFacePlaybackIdFromUrl,
  getNativeFacePlaybackBaseFromUrl,
  normalizeNativeFacePlaybackId,
} from '../library/nativeFacePlayback.js';
import {
  clearNativeFaceWeights,
  getNativeFaceWeightsIfFresh,
  initNativeFaceBridge,
} from '../library/nativeFaceBridge.js';

describe('nativeFacePlayback', () => {
  beforeEach(() => {
    initNativeFaceBridge();
  });

  afterEach(() => {
    stopNativeFacePlayback();
    clearNativeFaceWeights();
    delete window.__characterStudioNativeFace;
    delete window.__characterStudioWebXrRenderer;
    delete window.__CS_NATIVE_FACE_PLAYBACK_STATUS;
    vi.unstubAllGlobals();
    vi.useRealTimers();
    history.replaceState({}, '', '/');
  });

  it('detects ?nativeFacePlayback id + ?playbackBase from url', () => {
    history.replaceState({}, '', '/?nativeFacePlayback=demo-1&playbackBase=http://127.0.0.1:8137');
    expect(isNativeFacePlaybackEnabledInUrl()).toBe(true);
    expect(getNativeFacePlaybackIdFromUrl()).toBe('demo-1');
    expect(getNativeFacePlaybackBaseFromUrl()).toBe('http://127.0.0.1:8137');
    history.replaceState({}, '', '/?nativeFacePlayback=0');
    expect(isNativeFacePlaybackEnabledInUrl()).toBe(false);
  });

  it('normalizeNativeFacePlaybackId strips legacy +audio suffix', () => {
    expect(normalizeNativeFacePlaybackId('face-2026-06-05T19-10-10-253Z+audio')).toBe(
      'face-2026-06-05T19-10-10-253Z',
    );
    expect(normalizeNativeFacePlaybackId('face-2026-06-05T19-10-10-253Z audio')).toBe(
      'face-2026-06-05T19-10-10-253Z',
    );
    history.replaceState({}, '', '/?nativeFacePlayback=face-2026-06-05T19-10-10-253Z+audio');
    expect(getNativeFacePlaybackIdFromUrl()).toBe('face-2026-06-05T19-10-10-253Z');
  });

  it('normalizeRecordingFrames sorts by t and computes relative offsets', () => {
    const frames = normalizeRecordingFrames([
      { weights: { jaw_drop: 0.4 }, t: 1200, source: 'jetpack' },
      { weights: { jaw_drop: 0.1 }, t: 1000 },
      { jaw_drop: 0.8, t: 1100 }, // flat shape
    ]);
    expect(frames).toHaveLength(3);
    expect(frames[0].rel).toBe(0);
    expect(frames[1].rel).toBe(100);
    expect(frames[2].rel).toBe(200);
    expect(frames[0].weights.jaw_drop).toBeCloseTo(0.1);
    expect(frames[2].source).toBe('jetpack');
  });

  it('framesToColumnar builds a flat typed-array model', () => {
    const col = framesToColumnar([
      { rel: 0, weights: { jaw_drop: 0.2, eyes_closed_left: 0.5 }, source: 'jetpack' },
      { rel: 100, weights: { jaw_drop: 0.8, eyes_closed_left: 0.1 } },
    ]);
    expect(col.keys).toEqual(['eyes_closed_left', 'jaw_drop']);
    expect(col.frameCount).toBe(2);
    expect(col.durationMs).toBe(100);
    expect(col.weights).toBeInstanceOf(Float32Array);
    expect(col.source).toBe('jetpack');
    // jaw_drop is index 1 in sorted keys; frame 1 base = keyCount(2)*1 = 2.
    expect(col.weights[2 + 1]).toBeCloseTo(0.8);
  });

  it('binary .csfr encode → decode round-trips (within uint8 quantization)', () => {
    const col = framesToColumnar([
      { rel: 0, weights: { jaw_drop: 0.25, mouth_smile: 0.5 }, source: 'jetpack' },
      { rel: 33, weights: { jaw_drop: 0.75, mouth_smile: 0.1 } },
      { rel: 66, weights: { jaw_drop: 1.0, mouth_smile: 0.0 } },
    ]);
    const buf = encodeBinaryRecording(col);
    const decoded = decodeBinaryRecording(buf);
    expect(decoded.keys).toEqual(col.keys);
    expect(decoded.frameCount).toBe(3);
    expect(decoded.durationMs).toBe(66);
    expect(decoded.source).toBe('jetpack');
    for (let i = 0; i < col.weights.length; i += 1) {
      expect(decoded.weights[i]).toBeCloseTo(col.weights[i], 2);
    }
  });

  it('loadNativeFaceRecording fetches JSON and returns columnar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'demo',
        frames: [
          { weights: { eyes_closed_left: 0.2 }, t: 5000 },
          { weights: { eyes_closed_left: 0.6 }, t: 5050 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const col = await loadNativeFaceRecording('demo');
    expect(col.frameCount).toBe(2);
    expect(col.relTimes[1]).toBe(50);
  });

  it('loadNativeFaceRecording decodes binary when content-type is octet-stream', async () => {
    const col = framesToColumnar([
      { rel: 0, weights: { jaw_drop: 0.2 } },
      { rel: 40, weights: { jaw_drop: 0.9 } },
    ]);
    const buf = encodeBinaryRecording(col);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => buf,
    });
    vi.stubGlobal('fetch', fetchMock);
    const decoded = await loadNativeFaceRecording('demo', { base: 'http://127.0.0.1:8137' });
    expect(decoded.frameCount).toBe(2);
    expect(decoded.relTimes[1]).toBe(40);
  });

  it('startNativeFacePlayback feeds interpolated weights into the bridge', () => {
    let nowMs = 10_000;
    vi.stubGlobal('performance', { now: () => nowMs });
    let rafCb = null;
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      rafCb = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    startNativeFacePlayback(
      [
        { rel: 0, weights: { jaw_drop: 0 } },
        { rel: 100, weights: { jaw_drop: 1 } },
      ],
      { loop: true },
    );

    rafCb();
    let rec = getNativeFaceWeightsIfFresh(5000);
    expect(rec?.jaw_drop).toBeCloseTo(0);

    nowMs = 10_050;
    rafCb();
    rec = getNativeFaceWeightsIfFresh(5000);
    expect(rec?.jaw_drop).toBeCloseTo(0.5);

    expect(getNativeFacePlaybackStatus().playing).toBe(true);
    expect(getNativeFacePlaybackStatus().durationMs).toBe(100);
  });

  it('tickNativeFacePlaybackOnXrFrame advances playback while immersive (no document rAF)', () => {
    let nowMs = 20_000;
    vi.stubGlobal('performance', { now: () => nowMs });
    let rafCb = null;
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      rafCb = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    window.__characterStudioWebXrRenderer = { xr: { isPresenting: true } };

    startNativeFacePlayback(
      [
        { rel: 0, weights: { jaw_drop: 0 } },
        { rel: 100, weights: { jaw_drop: 1 } },
      ],
      { loop: true },
    );

    expect(rafCb).toBeNull();

    tickNativeFacePlaybackOnXrFrame();
    expect(getNativeFaceWeightsIfFresh(5000)?.jaw_drop).toBeCloseTo(0);

    nowMs = 20_050;
    tickNativeFacePlaybackOnXrFrame();
    expect(getNativeFaceWeightsIfFresh(5000)?.jaw_drop).toBeCloseTo(0.5);

    window.__characterStudioWebXrRenderer = { xr: { isPresenting: false } };
    resumeNativeFacePlaybackScheduling();
    expect(rafCb).not.toBeNull();
  });
});
