import { describe, expect, it, vi } from 'vitest';
import {
  averageCenterFaceRgb,
  complexionPhraseFromRgb,
  rgbToHex,
  sampleFaceSkinSwatch,
} from '../library/sampleFaceSkinSwatch.js';

describe('sampleFaceSkinSwatch', () => {
  it('rgbToHex pads channels', () => {
    expect(rgbToHex(196, 164, 132)).toBe('#c4a484');
    expect(rgbToHex(0, 15, 255)).toBe('#000fff');
  });

  it('complexionPhraseFromRgb includes undertone, depth, and hex', () => {
    const fair = complexionPhraseFromRgb(230, 200, 185);
    expect(fair).toMatch(/fair|very fair|light/);
    expect(fair).toContain('#');
    expect(fair).toContain('consistent neck and arms');

    const deep = complexionPhraseFromRgb(70, 45, 35);
    expect(deep).toMatch(/deep|very deep|medium-tan/);
    expect(deep).toContain('matching face reference');
  });

  it('averageCenterFaceRgb samples cheek/forehead boxes', () => {
    const w = 100;
    const h = 100;
    const data = new Uint8ClampedArray(w * h * 4);
    // Fill cheeks/forehead region with known skin-like color.
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        data[i] = 180;
        data[i + 1] = 140;
        data[i + 2] = 120;
        data[i + 3] = 255;
      }
    }
    const avg = averageCenterFaceRgb(data, w, h);
    expect(avg.sampleCount).toBeGreaterThan(0);
    expect(avg.r).toBeCloseTo(180, 0);
    expect(avg.g).toBeCloseTo(140, 0);
    expect(avg.b).toBeCloseTo(120, 0);
  });

  it('sampleFaceSkinSwatch draws bitmap and returns hex + phrase', async () => {
    const w = 64;
    const h = 64;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 200;
      pixels[i + 1] = 160;
      pixels[i + 2] = 140;
      pixels[i + 3] = 255;
    }

    const fakeBitmap = {
      width: w,
      height: h,
      close: vi.fn(),
    };

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => fakeBitmap),
    );

    const drawImage = vi.fn();
    const getImageData = vi.fn(() => ({ data: pixels, width: w, height: h }));
    const getContext = vi.fn(() => ({ drawImage, getImageData }));
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return { width: 0, height: 0, getContext };
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });

    try {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
      const out = await sampleFaceSkinSwatch(blob);
      expect(out.hex).toBe('#c8a08c');
      expect(out.phrase).toContain('#c8a08c');
      expect(out.sampleCount).toBeGreaterThan(0);
      expect(fakeBitmap.close).toHaveBeenCalled();
    } finally {
      createElement.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
