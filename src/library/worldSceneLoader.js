/**
 * Load World Packages into SceneManager layer roots (world / props / player).
 */
import * as THREE from './three.js';
import {
  countModelBones,
  getViewportFloorAnchorBounds,
  modelHasSkinnedMesh,
} from './rigBoneUtils.js';
import {
  applySplatOrientationCorrection,
  disposeSplatMesh,
  loadSplatMesh,
} from './sparkSplatManager.js';
import {
  disposePointCloud,
  isAsciiPointCloudPlyHeader,
  loadPointCloudPly,
} from './pointCloudPlyLoader.js';
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
    if (sceneManager.worldEnvironmentSplat.userData?.isPointCloud) {
      disposePointCloud(sceneManager.worldEnvironmentSplat);
    } else {
      disposeSplatMesh(sceneManager.worldEnvironmentSplat);
    }
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
  if (sceneManager.worldEnvironmentMesh) {
    sceneManager.worldRoot.remove(sceneManager.worldEnvironmentMesh);
    sceneManager.worldEnvironmentMesh.traverse?.((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      }
    });
    sceneManager.worldEnvironmentMesh = null;
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
  sceneManager.worldEnvSplatVisible = true;
  sceneManager.worldEnvMeshVisible = false;
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
  if (Array.isArray(scale) && scale.length >= 3) {
    object.scale.set(
      Number(scale[0]) || 1,
      Number(scale[1]) || 1,
      Number(scale[2]) || 1,
    );
  } else if (scale && typeof scale === 'object') {
    object.scale.set(
      Number(scale.x ?? scale.sx ?? 1) || 1,
      Number(scale.y ?? scale.sy ?? 1) || 1,
      Number(scale.z ?? scale.sz ?? 1) || 1,
    );
  } else {
    object.scale.setScalar(Number(scale) || 1);
  }
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

const XR_FLOOR_WRAP_SKIP_NAMES = new Set([
  'viewportGridHelper',
  'viewportAxesHelper',
  'VRSkybox',
  'VRSceneWrapper',
  'ARSceneWrapper',
  'XRLocomotionRig',
]);

/** @param {THREE.Object3D|null|undefined} object */
export function shouldSkipXrFloorWrap(object) {
  if (!object) return true;
  if (object.isHelper) return true;
  if (XR_FLOOR_WRAP_SKIP_NAMES.has(object.name)) return true;
  return false;
}

/**
 * Floor bounds for XR anchoring — mesh soles for rigged/VRM avatars, not armature tails.
 * @param {THREE.Object3D|null|undefined} layerRoot
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @returns {THREE.Box3}
 */
function getXrFloorAnchorBoundsForLayer(layerRoot, sceneManager) {
  const empty = new THREE.Box3();
  if (!layerRoot) return empty;

  const model =
    layerRoot === sceneManager.playerRoot ? sceneManager.currentModel : null;

  if (
    model &&
    (model.userData?.vrm ||
      model.userData?.vrmNormalized ||
      modelHasSkinnedMesh(model) ||
      countModelBones(model) > 0)
  ) {
    const feetBox = getViewportFloorAnchorBounds(model, { meshFeetOnly: true });
    if (!feetBox.isEmpty()) return feetBox;
  }

  return getObjectFloorBounds(layerRoot);
}

/**
 * XR wrapper Y offset so the lowest scene content sits on reference-space floor (Y=0).
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @returns {number}
 */
export function computeXrFloorAlignmentY(sceneManager) {
  if (!sceneManager) return 0;

  const box = new THREE.Box3();
  let hasBounds = false;
  /** @type {{ label: string, minY: number, maxY: number }[]} */
  const sources = [];

  const includeBounds = (object, label) => {
    if (!object || shouldSkipXrFloorWrap(object)) return;
    const bounds = getXrFloorAnchorBoundsForLayer(object, sceneManager);
    if (bounds.isEmpty()) return;
    sources.push({ label, minY: bounds.min.y, maxY: bounds.max.y });
    if (!hasBounds) {
      box.copy(bounds);
      hasBounds = true;
    } else {
      box.union(bounds);
    }
  };

  for (const key of FLOOR_ANCHOR_LAYER_KEYS) {
    includeBounds(sceneManager[key], key);
  }

  if (!hasBounds && sceneManager.currentModel) {
    includeBounds(sceneManager.currentModel, 'currentModel');
  }

  if (!hasBounds) {
    sceneManager._lastXrFloorDiagnostics = null;
    return 0;
  }

  const floorAlignmentY = -box.min.y;
  sceneManager._lastXrFloorDiagnostics = {
    boundsMinY: box.min.y,
    boundsMaxY: box.max.y,
    floorAlignmentY,
    sources,
  };
  return floorAlignmentY;
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
 * Visible baked environment mesh (environment.mesh_url / environment_mesh.glb) for
 * bake preview and OMB inspection. Loaded alongside the Spark splat when present.
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {string} glbUrl
 * @param {object} [options]
 */
export async function loadWorldEnvironmentMesh(sceneManager, glbUrl, options = {}) {
  ensureSceneRoots(sceneManager);
  if (sceneManager.worldEnvironmentMesh) {
    sceneManager.worldRoot.remove(sceneManager.worldEnvironmentMesh);
    sceneManager.worldEnvironmentMesh.traverse?.((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      }
    });
    sceneManager.worldEnvironmentMesh = null;
  }
  const gltf = await sceneManager.loadGLTF(glbUrl);
  const root = gltf.scene || gltf;
  root.name = 'WorldEnvironmentMesh';
  root.userData.isWorldEnvironmentMesh = true;
  applyWorldTransform(root, options.transform);
  anchorObjectBottomToFloor(root);
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.visible = true;
    child.userData.isWorldEnvironmentMesh = true;
    child.castShadow = true;
    child.receiveShadow = true;
    // Photo-quality bakes export COLOR_0 vertex colors (no atlas).
    // Thin crust walls need double-side so inner faces aren't culled to black shards.
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (child.geometry?.attributes?.color) {
        mat.vertexColors = true;
      }
      mat.side = THREE.DoubleSide;
      mat.flatShading = false;
      mat.needsUpdate = true;
    }
  });
  sceneManager.worldRoot.add(root);
  sceneManager.worldEnvironmentMesh = root;
  sceneManager.emit?.('worldEnvironmentMeshLoaded', { url: glbUrl });
  console.log('[World] Environment mesh loaded:', glbUrl);
  return root;
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {'splat'|'mesh'} layer
 * @param {boolean} visible
 * @param {{ exclusive?: boolean }} [options] When exclusive and showing, hide the other layer.
 */
export function setWorldEnvironmentLayerVisible(sceneManager, layer, visible, options = {}) {
  if (!sceneManager) return getWorldEnvironmentLayerVisibility(sceneManager);
  const exclusive = options.exclusive !== false && visible;

  if (layer === 'splat') {
    if (sceneManager.worldEnvironmentSplat) {
      sceneManager.worldEnvironmentSplat.visible = Boolean(visible);
    }
    sceneManager.worldEnvSplatVisible = Boolean(visible);
    if (exclusive && sceneManager.worldEnvironmentMesh) {
      sceneManager.worldEnvironmentMesh.visible = false;
      sceneManager.worldEnvMeshVisible = false;
    }
  } else if (layer === 'mesh') {
    if (sceneManager.worldEnvironmentMesh) {
      sceneManager.worldEnvironmentMesh.visible = Boolean(visible);
    }
    sceneManager.worldEnvMeshVisible = Boolean(visible);
    if (exclusive && sceneManager.worldEnvironmentSplat) {
      sceneManager.worldEnvironmentSplat.visible = false;
      sceneManager.worldEnvSplatVisible = false;
    }
  }

  const state = getWorldEnvironmentLayerVisibility(sceneManager);
  sceneManager.emit?.('worldEnvironmentVisibilityChanged', state);
  return state;
}

/**
 * @param {import('./sceneManager.js').SceneManager|null|undefined} sceneManager
 */
export function getWorldEnvironmentLayerVisibility(sceneManager) {
  const hasSplat = Boolean(sceneManager?.worldEnvironmentSplat);
  const hasMesh = Boolean(sceneManager?.worldEnvironmentMesh);
  return {
    hasSplat,
    hasMesh,
    splatVisible: hasSplat ? Boolean(sceneManager.worldEnvironmentSplat.visible) : false,
    meshVisible: hasMesh ? Boolean(sceneManager.worldEnvironmentMesh.visible) : false,
  };
}

/**
 * Default: show 3DGS when present; hide baked GLB so they never both start visible.
 * Mesh-only packages (no splat URL loaded) keep the GLB visible.
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export function applyDefaultWorldEnvironmentVisibility(sceneManager) {
  const hasSplat = Boolean(sceneManager?.worldEnvironmentSplat);
  const hasMesh = Boolean(sceneManager?.worldEnvironmentMesh);
  if (hasSplat && hasMesh) {
    sceneManager.worldEnvironmentSplat.visible = true;
    sceneManager.worldEnvironmentMesh.visible = false;
    sceneManager.worldEnvSplatVisible = true;
    sceneManager.worldEnvMeshVisible = false;
  } else if (hasSplat) {
    sceneManager.worldEnvironmentSplat.visible = true;
    sceneManager.worldEnvSplatVisible = true;
  } else if (hasMesh) {
    sceneManager.worldEnvironmentMesh.visible = true;
    sceneManager.worldEnvMeshVisible = true;
  }
  const state = getWorldEnvironmentLayerVisibility(sceneManager);
  sceneManager.emit?.('worldEnvironmentVisibilityChanged', state);
  return state;
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {string} url
 * @param {object} [options]
 */
export async function loadWorldEnvironmentPointCloud(sceneManager, url, options = {}) {
  ensureSceneRoots(sceneManager);
  if (sceneManager.worldEnvironmentSplat) {
    if (sceneManager.worldEnvironmentSplat.userData?.isPointCloud) {
      disposePointCloud(sceneManager.worldEnvironmentSplat);
    } else {
      disposeSplatMesh(sceneManager.worldEnvironmentSplat);
    }
    sceneManager.worldRoot.remove(sceneManager.worldEnvironmentSplat);
    sceneManager.worldEnvironmentSplat = null;
  }

  const points = await loadPointCloudPly(url, { pointSize: options.pointSize ?? 0.025 });
  applyWorldTransform(points, options.transform);
  anchorObjectBottomToFloor(points);
  sceneManager.worldRoot.add(points);
  sceneManager.worldEnvironmentSplat = points;

  const worldId =
    options.worldId ||
    sceneManager.activeWorldId ||
    `points:${String(url).split('/').pop()?.split('?')[0] || 'env'}`;
  sceneManager.activeWorldId = worldId;
  sceneManager.activeWorldManifest =
    options.manifest ||
    sceneManager.activeWorldManifest || {
      id: worldId,
      name: options.worldName || worldId,
      environment: { url, type: 'point_cloud' },
      props: [],
    };

  sceneManager.emit?.('worldEnvironmentLoaded', {
    url,
    splat: points,
    pointCloud: points,
    manifest: sceneManager.activeWorldManifest,
  });
  if (options.emitWorldLoaded !== false) {
    sceneManager.emit?.('worldLoaded', {
      manifest: sceneManager.activeWorldManifest,
      propCount: sceneManager.worldPropMeshes?.length ?? 0,
      environmentOnly: true,
    });
  }
  return points;
}

/**
 * @param {import('./worldPackage.js').WorldPackage|Record<string, unknown>|null|undefined} manifest
 */
export function shouldLoadEnvironmentAsPointCloud(manifest) {
  const env = manifest?.environment || {};
  const meta = manifest?.metadata || {};
  const type = String(env.type || '').toLowerCase();
  const renderer = String(env.renderer || '').toLowerCase();
  const source = String(meta.source_geometry || '').toLowerCase();
  const pipeline = String(meta.pipeline || '').toLowerCase();
  const phase = String(meta.gaussian_phase || '').toLowerCase();

  // Explicit Gaussian / Spark worlds must NEVER go through the XYZRGB point parser
  // (wrong stride → points scattered across the scene).
  if (
    type === 'gaussian_splat' ||
    type === 'gaussian' ||
    renderer === 'spark' ||
    source.includes('gaussian') ||
    phase.startsWith('a_') ||
    phase.startsWith('b_')
  ) {
    return false;
  }

  if (type === 'point_cloud' || type === 'points' || renderer === 'points') return true;
  if (source === 'point_cloud') return true;
  // Legacy LingBot packages defaulted to point clouds before Phase A 3DGS.
  if (pipeline.includes('lingbot')) return true;
  return false;
}

/**
 * LingBot env-scan Gaussians are gravity-aligned Y-up — never TripoSplat X-flip.
 * Locked with Phase A/B orientation protection.
 * @param {import('./worldPackage.js').WorldPackage|Record<string, unknown>|null|undefined} manifest
 */
export function isLingbotGravityAlignedGaussian(manifest) {
  const meta = manifest?.metadata || {};
  const pipeline = String(meta.pipeline || '').toLowerCase();
  const source = String(meta.source_geometry || '').toLowerCase();
  const phase = String(meta.gaussian_phase || '').toLowerCase();
  const gravityMethod = String(meta.gravity_align?.method || '').toLowerCase();
  if (pipeline.includes('lingbot')) return true;
  if (source.includes('gaussian_from_point')) return true;
  if (source.includes('gaussian_gsplat')) return true;
  if (phase.startsWith('a_') || phase.startsWith('b_')) return true;
  if (gravityMethod.includes('floor_ransac') || gravityMethod.includes('x_mirror')) {
    return true;
  }
  return false;
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {string} url
 * @param {object} [options]
 */
export async function loadWorldEnvironmentSplat(sceneManager, url, options = {}) {
  ensureSceneRoots(sceneManager);
  if (sceneManager.worldEnvironmentSplat) {
    if (sceneManager.worldEnvironmentSplat.userData?.isPointCloud) {
      disposePointCloud(sceneManager.worldEnvironmentSplat);
    } else {
      disposeSplatMesh(sceneManager.worldEnvironmentSplat);
    }
    sceneManager.worldRoot.remove(sceneManager.worldEnvironmentSplat);
    sceneManager.worldEnvironmentSplat = null;
  }

  // LingBot / explicit point-cloud worlds — skip Spark (ASCII XYZRGB is not a splat).
  if (shouldLoadEnvironmentAsPointCloud(options.manifest) || options.forcePointCloud) {
    return loadWorldEnvironmentPointCloud(sceneManager, url, options);
  }

  try {
    // LingBot / gravity-aligned env-scan Gaussians are already Y-up — do not apply
    // TripoSplat's 180° X flip (that was scrambling Phase A world packages).
    const manifest = options.manifest || sceneManager.activeWorldManifest;
    const isLingbotGaussian = isLingbotGravityAlignedGaussian(manifest);
    const splatLoadOpts = {
      fromAigc: options.fromAigc !== false,
      orientationMode:
        options.orientationMode ?? (isLingbotGaussian ? 'none' : undefined),
    };
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
    // Gravity-aligned LingBot worlds already seat on Y=0 — do not re-lift from
    // floater bboxes (Phase B densify outliers would hoist the whole room).
    if (!isLingbotGaussian) {
      anchorObjectBottomToFloor(splat);
    }
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

    sceneManager.emit?.('worldEnvironmentLoaded', {
      url,
      splat,
      manifest: sceneManager.activeWorldManifest,
    });
    if (options.emitWorldLoaded !== false) {
      sceneManager.emit?.('worldLoaded', {
        manifest: sceneManager.activeWorldManifest,
        propCount: sceneManager.worldPropMeshes?.length ?? 0,
        environmentOnly: true,
      });
    }
    return splat;
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/ascii|unsupported ply format/i.test(msg)) {
      console.warn('[World] Splat loader rejected PLY; falling back to point cloud:', msg);
      return loadWorldEnvironmentPointCloud(sceneManager, url, options);
    }
    // Peek header for ASCII point clouds when Spark throws something else
    try {
      const headRes = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
      const head = await headRes.text();
      if (isAsciiPointCloudPlyHeader(head)) {
        console.warn('[World] Detected ASCII point-cloud PLY; loading as Points');
        return loadWorldEnvironmentPointCloud(sceneManager, url, options);
      }
    } catch {
      /* ignore probe errors */
    }
    throw err;
  }
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
  const asPoints = shouldLoadEnvironmentAsPointCloud(resolved);
  console.log(
    asPoints ? '[World] Loading environment point cloud:' : '[World] Loading environment splat:',
    resolved.environment.url,
  );

  await loadWorldEnvironmentSplat(sceneManager, resolved.environment.url, {
    fromAigc: true,
    transform: resolved.environment.transform,
    coordinateSystem: resolved.coordinate_system || 'y-up',
    worldId: resolved.id,
    worldName: resolved.name,
    manifest: resolved,
    forcePointCloud: asPoints,
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

  const envMeshUrl = resolved.environment?.mesh_url || null;
  if (envMeshUrl && envMeshUrl !== colliderUrl) {
    try {
      await loadWorldEnvironmentMesh(sceneManager, envMeshUrl, {
        transform: resolved.environment.transform,
      });
    } catch (err) {
      console.warn('[World] Environment mesh failed:', err?.message || err);
    }
  }

  applyDefaultWorldEnvironmentVisibility(sceneManager);

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
