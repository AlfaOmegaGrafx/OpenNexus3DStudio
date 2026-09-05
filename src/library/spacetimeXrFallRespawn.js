/**
 * Space-Time XR fall-off-map detection + corridor respawn (reference spawn).
 * Respawns viewpoint + avatar to the default stadium entrance facing the screen.
 */
import * as THREE from 'three';
import { alignSpacetimeRigToViewport } from './spacetimeViewportControls.js';
import {
  SPACETIME_XR_EYE_TO_FLOOR,
  getSpacetimeGroundFollowState,
  isSpacetimeInsideSceneWalkBounds,
  resetSpacetimeGroundFollowState,
} from './spacetimeXrGroundFollow.js';
import {
  applySpacetimeDefaultAvatarSpawn,
  buildSpacetimeDefaultSpawnView,
} from './spacetimeXrSpawnReference.js';

/** Seconds airborne outside walk bounds before respawn. */
export const SPACETIME_FALL_OUTSIDE_AIR_S = 0.85;

/** Seconds below deck / void before respawn. */
export const SPACETIME_FALL_BELOW_DECK_S = 0.35;

/** Feet this far under fabric min Y → treat as void fall. */
export const SPACETIME_FALL_BELOW_DECK_M = 1.5;

/** Cooldown after respawn to avoid re-trigger (s). */
export const SPACETIME_RESPAWN_COOLDOWN_S = 1.25;

let fallAirSeconds = 0;
let respawnCooldown = 0;
let forceDefaultSpawnOnNextXrEnter = false;

const _head = new THREE.Vector3();

/**
 * Mark that the next XR enter (and desktop restore on exit) should use corridor spawn.
 */
export function markSpacetimeFallOffMapPendingReenter() {
  forceDefaultSpawnOnNextXrEnter = true;
}

/** @returns {boolean} */
export function shouldForceSpacetimeDefaultSpawnOnXrEnter() {
  return forceDefaultSpawnOnNextXrEnter;
}

export function clearSpacetimeFallOffMapReenter() {
  forceDefaultSpawnOnNextXrEnter = false;
}

/**
 * @param {{ center: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3, size?: THREE.Vector3 }|null|undefined} fabricBounds
 */
export function buildSpacetimeDefaultSpawnDesktopView(fabricBounds, fabricRoot = null) {
  const spawn = buildSpacetimeDefaultSpawnView(fabricBounds, SPACETIME_XR_EYE_TO_FLOOR, fabricRoot);
  if (!spawn) return null;
  return {
    position: spawn.position.clone(),
    quaternion: spawn.quaternion.clone(),
    target: spawn.target.clone(),
    zoom: spawn.zoom,
    avatarFootY: spawn.avatarFoot.y,
  };
}

/**
 * Detect sustained fall through the scene (void / outside walk deck).
 * @param {THREE.Camera} camera
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3 }|null|undefined} fabricBounds
 * @param {number} deltaSeconds
 * @returns {boolean}
 */
export function tickSpacetimeFallOffMapDetection(camera, fabricBounds, deltaSeconds) {
  if (!camera || respawnCooldown > 0) {
    if (respawnCooldown > 0) {
      respawnCooldown = Math.max(0, respawnCooldown - deltaSeconds);
    }
    return false;
  }

  camera.getWorldPosition(_head);
  const { wasGrounded, lastFootY, verticalVelocity } = getSpacetimeGroundFollowState();
  const footY = lastFootY ?? _head.y - SPACETIME_XR_EYE_TO_FLOOR;
  const minDeckY = fabricBounds?.min?.y ?? 0;

  const outsideXZ = !isSpacetimeInsideSceneWalkBounds(_head.x, _head.z);
  const belowDeck = footY < minDeckY - SPACETIME_FALL_BELOW_DECK_M;
  const headInVoid = _head.y < minDeckY - 0.45;
  const airborne = !wasGrounded;

  let fallingOff = false;
  if (airborne && (belowDeck || headInVoid)) {
    fallAirSeconds += deltaSeconds;
    if (fallAirSeconds >= SPACETIME_FALL_BELOW_DECK_S) {
      fallingOff = true;
    }
  } else if (airborne && outsideXZ) {
    fallAirSeconds += deltaSeconds;
    if (fallAirSeconds >= SPACETIME_FALL_OUTSIDE_AIR_S) {
      fallingOff = true;
    }
  } else if (airborne && verticalVelocity <= -4 && fallAirSeconds > 0.25) {
    fallAirSeconds += deltaSeconds;
    if (fallAirSeconds >= 1.0) {
      fallingOff = true;
    }
  } else {
    fallAirSeconds = Math.max(0, fallAirSeconds - deltaSeconds * 3);
  }

  if (fallingOff) {
    markSpacetimeFallOffMapPendingReenter();
    fallAirSeconds = 0;
    return true;
  }

  return false;
}

/**
 * Snap locomotion rig + avatar to the default corridor spawn (reference image).
 * @param {{
 *   locomotionRig: THREE.Group,
 *   camera: THREE.Camera,
 *   playerRoot?: THREE.Group|null,
 *   fabricBounds: { center: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3, size?: THREE.Vector3 }|null,
 *   fabricRoot?: THREE.Object3D|null,
 *   frame?: XRFrame|null,
 *   referenceSpace?: XRReferenceSpace|null,
 * }} ctx
 */
export function applySpacetimeXrCorridorRespawn(ctx) {
  const {
    locomotionRig,
    camera,
    playerRoot = null,
    fabricBounds,
    fabricRoot = null,
    frame = null,
    referenceSpace = null,
  } = ctx;
  const spawnView = buildSpacetimeDefaultSpawnDesktopView(fabricBounds, fabricRoot);
  if (!spawnView || !locomotionRig || !camera) return null;

  locomotionRig.position.set(0, 0, 0);
  locomotionRig.rotation.set(0, 0, 0);
  locomotionRig.updateMatrixWorld(true);

  if (frame && referenceSpace) {
    alignSpacetimeRigToViewport(
      locomotionRig,
      camera,
      spawnView,
      frame,
      referenceSpace,
    );
  }

  if (playerRoot) {
    applySpacetimeDefaultAvatarSpawn(playerRoot, camera, fabricBounds, fabricRoot);
  }

  resetSpacetimeGroundFollowState(spawnView.avatarFootY);
  respawnCooldown = SPACETIME_RESPAWN_COOLDOWN_S;
  clearSpacetimeFallOffMapReenter();

  console.warn('[spacetime-xr] fall-off-map respawn → corridor spawn', {
    x: spawnView.position.x.toFixed(2),
    z: spawnView.position.z.toFixed(2),
  });

  return spawnView;
}

export function resetSpacetimeFallOffMapTracking() {
  fallAirSeconds = 0;
  respawnCooldown = 0;
}
