/**
 * IWSDK immersive world bootstrap (hybrid: separate from SceneManager).
 * @see docs/IWSDK_INTEGRATION.md
 */
import {
  World,
  SessionMode,
  ReferenceSpaceType,
  DistanceGrabbable,
  MovementMode,
  OneHandGrabbable,
} from '@iwsdk/core';
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import {
  applyHeadsetXrEnhancements,
  clearHeadsetInputCache,
  patchXrInputManagerForHeadsets,
} from './iwsdkXrEnhancements.js';
import { clearIwsdkWorldContent } from './iwsdkWorldPackage.js';

/**
 * @param {HTMLDivElement} container
 * @param {object} [options]
 * @param {boolean} [options.skipDemoInteractables]
 * @returns {Promise<import('@iwsdk/core').World>}
 */
export async function createIwsdkWorld(container, options = {}) {
  patchXrInputManagerForHeadsets();

  const world = await World.create(container, {
    xr: {
      offer: 'none',
      sessionMode: SessionMode.ImmersiveVR,
      referenceSpace: {
        type: ReferenceSpaceType.LocalFloor,
        fallbackOrder: [
          ReferenceSpaceType.BoundedFloor,
          ReferenceSpaceType.Local,
          ReferenceSpaceType.Viewer,
        ],
      },
      features: {
        handTracking: true,
        hitTest: true,
        anchors: true,
        layers: false,
      },
    },
    input: {
      canvasPointerEvents: {
        enabled: true,
        activeDuringXR: false,
      },
    },
    features: {
      locomotion: {
        browserControls: true,
        enableJumping: true,
      },
      grabbing: {
        useHandPinchForGrab: true,
      },
      spatialUI: true,
    },
    render: {
      defaultLighting: true,
      camera: {
        position: [0, 1.6, 2],
        lookAt: [0, 1.2, 0],
      },
    },
  });

  // Galaxy XR WebGL can black-screen with multiviewStereo; PC emulator is fine either way.
  if (typeof window !== 'undefined' && !window.__IWER_MCP_MANAGED) {
    world.renderer.xr.multiviewStereo = false;
  }

  if (!options.skipDemoInteractables) {
    addDemoInteractables(world);
  }
  applyHeadsetXrEnhancements(world);
  return world;
}

/**
 * Blue cube:
 * - Distance (ray + trigger/pinch): white dot at range
 * - Proximity (walk up + grip squeeze): OneHandGrabbable volume
 *
 * @param {import('@iwsdk/core').World} world
 */
function addDemoInteractables(world) {
  const parent = world.activeLevel?.value ?? world.sceneEntity;

  const geometry = new BoxGeometry(0.4, 0.4, 0.4);
  const material = new MeshStandardMaterial({ color: 0x4a9eff });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, 0.2, -0.85);
  mesh.name = 'IwsdkDemoCube';

  const cubeEntity = world.createTransformEntity(mesh, { parent });
  cubeEntity.addComponent(DistanceGrabbable, {
    movementMode: MovementMode.MoveTowardsTarget,
    rotate: true,
    translate: true,
    targetPositionOffset: [0, 0, -0.35],
  });
  // Same mesh: ray + trigger for distance; walk up + grip/pinch for proximity.
  // A separate larger collider blocked the ray and broke controller trigger grab on headset.
  cubeEntity.addComponent(OneHandGrabbable, {
    rotate: true,
    translate: true,
  });
}

/**
 * @param {import('@iwsdk/core').World | null | undefined} world
 */
export function disposeIwsdkWorld(world) {
  if (!world) return;

  clearIwsdkWorldContent(world);
  clearHeadsetInputCache();

  try {
    world.exitXR?.();
  } catch {
    /* session may already be ended */
  }

  try {
    const canvas = world.renderer?.domElement;
    if (canvas?.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
    world.renderer?.dispose?.();
  } catch {
    /* best-effort teardown */
  }
}

export { SessionMode };
