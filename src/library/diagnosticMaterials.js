/**
 * Debug / diagnostic materials for viewport render modes (depth, normals, UV).
 * Uses Three.js built-ins with skinning support for VRM / skinned meshes.
 */
import * as THREE from './three.js';

/**
 * @param {{ skinning?: boolean }} opts
 * @returns {THREE.MeshDepthMaterial}
 */
export function createDepthVisualizationMaterial(opts = {}) {
  return new THREE.MeshDepthMaterial({
    skinning: Boolean(opts.skinning),
  });
}

/**
 * View-space normals as RGB (no normal-map texture required).
 * @param {{ skinning?: boolean }} opts
 * @returns {THREE.MeshNormalMaterial}
 */
export function createViewNormalMaterial(opts = {}) {
  return new THREE.MeshNormalMaterial({
    skinning: Boolean(opts.skinning),
    flatShading: false,
    side: THREE.DoubleSide,
  });
}

/**
 * @param {THREE.Texture} uvMap
 * @param {{ skinning?: boolean }} opts
 * @returns {THREE.MeshBasicMaterial}
 */
export function createUVMaterial(uvMap, opts = {}) {
  return new THREE.MeshBasicMaterial({
    map: uvMap,
    skinning: Boolean(opts.skinning),
    side: THREE.DoubleSide,
  });
}
