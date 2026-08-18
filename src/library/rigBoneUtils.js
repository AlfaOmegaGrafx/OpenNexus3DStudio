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
  let best = null;
  let bestVerts = -1;
  let bestBody = null;
  root.traverse((child) => {
    if (!child.isSkinnedMesh) return;
    const name = (child.name || '').toLowerCase();
    const verts = child.geometry?.attributes?.position?.count ?? 0;
    if (name.includes('body') && !name.includes('eyebrow')) {
      if (!bestBody || verts >= (bestBody.geometry?.attributes?.position?.count ?? 0)) {
        bestBody = child;
      }
      return;
    }
    if (verts > bestVerts) {
      bestVerts = verts;
      best = child;
    }
  });
  return bestBody ?? best;
}

/**
 * Fixed world-space skeleton joint sphere radius.
 * Calibrated to VRM eyeball scale (not derived per upload).
 */
export const SKELETON_JOINT_SPHERE_RADIUS = 0.012;

/** @returns {number} */
export function getSkeletonJointSphereRadius() {
  return SKELETON_JOINT_SPHERE_RADIUS;
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


/** Template VRM rig from DGX (avatar-from-image). */
export function isTemplateRigExport(root) {
  if (!root) return false;
  const rigInfo = root.userData?.autoRigMeta?.rig_info;
  return (
    rigInfo?.rig_mode === 'template' ||
    rigInfo?.rig_type === 'humanoid_template' ||
    rigInfo?.generation_method === 'humanoid_vrm_template'
  );
}

/**
 * Phase 5 template_wrap / head stitch: multiple skinned meshes (body + morph head)
 * share one armature. Moving only the primary mesh detaches the head.
 * @param {import('three').Object3D|null|undefined} root
 */
export function isHumanoidTemplateWrapExport(root) {
  if (!root) return false;
  const rigInfo = root.userData?.autoRigMeta?.rig_info;
  if (!rigInfo) return false;
  if (rigInfo.rig_mode === 'template_wrap') return true;
  if (rigInfo.wrap_status === 'head_stitch') return true;
  if (rigInfo.validation?.wrap_status === 'head_stitch') return true;
  if (rigInfo.generation_method === 'humanoid_vrm_template' && rigInfo.rig_mode === 'template_wrap') {
    return true;
  }
  return false;
}

/**
 * Clothing / accessory fit onto appearance_base — mesh is only a slot fragment
 * (helmet, pendant, gloves) while the armature is full-body. Full-body feet/hips
 * repair and skeleton display squash destroy that bind.
 * @param {import('three').Object3D|null|undefined} root
 */
export function isAppearanceComponentRigExport(root) {
  if (!root) return false;
  const rigInfo = root.userData?.autoRigMeta?.rig_info;
  if (!rigInfo) return false;
  if (rigInfo.rig_mode === 'appearance_component') return true;
  if (rigInfo.rig_type === 'appearance_component') return true;
  if (rigInfo.generation_method === 'appearance_component_vrm_fit') return true;
  return false;
}

/**
 * Count skinned meshes (head stitch = body + AvatarHead + …).
 * @param {import('three').Object3D|null|undefined} root
 */
export function countSkinnedMeshes(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((child) => {
    if (child.isSkinnedMesh) n += 1;
  });
  return n;
}

/**
 * SkinTokens TokenRig CLI / skintokens_auto_rig export (bone_0…bone_N).
 * @param {import('three').Object3D|null|undefined} root
 * @param {{ rig_info?: object, generation_info?: object }} [options]
 */
export function isSkinTokensRigExport(root, options = {}) {
  const rigInfo = options.rig_info ?? root?.userData?.autoRigMeta?.rig_info;
  const method = rigInfo?.generation_method ?? rigInfo?.generationMethod ?? '';
  if (method === 'skintokens_tokenrig_cli') return true;
  const genModel =
    options.generation_info?.model ??
    root?.userData?.autoRigMeta?.generation_info?.model;
  if (genModel === 'skintokens_auto_rig') return true;
  if (root?.userData?.skintokensRig) return true;
  if (!root) return false;
  // Indexed humanoid topology without metadata
  return Boolean(findBoneByName(root, 'bone_0') && findBoneByName(root, 'bone_25'));
}

/**
 * Tag SkinTokens metadata so load/playback paths skip VRM0 axis hacks.
 * @param {import('three').Object3D|null|undefined} model
 * @param {object|null|undefined} autoRigMeta
 * @returns {boolean}
 */
export function applySkinTokensRigMetadata(model, autoRigMeta) {
  if (!model) return false;
  if (autoRigMeta) {
    model.userData.autoRigMeta = autoRigMeta;
  }
  if (!isSkinTokensRigExport(model, { rig_info: autoRigMeta?.rig_info, generation_info: autoRigMeta?.generation_info })) {
    return false;
  }
  model.userData.skintokensRig = true;
  return true;
}

/**
 * Yaw SkinTokens root 180° when character forward faces +Z (away from glTF camera).
 * @param {import('three').Object3D|null|undefined} root
 * @returns {boolean}
 */
export function ensureSkinTokensRootFacesCamera(root) {
  if (!root || !isSkinTokensRigExport(root)) return false;

  const hips = findBoneByName(root, 'bone_0') || findHipsBone(root);
  const spine =
    findBoneByName(root, 'bone_3', 'bone_2', 'bone_1') ||
    findBoneByName(root, 'Spine2', 'Spine1', 'Spine');
  const left = findBoneByName(root, 'bone_25', 'bone_26') || findBoneByName(root, 'LeftShoulder', 'LeftArm');
  const right = findBoneByName(root, 'bone_6', 'bone_7') || findBoneByName(root, 'RightShoulder', 'RightArm');
  if (!hips || !spine || !left || !right) return false;

  root.updateMatrixWorld(true);
  const hipsW = hips.getWorldPosition(new THREE.Vector3());
  const spineW = spine.getWorldPosition(new THREE.Vector3());
  const leftW = left.getWorldPosition(new THREE.Vector3());
  const rightW = right.getWorldPosition(new THREE.Vector3());

  const up = spineW.clone().sub(hipsW);
  if (up.lengthSq() < 1e-8) return false;
  const rightVec = rightW.clone().sub(leftW);
  if (rightVec.lengthSq() < 1e-8) return false;
  const charForward = new THREE.Vector3().crossVectors(rightVec.normalize(), up.normalize());
  if (charForward.lengthSq() < 1e-8) return false;
  charForward.normalize();

  const gltfForward = new THREE.Vector3(0, 0, -1);
  if (charForward.dot(gltfForward) >= 0) return false;

  // Prefer Euler yaw so callers/tests reading rotation.y stay in sync.
  root.rotation.y += Math.PI;
  root.updateMatrixWorld(true);
  rebindSkinnedMeshes(root);
  delete root.userData.rigSkeletonDisplayFlipY;
  console.warn('[Rig] SkinTokens root yawed 180° to face glTF -Z');
  return true;
}

/** Mesh2Motion creature / fox template rig from DGX auto-rig. */
export function isCreatureTemplateRigExport(root) {
  if (!root) return false;
  const rigInfo = root.userData?.autoRigMeta?.rig_info;
  if (
    rigInfo?.rig_mode === 'creature_template' ||
    rigInfo?.rig_type === 'creature_template' ||
    rigInfo?.generation_method === 'mesh2motion_creature_template'
  ) {
    return true;
  }
  // Bone-name fallback when metadata was stripped
  return Boolean(
    findBoneByName(root, 'Front_Leg_Foot_L') && findBoneByName(root, 'Back_Leg_Foot_L'),
  );
}

/** Mesh2Motion quadruped forward in XZ (nose − hips / front − back paws). */
export function getQuadrupedFacingForward(root) {
  const hips = findHipsBone(root);
  const frontL = findBoneByName(root, 'Front_Leg_Foot_L');
  const frontR = findBoneByName(root, 'Front_Leg_Foot_R');
  const backL = findBoneByName(root, 'Back_Leg_Foot_L');
  const backR = findBoneByName(root, 'Back_Leg_Foot_R');

  const world = new THREE.Vector3();
  const frontPts = [];
  const backPts = [];
  for (const bone of [frontL, frontR]) {
    if (bone) frontPts.push(bone.getWorldPosition(world.clone()));
  }
  for (const bone of [backL, backR]) {
    if (bone) backPts.push(bone.getWorldPosition(world.clone()));
  }

  if (frontPts.length && backPts.length) {
    const front = frontPts
      .reduce((acc, p) => acc.add(p), new THREE.Vector3())
      .multiplyScalar(1 / frontPts.length);
    const back = backPts
      .reduce((acc, p) => acc.add(p), new THREE.Vector3())
      .multiplyScalar(1 / backPts.length);
    const forward = front.clone().sub(back);
    forward.y = 0;
    if (forward.lengthSq() > 1e-8) return forward.normalize();
  }

  const head = findBoneByName(root, 'Head', 'head');
  if (!hips || !head) return null;

  const hipsW = hips.getWorldPosition(new THREE.Vector3());
  const headW = head.getWorldPosition(new THREE.Vector3());
  const forward = headW.clone().sub(hipsW);
  forward.y = 0;
  if (forward.lengthSq() < 1e-8) return null;
  return forward.normalize();
}

/**
 * Mesh2Motion clips are authored +Z-forward. Fitted fox GLBs often face glTF -Z;
 * yaw root 180° so mesh + bones match the animation space (and the default camera).
 * @returns {boolean}
 */
export function ensureCreatureTemplateFacesForward(root) {
  if (!isCreatureTemplateRigExport(root)) return false;
  if (root.userData?.creatureFacingCorrected) return false;
  const forward = getQuadrupedFacingForward(root);
  if (!forward) return false;
  // Already Mesh2Motion / camera forward (+Z)
  if (forward.dot(new THREE.Vector3(0, 0, 1)) >= 0) {
    root.userData.creatureFacingCorrected = true;
    return false;
  }
  root.rotateY(Math.PI);
  root.updateMatrixWorld(true);
  // Yaw rebind is safe (unlike root Y translation rebind); keeps skin bind coherent.
  rebindSkinnedMeshes(root);
  delete root.userData.rigSkeletonDisplayFlipY;
  root.userData.creatureFacingCorrected = true;
  console.warn('[Rig] Creature template rig yawed 180° to face Mesh2Motion +Z');
  return true;
}

/**
 * Bounds for floor anchoring — mesh feet for skinned template rigs (bone joints can sit
 * above the sole); union layout for other AIGC rigged exports.
 * @param {import('three').Object3D|null|undefined} root
 * @param {{ meshFeetOnly?: boolean }} [options]
 */
export function getViewportFloorAnchorBounds(root, options = {}) {
  const empty = new THREE.Box3();
  if (!root) return empty;

  const skinned = findPrimarySkinnedMesh(root);
  if (options.meshFeetOnly && skinned) {
    const deformed = getSkinnedDisplayWorldBounds(skinned);
    if (!deformed.isEmpty()) return deformed;
    const meshBox = getMeshLayoutBounds(root);
    if (!meshBox.isEmpty()) return meshBox;
  }

  if (
    (root.userData?.preserveExportedOrientation || isTemplateRigExport(root)) &&
    skinned
  ) {
    const deformed = getSkinnedDisplayWorldBounds(skinned);
    const boneBox = getBoneWorldBounds(root);
    if (!deformed.isEmpty()) {
      if (!boneBox.isEmpty()) {
        return deformed.clone().union(boneBox);
      }
      return deformed;
    }
    const meshBox = getMeshLayoutBounds(root);
    if (!meshBox.isEmpty()) return meshBox;
  }

  if (
    (root.userData?.fromAigc || root.userData?.preserveExportedOrientation) &&
    (modelHasSkinnedMesh(root) || countModelBones(root) > 0)
  ) {
    const layout = getViewportLayoutBounds(root);
    if (!layout.isEmpty()) return layout;
  }

  return getMeshLayoutBounds(root);
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
 * Horizontal center at foot height for mesh vs rig alignment.
 * @param {import('three').Box3} meshBox
 * @param {import('three').Object3D|null|undefined} root
 */
function getMeshFootCenter(meshBox, target = new THREE.Vector3()) {
  target.set(
    (meshBox.min.x + meshBox.max.x) * 0.5,
    meshBox.min.y,
    (meshBox.min.z + meshBox.max.z) * 0.5,
  );
  return target;
}

/** Mesh2Motion quadruped contact bones (paws + tips). */
const CREATURE_PAW_BONE_NAMES = [
  'Front_Leg_Foot_L',
  'Front_Leg_Foot_R',
  'Back_Leg_Foot_L',
  'Back_Leg_Foot_R',
  'Front_Leg_Tip_L',
  'Front_Leg_Tip_R',
  'Back_Leg_Tip_L',
  'Back_Leg_Tip_R',
];

/**
 * Lowest world Y among creature paw / tip bones (null if not a paw rig).
 * @param {import('three').Object3D|null|undefined} root
 * @returns {number|null}
 */
export function getCreaturePawWorldMinY(root) {
  if (!root) return null;
  let minY = Infinity;
  const world = new THREE.Vector3();
  for (const name of CREATURE_PAW_BONE_NAMES) {
    const bone = findBoneByName(root, name);
    if (!bone) continue;
    bone.getWorldPosition(world);
    if (world.y < minY) minY = world.y;
  }
  return Number.isFinite(minY) ? minY : null;
}

/**
 * Horizontal center at paw height for Mesh2Motion creature templates.
 * @param {import('three').Object3D|null|undefined} root
 * @param {import('three').Vector3} [target]
 * @returns {import('three').Vector3|null}
 */
function getCreaturePawFootCenter(root, target = new THREE.Vector3()) {
  if (!root || !isCreatureTemplateRigExport(root)) return null;
  const paws = [];
  const world = new THREE.Vector3();
  for (const name of [
    'Front_Leg_Foot_L',
    'Front_Leg_Foot_R',
    'Back_Leg_Foot_L',
    'Back_Leg_Foot_R',
  ]) {
    const bone = findBoneByName(root, name);
    if (!bone) continue;
    paws.push(bone.getWorldPosition(world.clone()));
  }
  if (!paws.length) return null;
  const sum = paws.reduce((acc, p) => acc.add(p), new THREE.Vector3());
  sum.multiplyScalar(1 / paws.length);
  const tipY = getCreaturePawWorldMinY(root);
  return target.set(sum.x, tipY != null ? tipY : sum.y, sum.z);
}

/**
 * @param {import('three').Object3D|null|undefined} root
 * @param {import('three').Vector3} [target]
 */
function getRigFootCenter(root, target = new THREE.Vector3()) {
  const creatureFoot = getCreaturePawFootCenter(root, target);
  if (creatureFoot) return creatureFoot;

  const left = findBoneByName(
    root,
    'LeftFoot',
    'mixamorig:LeftFoot',
    'LeftAnkle',
    'mixamorig:LeftAnkle',
    'LeftToeBase',
    'mixamorig:LeftToeBase',
  );
  const right = findBoneByName(
    root,
    'RightFoot',
    'mixamorig:RightFoot',
    'RightAnkle',
    'mixamorig:RightAnkle',
    'RightToeBase',
    'mixamorig:RightToeBase',
  );
  if (left && right) {
    const lw = left.getWorldPosition(new THREE.Vector3());
    const rw = right.getWorldPosition(new THREE.Vector3());
    return target.set(
      (lw.x + rw.x) * 0.5,
      Math.min(lw.y, rw.y),
      (lw.z + rw.z) * 0.5,
    );
  }
  const boneBox = getBoneWorldBounds(root);
  const center = boneBox.getCenter(new THREE.Vector3());
  return target.set(center.x, boneBox.min.y, center.z);
}

/**
 * Whether a preserved AIGC export still needs skinned-mesh node repair.
 * @param {import('three').Object3D|null|undefined} root
 */
export function needsSkinnedMeshRigRepair(root) {
  if (!root || !modelHasSkinnedMesh(root)) return false;
  if (root.userData?.vrm || root.userData?.vrmNormalized) return false;
  // Creature template exports are already mesh↔bone aligned; humanoid foot repair
  // mis-reads paw tips as "belly" and sinks the model through the floor.
  if (isCreatureTemplateRigExport(root)) return false;

  // Slot garments sit at head/chest/hands while bones span the full avatar —
  // feet-to-feet repair would yank the mesh to the floor (helmet/pendant bug).
  if (isAppearanceComponentRigExport(root)) return false;

  // Phase 5 head stitch: body + morph head share one skin. Primary-mesh-only
  // repair leaves the head floating above the body (exactly the Studio bug).
  if (isHumanoidTemplateWrapExport(root) || countSkinnedMeshes(root) > 1) {
    return false;
  }

  const skinTokens = isSkinTokensRigExport(root);
  const contract = root.userData?.aigcRigContract;

  // SkinTokens: naming-only contract fails (e.g. missing_hips_bone) must not force repair
  // when mesh↔skeleton already align — check geometry below instead.
  if (contract?.status === 'fail' && !skinTokens) return true;

  if (root.userData?.autoRigMeta?.rig_info?.validation?.passed === false) {
    return true;
  }

  if (!skinTokens && (root.userData?.avatarFromImage || isTemplateRigExport(root))) {
    return true;
  }

  // Contract "pass" still falls through to feet/node geometry checks below.

  const skinned = findPrimarySkinnedMesh(root);
  if (!skinned) return false;

  root.updateMatrixWorld(true);
  skinned.skeleton?.update();

  const needsNodeReset =
    skinned.position.lengthSq() > 1e-6 ||
    Math.abs(skinned.rotation.x) > 0.02 ||
    Math.abs(skinned.rotation.y) > 0.02 ||
    Math.abs(skinned.rotation.z) > 0.02 ||
    Math.abs(skinned.scale.x - 1) > 0.02 ||
    Math.abs(skinned.scale.y - 1) > 0.02 ||
    Math.abs(skinned.scale.z - 1) > 0.02;
  if (needsNodeReset) return true;

  const meshBox = getSkinnedDisplayWorldBounds(skinned);
  const boneBox = getBoneWorldBounds(root);
  if (meshBox.isEmpty() || boneBox.isEmpty()) return false;

  const meshSize = meshBox.getSize(new THREE.Vector3());
  const feetDelta = Math.abs(boneBox.min.y - meshBox.min.y);
  const feetThreshold = Math.max(meshSize.y * 0.03, 0.015);
  if (feetDelta > feetThreshold) return true;

  const meshFoot = getMeshFootCenter(meshBox);
  const rigFoot = getRigFootCenter(root);
  const xzDelta = Math.hypot(rigFoot.x - meshFoot.x, rigFoot.z - meshFoot.z);
  const xzThreshold = Math.max(Math.max(meshSize.x, meshSize.z) * 0.04, 0.02);
  if (xzDelta > xzThreshold) return true;

  return false;
}

/**
 * Snap model root so mesh feet sit on y=0 (handles above and below floor).
 * @param {import('three').Object3D|null|undefined} root
 * @returns {number} Vertical shift applied to root.position.y
 */
export function anchorModelFeetToFloor(root) {
  if (!root) return 0;
  root.updateMatrixWorld(true);
  const box = getViewportFloorAnchorBounds(root, { meshFeetOnly: true });
  if (box.isEmpty() || !isFinite(box.min.y)) return 0;
  // Prefer the lower of skinned mesh soles and creature paw tips so quadrupeds
  // do not use belly AABB as "feet" and sink through Y=0.
  let footY = box.min.y;
  if (isCreatureTemplateRigExport(root)) {
    const pawY = getCreaturePawWorldMinY(root);
    if (pawY != null && isFinite(pawY)) {
      footY = Math.min(footY, pawY);
    }
  }
  const shift = -footY;
  if (Math.abs(shift) < 0.001) return 0;
  // Translate the shared root only. Do NOT rebind after a root Y lift —
  // rebind rebakes bind matrices and double-applies the shift to skinned
  // vertices while bones stay put (mesh floats, skeleton sunk).
  root.position.y += shift;
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (child.isSkinnedMesh) child.skeleton?.update();
  });
  return shift;
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

  // Never peel a morph head off the body by transforming only geometry_0.
  if (isHumanoidTemplateWrapExport(root) || countSkinnedMeshes(root) > 1) {
    return false;
  }
  // Partial slot mesh vs full armature — do not feet-align.
  if (isAppearanceComponentRigExport(root)) {
    return false;
  }

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

  // Feet-to-feet vertical alignment; foot centers for horizontal (torso center can miss ankles).
  const feetDeltaY = boneBox.min.y - meshBox.min.y;
  const meshFoot = getMeshFootCenter(meshBox);
  const rigFoot = getRigFootCenter(root);
  const delta = new THREE.Vector3(
    rigFoot.x - meshFoot.x,
    feetDeltaY,
    rigFoot.z - meshFoot.z,
  );
  const shiftThreshold = Math.max(meshSize.y * 0.02, 0.012);

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
 * Log per-mesh skin bind info for VRM0 multi-skin uploads (remote-log diagnosis).
 * @param {import('three').Object3D|null|undefined} root
 * @param {number} [reboundCount]
 */
export function logVrmMultiSkinLayout(root, reboundCount = 0) {
  if (!root) return;
  /** @type {{ name: string, bones: number, hipsUuid: string|null }[]} */
  const meshes = [];
  const hipsUuids = new Set();
  root.traverse((child) => {
    if (!child.isSkinnedMesh) return;
    const hipsBone = child.skeleton?.bones?.find((b) => /^hips$/i.test(b.name || ''));
    const hipsUuid = hipsBone?.uuid ?? null;
    if (hipsUuid) hipsUuids.add(hipsUuid);
    meshes.push({
      name: child.name || '(unnamed)',
      bones: child.skeleton?.bones?.length ?? 0,
      hipsUuid,
    });
  });
  console.log('[VRM] Multi-skin layout after normalize', {
    skinnedMeshes: meshes.length,
    reboundCount,
    sharedHipsBone: hipsUuids.size <= 1,
    hipsUuidCount: hipsUuids.size,
    meshes,
  });
}

/**
 * @param {import('three').Object3D|null|undefined} root
 */
/**
 * @param {import('three').Object3D|null|undefined} root
 * @returns {import('three').Bone[]}
 */
export function getPrimarySkeletonBones(root) {
  const skinned = findPrimarySkinnedMesh(root);
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
  if (root.userData?.vrm || root.userData?.vrmNormalized) return;
  // Creatures: Mesh2Motion facing is corrected on the root; never viz-only flip.
  if (isCreatureTemplateRigExport(root)) return;
  // Head-stitch / multi-mesh: overlay must match real bind (no viz-only yaw).
  if (isHumanoidTemplateWrapExport(root) || countSkinnedMeshes(root) > 1) return;
  // Helmet/pendant: hips-at-52%-of-mesh squash compresses the full skeleton
  // into the accessory AABB (Bones overlay looks "inside" the helmet).
  if (isAppearanceComponentRigExport(root)) return;

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

  // Uploaded VRM: never apply AIGC skeleton display offsets (viz must match skin bind).
  if (modelRoot.userData?.vrm || modelRoot.userData?.vrmNormalized) {
    return target;
  }

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

  if (root.userData?.vrm || root.userData?.vrmBindPassthrough) {
    return;
  }

  const preserveExport =
    options.preserveExportedOrientation === true ||
    Boolean(root.userData?.preserveExportedOrientation);

  // Mesh2Motion creature templates: never translate the skinned mesh node or
  // rebind after root floor snap — that desyncs mesh from the armature.
  if (isCreatureTemplateRigExport(root)) {
    ensureCreatureTemplateFacesForward(root);
    anchorModelFeetToFloor(root);
    logRigAlignmentDiagnostics(root, options.label || 'viewport');
    return;
  }

  // Appearance slot garments: keep Blender bind; floor by bone soles so a
  // chest/helmet fragment does not sink to y=0 away from the armature.
  if (isAppearanceComponentRigExport(root)) {
    root.updateMatrixWorld(true);
    const boneBox = getBoneWorldBounds(root);
    if (!boneBox.isEmpty() && isFinite(boneBox.min.y)) {
      const shift = -boneBox.min.y;
      if (Math.abs(shift) > 0.001) {
        root.position.y += shift;
        root.updateMatrixWorld(true);
      }
    }
    logRigAlignmentDiagnostics(root, options.label || 'viewport');
    return;
  }

  if (preserveExport) {
    ensureCreatureTemplateFacesForward(root);
    if (needsSkinnedMeshRigRepair(root)) {
      alignSkinnedMeshToRig(root);
      rebindSkinnedMeshes(root);
      updateSkeletonDisplayCorrection(root);
    }
    anchorModelFeetToFloor(root);
    logRigAlignmentDiagnostics(root, options.label || 'viewport');
    return;
  }

  const trustApiExport =
    options.trustApiExport === true || Boolean(root.userData?.fromAigc);

  if (trustApiExport) {
    if (needsSkinnedMeshRigRepair(root)) {
      alignSkinnedMeshToRig(root);
      rebindSkinnedMeshes(root);
    }
    anchorModelFeetToFloor(root);
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
