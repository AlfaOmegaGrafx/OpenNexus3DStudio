import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildBoneOverlay } from '../components/TaskMeshPreview.jsx';

describe('TaskMeshPreview bone overlay', () => {
  it('returns null when there are no bones', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    expect(buildBoneOverlay(root)).toBeNull();
  });

  it('builds joint meshes for a simple bone chain', () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    const spine = new THREE.Bone();
    spine.name = 'Spine';
    hips.add(spine);
    root.add(hips);
    hips.position.set(0, 1, 0);
    spine.position.set(0, 0.3, 0);
    root.updateMatrixWorld(true);

    const overlay = buildBoneOverlay(root);
    expect(overlay).not.toBeNull();
    expect(overlay.children.length).toBeGreaterThan(0);
  });
});
