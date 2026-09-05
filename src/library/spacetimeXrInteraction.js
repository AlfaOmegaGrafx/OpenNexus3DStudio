/**
 * Space-Time XR input orchestration — OpenNexus parity (controller bindings).
 *
 * Left stick: walk viewpoint (incl. 2 m follow) or move avatar (avatar-move)
 * Left stick click: toggle locomotion (avatar-move only); third-person follow re-snaps leash
 * Left X: cycle control forward (first-person → third 2 m follow → avatar move → third free)
 * Left grip (middle finger): cycle control reverse
 * Right stick back: teleport aim + release
 * Right stick X: snap turn (when not teleport aiming)
 */
import { SceneManagerXrInput } from './sceneManagerXrInput.js';
import {
  applyDeadzone,
  readLeftThumbstickAxes,
} from './sceneManagerXrAxes.js';
import {
  createSceneManagerXrControllerVisuals,
} from './sceneManagerXrControllerVisuals.js';
import {
  readButtonEdge,
  readSqueezePressed,
} from './sceneManagerXrGamepadButtons.js';
import {
  labelSpacetimeXrControlMode,
  SpacetimeXrAvatarView,
} from './spacetimeXrAvatarView.js';
import { SpacetimeXrLocomotion } from './spacetimeXrLocomotion.js';
import { SpacetimeXrMenu } from './spacetimeXrMenu.js';
import { SpacetimeXrModeHud } from './spacetimeXrModeHud.js';
import { SpacetimeXrTeleport } from './spacetimeXrTeleport.js';

/** Galaxy XR / Quest — left controller face buttons. */
const TOGGLE_VIEW_BUTTON_X = 4;
const TOGGLE_LOCO_BUTTON = 3;

export class SpacetimeXrInteraction {
  /**
   * @param {{ scene: import('three').Scene, renderer: import('three').WebGLRenderer, locomotionRig: import('three').Group, playerRoot: import('three').Group, camera: import('three').Camera, getVrm: () => import('@pixiv/three-vrm').VRM|null, onPickAvatar?: () => void, onControlModeChange?: (mode: string, label: string) => void }} ctx
   */
  constructor(ctx) {
    this.input = new SceneManagerXrInput();
    this.controllerVisuals = createSceneManagerXrControllerVisuals({
      scene: ctx.scene,
      renderer: ctx.renderer,
      alwaysShowTargetRay: true,
    });
    this.controllerVisuals.prepare(ctx.renderer);
    this.locomotion = new SpacetimeXrLocomotion({
      locomotionRig: ctx.locomotionRig,
      camera: ctx.camera,
      playerRoot: ctx.playerRoot,
    });
    this.avatarView = new SpacetimeXrAvatarView({
      locomotionRig: ctx.locomotionRig,
      playerRoot: ctx.playerRoot,
      camera: ctx.camera,
      getVrm: ctx.getVrm,
      locomotion: this.locomotion,
    });
    this.teleport = new SpacetimeXrTeleport({
      scene: ctx.scene,
      locomotionRig: ctx.locomotionRig,
      camera: ctx.camera,
      playerRoot: ctx.playerRoot,
    });
    this.menu = new SpacetimeXrMenu({
      scene: ctx.scene,
      avatarView: this.avatarView,
      locomotion: this.locomotion,
      onPickAvatar: ctx.onPickAvatar,
      onControlModeChange: (mode, label) => this._emitControlMode(mode, label),
    });
    this.modeHud = new SpacetimeXrModeHud({ camera: ctx.camera });
    this.onControlModeChange = ctx.onControlModeChange || null;
    this._prevLeftX = false;
    this._prevLeftStick = false;
    this._prevLeftGrip = false;
    this._emitControlMode(this.avatarView.controlMode);
  }

  /** @param {string} mode @param {string} [label] */
  _emitControlMode(mode, label) {
    const resolved = label || labelSpacetimeXrControlMode(mode);
    this.modeHud.setMode(mode, resolved);
    this.onControlModeChange?.(mode, resolved);
  }

  onSessionStart(session) {
    this.input.reset();
    this.locomotion.reset();
    this.avatarView.onSessionStart();
    this.teleport.reset();
    this.menu.reset();
    this.controllerVisuals.onSessionStart(session);
    this.modeHud.setPresenting(true);
    this._emitControlMode(this.avatarView.controlMode);
    this._prevLeftX = false;
    this._prevLeftStick = false;
    this._prevLeftGrip = false;
  }

  onSessionEnd() {
    this.input.reset();
    this.locomotion.reset();
    this.avatarView.reset();
    this.teleport.reset();
    this.menu.reset();
    this.controllerVisuals.onSessionEnd();
    this.modeHud.setPresenting(false);
    this._prevLeftX = false;
    this._prevLeftStick = false;
    this._prevLeftGrip = false;
  }

  /** @param {THREE.Vector3|null|undefined} [spawnFocus] */
  applyEntryStandoff(spawnFocus = null) {
    this.avatarView.applyEntryStandoff(spawnFocus);
  }

  /**
   * @param {number} deltaSeconds
   * @param {XRFrame|null} frame
   * @param {XRReferenceSpace|null} referenceSpace
   * @param {XRInputSource[]} inputSources
   */
  update(deltaSeconds, frame, referenceSpace, inputSources) {
    const pointers = this.input.update(frame, referenceSpace, inputSources);
    this.menu.update(pointers);
    this._updateButtons(pointers);
    this.avatarView.updateTransition(deltaSeconds);
    this.avatarView.finishDeferredFollowYawAlign(frame, referenceSpace);
    this.controllerVisuals.updateTargetReticles(
      pointers,
      (pointer) => this.menu.raycastDistance(pointer),
    );
    this.controllerVisuals.update(frame, referenceSpace, pointers);

    const right = pointers.find((p) => p.handedness === 'right') || null;
    this.teleport.update(right, frame, referenceSpace);

    const firstPersonEmbody = this.avatarView.isFirstPerson();
    const preferAvatarMove = this.avatarView.prefersAvatarStickMove();

    const leftStick = pointers.find((p) => p.handedness === 'left') || null;
    const moveAxes = leftStick ? readLeftThumbstickAxes(leftStick) : { x: 0, y: 0 };
    const followStickActive =
      this.avatarView.isThirdPersonFollow() &&
      (applyDeadzone(moveAxes.x) !== 0 || applyDeadzone(moveAxes.y) !== 0);
    if (followStickActive) {
      // Release entry hold so standoff leash can keep the avatar ~2 m ahead.
      this.avatarView.releaseFollowAvatarWorldHold();
    }

    this.locomotion.update(deltaSeconds, pointers, {
      skipRightTurn: this.teleport.isAiming(),
      preferAvatarMove,
      turnViewportOnly: this.avatarView.turnsViewportOnRightStick(),
      faceAvatarOnWalk: this.avatarView.facesAvatarOnWalk(),
      firstPersonEmbody,
      thirdPersonFollowLead: this.avatarView.usesThirdPersonFollowLead(),
      syncAvatarToViewpoint: this.avatarView.shouldSyncAvatarToViewpoint(),
      lockAvatarFacingOnTurn: this.avatarView.locksAvatarFacingOnTurn(),
      groundFollow: true,
      frame,
      referenceSpace,
    });

    this.avatarView.applyPendingFollowFromAvatarSnap(frame, referenceSpace);

    if (this.avatarView.isThirdPersonFollow()) {
      this.avatarView.refreshThirdPersonFollowOffset(frame, referenceSpace);
    }
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   */
  _updateButtons(pointers) {
    const left = pointers.find((p) => p.handedness === 'left');
    if (!left?.connected || !left.inputSource?.gamepad) return;

    const buttons = left.inputSource.gamepad.buttons || [];
    const xPressed = !!(
      buttons[TOGGLE_VIEW_BUTTON_X]?.pressed || buttons[TOGGLE_VIEW_BUTTON_X]?.value > 0.5
    );
    const stickPressed = !!(
      buttons[TOGGLE_LOCO_BUTTON]?.pressed || buttons[TOGGLE_LOCO_BUTTON]?.value > 0.5
    );
    const gripPressed = readSqueezePressed(left.inputSource);

    const { start: xStart } = readButtonEdge(xPressed, this._prevLeftX);
    const { start: gripStart } = readButtonEdge(gripPressed, this._prevLeftGrip);

    if (xStart && this.avatarView.hasAvatar()) {
      const mode = this.avatarView.cycleControl(1);
      this._emitControlMode(mode);
    }

    if (gripStart && this.avatarView.hasAvatar()) {
      const mode = this.avatarView.cycleControl(-1);
      this._emitControlMode(mode);
    }

    if (stickPressed && !this._prevLeftStick) {
      if (this.avatarView.isAvatarLocomotion()) {
        this.locomotion.toggleMode();
      } else if (this.avatarView.isThirdPersonFollow()) {
        this.avatarView.maintainThirdPersonFollow();
      }
    }

    this._prevLeftX = xPressed;
    this._prevLeftStick = stickPressed;
    this._prevLeftGrip = gripPressed;
  }
}
