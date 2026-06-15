/**
 * Phase 3 — XR input surface for SceneManager (device-agnostic rays + select/squeeze).
 * @see docs/IWSDK_OPTION_A_MIGRATION_BLUEPRINT.md
 */
import * as THREE from './three.js';

/** @typedef {'left' | 'right' | 'none'} XrHandedness */

/**
 * @typedef {object} XrPointerState
 * @property {XrHandedness} handedness
 * @property {boolean} connected
 * @property {boolean} preferHand
 * @property {THREE.Vector3} rayOrigin
 * @property {THREE.Vector3} rayDirection
 * @property {THREE.Vector3} gripPosition
 * @property {THREE.Quaternion} gripQuaternion
 * @property {boolean} selectPressed
 * @property {boolean} selectStart
 * @property {boolean} selectEnd
 * @property {boolean} squeezePressed
 * @property {boolean} squeezeStart
 * @property {boolean} squeezeEnd
 * @property {boolean} pinchActive
 * @property {number[]} axes
 * @property {XRInputSource|null} inputSource
 */

const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _dir = new THREE.Vector3(0, 0, -1);

function isHandTrackingSource(inputSource) {
  const profiles = Array.isArray(inputSource?.profiles) ? inputSource.profiles : [];
  const p = profiles.join(' ').toLowerCase();
  return (
    p.includes('generic-hand') ||
    p.includes('hand-select') ||
    p.includes('generic-fixed-hand') ||
    p.includes('hand-tracking')
  );
}

function isControllerLive(inputSource) {
  if (!inputSource?.gamepad) return false;
  const gp = inputSource.gamepad;
  if (gp.connected === false) return false;
  return gp.buttons?.length > 0 || gp.axes?.length > 0;
}

function shouldPreferHand(xrInputSources, handedness) {
  const hand = xrInputSources.find(
    (s) => s.handedness === handedness && isHandTrackingSource(s),
  );
  const ctrl = xrInputSources.find(
    (s) => s.handedness === handedness && !isHandTrackingSource(s) && isControllerLive(s),
  );
  if (hand && !ctrl) return true;
  if (ctrl && !hand) return false;
  if (hand && ctrl) return !isControllerLive(ctrl);
  return !!hand;
}

function readSelectPressed(inputSource) {
  const gp = inputSource?.gamepad;
  if (!gp?.buttons?.length) return false;
  const trigger = gp.buttons[0];
  if (trigger?.pressed || (typeof trigger?.value === 'number' && trigger.value > 0.45)) {
    return true;
  }
  if (isHandTrackingSource(inputSource) && gp.buttons.length >= 5) {
    const pinch = gp.buttons[4];
    if (pinch?.pressed || (typeof pinch?.value === 'number' && pinch.value > 0.45)) {
      return true;
    }
  }
  return false;
}

function readSqueezePressed(inputSource) {
  const gp = inputSource?.gamepad;
  if (!gp?.buttons?.length || gp.buttons.length < 2) return false;
  const grip = gp.buttons[1];
  return !!(grip?.pressed || (typeof grip?.value === 'number' && grip.value > 0.45));
}

function poseFromSpace(frame, space, referenceSpace) {
  if (!frame || !space || !referenceSpace) return null;
  try {
    const pose = frame.getPose(space, referenceSpace);
    if (!pose?.transform) return null;
    _matrix.fromArray(pose.transform.matrix);
    _matrix.decompose(_pos, _quat, _scale);
    _dir.set(0, 0, -1).applyQuaternion(_quat);
    return {
      position: _pos.clone(),
      quaternion: _quat.clone(),
      direction: _dir.clone(),
    };
  } catch {
    return null;
  }
}

/**
 * Normalize XR input each frame — mirrors IWSDK headsetUpdatePointers contract.
 */
export class SceneManagerXrInput {
  constructor() {
    /** @type {Map<string, { select: boolean, squeeze: boolean }>} */
    this._prev = new Map();
    this.pointers = /** @type {XrPointerState[]} */ ([]);
  }

  reset() {
    this._prev.clear();
    this.pointers = [];
  }

  /**
   * @param {XRFrame} frame
   * @param {XRReferenceSpace} referenceSpace
   * @param {XRInputSource[]} inputSources
   */
  update(frame, referenceSpace, inputSources) {
    this.pointers = [];
    if (!frame || !referenceSpace) return this.pointers;

    const sources = Array.isArray(inputSources) ? inputSources : [];

    for (const src of sources) {
      if (!src || src.handedness === 'none') continue;

      const handedness = /** @type {XrHandedness} */ (src.handedness);
      const key = handedness;
      const prev = this._prev.get(key) || { select: false, squeeze: false };

      const selectPressed = readSelectPressed(src);
      const squeezePressed = readSqueezePressed(src);
      const selectStart = selectPressed && !prev.select;
      const selectEnd = !selectPressed && prev.select;
      const squeezeStart = squeezePressed && !prev.squeeze;
      const squeezeEnd = !squeezePressed && prev.squeeze;

      this._prev.set(key, { select: selectPressed, squeeze: squeezePressed });

      const rayPose = poseFromSpace(frame, src.targetRaySpace, referenceSpace);
      const gripPose = poseFromSpace(frame, src.gripSpace, referenceSpace);
      if (!rayPose && !gripPose) continue;

      const gp = src.gamepad;
      const axes = gp?.axes ? Array.from(gp.axes) : [];

      this.pointers.push({
        handedness,
        connected: true,
        preferHand: shouldPreferHand(sources, handedness),
        rayOrigin: rayPose?.position || gripPose.position.clone(),
        rayDirection: rayPose?.direction || new THREE.Vector3(0, 0, -1),
        gripPosition: gripPose?.position || rayPose.position.clone(),
        gripQuaternion: gripPose?.quaternion || rayPose.quaternion.clone(),
        selectPressed,
        selectStart,
        selectEnd,
        squeezePressed,
        squeezeStart,
        squeezeEnd,
        pinchActive: selectPressed && isHandTrackingSource(src),
        axes,
        inputSource: src,
      });
    }

    return this.pointers;
  }
}
