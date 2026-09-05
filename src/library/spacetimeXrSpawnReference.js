/**
 * Default XR spawn — corridor between Eagle Knight and Auto Rig, facing the screen.
 * Matches the reference layout: viewer behind avatar on the center path (not the podium).
 */
import * as THREE from 'three';
import { SPACETIME_XR_EYE_TO_FLOOR } from './spacetimeXrGroundFollow.js';
import { isSpacetimeInsideSceneWalkBounds } from './spacetimeXrGroundFollow.js';
import {
  orientSpacetimeWalkerTowardWorldPoint,
  snapSpacetimeWalkerToWalkSurface,
} from './spacetimeXrWalkerSnap.js';

/** Default third-person viewer offset behind avatar feet (m). */
export const SPACETIME_SPAWN_VIEWER_BEHIND_M = 2.2;

/** Fabric Eagle Knight reference XZ (Three.js Y-up) — fallback when scene nodes missing. */
export const SPACETIME_EAGLE_KNIGHT_REF_XZ = Object.freeze({ x: 0.02806, z: -2.18527 });

/** Fabric Auto Rig reference XZ (Three.js Y-up). */
export const SPACETIME_AUTORIG_REF_XZ = Object.freeze({ x: -0.00425, z: 1.87728 });

/** Desktop orbit aimed at fabric center within this radius → use landmark XR enter. */
export const SPACETIME_PODIUM_ORBIT_RADIUS_M = 5;

const _fwd = new THREE.Vector3();
const _along = new THREE.Vector3();
const _toCenter = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _lookMatrix = new THREE.Matrix4();
const _lookQuat = new THREE.Quaternion();
const _landmarkA = new THREE.Vector3();
const _landmarkB = new THREE.Vector3();

/**
 * @param {THREE.Object3D|null|undefined} fabricRoot
 * @param {RegExp} pattern
 */
function findSpacetimeFabricLandmark(fabricRoot, pattern) {
  if (!fabricRoot) return null;
  fabricRoot.updateMatrixWorld(true);
  let match = null;
  fabricRoot.traverse((child) => {
    if (match || !child?.name) return;
    if (pattern.test(child.name)) {
      match = child;
    }
  });
  return match;
}

/**
 * Midpoint on the center path between Eagle Knight and Auto Rig props.
 * @param {THREE.Object3D|null|undefined} [fabricRoot]
 */
export function resolveSpacetimeLandmarkMidpointXZ(fabricRoot = null) {
  const eagle = findSpacetimeFabricLandmark(fabricRoot, /eagle/i);
  const autorig = findSpacetimeFabricLandmark(fabricRoot, /auto\s*rig|autorig/i);

  if (eagle && autorig) {
    eagle.getWorldPosition(_landmarkA);
    autorig.getWorldPosition(_landmarkB);
    return {
      x: (_landmarkA.x + _landmarkB.x) * 0.5,
      z: (_landmarkA.z + _landmarkB.z) * 0.5,
      source: 'fabric-nodes',
    };
  }

  return {
    x: (SPACETIME_EAGLE_KNIGHT_REF_XZ.x + SPACETIME_AUTORIG_REF_XZ.x) * 0.5,
    z: (SPACETIME_EAGLE_KNIGHT_REF_XZ.z + SPACETIME_AUTORIG_REF_XZ.z) * 0.5,
    source: 'reference-xz',
  };
}

/**
 * True when desktop orbit is framed on the stadium podium (fabric center), not the corridor.
 * @param {{ position?: THREE.Vector3, target?: THREE.Vector3 }|null|undefined} view
 * @param {{ center: THREE.Vector3 }|null|undefined} fabricBounds
 * @param {THREE.Object3D|null|undefined} [fabricRoot]
 */
export function shouldUseSpacetimeLandmarkXrEnter(view, fabricBounds, fabricRoot = null) {
  if (!view?.position || !fabricBounds?.center) return false;

  const mid = resolveSpacetimeLandmarkMidpointXZ(fabricRoot);
  const distToLandmark = Math.hypot(
    view.position.x - mid.x,
    view.position.z - mid.z,
  );
  if (distToLandmark < 2.5) return false;

  const target = view.target ?? fabricBounds.center;
  const distTargetToCenter = Math.hypot(
    target.x - fabricBounds.center.x,
    target.z - fabricBounds.center.z,
  );
  return distTargetToCenter <= SPACETIME_PODIUM_ORBIT_RADIUS_M;
}

/**
 * @param {number} x
 * @param {number} z
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3 }|null|undefined} fabricBounds
 */
export function isSpacetimePositionInFabricBounds(x, z, fabricBounds) {
  if (!fabricBounds?.min || !fabricBounds?.max) return true;
  const pad = 0.35;
  return (
    x >= fabricBounds.min.x - pad &&
    x <= fabricBounds.max.x + pad &&
    z >= fabricBounds.min.z - pad &&
    z <= fabricBounds.max.z + pad
  );
}

/**
 * @param {{ position?: THREE.Vector3, target?: THREE.Vector3 }|null|undefined} view
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3, center?: THREE.Vector3 }|null|undefined} fabricBounds
 */
export function isSpacetimeViewInScene(view, fabricBounds = null) {
  if (!view?.position) return false;

  const { x, z } = view.position;
  if (!isSpacetimePositionInFabricBounds(x, z, fabricBounds)) return false;
  if (!isSpacetimeInsideSceneWalkBounds(x, z)) return false;

  if (view.target) {
    if (!isSpacetimePositionInFabricBounds(view.target.x, view.target.z, fabricBounds)) {
      return false;
    }
    if (!isSpacetimeInsideSceneWalkBounds(view.target.x, view.target.z)) return false;
  }

  return true;
}

/**
 * Corridor facing: perpendicular to Eagle Knight ↔ Auto Rig, toward the screen.
 * AABB-center look is 180° wrong on sneeze (mass is behind the screen) — pick the
 * perpendicular that faces *away* from fabric center. If center lies along the
 * landmark axis, keep looking toward center.
 * @param {{ x: number, z: number }} mid
 * @param {{ center: THREE.Vector3 }} fabricBounds
 * @param {THREE.Object3D|null|undefined} [fabricRoot]
 * @param {THREE.Vector3} out
 */
export function resolveSpacetimeCorridorSpawnForward(mid, fabricBounds, fabricRoot, out) {
  const eagle = findSpacetimeFabricLandmark(fabricRoot, /eagle/i);
  const autorig = findSpacetimeFabricLandmark(fabricRoot, /auto\s*rig|autorig/i);
  if (eagle && autorig) {
    eagle.getWorldPosition(_landmarkA);
    autorig.getWorldPosition(_landmarkB);
    _along.set(_landmarkB.x - _landmarkA.x, 0, _landmarkB.z - _landmarkA.z);
  } else {
    _along.set(
      SPACETIME_AUTORIG_REF_XZ.x - SPACETIME_EAGLE_KNIGHT_REF_XZ.x,
      0,
      SPACETIME_AUTORIG_REF_XZ.z - SPACETIME_EAGLE_KNIGHT_REF_XZ.z,
    );
  }

  _toCenter.set(fabricBounds.center.x - mid.x, 0, fabricBounds.center.z - mid.z);

  if (_along.lengthSq() > 1e-6) {
    _along.normalize();
    // Always face perpendicular to Eagle↔AutoRig (stadium), never along the props.
    // Left perp first; flip to face away from fabric mass when that signal is clear.
    // When center lies on the corridor axis (sneeze), use 90° clockwise (= right of
    // Auto-Rig facing) so the avatar looks at the stadium screen again.
    out.set(_along.z, 0, -_along.x);
    const alongDot = _along.x * _toCenter.x + _along.z * _toCenter.z;
    const perpDot = out.x * _toCenter.x + out.z * _toCenter.z;
    if (Math.abs(perpDot) >= 1e-4 && Math.abs(perpDot) >= Math.abs(alongDot) * 0.25) {
      if (perpDot > 0) out.negate();
    } else {
      out.set(-_along.z, 0, _along.x);
    }
    return out.normalize();
  }

  if (_toCenter.lengthSq() > 1e-6) {
    return out.copy(_toCenter).normalize();
  }
  return out.set(0, 0, 1);
}

/**
 * Corridor spawn between Eagle Knight + Auto Rig, facing the screen / podium.
 * @param {{ center: THREE.Vector3, size?: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3 }|null|undefined} fabricBounds
 * @param {number} [eyeToFloor=SPACETIME_XR_EYE_TO_FLOOR]
 * @param {THREE.Object3D|null|undefined} [fabricRoot]
 */
export function buildSpacetimeDefaultSpawnView(
  fabricBounds,
  eyeToFloor = SPACETIME_XR_EYE_TO_FLOOR,
  fabricRoot = null,
) {
  if (!fabricBounds?.center || !fabricBounds?.min || !fabricBounds?.max) return null;

  const { min } = fabricBounds;
  const footY = min.y + 0.02;
  const mid = resolveSpacetimeLandmarkMidpointXZ(fabricRoot);

  const avatarFoot = new THREE.Vector3(mid.x, footY, mid.z);
  resolveSpacetimeCorridorSpawnForward(mid, fabricBounds, fabricRoot, _fwd);
  _lookTarget.copy(avatarFoot).addScaledVector(_fwd, 8);
  _lookTarget.y = footY + Math.max(eyeToFloor * 0.55, 0.9);

  _camPos.copy(avatarFoot).addScaledVector(_fwd, -SPACETIME_SPAWN_VIEWER_BEHIND_M);
  _camPos.y = footY + eyeToFloor;

  _lookMatrix.lookAt(_camPos, _lookTarget, THREE.Object3D.DEFAULT_UP);
  _lookQuat.setFromRotationMatrix(_lookMatrix);

  return {
    position: _camPos.clone(),
    quaternion: _lookQuat.clone(),
    target: _lookTarget.clone(),
    zoom: 1,
    avatarFoot: avatarFoot.clone(),
    spawnFocus: _lookTarget.clone(),
  };
}

/**
 * @param {{ position?: THREE.Vector3, quaternion?: THREE.Quaternion, target?: THREE.Vector3, zoom?: number }|null|undefined} view
 * @param {{ center: THREE.Vector3, size?: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3 }|null|undefined} fabricBounds
 * @param {THREE.Object3D|null|undefined} [fabricRoot]
 */
export function resolveSpacetimeViewForScene(view, fabricBounds, fabricRoot = null) {
  if (view && isSpacetimeViewInScene(view, fabricBounds)) {
    return { view, usedDefaultSpawn: false };
  }

  const fallback = buildSpacetimeDefaultSpawnView(fabricBounds, SPACETIME_XR_EYE_TO_FLOOR, fabricRoot);
  if (!fallback) {
    return { view, usedDefaultSpawn: false };
  }

  console.warn('[spacetime-xr] viewport outside scene — using corridor spawn (Eagle Knight / Auto Rig)', {
    hadView: !!view?.position,
    position: view?.position
      ? { x: view.position.x, z: view.position.z }
      : null,
    fallback: {
      x: fallback.position.x,
      z: fallback.position.z,
    },
  });

  return {
    view: {
      position: fallback.position,
      quaternion: fallback.quaternion,
      target: fallback.target,
      zoom: fallback.zoom,
    },
    usedDefaultSpawn: true,
    spawnMeta: fallback,
  };
}

/**
 * @param {{ position?: THREE.Vector3, quaternion?: THREE.Quaternion, target?: THREE.Vector3, zoom?: number }|null|undefined} view
 */
export function cloneSpacetimeView(view) {
  if (!view?.position) return null;
  return {
    position: view.position.clone(),
    quaternion: view.quaternion?.clone?.() ?? new THREE.Quaternion(),
    target: view.target?.clone?.() ?? new THREE.Vector3(),
    zoom: typeof view.zoom === 'number' ? view.zoom : 1,
  };
}

/**
 * Re-enter XR from the last in-session capture — never the desktop orbit camera.
 * @param {{ position?: THREE.Vector3, target?: THREE.Vector3 }|null|undefined} persistedView
 * @param {{ position?: THREE.Vector3, target?: THREE.Vector3 }|null|undefined} desktopView
 */
export function resolveSpacetimeXrEnterView(
  persistedView,
  desktopView,
  fabricBounds,
  fabricRoot = null,
) {
  if (persistedView?.position && isSpacetimeViewInScene(persistedView, fabricBounds)) {
    const view = cloneSpacetimeView(persistedView);
    console.info('[spacetime-xr] XR enter using persisted view', {
      x: view.position.x,
      z: view.position.z,
    });
    return { view, usedDefaultSpawn: false, source: 'persisted' };
  }

  const resolved = resolveSpacetimeViewForScene(desktopView, fabricBounds, fabricRoot);
  return {
    ...resolved,
    source: resolved.usedDefaultSpawn ? 'corridor' : 'desktop',
  };
}

/**
 * Place walker between Eagle Knight and Auto Rig, facing the stadium screen.
 * @param {THREE.Group} playerRoot
 * @param {THREE.Camera} camera
 * @param {{ center: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3, size?: THREE.Vector3 }|null|undefined} fabricBounds
 * @param {THREE.Object3D|null|undefined} [fabricRoot]
 */
export function applySpacetimeDefaultAvatarSpawn(
  playerRoot,
  camera,
  fabricBounds,
  fabricRoot = null,
) {
  const spawn = buildSpacetimeDefaultSpawnView(fabricBounds, SPACETIME_XR_EYE_TO_FLOOR, fabricRoot);
  if (!spawn?.avatarFoot || !playerRoot || !camera) return false;

  playerRoot.visible = true;
  playerRoot.position.copy(spawn.avatarFoot);
  playerRoot.updateMatrixWorld(true);
  orientSpacetimeWalkerTowardWorldPoint(playerRoot, spawn.spawnFocus);
  snapSpacetimeWalkerToWalkSurface(playerRoot, camera, fabricBounds);
  playerRoot.updateMatrixWorld(true);

  console.info('[spacetime-xr] avatar placed at corridor spawn (Eagle Knight / Auto Rig)', {
    x: spawn.avatarFoot.x,
    z: spawn.avatarFoot.z,
    lookX: spawn.spawnFocus.x,
    lookZ: spawn.spawnFocus.z,
    camX: spawn.position.x,
    camZ: spawn.position.z,
  });
  return true;
}
