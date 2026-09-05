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

  it('emits one pointer per hand and prefers hand when Galaxy controllers are dormant', () => {
    const input = new SceneManagerXrInput();
    const frame = {
      getPose(space) {
        if (!space) return null;
        const y = space === handRay ? 1.4 : 0.1;
        return {
          transform: {
            matrix: new Float32Array([
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              0, y, -0.5, 1,
            ]),
          },
        };
      },
    };
    const refSpace = {};
    const handRay = {};
    const ctrlRay = {};
    const hand = {
      handedness: 'left',
      profiles: ['generic-hand'],
      hand: {},
      targetRaySpace: handRay,
      gripSpace: handRay,
      gamepad: {
        connected: true,
        buttons: [{ pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }],
        axes: [],
      },
    };
    const dormantCtrl = {
      handedness: 'left',
      profiles: ['oculus-touch'],
      targetRaySpace: ctrlRay,
      gripSpace: ctrlRay,
      gamepad: {
        connected: true,
        buttons: [{ pressed: false, value: 0 }, { pressed: false, value: 0 }],
        axes: [0, 0, 0, 0],
      },
    };

    // Hand listed after dormant controller (Galaxy often keeps both).
    input.update(frame, refSpace, [dormantCtrl, hand]);
    expect(input.pointers).toHaveLength(1);
    expect(input.pointers[0].preferHand).toBe(true);
    expect(input.pointers[0].inputSource).toBe(hand);
    expect(input.pointers[0].rayOrigin.y).toBeCloseTo(1.4, 5);
  });

  it('switches to controller when buttons or stick are active', () => {
    const input = new SceneManagerXrInput();
    const frame = {
      getPose(space) {
        if (!space) return null;
        const y = space === handRay ? 1.4 : 1.1;
        return {
          transform: {
            matrix: new Float32Array([
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              0, y, -0.5, 1,
            ]),
          },
        };
      },
    };
    const refSpace = {};
    const handRay = {};
    const ctrlRay = {};
    const hand = {
      handedness: 'right',
      profiles: ['generic-hand'],
      hand: {},
      targetRaySpace: handRay,
      gripSpace: handRay,
      gamepad: { connected: true, buttons: [{ pressed: false, value: 0 }], axes: [] },
    };
    const ctrl = {
      handedness: 'right',
      profiles: ['oculus-touch'],
      targetRaySpace: ctrlRay,
      gripSpace: ctrlRay,
      gamepad: {
        connected: true,
        buttons: [{ pressed: false, value: 0 }, { pressed: false, value: 0 }],
        axes: [0, 0, 0.8, 0],
      },
    };

    input.update(frame, refSpace, [hand, ctrl]);
    expect(input.pointers).toHaveLength(1);
    expect(input.pointers[0].preferHand).toBe(false);
    expect(input.pointers[0].inputSource).toBe(ctrl);
    expect(input.pointers[0].rayOrigin.y).toBeCloseTo(1.1, 5);
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
