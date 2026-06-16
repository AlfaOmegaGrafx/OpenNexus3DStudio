/**
 * XR avatar presentation: third-person (editing) vs first-person embody.
 */
import * as THREE from './three.js';

export const XR_AVATAR_VIEW_THIRD_PERSON = 'third_person';
export const XR_AVATAR_VIEW_FIRST_PERSON = 'first_person';

/** Place avatar this far in front of the headset on third-person entry (m). */
const THIRD_PERSON_STANDOFF_M = 1.75;

const _forward = new THREE.Vector3();
const _worldPos = new THREE.Vector3();

export class SceneManagerXrAvatarView {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    /** @type {'third_person'|'first_person'} */
    this.mode = XR_AVATAR_VIEW_THIRD_PERSON;
    this._playerVisibleBeforeXr = true;
    this._savedLocalPosition = null;
    this._standoffApplied = false;
  }

  reset() {
    this._restorePlayerRootTransform();
    const playerRoot = this.sceneManager?.playerRoot;
    if (playerRoot) {
      playerRoot.visible = this._playerVisibleBeforeXr;
    }
    this.mode = XR_AVATAR_VIEW_THIRD_PERSON;
    this._savedLocalPosition = null;
    this._standoffApplied = false;
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
      playerRoot.visible = false;
      this.mode = XR_AVATAR_VIEW_FIRST_PERSON;
    } else {
      playerRoot.visible = true;
      this._applyThirdPersonStandoff();
      this.mode = XR_AVATAR_VIEW_THIRD_PERSON;
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
    this._applyThirdPersonStandoff();
    this.sceneManager.emit?.('xrAvatarViewMode', { mode: this.mode });
  }

  onSessionEnd() {
    this.reset();
  }

  _applyThirdPersonStandoff() {
    const playerRoot = this.sceneManager?.playerRoot;
    const camera = this.sceneManager?.camera;
    if (!playerRoot || !camera || this._standoffApplied) return;

    if (!this._savedLocalPosition) {
      this._savedLocalPosition = playerRoot.position.clone();
    }

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
}
