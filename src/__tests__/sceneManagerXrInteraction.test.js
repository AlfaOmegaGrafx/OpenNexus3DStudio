import { describe, expect, it } from 'vitest';
import * as THREE from '../library/three.js';
import { SceneManagerXrInput } from '../library/sceneManagerXrInput.js';
import {
  isXrGrabbableObject,
  resolveGrabbableRoot,
} from '../library/sceneManagerXrGrab.js';

describe('sceneManagerXrInput', () => {
  it('emits selectStart on rising trigger edge', () => {
    const input = new SceneManagerXrInput();
    const frame = {
      getPose(space) {
        if (!space) return null;
        return {
          transform: {
            matrix: new Float32Array([
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              0, 1.5, -0.5, 1,
            ]),
          },
        };
      },
    };
    const refSpace = {};
    const source = {
      handedness: 'right',
      profiles: ['oculus-touch'],
      targetRaySpace: {},
      gripSpace: {},
      gamepad: {
        connected: true,
        buttons: [{ pressed: false, value: 0 }],
        axes: [0, 0, 0, 0],
      },
    };

    input.update(frame, refSpace, [source]);
    expect(input.pointers[0].selectPressed).toBe(false);

    source.gamepad.buttons[0] = { pressed: true, value: 1 };
    input.update(frame, refSpace, [source]);
    expect(input.pointers[0].selectStart).toBe(true);
    expect(input.pointers[0].selectPressed).toBe(true);

    source.gamepad.buttons[0] = { pressed: false, value: 0 };
    input.update(frame, refSpace, [source]);
    expect(input.pointers[0].selectEnd).toBe(true);
  });
});

describe('sceneManagerXrGrab', () => {
  it('detects grabbable world props', () => {
    const prop = new THREE.Group();
    prop.userData.worldPropId = 'chair';
    prop.userData.interaction = { type: 'grabbable' };
    expect(isXrGrabbableObject(prop)).toBe(true);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    prop.add(mesh);
    expect(resolveGrabbableRoot(mesh)).toBe(prop);
  });

  it('rejects static props', () => {
    const prop = new THREE.Group();
    prop.userData.worldPropId = 'floor';
    prop.userData.interaction = { type: 'static' };
    expect(isXrGrabbableObject(prop)).toBe(false);
  });
});
