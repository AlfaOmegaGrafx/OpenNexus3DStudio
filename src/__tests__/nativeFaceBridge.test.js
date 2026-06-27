import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import {
  pushNativeFaceWeights,
  clearNativeFaceWeights,
  getNativeFaceWeightsIfFresh,
  initNativeFaceBridge,
  isAndroidXrWebView,
  OPENXR_WEB_ENABLED,
  NATIVE_FACE_WINDOW_API,
} from '../library/nativeFaceBridge.js';

describe('nativeFaceBridge', () => {
  afterEach(() => {
    clearNativeFaceWeights();
    vi.useRealTimers();
    delete window[NATIVE_FACE_WINDOW_API];
    delete window.__ON_NATIVE_FACE_Q;
    delete window.__CS_NATIVE_FACE_Q;
    delete window.onNativeFaceData;
    delete window.AndroidXRBridge;
  });

  it('pushNativeFaceWeights + getNativeFaceWeightsIfFresh returns record when fresh', () => {
    pushNativeFaceWeights({ jaw_drop: 0.7, eyes_closed_left: 0.2 });
    const rec = getNativeFaceWeightsIfFresh(400);
    expect(rec).not.toBeNull();
    expect(rec?.jaw_drop).toBeCloseTo(0.7);
    expect(rec?.eyes_closed_left).toBeCloseTo(0.2);
  });

  it('getNativeFaceWeightsIfFresh returns null when stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    pushNativeFaceWeights({ jaw_drop: 1 });
    vi.setSystemTime(10_000 + 500);
    expect(getNativeFaceWeightsIfFresh(400)).toBeNull();
  });

  it('clearNativeFaceWeights resets state', () => {
    pushNativeFaceWeights({ jaw_drop: 1 });
    clearNativeFaceWeights();
    expect(getNativeFaceWeightsIfFresh(10_000)).toBeNull();
  });

  it('initNativeFaceBridge drains __ON_NATIVE_FACE_Q (native raced ahead of bundle)', () => {
    window.__ON_NATIVE_FACE_Q = [{ weights: { jaw_drop: 0.33 }, t: 99_000 }];
    vi.useFakeTimers();
    vi.setSystemTime(99_000);
    initNativeFaceBridge();
    const rec = getNativeFaceWeightsIfFresh(5000);
    expect(rec?.jaw_drop).toBeCloseTo(0.33);
  });

  it('initNativeFaceBridge push accepts nested weights and timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(60_000);
    initNativeFaceBridge();
    const api = window[NATIVE_FACE_WINDOW_API];
    expect(api).toBeDefined();
    api.push({ weights: { jaw_drop: 0.5 }, t: 60_000 });
    const rec = getNativeFaceWeightsIfFresh(1_000_000);
    expect(rec?.jaw_drop).toBeCloseTo(0.5);
  });

  it('initNativeFaceBridge push parses JSON string', () => {
    initNativeFaceBridge();
    window[NATIVE_FACE_WINDOW_API].push(JSON.stringify({ jaw_drop: 0.25 }));
    const rec = getNativeFaceWeightsIfFresh(400);
    expect(rec?.jaw_drop).toBeCloseTo(0.25);
  });

  it('initNativeFaceBridge getFresh mirrors module helper', () => {
    initNativeFaceBridge();
    pushNativeFaceWeights({ a: 1 });
    expect(window[NATIVE_FACE_WINDOW_API].getFresh(400)).not.toBeNull();
  });

  it('push maps openxrParameters to WebXR keys (jaw_drop) when OPENXR_WEB_ENABLED', () => {
    initNativeFaceBridge();
    const arr = new Array(68).fill(0);
    arr[24] = 0.9;
    window[NATIVE_FACE_WINDOW_API].push({ openxrParameters: arr });
    const rec = getNativeFaceWeightsIfFresh(400);
    if (OPENXR_WEB_ENABLED) {
      expect(rec?.jaw_drop).toBeCloseTo(0.9);
    } else {
      expect(rec).toEqual({});
      expect(rec?.jaw_drop).toBeUndefined();
    }
  });

  it('window.onNativeFaceData forwards into native face store', () => {
    initNativeFaceBridge();
    window.onNativeFaceData({ jaw_drop: 0.42, mouth_left: 0.1 });
    const rec = getNativeFaceWeightsIfFresh(400);
    expect(rec?.jaw_drop).toBeCloseTo(0.42);
    expect(rec?.mouth_left).toBeCloseTo(0.1);
  });

  it('initNativeFaceBridge calls AndroidXRBridge.onBridgeReady when present', () => {
    const onBridgeReady = vi.fn();
    window.AndroidXRBridge = { onBridgeReady };
    initNativeFaceBridge();
    expect(onBridgeReady).toHaveBeenCalledTimes(1);
    expect(isAndroidXrWebView()).toBe(true);
  });

  it('push merges openxrParameters then overrides with named weights', () => {
    initNativeFaceBridge();
    const arr = new Array(68).fill(0);
    arr[24] = 0.9;
    window[NATIVE_FACE_WINDOW_API].push({
      openxrParameters: arr,
      weights: { jaw_drop: 0.1 },
    });
    const rec = getNativeFaceWeightsIfFresh(400);
    expect(rec?.jaw_drop).toBeCloseTo(0.1);
  });
});
