import { describe, it, expect } from 'vitest';
import * as THREE from '../library/three.js';
import {
  ensureSkinTokensRootFacesCamera,
  needsSkinnedMeshRigRepair,
} from '../library/rigBoneUtils.js';

describe('SkinTokens load orientation', () => {
  it('does not run mesh-only rig repair on SkinTokens rigs', () => {
    const root = new THREE.Object3D();
    root.userData.skintokensRig = true;
    root.userData.aigcRigContract = { status: 'fail', failures: ['missing_hips_bone'] };

    const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
    const bone = new THREE.Bone();
    bone.name = 'bone_0';
    skinned.add(bone);
    skinned.bind(new THREE.Skeleton([bone]));
    root.add(skinned);

    expect(needsSkinnedMeshRigRepair(root)).toBe(false);
  });

  it('rotates SkinTokens root when rig forward points away from camera', () => {
    const root = new THREE.Object3D();
    root.userData.skintokensRig = true;

    const hips = new THREE.Bone();
    hips.name = 'bone_0';
    hips.position.set(0, 0, 0);

    const spine = new THREE.Bone();
    spine.name = 'bone_3';
    spine.position.set(0, 1, 0);
    hips.add(spine);

    const left = new THREE.Bone();
    left.name = 'bone_25';
    left.position.set(-0.5, 0.8, 0.5);
    hips.add(left);

    const right = new THREE.Bone();
    right.name = 'bone_6';
    right.position.set(0.5, 0.8, 0.5);
    hips.add(right);

    root.add(hips);
    root.updateMatrixWorld(true);

    const rotated = ensureSkinTokensRootFacesCamera(root);
    expect(rotated).toBe(true);
    expect(Math.abs(root.rotation.y)).toBeCloseTo(Math.PI, 4);
  });
});
