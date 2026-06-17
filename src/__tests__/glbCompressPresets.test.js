import { describe, expect, it } from 'vitest';
import {
  formatByteSize,
  getCompressHint,
  resolveCompressProfile,
} from '../library/glbCompressPresets.js';

describe('glbCompressPresets', () => {
  it('interpolates quality between smallest and balanced', () => {
    const profile = resolveCompressProfile({ quality: 0 });
    expect(profile.simplifyRatio).toBeCloseTo(0.004, 4);
    expect(profile.textureEdge).toBe(256);
  });

  it('uses safe preset without simplification', () => {
    const profile = resolveCompressProfile({ preset: 'safe' });
    expect(profile.simplify).toBe(false);
    expect(profile.simplifyRatio).toBe(0);
  });

  it('formats byte sizes', () => {
    expect(formatByteSize(500)).toBe('500 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
    expect(formatByteSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('returns hints for quality bands', () => {
    expect(getCompressHint(10)).toMatch(/Tiny file/);
    expect(getCompressHint(90)).toMatch(/Maximum detail/);
  });
});
