import { describe, expect, it } from 'vitest';
import * as THREE from '../library/three.js';
import { validateAigcRigContract } from '../library/aigcRigContract.js';

describe('aigcRigContract', () => {
  it('fails when mesh and bones are vertically separated', () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 0, 0);
    const spine = new THREE.Bone();
    spine.name = 'Spine';
    spine.position.set(0, 0.4, 0);
    const leftArm = new THREE.Bone();
    leftArm.name = 'LeftArm';
    leftArm.position.set(0.3, 0.3, 0);
    const rightArm = new THREE.Bone();
    rightArm.name = 'RightArm';
    rightArm.position.set(-0.3, 0.3, 0);
    hips.add(spine);
    spine.add(leftArm);
    spine.add(rightArm);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.5, 1.6, 0.3);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinned.position.set(0, 3, 0);
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips, spine, leftArm, rightArm]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    const result = validateAigcRigContract(root, { jobId: 'test-job', label: 'unit' });
    expect(result.failures).toContain('mesh_bone_vertical_mismatch');
    expect(result.failures).toContain('mesh_bone_feet_mismatch');
  });
});
