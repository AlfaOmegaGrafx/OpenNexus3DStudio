/**
 * Space-Time XR minimal settings HUD — left Y toggles grip-attached panel.
 */
import * as THREE from 'three';
import { XR_LOCOMOTION_MODE_AVATAR } from './sceneManagerXrConstants.js';
import { labelSpacetimeXrControlMode } from './spacetimeXrAvatarView.js';

const MENU_BUTTON_Y = 5;
const PANEL_W = 0.54;
const PANEL_H = 0.56;
const PAD = 0.012;
const ROW_H = 0.055;
const ROW_GAP = 0.008;
const LABEL_FONT_PX = 44;
const PANEL_YAW = 0;
const PANEL_PITCH_UP = -Math.PI / 4;
const PANEL_GRIP_FORWARD_M = 0.34;
const PANEL_GRIP_DOWN_M = 0.16;
const PANEL_BOTTOM_LIFT_M = -((-PANEL_H / 2) * Math.cos(PANEL_PITCH_UP));
const PANEL_BG_OPACITY = 0.28;
const CONTENT_W = PANEL_W - PAD * 2;

const _raycaster = new THREE.Raycaster();
const _rayDir = new THREE.Vector3();

/**
 * @param {string} text
 * @param {{ active?: boolean }} [opts]
 */
function createLabelTexture(text, opts = {}) {
  const width = 768;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = opts.active ? '#1a4030' : '#141a28';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = opts.active ? '#22ff66' : '#3a4660';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, width - 4, height - 4);
  ctx.fillStyle = '#e8ecf4';
  ctx.font = `bold ${LABEL_FONT_PX}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * @param {THREE.Group} parent
 * @param {number} y
 * @param {string} action
 * @param {string} label
 * @param {boolean} [active]
 */
function addRow(parent, y, action, label, active = false) {
  const tex = createLabelTexture(label, { active });
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0xffffff,
    transparent: false,
    depthTest: true,
    side: THREE.FrontSide,
  });
  const row = new THREE.Mesh(new THREE.PlaneGeometry(CONTENT_W, ROW_H), mat);
  row.position.set(0, y, 0.004);
  row.userData.xrMenuAction = action;
  row.userData.xrMenuLabel = label;
  row.renderOrder = 1001;
  parent.add(row);
  return row;
}

function stackY(index, total) {
  const top = PANEL_H / 2 - PAD - ROW_H / 2;
  return top - index * (ROW_H + ROW_GAP);
}

export class SpacetimeXrMenu {
  /**
   * @param {{ scene: THREE.Scene, avatarView: import('./spacetimeXrAvatarView.js').SpacetimeXrAvatarView, locomotion: import('./spacetimeXrLocomotion.js').SpacetimeXrLocomotion, onPickAvatar?: () => void, onControlModeChange?: (mode: string, label: string) => void }} ctx
   */
  constructor(ctx) {
    this.scene = ctx.scene;
    this.avatarView = ctx.avatarView;
    this.locomotion = ctx.locomotion;
    this.onPickAvatar = ctx.onPickAvatar ?? null;
    this.onControlModeChange = ctx.onControlModeChange ?? null;
    this.open = false;
    this._prevLeftY = false;
    /** @type {THREE.Group|null} */
    this._group = null;
    /** @type {THREE.Group|null} */
    this._panelContent = null;
    /** @type {THREE.Mesh[]} */
    this._hitTargets = [];
    /** @type {THREE.Mesh|null} */
    this._hovered = null;
    /** @type {Map<string, THREE.Mesh>} */
    this._rows = new Map();
  }

  reset() {
    this.open = false;
    this._prevLeftY = false;
    this._destroyPanel();
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   * @returns {boolean} true if a menu action fired this frame
   */
  update(pointers) {
    const left = pointers.find((p) => p.handedness === 'left');

    if (left?.connected && left.inputSource?.gamepad) {
      const buttons = left.inputSource.gamepad.buttons || [];
      const yPressed = !!(buttons[MENU_BUTTON_Y]?.pressed || buttons[MENU_BUTTON_Y]?.value > 0.5);
      if (yPressed && !this._prevLeftY) {
        this.open = !this.open;
        if (this.open) {
          this._createPanel();
        } else {
          this._destroyPanel();
        }
      }
      this._prevLeftY = yPressed;
    }

    if (!this.open) return false;

    this._refreshLabels();
    this._updatePanelPose(left);

    for (const pointer of pointers) {
      if (!pointer?.connected || !pointer.selectStart) continue;
      const hit = this._raycast(pointer);
      if (hit?.action && this._runAction(hit.action)) {
        return true;
      }
    }

    this._updateHover(pointers);
    return false;
  }

  _viewLabel() {
    return `View: ${labelSpacetimeXrControlMode(this.avatarView.controlMode)}`;
  }

  _locoLabel() {
    return this.locomotion.mode === XR_LOCOMOTION_MODE_AVATAR
      ? 'Move: Avatar'
      : 'Move: Viewpoint';
  }

  _refreshLabels() {
    this._updateRowLabel(
      'toggle-view',
      this._viewLabel(),
      this.avatarView.isFirstPerson(),
    );
    this._updateRowLabel(
      'toggle-locomotion',
      this._locoLabel(),
      this.locomotion.mode === XR_LOCOMOTION_MODE_AVATAR,
    );
  }

  /**
   * @param {string} action
   * @param {string} label
   * @param {boolean} active
   */
  _updateRowLabel(action, label, active) {
    const row = this._rows.get(action);
    if (!row?.material) return;
    const prev = row.userData.xrMenuLabel;
    const prevActive = row.userData.xrMenuActive;
    if (prev === label && prevActive === active) return;
    row.userData.xrMenuLabel = label;
    row.userData.xrMenuActive = active;
    const tex = createLabelTexture(label, { active });
    if (row.material.map) row.material.map.dispose();
    row.material.map = tex;
    row.material.needsUpdate = true;
  }

  /**
   * @param {string} action
   */
  _runAction(action) {
    if (action === 'close') {
      this.open = false;
      this._destroyPanel();
      return true;
    }
    if (action === 'toggle-view') {
      if (this.avatarView.hasAvatar()) {
        const mode = this.avatarView.cycleControl(1);
        this.onControlModeChange?.(
          mode,
          labelSpacetimeXrControlMode(mode),
        );
      }
      this._refreshLabels();
      console.info('[spacetime-xr] menu toggle view');
      return true;
    }
    if (action === 'toggle-locomotion') {
      if (this.avatarView.isAvatarLocomotion()) {
        this.locomotion.toggleMode();
      } else if (this.avatarView.isThirdPersonFollow()) {
        this.avatarView.maintainThirdPersonFollow();
      } else {
        this.locomotion.toggleMode();
      }
      this._refreshLabels();
      console.info('[spacetime-xr] menu toggle locomotion');
      return true;
    }
    if (action === 'pick-avatar') {
      this.open = false;
      this._destroyPanel();
      this.onPickAvatar?.();
      console.info('[spacetime-xr] menu pick avatar');
      return true;
    }
    return false;
  }

  _createPanel() {
    this._destroyPanel();
    if (!this.scene) return;

    const group = new THREE.Group();
    group.name = 'SpacetimeXrMenu';

    const panelContent = new THREE.Group();
    panelContent.name = 'SpacetimeXrMenuContent';
    panelContent.rotation.y = PANEL_YAW;
    panelContent.rotation.x = PANEL_PITCH_UP;
    panelContent.position.y = PANEL_BOTTOM_LIFT_M;
    group.add(panelContent);
    this._panelContent = panelContent;

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(PANEL_W, PANEL_H),
      new THREE.MeshBasicMaterial({
        color: 0x0a0e18,
        transparent: true,
        opacity: PANEL_BG_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    bg.userData.xrMenuBackdrop = true;
    panelContent.add(bg);

    addRow(panelContent, stackY(0, 4), 'pick-avatar', 'Pick Avatar', false);
    addRow(panelContent, stackY(1, 4), 'toggle-view', this._viewLabel(), this.avatarView.isFirstPerson());
    addRow(
      panelContent,
      stackY(2, 4),
      'toggle-locomotion',
      this._locoLabel(),
      this.locomotion.mode === XR_LOCOMOTION_MODE_AVATAR,
    );
    addRow(panelContent, stackY(3, 4), 'close', 'Close (Y)', false);

    this._rows.clear();
    panelContent.traverse((child) => {
      if (child.isMesh && child.userData.xrMenuAction) {
        this._rows.set(child.userData.xrMenuAction, child);
        this._hitTargets.push(child);
      }
    });

    this.scene.add(group);
    this._group = group;
    console.info('[spacetime-xr] menu open');
  }

  _destroyPanel() {
    if (!this._group) return;
    this.scene?.remove(this._group);
    this._group.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose?.();
        if (child.material?.map) child.material.map.dispose();
        child.material?.dispose?.();
      }
    });
    this._group = null;
    this._panelContent = null;
    this._hitTargets = [];
    this._rows.clear();
    this._hovered = null;
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState|undefined} left
   */
  _updatePanelPose(left) {
    if (!this._group || !left?.gripPosition) return;
    this._group.position.copy(left.gripPosition);
    if (left.gripQuaternion) {
      this._group.quaternion.copy(left.gripQuaternion);
    }
    this._group.translateZ(-PANEL_GRIP_FORWARD_M);
    this._group.translateY(-PANEL_GRIP_DOWN_M);
    this._group.updateMatrixWorld(true);
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   * @returns {{ distance: number, point: THREE.Vector3 }|null}
   */
  raycastDistance(pointer) {
    if (!this.open || !pointer?.connected || this._hitTargets.length === 0) {
      return null;
    }
    _raycaster.far = 4;
    _raycaster.set(pointer.rayOrigin, _rayDir.copy(pointer.rayDirection).normalize());
    const hits = _raycaster.intersectObjects(this._hitTargets, false);
    const hit = hits.find((h) => h.object?.userData?.xrMenuAction) || hits[0];
    if (!hit?.distance) return null;
    return { distance: hit.distance, point: hit.point.clone() };
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   */
  _raycast(pointer) {
    _raycaster.far = 4;
    _raycaster.set(pointer.rayOrigin, _rayDir.copy(pointer.rayDirection).normalize());
    const hits = _raycaster.intersectObjects(this._hitTargets, false);
    const hit = hits.find((h) => h.object?.userData?.xrMenuAction) || hits[0];
    if (!hit?.object?.userData?.xrMenuAction) return null;
    return { action: hit.object.userData.xrMenuAction, object: hit.object };
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   */
  _updateHover(pointers) {
    let next = null;
    for (const pointer of pointers) {
      if (!pointer?.connected) continue;
      const hit = this._raycast(pointer);
      if (hit?.object) {
        next = hit.object;
        break;
      }
    }
    if (this._hovered === next) return;
    if (this._hovered?.material?.color) {
      this._hovered.material.color.setHex(0xffffff);
    }
    this._hovered = next;
    if (next?.material?.color && next.userData.xrMenuAction !== 'close') {
      next.material.color.setHex(0xa8ffc4);
    }
  }
}
