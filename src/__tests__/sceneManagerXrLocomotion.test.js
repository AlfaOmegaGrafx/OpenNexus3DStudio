import { describe, expect, it, vi } from 'vitest';
import * as THREE from '../library/three.js';
import { SceneManagerXrLocomotion } from '../library/sceneManagerXrLocomotion.js';

describe('SceneManagerXrLocomotion', () => {
  it('moves forward when left stick Y is negative (Quest / Galaxy forward)', () => {
    const rig = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);

    const sceneManager = {
      xrLocomotionRig: rig,
      camera,
      emit: vi.fn(),
    };

    const locomotion = new SceneManagerXrLocomotion(sceneManager);
    const startZ = rig.position.z;

    locomotion.update(1, [
      {
        handedness: 'left',
        axes: [0, 0, 0, 1],
      },
      {
        handedness: 'right',
        axes: [0, 0, 0, 0],
      },
    ]);

    expect(rig.position.z).toBeLessThan(startZ);
  });
});
