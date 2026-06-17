/**
 * Viewport renderer bootstrap — WebGPU with WebGL2 fallback (Three.js r180+).
 * @see docs/THREEJS_WEBGPU_WEBXR_MIGRATION.md
 */
import * as THREE from './three.js';
import { WebGPURenderer } from 'three/webgpu';

/**
 * Probe WebGPU availability without creating a renderer.
 * @returns {Promise<{ supported: boolean, adapter?: GPUAdapter, reason?: string }>}
 */
export async function checkWebGPUSupport() {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return { supported: false, reason: 'navigator.gpu unavailable' };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return { supported: false, reason: 'no adapter' };
    }
    return { supported: true, adapter };
  } catch (err) {
    return { supported: false, reason: err?.message || String(err) };
  }
}

/**
 * Create the best available viewport renderer.
 *
 * @param {object} options
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {boolean} [options.enableAntialias]
 * @param {boolean} [options.enableShadows]
 * @param {boolean} [options.forceWebGL]
 * @returns {Promise<{ renderer: import('three').WebGLRenderer | import('three/webgpu').WebGPURenderer, type: 'webgpu' | 'webgl', webgpuSupport: object } | null>}
 */
export async function createViewportRenderer(options = {}) {
  const {
    enableAntialias = true,
    enableShadows = true,
    forceWebGL = false,
  } = options;

  if (forceWebGL) {
    return null;
  }

  const webgpuSupport = await checkWebGPUSupport();
  if (!webgpuSupport.supported) {
    return null;
  }

  try {
    const renderer = new WebGPURenderer({
      antialias: enableAntialias,
      alpha: true,
      depth: true,
    });
    await renderer.init();

    if (enableShadows && renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const backend = renderer.backend?.constructor?.name || '';
    const type = backend.includes('WebGPU') ? 'webgpu' : 'webgl';

    console.log(`✅ Viewport renderer: ${type} (${backend || 'WebGPURenderer'})`);
    return { renderer, type, webgpuSupport };
  } catch (err) {
    console.warn('WebGPURenderer init failed, will use WebGL fallback:', err?.message || err);
    return null;
  }
}

/**
 * @param {import('./sceneManager.js').SceneManager | null | undefined} sceneManager
 */
export function getRendererInfo(sceneManager) {
  if (!sceneManager?.renderer) {
    return { type: 'none', label: 'Not initialized' };
  }
  const type = sceneManager.rendererType || 'webgl';
  const labels = {
    webgpu: 'WebGPU',
    webgl: 'WebGL',
    software: 'Software',
  };
  return {
    type,
    label: labels[type] || type,
    isWebGPURenderer: Boolean(sceneManager.renderer?.isWebGPURenderer),
    pixelRatio: sceneManager.renderer?.getPixelRatio?.() ?? null,
  };
}
