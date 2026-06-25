import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { countModelBones } from './rigBoneUtils.js';

const INTERNAL_USER_DATA_KEYS = [
  'collectedRigBones',
  'autoRigMeta',
  'preserveExportedOrientation',
  'fromAigc',
  'vrmNormalized',
];

/**
 * True when the model is an actual VRM (not a plain rigged GLB/FBX).
 */
export function modelHasVrmRoot(root) {
  if (!root) return false;
  if (root.userData?.vrm) return true;
  let found = false;
  root.traverse((child) => {
    if (child.userData?.vrm) found = true;
  });
  return found;
}

export function modelNeedsSkeletonClone(root) {
  if (!root) return false;
  if (countModelBones(root) > 0) return true;
  let skinned = false;
  root.traverse((child) => {
    if (child.isSkinnedMesh) skinned = true;
  });
  return skinned;
}

/**
 * Clone for GLTF export without breaking skin/bone links (plain .clone() corrupts rigs).
 */
export function cloneModelForGltfExport(model) {
  const circularRefs = new Map();
  model.traverse((child) => {
    if (child.userData?.vrm) {
      circularRefs.set(child, child.userData.vrm);
      delete child.userData.vrm;
    }
  });

  try {
    const clone = modelNeedsSkeletonClone(model)
      ? SkeletonUtils.clone(model)
      : model.clone();
    sanitizeForGltfExport(clone);
    return clone;
  } finally {
    circularRefs.forEach((vrm, child) => {
      if (child.userData) child.userData.vrm = vrm;
    });
  }
}

/**
 * Avoid invalid skins: mesh-only geometry must not keep skinIndex/skinWeight attributes.
 */
export function stripOrphanSkinAttributes(root) {
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry || child.isSkinnedMesh) return;
    const { skinIndex, skinWeight } = child.geometry.attributes;
    if (!skinIndex && !skinWeight) return;

    const geometry = child.geometry.clone();
    delete geometry.attributes.skinIndex;
    delete geometry.attributes.skinWeight;
    child.geometry = geometry;
  });
}

export function stripInternalExportUserData(root) {
  root.traverse((child) => {
    if (!child.userData) return;
    for (const key of INTERNAL_USER_DATA_KEYS) {
      delete child.userData[key];
    }
    if (!modelHasVrmRoot(root)) {
      delete child.userData.extensions;
      delete child.userData.vrmBone;
      delete child.userData.exportSource;
    }
  });
}

export function sanitizeForGltfExport(root) {
  stripOrphanSkinAttributes(root);
  stripInternalExportUserData(root);
  root.updateMatrixWorld(true);
}
