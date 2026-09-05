/**
 * Space-Time XR ground follow — BVH raycast onto capsule walk mesh (WebXR world-drag safe).
 * Multi-probe slopes, gravity when airborne, horizontal wall + edge blocking.
 */
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { findCapsuleWalkRoot } from './spacetimeXrFloor.js';

/** Eye height → floor offset for local-floor reference space (~5′11″ user). */
export const SPACETIME_XR_EYE_TO_FLOOR = 1.6;

/** Max ramp angle (radians) — IWSDK locomotor default ≈ 57°. */
export const SPACETIME_MAX_WALK_SLOPE_RAD = 0.95;

/** Reject hits above the headset (roof / shell). */
export const SPACETIME_MAX_HIT_ABOVE_HEAD_M = 0.15;

/** Max upward snap per frame while grounded (stairs / stadium ramps). */
export const SPACETIME_MAX_STEP_UP_M = 0.85;

/** Max downward snap per frame (drops / descending ramps). */
export const SPACETIME_MAX_STEP_DOWN_M = 2.5;

/** Max drop at destination without treating it as a cliff edge. */
export const SPACETIME_EDGE_MAX_DROP_M = 0.85;

/** Horizontal probe radius for foot ring + edge checks. */
export const SPACETIME_FOOT_PROBE_RADIUS_M = 0.32;

/** Player capsule radius for wall collision. */
export const SPACETIME_BODY_RADIUS_M = 0.34;

/** Horizontal blockers — stadium risers / shell (ramps stay walk-through). */
export const SPACETIME_WALL_NORMAL_Y_MAX = 0.42;

/** Foot-level horizontal probe height above walk surface. */
export const SPACETIME_FOOT_COLLISION_Y = 0.2;

/** Min upward step before a blocking wall may be bypassed (small ramp risers only). */
export const SPACETIME_WALL_STEP_UP_BYPASS_M = 0.12;

/** Max foot-ring Y spread for stable footing (reject capsule wedge gaps). */
export const SPACETIME_FOOTING_MAX_SPREAD_M = 0.35;

/** Min probes for locomotion destination (ramps / doorways). */
export const SPACETIME_FOOTING_DEST_MIN_PROBES = 2;

/** Min probes for teleport / strict landing checks. */
export const SPACETIME_FOOTING_MIN_PROBES = 5;

/** Upward ray — reject floors under a low shell ceiling / wedge. */
export const SPACETIME_OVERHEAD_CLEARANCE_M = 1.35;

/** Substep size for wall sweep along stick moves (m). */
export const SPACETIME_WALL_SWEEP_STEP_M = 0.08;

/** Downward acceleration when no floor under feet (m/s²). */
export const SPACETIME_GRAVITY_MPS2 = 14;

/** Terminal fall speed (m/s). */
export const SPACETIME_MAX_FALL_SPEED_MPS = 8;

const _head = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _down = new THREE.Vector3(0, -1, 0);
const _overheadDir = new THREE.Vector3(0, 1, 0);
const _worldNormal = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _wallRaycaster = new THREE.Raycaster();
const _probe = new THREE.Vector3();
const _horizDir = new THREE.Vector3();
const _wallNormal = new THREE.Vector3();
const _slideMove = new THREE.Vector3();
const _wallHorizNormal = new THREE.Vector3();
const _move = new THREE.Vector3();

/** Steep walkable shell faces (stadium incline lip) still block horizontal entry. */
export const SPACETIME_SOLID_SHELL_NORMAL_Y_MAX = 0.72;

/** Horizontal deck above feet that blocks forward entry (shell roof/lip). */
export const SPACETIME_SOLID_DECK_NORMAL_Y_MIN = 0.92;

/** Min foot Y before stadium incline lip envelope applies (m). */
export const SPACETIME_STADIUM_LIP_FOOT_Y_MIN = 7.2;

const _boxSize = new THREE.Vector3();
const _lateral = new THREE.Vector3();

/** @type {THREE.Object3D|null} */
let walkRoot = null;
/** @type {{ inclineBox: THREE.Box3|null }|null} */
let stadiumWalkEnvelope = null;
/** @type {{ minX: number, maxX: number, minZ: number, maxZ: number }|null} */
let sceneWalkBounds = null;
/** @type {number|null} */
let lastWalkSurfaceY = null;
/** @type {number|null} */
let lastFootY = null;
/** @type {number} */
let verticalVelocity = 0;
/** @type {boolean} */
let wasGrounded = false;

/**
 * @returns {{ wasGrounded: boolean, lastFootY: number|null, lastWalkSurfaceY: number|null, verticalVelocity: number }}
 */
export function getSpacetimeGroundFollowState() {
  return {
    wasGrounded,
    lastFootY,
    lastWalkSurfaceY,
    verticalVelocity,
  };
}

/**
 * Reset gravity / footing after a teleport respawn.
 * @param {number|null|undefined} footY
 */
export function resetSpacetimeGroundFollowState(footY = null) {
  verticalVelocity = 0;
  wasGrounded = true;
  if (footY != null && Number.isFinite(footY)) {
    lastFootY = footY;
    lastWalkSurfaceY = footY;
  }
}

/** Simulate airborne fall for tests / recovery after respawn edge cases. */
export function setSpacetimeGroundFollowAirborne(footY, verticalVelocityMps = -6) {
  wasGrounded = false;
  lastFootY = footY;
  lastWalkSurfaceY = footY;
  verticalVelocity = verticalVelocityMps;
}

/**
 * Build three-mesh-bvh trees on capsule interior meshes for fast ground queries.
 * @param {THREE.Object3D} fabricRoot
 * @returns {number}
 */
export function prepareSpacetimeWalkSurfaces(fabricRoot) {
  walkRoot = findCapsuleWalkRoot(fabricRoot) || fabricRoot;
  if (!walkRoot) return 0;

  let meshCount = 0;
  walkRoot.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const geo = child.geometry;
    if (!geo.boundsTree) {
      geo.boundsTree = new MeshBVH(geo);
    }
    child.raycast = acceleratedRaycast;
    meshCount += 1;
  });

  console.info('[spacetime-xr] walk BVH prepared', walkRoot.name, meshCount);
  stadiumWalkEnvelope = computeStadiumWalkEnvelope(walkRoot);
  const deckBounds = computeSpacetimeWalkDeckBounds(walkRoot);
  if (deckBounds) {
    setSpacetimeSceneWalkBounds(deckBounds);
  }
  if (stadiumWalkEnvelope?.inclineBox) {
    const lip = stadiumWalkEnvelope.inclineBox;
    console.info('[spacetime-xr] stadium incline lip envelope', {
      xMax: +lip.max.x.toFixed(2),
      y: [+lip.min.y.toFixed(2), +lip.max.y.toFixed(2)],
      z: [+lip.min.z.toFixed(2), +lip.max.z.toFixed(2)],
    });
  }
  return meshCount;
}

export function resetSpacetimeWalkSurfaces() {
  walkRoot = null;
  stadiumWalkEnvelope = null;
  sceneWalkBounds = null;
  lastWalkSurfaceY = null;
  lastFootY = null;
  verticalVelocity = 0;
  wasGrounded = false;
}

/**
 * Walkable deck XZ envelope from horizontal floor meshes (excludes inset vertical shell walls).
 * @param {THREE.Object3D} root
 * @returns {{ min: THREE.Vector3, max: THREE.Vector3 }|null}
 */
function computeSpacetimeWalkDeckBounds(root) {
  if (!root) return null;

  root.updateMatrixWorld(true);
  const deck = new THREE.Box3();
  let any = false;

  root.traverse((child) => {
    if (!child.isMesh) return;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) return;
    box.getSize(_boxSize);
    const spanXZ = Math.max(_boxSize.x, _boxSize.z);
    const spanY = _boxSize.y;
    // Vertical shell / riser colliders sit inside the visual deck edge — omit from bounds.
    if (spanY > 1.4 && spanXZ < spanY * 0.65) return;
    if (spanXZ < 0.35 && spanY < 0.35) return;
    deck.union(box);
    any = true;
  });

  if (!any || deck.isEmpty()) return null;
  deck.expandByScalar(SPACETIME_BODY_RADIUS_M * 0.15);
  return { min: deck.min.clone(), max: deck.max.clone() };
}

/**
 * Fabric / deck XZ bounds — outer walk deck (not the inset stadium shell collider).
 * @param {{ min?: THREE.Vector3, max?: THREE.Vector3 }|null|undefined} bounds
 */
export function setSpacetimeSceneWalkBounds(bounds) {
  if (!bounds?.min || !bounds?.max) {
    sceneWalkBounds = null;
    return;
  }
  const pad = SPACETIME_BODY_RADIUS_M * 0.12;
  sceneWalkBounds = {
    minX: bounds.min.x + pad,
    maxX: bounds.max.x - pad,
    minZ: bounds.min.z + pad,
    maxZ: bounds.max.z - pad,
  };
  console.info('[spacetime-xr] scene walk bounds', {
    source: 'walk-deck',
    x: [sceneWalkBounds.minX.toFixed(2), sceneWalkBounds.maxX.toFixed(2)],
    z: [sceneWalkBounds.minZ.toFixed(2), sceneWalkBounds.maxZ.toFixed(2)],
  });
}

/**
 * @param {number} x
 * @param {number} z
 */
export function isSpacetimeInsideSceneWalkBounds(x, z) {
  if (!sceneWalkBounds) return true;
  return (
    x >= sceneWalkBounds.minX &&
    x <= sceneWalkBounds.maxX &&
    z >= sceneWalkBounds.minZ &&
    z <= sceneWalkBounds.maxZ
  );
}

/**
 * @param {THREE.Vector3} worldHead
 * @param {THREE.Vector3} moveDelta
 * @returns {THREE.Vector3}
 */
export function clampSpacetimeMoveToSceneBounds(worldHead, moveDelta) {
  if (!sceneWalkBounds || moveDelta.lengthSq() < 1e-10) {
    return moveDelta.clone();
  }

  const destX = worldHead.x + moveDelta.x;
  const destZ = worldHead.z + moveDelta.z;
  if (isSpacetimeInsideSceneWalkBounds(destX, destZ)) {
    return moveDelta.clone();
  }

  let allowedX = destX;
  let allowedZ = destZ;
  allowedX = Math.max(sceneWalkBounds.minX, Math.min(sceneWalkBounds.maxX, allowedX));
  allowedZ = Math.max(sceneWalkBounds.minZ, Math.min(sceneWalkBounds.maxZ, allowedZ));

  const result = new THREE.Vector3(
    allowedX - worldHead.x,
    0,
    allowedZ - worldHead.z,
  );

  if (result.lengthSq() < 1e-10) {
    const slideX = new THREE.Vector3(allowedX - worldHead.x, 0, 0);
    const slideZ = new THREE.Vector3(0, 0, allowedZ - worldHead.z);
    if (slideX.lengthSq() > slideZ.lengthSq()) {
      return slideX;
    }
    if (slideZ.lengthSq() > 1e-10) {
      return slideZ;
    }
  }

  return result;
}

/** @param {number} fallbackFootY */
export function getSpacetimeReferenceFootY(fallbackFootY) {
  return lastFootY ?? fallbackFootY;
}

/**
 * @param {THREE.Vector3} normal
 * @returns {boolean}
 */
export function isSpacetimeBlockingWall(normal) {
  if (!normal) return false;
  _wallNormal.copy(normal);
  if (_wallNormal.y < 0) _wallNormal.negate();
  if (_wallNormal.angleTo(_up) <= SPACETIME_MAX_WALK_SLOPE_RAD) return false;
  return _wallNormal.y < SPACETIME_WALL_NORMAL_Y_MAX;
}

/**
 * Solid horizontal block — vertical walls plus stadium shell decks/lips (not same-deck ramps).
 * @param {THREE.Intersection} hit
 * @param {number} probeFootY
 * @param {number} referenceFootY
 */
export function isSpacetimeSolidBlockHit(hit, probeFootY, referenceFootY) {
  const normal = getWorldHitNormal(hit);
  if (!normal) return true;

  _worldNormal.copy(normal);
  if (_worldNormal.y < 0) _worldNormal.negate();

  if (isSpacetimeBlockingWall(_worldNormal)) {
    return true;
  }

  const hitY = hit.point.y;
  const sameDeck =
    Math.abs(hitY - probeFootY) <= SPACETIME_WALL_STEP_UP_BYPASS_M &&
    Math.abs(hitY - referenceFootY) <= SPACETIME_MAX_STEP_UP_M;

  if (sameDeck && _worldNormal.y > SPACETIME_WALL_NORMAL_Y_MAX) {
    return false;
  }

  if (
    _worldNormal.y < SPACETIME_SOLID_SHELL_NORMAL_Y_MAX &&
    hitY >= probeFootY - 0.15
  ) {
    return true;
  }

  if (
    _worldNormal.y >= SPACETIME_SOLID_DECK_NORMAL_Y_MIN &&
    hitY > probeFootY + 0.3
  ) {
    return true;
  }

  return false;
}

/**
 * Detect exterior incline lip from capsule GLB (mesh_3-like ramp ending in a void gap).
 * @param {THREE.Object3D} root
 */
function computeStadiumWalkEnvelope(root) {
  if (!root) return null;

  root.updateMatrixWorld(true);
  /** @type {{ spanX: number, box: THREE.Box3 }[]} */
  const inclineCandidates = [];

  root.traverse((child) => {
    if (!child.isMesh) return;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) return;
    box.getSize(_boxSize);
    if (
      box.max.y > SPACETIME_STADIUM_LIP_FOOT_Y_MIN &&
      box.max.y < 10.5 &&
      _boxSize.y > 2.5 &&
      _boxSize.x < 42
    ) {
      inclineCandidates.push({ spanX: _boxSize.x, box: box.clone() });
    }
  });

  if (inclineCandidates.length === 0) {
    return { inclineBox: null };
  }

  inclineCandidates.sort((a, b) => a.spanX - b.spanX);
  return { inclineBox: inclineCandidates[0].box };
}

/**
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} footY
 */
export function isSpacetimeBeyondStadiumInclineLip(worldX, worldZ, footY) {
  const inclineBox = stadiumWalkEnvelope?.inclineBox;
  if (!inclineBox || footY < SPACETIME_STADIUM_LIP_FOOT_Y_MIN) {
    return false;
  }
  if (worldZ < inclineBox.min.z - 1.5 || worldZ > inclineBox.max.z + 1.5) {
    return false;
  }
  const lipX = inclineBox.max.x - SPACETIME_BODY_RADIUS_M * 0.75;
  return worldX > lipX;
}

/**
 * Forward walk support — blocks mesh gaps with no floor (stadium shell wedge void).
 * @param {THREE.Vector3} worldHead
 * @param {THREE.Vector3} moveDelta
 * @param {THREE.Vector3} moveDir
 * @param {number} referenceFootY
 * @param {number} headY
 */
export function hasSpacetimeForwardWalkFloor(
  worldHead,
  moveDelta,
  moveDir,
  referenceFootY,
  headY,
) {
  if (!walkRoot || moveDelta.lengthSq() < 1e-10) return true;

  const moveLen = moveDelta.length();
  _lateral.set(-moveDir.z, 0, moveDir.x);
  if (_lateral.lengthSq() < 1e-8) {
    _lateral.set(1, 0, 0);
  } else {
    _lateral.normalize();
  }

  const fractions = [0.35, 0.7, 1];
  const lateralOffsets = [
    0,
    SPACETIME_FOOT_PROBE_RADIUS_M * 0.55,
    -SPACETIME_FOOT_PROBE_RADIUS_M * 0.55,
  ];

  for (const frac of fractions) {
    const px = worldHead.x + moveDir.x * moveLen * frac;
    const pz = worldHead.z + moveDir.z * moveLen * frac;
    let anySample = false;

    for (const lat of lateralOffsets) {
      const sx = px + _lateral.x * lat;
      const sz = pz + _lateral.z * lat;
      if (!isSpacetimeInsideSceneWalkBounds(sx, sz)) {
        return false;
      }
      const sample = querySpacetimeFootingWalkSurface(sx, sz, referenceFootY, headY);
      if (!sample) {
        return false;
      }
      anySample = true;
      if (sample.y < referenceFootY - SPACETIME_EDGE_MAX_DROP_M) {
        return false;
      }
      if (sample.y > referenceFootY + SPACETIME_MAX_STEP_UP_M * 1.35) {
        return false;
      }
    }

    if (!anySample) {
      return false;
    }
  }
  return true;
}

/**
 * @param {THREE.Vector3} worldHead
 * @param {number} destX
 * @param {number} destZ
 * @param {number} referenceFootY
 * @returns {boolean}
 */
export function isSpacetimeDestSupported(worldHead, destX, destZ, referenceFootY) {
  return isSpacetimeFootingStable(destX, destZ, worldHead.y, referenceFootY, {
    referenceFootY,
    minProbes: SPACETIME_FOOTING_DEST_MIN_PROBES,
  });
}

/**
 * Foot-ring probe — walk deck closest to reference foot Y (not highest roof/slab).
 * @param {THREE.Intersection[]} hits
 * @param {number} referenceFootY
 * @param {number} headY
 * @returns {{ y: number, normal: THREE.Vector3 }|null}
 */
function pickSpacetimeFootingWalkSurfaceHit(hits, referenceFootY, headY) {
  if (!hits?.length) return null;

  /** @type {{ y: number, normal: THREE.Vector3 }[]} */
  const walkable = [];

  for (const hit of hits) {
    const normal = getWorldHitNormal(hit);
    if (!normal) continue;

    if (normal.y < 0) normal.negate();
    if (normal.angleTo(_up) > SPACETIME_MAX_WALK_SLOPE_RAD) continue;

    const y = hit.point.y;
    if (y > headY + SPACETIME_MAX_HIT_ABOVE_HEAD_M) continue;
    if (y > referenceFootY + SPACETIME_MAX_STEP_UP_M * 1.5) continue;
    if (y < referenceFootY - SPACETIME_MAX_STEP_DOWN_M) continue;

    walkable.push({ y, normal: normal.clone() });
  }

  if (walkable.length === 0) return null;

  let best = walkable[0];
  let bestDist = Math.abs(best.y - referenceFootY);
  for (let i = 1; i < walkable.length; i += 1) {
    const dist = Math.abs(walkable[i].y - referenceFootY);
    if (dist < bestDist) {
      best = walkable[i];
      bestDist = dist;
    }
  }
  return best;
}

/**
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} referenceFootY
 * @param {number} headY
 * @returns {{ y: number, normal: THREE.Vector3, grounded: boolean }|null}
 */
function querySpacetimeFootingWalkSurface(worldX, worldZ, referenceFootY, headY) {
  if (!walkRoot) return null;
  walkRoot.updateMatrixWorld(true);
  _rayOrigin.set(worldX, headY + 4, worldZ);
  _raycaster.firstHitOnly = false;
  _raycaster.far = Infinity;
  _raycaster.set(_rayOrigin, _down);

  const hits = _raycaster.intersectObject(walkRoot, true);
  const picked = pickSpacetimeFootingWalkSurfaceHit(hits, referenceFootY, headY);
  if (picked) {
    return { y: picked.y, normal: picked.normal, grounded: true };
  }
  return null;
}

/**
 * Stable footing — all foot-ring probes agree and no low ceiling wedge trap.
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} headY
 * @param {number} referenceFootY
 * @param {{ minProbes?: number, referenceFootY?: number, skipNearestWedgeCheck?: boolean }} [opts]
 */
export function isSpacetimeFootingStable(
  worldX,
  worldZ,
  headY,
  referenceFootY,
  opts = {},
) {
  if (!walkRoot) return false;

  const minProbes = opts.minProbes ?? SPACETIME_FOOTING_MIN_PROBES;
  const footRef = opts.referenceFootY ?? referenceFootY;
  const offsets = [
    [0, 0],
    [SPACETIME_FOOT_PROBE_RADIUS_M, 0],
    [-SPACETIME_FOOT_PROBE_RADIUS_M, 0],
    [0, SPACETIME_FOOT_PROBE_RADIUS_M],
    [0, -SPACETIME_FOOT_PROBE_RADIUS_M],
  ];

  /** @type {number[]} */
  const ys = [];
  /** @type {number[]} */
  const nearestYs = [];
  /** @type {THREE.Vector3[]} */
  const normals = [];
  let supported = 0;

  for (const [ox, oz] of offsets) {
    const nearest = querySpacetimeFootingWalkSurface(
      worldX + ox,
      worldZ + oz,
      footRef,
      headY,
    );
    const support = querySpacetimeWalkSurface(
      worldX + ox,
      worldZ + oz,
      headY + 4,
      footRef,
      { airborne: false, headY },
    );
    if (!support) continue;
    if (wasGrounded && support.y < footRef - SPACETIME_EDGE_MAX_DROP_M) continue;
    ys.push(support.y);
    if (nearest) nearestYs.push(nearest.y);
    if (support.normal) normals.push(support.normal);
    supported += 1;
  }

  if (supported < minProbes || ys.length < minProbes) {
    return false;
  }

  const maxY = Math.max(...ys);
  const topDeck = ys.filter((y) => maxY - y <= SPACETIME_FOOTING_MAX_SPREAD_M);
  if (topDeck.length < minProbes) {
    return false;
  }

  const minTop = Math.min(...topDeck);
  const maxTop = Math.max(...topDeck);
  if (maxTop - minTop > SPACETIME_FOOTING_MAX_SPREAD_M) {
    return false;
  }

  const fullSpread = Math.max(...ys) - Math.min(...ys);
  const minFootY =
    nearestYs.length > 0 ? Math.min(...nearestYs) : Math.min(...ys);
  const centerFootY = maxTop;

  if (!opts.skipNearestWedgeCheck && nearestYs.length >= minProbes) {
    const nearestSpread = Math.max(...nearestYs) - Math.min(...nearestYs);
    const maxSupportY = Math.max(...ys);
    const minNearestY = Math.min(...nearestYs);
    const gapBelowShell = maxSupportY - minNearestY > SPACETIME_WALL_STEP_UP_BYPASS_M;
    const centerNearest = querySpacetimeFootingWalkSurface(
      worldX,
      worldZ,
      footRef,
      headY,
    );
    const centerInGap =
      centerNearest != null &&
      centerNearest.y <= footRef + SPACETIME_WALL_STEP_UP_BYPASS_M;
    if (
      nearestSpread > SPACETIME_FOOTING_MAX_SPREAD_M &&
      gapBelowShell &&
      centerInGap
    ) {
      return false;
    }
  }

  let steepProbeCount = 0;
  for (const normal of normals) {
    const n = normal.clone();
    if (n.y < 0) n.negate();
    if (n.y < 0.72) steepProbeCount += 1;
  }
  if (steepProbeCount >= 2) {
    return false;
  }

  const overheadBlocked =
    hasSpacetimeOverheadBlock(worldX, worldZ, centerFootY, headY) ||
    hasSpacetimeOverheadBlock(worldX, worldZ, minFootY, headY);

  if (overheadBlocked) {
    return false;
  }

  return true;
}

/**
 * Low ceiling or shell slab directly above foot position (capsule wedge trap).
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} footY
 * @param {number} headY
 */
export function hasSpacetimeOverheadBlock(worldX, worldZ, footY, headY) {
  if (!walkRoot) return false;

  walkRoot.updateMatrixWorld(true);
  _rayOrigin.set(worldX, footY + 0.08, worldZ);
  _raycaster.firstHitOnly = false;
  _raycaster.far = Math.min(SPACETIME_OVERHEAD_CLEARANCE_M, Math.max(0.5, headY - footY + 0.25));
  _raycaster.set(_rayOrigin, _overheadDir);

  const hits = _raycaster.intersectObject(walkRoot, true);
  for (const hit of hits) {
    if (hit.distance < 0.12) continue;
    if (hit.point.y < footY + 0.12) continue;
    const horizDist = Math.hypot(hit.point.x - worldX, hit.point.z - worldZ);
    if (horizDist > SPACETIME_BODY_RADIUS_M * 0.85) continue;
    const normal = getWorldHitNormal(hit);
    if (!normal) continue;
    if (normal.y < 0) normal.negate();
    if (normal.angleTo(_up) <= SPACETIME_MAX_WALK_SLOPE_RAD) continue;
    if (isSpacetimeBlockingWall(normal)) return true;
    if (normal.y > 0.55 && hit.distance < SPACETIME_OVERHEAD_CLEARANCE_M) {
      return true;
    }
  }
  return false;
}

/** @deprecated use isSpacetimeDestSupported */
export function canStepOntoSpacetimeDest(worldHead, destX, destZ, referenceFootY) {
  return isSpacetimeDestSupported(worldHead, destX, destZ, referenceFootY);
}

/**
 * Remove the into-wall component; keep slide / walk-away motion when flush on geometry.
 * @param {THREE.Vector3} moveDelta
 * @param {THREE.Vector3} wallNormal
 * @param {number} hitDistance
 * @returns {THREE.Vector3}
 */
export function projectSpacetimeMoveOffWall(moveDelta, wallNormal, hitDistance) {
  _wallHorizNormal.set(wallNormal.x, 0, wallNormal.z);
  if (_wallHorizNormal.lengthSq() < 1e-8) {
    return moveDelta.clone();
  }
  _wallHorizNormal.normalize();

  const moveLen = moveDelta.length();
  if (moveLen < 1e-8) return moveDelta.clone();

  _horizDir.copy(moveDelta).multiplyScalar(1 / moveLen);
  const intoWall = _horizDir.dot(_wallHorizNormal);
  if (intoWall >= 0) {
    return moveDelta.clone();
  }

  const allowedInto = Math.max(0, hitDistance - SPACETIME_BODY_RADIUS_M);
  const requestedInto = -intoWall * moveLen;
  const trim = Math.max(0, requestedInto - allowedInto);
  if (trim < 1e-8) {
    return moveDelta.clone();
  }

  _slideMove.copy(moveDelta).addScaledVector(_horizDir, -trim);
  return _slideMove.clone();
}

/**
 * @param {THREE.Vector3} moveDelta
 * @param {THREE.Vector3} wallNormal
 * @returns {THREE.Vector3|null}
 */
export function slideSpacetimeMoveAlongWall(moveDelta, wallNormal) {
  _wallHorizNormal.set(wallNormal.x, 0, wallNormal.z);
  if (_wallHorizNormal.lengthSq() < 1e-8) return moveDelta.clone();
  _wallHorizNormal.normalize();

  const moveLen = moveDelta.length();
  if (moveLen < 1e-8) return moveDelta.clone();
  _horizDir.copy(moveDelta).multiplyScalar(1 / moveLen);
  const intoWall = _horizDir.dot(_wallHorizNormal);
  if (intoWall >= 0) return moveDelta.clone();

  _slideMove.copy(moveDelta).addScaledVector(_wallHorizNormal, -intoWall * moveLen);
  if (_slideMove.lengthSq() < 1e-10) return moveDelta.clone();
  return _slideMove.clone();
}

/**
 * @param {THREE.Intersection} hit
 * @returns {THREE.Vector3|null}
 */
function getWorldHitNormal(hit) {
  if (hit.normal) {
    _worldNormal.copy(hit.normal);
    return _worldNormal;
  }
  if (hit.face?.normal) {
    _worldNormal.copy(hit.face.normal);
    hit.object?.updateMatrixWorld?.(true);
    if (hit.object?.matrixWorld) {
      _worldNormal.transformDirection(hit.object.matrixWorld);
    }
    return _worldNormal;
  }
  return null;
}

/**
 * Pick highest walkable floor under the avatar at this XZ — not closest to last foot Y.
 * referenceFootY only gates step-up/down; prevents sticky wrong deck after capsule ↔ scene.
 * @param {{ y: number, normal: THREE.Vector3 }[]} candidates
 * @param {number} referenceFootY
 * @param {number} headY
 * @param {{ airborne?: boolean }} [opts]
 * @returns {{ y: number, normal: THREE.Vector3 }|null}
 */
function pickHighestWalkableUnderHead(candidates, referenceFootY, headY, opts = {}) {
  if (!candidates?.length) return null;

  const airborne = opts.airborne === true;
  const maxStepUp = airborne ? SPACETIME_MAX_STEP_UP_M * 2 : SPACETIME_MAX_STEP_UP_M;
  const maxStepDown = SPACETIME_MAX_STEP_DOWN_M;

  let best = null;
  for (const hit of candidates) {
    if (hit.y > headY + SPACETIME_MAX_HIT_ABOVE_HEAD_M) continue;
    if (hit.y > referenceFootY + maxStepUp) continue;
    if (hit.y < referenceFootY - maxStepDown) continue;
    if (!best || hit.y > best.y) {
      best = hit;
    }
  }
  return best;
}

/**
 * Pick a walkable floor hit — skips roof/shell/steep faces (capsule entrance fix).
 * @param {THREE.Intersection[]} hits
 * @param {number} referenceFootY
 * @param {number} headY
 * @param {{ airborne?: boolean }} [opts]
 * @returns {{ y: number, normal: THREE.Vector3 }|null}
 */
export function pickSpacetimeWalkSurfaceHit(hits, referenceFootY, headY, opts = {}) {
  if (!hits?.length) return null;

  /** @type {{ y: number, normal: THREE.Vector3 }[]} */
  const walkable = [];

  for (const hit of hits) {
    const normal = getWorldHitNormal(hit);
    if (!normal) continue;

    if (normal.y < 0) normal.negate();
    if (normal.angleTo(_up) > SPACETIME_MAX_WALK_SLOPE_RAD) continue;

    walkable.push({ y: hit.point.y, normal: normal.clone() });
  }

  if (walkable.length === 0) return null;

  return pickHighestWalkableUnderHead(walkable, referenceFootY, headY, opts);
}

/** When stacked walkable hits are this close vertically, drop the upper (roof) slab. */
export const SPACETIME_WALKER_CEILING_PAIR_M = 1.25;

/**
 * Walker / avatar foot snap — rejects capsule roof when a walkable floor exists
 * slightly below; otherwise closest walkable hit to reference foot Y.
 * @param {THREE.Intersection[]} hits
 * @param {number} referenceFootY
 * @param {number} headY
 * @returns {{ y: number, normal: THREE.Vector3 }|null}
 */
export function pickSpacetimeWalkSurfaceHitForWalker(hits, referenceFootY, headY, opts = {}) {
  if (!hits?.length) return null;

  /** @type {{ y: number, normal: THREE.Vector3 }[]} */
  const walkable = [];

  for (const hit of hits) {
    const normal = getWorldHitNormal(hit);
    if (!normal) continue;

    if (normal.y < 0) normal.negate();
    if (normal.angleTo(_up) > SPACETIME_MAX_WALK_SLOPE_RAD) continue;

    const y = hit.point.y;
    if (y > headY + SPACETIME_MAX_HIT_ABOVE_HEAD_M) continue;

    walkable.push({ y, normal: normal.clone() });
  }

  if (walkable.length === 0) return null;

  walkable.sort((a, b) => a.y - b.y);

  let candidates = walkable;
  if (walkable.length >= 2) {
    const highest = walkable[walkable.length - 1];
    const second = walkable[walkable.length - 2];
    const pairGap = highest.y - second.y;
    // Drop upper slab only when it reads as ceiling shell — not a second walk deck (capsule vs scene).
    const looksLikeCeilingPair =
      pairGap <= SPACETIME_WALKER_CEILING_PAIR_M &&
      (highest.y > headY - 0.6 ||
        highest.y > referenceFootY + SPACETIME_MAX_STEP_UP_M);
    if (looksLikeCeilingPair) {
      candidates = walkable.slice(0, -1);
    }
  }

  return pickHighestWalkableUnderHead(candidates, referenceFootY, headY, opts);
}

/**
 * @deprecated Use pickSpacetimeWalkSurfaceHitForWalker
 */
export function pickSpacetimeWalkSurfaceHitHighest(hits, headY) {
  return pickSpacetimeWalkSurfaceHitForWalker(
    hits,
    headY - SPACETIME_XR_EYE_TO_FLOOR,
    headY,
  );
}

/**
 * Avatar / walker foot snap at XZ — capsule floor, not roof or scene root.
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} referenceFootY
 * @param {number} headY
 * @param {number} [rayStartY]
 * @returns {{ y: number, normal: THREE.Vector3, grounded: boolean }|null}
 */
export function querySpacetimeWalkSurfaceForAvatar(
  worldX,
  worldZ,
  referenceFootY,
  headY,
  rayStartY = null,
) {
  if (!walkRoot) return null;
  walkRoot.updateMatrixWorld(true);
  const startY =
    rayStartY != null && Number.isFinite(rayStartY) ? rayStartY : headY + 8;
  _rayOrigin.set(worldX, startY, worldZ);
  _raycaster.firstHitOnly = false;
  _raycaster.far = Infinity;
  _raycaster.set(_rayOrigin, _down);

  const hits = _raycaster.intersectObject(walkRoot, true);
  const picked = pickSpacetimeWalkSurfaceHitForWalker(hits, referenceFootY, headY);
  if (picked) {
    return { y: picked.y, normal: picked.normal, grounded: true };
  }
  return null;
}

/**
 * First walkable surface hit along a ray (teleport reticle on stones / capsule floor).
 * @param {THREE.Ray} ray
 * @param {number} maxDistance
 * @param {number} headY
 * @returns {{ point: THREE.Vector3, y: number, normal: THREE.Vector3, distance: number }|null}
 */
export function raycastSpacetimeWalkSurfaceAlongRay(ray, maxDistance, headY) {
  if (!walkRoot || !ray) return null;
  walkRoot.updateMatrixWorld(true);
  _raycaster.firstHitOnly = false;
  _raycaster.far = maxDistance;
  _raycaster.set(ray.origin, ray.direction.clone().normalize());

  const hits = _raycaster.intersectObject(walkRoot, true);
  if (!hits?.length) return null;

  let best = null;
  for (const hit of hits) {
    const normal = getWorldHitNormal(hit);
    if (!normal) continue;

    if (normal.y < 0) normal.negate();
    if (normal.angleTo(_up) > SPACETIME_MAX_WALK_SLOPE_RAD) continue;

    const y = hit.point.y;
    if (y > headY + SPACETIME_MAX_HIT_ABOVE_HEAD_M) continue;

    if (!best || hit.distance < best.distance) {
      best = {
        point: hit.point.clone(),
        y,
        normal: normal.clone(),
        distance: hit.distance,
      };
    }
  }

  return best;
}

/**
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} [rayStartY]
 * @param {number|null} [referenceFootY]
 * @param {{ airborne?: boolean }} [opts]
 * @returns {{ y: number, normal: THREE.Vector3, grounded: boolean }|null}
 */
export function querySpacetimeWalkSurface(
  worldX,
  worldZ,
  rayStartY = 256,
  referenceFootY = null,
  opts = {},
) {
  if (!walkRoot) return null;
  walkRoot.updateMatrixWorld(true);
  _rayOrigin.set(worldX, rayStartY, worldZ);
  _raycaster.firstHitOnly = false;
  _raycaster.far = Infinity;
  _raycaster.set(_rayOrigin, _down);

  const hits = _raycaster.intersectObject(walkRoot, true);
  const footRef =
    referenceFootY != null && Number.isFinite(referenceFootY)
      ? referenceFootY
      : rayStartY - SPACETIME_XR_EYE_TO_FLOOR;
  const headY =
    opts.headY != null && Number.isFinite(opts.headY)
      ? opts.headY
      : footRef + SPACETIME_XR_EYE_TO_FLOOR;

  const picked = pickSpacetimeWalkSurfaceHit(hits, footRef, headY, opts);
  if (picked) {
    return { y: picked.y, normal: picked.normal, grounded: true };
  }
  return null;
}

/**
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} [rayStartY]
 * @param {number|null} [referenceFootY]
 * @returns {number|null}
 */
export function raycastSpacetimeWalkSurfaceY(
  worldX,
  worldZ,
  rayStartY = 256,
  referenceFootY = null,
) {
  const airborne = !wasGrounded;
  const footRef =
    referenceFootY != null && Number.isFinite(referenceFootY)
      ? referenceFootY
      : lastFootY ?? rayStartY - SPACETIME_XR_EYE_TO_FLOOR;
  const query = querySpacetimeWalkSurface(worldX, worldZ, rayStartY, footRef, {
    airborne,
    headY: footRef + SPACETIME_XR_EYE_TO_FLOOR,
  });
  if (query) {
    lastWalkSurfaceY = query.y;
    return query.y;
  }
  return lastWalkSurfaceY;
}

/**
 * Sample floor under feet + foot ring (slopes / stadium tiers).
 * @param {number} worldX
 * @param {number} worldZ
 * @param {number} headY
 * @param {number} referenceFootY
 * @param {THREE.Vector3|null} [moveHintXZ]
 * @returns {{ y: number, normal: THREE.Vector3, grounded: boolean }|null}
 */
export function sampleSpacetimeWalkSurface(
  worldX,
  worldZ,
  headY,
  referenceFootY,
  moveHintXZ = null,
) {
  const airborne = !wasGrounded;
  const rayStartY = headY + 4;
  let best = querySpacetimeWalkSurface(
    worldX,
    worldZ,
    rayStartY,
    referenceFootY,
    { airborne, headY },
  );

  const offsets = [
    [SPACETIME_FOOT_PROBE_RADIUS_M, 0],
    [-SPACETIME_FOOT_PROBE_RADIUS_M, 0],
    [0, SPACETIME_FOOT_PROBE_RADIUS_M],
    [0, -SPACETIME_FOOT_PROBE_RADIUS_M],
  ];

  if (moveHintXZ && moveHintXZ.lengthSq() > 1e-8) {
    _horizDir.copy(moveHintXZ).normalize();
    offsets.push(
      [_horizDir.x * SPACETIME_FOOT_PROBE_RADIUS_M * 1.4, _horizDir.z * SPACETIME_FOOT_PROBE_RADIUS_M * 1.4],
      [_horizDir.x * SPACETIME_FOOT_PROBE_RADIUS_M * 2.2, _horizDir.z * SPACETIME_FOOT_PROBE_RADIUS_M * 2.2],
    );
  }

  for (const [ox, oz] of offsets) {
    const probe = querySpacetimeWalkSurface(
      worldX + ox,
      worldZ + oz,
      rayStartY,
      referenceFootY,
      { airborne, headY },
    );
    if (!probe) continue;
    if (!best || probe.y > best.y) {
      best = probe;
    }
  }

  return best;
}

/**
 * True when a blocking wall may be crossed because the destination is a supported step-up
 * (small ramp risers), not a same-level deck behind a stadium shell.
 * @param {THREE.Vector3} worldHead
 * @param {number} destX
 * @param {number} destZ
 * @param {number} referenceFootY
 * @returns {boolean}
 */
export function allowsSpacetimeWallStepUpBypass(
  worldHead,
  destX,
  destZ,
  referenceFootY,
) {
  if (!isSpacetimeFootingStable(destX, destZ, worldHead.y, referenceFootY, {
    referenceFootY,
    minProbes: SPACETIME_FOOTING_DEST_MIN_PROBES,
    skipNearestWedgeCheck: true,
  })) {
    return false;
  }
  const footQueryOpts = { airborne: false, headY: worldHead.y };
  const sourceFoot = querySpacetimeWalkSurface(
    worldHead.x,
    worldHead.z,
    worldHead.y + 4,
    referenceFootY,
    footQueryOpts,
  );
  const destFoot = querySpacetimeWalkSurface(
    destX,
    destZ,
    worldHead.y + 4,
    referenceFootY,
    footQueryOpts,
  );
  if (!sourceFoot || !destFoot) return false;
  return destFoot.y > sourceFoot.y + SPACETIME_WALL_STEP_UP_BYPASS_M;
}

/**
 * Doorway / threshold pass — same deck or modest step down with stable footing.
 * @param {THREE.Vector3} worldHead
 * @param {number} destX
 * @param {number} destZ
 * @param {number} referenceFootY
 */
export function allowsSpacetimeDoorwayPass(
  worldHead,
  destX,
  destZ,
  referenceFootY,
) {
  if (
    hasSpacetimeOverheadBlock(destX, destZ, referenceFootY, worldHead.y)
  ) {
    return false;
  }

  const footQueryOpts = { airborne: false, headY: worldHead.y };
  const sourceFoot = querySpacetimeWalkSurface(
    worldHead.x,
    worldHead.z,
    worldHead.y + 4,
    referenceFootY,
    footQueryOpts,
  );
  const destFoot = querySpacetimeWalkSurface(
    destX,
    destZ,
    worldHead.y + 4,
    referenceFootY,
    footQueryOpts,
  );
  if (!sourceFoot || !destFoot) return false;

  const drop = sourceFoot.y - destFoot.y;
  if (drop < -SPACETIME_MAX_STEP_UP_M || drop > SPACETIME_EDGE_MAX_DROP_M + 0.85) {
    return false;
  }

  // Relaxed footing only for modest step-downs through doorways/thresholds.
  const stepDownThreshold = drop > 0.03;
  return isSpacetimeFootingStable(destX, destZ, worldHead.y, referenceFootY, {
    referenceFootY,
    minProbes: stepDownThreshold ? 1 : 2,
    skipNearestWedgeCheck: stepDownThreshold,
  });
}

/**
 * @param {THREE.Vector3} worldHead
 * @param {THREE.Vector3} moveDelta
 * @param {number} referenceFootY
 * @param {{ skipLip?: boolean, minProbes?: number }} [opts]
 */
export function isSpacetimeMoveDestinationAllowed(
  worldHead,
  moveDelta,
  referenceFootY,
  opts = {},
) {
  if (!walkRoot || moveDelta.lengthSq() < 1e-10) return true;

  const moveDir = moveDelta.clone().normalize();
  _probe.copy(worldHead).add(moveDelta);

  if (!isSpacetimeInsideSceneWalkBounds(_probe.x, _probe.z)) {
    return false;
  }

  if (
    allowsSpacetimeDoorwayPass(
      worldHead,
      _probe.x,
      _probe.z,
      referenceFootY,
    )
  ) {
    return true;
  }

  if (
    !hasSpacetimeForwardWalkFloor(
      worldHead,
      moveDelta,
      moveDir,
      referenceFootY,
      worldHead.y,
    )
  ) {
    return false;
  }

  if (
    !opts.skipLip &&
    isSpacetimeBeyondStadiumInclineLip(_probe.x, _probe.z, referenceFootY)
  ) {
    return false;
  }

  if (
    hasSpacetimeOverheadBlock(
      _probe.x,
      _probe.z,
      referenceFootY,
      worldHead.y,
    )
  ) {
    return false;
  }

  return isSpacetimeFootingStable(
    _probe.x,
    _probe.z,
    worldHead.y,
    referenceFootY,
    {
      referenceFootY,
      minProbes: opts.minProbes ?? SPACETIME_FOOTING_DEST_MIN_PROBES,
      skipNearestWedgeCheck: true,
    },
  );
}

/**
 * Teleport landing must be stable footing — not past stadium lip or wedged in geometry.
 * @param {THREE.Vector3} worldHead
 * @param {number} destX
 * @param {number} destZ
 * @param {number} referenceFootY
 */
export function isSpacetimeTeleportDestinationValid(
  worldHead,
  destX,
  destZ,
  referenceFootY,
) {
  if (!walkRoot) return true;

  if (!isSpacetimeInsideSceneWalkBounds(destX, destZ)) {
    return false;
  }

  if (isSpacetimeBeyondStadiumInclineLip(destX, destZ, referenceFootY)) {
    return false;
  }

  if (hasSpacetimeOverheadBlock(destX, destZ, referenceFootY, worldHead.y)) {
    return false;
  }

  if (
    !isSpacetimeFootingStable(destX, destZ, worldHead.y, referenceFootY, {
      referenceFootY,
      minProbes: SPACETIME_FOOTING_DEST_MIN_PROBES,
    })
  ) {
    return false;
  }

  const dx = destX - worldHead.x;
  const dz = destZ - worldHead.z;
  if (dx * dx + dz * dz < 1e-8) {
    return true;
  }

  const moveDelta = _move.set(dx, 0, dz);
  const moveDir = _horizDir.copy(moveDelta).normalize();
  return hasSpacetimeForwardWalkFloor(
    worldHead,
    moveDelta,
    moveDir,
    referenceFootY,
    worldHead.y,
  );
}

/**
 * Closest blocking vertical face along a horizontal move (foot, torso, chest probes).
 * @param {THREE.Vector3} worldHead
 * @param {THREE.Vector3} horizDir
 * @param {number} moveLen
 * @param {number} referenceFootY
 * @returns {import('three').Intersection|null}
 */
export function findClosestSpacetimeBlockingWallHit(
  worldHead,
  horizDir,
  moveLen,
  referenceFootY,
) {
  const probeFootY = worldHead.y - SPACETIME_XR_EYE_TO_FLOOR;
  const probeYs = [
    probeFootY + SPACETIME_FOOT_COLLISION_Y,
    probeFootY + 0.75,
    worldHead.y - 0.25,
  ];

  _lateral.set(-horizDir.z, 0, horizDir.x);
  if (_lateral.lengthSq() < 1e-8) {
    _lateral.set(1, 0, 0);
  } else {
    _lateral.normalize();
  }

  const lateralOffsets = [
    0,
    SPACETIME_BODY_RADIUS_M * 0.85,
    -SPACETIME_BODY_RADIUS_M * 0.85,
  ];

  let closestHit = null;
  let closestDist = Infinity;

  walkRoot.updateMatrixWorld(true);
  _wallRaycaster.firstHitOnly = false;
  _wallRaycaster.far = moveLen + SPACETIME_BODY_RADIUS_M;

  for (const probeY of probeYs) {
    for (const lat of lateralOffsets) {
      _rayOrigin.set(
        worldHead.x + _lateral.x * lat,
        probeY,
        worldHead.z + _lateral.z * lat,
      );
      _wallRaycaster.set(_rayOrigin, horizDir);
      const wallHits = _wallRaycaster.intersectObject(walkRoot, true);
      for (const hit of wallHits) {
        if (!isSpacetimeSolidBlockHit(hit, probeFootY, referenceFootY)) continue;
        if (hit.distance < closestDist) {
          closestDist = hit.distance;
          closestHit = hit;
        }
      }
    }
  }

  _wallRaycaster.far = Infinity;
  return closestHit;
}

/**
 * Sweep substeps along a move — catches thin shell gaps between frames.
 * @param {THREE.Vector3} worldHead
 * @param {THREE.Vector3} moveDelta
 * @param {number} referenceFootY
 * @returns {import('three').Intersection|null}
 */
export function findSpacetimeBlockingWallAlongMove(
  worldHead,
  moveDelta,
  referenceFootY,
) {
  const moveLen = moveDelta.length();
  if (moveLen < 1e-8) return null;

  const steps = Math.max(1, Math.ceil(moveLen / SPACETIME_WALL_SWEEP_STEP_M));
  _probe.copy(worldHead);
  const step = moveDelta.clone().multiplyScalar(1 / steps);
  const stepDir = step.clone().normalize();
  const stepLen = step.length();

  let closestHit = null;
  let closestDist = Infinity;

  for (let i = 0; i < steps; i += 1) {
    const hit = findClosestSpacetimeBlockingWallHit(
      _probe,
      stepDir,
      stepLen + SPACETIME_BODY_RADIUS_M,
      referenceFootY,
    );
    if (hit) {
      const totalDist = i * stepLen + hit.distance;
      if (totalDist < closestDist) {
        closestDist = totalDist;
        closestHit = hit;
      }
    }
    _probe.add(step);
  }

  return closestHit;
}

/**
 * Core move clamp — single direction vector (no axis split).
 * @param {THREE.Vector3} worldHead
 * @param {THREE.Vector3} moveDeltaWorld
 * @param {number} fallbackFootY
 * @returns {THREE.Vector3}
 */
function clampSpacetimeMoveDeltaSingle(worldHead, moveDeltaWorld, fallbackFootY) {
  if (!walkRoot || moveDeltaWorld.lengthSq() < 1e-10) {
    return moveDeltaWorld.clone();
  }

  const referenceFootY = getSpacetimeReferenceFootY(fallbackFootY);
  let move = moveDeltaWorld.clone();
  const moveLen = move.length();
  const moveDir = move.clone().normalize();

  const wallHit = findSpacetimeBlockingWallAlongMove(
    worldHead,
    move,
    referenceFootY,
  ) ?? findClosestSpacetimeBlockingWallHit(
    worldHead,
    moveDir,
    moveLen,
    referenceFootY,
  );

  let stepUpOk = false;
  if (wallHit) {
    getWorldHitNormal(wallHit);
    if (_worldNormal.dot(moveDir) > 0) {
      _worldNormal.negate();
    }
    _probe.copy(worldHead).add(move);
    stepUpOk =
      wallHit.distance >= SPACETIME_BODY_RADIUS_M * 0.9 &&
      (allowsSpacetimeWallStepUpBypass(
        worldHead,
        _probe.x,
        _probe.z,
        referenceFootY,
      ) ||
        allowsSpacetimeDoorwayPass(
          worldHead,
          _probe.x,
          _probe.z,
          referenceFootY,
        ));
    if (!stepUpOk) {
      move = projectSpacetimeMoveOffWall(
        move,
        _worldNormal,
        wallHit.distance,
      );
      if (move.lengthSq() < 1e-8) {
        move = slideSpacetimeMoveAlongWall(moveDeltaWorld, _worldNormal);
      }
    }
  }

  if (move.lengthSq() < 1e-10) {
    return move;
  }

  if (
    isSpacetimeMoveDestinationAllowed(worldHead, move, referenceFootY, {
      skipLip: stepUpOk,
      minProbes: stepUpOk ? 1 : SPACETIME_FOOTING_DEST_MIN_PROBES,
    })
  ) {
    return clampSpacetimeMoveToSceneBounds(worldHead, move);
  }

  const slid = slideSpacetimeMoveAlongWall(move, _worldNormal);
  if (
    slid.lengthSq() > 1e-10 &&
    isSpacetimeMoveDestinationAllowed(worldHead, slid, referenceFootY, {
      minProbes: 1,
    })
  ) {
    return clampSpacetimeMoveToSceneBounds(worldHead, slid);
  }

  if (wallHit && !stepUpOk && move.lengthSq() < 1e-8) {
    _probe.copy(worldHead).add(moveDeltaWorld);
    if (
      isSpacetimeInsideSceneWalkBounds(_probe.x, _probe.z) &&
      querySpacetimeFootingWalkSurface(
        _probe.x,
        _probe.z,
        referenceFootY,
        worldHead.y,
      ) &&
      isSpacetimeFootingStable(_probe.x, _probe.z, worldHead.y, referenceFootY, {
        referenceFootY,
        minProbes: 2,
        skipNearestWedgeCheck: true,
      })
    ) {
      return clampSpacetimeMoveToSceneBounds(worldHead, moveDeltaWorld);
    }
  }

  return new THREE.Vector3(0, 0, 0);
}

/**
 * Trim moves into vertical shell geometry; block only true cliff exits.
 * @param {THREE.Vector3} worldHead
 * @param {THREE.Vector3} moveDeltaWorld
 * @param {number} fallbackFootY
 * @returns {THREE.Vector3}
 */
export function clampSpacetimeMoveDelta(worldHead, moveDeltaWorld, fallbackFootY) {
  if (!walkRoot || moveDeltaWorld.lengthSq() < 1e-10) {
    return moveDeltaWorld;
  }

  const referenceFootY = getSpacetimeReferenceFootY(fallbackFootY);
  const full = clampSpacetimeMoveDeltaSingle(
    worldHead,
    moveDeltaWorld,
    referenceFootY,
  );
  const dualAxis =
    Math.abs(moveDeltaWorld.x) > 1e-4 && Math.abs(moveDeltaWorld.z) > 1e-4;
  if (!dualAxis || full.lengthSq() >= moveDeltaWorld.lengthSq() * 0.25) {
    if (full.lengthSq() > 1e-10) {
      return clampSpacetimeMoveToSceneBounds(worldHead, full);
    }
    if (moveDeltaWorld.lengthSq() < 1e-6) {
      return full;
    }
  }

  const result = new THREE.Vector3();
  if (Math.abs(moveDeltaWorld.x) > 1e-6) {
    const ax = clampSpacetimeMoveDeltaSingle(
      worldHead,
      new THREE.Vector3(moveDeltaWorld.x, 0, 0),
      referenceFootY,
    );
    result.add(ax);
  }
  if (Math.abs(moveDeltaWorld.z) > 1e-6) {
    const headAfterX = worldHead.clone().add(result);
    const az = clampSpacetimeMoveDeltaSingle(
      headAfterX,
      new THREE.Vector3(0, 0, moveDeltaWorld.z),
      referenceFootY,
    );
    result.add(az);
  }

  if (result.lengthSq() > 1e-10) {
    return clampSpacetimeMoveToSceneBounds(worldHead, result);
  }

  console.info('[spacetime-xr] move blocked — dest footing unstable', {
    x: (worldHead.x + moveDeltaWorld.x).toFixed(2),
    z: (worldHead.z + moveDeltaWorld.z).toFixed(2),
  });
  return new THREE.Vector3(0, 0, 0);
}

/**
 * Align locomotion rig Y so the walk surface sits under the user's feet (local-floor).
 * @param {THREE.Group} locomotionRig
 * @param {THREE.Camera} camera
 * @param {number} [eyeToFloor]
 * @param {number} [deltaSeconds]
 * @param {THREE.Vector3|null} [moveHintXZ]
 * @returns {number|null}
 */
export function followSpacetimeWalkSurfaceY(
  locomotionRig,
  camera,
  eyeToFloor = SPACETIME_XR_EYE_TO_FLOOR,
  deltaSeconds = 0.016,
  moveHintXZ = null,
) {
  if (!locomotionRig || !camera || !walkRoot) return null;

  camera.getWorldPosition(_head);
  const targetFootY = _head.y - eyeToFloor;
  // Step limits from last grounded foot; pick uses highest surface at current XZ.
  const referenceFootY = lastFootY ?? targetFootY;

  const surface = sampleSpacetimeWalkSurface(
    _head.x,
    _head.z,
    _head.y,
    referenceFootY,
    moveHintXZ,
  );

  let surfaceY = surface?.y ?? null;
  let grounded =
    surface != null &&
    isSpacetimeFootingStable(_head.x, _head.z, _head.y, referenceFootY, {
      referenceFootY,
      minProbes: SPACETIME_FOOTING_DEST_MIN_PROBES,
    });

  if (grounded && surfaceY != null) {
    verticalVelocity = 0;
    lastWalkSurfaceY = surfaceY;
    lastFootY = surfaceY;
    wasGrounded = true;
  } else {
    wasGrounded = false;
    const dt = Math.max(0.001, Math.min(0.05, deltaSeconds));
    verticalVelocity = Math.max(
      verticalVelocity - SPACETIME_GRAVITY_MPS2 * dt,
      -SPACETIME_MAX_FALL_SPEED_MPS,
    );
    const fallDelta = verticalVelocity * dt;
    if (lastFootY != null) {
      lastFootY += fallDelta;
      surfaceY = lastFootY;
    } else if (lastWalkSurfaceY != null) {
      lastWalkSurfaceY += fallDelta;
      surfaceY = lastWalkSurfaceY;
      lastFootY = surfaceY;
    } else {
      return null;
    }

    const airProbe = querySpacetimeWalkSurface(
      _head.x,
      _head.z,
      _head.y + 4,
      lastFootY,
      { airborne: true, headY: _head.y },
    );
    if (airProbe && lastFootY <= airProbe.y + 0.05) {
      surfaceY = airProbe.y;
      lastFootY = airProbe.y;
      lastWalkSurfaceY = airProbe.y;
      verticalVelocity = 0;
      grounded = true;
      wasGrounded = true;
    }
  }

  if (surfaceY == null) return null;

  const deltaWorldY = targetFootY - surfaceY;
  if (Math.abs(deltaWorldY) < 0.0005) return surfaceY;

  if (locomotionRig.parent) {
    locomotionRig.parent.updateMatrixWorld(true);
    const inv = locomotionRig.parent.matrixWorld.clone().invert();
    const deltaLocal = new THREE.Vector3(0, deltaWorldY, 0).applyMatrix4(inv);
    locomotionRig.position.y += deltaLocal.y;
  } else {
    locomotionRig.position.y += deltaWorldY;
  }

  return surfaceY;
}

/** @deprecated use pickSpacetimeWalkSurfaceHit */
export function pickSpacetimeWalkSurfaceY(hits, targetFootY, headY) {
  const picked = pickSpacetimeWalkSurfaceHit(hits, targetFootY, headY, {
    airborne: !wasGrounded,
  });
  return picked?.y ?? null;
}
