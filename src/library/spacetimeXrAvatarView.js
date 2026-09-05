/**
 * Space-Time XR avatar view + control mode cycle (Galaxy XR).
 *
 * Control cycle (left X forward, left grip reverse):
 *   first-person → third-person 2 m follow → avatar move → third-person walk around → …
 */
import * as THREE from 'three';
import { snapTurnSpacetimeRig } from './spacetimeViewportControls.js';
import {
  orientSpacetimeWalkerToView,
  orientSpacetimeWalkerTowardWorldPoint,
  placeSpacetimeWalkerStandoff,
  snapSpacetimeWalkerToWalkSurface,
} from './spacetimeXrWalkerSnap.js';
import {
  XR_LOCOMOTION_MODE_AVATAR,
  XR_LOCOMOTION_MODE_VIEWPOINT,
} from './sceneManagerXrConstants.js';

export const SPACETIME_XR_VIEW_THIRD_PERSON = 'third_person';
export const SPACETIME_XR_VIEW_FIRST_PERSON = 'first_person';

export const SPACETIME_XR_CONTROL_FIRST_PERSON = 'first_person';
export const SPACETIME_XR_CONTROL_AVATAR = 'avatar';
export const SPACETIME_XR_CONTROL_THIRD_FOLLOW = 'third_follow';
export const SPACETIME_XR_CONTROL_THIRD_FREE = 'third_free';

/** Forward cycle order (left X). Left grip cycles reverse. */
export const SPACETIME_XR_CONTROL_CYCLE = [
  SPACETIME_XR_CONTROL_FIRST_PERSON,
  SPACETIME_XR_CONTROL_THIRD_FOLLOW,
  SPACETIME_XR_CONTROL_AVATAR,
  SPACETIME_XR_CONTROL_THIRD_FREE,
];

/** Third-person camera offset behind avatar (m) — follow-lock mode. */
export const THIRD_PERSON_BEHIND_M = 2.0;

/** Extra camera height in follow-lock mode (m above prior offset). */
export const THIRD_PERSON_BEHIND_LIFT_M = 1.0;

/** Smooth rig reposition when switching control modes (s). */
export const CONTROL_MODE_TRANSITION_S = 0.35;

/** Min horizontal viewer→avatar separation before re-pulling follow cam (m). */
export const THIRD_PERSON_MIN_VIEWER_DIST_M = THIRD_PERSON_BEHIND_M * 0.75;

const _avatarFwd = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _headPos = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();
const _headsetOrient = new THREE.Quaternion();

/**
 * Headset XZ+Y and flat forward from XR pose when available (else Three camera).
 * @param {THREE.Camera} camera
 * @param {XRFrame|null|undefined} frame
 * @param {XRReferenceSpace|null|undefined} referenceSpace
 * @param {THREE.Vector3} posOut
 * @param {THREE.Vector3} fwdOut
 */
function readHeadsetPoseFlat(camera, frame, referenceSpace, posOut, fwdOut) {
  let usedPose = false;
  if (frame && referenceSpace) {
    const pose = frame.getViewerPose(referenceSpace);
    if (pose?.transform?.position) {
      const hp = pose.transform.position;
      posOut.set(hp.x, hp.y, hp.z);
      usedPose = true;
    }
    const o = pose?.transform?.orientation;
    if (o) {
      _headsetOrient.set(o.x, o.y, o.z, o.w);
      fwdOut.set(0, 0, -1).applyQuaternion(_headsetOrient);
      fwdOut.y = 0;
      if (fwdOut.lengthSq() > 1e-6) {
        fwdOut.normalize();
      } else {
        fwdOut.set(0, 0, -1);
      }
      return posOut;
    }
  }
  if (!usedPose && camera) {
    camera.getWorldPosition(posOut);
  }
  if (camera) {
    getFlatForward(camera, fwdOut);
  } else {
    fwdOut.set(0, 0, -1);
  }
  return posOut;
}

/**
 * @param {import('@pixiv/three-vrm').VRM|null|undefined} vrm
 * @param {THREE.Group|null|undefined} playerRoot
 * @param {THREE.Vector3} [out]
 */
export function getSpacetimeWalkerHeadWorldPosition(vrm, playerRoot, out = _headPos) {
  const headNode = vrm?.humanoid?.humanBones?.head?.node;
  if (headNode) {
    headNode.getWorldPosition(out);
    return out;
  }
  if (!playerRoot) return null;
  const box = new THREE.Box3().setFromObject(playerRoot);
  if (box.isEmpty()) return null;
  box.getCenter(out);
  out.y = box.max.y - Math.min(0.12, (box.max.y - box.min.y) * 0.08);
  return out;
}

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

/**
 * @param {string} mode
 */
export function labelSpacetimeXrControlMode(mode) {
  switch (mode) {
    case SPACETIME_XR_CONTROL_FIRST_PERSON:
      return 'First person';
    case SPACETIME_XR_CONTROL_AVATAR:
      return 'Avatar move';
    case SPACETIME_XR_CONTROL_THIRD_FOLLOW:
      return 'Third person (2 m follow)';
    case SPACETIME_XR_CONTROL_THIRD_FREE:
      return 'Third person (walk around)';
    default:
      return mode;
  }
}

export class SpacetimeXrAvatarView {
  /**
   * @param {{ locomotionRig: THREE.Group, playerRoot: THREE.Group, camera: THREE.Camera, getVrm: () => import('@pixiv/three-vrm').VRM|null, locomotion?: { setMode?: (m: string) => string }|null }} ctx
   */
  constructor(ctx) {
    this.locomotionRig = ctx.locomotionRig;
    this.playerRoot = ctx.playerRoot;
    this.camera = ctx.camera;
    this.getVrm = ctx.getVrm;
    this.locomotion = ctx.locomotion ?? null;
    /** @type {typeof SPACETIME_XR_CONTROL_CYCLE[number]} */
    this.controlMode = SPACETIME_XR_CONTROL_THIRD_FREE;
    this._embodiedOnce = false;
    /** @type {{ from: THREE.Vector3, to: THREE.Vector3, elapsed: number, duration: number }|null} */
    this._rigTween = null;
    /** Skip follow leash until viewer walks — after avatar-move → third follow snap. */
    this._holdFollowAvatarWorld = false;
    this._pendingFollowFromAvatarSnap = false;
    /** @type {{ pos: THREE.Vector3, rotY: number }|null} */
    this._followSnapPreserveWorld = null;
    this._followYawAlignPending = false;
    /** @type {{ rigRotY: number, avatarRotY: number }|null} FP yaw sticky across walk-around. */
    this._fpWalkAroundPreserve = null;
  }

  /** @deprecated use controlMode */
  get mode() {
    return this.isFirstPerson()
      ? SPACETIME_XR_VIEW_FIRST_PERSON
      : SPACETIME_XR_VIEW_THIRD_PERSON;
  }

  hasAvatar() {
    return !!this.getVrm?.() && !!this.playerRoot;
  }

  reset() {
    this.controlMode = SPACETIME_XR_CONTROL_THIRD_FREE;
    if (this.playerRoot) {
      this.playerRoot.visible = true;
    }
    this._embodiedOnce = false;
    this._holdFollowAvatarWorld = false;
    this._pendingFollowFromAvatarSnap = false;
    this._followSnapPreserveWorld = null;
    this._followYawAlignPending = false;
    this._fpWalkAroundPreserve = null;
  }

  onSessionStart() {
    if (!this.hasAvatar()) return;
    this.controlMode = SPACETIME_XR_CONTROL_THIRD_FREE;
    this.playerRoot.visible = true;
    this._embodiedOnce = false;
    this._holdFollowAvatarWorld = false;
    this._pendingFollowFromAvatarSnap = false;
    this._followSnapPreserveWorld = null;
    this._followYawAlignPending = false;
    this._fpWalkAroundPreserve = null;
    this.locomotion?.setMode?.(XR_LOCOMOTION_MODE_VIEWPOINT);
  }

  /**
   * @param {THREE.Vector3|null|undefined} [spawnFocus] stadium / fabric center — face this on entry
   */
  applyEntryStandoff(spawnFocus = null) {
    if (!this.hasAvatar()) return;
    if (this._embodiedOnce || this.isFirstPerson()) return;
    if (this.isThirdPersonFollow()) {
      this.maintainThirdPersonFollow(true, spawnFocus);
    }
    // Walk-around: enter at current viewport — no entry snap.
  }

  /**
   * True when the headset is inside / in front of the avatar (must pull rig back).
   * @returns {boolean}
   */
  _isViewerTooCloseToAvatar() {
    const vrm = this.getVrm();
    const head = getSpacetimeWalkerHeadWorldPosition(vrm, this.playerRoot, _headPos);
    if (!head || !this.camera) return true;

    this.camera.getWorldPosition(_camPos);
    getFlatForward(this.playerRoot, _avatarFwd);

    _delta.copy(_camPos).sub(head);
    _delta.y = 0;
    return _delta.length() < THIRD_PERSON_MIN_VIEWER_DIST_M;
  }

  /**
   * Third-person follow — pull the locomotion rig so the headset sits ~2 m behind
   * the avatar. Never teleport the avatar in front of the headset.
   * @param {boolean} [force=false]
   * @param {THREE.Vector3|null|undefined} [spawnFocus]
   * @param {boolean} [_unusedPreserve]
   * @param {XRFrame|null} [frame]
   * @param {XRReferenceSpace|null} [referenceSpace]
   */
  maintainThirdPersonFollow(
    force = false,
    spawnFocus = null,
    _unusedPreserve = false,
    frame = null,
    referenceSpace = null,
  ) {
    if (!this.hasAvatar() || !this.isThirdPersonFollow()) return;

    if (force && spawnFocus) {
      orientSpacetimeWalkerTowardWorldPoint(this.playerRoot, spawnFocus);
      this.playerRoot.updateMatrixWorld(true);
      this._followSnapPreserveWorld = {
        pos: this.playerRoot.getWorldPosition(new THREE.Vector3()),
        rotY: this.playerRoot.rotation.y,
        localPos: this.playerRoot.position.clone(),
      };
    }

    if (force) {
      this._alignFollowYawToHeadset(frame, referenceSpace);
      this._pullRigSoViewerIsBehindAvatar(THIRD_PERSON_BEHIND_M, frame, referenceSpace);
      if (THIRD_PERSON_BEHIND_LIFT_M > 1e-4) {
        this.locomotionRig.position.y += THIRD_PERSON_BEHIND_LIFT_M;
        this.locomotionRig.updateMatrixWorld(true);
      }
    } else if (this._isViewerTooCloseToAvatar()) {
      this._pullRigSoViewerIsBehindAvatar(THIRD_PERSON_BEHIND_M, frame, referenceSpace);
    }

    snapSpacetimeWalkerToWalkSurface(this.playerRoot, this.camera);
  }

  /** @param {XRFrame|null} [frame] */
  applyPendingFollowFromAvatarSnap(frame = null, referenceSpace = null) {
    if (!this._pendingFollowFromAvatarSnap || !this.isThirdPersonFollow()) return false;
    if (this._rigTween) {
      this.locomotionRig.position.copy(this._rigTween.to);
      this.locomotionRig.updateMatrixWorld(true);
      this._rigTween = null;
    }
    this._beginViewportTransitionBehindAvatar(frame, referenceSpace);
    this._pendingFollowFromAvatarSnap = false;
    if (!this._rigTween) {
      this._finishFollowSnapYawAlign(frame, referenceSpace);
      this._followYawAlignPending = false;
      // Keep hold until left stick walks — standoff must not yank the avatar on entry.
      snapSpacetimeWalkerToWalkSurface(this.playerRoot, this.camera);
    }
    return true;
  }

  /**
   * Run deferred yaw align on a fresh XRFrame (never reuse a stored frame).
   * @param {XRFrame|null} [frame]
   * @param {XRReferenceSpace|null} [referenceSpace]
   */
  finishDeferredFollowYawAlign(frame = null, referenceSpace = null) {
    if (!this._followYawAlignPending) return false;
    this._finishFollowSnapYawAlign(frame, referenceSpace);
    this._followYawAlignPending = false;
    this._followSnapPreserveWorld = null;
    // Hold stays true until left stick — see refreshThirdPersonFollowOffset.
    snapSpacetimeWalkerToWalkSurface(this.playerRoot, this.camera);
    return true;
  }

  releaseFollowAvatarWorldHold() {
    this._holdFollowAvatarWorld = false;
  }

  /**
   * Follow leash while walking (correct design — session restore):
   * left stick walks the **viewpoint**; avatar stays ~2 m ahead via standoff.
   * Entry snap uses {_pullRigSoViewerIsBehindAvatar}; hold blocks standoff until stick.
   */
  refreshThirdPersonFollowOffset(_frame = null, _referenceSpace = null) {
    if (!this.hasAvatar() || !this.isThirdPersonFollow()) return;
    if (
      this._holdFollowAvatarWorld ||
      this._rigTween ||
      this._followYawAlignPending ||
      this._pendingFollowFromAvatarSnap
    ) {
      return;
    }

    placeSpacetimeWalkerStandoff(
      this.playerRoot,
      this.camera,
      THIRD_PERSON_BEHIND_M,
      null,
      { orientToCamera: false },
    );
  }

  isFirstPerson() {
    return this.controlMode === SPACETIME_XR_CONTROL_FIRST_PERSON;
  }

  isAvatarLocomotion() {
    return this.controlMode === SPACETIME_XR_CONTROL_AVATAR;
  }

  isThirdPersonFollow() {
    return this.controlMode === SPACETIME_XR_CONTROL_THIRD_FOLLOW;
  }

  isThirdPersonFree() {
    return this.controlMode === SPACETIME_XR_CONTROL_THIRD_FREE;
  }

  /** Avatar move — right stick turns the viewport; left stick yaws the walker. */
  turnsViewportOnRightStick() {
    return this.isAvatarLocomotion();
  }

  facesAvatarOnWalk() {
    return this.isAvatarLocomotion();
  }

  /** Left stick moves the walker only in avatar-move (follow walks the viewpoint). */
  prefersAvatarStickMove() {
    return this.isAvatarLocomotion();
  }

  /** Third-person free keeps the avatar in world space — viewer walks around it. */
  shouldSyncAvatarToViewpoint() {
    return false;
  }

  /** Chase-cam collision — probe at avatar feet in follow. */
  usesThirdPersonFollowLead() {
    return this.isThirdPersonFollow();
  }

  /** Follow: keep walker yaw fixed while the rig snap-turns. */
  locksAvatarFacingOnTurn() {
    return this.isThirdPersonFollow();
  }

  /**
   * Smooth rig reposition — call each XR frame from interaction update.
   * @param {number} deltaSeconds
   */
  updateTransition(deltaSeconds) {
    const tween = this._rigTween;
    if (tween) {
      tween.elapsed += deltaSeconds;
      const t = Math.min(1, tween.elapsed / tween.duration);
      const smooth = t * t * (3 - 2 * t);
      this.locomotionRig.position.lerpVectors(tween.from, tween.to, smooth);
      this.locomotionRig.updateMatrixWorld(true);
      if (t >= 1) {
        this._rigTween = null;
        // Only follow-behind tweens request deferred yaw align — never first-person embody.
        if (tween.followYawAlign) {
          this._followYawAlignPending = true;
        }
      }
    }
  }

  /**
   * @param {THREE.Vector3} deltaLocal
   * @param {{ followYawAlign?: boolean }} [opts]
   */
  _applyRigMove(deltaLocal, opts = {}) {
    const rig = this.locomotionRig;
    if (!rig || deltaLocal.lengthSq() < 1e-10) return;
    const from = rig.position.clone();
    const to = from.clone().add(deltaLocal);
    if (this._rigTween) {
      rig.position.copy(this._rigTween.to);
      rig.updateMatrixWorld(true);
    }
    this._rigTween = {
      from: rig.position.clone(),
      to,
      elapsed: 0,
      duration: CONTROL_MODE_TRANSITION_S,
      followYawAlign: !!opts.followYawAlign,
    };
  }

  /**
   * @param {1|-1} direction +1 forward (left X), −1 reverse (left grip)
   */
  cycleControl(direction = 1) {
    if (!this.hasAvatar()) return this.controlMode;
    const idx = SPACETIME_XR_CONTROL_CYCLE.indexOf(this.controlMode);
    const base = idx >= 0 ? idx : 0;
    const next =
      (base + direction + SPACETIME_XR_CONTROL_CYCLE.length) %
      SPACETIME_XR_CONTROL_CYCLE.length;
    return this.setControlMode(SPACETIME_XR_CONTROL_CYCLE[next]);
  }

  /** @deprecated use cycleControl(1) */
  toggleMode() {
    return this.cycleControl(1);
  }

  /**
   * @param {typeof SPACETIME_XR_CONTROL_CYCLE[number]} mode
   */
  setControlMode(mode) {
    if (!this.hasAvatar()) return this.controlMode;
    if (!SPACETIME_XR_CONTROL_CYCLE.includes(mode)) return this.controlMode;

    const vrm = this.getVrm();
    const prev = this.controlMode;
    this.controlMode = mode;

    if (mode === SPACETIME_XR_CONTROL_FIRST_PERSON) {
      // Drop any follow-behind tween/hold so embody cannot re-plant the avatar
      // onto the headset (follow yaw align after a rig tween).
      this._followYawAlignPending = false;
      this._followSnapPreserveWorld = null;
      this._holdFollowAvatarWorld = false;
      this._pendingFollowFromAvatarSnap = false;
      if (this._rigTween) {
        this.locomotionRig.position.copy(this._rigTween.to);
        this.locomotionRig.updateMatrixWorld(true);
        this._rigTween = null;
      }
      // Walk-around snap-turns change rig yaw — restore the FP yaw saved on exit
      // so first-person does not adopt the walk-around rotation.
      if (prev === SPACETIME_XR_CONTROL_THIRD_FREE && this._fpWalkAroundPreserve) {
        this._restoreFirstPersonYawFromWalkAround();
      } else {
        this._fpWalkAroundPreserve = null;
      }
      this._alignViewerToAvatarHeadAndFacing(vrm);
      this.playerRoot.visible = false;
      this._embodiedOnce = true;
      this.locomotion?.setMode?.(XR_LOCOMOTION_MODE_VIEWPOINT);
    } else {
      this.playerRoot.visible = true;

      // First-person walks the locomotion rig; the hidden avatar does not track the
      // headset. Re-plant at the current viewpoint so exit keeps the walked fabric pose.
      const leavingFirstPerson = prev === SPACETIME_XR_CONTROL_FIRST_PERSON;
      if (leavingFirstPerson && mode === SPACETIME_XR_CONTROL_THIRD_FREE) {
        // Capture FP yaw before disembody / behind-snap (walk-around must not own it).
        this._fpWalkAroundPreserve = {
          rigRotY: this.locomotionRig.rotation.y,
          avatarRotY: this.playerRoot.rotation.y,
        };
      }
      if (leavingFirstPerson) {
        this._placeAvatarAtDisembodySpot(false);
      }

      const preserveFacing =
        mode === SPACETIME_XR_CONTROL_THIRD_FOLLOW &&
        (prev === SPACETIME_XR_CONTROL_THIRD_FOLLOW ||
          prev === SPACETIME_XR_CONTROL_THIRD_FREE ||
          prev === SPACETIME_XR_CONTROL_AVATAR ||
          prev === SPACETIME_XR_CONTROL_FIRST_PERSON);

      const preserveAvatarWorld =
        (mode === SPACETIME_XR_CONTROL_THIRD_FREE ||
          mode === SPACETIME_XR_CONTROL_AVATAR) &&
        (prev === SPACETIME_XR_CONTROL_THIRD_FOLLOW ||
          prev === SPACETIME_XR_CONTROL_THIRD_FREE ||
          prev === SPACETIME_XR_CONTROL_AVATAR ||
          prev === SPACETIME_XR_CONTROL_FIRST_PERSON);

      if (mode === SPACETIME_XR_CONTROL_THIRD_FOLLOW) {
        this._fpWalkAroundPreserve = null;
        // Always move the viewpoint behind a planted avatar — never place the
        // walker 2 m in front of the headset.
        this._pendingFollowFromAvatarSnap = true;
        this._holdFollowAvatarWorld = true;
        this.locomotion?.setMode?.(XR_LOCOMOTION_MODE_VIEWPOINT);
      } else if (
        leavingFirstPerson &&
        mode === SPACETIME_XR_CONTROL_THIRD_FREE
      ) {
        // Walk-around exit: 2 m behind along avatar facing, then yaw so the
        // viewpoint looks along that facing (adopts FP rotation).
        this.playerRoot.updateMatrixWorld(true);
        this._followSnapPreserveWorld = {
          pos: this.playerRoot.getWorldPosition(new THREE.Vector3()),
          rotY: this.playerRoot.rotation.y,
          localPos: this.playerRoot.position.clone(),
        };
        this._pullRigSoViewerIsBehindAvatar(
          THIRD_PERSON_BEHIND_M,
          null,
          null,
          true,
        );
        this._yawWalkAroundToMatchAvatarFacing();
        this._followSnapPreserveWorld = null;
        this.locomotion?.setMode?.(XR_LOCOMOTION_MODE_VIEWPOINT);
        snapSpacetimeWalkerToWalkSurface(this.playerRoot, this.camera);
      } else {
        if (mode !== SPACETIME_XR_CONTROL_THIRD_FREE) {
          this._fpWalkAroundPreserve = null;
        }
        const leavingAvatarForWalkAround =
          prev === SPACETIME_XR_CONTROL_AVATAR &&
          mode === SPACETIME_XR_CONTROL_THIRD_FREE;

        if (leavingAvatarForWalkAround) {
          // Keep avatar + viewport world pose — no snap on mode change.
        } else if (preserveAvatarWorld) {
          if (this._isViewerTooCloseToAvatar()) {
            this._pullRigSoViewerIsBehindAvatar(THIRD_PERSON_BEHIND_M);
          }
        } else {
          this._placeAvatarAtDisembodySpot(!preserveFacing);
          this._pullRigSoViewerIsBehindAvatar(THIRD_PERSON_BEHIND_M);
        }

        if (mode === SPACETIME_XR_CONTROL_AVATAR) {
          this.locomotion?.setMode?.(XR_LOCOMOTION_MODE_AVATAR);
        } else {
          this.locomotion?.setMode?.(XR_LOCOMOTION_MODE_VIEWPOINT);
        }

        snapSpacetimeWalkerToWalkSurface(this.playerRoot, this.camera);
      }
    }

    if (this._pendingFollowFromAvatarSnap) {
      this.applyPendingFollowFromAvatarSnap();
    }

    console.info('[spacetime-xr] control mode', {
      mode: this.controlMode,
      label: labelSpacetimeXrControlMode(this.controlMode),
      prev,
    });
    return this.controlMode;
  }

  /**
   * Slide the locomotion rig so the headset lands on the avatar head (XZ only).
   * Does not yaw the stadium or change avatar facing — walk-around ↔ FP must keep
   * the same body direction.
   */
  _alignViewerToAvatarHeadAndFacing(vrm) {
    const rig = this.locomotionRig;
    const camera = this.camera;
    const playerRoot = this.playerRoot;
    const head = getSpacetimeWalkerHeadWorldPosition(vrm, playerRoot, _headPos);
    if (!rig || !camera || !head || !playerRoot) return;

    // Capture fabric-local plant + facing — must survive the rig slide.
    const localPlant = playerRoot.position.clone();
    const localRotY = playerRoot.rotation.y;

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

    if (_delta.lengthSq() >= 1e-10) {
      rig.position.add(_delta);
      rig.updateMatrixWorld(true);
    }

    playerRoot.position.copy(localPlant);
    playerRoot.rotation.y = localRotY;
    playerRoot.updateMatrixWorld(true);
  }

  /**
   * After FP → walk-around behind-snap: yaw fabric so headset looks along avatar
   * facing (walk-around adopts first-person rotation). Avatar local plant/facing
   * stay via {@link _followSnapPreserveWorld}.
   */
  _yawWalkAroundToMatchAvatarFacing() {
    const rig = this.locomotionRig;
    const playerRoot = this.playerRoot;
    const camera = this.camera;
    if (!rig || !playerRoot || !camera) return;

    this._restoreFollowSnapAvatarLocal();
    getFlatForward(playerRoot, _avatarFwd);
    getFlatForward(camera, _camFwd);
    const cross = _avatarFwd.x * _camFwd.z - _avatarFwd.z * _camFwd.x;
    const dot = _avatarFwd.x * _camFwd.x + _avatarFwd.z * _camFwd.z;
    const yawDelta = Math.atan2(cross, dot);
    if (Math.abs(yawDelta) > 1e-3) {
      snapTurnSpacetimeRig(rig, camera, -yawDelta);
      this._restoreFollowSnapAvatarLocal();
    }
  }

  /**
   * Undo walk-around snap-turns so first-person keeps the yaw saved on FP exit.
   */
  _restoreFirstPersonYawFromWalkAround() {
    const saved = this._fpWalkAroundPreserve;
    const rig = this.locomotionRig;
    const playerRoot = this.playerRoot;
    const camera = this.camera;
    if (!saved || !rig || !playerRoot || !camera) return;

    let yawDelta = saved.rigRotY - rig.rotation.y;
    yawDelta =
      ((((yawDelta + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) -
      Math.PI;
    if (Math.abs(yawDelta) > 1e-3) {
      snapTurnSpacetimeRig(rig, camera, yawDelta);
    }
    // Exact saved yaw (snapTurn accumulates; avoid ±2π drift).
    rig.rotation.y = saved.rigRotY;
    playerRoot.rotation.y = saved.avatarRotY;
    playerRoot.updateMatrixWorld(true);
  }

  /**
   * @param {boolean} [orientToCamera=true]
   */
  _placeAvatarAtDisembodySpot(orientToCamera = true) {
    const playerRoot = this.playerRoot;
    const camera = this.camera;
    if (!playerRoot || !camera) return;

    camera.getWorldPosition(_camPos);
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

    if (orientToCamera) {
      orientSpacetimeWalkerToView(playerRoot, camera);
    }
    playerRoot.updateMatrixWorld(true);
  }

  /**
   * @param {number} distanceM
   * @param {number} [liftM=0]
   * @deprecated prefer {@link _pullRigSoViewerIsBehindAvatar} (accounts for current headset pose)
   */
  _offsetViewerBehindAvatar(distanceM = THIRD_PERSON_BEHIND_M, liftM = 0) {
    this._pullRigSoViewerIsBehindAvatar(distanceM);
    if (liftM > 1e-4 && this.locomotionRig) {
      this.locomotionRig.position.y += liftM;
      this.locomotionRig.updateMatrixWorld(true);
    }
  }

  /**
   * @param {number} distanceM
   * @param {number} [liftM=0]
   * @deprecated follow mode must not slide the avatar on the fabric
   */
  _snapViewerBehindAvatarPreservingWorld(distanceM = THIRD_PERSON_BEHIND_M, liftM = 0) {
    this._pullRigSoViewerIsBehindAvatar(distanceM);
    if (liftM > 1e-4 && this.locomotionRig) {
      this.locomotionRig.position.y += liftM;
      this.locomotionRig.updateMatrixWorld(true);
    }
  }

  /**
   * Smooth rig move so the headset ends ~2 m behind the avatar (fabric-local
   * avatar pose unchanged). Uses headset pose when an XRFrame is available.
   * @param {XRFrame|null} [frame]
   * @param {XRReferenceSpace|null} [referenceSpace]
   */
  _beginViewportTransitionBehindAvatar(frame = null, referenceSpace = null) {
    const rig = this.locomotionRig;
    const playerRoot = this.playerRoot;
    const camera = this.camera;
    const vrm = this.getVrm();
    if (!rig || !playerRoot || !camera) return;

    playerRoot.updateMatrixWorld(true);
    this._followSnapPreserveWorld = {
      pos: playerRoot.getWorldPosition(new THREE.Vector3()),
      rotY: playerRoot.rotation.y,
      localPos: playerRoot.position.clone(),
    };

    const head = getSpacetimeWalkerHeadWorldPosition(vrm, playerRoot, _headPos);
    if (!head) return;

    readHeadsetPoseFlat(camera, frame, referenceSpace, _camPos, _camFwd);
    // Prefer avatar forward for the behind-axis during the tween; finish re-yaws
    // to headset orientation then re-pull.
    getFlatForward(playerRoot, _avatarFwd);

    _delta.set(
      _camPos.x + _avatarFwd.x * THIRD_PERSON_BEHIND_M - head.x,
      0,
      _camPos.z + _avatarFwd.z * THIRD_PERSON_BEHIND_M - head.z,
    );

    const rigParent = rig.parent;
    if (rigParent) {
      rigParent.updateMatrixWorld(true);
      rigParent.getWorldQuaternion(_parentQuat);
      _delta.applyQuaternion(_parentQuat.invert());
      _delta.y = 0;
    }

    if (_delta.lengthSq() >= 1e-10) {
      this._applyRigMove(_delta, { followYawAlign: true });
    }

    this._holdFollowAvatarWorld = true;
  }

  _restoreFollowSnapAvatarLocal() {
    const saved = this._followSnapPreserveWorld;
    const playerRoot = this.playerRoot;
    if (!saved?.localPos || !playerRoot) return;
    playerRoot.position.copy(saved.localPos);
    playerRoot.rotation.y = saved.rotY;
    playerRoot.updateMatrixWorld(true);
  }

  /**
   * Rotate the stadium so avatar facing matches headset yaw (do not cancel on
   * the walker — that undoes look-align). Then pull the viewpoint behind.
   * @param {XRFrame|null} [frame]
   * @param {XRReferenceSpace|null} [referenceSpace]
   */
  _alignFollowYawToHeadset(frame = null, referenceSpace = null) {
    const rig = this.locomotionRig;
    const playerRoot = this.playerRoot;
    const camera = this.camera;
    if (!rig || !playerRoot || !camera) return;

    // Keep fabric-local footprint; do not rewrite world pos onto the headset.
    this._restoreFollowSnapAvatarLocal();

    readHeadsetPoseFlat(camera, frame, referenceSpace, _camPos, _camFwd);
    getFlatForward(playerRoot, _avatarFwd);

    const cross = _avatarFwd.x * _camFwd.z - _avatarFwd.z * _camFwd.x;
    const dot = _avatarFwd.x * _camFwd.x + _avatarFwd.z * _camFwd.z;
    const yawDelta = Math.atan2(cross, dot);

    if (Math.abs(yawDelta) > 1e-3) {
      // Parent Y rotation applies the opposite sense to child world forward vs
      // atan2(avatar × headset) — negate so avatar facing matches headset look.
      snapTurnSpacetimeRig(rig, camera, -yawDelta, frame, referenceSpace);
      this._restoreFollowSnapAvatarLocal();
    }
  }

  /** Align view yaw to headset, then pull the stadium so the headset sits behind. */
  _finishFollowSnapYawAlign(frame = null, referenceSpace = null) {
    this._alignFollowYawToHeadset(frame, referenceSpace);
    this._pullRigSoViewerIsBehindAvatar(THIRD_PERSON_BEHIND_M, frame, referenceSpace);
  }

  /**
   * Slide locomotion rig so the (fixed) headset sits exactly `distanceM` behind
   * the avatar. When `alongAvatarForward`, chase sits behind the walker facing;
   * otherwise use headset look (entry / yaw-align).
   * @param {number} distanceM
   * @param {XRFrame|null} [frame]
   * @param {XRReferenceSpace|null} [referenceSpace]
   * @param {boolean} [alongAvatarForward=false]
   */
  _pullRigSoViewerIsBehindAvatar(
    distanceM = THIRD_PERSON_BEHIND_M,
    frame = null,
    referenceSpace = null,
    alongAvatarForward = false,
  ) {
    const rig = this.locomotionRig;
    const playerRoot = this.playerRoot;
    const camera = this.camera;
    const vrm = this.getVrm();
    if (!rig || !playerRoot || !camera || !(distanceM > 0)) return;

    const head = getSpacetimeWalkerHeadWorldPosition(vrm, playerRoot, _headPos);
    if (!head) return;

    // Capture avatar world plant before the rig slide (child of locomotionRig).
    playerRoot.updateMatrixWorld(true);
    playerRoot.getWorldPosition(_worldPos);
    const plantRotY = playerRoot.rotation.y;

    // Three camera world — never raw XR viewer pose (that is tracking-space ≈0
    // and caused multi-meter chase deltas / stadium edge speed-runs).
    camera.getWorldPosition(_camPos);
    if (alongAvatarForward) {
      getFlatForward(playerRoot, _avatarFwd);
      _camFwd.copy(_avatarFwd);
    } else {
      getFlatForward(camera, _camFwd);
    }

    _delta.set(
      _camPos.x + _camFwd.x * distanceM - head.x,
      0,
      _camPos.z + _camFwd.z * distanceM - head.z,
    );

    const rigParent = rig.parent;
    if (rigParent) {
      rigParent.updateMatrixWorld(true);
      rigParent.getWorldQuaternion(_parentQuat);
      _delta.applyQuaternion(_parentQuat.invert());
      _delta.y = 0;
    }

    if (_delta.lengthSq() < 1e-10) return;
    if (this._rigTween) {
      rig.position.copy(this._rigTween.to);
      this._rigTween = null;
    }
    rig.position.add(_delta);
    rig.updateMatrixWorld(true);

    // Re-plant avatar: entry snap uses saved fabric-local; chase walk uses world.
    const saved = this._followSnapPreserveWorld;
    if (saved?.localPos) {
      playerRoot.position.copy(saved.localPos);
      playerRoot.rotation.y = saved.rotY;
      playerRoot.updateMatrixWorld(true);
      return;
    }

    const parent = playerRoot.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      parent.worldToLocal(_worldPos);
      playerRoot.position.copy(_worldPos);
    }
    playerRoot.rotation.y = plantRotY;
    playerRoot.updateMatrixWorld(true);
  }
}
