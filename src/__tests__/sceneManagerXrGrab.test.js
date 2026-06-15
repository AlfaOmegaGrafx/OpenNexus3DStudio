import { describe, expect, it, vi } from 'vitest';
import * as THREE from '../library/three.js';
import { SceneManagerXrGrab } from '../library/sceneManagerXrGrab.js';

describe('SceneManagerXrGrab', () => {
  it('adjusts ray distance along pointer when right stick is used while holding', () => {
    const parent = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    mesh.position.set(0, 1, -1);
    parent.add(mesh);

    const sceneManager = {
      scene: new THREE.Scene(),
      propsRoot: parent,
      emit: vi.fn(),
    };

    const grab = new SceneManagerXrGrab(sceneManager);
    grab._grabbableRoots = [mesh];
    grab.activeGrabs.set('right', {
      object: mesh,
      mode: 'distance',
      anchor: new THREE.Vector3(0, 1, -1),
      rayDistance: 1,
      worldGrabDelta: new THREE.Vector3(0, 0, 0),
    });

    const pointer = {
      handedness: 'right',
      rayOrigin: new THREE.Vector3(0, 1.5, 0),
      rayDirection: new THREE.Vector3(0, 0, -1),
      selectPressed: true,
    };

    grab.applyRightStickPlacement(1, 0.5, [pointer]);
    expect(grab.activeGrabs.get('right').rayDistance).toBeGreaterThan(1);
  });

  it('reports active grab state', () => {
    const grab = new SceneManagerXrGrab({ scene: new THREE.Scene(), emit: vi.fn() });
    expect(grab.hasActiveGrab()).toBe(false);
    grab.activeGrabs.set('left', {
      object: new THREE.Object3D(),
      mode: 'distance',
      anchor: new THREE.Vector3(),
      rayDistance: 1,
      worldGrabDelta: new THREE.Vector3(),
    });
    expect(grab.hasActiveGrab()).toBe(true);
  });
});
