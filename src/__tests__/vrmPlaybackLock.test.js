/**
 * Regression lock: VRM canned Mixamo + Kimodo paths must stay stable.
 * GLB / SkinTokens rig rules live in loadMixamoAnimation.test.js (isSkinTokensRig).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getMixamoAnimation, resolveVrmBoneTrackName } from '../library/loadMixamoAnimation.js';
import { buildVrmAnimationClipFromStudioMotion } from '../library/kimodoMotionLoader.js';
import { assertMixamoTracksUseNormalizedBones } from '../library/vrmMixamoPlaybackGuard.js';

function mockVrm(boneNames) {
  const nodes = {};
  for (const [humanoidName, sceneName] of Object.entries(boneNames)) {
    const node = new THREE.Object3D();
    node.name = sceneName;
    nodes[humanoidName] = node;
  }
  const scene = new THREE.Object3D();
  scene.add(nodes.hips);
  if (nodes.spine) nodes.hips.add(nodes.spine);
  return {
    scene,
    humanoid: {
      autoUpdateHumanBones: true,
      getNormalizedBoneNode: (name) => nodes[name] ?? null,
      getRawBoneNode: (name) => nodes[name] ?? null,
      update: () => {},
    },
    meta: { metaVersion: '0' },
  };
}

describe('vrmPlaybackLock', () => {
  it('canned Mixamo retarget uses normalized VRM bone tracks', () => {
    const vrm = mockVrm({
      hips: 'Normalized_mixamorigHips',
      spine: 'Normalized_mixamorigSpine',
    });
    expect(resolveVrmBoneTrackName(vrm, 'hips')).toBe('Normalized_mixamorigHips');

    const mixamoHips = new THREE.Object3D();
    mixamoHips.name = 'mixamorigHips';
    mixamoHips.position.y = 1;
    const mixamoSpine = new THREE.Object3D();
    mixamoSpine.name = 'mixamorigSpine';
    mixamoHips.add(mixamoSpine);
    const mixamoRoot = new THREE.Object3D();
    mixamoRoot.add(mixamoHips);

    const clip = new THREE.AnimationClip('mixamo.com', 1, [
      new THREE.QuaternionKeyframeTrack(
        'mixamorigSpine.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0, 0, 0, 1],
      ),
    ]);

    const retargeted = getMixamoAnimation([clip], mixamoRoot, vrm);
    expect(retargeted).not.toBeNull();
    expect(assertMixamoTracksUseNormalizedBones(vrm, retargeted).ok).toBe(true);
    expect(retargeted.tracks.some((t) => t.name.startsWith('Normalized_mixamorig'))).toBe(true);
    expect(retargeted.tracks.filter((t) => t.name.endsWith('.position')).length).toBe(0);
  });

  it('Kimodo studio_motion on VRM targets normalized bones without rest-pose retarget', () => {
    const vrm = mockVrm({
      hips: 'Normalized_mixamorigHips',
    });
    const motion = {
      name: 'walk',
      duration: 0.5,
      tracks: [
        {
          bone: 'hips',
          times: [0],
          quaternions: [0.1, 0.2, 0.3, 0.9],
        },
      ],
    };
    const clip = buildVrmAnimationClipFromStudioMotion(vrm, motion);
    expect(clip.tracks[0].name).toBe('Normalized_mixamorigHips.quaternion');
    expect(clip.tracks[0].values[0]).toBeCloseTo(-0.1, 4);
    expect(clip.tracks[0].values[2]).toBeCloseTo(-0.3, 4);
  });
});
