/**
 * Load World Packages into SceneManager layer roots (world / props / player).
 */
import * as THREE from './three.js';
import { getViewportFloorAnchorBounds } from './rigBoneUtils.js';
import {
  applySplatOrientationCorrection,
  disposeSplatMesh,
  loadSplatMesh,
} from './sparkSplatManager.js';
import { resolveWorldPackageUrls } from './worldPackage.js';

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export function ensureSceneRoots(sceneManager) {
  if (!sceneManager.scene) return;

  const attachRoot = (key, name) => {
    if (!sceneManager[key]) {
      sceneManager[key] = new THREE.Group();
      sceneManager[key].name = name;
    }
    const root = sceneManager[key];
    if (root.parent !== sceneManager.scene) {
      sceneManager.scene.add(root);
    }
    root.visible = true;
  };

  attachRoot('playerRoot', 'playerRoot');
  attachRoot('worldRoot', 'worldRoot');
  attachRoot('propsRoot', 'propsRoot');
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export function clearWorld(sceneManager) {
  ensureSceneRoots(sceneManager);
  if (sceneManager.worldEnvironmentSplat) {
    disposeSplatMesh(sceneManager.worldEnvironmentSplat);
    sceneManager.worldRoot.remove(sceneManager.worldEnvironmentSplat);
    sceneManager.worldEnvironmentSplat = null;
  }
  if (sceneManager.worldColliderMesh) {
    sceneManager.worldRoot.remove(sceneManager.worldColliderMesh);
    sceneManager.worldColliderMesh.traverse?.((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      }
    });
    sceneManager.worldColliderMesh = null;
  }
  const propMeshes = sceneManager.worldPropMeshes || [];
  for (const mesh of propMeshes) {
    sceneManager.propsRoot.remove(mesh);
    mesh.traverse?.((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      }
    });
  }
  sceneManager.worldPropMeshes = [];
  sceneManager.activeWorldId = null;
  sceneManager.activeWorldManifest = null;
  sceneManager.emit?.('worldCleared', {});
}

/**
 * Manifest rotations are stored as quaternion [w, x, y, z].
 * Identity is the default when the backend omits orientation — do not overwrite
 * client-side splat corrections (e.g. TripoSplat 180° X) in that case.
 *
 * @param {number[]|undefined} rotation
 */
export function isIdentityWorldRotation(rotation) {
  if (!Array.isArray(rotation) || rotation.length < 4) return true;
  const w = Number(rotation[0]) || 1;
  const x = Number(rotation[1]) || 0;
  const y = Number(rotation[2]) || 0;
  const z = Number(rotation[3]) || 0;
  return (
    Math.abs(w - 1) < 1e-5 &&
    Math.abs(x) < 1e-5 &&
    Math.abs(y) < 1e-5 &&
    Math.abs(z) < 1e-5
  );
}

/**
 * @param {THREE.Object3D} object
 * @param {import('./worldPackage.js').WorldTransform} transform
 */
export function applyWorldTransform(object, transform) {
  if (!object || !transform) return;
  if (Array.isArray(transform.position)) {
    object.position.set(
      transform.position[0] ?? 0,
      transform.position[1] ?? 0,
      transform.position[2] ?? 0,
    );
  }
  if (Array.isArray(transform.rotation) && transform.rotation.length >= 4) {
    if (!isIdentityWorldRotation(transform.rotation)) {
      object.quaternion.set(
        transform.rotation[1] ?? 0,
        transform.rotation[2] ?? 0,
        transform.rotation[3] ?? 0,
        transform.rotation[0] ?? 1,
      );
    }
  } else if (transform.rotation_y) {
    object.rotation.y = transform.rotation_y;
  }
  const scale = transform.scale ?? 1;
  object.scale.setScalar(scale);
}

/**
 * World-space bounds for floor anchoring. Spark SplatMesh needs getBoundingBox(false);
 * THREE.Box3.setFromObject often returns an empty or centered proxy box for splats.
 * @param {THREE.Object3D} root
 * @returns {THREE.Box3}
 */
export function getObjectFloorBounds(root) {
  const box = new THREE.Box3();
  if (!root) return box;

  if (root.userData?.isGaussianSplat && typeof root.getBoundingBox === 'function') {
    try {
      if (root.initialized) {
        const local = root.getBoundingBox(false);
        if (!local.isEmpty()) {
          root.updateMatrixWorld(true);
          return box.copy(local).applyMatrix4(root.matrixWorld);
        }
      }
    } catch (err) {
      console.warn('[World] Splat bounding box fallback:', err?.message || err);
    }
  }

  root.updateMatrixWorld(true);
  box.setFromObject(root);
  return box;
}

/**
 * Shift an object so the bottom of its world-space bounds sits on Y=0 (floor plane).
 * @param {THREE.Object3D} root
 * @returns {number} vertical lift applied (meters)
 */
export function anchorObjectBottomToFloor(root) {
  if (!root) return 0;
  const box = getObjectFloorBounds(root);
  if (box.isEmpty()) return 0;
  const lift = -box.min.y;
  if (Math.abs(lift) > 0.001) {
    root.position.y += lift;
    root.updateMatrixWorld(true);
  }
  return lift;
}

const FLOOR_ANCHOR_LAYER_KEYS = ['playerRoot', 'worldRoot', 'propsRoot'];

/**
 * XR wrapper Y offset so the lowest scene content sits on reference-space floor (Y=0).
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @returns {number}
 */
export function computeXrFloorAlignmentY(sceneManager) {
  if (!sceneManager) return 0;

  const box = new THREE.Box3();
  let hasBounds = false;

  const includeBounds = (object) => {
    if (!object) return;
    const bounds = getObjectFloorBounds(object);
    if (bounds.isEmpty()) return;
    if (!hasBounds) {
      box.copy(bounds);
      hasBounds = true;
    } else {
      box.union(bounds);
    }
  };

  const wrapper = sceneManager.vrSceneWrapper;
  if (wrapper) {
    wrapper.updateMatrixWorld(true);
    for (const child of wrapper.children) {
      if (child === sceneManager.xrLocomotionRig) {
        for (const rigChild of child.children) {
          includeBounds(rigChild);
        }
        continue;
      }
      if (
        child.name === 'VRSkybox' ||
        child.type === 'PerspectiveCamera' ||
        child.type === 'OrthographicCamera' ||
        child.isHelper
      ) {
        continue;
      }
      includeBounds(child);
    }
  }

  if (!hasBounds) {
    for (const key of FLOOR_ANCHOR_LAYER_KEYS) {
      includeBounds(sceneManager[key]);
    }
    if (!hasBounds && sceneManager.currentModel) {
      const avatarFloor = getViewportFloorAnchorBounds(sceneManager.currentModel);
      if (!avatarFloor.isEmpty()) {
        box.copy(avatarFloor);
        hasBounds = true;
      } else {
        includeBounds(sceneManager.currentModel);
      }
    }
  }

  if (!hasBounds) return 0;
  return -box.min.y;
}

/** Viewport avatar height after processModel (≈2 m humanoid). */
const VIEWPORT_AVATAR_HEIGHT = 2;
/** Chair/desk props should read ~70–80% of avatar height when seated. */
const WORLD_PROP_TARGET_HEIGHT = VIEWPORT_AVATAR_HEIGHT * 0.9;

const PROP_ORIENTATION_TRIALS = [
  [0, 0, 0],
  [Math.PI / 2, 0, 0],
  [-Math.PI / 2, 0, 0],
  [Math.PI, 0, 0],
  [0, 0, Math.PI / 2],
  [0, 0, -Math.PI / 2],
  [Math.PI / 2, 0, Math.PI],
  [-Math.PI / 2, 0, Math.PI],
  [0, Math.PI, 0],
  [Math.PI, Math.PI, 0],
];

/**
 * @param {THREE.Object3D} root
 */
function scorePropOrientation(root) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return -Infinity;

  const size = box.getSize(new THREE.Vector3());
  let score = size.y * 2 - Math.max(size.x, size.z);

  const centroid = new THREE.Vector3();
  let weight = 0;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    obj.geometry.computeBoundingBox?.();
    const bb = obj.geometry.boundingBox;
    if (!bb || bb.isEmpty()) return;
    const localCenter = bb.getCenter(new THREE.Vector3());
    obj.localToWorld(localCenter);
    const vol = Math.max(bb.getSize(new THREE.Vector3()).length(), 1e-6);
    centroid.addScaledVector(localCenter, vol);
    weight += vol;
  });

  if (weight > 0) {
    centroid.divideScalar(weight);
    const boxCenter = box.getCenter(new THREE.Vector3());
    score += ((centroid.y - boxCenter.y) / Math.max(size.y, 1e-6)) * size.y;
  }

  return score;
}

/**
 * Pick a rotation so the prop's tallest axis is Y (feet toward -Y / floor).
 * Trials are composed with any manifest rotation already on the root.
 * @param {THREE.Object3D} root
 */
export function orientWorldPropFeetDown(root) {
  if (!root) return false;

  const basePosition = root.position.clone();
  const baseScale = root.scale.clone();
  const baseQuaternion = root.quaternion.clone();
  const trialEuler = new THREE.Euler();
  const trialQuat = new THREE.Quaternion();

  let bestQuaternion = null;
  let bestScore = -Infinity;

  for (const [rx, ry, rz] of PROP_ORIENTATION_TRIALS) {
    root.position.copy(basePosition);
    root.scale.copy(baseScale);
    trialEuler.set(rx, ry, rz);
    trialQuat.setFromEuler(trialEuler);
    root.quaternion.copy(baseQuaternion).multiply(trialQuat);
    root.updateMatrixWorld(true);

    const score = scorePropOrientation(root);
    if (score > bestScore) {
      bestScore = score;
      bestQuaternion = root.quaternion.clone();
    }
  }

  root.position.copy(basePosition);
  root.scale.copy(baseScale);
  if (!bestQuaternion) {
    root.quaternion.copy(baseQuaternion);
    return false;
  }

  root.quaternion.copy(bestQuaternion);
  root.updateMatrixWorld(true);

  const uprightScore = scorePropOrientation(root);
  root.rotateX(Math.PI);
  root.updateMatrixWorld(true);
  const invertedScore = scorePropOrientation(root);
  if (invertedScore > uprightScore) {
    bestScore = invertedScore;
  } else {
    root.rotateX(Math.PI);
    root.updateMatrixWorld(true);
  }

  const box = getObjectFloorBounds(root);
  if (!box.isEmpty()) {
    const lift = -box.min.y;
    if (lift > 0.001) {
      root.position.y += lift;
      root.updateMatrixWorld(true);
    }
  }

  console.log('[World] Oriented prop feet-down', { score: bestScore });
  return true;
}

/** @deprecated Use orientWorldPropFeetDown */
export const standWorldPropUpright = orientWorldPropFeetDown;

/**
 * Scale each mesh prop independently — splat bounds must not block furniture scaling.
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export function scaleWorldPropsToHumanProportions(sceneManager) {
  const props = sceneManager.worldPropMeshes || [];
  if (props.length === 0) return 1;

  let maxFactor = 1;
  for (const prop of props) {
    prop.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(prop);
    if (box.isEmpty()) continue;

    const size = box.getSize(new THREE.Vector3());
    const height = size.y;
    const maxDim = Math.max(size.x, size.y, size.z);
    const target = Math.max(WORLD_PROP_TARGET_HEIGHT, VIEWPORT_AVATAR_HEIGHT * 0.35);

    if (height > 0 && height < target * 0.98) {
      const factor = target / height;
      prop.scale.multiplyScalar(factor);
      maxFactor = Math.max(maxFactor, factor);
    } else if (maxDim > 0 && maxDim < target * 0.98) {
      const factor = target / maxDim;
      prop.scale.multiplyScalar(factor);
      maxFactor = Math.max(maxFactor, factor);
    }

    prop.updateMatrixWorld(true);
    const grounded = getObjectFloorBounds(prop);
    const lift = grounded.isEmpty() ? 0 : -grounded.min.y;
    if (lift > 0.001) {
      prop.position.y += lift;
    }
  }

  if (maxFactor > 1.01) {
    console.log('[World] Scaled props to human proportions', {
      factor: maxFactor,
      targetHeight: WORLD_PROP_TARGET_HEIGHT,
      propCount: props.length,
    });
  }
  return maxFactor;
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {'y-up'|'z-up'} [coordinateSystem]
 */
export function scaleWorldToHumanProportions(sceneManager, coordinateSystem = 'y-up') {
  ensureSceneRoots(sceneManager);
  scaleWorldPropsToHumanProportions(sceneManager);

  if (
    coordinateSystem === 'z-up' &&
    sceneManager.worldEnvironmentSplat &&
    isIdentityWorldRotation(
      sceneManager.activeWorldManifest?.environment?.transform?.rotation,
    )
  ) {
    applySplatOrientationCorrection(sceneManager.worldEnvironmentSplat, 'z-up-to-y-up');
  }

  if (sceneManager.worldEnvironmentSplat) {
    anchorObjectBottomToFloor(sceneManager.worldEnvironmentSplat);
  }

  sceneManager.worldRoot.updateMatrixWorld(true);
  sceneManager.propsRoot.updateMatrixWorld(true);
  return 1;
}

/**
 * Invisible locomotion / collision mesh for world packages (sensai pattern).
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {string} glbUrl
 * @param {object} [options]
 */
export async function loadWorldColliderMesh(sceneManager, glbUrl, options = {}) {
  ensureSceneRoots(sceneManager);
  if (sceneManager.worldColliderMesh) {
    sceneManager.worldRoot.remove(sceneManager.worldColliderMesh);
    sceneManager.worldColliderMesh = null;
  }
  const gltf = await sceneManager.loadGLTF(glbUrl);
  const root = gltf.scene || gltf;
  root.name = 'WorldLocomotionCollider';
  root.userData.isWorldCollider = true;
  applyWorldTransform(root, options.transform);
  anchorObjectBottomToFloor(root);
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.visible = false;
    child.userData.isWorldCollider = true;
    child.castShadow = false;
    child.receiveShadow = false;
  });
  sceneManager.worldRoot.add(root);
  sceneManager.worldColliderMesh = root;
  sceneManager.emit?.('worldColliderLoaded', { url: glbUrl });
  console.log('[World] Locomotion collider loaded:', glbUrl);
  return root;
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {string} url
 * @param {object} [options]
 */
export async function loadWorldEnvironmentSplat(sceneManager, url, options = {}) {
  ensureSceneRoots(sceneManager);
  if (sceneManager.worldEnvironmentSplat) {
    disposeSplatMesh(sceneManager.worldEnvironmentSplat);
    sceneManager.worldRoot.remove(sceneManager.worldEnvironmentSplat);
    sceneManager.worldEnvironmentSplat = null;
  }
  const splatLoadOpts = { fromAigc: options.fromAigc !== false };
  if (options.orientationMode != null) {
    splatLoadOpts.orientationMode = options.orientationMode;
  }
  const splat = await loadSplatMesh(sceneManager, url, splatLoadOpts);
  splat.userData.isWorldEnvironment = true;
  applyWorldTransform(splat, options.transform);
  if (
    options.coordinateSystem === 'z-up' &&
    options.fromAigc !== false &&
    isIdentityWorldRotation(options.transform?.rotation)
  ) {
    applySplatOrientationCorrection(splat, 'z-up-to-y-up');
  }
  anchorObjectBottomToFloor(splat);
  sceneManager.worldRoot.add(splat);
  sceneManager.worldEnvironmentSplat = splat;

  const worldId =
    options.worldId ||
    sceneManager.activeWorldId ||
    `splat:${String(url).split('/').pop()?.split('?')[0] || 'env'}`;
  sceneManager.activeWorldId = worldId;
  sceneManager.activeWorldManifest =
    options.manifest ||
    sceneManager.activeWorldManifest || {
      id: worldId,
      name: options.worldName || worldId,
      environment: { url, type: 'gaussian_splat' },
      props: [],
    };

  sceneManager.emit?.('worldEnvironmentLoaded', { url, splat, manifest: sceneManager.activeWorldManifest });
  if (options.emitWorldLoaded !== false) {
    sceneManager.emit?.('worldLoaded', {
      manifest: sceneManager.activeWorldManifest,
      propCount: sceneManager.worldPropMeshes?.length ?? 0,
      environmentOnly: true,
    });
  }
  return splat;
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {import('./worldPackage.js').WorldPackage} manifest
 * @param {string} manifestUrl
 * @param {object} [options]
 */
export async function loadWorldPackage(sceneManager, manifest, manifestUrl, options = {}) {
  ensureSceneRoots(sceneManager);
  const apiEndpoint = options.apiEndpoint || '';
  const resolved = resolveWorldPackageUrls(manifest, manifestUrl, apiEndpoint, {
    worldBaseUrl: options.worldBaseUrl,
  });
  clearWorld(sceneManager);

  sceneManager.emit?.('worldLoadingStart', { manifest: resolved });
  console.log('[World] Loading environment splat:', resolved.environment.url);

  await loadWorldEnvironmentSplat(sceneManager, resolved.environment.url, {
    fromAigc: true,
    transform: resolved.environment.transform,
    coordinateSystem: resolved.coordinate_system || 'y-up',
    worldId: resolved.id,
    worldName: resolved.name,
    manifest: resolved,
    emitWorldLoaded: false,
  });

  const colliderUrl =
    resolved.environment?.collider_url ||
    resolved.environment?.collision_mesh_url ||
    null;
  if (colliderUrl) {
    try {
      await loadWorldColliderMesh(sceneManager, colliderUrl, {
        transform: resolved.environment.transform,
      });
    } catch (err) {
      console.warn('[World] Collider mesh failed:', err?.message || err);
    }
  }

  if (
    options.loadToken != null &&
    typeof sceneManager._isViewportLoadStale === 'function' &&
    sceneManager._isViewportLoadStale(options.loadToken)
  ) {
    console.log('[World] Discarding superseded world environment load');
    return resolved;
  }

  const propMeshes = [];
  for (const prop of resolved.props) {
    try {
      const gltf = await sceneManager.loadGLTF(prop.mesh_url);
      const root = gltf.scene || gltf;
      root.userData.worldPropId = prop.id;
      root.userData.worldPropRole = prop.role;
      root.userData.interaction = prop.interaction;
      applyWorldTransform(root, prop.transform);
      orientWorldPropFeetDown(root);
      sceneManager.propsRoot.add(root);
      propMeshes.push(root);
    } catch (err) {
      console.warn(`[World] Failed to load prop "${prop.id}":`, err?.message || err);
    }
  }

  sceneManager.worldPropMeshes = propMeshes;
  sceneManager.activeWorldId = resolved.id;
  sceneManager.activeWorldManifest = resolved;

  scaleWorldToHumanProportions(sceneManager, resolved.coordinate_system || 'y-up');

  if (resolved.spawn?.position && sceneManager.camera) {
    const [x, y, z] = resolved.spawn.position;
    sceneManager.camera.position.set(x, y + (resolved.spawn.player_height || 1.6), z + 2.5);
    if (sceneManager.controls?.target) {
      sceneManager.controls.target.set(x, y, z);
      sceneManager.controls.update?.();
    }
  }

  sceneManager.emit?.('worldLoaded', { manifest: resolved, propCount: propMeshes.length });
  console.log('[World] Environment ready:', {
    id: resolved.id,
    propCount: propMeshes.length,
  });
  return resolved;
}
