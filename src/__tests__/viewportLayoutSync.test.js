import { describe, expect, it } from 'vitest';
import {
  applyViewportOverlayScale,
  getAdjusterOverlayScale,
  getViewportUiScaleForWidth,
} from '../library/viewportLayoutSync.js';

describe('viewportLayoutSync overlay scale', () => {
  it('shrinks overlays on narrow Galaxy XR viewport', () => {
    expect(getViewportUiScaleForWidth(480)).toBeCloseTo(0.5, 2);
  });

  it('keeps reference scale at Surface-sized viewport', () => {
    expect(getViewportUiScaleForWidth(960)).toBeCloseTo(1, 2);
  });

  it('keeps enlarging toward maximized windows (not capped at 1.15)', () => {
    expect(getViewportUiScaleForWidth(1200)).toBeCloseTo(1.25, 2);
    expect(getViewportUiScaleForWidth(1920)).toBeCloseTo(2.0, 2);
    expect(getViewportUiScaleForWidth(2400)).toBe(2.5);
  });

  it('clamps extreme widths', () => {
    expect(getViewportUiScaleForWidth(200)).toBe(0.42);
    expect(getViewportUiScaleForWidth(4000)).toBe(2.5);
  });

  it('Adjuster and animation bar share the same scale curve', () => {
    expect(getAdjusterOverlayScale(0.5)).toBe(0.5);
    expect(getAdjusterOverlayScale(1)).toBe(1);
    expect(getAdjusterOverlayScale(1.8)).toBe(1.8);
    expect(getAdjusterOverlayScale(3)).toBe(2.5);
  });

  it('sets inline transform on viewport overlays', () => {
    document.body.innerHTML = `
      <div data-animation-bar="true"><button type="button">play</button></div>
      <div class="m2m-overlay"><button type="button">adj</button></div>
    `;
    applyViewportOverlayScale(0.75);
    expect(document.documentElement.style.getPropertyValue('--viewport-ui-scale')).toBe('0.75');
    const bar = document.querySelector('[data-animation-bar="true"]');
    expect(bar?.style.transform).toBe('scale(0.75)');
    expect(bar?.style.pointerEvents).toBe('none');
    expect(bar?.querySelector('button')?.style.pointerEvents).toBe('auto');
    const adjuster = document.querySelector('.m2m-overlay');
    expect(adjuster?.style.transform).toBe('scale(0.75)');
    expect(adjuster?.style.pointerEvents).toBe('none');
    expect(adjuster?.querySelector('button')?.style.pointerEvents).toBe('auto');
  });

  it('rejects non-finite scale values', () => {
    document.body.innerHTML = `<div data-animation-bar="true"></div>`;
    applyViewportOverlayScale(Number.NaN);
    expect(document.documentElement.style.getPropertyValue('--viewport-ui-scale')).toBe('1');
  });
});
