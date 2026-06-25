/**
 * Spark.js Gaussian splat loading for OpenNexus3DStudio viewport.
 * @see https://sparkjs.dev/docs/splat-mesh/
 */
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import * as THREE from './three.js';

const TRIPOSPLAT_PREVIEW_X_FLIP = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI,
);
/**
 * @param {import('@sparkjsdev/spark').SplatMesh} splat
 * @param {'none'|'triposplat-preview'|'z-up-to-y-up'} mode
 */
export function applySplatOrientationCorrection(splat, mode) {
  if (!splat || mode === 'none') return;
  if (mode === 'z-up-to-y-up') {
    splat.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    return;
  }
  if (mode === 'triposplat-preview') {
    splat.quaternion.copy(TRIPOSPLAT_PREVIEW_X_FLIP);
  }
}

const SPLAT_EXTENSIONS = new Set(['ply', 'splat', 'spz', 'ksplat', 'sog']);

export function isGaussianSplatExtension(extension) {
  return SPLAT_EXTENSIONS.has(String(extension || '').toLowerCase());
}

/**
 * Attach SparkRenderer to the scene (required for correct splat sorting).
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export function ensureSparkRenderer(sceneManager) {
  if (sceneManager.sparkRenderer) {
    return sceneManager.sparkRenderer;
  }
  if (!sceneManager.renderer || !sceneManager.scene) {
    throw new Error('SceneManager must be initialized before loading splats');
  }

  const spark = new SparkRenderer({ renderer: sceneManager.renderer });
  sceneManager.scene.add(spark);
  sceneManager.sparkRenderer = spark;
  return spark;
}

/**
 * Load a Gaussian splat asset into the viewport.
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {File|string} source
 * @param {object} [options]
 * @returns {Promise<import('@sparkjsdev/spark').SplatMesh>}
 */
export async function loadSplatMesh(sceneManager, source, options = {}) {
  ensureSparkRenderer(sceneManager);

  let url = source;
  let objectUrl = null;
  if (source instanceof File) {
    objectUrl = URL.createObjectURL(source);
    url = objectUrl;
  }

  console.log('[Splat] Loading Gaussian splat:', url);
  const splat = new SplatMesh({ url });
  await splat.initialized;
  console.log('[Splat] Splat mesh ready');

  // TripoSplat exports are Y-inverted vs Three.js; 180° on X rights the environment.
  // World manifests use identity rotation by default — worldSceneLoader preserves this
  // correction instead of resetting the quaternion to identity.
  const orientationMode =
    options.orientationMode ??
    (options.fromAigc === false ? 'none' : 'triposplat-preview');
  applySplatOrientationCorrection(splat, orientationMode);

  splat.userData.isGaussianSplat = true;
  if (objectUrl) {
    splat.userData.objectUrl = objectUrl;
  }

  return splat;
}

/**
 * @param {import('@sparkjsdev/spark').SplatMesh|null} splat
 */
export function disposeSplatMesh(splat) {
  if (!splat) return;
  try {
    if (splat.userData?.objectUrl) {
      URL.revokeObjectURL(splat.userData.objectUrl);
    }
    splat.dispose?.();
  } catch (error) {
    console.warn('Failed to dispose SplatMesh:', error);
  }
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export function disposeSparkRenderer(sceneManager) {
  if (!sceneManager?.sparkRenderer) return;
  try {
    sceneManager.scene?.remove(sceneManager.sparkRenderer);
  } catch {
    // ignore
  }
  sceneManager.sparkRenderer = null;
}
