/**
 * Collect rig/skeleton bones from loaded GLB/FBX (UniRig, Mixamo, etc.).
 * SkinnedMesh bones often live only on skeleton.bones, not in scene graph traversal.
 */
import * as THREE from './three.js';

/**
 * @param {import('three').Object3D|null|undefined} root
 * @returns {import('three').Bone[]}
 */
export function collectModelBones(root) {
  if (!root) return [];

  /** @type {Map<string, import('three').Bone>} */
  const byUuid = new Map();

  const addBone = (bone) => {
    if (bone?.isBone && !byUuid.has(bone.uuid)) {
      byUuid.set(bone.uuid, bone);
    }
  };

  root.traverse((child) => {
    if (child.isBone) addBone(child);
    if (child.isSkinnedMesh && child.skeleton?.bones?.length) {
      child.skeleton.bones.forEach(addBone);
    }
  });

  return Array.from(byUuid.values());
}

/**
 * Merge multiple bone lists (unique by uuid).
 * @param {...import('three').Bone[]} boneLists
 * @returns {import('three').Bone[]}
 */
/**
 * @param {import('three').Object3D|null|undefined} root
 * @returns {number}
 */
export function countModelBones(root) {
  return collectModelBones(root).length;
}

export function mergeModelBones(...boneLists) {
  const byUuid = new Map();
  boneLists.flat().forEach((bone) => {
    if (bone?.isBone && !byUuid.has(bone.uuid)) {
      byUuid.set(bone.uuid, bone);
    }
  });
  return Array.from(byUuid.values());
}

/**
 * Collect bones from every scene in a parsed GLTF (armature may not be in default scene).
 * @param {import('three').Object3D} primaryScene
 * @param {import('three').Object3D[]} [allScenes]
 * @returns {import('three').Bone[]}
 */
export function collectRigBonesFromGltf(primaryScene, allScenes = []) {
  const scenes = allScenes.length > 0 ? allScenes : [primaryScene];
  return mergeModelBones(...scenes.map((s) => collectModelBones(s)));
}

/**
 * Build hierarchical bone tree for BoneStructurePanel.
 * @param {import('three').Bone[]} threeBones
 * @returns {Array<{ name: string, type: string, position: import('three').Vector3, rotation: import('three').Euler, scale: import('three').Vector3, parent: string|null, children: object[], level: number }>}
 */
/** @param {import('three').Object3D|null|undefined} root */
export function modelHasSkinnedMesh(root) {
  if (!root) return false;
  let found = false;
  root.traverse((child) => {
    if (child.isSkinnedMesh) found = true;
  });
  return found;
}

/** @param {import('three').Object3D|null|undefined} root */
export function findPrimarySkinnedMesh(root) {
  if (!root) return null;
  /** @type {import('three').SkinnedMesh|null} */
  let skinned = null;
  root.traverse((child) => {
    if (!skinned && child.isSkinnedMesh) skinned = child;
  });
  return skinned;
}

/**
 * @param {import('three').SkinnedMesh} skinned
 */
export function getSkinnedWorldBounds(skinned) {
  const box = new THREE.Box3();
  if (!skinned) return box;
  skinned.skeleton?.update();
  skinned.updateMatrixWorld(true);
  // Rest-pose geometry bounds + world matrix — computeBoundingBox() on SkinnedMesh
  // can inflate ~2× after root scale until bind() is refreshed (2026-06 AIGC avatars).
  if (skinned.geometry) {
    skinned.geometry.computeBoundingBox?.();
    const localBox = skinned.geometry.boundingBox;
    if (localBox && !localBox.isEmpty()) {
      box.copy(localBox).applyMatrix4(skinned.matrixWorld);
      return box;
    }
  }
  try {
    skinned.computeBoundingBox();
    if (skinned.boundingBox && !skinned.boundingBox.isEmpty()) {
      box.copy(skinned.boundingBox).applyMatrix4(skinned.matrixWorld);
    }
  } catch {
    /* ignore */
  }
  return box;
}

/** @param {import('three').Object3D|null|undefined} root */
export function getBoneWorldBounds(root) {
  const box = new THREE.Box3();
  if (!root) return box;
  const world = new THREE.Vector3();
  collectModelBones(root).forEach((bone) => {
    bone.getWorldPosition(world);
    box.expandByPoint(world);
  });
  return box;
}

/**
 * Layout bounds from visible meshes only — armature joints must not skew center/scale.
 * @param {import('three').Object3D|null|undefined} root
 */
export function getMeshLayoutBounds(root) {
  const box = new THREE.Box3();
  if (!root) return box;
  root.updateMatrixWorld(true);
  let found = false;
  const meshBox = new THREE.Box3();
  root.traverse((child) => {
    if (child.isBone) return;
    if (!child.isMesh && !child.isSkinnedMesh) return;
    if (child.isSkinnedMesh) {
      const skinnedBox = getSkinnedWorldBounds(child);
      if (!skinnedBox.isEmpty()) {
        box.union(skinnedBox);
        found = true;
        return;
      }
    }
    if (child.geometry) {
      child.geometry.computeBoundingBox?.();
      const localBox = child.geometry.boundingBox;
      if (localBox && !localBox.isEmpty()) {
        meshBox.copy(localBox).applyMatrix4(child.matrixWorld);
        box.union(meshBox);
        found = true;
        return;
      }
    }
    box.expandByObject(child);
    found = true;
  });
  if (!found) box.setFromObject(root);
  return box;
}

/**
 * Scale/center using mesh + armature span (UniRig GLBs often mismatch rest-pose mesh vs bones).
 * @param {import('three').Object3D|null|undefined} root
 */
export function getViewportLayoutBounds(root) {
  const meshBox = getMeshLayoutBounds(root);
  if (!root || countModelBones(root) === 0) return meshBox;
  const boneBox = getBoneWorldBounds(root);
  if (meshBox.isEmpty()) return boneBox;
  if (boneBox.isEmpty()) return meshBox;
  return meshBox.union(boneBox);
}

/**
 * @param {import('three').Object3D} object
 * @param {import('three').Vector3} worldDelta
 */
function applyWorldTranslation(object, worldDelta) {
  const worldPos = object.getWorldPosition(new THREE.Vector3());
  worldPos.add(worldDelta);
  if (object.parent) {
    object.parent.worldToLocal(worldPos);
  }
  object.position.copy(worldPos);
}

/** @param {import('three').Object3D|null|undefined} root */
function isRigFacingBackwards(root) {
  if (!root) return false;
  const hips = findHipsBone(root);
  const spine = findBoneByName(root, 'Spine2', 'Spine1', 'Spine', 'mixamorig:Spine2', 'mixamorig:Spine1');
  const left = findBoneByName(root, 'LeftShoulder', 'LeftArm', 'mixamorig:LeftShoulder', 'mixamorig:LeftArm');
  const right = findBoneByName(root, 'RightShoulder', 'RightArm', 'mixamorig:RightShoulder', 'mixamorig:RightArm');
  if (!hips || !spine || !left || !right) {
    return Boolean(root.userData?.autoRigMeta || root.userData?.fromAigc);
  }

  const hipsW = hips.getWorldPosition(new THREE.Vector3());
  const spineW = spine.getWorldPosition(new THREE.Vector3());
  const up = spineW.clone().sub(hipsW).normalize();
  const lw = left.getWorldPosition(new THREE.Vector3());
  const rw = right.getWorldPosition(new THREE.Vector3());
  const rightVec = rw.clone().sub(lw).normalize();
  const charForward = new THREE.Vector3().crossVectors(rightVec, up).normalize();
  return charForward.dot(new THREE.Vector3(0, 0, -1)) < 0;
}

/**
 * World bounds of skinned mesh after skeleton update (deformed vertices when available).
 * @param {import('three').SkinnedMesh} skinned
 */
export function getSkinnedDisplayWorldBounds(skinned) {
  const box = new THREE.Box3();
  if (!skinned) return box;
  skinned.skeleton?.update();
  skinned.updateMatrixWorld(true);
  try {
    skinned.computeBoundingBox();
    if (skinned.boundingBox && !skinned.boundingBox.isEmpty()) {
      return box.copy(skinned.boundingBox).applyMatrix4(skinned.matrixWorld);
    }
  } catch {
    /* fall through */
  }
  return getSkinnedWorldBounds(skinned);
}

/**
 * @param {import('three').Object3D|null|undefined} root
 * @returns {import('three').Vector3|null}
 */
function getRigFacingForward(root) {
  const hips = findHipsBone(root);
  const spine = findBoneByName(
    root,
    'Spine2',
    'Spine1',
    'Spine',
    'mixamorig:Spine2',
    'mixamorig:Spine1',
    'mixamorig:Spine',
  );
  const left = findBoneByName(
    root,
    'LeftShoulder',
    'LeftArm',
    'mixamorig:LeftShoulder',
    'mixamorig:LeftArm',
  );
  const right = findBoneByName(
    root,
    'RightShoulder',
    'RightArm',
    'mixamorig:RightShoulder',
    'mixamorig:RightArm',
  );
  if (!hips || !spine || !left || !right) return null;

  const hipsW = hips.getWorldPosition(new THREE.Vector3());
  const spineW = spine.getWorldPosition(new THREE.Vector3());
  const up = spineW.clone().sub(hipsW);
  if (up.lengthSq() < 1e-8) return null;
  up.normalize();
  const lw = left.getWorldPosition(new THREE.Vector3());
  const rw = right.getWorldPosition(new THREE.Vector3());
  const rightVec = rw.clone().sub(lw);
  if (rightVec.lengthSq() < 1e-8) return null;
  rightVec.normalize();
  const forward = new THREE.Vector3().crossVectors(rightVec, up).normalize();
  forward.y = 0;
  if (forward.lengthSq() < 1e-8) return null;
  return forward.normalize();
}

/**
 * UniRig/AIGC GLBs often ship a correct armature with a detached skinned mesh node
 * (mesh floating / yaw 180° while bones are on the floor). Adjust the mesh node only.
 * @param {import('three').Object3D|null|undefined} root
 * @returns {boolean}
 */
/**
 * UniRig GLBs often bake yaw/offset on the SkinnedMesh node while bones stay at origin.
 * Zero the node transform and rebind — bones must not move.
 * @param {import('three').SkinnedMesh} skinned
 * @param {import('three').Object3D} root
 */
function resetAigcSkinnedMeshNodeTransform(skinned, root) {
  const hadPosition = skinned.position.clone();
  const hadRotation = skinned.rotation.clone();
  const needsReset =
    skinned.position.lengthSq() > 1e-8 ||
    Math.abs(skinned.rotation.x) > 0.02 ||
    Math.abs(skinned.rotation.y) > 0.02 ||
    Math.abs(skinned.rotation.z) > 0.02 ||
    Math.abs(skinned.scale.x - 1) > 0.02 ||
    Math.abs(skinned.scale.y - 1) > 0.02 ||
    Math.abs(skinned.scale.z - 1) > 0.02;

  if (!needsReset) return null;

  skinned.position.set(0, 0, 0);
  skinned.rotation.set(0, 0, 0);
  skinned.scale.set(1, 1, 1);
  skinned.updateMatrixWorld(true);
  rebindSkinnedMeshes(root);
  return { position: hadPosition, rotation: hadRotation };
}

/**
 * Compare mesh front (bbox) vs rig forward around hips height.
 * @param {import('three').Box3} meshBox
 * @param {import('three').Vector3} hipsWorld
 * @param {import('three').Vector3} rigForward
 */
function isMeshFacingOppositeToRig(meshBox, hipsWorld, rigForward) {
  let bestDot = -Infinity;
  const probe = new THREE.Vector3();
  for (const x of [meshBox.min.x, meshBox.max.x]) {
    for (const z of [meshBox.min.z, meshBox.max.z]) {
      probe.set(x, hipsWorld.y, z);
      const dir = probe.clone().sub(hipsWorld);
      dir.y = 0;
      if (dir.lengthSq() < 1e-8) continue;
      dir.normalize();
      const dot = dir.dot(rigForward);
      if (dot > bestDot) bestDot = dot;
    }
  }
  return bestDot < -0.15;
}

export function alignSkinnedMeshToRig(root) {
  const skinned = findPrimarySkinnedMesh(root);
  if (!skinned) return false;

  root.updateMatrixWorld(true);
  skinned.skeleton?.update();

  const nodeReset = resetAigcSkinnedMeshNodeTransform(skinned, root);
  let changed = Boolean(nodeReset);

  const boneBox = getBoneWorldBounds(root);
  let meshBox = getSkinnedDisplayWorldBounds(skinned);
  if (boneBox.isEmpty() || meshBox.isEmpty()) return changed;

  const boneCenter = boneBox.getCenter(new THREE.Vector3());
  const meshCenter = meshBox.getCenter(new THREE.Vector3());
  const meshSize = meshBox.getSize(new THREE.Vector3());

  // Feet-to-feet vertical alignment (center match misses floating mesh exports).
  const feetDeltaY = boneBox.min.y - meshBox.min.y;
  const delta = new THREE.Vector3(
    boneCenter.x - meshCenter.x,
    feetDeltaY,
    boneCenter.z - meshCenter.z,
  );
  const shiftThreshold = Math.max(meshSize.y * 0.04, 0.03);

  if (Math.abs(delta.x) > shiftThreshold || Math.abs(delta.y) > shiftThreshold || Math.abs(delta.z) > shiftThreshold) {
    applyWorldTranslation(skinned, delta);
    changed = true;
    meshBox = getSkinnedDisplayWorldBounds(skinned);
  }

  const rigForward = getRigFacingForward(root);
  const hips = findHipsBone(root);
  if (rigForward && hips) {
    const hipsWorld = hips.getWorldPosition(new THREE.Vector3());
    if (isMeshFacingOppositeToRig(meshBox, hipsWorld, rigForward)) {
      skinned.rotateY(Math.PI);
      changed = true;
      meshBox = getSkinnedDisplayWorldBounds(skinned);
    }
  }

  if (changed) {
    rebindSkinnedMeshes(root);
    console.warn('[Rig] Aligned skinned mesh node to rig (bones unchanged)', {
      nodeReset,
      shift: { x: delta.x, y: delta.y, z: delta.z },
      boneCenter: { x: boneCenter.x, y: boneCenter.y, z: boneCenter.z },
      boneFeetY: boneBox.min.y,
      meshFeetY: meshBox.min.y,
      meshCenter: { x: meshBox.getCenter(new THREE.Vector3()).x, y: meshBox.getCenter(new THREE.Vector3()).y, z: meshBox.getCenter(new THREE.Vector3()).z },
    });
  }
  return changed;
}

/**
 * Move/rotate the skinned mesh node to match the armature — never translate bones
 * (that deforms skinned vertices off the floor).
 * @param {import('three').Object3D|null|undefined} root
 */
export function alignSkinnedMeshToArmature(root) {
  const skinned = findPrimarySkinnedMesh(root);
  const hips = findHipsBone(root);
  if (!skinned || !hips) return false;

  root.updateMatrixWorld(true);
  let meshBox = getSkinnedWorldBounds(skinned);
  if (meshBox.isEmpty()) meshBox = getMeshLayoutBounds(root);
  if (meshBox.isEmpty()) return false;

  const meshSize = meshBox.getSize(new THREE.Vector3());
  const hipsWorld = hips.getWorldPosition(new THREE.Vector3());
  const targetHipsY = meshBox.min.y + meshSize.y * 0.52;
  const shiftY = hipsWorld.y - targetHipsY;

  let changed = false;
  if (Math.abs(shiftY) > meshSize.y * 0.05) {
    applyWorldTranslation(skinned, new THREE.Vector3(0, shiftY, 0));
    changed = true;
  }

  let rotatedY = false;
  if (isRigFacingBackwards(root)) {
    skinned.rotateY(Math.PI);
    rotatedY = true;
    changed = true;
  }

  if (changed) {
    rebindSkinnedMeshes(root);
    console.log('[Rig] Aligned skinned mesh to armature (bones unchanged)', {
      shiftY,
      rotatedY: rotatedY ? Math.PI : 0,
    });
  }
  return changed;
}

/**
 * Rebind skinned meshes after root scale/position — otherwise bones drift above the mesh.
 * @param {import('three').Object3D|null|undefined} root
 * @returns {number} Skinned meshes rebound
 */
export function rebindSkinnedMeshes(root) {
  if (!root) return 0;
  root.updateMatrixWorld(true);
  let count = 0;
  root.traverse((child) => {
    if (!child.isSkinnedMesh || !child.skeleton) return;
    child.bind(child.skeleton, child.matrixWorld);
    child.skeleton.update();
    count += 1;
  });
  return count;
}

/**
 * @param {import('three').Object3D|null|undefined} root
 */
/**
 * @param {import('three').Object3D|null|undefined} root
 * @returns {import('three').Bone[]}
 */
export function getPrimarySkeletonBones(root) {
  if (!root) return [];
  /** @type {import('three').SkinnedMesh|null} */
  let skinned = null;
  root.traverse((child) => {
    if (!skinned && child.isSkinnedMesh && child.skeleton?.bones?.length) {
      skinned = child;
    }
  });
  if (skinned?.skeleton?.bones?.length) {
    return skinned.skeleton.bones;
  }
  return collectModelBones(root);
}

/** @param {import('three').Bone[]} bones */
function getArmatureRoots(bones) {
  const roots = new Set();
  bones.forEach((bone) => {
    let armRoot = bone;
    while (armRoot.parent?.isBone) armRoot = armRoot.parent;
    roots.add(armRoot);
  });
  return roots;
}

/** @param {import('three').Object3D|null|undefined} root */
export function findHipsBone(root) {
  return findBoneByName(root, 'Hips', 'hips', 'mixamorig:Hips', 'mixamorigHips', 'J_Bip_C_Hips');
}

/**
 * Prefer skeleton.bones over scene-graph search (avoids duplicate name mismatches).
 * @param {import('three').Object3D|null|undefined} root
 * @param {...string} names
 */
export function findBoneByName(root, ...names) {
  if (!root) return null;
  const lower = names.map((n) => n.toLowerCase());
  for (const bone of collectModelBones(root)) {
    const bn = bone.name?.toLowerCase?.() || '';
    if (lower.includes(bn)) return bone;
  }
  for (const name of names) {
    const bone = root.getObjectByName(name);
    if (bone?.isBone) return bone;
  }
  return null;
}

/**
 * When the textured mesh is not skinned, UniRig may leave a template armature offset/rotated.
 * @param {import('three').Object3D|null|undefined} root
 * @returns {boolean}
 */
export function alignDetachedArmatureToMesh(root) {
  if (!root || modelHasSkinnedMesh(root)) return false;

  const bones = collectModelBones(root);
  if (bones.length === 0) return false;

  const meshBox = getMeshLayoutBounds(root);
  if (meshBox.isEmpty()) return false;

  const boneBox = new THREE.Box3();
  const world = new THREE.Vector3();
  bones.forEach((bone) => {
    bone.getWorldPosition(world);
    boneBox.expandByPoint(world);
  });
  if (boneBox.isEmpty()) return false;

  const meshCenter = meshBox.getCenter(new THREE.Vector3());
  const boneCenter = boneBox.getCenter(new THREE.Vector3());
  const offset = meshCenter.clone().sub(boneCenter);
  if (offset.length() < 0.02) return false;

  const armatureRoots = getArmatureRoots(bones);

  const localMeshCenter = new THREE.Vector3();
  const localBoneCenter = new THREE.Vector3();
  armatureRoots.forEach((armRoot) => {
    const parent = armRoot.parent || root;
    parent.worldToLocal(localMeshCenter.copy(meshCenter));
    parent.worldToLocal(localBoneCenter.copy(boneCenter));
    armRoot.position.add(localMeshCenter.sub(localBoneCenter));
    armRoot.updateMatrixWorld(true);
  });

  const hips = findHipsBone(root);
  if (hips) {
    root.updateMatrixWorld(true);
    const meshForward = new THREE.Vector3();
    root.getWorldDirection(meshForward);
    const boneForward = new THREE.Vector3(0, 0, 1);
    hips.getWorldDirection(boneForward);
    if (meshForward.dot(boneForward) < 0) {
      let armRoot = hips;
      while (armRoot.parent?.isBone) armRoot = armRoot.parent;
      armRoot.rotateY(Math.PI);
      armRoot.updateMatrixWorld(true);
    }
  }

  console.log('[Rig] Aligned detached armature to mesh bounds', {
    offset: { x: offset.x, y: offset.y, z: offset.z },
    armatureRoots: armatureRoots.size,
  });
  return true;
}

/**
 * Skeleton overlay correction for skinned UniRig GLBs — adjusts visualization ONLY.
 * Never translate bones on skinned meshes (that deforms the mesh off the floor).
 * @param {import('three').Object3D|null|undefined} root
 */
export function updateSkeletonDisplayCorrection(root) {
  if (!root) return;

  delete root.userData.rigSkeletonDisplayOffset;
  delete root.userData.rigSkeletonDisplayFlipY;
  delete root.userData.rigSkeletonDisplayCenter;

  if (!modelHasSkinnedMesh(root)) return;

  const meshBox = getMeshLayoutBounds(root);
  const hips = findHipsBone(root);
  if (!hips || meshBox.isEmpty()) return;

  const meshSize = meshBox.getSize(new THREE.Vector3());
  const meshCenter = meshBox.getCenter(new THREE.Vector3());
  const hipsWorld = hips.getWorldPosition(new THREE.Vector3());
  const targetHipsY = meshBox.min.y + meshSize.y * 0.52;
  const dy = targetHipsY - hipsWorld.y;

  root.userData.rigSkeletonDisplayCenter = meshCenter.clone();
  if (Math.abs(dy) > meshSize.y * 0.08) {
    root.userData.rigSkeletonDisplayOffset = new THREE.Vector3(0, dy, 0);
  }

  if (isRigFacingBackwards(root)) {
    root.userData.rigSkeletonDisplayFlipY = true;
  }

  if (root.userData.rigSkeletonDisplayOffset || root.userData.rigSkeletonDisplayFlipY) {
    console.log('[Rig] Skeleton display correction (mesh unchanged)', {
      offsetY: root.userData.rigSkeletonDisplayOffset?.y ?? 0,
      flipY: Boolean(root.userData.rigSkeletonDisplayFlipY),
    });
  }
}

/**
 * @param {import('three').Bone} bone
 * @param {import('three').Object3D|null|undefined} modelRoot
 * @param {import('three').Vector3} [target]
 */
export function getBoneDisplayWorldPosition(bone, modelRoot, target = new THREE.Vector3()) {
  bone.getWorldPosition(target);
  if (!modelRoot) return target;

  const offset = modelRoot.userData?.rigSkeletonDisplayOffset;
  if (offset) target.add(offset);

  if (modelRoot.userData?.rigSkeletonDisplayFlipY) {
    const center = modelRoot.userData.rigSkeletonDisplayCenter;
    if (center) {
      target.sub(center);
      target.x = -target.x;
      target.z = -target.z;
      target.add(center);
    }
  }
  return target;
}

/**
 * @param {import('three').Object3D|null|undefined} root
 * @param {object} [options]
 */
export function normalizeRiggedModelTransforms(root, options = {}) {
  if (!root) return;

  const preserveExport =
    options.preserveExportedOrientation === true ||
    Boolean(root.userData?.preserveExportedOrientation);

  if (preserveExport) {
    rebindSkinnedMeshes(root);
    logRigAlignmentDiagnostics(root, options.label || 'viewport');
    return;
  }

  const trustApiExport =
    options.trustApiExport === true || Boolean(root.userData?.fromAigc);

  if (trustApiExport) {
    if (modelHasSkinnedMesh(root)) {
      alignSkinnedMeshToRig(root);
    }
  } else if (modelHasSkinnedMesh(root)) {
    alignSkinnedMeshToArmature(root);
    updateSkeletonDisplayCorrection(root);
  } else {
    alignDetachedArmatureToMesh(root);
    updateSkeletonDisplayCorrection(root);
  }

  rebindSkinnedMeshes(root);
  logRigAlignmentDiagnostics(root, options.label || 'viewport');
}

export function logRigAlignmentDiagnostics(root, label = 'rig') {
  if (!root || !modelHasSkinnedMesh(root)) return null;
  const meshBox = getMeshLayoutBounds(root);
  const boneBox = new THREE.Box3();
  const bones = collectModelBones(root);
  const world = new THREE.Vector3();
  bones.forEach((bone) => {
    bone.getWorldPosition(world);
    boneBox.expandByPoint(world);
  });
  const meshSize = meshBox.getSize(new THREE.Vector3());
  const boneSize = boneBox.getSize(new THREE.Vector3());
  const meshCenter = meshBox.getCenter(new THREE.Vector3());
  const boneCenter = boneBox.getCenter(new THREE.Vector3());
  const hips =
    root.getObjectByName('Hips') ||
    root.getObjectByName('hips') ||
    root.getObjectByName('mixamorig:Hips') ||
    null;
  const hipsWorld = hips ? hips.getWorldPosition(new THREE.Vector3()) : null;
  const offsetY = hipsWorld ? hipsWorld.y - meshCenter.y : boneCenter.y - meshCenter.y;
  const info = {
    label,
    boneCount: bones.length,
    meshCenter: { x: meshCenter.x, y: meshCenter.y, z: meshCenter.z },
    boneCenter: { x: boneCenter.x, y: boneCenter.y, z: boneCenter.z },
    meshSize: { x: meshSize.x, y: meshSize.y, z: meshSize.z },
    boneSize: { x: boneSize.x, y: boneSize.y, z: boneSize.z },
    hipsOffsetFromMeshCenterY: offsetY,
  };
  if (Math.abs(offsetY) > meshSize.y * 0.35) {
    console.warn('[Rig] Skeleton may be misaligned with mesh', info);
  } else {
    console.log('[Rig] Alignment check', info);
  }
  return info;
}

export function buildBoneStructureTree(threeBones) {
  const boneMap = new Map();

  threeBones.forEach((bone) => {
    const name = bone.name || 'Unnamed Bone';
    boneMap.set(name, {
      name,
      type: 'Bone',
      position: bone.position,
      rotation: bone.rotation,
      scale: bone.scale,
      parent: bone.parent?.isBone ? bone.parent.name : null,
      children: [],
      level: 0,
    });
  });

  const all = Array.from(boneMap.values());
  all.forEach((bone) => {
    if (bone.parent && boneMap.has(bone.parent)) {
      const parent = boneMap.get(bone.parent);
      parent.children.push(bone);
      bone.level = parent.level + 1;
    }
  });

  return all.filter((bone) => !bone.parent || !boneMap.has(bone.parent));
}
