/**
 * Walker placement + capsule floor snap — no VRM loader (keeps Vite dev graph light).
 */
import * as THREE from 'three';
import {
  getSpacetimeReferenceFootY,
  querySpacetimeWalkSurface,
  querySpacetimeWalkSurfaceForAvatar,
  SPACETIME_XR_EYE_TO_FLOOR,
} from './spacetimeXrGroundFollow.js';

/** Third-person standoff on VR entry (m). */
export const SPACETIME_WALKER_STANDOFF_M = 1.75;

/** Chase-cam lead — collision probe this far ahead of camera along view forward (m). */
export const SPACETIME_THIRD_PERSON_FEET_LEAD_M = 2.0;

const _forward = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();

/**
 * @param {number} headY
 * @param {THREE.Vector3} targetXZ
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3, size?: THREE.Vector3 }|null|undefined} bounds
 */
function resolveWalkerReferenceFootY(headY, targetXZ, bounds) {
  let referenceFootY = getSpacetimeReferenceFootY(headY - SPACETIME_XR_EYE_TO_FLOOR);

  if (bounds?.min && targetXZ) {
    const distXZ = Math.hypot(_camPos.x - targetXZ.x, _camPos.z - targetXZ.z);
    const span = Math.max(bounds.size?.x ?? 0, bounds.size?.z ?? 0, 4);
    if (distXZ > span * 0.45) {
      referenceFootY = Math.max(referenceFootY, bounds.min.y + 0.02);
    }
  }

  return referenceFootY;
}

/**
 * Placement snap — use fabric/capsule floor hint so high orbit angles do not pick roof.
 * @param {THREE.Camera} camera
 * @param {number} headY
 * @param {THREE.Vector3} targetXZ
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3, size?: THREE.Vector3 }|null|undefined} bounds
 */
function resolvePlacementReferenceFootY(camera, headY, targetXZ, bounds) {
  camera.getWorldPosition(_camPos);

  if (bounds?.min && targetXZ) {
    const inFabricXZ =
      targetXZ.x >= bounds.min.x - 0.5 &&
      targetXZ.x <= bounds.max.x + 0.5 &&
      targetXZ.z >= bounds.min.z - 0.5 &&
      targetXZ.z <= bounds.max.z + 0.5;

    if (inFabricXZ) {
      const fabricFootY = bounds.min.y + 0.02;
      const direct = querySpacetimeWalkSurfaceForAvatar(
        targetXZ.x,
        targetXZ.z,
        fabricFootY,
        headY,
      );
      if (direct) {
        return direct.y;
      }
      return fabricFootY;
    }
  }

  return resolveWalkerReferenceFootY(headY, targetXZ, bounds);
}

/**
 * @param {THREE.Group} playerRoot
 * @param {number} referenceFootY
 * @param {number} headY
 * @returns {number|null}
 */
function applyWalkerFootY(playerRoot, referenceFootY, headY) {
  if (!playerRoot) return null;

  playerRoot.updateMatrixWorld(true);
  playerRoot.getWorldPosition(_worldPos);

  const surface =
    querySpacetimeWalkSurfaceForAvatar(
      _worldPos.x,
      _worldPos.z,
      referenceFootY,
      headY,
    ) ||
    querySpacetimeWalkSurface(
      _worldPos.x,
      _worldPos.z,
      headY + 4,
      referenceFootY,
      { airborne: true, headY },
    );

  if (!surface) return null;

  _worldPos.y = surface.y;
  const parent = playerRoot.parent;
  if (parent) {
    parent.updateMatrixWorld(true);
    parent.worldToLocal(_worldPos);
    playerRoot.position.y = _worldPos.y;
  } else {
    playerRoot.position.y = surface.y;
  }

  playerRoot.updateMatrixWorld(true);
  return surface.y;
}

/**
 * Collision probe anchor for third-person avatar locomotion (feet XZ + eye-height Y).
 * Wall/block checks must use the walker — not the camera — or the avatar outruns probes.
 * @param {THREE.Object3D} playerRoot
 * @param {THREE.Vector3} [out]
 * @returns {THREE.Vector3|null}
 */
export function getSpacetimeWalkerCollisionAnchor(playerRoot, out = _worldPos) {
  if (!playerRoot) return null;
  playerRoot.updateMatrixWorld(true);
  playerRoot.getWorldPosition(out);
  out.y += SPACETIME_XR_EYE_TO_FLOOR;
  return out;
}

/**
 * Stick-locomotion collision probe — feet XZ + eye-height Y for BVH queries.
 * Avatar mode: walker root. Viewpoint / first-person: camera (headset).
 *
 * @param {THREE.Camera} camera
 * @param {THREE.Object3D|null|undefined} playerRoot
 * @param {{ avatarControl?: boolean, firstPersonEmbody?: boolean }} [opts]
 * @param {THREE.Vector3} [out]
 * @returns {THREE.Vector3|null}
 */
export function getSpacetimeLocomotionCollisionAnchor(
  camera,
  playerRoot,
  {
    avatarControl = false,
    firstPersonEmbody = false,
    thirdPersonFollowLead = false,
  } = {},
  out = _worldPos,
) {
  if (avatarControl && playerRoot) {
    return getSpacetimeWalkerCollisionAnchor(playerRoot, out);
  }
  if (!camera) return null;
  camera.getWorldPosition(out);
  if (thirdPersonFollowLead && !firstPersonEmbody) {
    camera.getWorldDirection(_camFwd);
    _camFwd.y = 0;
    if (_camFwd.lengthSq() < 1e-6) {
      _camFwd.set(0, 0, -1);
    } else {
      _camFwd.normalize();
    }
    out.addScaledVector(_camFwd, SPACETIME_THIRD_PERSON_FEET_LEAD_M);
  }
  return out;
}

/**
 * @param {THREE.Group} playerRoot
 * @param {THREE.Camera} camera
 */
/**
 * Yaw the walker toward a world-space point (e.g. stadium center on XR entry).
 * @param {THREE.Group} playerRoot
 * @param {THREE.Vector3} worldPoint
 */
export function orientSpacetimeWalkerTowardWorldPoint(playerRoot, worldPoint) {
  if (!playerRoot || !worldPoint) return;

  playerRoot.updateMatrixWorld(true);
  playerRoot.getWorldPosition(_worldPos);
  _camFwd.subVectors(worldPoint, _worldPos);
  _camFwd.y = 0;
  if (_camFwd.lengthSq() < 1e-6) return;
  _camFwd.normalize();

  const parent = playerRoot.parent;
  if (parent) {
    parent.updateMatrixWorld(true);
    parent.getWorldQuaternion(_parentQuat);
    _camFwd.applyQuaternion(_parentQuat.invert());
    _camFwd.y = 0;
    if (_camFwd.lengthSq() < 1e-6) return;
    _camFwd.normalize();
  }

  playerRoot.rotation.set(0, Math.atan2(_camFwd.x, _camFwd.z), 0);
  playerRoot.updateMatrixWorld(true);
}

export function orientSpacetimeWalkerToView(playerRoot, camera) {
  if (!playerRoot || !camera) return;

  camera.getWorldDirection(_camFwd);
  _camFwd.y = 0;
  if (_camFwd.lengthSq() < 1e-6) {
    _camFwd.set(0, 0, 1);
  } else {
    _camFwd.normalize();
  }

  const parent = playerRoot.parent;
  if (parent) {
    parent.updateMatrixWorld(true);
    parent.getWorldQuaternion(_parentQuat);
    _camFwd.applyQuaternion(_parentQuat.invert());
    _camFwd.y = 0;
    if (_camFwd.lengthSq() < 1e-6) {
      _camFwd.set(0, 0, 1);
    } else {
      _camFwd.normalize();
    }
  }

  playerRoot.rotation.set(0, Math.atan2(_camFwd.x, _camFwd.z), 0);
  playerRoot.updateMatrixWorld(true);
}

/**
 * @param {THREE.Group} playerRoot
 * @param {THREE.Camera} camera
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3, size?: THREE.Vector3 }|null|undefined} [bounds]
 * @returns {number|null}
 */
export function snapSpacetimeWalkerToWalkSurface(playerRoot, camera, bounds = null) {
  if (!playerRoot || !camera) return null;

  camera.getWorldPosition(_camPos);
  const headY = _camPos.y;
  // Head-relative hint — never reuse playerRoot Y (sticky scene floor after leaving capsule).
  const referenceFootY = headY - SPACETIME_XR_EYE_TO_FLOOR;

  return applyWalkerFootY(playerRoot, referenceFootY, headY);
}

/**
 * @param {THREE.Group} playerRoot
 * @param {THREE.Camera} camera
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3, size?: THREE.Vector3 }|null|undefined} [bounds]
 * @returns {number|null}
 */
export function tickSpacetimeWalkerGroundFollow(playerRoot, camera, bounds = null) {
  if (!playerRoot?.visible) return null;
  return snapSpacetimeWalkerToWalkSurface(playerRoot, camera, bounds);
}

/**
 * @param {THREE.Group} playerRoot
 * @param {THREE.Camera} camera
 * @param {number} [distanceM]
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3, size?: THREE.Vector3 }|null|undefined} [bounds]
 */
export function placeSpacetimeWalkerStandoff(
  playerRoot,
  camera,
  distanceM = SPACETIME_WALKER_STANDOFF_M,
  bounds = null,
  opts = {},
) {
  const orientToCamera = opts.orientToCamera !== false;
  if (!playerRoot || !camera) return;

  camera.getWorldPosition(_camPos);
  camera.getWorldDirection(_forward);
  _forward.y = 0;
  if (_forward.lengthSq() < 1e-6) {
    _forward.set(0, 0, -1);
  } else {
    _forward.normalize();
  }

  _worldPos.copy(_camPos).addScaledVector(_forward, distanceM);

  const headY = _camPos.y;
  const referenceFootY = resolveWalkerReferenceFootY(headY, _worldPos, bounds);

  const surface =
    querySpacetimeWalkSurfaceForAvatar(
      _worldPos.x,
      _worldPos.z,
      referenceFootY,
      headY,
    ) ||
    querySpacetimeWalkSurface(
      _worldPos.x,
      _worldPos.z,
      headY + 4,
      referenceFootY,
      { airborne: true, headY },
    );

  _worldPos.y = surface?.y ?? referenceFootY;

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
  applyWalkerFootY(playerRoot, referenceFootY, headY);
  playerRoot.updateMatrixWorld(true);
}

/**
 * Place walker at orbit / look target — no camera reframe (2D pick).
 * @param {THREE.Group} playerRoot
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3|null|undefined} orbitTarget
 * @param {{ center: THREE.Vector3, min?: THREE.Vector3, max?: THREE.Vector3, size?: THREE.Vector3 }|null|undefined} bounds
 */
export function placeSpacetimeWalkerAtViewportTarget(
  playerRoot,
  camera,
  orbitTarget,
  bounds = null,
) {
  if (!playerRoot || !camera) return;

  const target = orbitTarget || bounds?.center;
  if (!target) return;

  playerRoot.visible = false;

  camera.getWorldPosition(_camPos);
  const headY = _camPos.y;
  const footY = resolvePlacementReferenceFootY(camera, headY, target, bounds);

  playerRoot.position.set(target.x, footY, target.z);
  playerRoot.rotation.set(0, 0, 0);
  playerRoot.updateMatrixWorld(true);

  applyWalkerFootY(playerRoot, footY, headY);
  orientSpacetimeWalkerToView(playerRoot, camera);
  applyWalkerFootY(playerRoot, footY, headY);

  playerRoot.visible = true;
  playerRoot.updateMatrixWorld(true);

  console.info('[spacetime-xr] walker placed at viewport target', {
    x: playerRoot.position.x,
    y: playerRoot.position.y,
    z: playerRoot.position.z,
  });
}

/** @deprecated Use placeSpacetimeWalkerAtViewportTarget */
export function placeSpacetimeWalkerAtFabricCenter(playerRoot, bounds, camera) {
  return placeSpacetimeWalkerAtViewportTarget(
    playerRoot,
    camera,
    bounds?.center ?? null,
    bounds,
  );
}

/**
 * @param {THREE.Group} playerRoot
 * @param {THREE.Camera} camera
 * @param {number} [distanceM]
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3, size?: THREE.Vector3 }|null|undefined} [bounds]
 */
export function embodySpacetimeWalkerThirdPerson(
  playerRoot,
  camera,
  distanceM = SPACETIME_WALKER_STANDOFF_M,
  bounds = null,
) {
  if (!playerRoot || !camera) return;
  placeSpacetimeWalkerStandoff(playerRoot, camera, distanceM, bounds);
  playerRoot.visible = true;
  console.info('[spacetime-xr] walker third-person embody', { distanceM });
}
