/**
 * XR avatar presentation: third-person (editing) vs first-person embody.
 */
import * as THREE from './three.js';
import {
  snapTurnLocomotionRigAroundViewer,
  XR_LOCOMOTION_MODE_VIEWPOINT,
} from './sceneManagerXrLocomotion.js';

export const XR_AVATAR_VIEW_THIRD_PERSON = 'third_person';
export const XR_AVATAR_VIEW_FIRST_PERSON = 'first_person';

/** Place avatar this far in front of the headset on third-person entry (m). */
const THIRD_PERSON_STANDOFF_M = 1.75;
/** After disembody, pull the viewpoint this far behind the avatar (m). */
export const THIRD_PERSON_BEHIND_M = 1.0;

const _forward = new THREE.Vector3();
const _avatarFwd = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _headPos = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();

/**
 * Resolve avatar head world position (VRM humanoid → bone name → bbox estimate).
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3|null}
 */
export function getAvatarHeadWorldPosition(sceneManager, out = _headPos) {
  const vrm = sceneManager?.currentVRM;
  const headNode = vrm?.humanoid?.humanBones?.head?.node;
  if (headNode) {
    headNode.getWorldPosition(out);
    return out;
  }

  const model = sceneManager?.currentModel || sceneManager?.playerRoot;
  if (!model) return null;

  let found = null;
  model.traverse((child) => {
    if (found) return;
    if (!child.isBone) return;
    const n = String(child.name || '').toLowerCase();
    if (n === 'head' || n.includes('head')) {
      found = child;
    }
  });
  if (found) {
    found.getWorldPosition(out);
    return out;
  }

  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty() || !Number.isFinite(box.max.y)) return null;
  box.getCenter(out);
  out.y = box.max.y - Math.min(0.12, (box.max.y - box.min.y) * 0.08);
  return out;
}

/**
 * Flat forward (−Z) of an Object3D in world space.
 * @param {THREE.Object3D} obj
 * @param {THREE.Vector3} out
 */
function getFlatForward(obj, out) {
  obj.getWorldDirection(out);
  out.y = 0;
  if (out.lengthSq() < 1e-6) {
    out.set(0, 0, -1);
  } else {
    out.normalize();
  }
  return out;
}

export class SceneManagerXrAvatarView {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   * @param {import('./sceneManagerXrLocomotion.js').SceneManagerXrLocomotion|null} [locomotion]
   */
  constructor(sceneManager, locomotion = null) {
    this.sceneManager = sceneManager;
    this.locomotion = locomotion;
    /** @type {'third_person'|'first_person'} */
    this.mode = XR_AVATAR_VIEW_THIRD_PERSON;
    this._playerVisibleBeforeXr = true;
    this._savedLocalPosition = null;
    this._savedRigPosition = null;
    this._savedRigRotationY = null;
    this._standoffApplied = false;
    /** True after user has embodied at least once this session — skip re-standoff on session. */
    this._embodiedOnce = false;
  }

  reset() {
    // Persist whatever transform the user left in XR.
    // Previously we restored transforms back to the pre-standoff saved values
    // (often (0,0,0)), which overwrote user edits on XR exit.
    const playerRootNow = this.sceneManager?.playerRoot;
    const rig = this.sceneManager?.xrLocomotionRig;
    if (playerRootNow) {
      this._savedLocalPosition = playerRootNow.position.clone();
    }
    if (rig) {
      this._savedRigPosition = rig.position.clone();
      this._savedRigRotationY = rig.rotation.y;
    }

    this._restorePlayerRootTransform();
    this._restoreRigTransform();
    const playerRoot = this.sceneManager?.playerRoot;
    if (playerRoot) {
      playerRoot.visible = this._playerVisibleBeforeXr;
    }
    this.mode = XR_AVATAR_VIEW_THIRD_PERSON;
    this._savedLocalPosition = null;
    this._savedRigPosition = null;
    this._savedRigRotationY = null;
    this._standoffApplied = false;
    this._embodiedOnce = false;
  }

  hasAvatar() {
    return !!(this.sceneManager?.playerRoot && this.sceneManager?.currentModel);
  }

  /**
   * @param {'third_person'|'first_person'} mode
   */
  setMode(mode) {
    if (!this.hasAvatar()) return this.mode;

    const playerRoot = this.sceneManager.playerRoot;
    if (mode === XR_AVATAR_VIEW_FIRST_PERSON) {
      this._alignViewerToAvatarHeadAndFacing();
      playerRoot.visible = false;
      this._embodiedOnce = true;
      this.mode = XR_AVATAR_VIEW_FIRST_PERSON;
    } else {
      // Disembody: avatar at exit spot, viewpoint 1 m behind, Move → Viewpoint.
      this._placeAvatarAtDisembodySpot();
      this._offsetViewerBehindAvatar(THIRD_PERSON_BEHIND_M);
      playerRoot.visible = true;
      this.mode = XR_AVATAR_VIEW_THIRD_PERSON;
      this.locomotion?.setMode?.(XR_LOCOMOTION_MODE_VIEWPOINT);
    }

    this.sceneManager.emit?.('xrAvatarViewMode', { mode: this.mode });
    return this.mode;
  }

  toggleMode() {
    return this.setMode(
      this.mode === XR_AVATAR_VIEW_FIRST_PERSON
        ? XR_AVATAR_VIEW_THIRD_PERSON
        : XR_AVATAR_VIEW_FIRST_PERSON,
    );
  }

  /**
   * @param {{ isVR?: boolean }} [options]
   */
  onSessionStart(options = {}) {
    if (!this.hasAvatar() || options.isVR === false) return;

    const playerRoot = this.sceneManager.playerRoot;
    this._playerVisibleBeforeXr = playerRoot.visible;
    this.mode = XR_AVATAR_VIEW_THIRD_PERSON;
    playerRoot.visible = true;
    this._embodiedOnce = false;
    this._standoffApplied = false;
    // Third-person standoff runs after viewport align (first XR frame).
    this.sceneManager.emit?.('xrAvatarViewMode', { mode: this.mode });
  }

  /** Place avatar in front of the headset once the viewer is at the viewport spawn. */
  applyEntryStandoff() {
    if (!this.hasAvatar()) return;
    if (this.mode !== XR_AVATAR_VIEW_THIRD_PERSON) return;
    this._applyThirdPersonStandoff();
  }

  onSessionEnd() {
    this.reset();
  }

  /**
   * Rotate then translate the locomotion rig so the headset matches the avatar
   * head position and facing.
   */
  _alignViewerToAvatarHeadAndFacing() {
    const camera = this.sceneManager?.camera;
    const rig = this.sceneManager?.xrLocomotionRig;
    const playerRoot = this.sceneManager?.playerRoot;
    const head = getAvatarHeadWorldPosition(this.sceneManager, _headPos);
    if (!camera || !rig || !head || !playerRoot) return;

    if (!this._savedRigPosition) {
      this._savedRigPosition = rig.position.clone();
      this._savedRigRotationY = rig.rotation.y;
    }

    // 1) Yaw world around viewer so avatar forward matches headset forward.
    getFlatForward(playerRoot, _avatarFwd);
    getFlatForward(camera, _camFwd);
    const cross = _avatarFwd.x * _camFwd.z - _avatarFwd.z * _camFwd.x;
    const dot = _avatarFwd.x * _camFwd.x + _avatarFwd.z * _camFwd.z;
    const yawDelta = Math.atan2(cross, dot);
    if (Math.abs(yawDelta) > 1e-3) {
      snapTurnLocomotionRigAroundViewer(rig, camera, yawDelta);
      // Head moved with the yaw — refresh.
      getAvatarHeadWorldPosition(this.sceneManager, _headPos);
    }

    // 2) Translate XZ so head lands under the headset.
    // Do NOT move Y — shifting the rig vertically drifts the floor plane and can
    // leave the avatar under the floor after embody ↔ third-person toggles.
    camera.getWorldPosition(_camPos);
    _delta.copy(_camPos).sub(_headPos);
    _delta.y = 0;

    const parent = rig.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      parent.getWorldQuaternion(_parentQuat);
      _delta.applyQuaternion(_parentQuat.invert());
      _delta.y = 0;
    }
    rig.position.add(_delta);
    rig.updateMatrixWorld(true);
  }

  /**
   * Drop the avatar at the headset's floor spot facing the headset forward.
   * While embodied the avatar rides with the rig under the viewer; this snaps
   * feet to that XZ so third-person starts where you exited FP.
   */
  _placeAvatarAtDisembodySpot() {
    const playerRoot = this.sceneManager?.playerRoot;
    const camera = this.sceneManager?.camera;
    if (!playerRoot || !camera) return;

    camera.updateMatrixWorld?.(true);
    camera.getWorldPosition(_camPos);
    getFlatForward(camera, _camFwd);

    // Feet under the headset (same XZ); keep standing height on the floor.
    playerRoot.getWorldPosition(_worldPos);
    const feetY = _worldPos.y;
    _worldPos.set(_camPos.x, feetY, _camPos.z);

    const parent = playerRoot.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      parent.worldToLocal(_worldPos);
      playerRoot.position.copy(_worldPos);
    } else {
      playerRoot.position.copy(_worldPos);
    }

    // World headset forward → parent-local, then yaw so the avatar faces that way.
    // (Must account for locomotion-rig yaw or the avatar faces the wrong way.)
    // This repo's Object3D yaw: θ=0 faces +Z ⇒ θ = atan2(fx, fz).
    if (parent) {
      parent.getWorldQuaternion(_parentQuat);
      _camFwd.applyQuaternion(_parentQuat.invert());
      _camFwd.y = 0;
      if (_camFwd.lengthSq() > 1e-6) {
        _camFwd.normalize();
      } else {
        _camFwd.set(0, 0, 1);
      }
    }
    playerRoot.rotation.set(0, Math.atan2(_camFwd.x, _camFwd.z), 0);
    playerRoot.updateMatrixWorld(true);
  }

  /**
   * Shift the locomotion rig so the headset sits `distanceM` behind the avatar
   * (avatar ends up that far in front of the viewer along avatar facing).
   * @param {number} distanceM
   */
  _offsetViewerBehindAvatar(distanceM = THIRD_PERSON_BEHIND_M) {
    const rig = this.sceneManager?.xrLocomotionRig;
    const playerRoot = this.sceneManager?.playerRoot;
    if (!rig || !playerRoot || !(distanceM > 0)) return;

    getFlatForward(playerRoot, _avatarFwd);
    // Move content forward along avatar facing → viewer is left behind.
    _delta.copy(_avatarFwd).multiplyScalar(distanceM);
    _delta.y = 0;

    const parent = rig.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      parent.getWorldQuaternion(_parentQuat);
      _delta.applyQuaternion(_parentQuat.invert());
      _delta.y = 0;
    }
    rig.position.add(_delta);
    rig.updateMatrixWorld(true);
  }

  _applyThirdPersonStandoff() {
    const playerRoot = this.sceneManager?.playerRoot;
    const camera = this.sceneManager?.camera;
    if (!playerRoot || !camera || this._standoffApplied || this._embodiedOnce) return;

    if (!this._savedLocalPosition) {
      this._savedLocalPosition = playerRoot.position.clone();
    }

    // World headset forward → parent-local, then yaw so the avatar faces that way.
    // Place avatar in front of the headset for third-person entry.
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) {
      _forward.set(0, 0, -1);
    } else {
      _forward.normalize();
    }

    _worldPos.copy(camera.position).addScaledVector(_forward, THIRD_PERSON_STANDOFF_M);
    _worldPos.y = playerRoot.position.y;

    const parent = playerRoot.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      parent.worldToLocal(_worldPos);
      playerRoot.position.copy(_worldPos);
    }

    playerRoot.updateMatrixWorld(true);
    this._standoffApplied = true;
  }

  _restorePlayerRootTransform() {
    const playerRoot = this.sceneManager?.playerRoot;
    if (!playerRoot || !this._savedLocalPosition) return;
    playerRoot.position.copy(this._savedLocalPosition);
    playerRoot.updateMatrixWorld(true);
  }

  _restoreRigTransform() {
    const rig = this.sceneManager?.xrLocomotionRig;
    if (!rig || !this._savedRigPosition) return;
    rig.position.copy(this._savedRigPosition);
    if (this._savedRigRotationY != null) {
      rig.rotation.y = this._savedRigRotationY;
    }
    rig.updateMatrixWorld(true);
  }
}
