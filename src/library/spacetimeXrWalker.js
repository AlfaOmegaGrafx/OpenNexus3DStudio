/**
 * Space-Time XR walker — VRM load/dispose (heavy). Placement/snap → spacetimeXrWalkerSnap.js.
 */
import * as THREE from 'three';
import { VRMLoader } from './vrmLoader.js';
import { applySpacetimePbrMaterialFix } from './spacetimeFabricScene.js';

export {
  SPACETIME_WALKER_STANDOFF_M,
  embodySpacetimeWalkerThirdPerson,
  orientSpacetimeWalkerToView,
  placeSpacetimeWalkerAtFabricCenter,
  placeSpacetimeWalkerAtViewportTarget,
  placeSpacetimeWalkerStandoff,
  snapSpacetimeWalkerToWalkSurface,
  tickSpacetimeWalkerGroundFollow,
} from './spacetimeXrWalkerSnap.js';

/** sessionStorage blob/object URL from main OpenNexus Import */
export const SPACETIME_XR_VRM_SESSION_KEY = 'opennexus.spacetimeXrVrmUrl';

/** ~5′11″ standing height (OpenNexus immersive parity). */
export const SPACETIME_WALKER_TARGET_HEIGHT_M = 1.8;

/**
 * @param {URLSearchParams} searchParams
 * @returns {string}
 */
export function resolveSpacetimeWalkerVrmSource(searchParams) {
  const direct = searchParams?.get?.('vrmUrl') || searchParams?.get?.('vrm') || '';
  if (direct) return direct.trim();

  const useMain =
    searchParams?.get?.('useMainAvatar') === '1' ||
    searchParams?.get?.('mainAvatar') === '1';
  if (!useMain) return '';

  try {
    return sessionStorage.getItem(SPACETIME_XR_VRM_SESSION_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * @param {File|Blob|string} source
 */
export function rememberSpacetimeWalkerVrm(source) {
  if (typeof source === 'string' && source.length > 0) {
    try {
      sessionStorage.setItem(SPACETIME_XR_VRM_SESSION_KEY, source);
    } catch {
      /* ignore quota */
    }
    return source;
  }
  if (!(source instanceof Blob)) return null;

  try {
    const prev = sessionStorage.getItem(SPACETIME_XR_VRM_SESSION_KEY);
    if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
    const url = URL.createObjectURL(source);
    sessionStorage.setItem(SPACETIME_XR_VRM_SESSION_KEY, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * @param {THREE.Object3D} scene
 * @param {number} targetHeightM
 */
export function scaleSpacetimeWalkerToHeight(scene, targetHeightM = SPACETIME_WALKER_TARGET_HEIGHT_M) {
  if (!scene) return 1;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return 1;
  const height = box.getSize(new THREE.Vector3()).y;
  if (height < 0.01) return 1;
  const scale = targetHeightM / height;
  scene.scale.multiplyScalar(scale);
  return scale;
}

/**
 * @param {THREE.Object3D} scene
 */
export function anchorSpacetimeWalkerFeetToFloor(scene) {
  if (!scene) return 0;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return 0;
  const lift = -box.min.y;
  scene.position.y += lift;
  return lift;
}

/**
 * @param {THREE.Group} playerRoot
 * @param {File|string} source
 */
export async function loadSpacetimeWalkerVrm(playerRoot, source) {
  if (!playerRoot || !source) return null;

  const loader = new VRMLoader();
  const vrm = await loader.loadVRM(source, {
    passthrough: true,
    normalize: false,
    addDefaultMaterials: false,
    processBlendShapes: true,
    setupBones: false,
    allowMissingHumanoidBones: true,
  });

  const scene = vrm?.scene;
  if (!scene) throw new Error('VRM load returned no scene');

  scene.name = scene.name || 'SpacetimeWalkerVrm';
  scene.userData.vrm = vrm;
  applySpacetimePbrMaterialFix(scene);
  scaleSpacetimeWalkerToHeight(scene);
  anchorSpacetimeWalkerFeetToFloor(scene);

  playerRoot.clear();
  playerRoot.add(scene);
  playerRoot.visible = false;

  console.info('[spacetime-xr] walker VRM loaded', {
    name: vrm.meta?.name || scene.name,
    heightM: SPACETIME_WALKER_TARGET_HEIGHT_M,
  });

  return { vrm, scene };
}

/**
 * @param {import('@pixiv/three-vrm').VRM|null|undefined} vrm
 * @param {number} deltaSeconds
 */
export function tickSpacetimeWalkerVrm(vrm, deltaSeconds) {
  if (!vrm) return;
  try {
    vrm.update?.(deltaSeconds);
  } catch {
    /* optional spring bones */
  }
}

/**
 * @param {THREE.Group} playerRoot
 */
export function disposeSpacetimeWalkerVrm(playerRoot) {
  if (!playerRoot) return;
  playerRoot.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose?.();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) mat?.dispose?.();
    }
  });
  playerRoot.clear();
}
