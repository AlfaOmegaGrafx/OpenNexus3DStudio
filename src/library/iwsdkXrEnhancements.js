/**
 * Galaxy XR fixes for physical headsets (not the localhost IWER emulator).
 * - Safe AnimatedController.update (Quest profile vs shorter Galaxy gamepad → black screen)
 * - updatePointers hand connectivity without reassigning visual adapters
 */
import {
  createSystem,
  FollowBehavior,
  Follower,
  LocomotionEnvironment,
  RayInteractable,
} from '@iwsdk/core';
import { EnvironmentType } from '@iwsdk/locomotor';
import { XRInputManager } from '@iwsdk/xr-input';
import { XRControllerVisualAdapter } from '@iwsdk/xr-input/dist/visual/adapter/controller-visual-adapter.js';
import { XRHandVisualAdapter } from '@iwsdk/xr-input/dist/visual/adapter/hand-visual-adapter.js';
import { AnimatedController } from '@iwsdk/xr-input/dist/visual/impl/animated-controller.js';
import { FlexBatchedMesh } from '@iwsdk/xr-input/dist/visual/utils/flex-batched-mesh.js';
import {
  InputComponent,
  loadInputProfile,
  RayDisplayMode,
  StatefulGamepad,
} from '@iwsdk/xr-input';
import {
  BackSide,
  BoxGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three';

const RAY_PRESSED_COLOR = new Color(0xffdd00);

/** @type {Map<string, StatefulGamepad>} */
const gamepadCache = new Map();

/** @type {WeakSet<XRSession>} */
const sessionsWithHooks = new WeakSet();

let xrInputManagerPatched = false;
let animatedControllerPatched = false;
let flexBatchedMeshPatched = false;
let galaxyLocomotionPatched = false;

/** @type {Map<'left' | 'right', boolean>} */
const rawTriggerPrev = new Map();

const flexBatchedIdentity = new Matrix4();

/**
 * Galaxy XR: controller skinned meshes + hand tracking can leave batchedMatrix as a plain
 * object; FlexBatchedMesh.updateMatrixWorld then throws → black screen after hand grab.
 */
function patchFlexBatchedMeshForPhysicalHeadsets() {
  if (flexBatchedMeshPatched) {
    return;
  }
  flexBatchedMeshPatched = true;

  FlexBatchedMesh.prototype.updateMatrixWorld = function safeFlexBatchedUpdateMatrixWorld(
    force,
  ) {
    try {
      if (!(this.refMesh.userData.batchedMatrix instanceof Matrix4)) {
        this.refMesh.userData.batchedMatrix = new Matrix4();
      }

      this.refMesh.traverse((child) => {
        if (child.isMesh || child.isSkinnedMesh) {
          if (!(child.userData.batchedMatrix instanceof Matrix4)) {
            child.userData.batchedMatrix = new Matrix4();
          }
        }
      });

      Group.prototype.updateMatrixWorld.call(this, force);

      this.refMesh.traverse((child) => {
        child.updateMatrix();
        if (child === this.refMesh) {
          return;
        }

        const childMatrix =
          child.userData.batchedMatrix instanceof Matrix4
            ? child.userData.batchedMatrix
            : null;
        if (!childMatrix) {
          return;
        }

        const parentMatrix =
          child.parent?.userData?.batchedMatrix instanceof Matrix4
            ? child.parent.userData.batchedMatrix
            : this.refMesh.userData.batchedMatrix instanceof Matrix4
              ? this.refMesh.userData.batchedMatrix
              : flexBatchedIdentity;

        childMatrix.multiplyMatrices(parentMatrix, child.matrix);
      });

      this.batchedIndices.forEach((batchedIndex, mesh) => {
        const material = mesh.material;
        const batchedMesh = this.batchedMeshes.get(material);
        if (batchedMesh && mesh.userData.batchedMatrix instanceof Matrix4) {
          batchedMesh.setMatrixAt(batchedIndex, mesh.userData.batchedMatrix);
        }
      });
    } catch (err) {
      console.warn('[IwsdkXR] FlexBatchedMesh frame skipped:', err?.message || err);
    }
  };
}

/**
 * Galaxy XR thumbsticks report inverted axes vs Quest profile — flip move + turn.
 * Skipped on PC IWER emulator (__IWER_MCP_MANAGED).
 */
export function patchGalaxyXrLocomotionInput() {
  if (galaxyLocomotionPatched) {
    return;
  }
  if (typeof window !== 'undefined' && window.__IWER_MCP_MANAGED) {
    return;
  }
  galaxyLocomotionPatched = true;

  import('@iwsdk/core/dist/locomotion/locomotion-input-provider.js')
    .then(({ ActionLocomotionInputProvider }) => {
      const proto = ActionLocomotionInputProvider.prototype;
      const origMove = proto.getMoveAxis;
      proto.getMoveAxis = function getMoveAxisGalaxy(out) {
        origMove.call(this, out);
        out.x = -out.x;
        out.y = -out.y;
        return out;
      };

      const origTurn = proto.getTurnAxis;
      proto.getTurnAxis = function getTurnAxisGalaxy() {
        return -origTurn.call(this);
      };

      const origLeft = proto.getTurnLeftDown;
      const origRight = proto.getTurnRightDown;
      proto.getTurnLeftDown = function getTurnLeftDownGalaxy(micro) {
        return origRight.call(this, micro);
      };
      proto.getTurnRightDown = function getTurnRightDownGalaxy(micro) {
        return origLeft.call(this, micro);
      };
    })
    .catch((err) => {
      console.warn('[IwsdkXR] Galaxy locomotion patch skipped:', err?.message || err);
    });
}

/**
 * the Quest profile IWSDK loads. AnimatedController.update then throws and the XR
 * render loop stops (black screen). The PC emulator uses Quest映射 and does not hit this.
 */
function patchAnimatedControllerForPhysicalHeadsets() {
  if (animatedControllerPatched) {
    return;
  }
  animatedControllerPatched = true;
  patchFlexBatchedMeshForPhysicalHeadsets();

  AnimatedController.prototype.update = function safeAnimatedControllerUpdate() {
    if (!this.enabled || !this.gamepad) {
      return;
    }

    const buttons = this.gamepad.buttons;
    const axes = this.gamepad.axes;

    for (const animComponent of this.animatedComponents) {
      const { isButton, node, gamepadIndex, transformRange } = animComponent;
      const alpha = isButton
        ? (buttons[gamepadIndex]?.value ?? 0)
        : (((axes[gamepadIndex] ?? 0) + 1) / 2);

      node.position.lerpVectors(
        transformRange.min.position,
        transformRange.max.position,
        alpha,
      );
      node.quaternion.slerpQuaternions(
        transformRange.min.quaternion,
        transformRange.max.quaternion,
        alpha,
      );
    }
  };

  const stockControllerAdapterUpdate = XRControllerVisualAdapter.prototype.update;
  XRControllerVisualAdapter.prototype.update = function safeControllerAdapterUpdate(
    frame,
    delta,
  ) {
    try {
      stockControllerAdapterUpdate.call(this, frame, delta);
    } catch (err) {
      console.warn('[IwsdkXR] controller visual frame skipped:', err?.message || err);
    }
  };

  const stockHandAdapterUpdate = XRHandVisualAdapter.prototype.update;
  XRHandVisualAdapter.prototype.update = function safeHandAdapterUpdate(frame, delta) {
    try {
      stockHandAdapterUpdate.call(this, frame, delta);
    } catch (err) {
      console.warn('[IwsdkXR] hand visual frame skipped:', err?.message || err);
    }
  };
}

/**
 * Galaxy trigger often sits on raw gamepad.buttons[0] even when the profile mapping misses it.
 *
 * @param {Gamepad} gamepad
 * @param {'left' | 'right'} handedness
 */
function readRawTriggerEdges(gamepad, handedness) {
  const pressed = !!(gamepad.buttons[0]?.pressed || (gamepad.buttons[0]?.value ?? 0) > 0.5);
  const prev = rawTriggerPrev.get(handedness) ?? false;
  rawTriggerPrev.set(handedness, pressed);
  return {
    down: pressed && !prev,
    up: !pressed && prev,
  };
}

/**
 * @param {import('@iwsdk/xr-input').XRInputManager} xr
 * @param {'left' | 'right'} handedness
 */
function isControllerLive(xr, handedness) {
  const ctrl = xr.activeInputSources.controller[handedness];
  const source = ctrl?.inputSource;
  return (
    !!source &&
    source.connected !== false &&
    !!source.gamepad &&
    source.gamepad.buttons?.length > 0
  );
}

/**
 * Galaxy often keeps dormant controllers "connected" while you use hands — those
 * steal primary ray/grip spaces so hands rotate locally but do not translate in world space.
 *
 * @param {import('@iwsdk/xr-input').XRInputManager} xr
 * @param {'left' | 'right'} handedness
 */
function shouldPreferHandInput(xr, handedness) {
  const hand = xr.activeInputSources.hand[handedness];
  if (!hand?.inputSource?.hand) {
    return false;
  }
  if (!isControllerLive(xr, handedness)) {
    return true;
  }
  if (hand.isPrimary) {
    return true;
  }

  const gamepad = xr.activeInputSources.controller[handedness]?.inputSource?.gamepad;
  if (!gamepad?.buttons?.length) {
    return true;
  }

  const controllerActive = gamepad.buttons.some(
    (button) => button.pressed || (button.value ?? 0) > 0.15,
  );
  return !controllerActive;
}

/**
 * Re-apply hand wrist/ray poses to primary spaces when hands should drive interaction.
 *
 * @param {import('@iwsdk/xr-input').XRInputManager} xr
 * @param {import('three').WebXRManager} xrManager
 */
function syncHandTrackingSpaces(xr, xrManager) {
  const frame = xrManager.getFrame();
  const refSpace = xrManager.getReferenceSpace();
  if (!frame || !refSpace) {
    return;
  }

  const applyPose = (xrSpace, group) => {
    if (!xrSpace || !group) {
      return;
    }
    const pose = frame.getPose(xrSpace, refSpace);
    if (!pose) {
      return;
    }
    group.matrix.fromArray(pose.transform.matrix);
    group.matrix.decompose(group.position, group.quaternion, group.scale);
  };

  for (const handedness of ['left', 'right']) {
    const handData = xr.activeInputSources.hand[handedness];
    if (!handData?.inputSource?.hand) {
      continue;
    }

    const preferHand = shouldPreferHandInput(xr, handedness);
    if (!preferHand) {
      continue;
    }

    const raySpace = xr.xrOrigin.raySpaces[handedness];
    const gripSpace = xr.xrOrigin.gripSpaces[handedness];
    const { inputSource } = handData;
    const adapter = xr.visualAdapters.hand[handedness];

    adapter.raySpace = raySpace;
    adapter.gripSpace = gripSpace;

    applyPose(inputSource.targetRaySpace, raySpace);
    applyPose(inputSource.gripSpace || inputSource.targetRaySpace, gripSpace);

    const indexTipSpace = adapter.getIndexTipSpace?.();
    if (indexTipSpace) {
      applyPose(indexTipSpace, xr.xrOrigin.indexTipSpaces[handedness]);
    }

    if (adapter.visual?.model) {
      adapter.visual.model.position.copy(gripSpace.position);
      adapter.visual.model.quaternion.copy(gripSpace.quaternion);
    }
  }
}

/**
 * IWSDK only tints the ray on the selectStart edge; grab mode hides the ray.
 * While pinching, force yellow ray + cursor so pinch is confirmed before the cube moves.
 *
 * @param {import('@iwsdk/xr-input').XRInputManager} xr
 */
function applyHandPinchVisualFeedback(xr) {
  for (const handedness of ['left', 'right']) {
    const handAdapter = xr.visualAdapters.hand[handedness];
    const pinching = !!handAdapter?.pinchData?.curr;
    const handLive = !!xr.activeInputSources.hand[handedness]?.inputSource?.hand;

    if (!handLive || !pinching) {
      continue;
    }

    const multiPointer = xr.multiPointers[handedness];
    const rayMesh = multiPointer.ray?.visual?.ray;

    if (rayMesh) {
      rayMesh.material.uniforms.color.value.copy(RAY_PRESSED_COLOR);
      rayMesh.material.uniforms.opacity.value = 1;
      rayMesh.visible = true;
    }

    const cursor = multiPointer.cursorVisual?.cursor;
    if (cursor?.material) {
      cursor.material.color.copy(RAY_PRESSED_COLOR);
      cursor.material.opacity = 1;
      cursor.visible = true;
    }
  }
}

/**
 * @param {string} key
 * @param {XRInputSource} inputSource
 * @returns {StatefulGamepad | null}
 */
function getCachedGamepad(key, inputSource) {
  if (!inputSource?.gamepad) {
    return null;
  }
  let gp = gamepadCache.get(key);
  if (!gp || gp.inputSource !== inputSource) {
    gp = new StatefulGamepad(loadInputProfile(inputSource));
    gamepadCache.set(key, gp);
  }
  gp.update();
  return gp;
}

/**
 * Stock IWSDK sets connected=false without a gamepad — breaks hand-only mode.
 * Does not touch visual adapters (that crashed AnimatedController on Galaxy XR).
 *
 * @param {import('@iwsdk/xr-input').XRInputManager} this
 * @param {number} delta
 * @param {number} time
 */
function headsetUpdatePointers(delta, time) {
  for (const handedness of ['left', 'right']) {
    const multiPointer = this.multiPointers[handedness];
    const handData = this.activeInputSources.hand[handedness];
    const handLive = !!handData?.inputSource?.hand;
    const preferHand = shouldPreferHandInput(this, handedness);
    const controllerLive = isControllerLive(this, handedness) && !preferHand;
    const connected = controllerLive || handLive;

    let selectStart = false;
    let selectEnd = false;
    let squeezeStart = false;
    let squeezeEnd = false;

    if (controllerLive) {
      const ctrlSource = this.activeInputSources.controller[handedness]?.inputSource;
      const gp = ctrlSource ? getCachedGamepad(`ctrl-${handedness}`, ctrlSource) : null;
      if (gp) {
        this.gamepads[handedness] = gp;
        selectStart =
          gp.getSelectStart() ||
          gp.getButtonDown(InputComponent.Trigger) ||
          gp.getButtonDown('xr-standard-trigger');
        selectEnd =
          gp.getSelectEnd() ||
          gp.getButtonUp(InputComponent.Trigger) ||
          gp.getButtonUp('xr-standard-trigger');
        squeezeStart = gp.getButtonDown('xr-standard-squeeze');
        squeezeEnd = gp.getButtonUp('xr-standard-squeeze');
      }

      if (ctrlSource?.gamepad) {
        const raw = readRawTriggerEdges(ctrlSource.gamepad, handedness);
        if (raw.down) {
          selectStart = true;
        }
        if (raw.up) {
          selectEnd = true;
        }
      }
    } else if (handLive) {
      this.gamepads[handedness] = undefined;

      const handSource = handData.inputSource;
      if (handSource?.gamepad) {
        const hgp = getCachedGamepad(`hand-${handedness}`, handSource);
        if (hgp) {
          this.gamepads[handedness] = hgp;
          selectStart = hgp.getSelectStart();
          selectEnd = hgp.getSelectEnd();
          squeezeStart = hgp.getButtonDown('xr-standard-squeeze');
          squeezeEnd = hgp.getButtonUp('xr-standard-squeeze');
        }
      }

      const handAdapter = this.visualAdapters.hand[handedness];
      const pinch = handAdapter?.pinchData;
      if (pinch?.curr) {
        selectStart = selectStart || (pinch.curr && !pinch.prev);
        squeezeStart = squeezeStart || (pinch.curr && !pinch.prev);
        if (multiPointer.ray?.visual) {
          multiPointer.ray.visual.rayDisplayMode = RayDisplayMode.Visible;
        }
      }
      if (pinch && !pinch.curr && pinch.prev) {
        selectEnd = true;
        squeezeEnd = true;
      }
    } else {
      this.gamepads[handedness] = undefined;
    }

    multiPointer.toggleSubPointer('ray', true);
    multiPointer.toggleSubPointer('grab', connected);
    multiPointer.toggleSubPointer('touch', handLive && !controllerLive);
    if (multiPointer.ray?.visual) {
      multiPointer.ray.visual.rayDisplayMode = RayDisplayMode.Visible;
    }

    multiPointer.update(connected, delta, time, {
      selectStart: !!selectStart,
      selectEnd: !!selectEnd,
      squeezeStart: !!squeezeStart,
      squeezeEnd: !!squeezeEnd,
    });
  }
}

/**
 * Only patch updatePointers — leave IWSDK visual adapter lifecycle alone.
 */
export function patchXrInputManagerForHeadsets() {
  if (xrInputManagerPatched) {
    return;
  }
  xrInputManagerPatched = true;
  patchGalaxyXrLocomotionInput();
  patchAnimatedControllerForPhysicalHeadsets();
  XRInputManager.prototype.updatePointers = headsetUpdatePointers;
}

/**
 * @param {import('@iwsdk/core').World} world
 */
export function installHeadsetInputPipeline(world) {
  const inputMgr = world.input;
  const originalUpdate = inputMgr.update.bind(inputMgr);

  inputMgr.update = (xrManager, delta, time) => {
    originalUpdate(xrManager, delta, time);

    const session = xrManager.getSession();
    if (!session) {
      return;
    }

    ensureSessionHooks(world, session);
    syncHandTrackingSpaces(inputMgr.xr, xrManager);
    bridgeControllerSelectForDistanceGrab(inputMgr.xr, time * 1000);
    applyHandPinchVisualFeedback(inputMgr.xr);
  };
}

/**
 * DistanceGrabbable listens to ray "select" events; belt-and-suspenders for Galaxy trigger mapping.
 *
 * @param {import('@iwsdk/xr-input').XRInputManager} xr
 * @param {number} timeMs
 */
function bridgeControllerSelectForDistanceGrab(xr, timeMs) {
  const event = { timeStamp: timeMs };

  for (const handedness of ['left', 'right']) {
    if (!isControllerLive(xr, handedness)) {
      continue;
    }

    const multiPointer = xr.multiPointers[handedness];
    const ctrlSource = xr.activeInputSources.controller[handedness]?.inputSource;
    if (!ctrlSource?.gamepad) {
      continue;
    }

    const gp = getCachedGamepad(`bridge-${handedness}`, ctrlSource);

    const selectDown =
      gp?.getSelectStart() ||
      gp?.getButtonDown(InputComponent.Trigger) ||
      gp?.getButtonDown('xr-standard-trigger');
    const selectUp =
      gp?.getSelectEnd() ||
      gp?.getButtonUp(InputComponent.Trigger) ||
      gp?.getButtonUp('xr-standard-trigger');

    if (selectDown) {
      multiPointer.routeDown('select', 'ray', event);
    }
    if (selectUp) {
      multiPointer.routeUp('select', 'ray', event);
    }
  }
}

/**
 * @param {import('@iwsdk/core').World} world
 * @param {XRSession} session
 */
function ensureSessionHooks(world, session) {
  if (sessionsWithHooks.has(session)) {
    return;
  }
  sessionsWithHooks.add(session);

  session.addEventListener('end', () => {
    clearHeadsetInputCache();
  });
}

/**
 * @param {import('@iwsdk/core').World} world
 */
export function addWalkableFloor(world) {
  const floorGeo = new PlaneGeometry(24, 24);
  const floorMat = new MeshStandardMaterial({ color: 0x2a2a2e });
  const floor = new Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'IwsdkWalkableFloor';

  const parent = world.activeLevel?.value ?? world.sceneEntity;
  const floorEntity = world.createTransformEntity(floor, { parent });
  floorEntity.addComponent(LocomotionEnvironment, {
    type: EnvironmentType.STATIC,
  });
}

/**
 * @param {import('@iwsdk/core').World} world
 */
export function addExitPanel(world) {
  const panelGeo = new BoxGeometry(0.5, 0.16, 0.02);
  const panelMat = new MeshStandardMaterial({
    color: 0x8b2020,
    emissive: 0x440808,
  });
  const panel = new Mesh(panelGeo, panelMat);
  panel.name = 'ExitXRPanel';

  const panelEntity = world.createTransformEntity(panel, {
    parent: world.sceneEntity,
    persistent: true,
  });
  panelEntity.addComponent(Follower, {
    target: world.player.head,
    offsetPosition: [0, -0.08, -0.42],
    behavior: FollowBehavior.FaceTarget,
    speed: 12,
    tolerance: 0.05,
  });
  panelEntity.addComponent(RayInteractable);

  const onSelect = () => {
    world.exitXR?.();
  };
  panel.addEventListener('pointerup', onSelect);
}

/**
 * @param {import('@iwsdk/core').World} world
 */
function pollControllerMenuExit(world) {
  if (!world.session) {
    return;
  }

  const xr = world.input.xr;
  for (const handedness of ['left', 'right']) {
    const inputSource = xr.activeInputSources.controller[handedness]?.inputSource;
    if (!inputSource?.gamepad || inputSource.connected === false) {
      continue;
    }

    const gp = getCachedGamepad(`menu-${handedness}`, inputSource);
    if (!gp) continue;

    const menuDown = gp.getButtonDown(InputComponent.Menu);
    const bDown =
      gp.getButtonDown(InputComponent.B_Button) ||
      gp.getButtonDown('b-button');
    if (menuDown || bDown) {
      world.exitXR();
      return;
    }
  }
}

const XrControllerExitSystem = createSystem({}, {});

/**
 * @param {import('@iwsdk/core').World} world
 */
export function registerXrControllerExitSystem(world) {
  class ExitOnMenuSystem extends XrControllerExitSystem {
    update() {
      pollControllerMenuExit(this.world);
    }
  }
  world.registerSystem(ExitOnMenuSystem, { priority: 10 });
}

/**
 * IWSDK gradient dome may not paint on some Android XR devices; add a simple sky mesh.
 *
 * @param {import('@iwsdk/core').World} world
 */
export function addPhysicalHeadsetSkyFallback(world) {
  if (typeof window !== 'undefined' && window.__IWER_MCP_MANAGED) {
    return;
  }

  const geo = new SphereGeometry(500, 32, 16);
  const mat = new MeshBasicMaterial({
    color: 0x5a7a9a,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new Mesh(geo, mat);
  sky.name = 'IwsdkPhysicalHeadsetSky';
  sky.frustumCulled = false;
  sky.renderOrder = -2000;
  world.scene.add(sky);
}

export function applyHeadsetXrEnhancements(world) {
  patchXrInputManagerForHeadsets();
  installHeadsetInputPipeline(world);
  addPhysicalHeadsetSkyFallback(world);
  addWalkableFloor(world);
  addExitPanel(world);
  registerXrControllerExitSystem(world);
}

export function clearHeadsetInputCache() {
  gamepadCache.clear();
  rawTriggerPrev.clear();
}
