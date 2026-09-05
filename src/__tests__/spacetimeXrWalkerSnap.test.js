import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getSpacetimeLocomotionCollisionAnchor,
  getSpacetimeWalkerCollisionAnchor,
  SPACETIME_THIRD_PERSON_FEET_LEAD_M,
} from '../library/spacetimeXrWalkerSnap.js';
import { SPACETIME_XR_EYE_TO_FLOOR } from '../library/spacetimeXrGroundFollow.js';

describe('spacetimeXrWalkerSnap collision anchors', () => {
  it('getSpacetimeWalkerCollisionAnchor uses feet XZ and eye Y', () => {
    const playerRoot = new THREE.Group();
    playerRoot.position.set(3, 8.4, -1);
    playerRoot.updateMatrixWorld(true);

    const anchor = getSpacetimeWalkerCollisionAnchor(playerRoot, new THREE.Vector3());
    expect(anchor.x).toBeCloseTo(3, 4);
    expect(anchor.z).toBeCloseTo(-1, 4);
    expect(anchor.y).toBeCloseTo(8.4 + SPACETIME_XR_EYE_TO_FLOOR, 4);
  });

  it('getSpacetimeLocomotionCollisionAnchor leads third-person follow toward walker feet', () => {
    const playerRoot = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.rotation.y = 0;
    camera.updateMatrixWorld(true);

    const anchor = getSpacetimeLocomotionCollisionAnchor(
      camera,
      playerRoot,
      { avatarControl: false, firstPersonEmbody: false, thirdPersonFollowLead: true },
      new THREE.Vector3(),
    );

    expect(anchor.x).toBeCloseTo(0, 4);
    expect(anchor.z).toBeCloseTo(-SPACETIME_THIRD_PERSON_FEET_LEAD_M, 4);
    expect(anchor.y).toBeCloseTo(1.6, 4);
  });

  it('getSpacetimeLocomotionCollisionAnchor uses walker feet when avatarControl', () => {
    const playerRoot = new THREE.Group();
    playerRoot.position.set(12, 8.4, 0);
    playerRoot.updateMatrixWorld(true);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(10.25, 10, 0);
    camera.rotation.y = 0;
    camera.updateMatrixWorld(true);

    const anchor = getSpacetimeLocomotionCollisionAnchor(
      camera,
      playerRoot,
      { avatarControl: true, firstPersonEmbody: false },
      new THREE.Vector3(),
    );

    expect(anchor.x).toBeCloseTo(12, 4);
    expect(anchor.z).toBeCloseTo(0, 4);
    expect(anchor.y).toBeCloseTo(8.4 + SPACETIME_XR_EYE_TO_FLOOR, 4);
  });
});
