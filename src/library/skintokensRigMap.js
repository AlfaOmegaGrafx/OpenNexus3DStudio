/**
 * SkinTokens GLB skeleton uses indexed names bone_0…bone_N (52-joint humanoid topology).
 * Map Mixamo / VRM humanoid names for animation retargeting.
 *
 * Left/right chains are swapped vs naive index order: in Eagle Knight exports,
 * bone_6…bone_24 hang off the character's +X side and bone_25…bone_43 off -X
 * (Mixamo left = +X when facing -Z).
 */
import { VRMHumanoidToMixamo } from './VRMRigMapMixamo.js';

/** @type {Record<string, string>} mixamorig* → bone_N */
export const MIXAMO_TO_SKINTOKENS_BONE = {
  mixamorigHips: 'bone_0',
  mixamorigSpine: 'bone_1',
  mixamorigSpine1: 'bone_2',
  mixamorigSpine2: 'bone_3',
  mixamorigNeck: 'bone_4',
  mixamorigHead: 'bone_5',
  mixamorigLeftShoulder: 'bone_25',
  mixamorigLeftArm: 'bone_26',
  mixamorigLeftForeArm: 'bone_27',
  mixamorigLeftHand: 'bone_28',
  mixamorigLeftHandThumb1: 'bone_29',
  mixamorigLeftHandThumb2: 'bone_30',
  mixamorigLeftHandThumb3: 'bone_31',
  mixamorigLeftHandIndex1: 'bone_32',
  mixamorigLeftHandIndex2: 'bone_33',
  mixamorigLeftHandIndex3: 'bone_34',
  mixamorigLeftHandMiddle1: 'bone_35',
  mixamorigLeftHandMiddle2: 'bone_36',
  mixamorigLeftHandMiddle3: 'bone_37',
  mixamorigLeftHandRing1: 'bone_38',
  mixamorigLeftHandRing2: 'bone_39',
  mixamorigLeftHandRing3: 'bone_40',
  mixamorigLeftHandPinky1: 'bone_41',
  mixamorigLeftHandPinky2: 'bone_42',
  mixamorigLeftHandPinky3: 'bone_43',
  mixamorigRightShoulder: 'bone_6',
  mixamorigRightArm: 'bone_7',
  mixamorigRightForeArm: 'bone_8',
  mixamorigRightHand: 'bone_9',
  mixamorigRightHandThumb1: 'bone_10',
  mixamorigRightHandThumb2: 'bone_11',
  mixamorigRightHandThumb3: 'bone_12',
  mixamorigRightHandIndex1: 'bone_13',
  mixamorigRightHandIndex2: 'bone_14',
  mixamorigRightHandIndex3: 'bone_15',
  mixamorigRightHandMiddle1: 'bone_16',
  mixamorigRightHandMiddle2: 'bone_17',
  mixamorigRightHandMiddle3: 'bone_18',
  mixamorigRightHandRing1: 'bone_19',
  mixamorigRightHandRing2: 'bone_20',
  mixamorigRightHandRing3: 'bone_21',
  mixamorigRightHandPinky1: 'bone_22',
  mixamorigRightHandPinky2: 'bone_23',
  mixamorigRightHandPinky3: 'bone_24',
  mixamorigLeftUpLeg: 'bone_48',
  mixamorigLeftLeg: 'bone_49',
  mixamorigLeftFoot: 'bone_50',
  mixamorigLeftToeBase: 'bone_51',
  mixamorigRightUpLeg: 'bone_44',
  mixamorigRightLeg: 'bone_45',
  mixamorigRightFoot: 'bone_46',
  mixamorigRightToeBase: 'bone_47',
};

/** @param {string} mixamoRigName */
export function mixamoRigNameToSkinTokensBone(mixamoRigName) {
  if (!mixamoRigName) return null;
  return MIXAMO_TO_SKINTOKENS_BONE[mixamoRigName] ?? null;
}

/** @param {string} humanoidBoneName VRM humanoid key */
export function humanoidBoneToSkinTokensBone(humanoidBoneName) {
  const mixamo = VRMHumanoidToMixamo[humanoidBoneName];
  return mixamo ? mixamoRigNameToSkinTokensBone(mixamo) : null;
}
