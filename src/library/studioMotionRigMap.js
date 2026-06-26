/**
 * Resolve VRM humanoid bone names onto rigged GLB skeletons (UniRig, Mixamo, J_Bip, etc.).
 */
import { isSkinTokensRig, mixamoNameToRigBoneName } from './loadMixamoAnimation.js';
import { collectModelBones, findBoneByName } from './rigBoneUtils.js';
import { humanoidBoneToSkinTokensBone } from './skintokensRigMap.js';
import { VRMHumanoidToMixamo } from './VRMRigMapMixamo.js';

/** Scene bone name → VRM humanoid (from download-utils / VRM-0 exports). */
const SCENE_BONE_TO_HUMANOID = {
  J_Bip_C_Hips: 'hips',
  J_Bip_C_Spine: 'spine',
  J_Bip_C_Chest: 'chest',
  J_Bip_C_UpperChest: 'upperChest',
  J_Bip_C_Neck: 'neck',
  J_Bip_C_Head: 'head',
  J_Bip_L_Shoulder: 'leftShoulder',
  J_Bip_L_UpperArm: 'leftUpperArm',
  J_Bip_L_LowerArm: 'leftLowerArm',
  J_Bip_L_Hand: 'leftHand',
  J_Bip_R_Shoulder: 'rightShoulder',
  J_Bip_R_UpperArm: 'rightUpperArm',
  J_Bip_R_LowerArm: 'rightLowerArm',
  J_Bip_R_Hand: 'rightHand',
  J_Bip_L_UpperLeg: 'leftUpperLeg',
  J_Bip_L_LowerLeg: 'leftLowerLeg',
  J_Bip_L_Foot: 'leftFoot',
  J_Bip_L_ToeBase: 'leftToes',
  J_Bip_R_UpperLeg: 'rightUpperLeg',
  J_Bip_R_LowerLeg: 'rightLowerLeg',
  J_Bip_R_Foot: 'rightFoot',
  J_Bip_R_ToeBase: 'rightToes',
};

/** Extra UniRig / SkinTokens aliases beyond Mixamo strip. */
const EXTRA_HUMANOID_ALIASES = {
  leftUpperArm: ['LeftUpperArm', 'LeftArm', 'upper_arm.L', 'UpperArm_L'],
  leftLowerArm: ['LeftLowerArm', 'LeftForeArm', 'ForeArm_L', 'lower_arm.L'],
  rightUpperArm: ['RightUpperArm', 'RightArm', 'upper_arm.R', 'UpperArm_R'],
  rightLowerArm: ['RightLowerArm', 'RightForeArm', 'ForeArm_R', 'lower_arm.R'],
  leftUpperLeg: ['LeftUpLeg', 'LeftUpperLeg', 'Thigh_L', 'upper_leg.L'],
  leftLowerLeg: ['LeftLeg', 'LeftLowerLeg', 'Shin_L', 'lower_leg.L'],
  rightUpperLeg: ['RightUpLeg', 'RightUpperLeg', 'Thigh_R', 'upper_leg.R'],
  rightLowerLeg: ['RightLeg', 'RightLowerLeg', 'Shin_R', 'lower_leg.R'],
  hips: ['Hips', 'Pelvis', 'pelvis', 'Root', 'root'],
  spine: ['Spine', 'Spine1'],
  chest: ['Chest', 'Spine2', 'Spine1'],
  upperChest: ['UpperChest', 'Spine2', 'Chest2'],
};

function pascalFromCamel(name) {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * @param {string} humanoidBoneName VRM humanoid key (e.g. leftUpperArm)
 * @returns {string[]}
 */
export function humanoidBoneSceneNameCandidates(humanoidBoneName, rigRoot = null) {
  const candidates = new Set();
  if (!humanoidBoneName) return [];

  if (rigRoot && isSkinTokensRig(rigRoot)) {
    const skinTokensBone = humanoidBoneToSkinTokensBone(humanoidBoneName);
    if (skinTokensBone) candidates.add(skinTokensBone);
  }

  candidates.add(humanoidBoneName);
  candidates.add(pascalFromCamel(humanoidBoneName));

  const mixamo = VRMHumanoidToMixamo[humanoidBoneName];
  if (mixamo) {
    candidates.add(mixamo);
    candidates.add(mixamo.replace(/^mixamorig/, 'mixamorig:'));
    candidates.add(mixamo.replace(/^mixamorig/, ''));
    const rigName = mixamoNameToRigBoneName(mixamo);
    if (rigName) candidates.add(rigName);
  }

  for (const [sceneName, humanoidKey] of Object.entries(SCENE_BONE_TO_HUMANOID)) {
    if (humanoidKey === humanoidBoneName) candidates.add(sceneName);
  }

  for (const alias of EXTRA_HUMANOID_ALIASES[humanoidBoneName] ?? []) {
    candidates.add(alias);
  }

  return [...candidates];
}

/**
 * @param {import('three').Object3D | null | undefined} rigRoot
 * @param {string} humanoidBoneName
 * @returns {import('three').Bone | import('three').Object3D | null}
 */
export function resolveHumanoidBoneOnRig(rigRoot, humanoidBoneName) {
  if (!rigRoot || !humanoidBoneName) return null;
  const names = humanoidBoneSceneNameCandidates(humanoidBoneName, rigRoot);
  return findBoneByName(rigRoot, ...names);
}

/**
 * @param {import('three').Object3D | null | undefined} rigRoot
 * @returns {string[]}
 */
export function listRigBoneNames(rigRoot, limit = 32) {
  return collectModelBones(rigRoot)
    .map((b) => b.name)
    .filter(Boolean)
    .slice(0, limit);
}
