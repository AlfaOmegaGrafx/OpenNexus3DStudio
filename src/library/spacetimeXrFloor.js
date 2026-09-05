/**
 * Space-Time XR floor anchor — lifts fabric content so lowest mesh sits on reference-space Y=0.
 * Mirrors OpenNexus computeXrFloorAlignmentY / vrSceneWrapper (Y only; locomotion rig handles XZ).
 */
import * as THREE from 'three';
import { computeFabricSceneBounds } from './spacetimeFabricScene.js';

/** Capsule walk surface in sneeze fabric (Scene Assembler parity). */
export const CAPSULE_FLOOR_OBJECT_NAMES = new Set([
  'Hello World!',
  'capsule.glb',
  'Capsule',
]);

/**
 * @param {THREE.Object3D} fabricRoot
 * @returns {THREE.Object3D|null}
 */
export function findCapsuleWalkRoot(fabricRoot) {
  if (!fabricRoot) return null;
  /** @type {THREE.Object3D|null} */
  let capsule = null;
  fabricRoot.traverse((child) => {
    if (capsule) return;
    if (CAPSULE_FLOOR_OBJECT_NAMES.has(child.name)) {
      capsule = child;
    }
  });
  return capsule;
}

/**
 * @param {THREE.Object3D} fabricRoot
 * @returns {{ floorAnchorY: number, boundsMinY: number, boundsMaxY: number, source: string }}
 */
export function computeSpacetimeFloorAnchorDiagnostics(fabricRoot) {
  if (!fabricRoot) {
    return { floorAnchorY: 0, boundsMinY: 0, boundsMaxY: 0, source: 'none' };
  }

  fabricRoot.updateMatrixWorld(true);

  const capsuleFloor = findCapsuleWalkRoot(fabricRoot);
  if (capsuleFloor) {
    const box = new THREE.Box3().setFromObject(capsuleFloor);
    if (!box.isEmpty()) {
      return {
        floorAnchorY: -box.min.y,
        boundsMinY: box.min.y,
        boundsMaxY: box.max.y,
        source: `capsule:${capsuleFloor.name}`,
      };
    }
  }

  const bounds = computeFabricSceneBounds(fabricRoot);
  if (bounds.box.isEmpty()) {
    return { floorAnchorY: 0, boundsMinY: 0, boundsMaxY: 0, source: 'empty' };
  }

  return {
    floorAnchorY: -bounds.min.y,
    boundsMinY: bounds.min.y,
    boundsMaxY: bounds.max.y,
    source: 'fabric-bounds',
  };
}

/**
 * Y offset so fabric floor / lowest mesh aligns with WebXR floor (bounded-floor / local-floor Y=0).
 * @param {THREE.Object3D} fabricRoot
 * @returns {number}
 */
export function computeSpacetimeFloorAnchorY(fabricRoot) {
  return computeSpacetimeFloorAnchorDiagnostics(fabricRoot).floorAnchorY;
}

/**
 * @param {THREE.Group} floorAnchor
 * @param {THREE.Object3D} fabricRoot
 */
/**
 * @param {THREE.Group} floorAnchor
 * @param {THREE.Object3D} fabricRoot
 * @param {{ locomotorWalk?: boolean }} [opts]
 */
export function applySpacetimeFloorAnchor(floorAnchor, fabricRoot, opts = {}) {
  if (opts.locomotorWalk) {
    resetSpacetimeFloorAnchor(floorAnchor);
    const diagnostics = {
      floorAnchorY: 0,
      boundsMinY: 0,
      boundsMaxY: 0,
      source: 'locomotor-walk',
    };
    console.info('[spacetime-xr] floor anchor', diagnostics);
    return diagnostics;
  }

  const diagnostics = computeSpacetimeFloorAnchorDiagnostics(fabricRoot);
  if (floorAnchor) {
    floorAnchor.position.set(0, diagnostics.floorAnchorY, 0);
    floorAnchor.updateMatrixWorld(true);
  }
  console.info('[spacetime-xr] floor anchor', diagnostics);
  return diagnostics;
}

/**
 * @param {THREE.Group} floorAnchor
 */
export function resetSpacetimeFloorAnchor(floorAnchor) {
  if (!floorAnchor) return;
  floorAnchor.position.set(0, 0, 0);
  floorAnchor.updateMatrixWorld(true);
}

/**
 * Prefer bounded-floor (Android XR boundary floor), then local-floor — never bounded:false.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {Promise<string|null>}
 */
export async function upgradeSpacetimeReferenceSpace(renderer) {
  const session = renderer?.xr?.getSession?.();
  if (!session) return null;

  for (const type of ['bounded-floor', 'local-floor']) {
    try {
      const space = await session.requestReferenceSpace(type);
      renderer.xr.setReferenceSpace(space);
      console.info('[spacetime-xr] reference space:', type);
      return type;
    } catch (err) {
      console.warn('[spacetime-xr] reference space unavailable:', type, err?.message || err);
    }
  }
  return null;
}
