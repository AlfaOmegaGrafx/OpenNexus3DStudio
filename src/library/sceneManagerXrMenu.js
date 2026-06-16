/**
 * In-headset menu (left controller Y) — bridges 2D viewport features into WebXR.
 */
import * as THREE from './three.js';
import {
  XR_AVATAR_VIEW_FIRST_PERSON,
  XR_AVATAR_VIEW_THIRD_PERSON,
} from './sceneManagerXrAvatarView.js';

const PANEL_W = 0.42;
const PANEL_H = 0.28;
const MENU_BUTTON_Y = 5;
const TOGGLE_BUTTON_X = 4;

/**
 * @param {string} text
 * @param {number} width
 * @param {number} height
 */
function createTextTexture(text, width = 512, height = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = 'rgba(12, 16, 28, 0.92)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e8ecf4';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export class SceneManagerXrMenu {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   * @param {import('./sceneManagerXrAvatarView.js').SceneManagerXrAvatarView} avatarView
   */
  constructor(sceneManager, avatarView) {
    this.sceneManager = sceneManager;
    this.avatarView = avatarView;
    this.open = false;
    this._group = null;
    this._prevLeftY = false;
    this._prevLeftX = false;
    this._statusLabel = null;
  }

  reset() {
    this._destroyPanel();
    this.open = false;
    this._prevLeftY = false;
    this._prevLeftX = false;
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   */
  update(pointers) {
    const left = pointers.find((p) => p.handedness === 'left');
    if (!left?.connected || !left.inputSource?.gamepad) {
      if (this.open) this._updatePanelPose(left);
      return;
    }

    const buttons = left.inputSource.gamepad.buttons || [];
    const yPressed = !!(buttons[MENU_BUTTON_Y]?.pressed || buttons[MENU_BUTTON_Y]?.value > 0.5);
    const xPressed = !!(buttons[TOGGLE_BUTTON_X]?.pressed || buttons[TOGGLE_BUTTON_X]?.value > 0.5);

    if (yPressed && !this._prevLeftY) {
      this.open = !this.open;
      if (this.open) {
        this._createPanel();
      } else {
        this._destroyPanel();
      }
    }

    if (this.open && xPressed && !this._prevLeftX) {
      this.avatarView.toggleMode();
      this._refreshStatusLabel();
    }

    this._prevLeftY = yPressed;
    this._prevLeftX = xPressed;

    if (this.open) {
      this._updatePanelPose(left);
    }
  }

  _createPanel() {
    this._destroyPanel();
    const scene = this.sceneManager?.scene;
    if (!scene) return;

    const group = new THREE.Group();
    group.name = 'XRFeatureMenu';

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(PANEL_W, PANEL_H),
      new THREE.MeshBasicMaterial({
        color: 0x0c101c,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
      }),
    );
    group.add(bg);

    const titleTex = createTextTexture('XR Menu — Y close');
    if (titleTex) {
      const title = new THREE.Mesh(
        new THREE.PlaneGeometry(PANEL_W * 0.92, 0.05),
        new THREE.MeshBasicMaterial({ map: titleTex, transparent: true }),
      );
      title.position.y = 0.09;
      group.add(title);
    }

    const hintTex = createTextTexture('X: Third person / Embody');
    if (hintTex) {
      const hint = new THREE.Mesh(
        new THREE.PlaneGeometry(PANEL_W * 0.92, 0.05),
        new THREE.MeshBasicMaterial({ map: hintTex, transparent: true }),
      );
      hint.position.y = 0.02;
      group.add(hint);
    }

    const statusTex = createTextTexture(this._modeLabel());
    if (statusTex) {
      const status = new THREE.Mesh(
        new THREE.PlaneGeometry(PANEL_W * 0.92, 0.05),
        new THREE.MeshBasicMaterial({ map: statusTex, transparent: true }),
      );
      status.position.y = -0.05;
      status.name = 'XRMenuStatus';
      group.add(status);
      this._statusLabel = status;
    }

    const futureTex = createTextTexture('More 2D tools coming soon');
    if (futureTex) {
      const future = new THREE.Mesh(
        new THREE.PlaneGeometry(PANEL_W * 0.92, 0.04),
        new THREE.MeshBasicMaterial({ map: futureTex, transparent: true, opacity: 0.85 }),
      );
      future.position.y = -0.11;
      group.add(future);
    }

    scene.add(group);
    this._group = group;
    console.info('[XR][menu] Opened — X toggles avatar view, Y closes');
  }

  _destroyPanel() {
    if (!this._group) return;
    this._group.parent?.remove(this._group);
    this._group.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
        if (child.material?.map) child.material.map.dispose();
        child.material?.dispose?.();
      }
    });
    this._group = null;
    this._statusLabel = null;
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState|undefined} left
   */
  _updatePanelPose(left) {
    if (!this._group || !left) return;
    this._group.position.copy(left.gripPosition);
    this._group.quaternion.copy(left.gripQuaternion);
    this._group.translateZ(-0.08);
    this._group.translateY(0.06);
  }

  _modeLabel() {
    return this.avatarView.mode === XR_AVATAR_VIEW_FIRST_PERSON
      ? 'View: Embody (1st person)'
      : 'View: Third person';
  }

  _refreshStatusLabel() {
    if (!this._statusLabel) return;
    const tex = createTextTexture(this._modeLabel());
    if (!tex) return;
    this._statusLabel.material.map?.dispose();
    this._statusLabel.material.map = tex;
    this._statusLabel.material.needsUpdate = true;
    console.info('[XR][menu] Avatar view:', this.avatarView.mode);
  }
}
