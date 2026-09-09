/**
 * Creature / SkinTokens face retarget — OpenXR / webcam expression weights → bones.
 *
 * template_wrap is humanoid-only. Non-humanoid rigs (Eagle Knight SkinTokens,
 * Mesh2Motion creature_template fox, etc.) have no ARKit morphs; this driver maps a small
 * subset of channels onto jaw/chin/eye bones when present, otherwise no-ops with one log.
 *
 * Driven keys: jaw_drop, eyes_closed_left, eyes_closed_right.
 * Smile / brow / visemes are ignored unless future custom morphs are added.
 */

import * as THREE from 'three';
import { isSkinTokensRig } from './loadMixamoAnimation.js';
import { isCreatureTemplateRigInfo } from './creaturePipelineCatalog.js';

const JAW_NAME_RE = /jaw|chin|mouth|beak|mandible/i;
const EYE_L_NAME_RE = /eye.*l(eft)?|lid.*l(eft)?|eyelid.*l|l(eft)?.*eye|l(eft)?.*lid/i;
const EYE_R_NAME_RE = /eye.*r(ight)?|lid.*r(ight)?|eyelid.*r|r(ight)?.*eye|r(ight)?.*lid/i;
const EYE_ANY_NAME_RE = /eye|lid|eyelid/i;

/** Max jaw open rotation (radians) at weight 1. */
export const CREATURE_JAW_OPEN_RAD = 0.45;
/** Max eyelid “close” rotation (radians) at weight 1. */
export const CREATURE_EYE_CLOSE_RAD = 0.55;

const _euler = new THREE.Euler();
const _quatDelta = new THREE.Quaternion();

/** @type {WeakMap<object, { rest: Map<string, THREE.Quaternion>, loggedCapability: boolean, loggedNoop: boolean }>} */
const rootState = new WeakMap();

/**
 * @param {import('three').Object3D | null | undefined} root
 * @returns {boolean}
 */
export function shouldUseCreatureFaceRetarget(root) {
  if (!root || typeof root !== 'object') return false;
  if (root.userData?.vrm || root.userData?.isVRM) return false;
  if (isSkinTokensRig(root)) return true;
  const rigInfo = root.userData?.autoRigMeta?.rig_info;
  if (isCreatureTemplateRigInfo(rigInfo)) return true;
  if (root.userData?.creatureFaceRetarget === true) return true;
  if (root.userData?.fromAigc && _countSkeletonBones(root) > 0 && !_hasUsefulMorphTargets(root)) {
    return true;
  }
  return false;
}

/**
 * @param {import('three').Object3D} root
 * @returns {Map<string, import('three').Object3D>}
 */
export function collectNamedBones(root) {
  /** @type {Map<string, import('three').Object3D>} */
  const byName = new Map();
  if (!root) return byName;

  root.traverse((obj) => {
    if (!obj?.name) return;
    if (obj.isBone || obj.type === 'Bone') {
      byName.set(obj.name, obj);
    }
  });

  root.traverse((obj) => {
    const skel = obj?.skeleton;
    if (!skel?.bones?.length) return;
    for (const bone of skel.bones) {
      if (bone?.name) byName.set(bone.name, bone);
    }
  });

  return byName;
}

/**
 * @param {Map<string, import('three').Object3D>} byName
 * @returns {{ jaw: import('three').Object3D | null, eyeL: import('three').Object3D | null, eyeR: import('three').Object3D | null }}
 */
export function resolveCreatureFaceBones(byName) {
  let jaw = null;
  let eyeL = null;
  let eyeR = null;
  let eyeAny = null;

  for (const [name, bone] of byName) {
    if (!jaw && JAW_NAME_RE.test(name)) jaw = bone;
    if (!eyeL && EYE_L_NAME_RE.test(name)) eyeL = bone;
    if (!eyeR && EYE_R_NAME_RE.test(name)) eyeR = bone;
    if (!eyeAny && EYE_ANY_NAME_RE.test(name)) eyeAny = bone;
  }

  // Prefer explicit L/R; fall back to a single “eye” bone for both channels.
  if (!eyeL && eyeAny) eyeL = eyeAny;
  if (!eyeR && eyeAny) eyeR = eyeAny;

  return { jaw, eyeL, eyeR };
}

/**
 * Describe what this root can drive (for logs / tests).
 * @param {import('three').Object3D} root
 */
export function describeCreatureFaceCapability(root) {
  const bones = collectNamedBones(root);
  const { jaw, eyeL, eyeR } = resolveCreatureFaceBones(bones);
  return {
    boneCount: bones.size,
    jaw: jaw?.name ?? null,
    eyeL: eyeL?.name ?? null,
    eyeR: eyeR?.name ?? null,
    canDriveJaw: Boolean(jaw),
    canDriveEyes: Boolean(eyeL || eyeR),
  };
}

/**
 * Apply OpenXR-style weight record to a creature / SkinTokens root.
 *
 * @param {import('three').Object3D | null | undefined} root
 * @param {Record<string, number>} record
 * @param {{ lerpFactor?: number }} [options]
 * @returns {{ applied: boolean, capability: ReturnType<typeof describeCreatureFaceCapability> }}
 */
export function applyExpressionWeightRecordToCreature(root, record, options = {}) {
  const empty = {
    applied: false,
    capability: { boneCount: 0, jaw: null, eyeL: null, eyeR: null, canDriveJaw: false, canDriveEyes: false },
  };
  if (!root || !record || typeof record !== 'object') return empty;

  const lerp = typeof options.lerpFactor === 'number' ? options.lerpFactor : 0.28;
  const capability = describeCreatureFaceCapability(root);
  const state = _ensureState(root);

  if (!state.loggedCapability) {
    state.loggedCapability = true;
    console.info('[CreatureFaceRetarget] capability', {
      name: root.name || root.userData?.name || '(unnamed)',
      skinTokens: isSkinTokensRig(root),
      creatureTemplate: isCreatureTemplateRigInfo(root.userData?.autoRigMeta?.rig_info),
      ...capability,
    });
  }

  if (!capability.canDriveJaw && !capability.canDriveEyes) {
    if (!state.loggedNoop) {
      state.loggedNoop = true;
      console.info(
        '[CreatureFaceRetarget] no jaw/chin/eye bones — face weights no-op ' +
          '(SkinTokens/humanoid body only; MeshMonk wrap is humanoid VRM morphs).',
        { boneCount: capability.boneCount },
      );
    }
    return { applied: false, capability };
  }

  const bones = collectNamedBones(root);
  const { jaw, eyeL, eyeR } = resolveCreatureFaceBones(bones);
  let applied = false;

  const jawW = _clamp01(record.jaw_drop);
  if (jaw && jawW != null) {
    applied = _applyBoneOpen(root, jaw, 'jaw', jawW, CREATURE_JAW_OPEN_RAD, lerp, +1) || applied;
  }

  const blinkL = _clamp01(record.eyes_closed_left);
  const blinkR = _clamp01(record.eyes_closed_right);
  if (eyeL && blinkL != null) {
    applied =
      _applyBoneOpen(root, eyeL, 'eyeL', blinkL, CREATURE_EYE_CLOSE_RAD, lerp, -1) || applied;
  }
  if (eyeR && blinkR != null) {
    applied =
      _applyBoneOpen(root, eyeR, 'eyeR', blinkR, CREATURE_EYE_CLOSE_RAD, lerp, -1) || applied;
  }

  return { applied, capability };
}

/**
 * Reset creature face bones to rest (e.g. when webcam stops).
 * @param {import('three').Object3D | null | undefined} root
 */
export function resetCreatureFaceRetarget(root) {
  if (!root) return;
  const state = rootState.get(root);
  if (!state?.rest) return;
  const bones = collectNamedBones(root);
  for (const [key, restQuat] of state.rest) {
    const bone =
      (key === 'jaw' && resolveCreatureFaceBones(bones).jaw) ||
      (key === 'eyeL' && resolveCreatureFaceBones(bones).eyeL) ||
      (key === 'eyeR' && resolveCreatureFaceBones(bones).eyeR) ||
      bones.get(key);
    if (bone) bone.quaternion.copy(restQuat);
  }
}

function _ensureState(root) {
  let state = rootState.get(root);
  if (!state) {
    state = { rest: new Map(), loggedCapability: false, loggedNoop: false };
    rootState.set(root, state);
  }
  return state;
}

function _clamp01(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(1, v));
}

/**
 * @param {import('three').Object3D} root
 * @param {import('three').Object3D} bone
 * @param {string} restKey
 * @param {number} weight 0..1
 * @param {number} maxRad
 * @param {number} lerp
 * @param {number} sign +1 jaw open (pitch down), -1 lid close
 */
function _applyBoneOpen(root, bone, restKey, weight, maxRad, lerp, sign) {
  const state = _ensureState(root);
  let rest = state.rest.get(restKey);
  if (!rest) {
    rest = bone.quaternion.clone();
    state.rest.set(restKey, rest);
    state.rest.set(bone.name, rest.clone());
  }

  _euler.set(sign * weight * maxRad, 0, 0, 'XYZ');
  _quatDelta.setFromEuler(_euler);
  const target = rest.clone().multiply(_quatDelta);
  bone.quaternion.copy(rest).slerp(target, Math.max(0.05, Math.min(1, lerp)));
  return weight > 0.001;
}

function _countSkeletonBones(root) {
  return collectNamedBones(root).size;
}

function _hasUsefulMorphTargets(root) {
  let found = false;
  root.traverse((obj) => {
    if (found) return;
    const dict = obj?.morphTargetDictionary;
    if (dict && Object.keys(dict).length > 0) found = true;
  });
  return found;
}
