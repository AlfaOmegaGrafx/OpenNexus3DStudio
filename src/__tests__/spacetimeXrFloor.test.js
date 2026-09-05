import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeSpacetimeFloorAnchorDiagnostics,
  computeSpacetimeFloorAnchorY,
} from '../library/spacetimeXrFloor.js';

describe('spacetimeXrFloor', () => {
  it('lifts content so lowest mesh sits on Y=0', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.set(0, 3, 0);
    root.add(mesh);

    expect(computeSpacetimeFloorAnchorY(root)).toBeCloseTo(-2, 4);
    const diag = computeSpacetimeFloorAnchorDiagnostics(root);
    expect(diag.source).toBe('fabric-bounds');
    expect(diag.boundsMinY).toBeCloseTo(2, 4);
  });

  it('prefers capsule floor object when present', () => {
    const root = new THREE.Group();
    const capsule = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.1, 2),
      new THREE.MeshBasicMaterial(),
    );
    capsule.name = 'Hello World!';
    capsule.position.set(0, 0.05, 0);
    root.add(capsule);

    const tall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 3, 1),
      new THREE.MeshBasicMaterial(),
    );
    tall.position.set(0, 2, 0);
    root.add(tall);

    const diag = computeSpacetimeFloorAnchorDiagnostics(root);
    expect(diag.source).toMatch(/^capsule:/);
    expect(diag.boundsMinY).toBeCloseTo(0, 4);
    expect(diag.floorAnchorY).toBeCloseTo(0, 4);
  });
});
