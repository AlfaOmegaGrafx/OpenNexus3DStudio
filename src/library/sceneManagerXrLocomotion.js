/**
 * Phase 5 — snap/continuous turn + slide locomotion on SceneManager XR locomotion rig.
 */
import * as THREE from './three.js';
import {
  applyDeadzone,
  readLeftThumbstickAxes,
  readRightThumbstickAxes,
} from './sceneManagerXrAxes.js';

const MOVE_SPEED = 2.4;
const SNAP_TURN_DEG = 30;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

export class SceneManagerXrLocomotion {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this._snapTurnArmed = true;
    this._lastTurnSign = 0;
  }

  reset() {
    const rig = this.sceneManager?.xrLocomotionRig;
    if (rig) {
      rig.position.set(0, 0, 0);
      rig.rotation.set(0, 0, 0);
    }
    this._snapTurnArmed = true;
    this._lastTurnSign = 0;
  }

  /**
   * @param {number} deltaSeconds
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   * @param {{ skipRightTurn?: boolean }} [options]
   */
  update(deltaSeconds, pointers, options = {}) {
    const rig = this.sceneManager?.xrLocomotionRig;
    const camera = this.sceneManager?.camera;
    if (!rig || !camera || !pointers.length) return;

    const left = pointers.find((p) => p.handedness === 'left') || null;
    const right = pointers.find((p) => p.handedness === 'right') || null;

    if (left) {
      const moveAxes = readLeftThumbstickAxes(left);
      const moveX = applyDeadzone(moveAxes.x);
      const moveY = applyDeadzone(moveAxes.y);

      if (moveX !== 0 || moveY !== 0) {
        camera.getWorldDirection(_forward);
        _forward.y = 0;
        if (_forward.lengthSq() < 1e-6) {
          _forward.set(0, 0, -1);
        } else {
          _forward.normalize();
        }
        _right.crossVectors(_forward, camera.up).normalize();
        _move.set(0, 0, 0);
        _move.addScaledVector(_forward, moveY * MOVE_SPEED * deltaSeconds);
        _move.addScaledVector(_right, -moveX * MOVE_SPEED * deltaSeconds);
        rig.position.add(_move);
        this.sceneManager.emit?.('xrLocomotion', { type: 'move', delta: _move.clone() });
      }
    }

    const rightStick = readRightThumbstickAxes(right);
    const turnAxis = options.skipRightTurn
      ? 0
      : applyDeadzone(
          Math.abs(rightStick.y) > Math.abs(rightStick.x) ? 0 : rightStick.x,
        );
    if (turnAxis !== 0) {
      const sign = Math.sign(turnAxis);
      if (this._snapTurnArmed || sign !== this._lastTurnSign) {
        const radians = THREE.MathUtils.degToRad(SNAP_TURN_DEG) * sign;
        rig.rotateY(radians);
        this.sceneManager.emit?.('xrLocomotion', { type: 'turn', radians });
        this._snapTurnArmed = false;
        this._lastTurnSign = sign;
      }
    } else {
      this._snapTurnArmed = true;
      this._lastTurnSign = 0;
    }
  }
}

/**
 * Insert locomotion rig inside vrSceneWrapper so floor anchor stays on wrapper.
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export function ensureXrLocomotionRig(sceneManager) {
  if (!sceneManager.vrSceneWrapper) return null;
  if (sceneManager.xrLocomotionRig?.parent === sceneManager.vrSceneWrapper) {
    return sceneManager.xrLocomotionRig;
  }

  const rig = new THREE.Group();
  rig.name = 'XRLocomotionRig';
  const kids = [...sceneManager.vrSceneWrapper.children];
  for (const child of kids) {
    if (child.name === 'XRLocomotionRig') continue;
    rig.add(child);
  }
  sceneManager.vrSceneWrapper.add(rig);
  sceneManager.xrLocomotionRig = rig;
  return rig;
}
