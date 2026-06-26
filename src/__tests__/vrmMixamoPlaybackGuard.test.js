import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  NORMALIZED_MIXAMO_TRACK_PREFIX,
  assertMixamoTracksUseNormalizedBones,
  validateMixamoRetargetClip,
  VrmPlaybackMotionSampler,
} from '../library/vrmMixamoPlaybackGuard.js';
import { getMixamoAnimation } from '../library/loadMixamoAnimation.js';

function buildDualBoneVrm() {
  const hipsRaw = new THREE.Object3D();
  hipsRaw.name = 'hips';
  const hipsNorm = new THREE.Object3D();
  hipsNorm.name = `${NORMALIZED_MIXAMO_TRACK_PREFIX}Hips`;
  const spineNorm = new THREE.Object3D();
  spineNorm.name = `${NORMALIZED_MIXAMO_TRACK_PREFIX}Spine`;
  hipsNorm.add(spineNorm);
  const scene = new THREE.Object3D();
  scene.add(hipsRaw);
  scene.add(hipsNorm);

  return {
    scene,
    humanoid: {
      autoUpdateHumanBones: true,
      humanBones: { hips: {}, spine: {} },
      getNormalizedBoneNode: (name) => {
        if (name === 'hips') return hipsNorm;
        if (name === 'spine') return spineNorm;
        return null;
      },
      getRawBoneNode: (name) => (name === 'hips' ? hipsRaw : null),
      update: () => {},
    },
    update: () => {},
    meta: { metaVersion: '1' },
  };
}

describe('vrmMixamoPlaybackGuard', () => {
  it('flags raw-bone tracks when normalized bones exist in scene', () => {
    const vrm = buildDualBoneVrm();
    const clip = new THREE.AnimationClip('vrmAnimation', 1, [
      new THREE.QuaternionKeyframeTrack('hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);

    const { ok, violations } = assertMixamoTracksUseNormalizedBones(vrm, clip);
    expect(ok).toBe(false);
    expect(violations[0].expected).toBe(`${NORMALIZED_MIXAMO_TRACK_PREFIX}Hips`);
  });

  it('accepts normalized-bone tracks', () => {
    const vrm = buildDualBoneVrm();
    const clip = new THREE.AnimationClip('vrmAnimation', 1, [
      new THREE.QuaternionKeyframeTrack(
        `${NORMALIZED_MIXAMO_TRACK_PREFIX}Hips.quaternion`,
        [0, 1],
        [0, 0, 0, 1, 0, 0, 0, 1],
      ),
    ]);

    expect(assertMixamoTracksUseNormalizedBones(vrm, clip).ok).toBe(true);
  });

  it('getMixamoAnimation retarget uses normalized tracks (regression)', () => {
    const vrm = buildDualBoneVrm();

    const mixamoHips = new THREE.Object3D();
    mixamoHips.name = 'mixamorigHips';
    mixamoHips.position.y = 1;
    const mixamoSpine = new THREE.Object3D();
    mixamoSpine.name = 'mixamorigSpine';
    mixamoHips.add(mixamoSpine);
    const mixamoRoot = new THREE.Object3D();
    mixamoRoot.add(mixamoHips);
    mixamoRoot.updateMatrixWorld(true);

    const clip = new THREE.AnimationClip('mixamo.com', 1, [
      new THREE.QuaternionKeyframeTrack(
        'mixamorigSpine.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0.1, 0, 0, 1],
      ),
    ]);

    const retargeted = getMixamoAnimation([clip], mixamoRoot, vrm);
    expect(retargeted).not.toBeNull();
    expect(
      retargeted.tracks.some((t) => t.name.startsWith(NORMALIZED_MIXAMO_TRACK_PREFIX)),
    ).toBe(true);
    expect(assertMixamoTracksUseNormalizedBones(vrm, retargeted).ok).toBe(true);
    expect(validateMixamoRetargetClip(vrm, retargeted).ok).toBe(true);
  });

  it('VrmPlaybackMotionSampler detects frozen normalized hips', () => {
    const sampler = new VrmPlaybackMotionSampler();
    const vrm = buildDualBoneVrm();

    for (let i = 0; i < 20; i += 1) {
      sampler.sample(vrm, i * 0.033, 1);
    }
    expect(sampler.likelyFrozen).toBe(true);
  });
});
