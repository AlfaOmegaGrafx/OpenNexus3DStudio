import { describe, expect, it, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  resetSpacetimeGroundFollowState,
  setSpacetimeGroundFollowAirborne,
  setSpacetimeSceneWalkBounds,
} from '../library/spacetimeXrGroundFollow.js';
import {
  applySpacetimeXrCorridorRespawn,
  buildSpacetimeDefaultSpawnDesktopView,
  clearSpacetimeFallOffMapReenter,
  markSpacetimeFallOffMapPendingReenter,
  resetSpacetimeFallOffMapTracking,
  shouldForceSpacetimeDefaultSpawnOnXrEnter,
  tickSpacetimeFallOffMapDetection,
} from '../library/spacetimeXrFallRespawn.js';

const FABRIC_BOUNDS = {
  center: new THREE.Vector3(0, 1, 10),
  size: new THREE.Vector3(12, 4, 40),
  min: new THREE.Vector3(-6, 0, -10),
  max: new THREE.Vector3(6, 4, 30),
};

describe('spacetimeXrFallRespawn', () => {
  beforeEach(() => {
    resetSpacetimeFallOffMapTracking();
    clearSpacetimeFallOffMapReenter();
    setSpacetimeSceneWalkBounds(FABRIC_BOUNDS);
    resetSpacetimeGroundFollowState(0);
  });

  it('builds corridor desktop view matching default spawn', () => {
    const view = buildSpacetimeDefaultSpawnDesktopView(FABRIC_BOUNDS);
    expect(view).not.toBeNull();
    expect(view.position.z).toBeLessThan(0);
    expect(view.target.z).toBeGreaterThan(view.position.z);
  });

  it('detects void fall below deck and marks re-enter flag', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, -3, 0);
    setSpacetimeGroundFollowAirborne(-4);

    let triggered = false;
    for (let i = 0; i < 20; i += 1) {
      if (tickSpacetimeFallOffMapDetection(camera, FABRIC_BOUNDS, 0.05)) {
        triggered = true;
        break;
      }
    }

    expect(triggered).toBe(true);
    expect(shouldForceSpacetimeDefaultSpawnOnXrEnter()).toBe(true);
  });

  it('respawns rig and avatar at corridor spawn', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    rig.position.set(40, -20, 40);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(40, -18, 40);

    const view = applySpacetimeXrCorridorRespawn({
      locomotionRig: rig,
      camera,
      playerRoot,
      fabricBounds: FABRIC_BOUNDS,
    });

    expect(view).not.toBeNull();
    expect(rig.position.x).toBeCloseTo(0, 3);
    expect(rig.position.z).toBeCloseTo(0, 3);
    expect(playerRoot.position.z).toBeCloseTo(-0.154, 1);
    expect(shouldForceSpacetimeDefaultSpawnOnXrEnter()).toBe(false);
  });

  it('keeps re-enter flag when marked before exit', () => {
    markSpacetimeFallOffMapPendingReenter();
    expect(shouldForceSpacetimeDefaultSpawnOnXrEnter()).toBe(true);
  });
});
