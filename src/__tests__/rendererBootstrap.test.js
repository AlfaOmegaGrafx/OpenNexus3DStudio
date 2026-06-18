import { describe, expect, it } from 'vitest';
import { checkWebGPUSupport, getRendererInfo } from '../library/rendererBootstrap.js';

describe('rendererBootstrap', () => {
  it('checkWebGPUSupport returns unsupported in jsdom', async () => {
    const result = await checkWebGPUSupport();
    expect(result.supported).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('getRendererInfo handles missing scene manager', () => {
    expect(getRendererInfo(null)).toEqual({ type: 'none', label: 'Not initialized' });
  });

  it('getRendererInfo reports scene manager renderer type', () => {
    const info = getRendererInfo({
      renderer: { isWebGPURenderer: true, getPixelRatio: () => 1 },
      rendererType: 'webgpu',
    });
    expect(info.type).toBe('webgpu');
    expect(info.label).toBe('WebGPU');
    expect(info.isWebGPURenderer).toBe(true);
  });
});
