import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sharedMicManager (mic restored)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    if (typeof document !== 'undefined') {
      delete document.documentElement.dataset.headsetUi;
    }
  });

  it('acquires mic even when headset UI flag is set', async () => {
    document.documentElement.dataset.headsetUi = '1';
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', {
      userAgent: 'X11; Linux x86_64',
      platform: 'Linux armv81',
      maxTouchPoints: 5,
      mediaDevices: { getUserMedia },
    });
    const { acquireSharedMicStream, releaseSharedMicStream, sharedMicRefCount } = await import(
      '../library/sharedMicManager.js'
    );
    const got = await acquireSharedMicStream();
    expect(got).toBe(stream);
    expect(getUserMedia).toHaveBeenCalled();
    expect(sharedMicRefCount()).toBe(1);
    releaseSharedMicStream();
    expect(sharedMicRefCount()).toBe(0);
  });
});
