import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getMixamoAnimation,
  getMixamoAnimationForRig,
  mixamoNameToRigBoneName,
  resolveRigBoneTrackName,
  resolveVrmBoneTrackName,
} from '../library/loadMixamoAnimation.js';

function mockVrm(boneNames) {
  const nodes = {};
  for (const [humanoidName, sceneName] of Object.entries(boneNames)) {
    const node = new THREE.Object3D();
    node.name = sceneName;
    nodes[humanoidName] = node;
  }
  const scene = new THREE.Object3D();
  scene.add(nodes.hips);
  return {
    scene,
    humanoid: {
      getNormalizedBoneNode: (name) => nodes[name] ?? null,
      getRawBoneNode: (name) => nodes[name] ?? null,
    },
    meta: { metaVersion: '1' },
  };
}

describe('loadMixamoAnimation', () => {
  it('resolveVrmBoneTrackName returns scene bone name', () => {
    const vrm = mockVrm({ hips: 'J_Bip_C_Hips', spine: 'J_Bip_C_Spine' });
    expect(resolveVrmBoneTrackName(vrm, 'hips')).toBe('J_Bip_C_Hips');
  });

  it('resolveVrmBoneTrackName prefers raw bone in scene over missing normalized node', () => {
    const hipsNode = new THREE.Object3D();
    hipsNode.name = 'hips';
    const normNode = new THREE.Object3D();
    normNode.name = 'Normalized_mixamorigHips';
    const scene = new THREE.Object3D();
    scene.add(hipsNode);

    const vrm = {
      scene,
      humanoid: {
        getNormalizedBoneNode: () => normNode,
        getRawBoneNode: () => hipsNode,
      },
    };
    expect(resolveVrmBoneTrackName(vrm, 'hips')).toBe('hips');
  });

  it('resolveVrmBoneTrackName finds bones by node reference when name lookup fails', () => {
    const hipsNode = new THREE.Object3D();
    hipsNode.name = 'J_Bip_C_Hips';
    const scene = new THREE.Object3D();
    scene.add(hipsNode);

    const vrm = {
      scene,
      humanoid: {
        getNormalizedBoneNode: () => hipsNode,
        getRawBoneNode: () => hipsNode,
      },
    };
    expect(resolveVrmBoneTrackName(vrm, 'hips')).toBe('J_Bip_C_Hips');
  });

  it('retargets mixamo tracks to VRM scene bone names', () => {
    const vrm = mockVrm({
      hips: 'J_Bip_C_Hips',
      spine: 'J_Bip_C_Spine',
      leftUpperLeg: 'J_Bip_L_UpperLeg',
    });

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
    expect(retargeted.tracks.some((t) => t.name === 'J_Bip_C_Spine.quaternion')).toBe(true);
    expect(retargeted.tracks.some((t) => t.name === 'spine.quaternion')).toBe(false);
  });

  it('mixamoNameToRigBoneName maps mixamorigLeftArm to LeftArm', () => {
    expect(mixamoNameToRigBoneName('mixamorigLeftArm')).toBe('LeftArm');
    expect(mixamoNameToRigBoneName('mixamorigLeftHandThumb1')).toBe('LeftHandThumb1');
  });

  it('retargets mixamo tracks to exported GLB rig bone names', () => {
    const rigHips = new THREE.Bone();
    rigHips.name = 'Hips';
    rigHips.position.y = 0.9;
    const rigSpine = new THREE.Bone();
    rigSpine.name = 'Spine';
    rigHips.add(rigSpine);
    const rigRoot = new THREE.Object3D();
    rigRoot.add(rigHips);

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

    expect(resolveRigBoneTrackName(rigRoot, 'mixamorigSpine')).toBe('Spine');

    const retargeted = getMixamoAnimationForRig([clip], mixamoRoot, rigRoot);
    expect(retargeted).not.toBeNull();
    expect(retargeted.tracks.some((t) => t.name === 'Spine.quaternion')).toBe(true);
    expect(retargeted.tracks.some((t) => t.name.includes('mixamorig'))).toBe(false);
  });
});
