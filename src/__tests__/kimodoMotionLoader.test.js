import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVrmAnimationClipFromStudioMotion } from '../library/kimodoMotionLoader.js';

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

describe('kimodoMotionLoader', () => {
  it('buildVrmAnimationClipFromStudioMotion targets normalized VRM bones', () => {
    const vrm = mockVrm({
      hips: 'Normalized_mixamorigHips',
      spine: 'Normalized_mixamorigSpine',
    });
    const motion = {
      name: 'walk',
      duration: 1,
      tracks: [
        {
          bone: 'hips',
          times: [0, 0.5],
          quaternions: [0, 0, 0, 1, 0, 0.1, 0, 0.995],
        },
      ],
    };
    const clip = buildVrmAnimationClipFromStudioMotion(vrm, motion);
    expect(clip.tracks.length).toBe(1);
    expect(clip.tracks[0].name).toBe('Normalized_mixamorigHips.quaternion');
    expect(clip.tracks[0].values.length).toBe(8);
  });
});
