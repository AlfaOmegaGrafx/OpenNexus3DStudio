/**
 * Space-Time XR locomotion — OpenNexus parity (viewpoint / avatar mode, snap turn, BVH ground).
 */
import * as THREE from 'three';
import {
  applyDeadzone,
  readControllerTrigger,
  readLeftThumbstickAxes,
  readRightThumbstickAxes,
} from './sceneManagerXrAxes.js';
import {
  XR_LOCOMOTION_MODE_AVATAR,
  XR_LOCOMOTION_MODE_VIEWPOINT,
} from './sceneManagerXrConstants.js';
import { snapTurnSpacetimeRig } from './spacetimeViewportControls.js';
import {
  clampSpacetimeMoveDelta,
  followSpacetimeWalkSurfaceY,
  getSpacetimeReferenceFootY,
  SPACETIME_XR_EYE_TO_FLOOR,
} from './spacetimeXrGroundFollow.js';
import {
  getSpacetimeLocomotionCollisionAnchor,
  snapSpacetimeWalkerToWalkSurface,
} from './spacetimeXrWalkerSnap.js';

export { XR_LOCOMOTION_MODE_AVATAR, XR_LOCOMOTION_MODE_VIEWPOINT };

const MOVE_SPEED = 2.4;
const SPRINT_TRIGGER_MIN = 0.35;
const SPRINT_MULTIPLIER_MAX = 2.25;
const SNAP_TURN_DEG = 30;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _collisionAnchor = new THREE.Vector3();
const _footPos = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();

export class SpacetimeXrLocomotion {
  /**
   * @param {{ locomotionRig: THREE.Group, camera: THREE.Camera, playerRoot?: THREE.Group|null }} ctx
   */
  constructor(ctx) {
    this.locomotionRig = ctx.locomotionRig;
    this.camera = ctx.camera;
    this.playerRoot = ctx.playerRoot ?? null;
    /** @type {'avatar'|'viewpoint'} */
    this.mode = XR_LOCOMOTION_MODE_VIEWPOINT;
    this._snapTurnArmed = true;
    this._lastTurnSign = 0;
  }

  /** @param {'avatar'|'viewpoint'} mode */
  setMode(mode) {
    if (mode !== XR_LOCOMOTION_MODE_AVATAR && mode !== XR_LOCOMOTION_MODE_VIEWPOINT) {
      return this.mode;
    }
    this.mode = mode;
    console.info('[spacetime-xr] locomotion mode', { mode: this.mode });
    return this.mode;
  }

  toggleMode() {
    return this.setMode(
      this.mode === XR_LOCOMOTION_MODE_AVATAR
        ? XR_LOCOMOTION_MODE_VIEWPOINT
        : XR_LOCOMOTION_MODE_AVATAR,
    );
  }

  reset() {
    this.mode = XR_LOCOMOTION_MODE_VIEWPOINT;
    this._snapTurnArmed = true;
    this._lastTurnSign = 0;
  }

  /**
   * @param {number} deltaSeconds
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   * @param {{ skipRightTurn?: boolean, preferAvatarMove?: boolean, turnViewportOnly?: boolean, faceAvatarOnWalk?: boolean, disableSnapTurn?: boolean, firstPersonEmbody?: boolean, thirdPersonFollowLead?: boolean, syncAvatarToViewpoint?: boolean, lockAvatarFacingOnTurn?: boolean, groundFollow?: boolean, frame?: XRFrame|null, referenceSpace?: XRReferenceSpace|null }} [options]
   */
  update(deltaSeconds, pointers, options = {}) {
    const rig = this.locomotionRig;
    const camera = this.camera;
    if (!rig || !camera || !pointers.length) return;

    const groundFollow = options.groundFollow !== false;
    const firstPersonEmbody = !!options.firstPersonEmbody;
    const preferAvatarMove = !!options.preferAvatarMove && !firstPersonEmbody;
    const turnViewportOnly = !!options.turnViewportOnly && !firstPersonEmbody;
    const faceAvatarOnWalk = !!options.faceAvatarOnWalk && !firstPersonEmbody;
    const disableSnapTurn = !!options.disableSnapTurn && !firstPersonEmbody;
    const thirdPersonFollowLead = !!options.thirdPersonFollowLead && !firstPersonEmbody;
    const syncAvatarToViewpoint = !!options.syncAvatarToViewpoint && !firstPersonEmbody;
    const lockAvatarFacingOnTurn = !!options.lockAvatarFacingOnTurn && !firstPersonEmbody;
    const frame = options.frame ?? null;
    const referenceSpace = options.referenceSpace ?? null;

    const left = pointers.find((p) => p.handedness === 'left') || null;
    const right = pointers.find((p) => p.handedness === 'right') || null;

    /** @type {THREE.Vector3|null} */
    let moveHintXZ = null;

    if (left) {
      const moveAxes = readLeftThumbstickAxes(left);
      const moveX = applyDeadzone(moveAxes.x);
      const moveY = applyDeadzone(moveAxes.y);
      const sprintTrigger = Math.max(
        readControllerTrigger(left),
        readControllerTrigger(right),
      );

      if (moveX !== 0 || moveY !== 0) {
        moveHintXZ = this._applyLeftStickMove(
          camera,
          moveX,
          moveY,
          deltaSeconds,
          rig,
          preferAvatarMove,
          faceAvatarOnWalk,
          firstPersonEmbody,
          thirdPersonFollowLead,
          syncAvatarToViewpoint,
          groundFollow,
          sprintTrigger,
        );
      }
    }

    const rightStick = readRightThumbstickAxes(right);
    const turnAxis =
      options.skipRightTurn || disableSnapTurn
        ? 0
        : applyDeadzone(Math.abs(rightStick.y) > Math.abs(rightStick.x) ? 0 : rightStick.x);

    if (turnAxis !== 0) {
      const sign = Math.sign(turnAxis);
      if (this._snapTurnArmed || sign !== this._lastTurnSign) {
        const radians = THREE.MathUtils.degToRad(SNAP_TURN_DEG) * sign;
        const playerRoot = this.playerRoot;
        const turnAvatar =
          !firstPersonEmbody &&
          !lockAvatarFacingOnTurn &&
          !turnViewportOnly &&
          (preferAvatarMove ||
            (this.mode === XR_LOCOMOTION_MODE_AVATAR && !!playerRoot?.visible));

        if (turnAvatar && playerRoot) {
          playerRoot.rotation.y -= radians;
          playerRoot.updateMatrixWorld(true);
        } else {
          snapTurnSpacetimeRig(rig, camera, radians, frame, referenceSpace);
          if (lockAvatarFacingOnTurn && playerRoot) {
            playerRoot.rotation.y -= radians;
            playerRoot.updateMatrixWorld(true);
          }
        }
        this._snapTurnArmed = false;
        this._lastTurnSign = sign;
      }
    } else {
      this._snapTurnArmed = true;
      this._lastTurnSign = 0;
    }

    if (groundFollow) {
      followSpacetimeWalkSurfaceY(
        rig,
        camera,
        SPACETIME_XR_EYE_TO_FLOOR,
        deltaSeconds,
        moveHintXZ,
      );
    }
  }

  /**
   * @returns {THREE.Vector3|null} move hint for ground follow
   */
  _applyLeftStickMove(
    camera,
    moveX,
    moveY,
    deltaSeconds,
    rig,
    preferAvatarMove,
    faceAvatarOnWalk,
    firstPersonEmbody,
    thirdPersonFollowLead,
    syncAvatarToViewpoint,
    groundFollow,
    sprintTrigger = 0,
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

    const playerRoot = this.playerRoot;
    const avatarControl =
      !firstPersonEmbody &&
      (preferAvatarMove ||
        (this.mode === XR_LOCOMOTION_MODE_AVATAR && !!playerRoot?.visible));

    const fwd = avatarControl ? -moveY : moveY;
    const strafe = avatarControl ? moveX : -moveX;
    const sprint =
      sprintTrigger >= SPRINT_TRIGGER_MIN
        ? 1 + (SPRINT_MULTIPLIER_MAX - 1) * sprintTrigger
        : 1;
    const speed = MOVE_SPEED * sprint;
    _move.addScaledVector(_forward, fwd * speed * deltaSeconds);
    _move.addScaledVector(_right, strafe * speed * deltaSeconds);

    const followWalkerProbe =
      thirdPersonFollowLead && !!playerRoot?.visible && !avatarControl;

    if (groundFollow && _move.lengthSq() > 0) {
      getSpacetimeLocomotionCollisionAnchor(
        camera,
        playerRoot,
        {
          avatarControl: avatarControl || followWalkerProbe,
          firstPersonEmbody,
          thirdPersonFollowLead: followWalkerProbe ? false : thirdPersonFollowLead,
        },
        _collisionAnchor,
      );
      const referenceFootY = getSpacetimeReferenceFootY(
        _collisionAnchor.y - SPACETIME_XR_EYE_TO_FLOOR,
      );

      const clamped = clampSpacetimeMoveDelta(
        _collisionAnchor,
        _move,
        referenceFootY,
      );
      _move.copy(clamped);
    }

    if (avatarControl && playerRoot) {
      playerRoot.getWorldPosition(_worldPos);
      _worldPos.add(_move);
      const parent = playerRoot.parent;
      if (parent) {
        parent.updateMatrixWorld(true);
        parent.worldToLocal(_worldPos);
        playerRoot.position.copy(_worldPos);
      } else {
        playerRoot.position.add(_move);
      }

      if (faceAvatarOnWalk && _move.lengthSq() > 1e-8) {
        const localMove = _move.clone();
        if (parent) {
          parent.getWorldQuaternion(_parentQuat);
          localMove.applyQuaternion(_parentQuat.invert());
          localMove.y = 0;
        }
        if (localMove.lengthSq() > 1e-8) {
          playerRoot.rotation.y = Math.atan2(localMove.x, localMove.z);
        }
      }

      playerRoot.updateMatrixWorld(true);
      snapSpacetimeWalkerToWalkSurface(playerRoot, camera);
      return _move.clone();
    }

    rig.position.add(_move);

    if (playerRoot?.visible && (thirdPersonFollowLead || syncAvatarToViewpoint)) {
      snapSpacetimeWalkerToWalkSurface(playerRoot, camera);
    }

    if (playerRoot?.visible && syncAvatarToViewpoint) {
      playerRoot.getWorldPosition(_footPos);
      camera.getWorldPosition(_collisionAnchor);
      _footPos.x = _collisionAnchor.x;
      _footPos.z = _collisionAnchor.z;
      const parent = playerRoot.parent;
      if (parent) {
        parent.updateMatrixWorld(true);
        parent.worldToLocal(_footPos);
        playerRoot.position.x = _footPos.x;
        playerRoot.position.z = _footPos.z;
      } else {
        playerRoot.position.x = _footPos.x;
        playerRoot.position.z = _footPos.z;
      }
      snapSpacetimeWalkerToWalkSurface(playerRoot, camera);
    }

    return groundFollow ? _move.clone() : null;
  }
}

/**
 * Legacy session-based helper — prefer {@link SpacetimeXrInteraction}.
 * @deprecated
 */
export function updateSpacetimeXrLocomotion(
  locomotionRig,
  camera,
  session,
  deltaSeconds,
  state = {},
  options = {},
) {
  const loco = new SpacetimeXrLocomotion({ locomotionRig, camera });
  loco._snapTurnArmed = state.snapTurnArmed !== false;
  loco._lastTurnSign = state.lastTurnSign ?? 0;

  const pointers = [];
  if (session?.inputSources) {
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      pointers.push({
        handedness: src.handedness,
        connected: true,
        axes: gp?.axes ? Array.from(gp.axes) : [],
      });
    }
  }
  loco.update(deltaSeconds, pointers, options);
  return { snapTurnArmed: loco._snapTurnArmed, lastTurnSign: loco._lastTurnSign };
}
