import { describe, expect, it, vi } from 'vitest';
import * as THREE from '../library/three.js';
import { SceneManagerXrTeleport } from '../library/sceneManagerXrTeleport.js';

describe('SceneManagerXrTeleport', () => {
  it('moves locomotion rig when teleport aim is released on valid target', () => {
    const rig = new THREE.Group();
  rig.position.set(0, 0, 0);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0.2, 1.6, 0.1);
    const scene = new THREE.Scene();

    const sceneManager = {
      xrLocomotionRig: rig,
      camera,
      scene,
      emit: vi.fn(),
    };

    const teleport = new SceneManagerXrTeleport(sceneManager);
    const right = {
      connected: true,
      handedness: 'right',
      axes: [0, 0, 0, 0.9],
      rayOrigin: new THREE.Vector3(0, 1.5, 0),
      rayDirection: new THREE.Vector3(0, -0.2, -1).normalize(),
    };

    teleport.update(right);
    expect(teleport.isAiming()).toBe(true);

    right.axes = [0, 0, 0, 0];
    teleport.update(right);

    expect(teleport.isAiming()).toBe(false);
    expect(rig.position.length()).toBeGreaterThan(0);
  });
});
