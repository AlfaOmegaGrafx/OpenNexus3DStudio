import { describe, expect, it } from 'vitest';
import * as THREE from '../library/three.js';
import { validateAigcRigContract } from '../library/aigcRigContract.js';

describe('aigcRigContract', () => {
  it('warns when mesh and bones are vertically separated', () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 0, 0);
    const spine = new THREE.Bone();
    spine.name = 'Spine';
    spine.position.set(0, 0.4, 0);
    hips.add(spine);
    root.add(hips);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.6, 0.3),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.set(0, 3, 0);
    root.add(mesh);
    root.updateMatrixWorld(true);

    const result = validateAigcRigContract(root, { jobId: 'test-job', label: 'unit' });
    expect(result.warnings).toContain('mesh_bone_vertical_mismatch');
  });
});
