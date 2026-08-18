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

/**
 * Find a head bone on a VRM / skinned model (does not move the camera).
 * @param {import('three').Object3D|null} root
 * @returns {import('three').Object3D|null}
 */
export function findHeadBone(root) {
  if (!root) return null;
  const vrm = root.userData?.vrm;
  const humanoid = vrm?.humanoid;
  if (humanoid?.getNormalizedBoneNode) {
    const node = humanoid.getNormalizedBoneNode('head');
    if (node) return node;
  }
  if (humanoid?.getBoneNode) {
    const node = humanoid.getBoneNode('head');
    if (node) return node;
  }
  let found = null;
  root.traverse?.((obj) => {
    if (found || !obj?.isBone) return;
    const n = String(obj.name || '').toLowerCase();
    if (n === 'head' || n.endsWith('_head') || n.includes('head')) {
      found = obj;
    }
  });
  return found;
}

/**
 * Dispose a previous head-splat overlay without touching the body VRM.
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export function disposeHeadSplatOverlay(sceneManager) {
  const overlay = sceneManager?.headSplatOverlay;
  if (!overlay) return;
  try {
    overlay.parent?.remove(overlay);
  } catch {
    // ignore
  }
  disposeSplatMesh(overlay);
  sceneManager.headSplatOverlay = null;
}

/**
 * Load an Arc2Avatar (or other) head splat and parent it to the body Head bone.
 * Keeps the current VRM/GLB as `currentModel` — does not replace the player mesh.
 *
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {File|string} source
 * @param {{
 *   scale?: number,
 *   offset?: [number, number, number],
 *   orientationMode?: 'none'|'triposplat-preview'|'z-up-to-y-up',
 *   hideMeshHead?: boolean,
 * }} [options]
 * @returns {Promise<import('@sparkjsdev/spark').SplatMesh>}
 */
export async function attachHeadSplatToBody(sceneManager, source, options = {}) {
  if (!sceneManager?.currentModel) {
    throw new Error('Load a Body+Cloth / template_wrap body before attaching a head splat');
  }
  const headBone = findHeadBone(sceneManager.currentModel);
  if (!headBone) {
    throw new Error('No Head bone found on body — run template_wrap first');
  }

  disposeHeadSplatOverlay(sceneManager);
  const splat = await loadSplatMesh(sceneManager, source, {
    orientationMode: options.orientationMode ?? 'none',
    fromAigc: true,
  });

  const scale = Number.isFinite(options.scale) ? Number(options.scale) : 1;
  splat.scale.setScalar(scale);
  const off = Array.isArray(options.offset) ? options.offset : [0, -0.03, 0.015];
  splat.position.set(Number(off[0]) || 0, Number(off[1]) || 0, Number(off[2]) || 0);
  splat.userData.isHeadSplatOverlay = true;
  splat.userData.attachedToHeadBone = headBone.name || 'Head';

  headBone.add(splat);
  sceneManager.headSplatOverlay = splat;

  if (options.hideMeshHead !== false) {
    // Soft-hide dense head meshes so the splat reads as the face (template morph head remains for XR).
    sceneManager.currentModel.traverse?.((obj) => {
      if (!obj?.isMesh) return;
      const n = String(obj.name || '').toLowerCase();
      if (n.includes('avatarhead') || n === 'head' || n.includes('face')) {
        obj.visible = false;
        obj.userData.hiddenForHeadSplat = true;
      }
    });
  }

  return splat;
}
