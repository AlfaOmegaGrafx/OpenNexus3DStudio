/**
 * Compare expected vs actual bone rotations to find mis-retargeted or unresolved bones.
 * Used by ?animSmoke=1 hooks and getPlaybackDiagnostics().
 */
import * as THREE from 'three';
import { collectModelBones } from './rigBoneUtils.js';
import { resolveVrmBoneTrackName } from './loadMixamoAnimation.js';
import { VRMHumanoidToMixamo } from './VRMRigMapMixamo.js';
import { findHipsBone } from './rigBoneUtils.js';
import {
  humanoidBoneSceneNameCandidates,
  listRigBoneNames,
  resolveHumanoidBoneOnRig,
} from './studioMotionRigMap.js';

/** Core humanoid bones we always report on (matches Kimodo studio_motion coverage). */
export const CORE_HUMANOID_BONES = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
];

/** @param {import('three').Quaternion} a */
/** @param {import('three').Quaternion} b */
export function quaternionAngularErrorDeg(a, b) {
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  const clamped = Math.min(1, Math.max(-1, dot));
  return THREE.MathUtils.radToDeg(2 * Math.acos(clamped));
}

/**
 * Sample quaternion tracks from a clip at a given time.
 * @param {import('three').AnimationClip | null | undefined} clip
 * @param {number} time
 * @returns {Map<string, THREE.Quaternion>}
 */
export function sampleClipLocalQuaternions(clip, time) {
  /** @type {Map<string, THREE.Quaternion>} */
  const out = new Map();
  if (!clip?.tracks?.length) return out;

  const t = Math.max(0, Math.min(time, clip.duration || time));
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.quaternion')) continue;
    const boneName = track.name.replace(/\.quaternion$/, '');
    const q = new THREE.Quaternion();
    q.fromArray(track.values, track.getInterpolationIndex(t, track.values.length / 4) * 4);
    // Manual sample — KeyframeTrack doesn't expose getValueAt easily on all types
    const frameCount = track.values.length / 4;
    if (frameCount === 0) continue;
    let idx = 0;
    for (let i = 0; i < track.times.length; i++) {
      if (track.times[i] <= t) idx = i;
      else break;
    }
    q.fromArray(track.values, idx * 4);
    out.set(boneName, q);
  }
  return out;
}

/**
 * Improved clip sampling with linear interpolation between keys.
 * @param {import('three').AnimationClip | null | undefined} clip
 * @param {number} time
 */
export function sampleClipLocalQuaternionsInterp(clip, time) {
  /** @type {Map<string, THREE.Quaternion>} */
  const out = new Map();
  if (!clip?.tracks?.length) return out;

  const t = Math.max(0, Math.min(time, clip.duration || time));
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.quaternion')) continue;
    const boneName = track.name.replace(/\.quaternion$/, '');
    const times = track.times;
    const values = track.values;
    const frameCount = times.length;
    if (frameCount === 0) continue;

    let i1 = 0;
    while (i1 < frameCount - 1 && times[i1 + 1] < t) i1++;
    const i0 = Math.max(0, i1);
    i1 = Math.min(frameCount - 1, i0 + 1);

    const q0 = new THREE.Quaternion().fromArray(values, i0 * 4);
    if (i0 === i1 || times[i1] === times[i0]) {
      out.set(boneName, q0);
      continue;
    }
    const q1 = new THREE.Quaternion().fromArray(values, i1 * 4);
    const alpha = (t - times[i0]) / (times[i1] - times[i0]);
    out.set(boneName, q0.clone().slerp(q1, alpha));
  }
  return out;
}

/**
 * Read current local rotation of mapped humanoid bones on VRM or rig.
 * @param {{ vrm?: import('@pixiv/three-vrm').VRM | null, rigRoot?: import('three').Object3D | null, humanoidBone: string }} params
 */
export function readActualHumanoidLocalQuat({ vrm, rigRoot, humanoidBone }) {
  if (vrm?.humanoid) {
    const node =
      vrm.humanoid.getNormalizedBoneNode?.(humanoidBone) ??
      vrm.humanoid.getRawBoneNode?.(humanoidBone);
    if (!node) return null;
    return {
      sceneName: node.name,
      trackName: resolveVrmBoneTrackName(vrm, humanoidBone),
      quaternion: node.quaternion.clone(),
    };
  }

  if (rigRoot) {
    const bone = resolveHumanoidBoneOnRig(rigRoot, humanoidBone);
    if (!bone) return null;
    return {
      sceneName: bone.name,
      trackName: bone.name,
      quaternion: bone.quaternion.clone(),
    };
  }

  return null;
}

/**
 * Map humanoid bone → scene bone for VRM or rig (resolution audit).
 */
export function auditHumanoidBoneResolution({ vrm, rigRoot, humanoidBones = CORE_HUMANOID_BONES }) {
  return humanoidBones.map((humanoidBone) => {
    const actual = readActualHumanoidLocalQuat({ vrm, rigRoot, humanoidBone });
    const mixamo = VRMHumanoidToMixamo[humanoidBone] ?? null;
    return {
      humanoidBone,
      mixamoBone: mixamo,
      resolved: Boolean(actual),
      sceneName: actual?.sceneName ?? null,
      trackName: actual?.trackName ?? null,
    };
  });
}

/**
 * Compare clip expected local quats vs actual pose at the same mixer time.
 * @param {object} params
 * @param {import('three').AnimationClip} params.clip
 * @param {number} params.time
 * @param {import('@pixiv/three-vrm').VRM | null} [params.vrm]
 * @param {import('three').Object3D | null} [params.rigRoot]
 * @param {string[]} [params.humanoidBones]
 */
export function compareClipToActualPose({ clip, time, vrm, rigRoot, humanoidBones = CORE_HUMANOID_BONES }) {
  const expectedByTrack = sampleClipLocalQuaternionsInterp(clip, time);
  /** @type {Array<object>} */
  const rows = [];

  for (const humanoidBone of humanoidBones) {
    const actual = readActualHumanoidLocalQuat({ vrm, rigRoot, humanoidBone });
    const trackName = actual?.trackName ?? resolveVrmBoneTrackName(vrm, humanoidBone);
    const expected =
      (trackName && expectedByTrack.get(trackName)) ||
      (actual?.sceneName && expectedByTrack.get(actual.sceneName)) ||
      null;

    if (!actual && !expected) {
      rows.push({
        humanoidBone,
        status: 'unmapped',
        errorDeg: null,
        sceneName: null,
        trackName: trackName ?? null,
      });
      continue;
    }

    if (!actual) {
      rows.push({
        humanoidBone,
        status: 'missing-scene-bone',
        errorDeg: null,
        sceneName: null,
        trackName: trackName ?? null,
        expected: expected ? expected.toArray() : null,
      });
      continue;
    }

    if (!expected) {
      rows.push({
        humanoidBone,
        status: 'missing-clip-track',
        errorDeg: null,
        sceneName: actual.sceneName,
        trackName: actual.trackName,
        actual: actual.quaternion.toArray(),
      });
      continue;
    }

    const errorDeg = quaternionAngularErrorDeg(expected, actual.quaternion);
    rows.push({
      humanoidBone,
      status: errorDeg > 25 ? 'misbehaving' : errorDeg > 8 ? 'warn' : 'ok',
      errorDeg: Number(errorDeg.toFixed(2)),
      sceneName: actual.sceneName,
      trackName: actual.trackName,
      expected: expected.toArray().map((v) => Number(v.toFixed(4))),
      actual: actual.quaternion.toArray().map((v) => Number(v.toFixed(4))),
    });
  }

  rows.sort((a, b) => (b.errorDeg ?? -1) - (a.errorDeg ?? -1));
  return {
    time,
    clipName: clip?.name ?? null,
    trackCount: clip?.tracks?.length ?? 0,
    misbehaving: rows.filter((r) => r.status === 'misbehaving'),
    warnings: rows.filter((r) => r.status === 'warn'),
    unmapped: rows.filter((r) => r.status === 'unmapped' || r.status === 'missing-scene-bone'),
    rows,
  };
}

/**
 * Capture bind/rest local quaternions as canonical reference (T-pose baseline).
 */
export function captureRestPoseReference({ vrm, rigRoot, humanoidBones = CORE_HUMANOID_BONES }) {
  const rows = humanoidBones.map((humanoidBone) => {
    const actual = readActualHumanoidLocalQuat({ vrm, rigRoot, humanoidBone });
    return {
      humanoidBone,
      sceneName: actual?.sceneName ?? null,
      restQuat: actual ? actual.quaternion.toArray().map((v) => Number(v.toFixed(4))) : null,
    };
  });
  return { capturedAt: Date.now(), rows };
}

/**
 * List all bones in a rig with suggested humanoid mapping.
 * @param {import('three').Object3D | null | undefined} rigRoot
 */
export function listRigBoneInventory(rigRoot) {
  if (!rigRoot) return [];
  return collectModelBones(rigRoot)
    .map((bone) => bone.name)
    .filter(Boolean)
    .sort();
}

/**
 * Before playback: which studio_motion bones will map onto the loaded avatar?
 * @param {object} motion studio_motion.json
 * @param {{ vrm?: import('@pixiv/three-vrm').VRM | null, rigRoot?: import('three').Object3D | null }} target
 */
export function auditStudioMotionResolution(motion, { vrm, rigRoot }) {
  const trackBones = [...new Set((motion?.tracks ?? []).map((t) => t.bone).filter(Boolean))];
  /** @type {Array<object>} */
  const rows = [];

  for (const humanoidBone of trackBones) {
    let sceneName = null;
    let trackName = null;
    let resolved = false;

    if (vrm?.humanoid) {
      const actual = readActualHumanoidLocalQuat({ vrm, humanoidBone });
      resolved = Boolean(actual);
      sceneName = actual?.sceneName ?? null;
      trackName = actual?.trackName ?? resolveVrmBoneTrackName(vrm, humanoidBone);
    } else if (rigRoot) {
      const bone = resolveHumanoidBoneOnRig(rigRoot, humanoidBone);
      resolved = Boolean(bone);
      sceneName = bone?.name ?? null;
      trackName = bone?.name ?? null;
    }

    rows.push({
      motionBone: humanoidBone,
      resolved,
      sceneName,
      trackName,
      candidates: rigRoot ? humanoidBoneSceneNameCandidates(humanoidBone, rigRoot).slice(0, 8) : null,
    });
  }

  const unresolved = rows.filter((r) => !r.resolved);
  return {
    motionName: motion?.name ?? null,
    trackBoneCount: trackBones.length,
    resolvedCount: rows.filter((r) => r.resolved).length,
    unresolved,
    rows,
    rigBoneSample: rigRoot ? listRigBoneNames(rigRoot, 48) : [],
  };
}

/**
 * Full audit for animation manager + viewport target.
 */
export function runBonePlaybackAudit({ animationManager, sceneManager, time = null }) {
  const am = animationManager;
  const sm = sceneManager;
  const vrm = sm?.currentVRM ?? sm?.currentModel?.userData?.vrm ?? null;
  const rigRoot = vrm ? null : sm?.currentModel ?? null;

  const activeControl =
    am?.animationControls?.find((c) => c.vrm === vrm) ??
    am?.animationControls?.find((c) => c.rigRoot === rigRoot) ??
    am?.animationControls?.[0] ??
    null;

  const clip = activeControl?.animations?.[0] ?? am?.currentClip ?? null;
  const sampleTime =
    time ??
    activeControl?.to?.time ??
    activeControl?.getTime?.() ??
    0;

  const resolution = auditHumanoidBoneResolution({ vrm, rigRoot });
  const resolvedCount = resolution.filter((r) => r.resolved).length;

  const comparison = clip
    ? compareClipToActualPose({ clip, time: sampleTime, vrm, rigRoot })
    : null;

  return {
    target: vrm ? 'vrm' : rigRoot ? 'rig' : 'none',
    hasVrm: Boolean(vrm?.humanoid),
    rigBoneCount: rigRoot ? listRigBoneInventory(rigRoot).length : 0,
    rigBoneNames: rigRoot ? listRigBoneNames(rigRoot, 48) : [],
    animationName: am?.getCurrentAnimationName?.() ?? null,
    clipName: clip?.name ?? null,
    sampleTime,
    resolution: {
      resolved: resolvedCount,
      total: resolution.length,
      unresolved: resolution.filter((r) => !r.resolved),
    },
    playback: comparison,
    hipsFound: Boolean(findHipsBone(rigRoot) || vrm?.humanoid?.getNormalizedBoneNode?.('hips')),
  };
}
