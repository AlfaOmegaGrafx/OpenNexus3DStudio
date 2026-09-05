import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeFabricSceneBounds,
  fabricZupPositionToYup,
  fabricZupScaleToYup,
} from '../library/spacetimeFabricScene.js';

describe('spacetimeFabricScene bounds', () => {
  it('computeFabricSceneBounds does not move objects', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.set(1, 3, 2);
    root.add(mesh);

    const before = mesh.position.clone();
    const bounds = computeFabricSceneBounds(root);

    expect(mesh.position.equals(before)).toBe(true);
    expect(bounds.min.y).toBeCloseTo(2, 4);
    expect(bounds.max.y).toBeCloseTo(4, 4);
    expect(bounds.center.y).toBeCloseTo(3, 4);
  });
});

describe('sneeze fabric Z-up → Three.js Y-up', () => {
  it('inverts mapbase YupToZupPos for autorig and eagle', () => {
    expect(fabricZupPositionToYup([-0.00425, -1.87728, 1.48749])).toEqual([
      -0.00425,
      1.48749,
      1.87728,
    ]);
    expect(fabricZupPositionToYup([0.02806, 2.18527, 1.46451])).toEqual([
      0.02806,
      1.46451,
      -2.18527,
    ]);
    expect(fabricZupPositionToYup([0, 0, 0.05808])[0]).toBe(0);
    expect(fabricZupPositionToYup([0, 0, 0.05808])[1]).toBeCloseTo(0.05808);
    expect(fabricZupPositionToYup([0, 0, 0.05808])[2]).toBeCloseTo(0);
  });

  it('inverts mapbase YupToZupScale', () => {
    expect(fabricZupScaleToYup([2, 2, 2])).toEqual([2, 2, 2]);
    expect(fabricZupScaleToYup([1, 3, 2])).toEqual([1, 2, 3]);
  });
});
