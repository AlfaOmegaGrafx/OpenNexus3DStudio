import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  modelHasVrmRoot,
  stripOrphanSkinAttributes,
  modelNeedsSkeletonClone,
} from '../library/glbExportUtils.js';

vi.mock('three/examples/jsm/utils/SkeletonUtils.js', () => ({
  clone: (obj) => obj.clone(),
}));

describe('glbExportUtils', () => {
  it('modelHasVrmRoot detects VRM on root', () => {
    const root = new THREE.Group();
    root.userData.vrm = {};
    expect(modelHasVrmRoot(root)).toBe(true);
    expect(modelHasVrmRoot(new THREE.Group())).toBe(false);
  });

  it('modelNeedsSkeletonClone when bones present', () => {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    root.add(bone);
    expect(modelNeedsSkeletonClone(root)).toBe(true);
  });

  it('stripOrphanSkinAttributes removes skin attrs from non-skinned mesh', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geom.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(3), 1));
    geom.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(3), 1));
    const mesh = new THREE.Mesh(geom);
    const root = new THREE.Group();
    root.add(mesh);

    stripOrphanSkinAttributes(root);

    expect(mesh.geometry.attributes.skinIndex).toBeUndefined();
    expect(mesh.geometry.attributes.skinWeight).toBeUndefined();
  });
});
