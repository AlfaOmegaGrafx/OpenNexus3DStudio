/**
 * Phase 5 — snap/continuous turn + slide locomotion on SceneManager XR locomotion rig.
 */
import * as THREE from './three.js';
import {
  applyDeadzone,
  readLeftThumbstickAxes,
  readRightThumbstickAxes,
} from './sceneManagerXrAxes.js';
import {
  XR_LOCOMOTION_MODE_AVATAR,
  XR_LOCOMOTION_MODE_VIEWPOINT,
} from './sceneManagerXrConstants.js';

export { XR_LOCOMOTION_MODE_AVATAR, XR_LOCOMOTION_MODE_VIEWPOINT };

const MOVE_SPEED = 2.4;
const SNAP_TURN_DEG = 30;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _headsetPos = new THREE.Vector3();
const _headsetFwd = new THREE.Vector3();
const _viewportFwd = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();
const _orientQuat = new THREE.Quaternion();
const _delta = new THREE.Vector3();
const _capPos = new THREE.Vector3();
const _capQuat = new THREE.Quaternion();
const _capInvQuat = new THREE.Quaternion();
const _capFwd = new THREE.Vector3();
const _capTarget = new THREE.Vector3();
const _capInv = new THREE.Matrix4();
const _capTmpPos = new THREE.Vector3();
const _capScale = new THREE.Vector3();
const _capEuler = new THREE.Euler();

/**
 * Snap-turn the locomotion rig around the viewer's floor position (not rig origin).
 * Keeps the headset fixed while the world rotates — standard VR comfort turn.
 * @param {THREE.Group} rig
 * @param {THREE.Camera} camera
 * @param {number} radians
 */
export function snapTurnLocomotionRigAroundViewer(rig, camera, radians) {
  const parent = rig.parent;
  camera.getWorldPosition(_pivot);
  if (parent) {
    parent.updateMatrixWorld(true);
    parent.worldToLocal(_pivot);
  }
  _pivot.y = rig.position.y;

  const ox = rig.position.x - _pivot.x;
  const oz = rig.position.z - _pivot.z;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  rig.position.x = _pivot.x + ox * cos + oz * sin;
  rig.position.z = _pivot.z + -ox * sin + oz * cos;
  rig.rotation.y += radians;
}

export class SceneManagerXrLocomotion {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    /** @type {'avatar'|'viewpoint'} — left stick only; right stick unchanged. */
    this.mode = XR_LOCOMOTION_MODE_VIEWPOINT;
    this._snapTurnArmed = true;
    this._lastTurnSign = 0;
  }

  setMode(mode) {
    if (mode !== XR_LOCOMOTION_MODE_AVATAR && mode !== XR_LOCOMOTION_MODE_VIEWPOINT) {
      return this.mode;
    }
    this.mode = mode;
    this.sceneManager.emit?.('xrLocomotionMode', { mode: this.mode });
    return this.mode;
  }

  toggleMode() {
    return this.setMode(
      this.mode === XR_LOCOMOTION_MODE_AVATAR
        ? XR_LOCOMOTION_MODE_VIEWPOINT
        : XR_LOCOMOTION_MODE_AVATAR,
    );
  }

  modeLabel() {
    return this.mode === XR_LOCOMOTION_MODE_AVATAR ? 'Move: Avatar' : 'Move: Viewpoint';
  }

  reset() {
    const rig = this.sceneManager?.xrLocomotionRig;
    if (rig) {
      rig.position.set(0, 0, 0);
      rig.rotation.set(0, 0, 0);
    }
    this.mode = XR_LOCOMOTION_MODE_VIEWPOINT;
    this._snapTurnArmed = true;
    this._lastTurnSign = 0;
  }

  /**
   * @param {number} deltaSeconds
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   * @param {{ skipRightTurn?: boolean, preferAvatarMove?: boolean, firstPersonEmbody?: boolean }} [options]
   */
  update(deltaSeconds, pointers, options = {}) {
    const rig = this.sceneManager?.xrLocomotionRig;
    const camera = this.sceneManager?.camera;
    if (!rig || !camera || !pointers.length) return;

    const firstPersonEmbody = !!options.firstPersonEmbody;
    const preferAvatarMove = !!options.preferAvatarMove && !firstPersonEmbody;
    const left = pointers.find((p) => p.handedness === 'left') || null;
    const right = pointers.find((p) => p.handedness === 'right') || null;

    if (left) {
      const moveAxes = readLeftThumbstickAxes(left);
      const moveX = applyDeadzone(moveAxes.x);
      const moveY = applyDeadzone(moveAxes.y);

      if (moveX !== 0 || moveY !== 0) {
        this._applyLeftStickMove(
          camera,
          moveX,
          moveY,
          deltaSeconds,
          rig,
          preferAvatarMove,
          firstPersonEmbody,
        );
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
        const playerRoot = this.sceneManager.playerRoot;
        // First-person: snap-turn the rig (avatar stays under the headset).
        // Third-person avatar mode: yaw the avatar only.
        const turnAvatar =
          !firstPersonEmbody &&
          (preferAvatarMove ||
            (this.mode === XR_LOCOMOTION_MODE_AVATAR && !!playerRoot));
        if (turnAvatar && playerRoot) {
          playerRoot.rotation.y += radians;
          this.sceneManager.emit?.('xrLocomotion', {
            type: 'turn',
            target: 'avatar',
            radians,
          });
        } else {
          snapTurnLocomotionRigAroundViewer(rig, camera, radians);
          this.sceneManager.emit?.('xrLocomotion', {
            type: 'turn',
            target: firstPersonEmbody ? 'avatar-embody' : 'viewpoint',
            radians,
          });
        }
        this._snapTurnArmed = false;
        this._lastTurnSign = sign;
      }
    } else {
      this._snapTurnArmed = true;
      this._lastTurnSign = 0;
    }
  }

  /**
   * Left stick — viewpoint / first-person move the rig; third-person avatar mode
   * moves playerRoot only.
   * @param {boolean} [preferAvatarMove]
   * @param {boolean} [firstPersonEmbody]
   */
  _applyLeftStickMove(
    camera,
    moveX,
    moveY,
    deltaSeconds,
    rig,
    preferAvatarMove = false,
    firstPersonEmbody = false,
  ) {
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) {
      _forward.set(0, 0, -1);
    } else {
      _forward.normalize();
    }
    _right.crossVectors(_forward, camera.up).normalize();
    _move.set(0, 0, 0);

    const playerRoot = this.sceneManager.playerRoot;
    // Third-person avatar mode only (not FP): invert axes + move playerRoot.
    const avatarControl =
      !firstPersonEmbody &&
      (preferAvatarMove ||
        (this.mode === XR_LOCOMOTION_MODE_AVATAR && !!playerRoot));
    // Viewpoint + first-person use original stick mapping (ff58a784).
    const fwd = avatarControl ? -moveY : moveY;
    const strafe = avatarControl ? moveX : -moveX;
    _move.addScaledVector(_forward, fwd * MOVE_SPEED * deltaSeconds);
    _move.addScaledVector(_right, strafe * MOVE_SPEED * deltaSeconds);

    if (avatarControl && playerRoot) {
      const parent = playerRoot.parent;
      if (parent) {
        playerRoot.getWorldPosition(_worldPos);
        _worldPos.add(_move);
        parent.updateMatrixWorld(true);
        parent.worldToLocal(_worldPos);
        playerRoot.position.copy(_worldPos);
        playerRoot.updateMatrixWorld(true);
      } else {
        playerRoot.position.add(_move);
      }
      this.sceneManager.emit?.('xrLocomotion', { type: 'move', target: 'avatar', delta: _move.clone() });
      return;
    }

    // First-person embody and viewpoint mode: move the rig (avatar rides along).
    rig.position.add(_move);
    this.sceneManager.emit?.('xrLocomotion', {
      type: 'move',
      target: firstPersonEmbody ? 'avatar-embody' : 'viewpoint',
      delta: _move.clone(),
    });
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

/**
 * Place the XR viewer at the desktop viewport camera (XZ + yaw).
 * Must run on an XR frame after the headset pose exists — not at session-start
 * (room-scale / local-floor viewers are rarely at the reference origin).
 *
 * Content lives under the locomotion rig (camera stays in reference space), so we
 * offset the rig from `preXRCameraPosition` relative to the live headset.
 *
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {XRFrame|null} [frame]
 * @param {XRReferenceSpace|null} [referenceSpace]
 * @returns {boolean} true when aligned; false if pose not ready yet (retry next frame)
 */
export function alignXrLocomotionRigToViewport(sceneManager, frame = null, referenceSpace = null) {
  if (!sceneManager) return false;
  const rig = ensureXrLocomotionRig(sceneManager) || sceneManager.xrLocomotionRig;
  const camera = sceneManager.camera;
  if (!rig || !camera) return false;

  const camPos =
    sceneManager.preXRCameraPosition ||
    (camera.position ? camera.position.clone() : null);
  if (!camPos || !Number.isFinite(camPos.x) || !Number.isFinite(camPos.z)) {
    return false;
  }

  // Prefer the live viewer pose — camera may not be updated yet in the animation callback.
  let hasPose = false;
  if (frame && referenceSpace && typeof frame.getViewerPose === 'function') {
    try {
      const pose = frame.getViewerPose(referenceSpace);
      if (pose?.transform?.position) {
        const p = pose.transform.position;
        _headsetPos.set(p.x, p.y, p.z);
        const o = pose.transform.orientation;
        if (o) {
          _orientQuat.set(o.x, o.y, o.z, o.w);
          _headsetFwd.set(0, 0, -1).applyQuaternion(_orientQuat);
        } else {
          camera.getWorldDirection(_headsetFwd);
        }
        hasPose = true;
      } else {
        // Pose not ready this frame — retry next frame.
        return false;
      }
    } catch {
      return false;
    }
  }
  if (!hasPose) {
    if (!sceneManager.renderer?.xr?.isPresenting) return false;
    camera.updateMatrixWorld?.(true);
    camera.getWorldPosition(_headsetPos);
    camera.getWorldDirection(_headsetFwd);
    // Before the first real XR pose, headset often still equals the desktop camera —
    // wait for a distinct presenting pose when preXR exists.
    if (
      sceneManager.preXRCameraPosition &&
      _headsetPos.distanceToSquared(sceneManager.preXRCameraPosition) < 1e-6
    ) {
      return false;
    }
  }

  const wrapper = sceneManager.vrSceneWrapper;
  const wx = wrapper?.position?.x || 0;
  const wz = wrapper?.position?.z || 0;

  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  rig.updateMatrixWorld?.(true);

  // Content world ≈ wrapper + rig + local. Want relative view ≈ desktop (W − C):
  // wrapper + D − H ≈ −C  ⇒  D ≈ H − C − wrapper  (XZ only; floor stays on wrapper).
  _delta.set(
    _headsetPos.x - camPos.x - wx,
    0,
    _headsetPos.z - camPos.z - wz,
  );
  const parent = rig.parent;
  if (parent) {
    parent.updateMatrixWorld(true);
    parent.getWorldQuaternion(_parentQuat);
    _delta.applyQuaternion(_parentQuat.invert());
    _delta.y = 0;
  }
  rig.position.copy(_delta);

  // Yaw: rotate world around the headset so the desktop look dir matches headset forward.
  _viewportFwd.set(0, 0, -1);
  if (sceneManager.preXRCameraTarget) {
    _viewportFwd.subVectors(sceneManager.preXRCameraTarget, camPos);
  } else if (sceneManager.preXRCameraQuaternion) {
    _viewportFwd.set(0, 0, -1).applyQuaternion(sceneManager.preXRCameraQuaternion);
  }
  _viewportFwd.y = 0;
  _headsetFwd.y = 0;
  if (_viewportFwd.lengthSq() > 1e-6 && _headsetFwd.lengthSq() > 1e-6) {
    _viewportFwd.normalize();
    _headsetFwd.normalize();
    const cross = _viewportFwd.x * _headsetFwd.z - _viewportFwd.z * _headsetFwd.x;
    const dot = _viewportFwd.x * _headsetFwd.x + _viewportFwd.z * _headsetFwd.z;
    const yawDelta = Math.atan2(cross, dot);
    if (Math.abs(yawDelta) > 1e-3) {
      // Pivot around live headset — use a stub with the pose we already read.
      const pivotCam = {
        getWorldPosition(out) {
          return out.copy(_headsetPos);
        },
      };
      snapTurnLocomotionRigAroundViewer(rig, pivotCam, yawDelta);
    }
  }

  rig.updateMatrixWorld?.(true);
  console.info('[XR][locomotion] Aligned to viewport camera:', {
    viewport: {
      x: Number(camPos.x.toFixed(3)),
      y: Number(camPos.y.toFixed(3)),
      z: Number(camPos.z.toFixed(3)),
    },
    headset: {
      x: Number(_headsetPos.x.toFixed(3)),
      z: Number(_headsetPos.z.toFixed(3)),
    },
    rigX: Number(rig.position.x.toFixed(3)),
    rigZ: Number(rig.position.z.toFixed(3)),
    rigYaw: Number(rig.rotation.y.toFixed(3)),
  });
  return true;
}

/** @deprecated Use alignXrLocomotionRigToViewport — kept for older call sites/tests. */
export function seedXrLocomotionRigFromViewport(sceneManager, frame, referenceSpace) {
  return alignXrLocomotionRigToViewport(sceneManager, frame, referenceSpace);
}

/**
 * Convert the live XR headset pose into a desktop OrbitControls view.
 * Content is under wrapper/rig during XR and returns to scene-local on exit, so
 * we undo the offset-root world matrix (rig includes wrapper when parented).
 *
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @returns {{ position: THREE.Vector3, quaternion: THREE.Quaternion, target: THREE.Vector3, zoom: number }|null}
 */
export function captureXrViewAsDesktop(sceneManager) {
  const camera = sceneManager?.camera;
  if (!camera) return null;

  camera.updateMatrixWorld?.(true);
  const offsetRoot = sceneManager.xrLocomotionRig || sceneManager.vrSceneWrapper;
  if (offsetRoot) offsetRoot.updateMatrixWorld?.(true);

  camera.getWorldPosition(_capPos);
  camera.getWorldQuaternion(_capQuat);

  if (offsetRoot?.matrixWorld) {
    _capInv.copy(offsetRoot.matrixWorld).invert();
    _capPos.applyMatrix4(_capInv);
    _capInv.decompose(_capTmpPos, _capInvQuat, _capScale);
    _capQuat.copy(_capInvQuat).multiply(_capQuat);
  }

  // Desktop orbit view: keep yaw/pitch, drop headset roll.
  _capEuler.setFromQuaternion(_capQuat, 'YXZ');
  _capEuler.z = 0;
  _capQuat.setFromEuler(_capEuler);

  _capFwd.set(0, 0, -1).applyQuaternion(_capQuat);
  if (_capFwd.lengthSq() < 1e-8) {
    _capFwd.set(0, 0, -1);
  } else {
    _capFwd.normalize();
  }

  let lookDist = 2.5;
  if (sceneManager.preXRCameraPosition && sceneManager.preXRCameraTarget) {
    const d = sceneManager.preXRCameraPosition.distanceTo(sceneManager.preXRCameraTarget);
    if (Number.isFinite(d) && d > 0.15) lookDist = d;
  }
  _capTarget.copy(_capPos).addScaledVector(_capFwd, lookDist);

  const zoom =
    typeof sceneManager.preXRCameraZoom === 'number'
      ? sceneManager.preXRCameraZoom
      : typeof camera.zoom === 'number'
        ? camera.zoom
        : 1;

  return {
    position: _capPos.clone(),
    quaternion: _capQuat.clone(),
    target: _capTarget.clone(),
    zoom,
  };
}

/**
 * Apply a captured XR→desktop view after the XR wrapper/rig is dismantled.
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 * @param {{ position: THREE.Vector3, quaternion: THREE.Quaternion, target: THREE.Vector3, zoom?: number }} view
 */
export function applyDesktopViewFromXr(sceneManager, view) {
  if (!sceneManager?.camera || !view?.position || !view?.quaternion || !view?.target) {
    return false;
  }
  const camera = sceneManager.camera;
  camera.position.copy(view.position);
  camera.quaternion.copy(view.quaternion);
  camera.up.set(0, 1, 0);
  if (typeof view.zoom === 'number') {
    camera.zoom = view.zoom;
  }
  if (typeof camera.updateProjectionMatrix === 'function') {
    camera.updateProjectionMatrix();
  }
  if (sceneManager.controls?.target) {
    sceneManager.controls.target.copy(view.target);
    sceneManager.controls.update?.();
  }
  console.info('[XR][locomotion] Desktop view set from last XR view:', {
    position: {
      x: Number(view.position.x.toFixed(3)),
      y: Number(view.position.y.toFixed(3)),
      z: Number(view.position.z.toFixed(3)),
    },
    target: {
      x: Number(view.target.x.toFixed(3)),
      y: Number(view.target.y.toFixed(3)),
      z: Number(view.target.z.toFixed(3)),
    },
  });
  return true;
}
