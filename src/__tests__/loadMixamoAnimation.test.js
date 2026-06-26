import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getMixamoAnimation,
  getMixamoAnimationForRig,
  isSkinTokensRig,
  mixamoNameToRigBoneName,
  retargetMixamoLocalQuatToRigBone,
  rigCoordinateFixFlag,
  resolveRigBoneTrackName,
  resolveVrmBoneTrackName,
  resolveVrmStudioMotionTrackName,
} from '../library/loadMixamoAnimation.js';
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

  it('resolveVrmBoneTrackName prefers normalized bone when both are in scene', () => {
    const hipsNode = new THREE.Object3D();
    hipsNode.name = 'hips';
    const normNode = new THREE.Object3D();
    normNode.name = 'Normalized_mixamorigHips';
    const scene = new THREE.Object3D();
    scene.add(hipsNode);
    scene.add(normNode);

    const vrm = {
      scene,
      humanoid: {
        getNormalizedBoneNode: () => normNode,
        getRawBoneNode: () => hipsNode,
      },
    };
    expect(resolveVrmBoneTrackName(vrm, 'hips')).toBe('Normalized_mixamorigHips');
  });

  it('resolveVrmStudioMotionTrackName prefers normalized bone for Kimodo clips', () => {
    const hipsNode = new THREE.Object3D();
    hipsNode.name = 'hips';
    const normNode = new THREE.Object3D();
    normNode.name = 'Normalized_mixamorigHips';
    const scene = new THREE.Object3D();
    scene.add(hipsNode);
    scene.add(normNode);

    const vrm = {
      scene,
      humanoid: {
        getNormalizedBoneNode: () => normNode,
        getRawBoneNode: () => hipsNode,
      },
    };
    expect(resolveVrmStudioMotionTrackName(vrm, 'hips')).toBe('Normalized_mixamorigHips');
  });

  it('resolveVrmBoneTrackName falls back to raw when normalized is not in scene', () => {
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
    expect(assertMixamoTracksUseNormalizedBones(vrm, retargeted).ok).toBe(true);
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

  it('does not apply vrm0 quat flip on SkinTokens AIGC rigs (Eagle Knight)', () => {
    const rigRoot = new THREE.Object3D();
    rigRoot.userData.fromAigc = true;
    rigRoot.userData.autoRigMeta = {
      rig_info: { generation_method: 'skintokens_tokenrig_cli' },
    };
    expect(isSkinTokensRig(rigRoot)).toBe(true);
    expect(rigCoordinateFixFlag(rigRoot)).toBeNull();
    expect(rigCoordinateFixFlag({ userData: { rigCoordinateFix: 'vrm0' } })).toBe('vrm0');
  });

  it('retargetMixamoLocalQuatToRigBone preserves bind pose when mixamo local is identity', () => {
    const mixamoParent = new THREE.Object3D();
    const mixamoHips = new THREE.Object3D();
    mixamoHips.name = 'mixamorigHips';
    mixamoHips.position.y = 1;
    mixamoParent.add(mixamoHips);
    const mixamoRoot = new THREE.Object3D();
    mixamoRoot.add(mixamoParent);

    const rigHips = new THREE.Bone();
    rigHips.name = 'bone_0';
    rigHips.position.y = 0.9;
    rigHips.rotation.x = 0.2;
    const rigRoot = new THREE.Object3D();
    rigRoot.add(rigHips);

    const out = retargetMixamoLocalQuatToRigBone(
      mixamoRoot,
      mixamoHips,
      rigHips,
      0,
      0,
      0,
      1,
      rigRoot,
    );
    const bindLocal = new THREE.Quaternion();
    rigRoot.updateMatrixWorld(true);
    rigHips.getWorldQuaternion(bindLocal);
    const parentWorld = new THREE.Quaternion();
    rigHips.parent.getWorldQuaternion(parentWorld);
    bindLocal.premultiply(parentWorld.clone().invert());
    expect(out[0]).toBeCloseTo(bindLocal.x, 4);
    expect(out[3]).toBeCloseTo(bindLocal.w, 4);
  });

  it('retargets mixamo tracks to SkinTokens indexed bones (bone_0…bone_51)', () => {
    const rigHips = new THREE.Bone();
    rigHips.name = 'bone_0';
    rigHips.position.y = 0.9;
    const rigSpine = new THREE.Bone();
    rigSpine.name = 'bone_1';
    rigHips.add(rigSpine);
    const rigRoot = new THREE.Object3D();
    rigRoot.userData.skintokensRig = true;
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

    expect(resolveRigBoneTrackName(rigRoot, 'mixamorigSpine')).toBe('bone_1');
    expect(resolveRigBoneTrackName(rigRoot, 'mixamorigHips')).toBe('bone_0');

    const retargeted = getMixamoAnimationForRig([clip], mixamoRoot, rigRoot);
    expect(retargeted).not.toBeNull();
    expect(retargeted.tracks.some((t) => t.name === 'bone_1.quaternion')).toBe(true);
  });
});
