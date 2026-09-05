import { describe, expect, it, vi } from 'vitest';
import { tickSpacetimeXrFace } from '../library/spacetimeXrFace.js';
import { pushNativeFaceWeights } from '../library/nativeFaceBridge.js';

describe('spacetimeXrFace', () => {
  it('drives VRM expressionManager from native face relay', () => {
    const setValue = vi.fn();
    const vrm = {
      expressionManager: {
        expressions: { happy: {}, blinkLeft: {} },
        setValue,
      },
    };

    pushNativeFaceWeights({ mouthSmile: 0.8, eyesClosedLeft: 0.2 }, Date.now());
    const applied = tickSpacetimeXrFace(vrm, true, null);
    expect(applied).toBe(1);
  });

  it('returns 0 when no VRM loaded', () => {
    expect(tickSpacetimeXrFace(null, true, null)).toBe(0);
  });
});
