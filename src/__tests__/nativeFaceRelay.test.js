import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import {
  isNativeFaceRelayEnabledInUrl,
  connectNativeFaceRelay,
  disconnectNativeFaceRelay,
  getNativeFaceRelayStatus
} from '../library/nativeFaceRelay.js';
import { clearNativeFaceWeights, getNativeFaceWeightsIfFresh, initNativeFaceBridge } from '../library/nativeFaceBridge.js';

describe('nativeFaceRelay', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'EventSource',
      class MockEventSource {
        constructor() {
          queueMicrotask(() => this.onopen?.());
        }
        close() {}
      }
    );
    initNativeFaceBridge();
  });

  afterEach(() => {
    disconnectNativeFaceRelay();
    clearNativeFaceWeights();
    delete window.__characterStudioNativeFace;
    delete window.__CS_NATIVE_FACE_RELAY_STATUS;
    vi.unstubAllGlobals();
    vi.useRealTimers();
    history.replaceState({}, '', '/');
  });

  it('isNativeFaceRelayEnabledInUrl detects query flag', () => {
    history.replaceState({}, '', '/?nativeFaceRelay=1');
    expect(isNativeFaceRelayEnabledInUrl()).toBe(true);
    history.replaceState({}, '', '/');
    expect(isNativeFaceRelayEnabledInUrl()).toBe(false);
  });

  it('poll loop applies latest payload via nativeFaceBridge', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ weights: { jaw_drop: 0.42 }, t: 50_000 })
    });
    vi.stubGlobal('fetch', fetchMock);

    connectNativeFaceRelay();
    await vi.advanceTimersByTimeAsync(60);

    const rec = getNativeFaceWeightsIfFresh(5000);
    expect(rec?.jaw_drop).toBeCloseTo(0.42);
    expect(getNativeFaceRelayStatus().mode).toMatch(/poll/);
  });
});
