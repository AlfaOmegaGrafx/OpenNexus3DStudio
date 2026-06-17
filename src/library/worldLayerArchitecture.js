/**
 * World layer architecture — SceneManager owns one scene graph for VRM + 3DGS worlds.
 *
 * Layer roots (see worldSceneLoader.ensureSceneRoots):
 *   playerRoot  — avatar / rigged GLB / optional preview splat on player layer
 *   worldRoot   — Gaussian splat environment + invisible locomotion collider
 *   propsRoot   — mesh props from world packages (grab/locomotion: IWSDK Option A track)
 *
 * Generation: DGX 3DAIGC-API (TripoSplat, image-to-world, avatar pipeline)
 * Rendering:  Spark.js SplatMesh in the same WebGLRenderer as VRM (sparkSplatManager.js)
 * XR:         SceneManager WebXR session on `/` — worlds render alongside avatar when loaded
 *
 * @see docs/IWSDK_OPTION_A_MIGRATION_BLUEPRINT.md
 * @see README.md § Gaussian splats (3DGS)
 */

/** Event names emitted on SceneManager for world layer state. */
export const WORLD_LAYER_EVENTS = Object.freeze({
  LOADING_START: 'worldLoadingStart',
  ENVIRONMENT_LOADED: 'worldEnvironmentLoaded',
  COLLIDER_LOADED: 'worldColliderLoaded',
  LOADED: 'worldLoaded',
  CLEARED: 'worldCleared',
});

/** XR interaction events (Phases 3–5, main app `/`). */
export const XR_INTERACTION_EVENTS = Object.freeze({
  INPUT_FRAME: 'xrInputFrame',
  GRAB_START: 'xrGrabStart',
  GRAB_END: 'xrGrabEnd',
  LOCOMOTION: 'xrLocomotion',
});

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @returns {boolean}
 */
export function hasActiveWorldEnvironment(sceneManager) {
  return Boolean(sceneManager?.worldEnvironmentSplat || sceneManager?.activeWorldId);
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @returns {boolean}
 */
export function hasWorldLocomotionCollider(sceneManager) {
  return Boolean(sceneManager?.worldColliderMesh);
}
