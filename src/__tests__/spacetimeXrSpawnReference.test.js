import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { setSpacetimeSceneWalkBounds } from '../library/spacetimeXrGroundFollow.js';
import {
  buildSpacetimeDefaultSpawnView,
  isSpacetimePositionInFabricBounds,
  isSpacetimeViewInScene,
  resolveSpacetimeLandmarkMidpointXZ,
  resolveSpacetimeViewForScene,
  resolveSpacetimeXrEnterView,
  shouldUseSpacetimeLandmarkXrEnter,
} from '../library/spacetimeXrSpawnReference.js';

const FABRIC_BOUNDS = {
  center: new THREE.Vector3(0, 1, 10),
  size: new THREE.Vector3(12, 4, 40),
  min: new THREE.Vector3(-6, 0, -10),
  max: new THREE.Vector3(6, 4, 30),
};

describe('spacetimeXrSpawnReference', () => {
  it('builds corridor spawn between Eagle Knight and Auto Rig facing stadium (⊥ corridor)', () => {
    const spawn = buildSpacetimeDefaultSpawnView(FABRIC_BOUNDS);
    expect(spawn).not.toBeNull();
    const mid = resolveSpacetimeLandmarkMidpointXZ();
    expect(spawn.avatarFoot.x).toBeCloseTo(mid.x, 2);
    expect(spawn.avatarFoot.z).toBeCloseTo(mid.z, 2);
    // Center lies on Eagle↔AutoRig axis → face 90° right of corridor (stadium), not Auto Rig.
    expect(spawn.target.x).toBeLessThan(spawn.avatarFoot.x);
    expect(spawn.position.x).toBeGreaterThan(spawn.avatarFoot.x);
  });

  it('faces away from fabric AABB mass when the stadium mass is beside the corridor', () => {
    const sideBounds = {
      center: new THREE.Vector3(-40, 1, -0.15),
      size: new THREE.Vector3(80, 4, 40),
      min: new THREE.Vector3(-80, 0, -20),
      max: new THREE.Vector3(0, 4, 20),
    };
    const spawn = buildSpacetimeDefaultSpawnView(sideBounds);
    const mid = resolveSpacetimeLandmarkMidpointXZ();
    // Mass at −X → face +X (perp to Eagle↔AutoRig), camera behind on −X.
    expect(spawn.position.x).toBeLessThan(mid.x);
    expect(spawn.target.x).toBeGreaterThan(mid.x);
  });

  it('keeps desktop orbit view when entering XR from podium orbit', () => {
    setSpacetimeSceneWalkBounds(FABRIC_BOUNDS);
    const podiumView = {
      position: new THREE.Vector3(2, 2, 8),
      target: FABRIC_BOUNDS.center.clone(),
      quaternion: new THREE.Quaternion(),
      zoom: 1,
    };
    expect(shouldUseSpacetimeLandmarkXrEnter(podiumView, FABRIC_BOUNDS)).toBe(true);
    expect(isSpacetimeViewInScene(podiumView, FABRIC_BOUNDS)).toBe(true);
    const resolved = resolveSpacetimeViewForScene(podiumView, FABRIC_BOUNDS);
    expect(resolved.usedDefaultSpawn).toBe(false);
    expect(resolved.view.position.x).toBeCloseTo(podiumView.position.x, 3);
    expect(resolved.view.target.z).toBeCloseTo(podiumView.target.z, 3);
  });

  it('detects views outside fabric / walk bounds', () => {
    setSpacetimeSceneWalkBounds(FABRIC_BOUNDS);
    const inside = {
      position: new THREE.Vector3(0, 1.6, 0),
      target: new THREE.Vector3(0, 1, 10),
    };
    const outside = {
      position: new THREE.Vector3(50, 1.6, 50),
      target: new THREE.Vector3(0, 1, 10),
    };
    expect(isSpacetimeViewInScene(inside, FABRIC_BOUNDS)).toBe(true);
    expect(isSpacetimeViewInScene(outside, FABRIC_BOUNDS)).toBe(false);
  });

  it('falls back to default spawn when enter view is in dead zone', () => {
    setSpacetimeSceneWalkBounds(FABRIC_BOUNDS);
    const resolved = resolveSpacetimeViewForScene(
      {
        position: new THREE.Vector3(80, 1.6, 80),
        target: new THREE.Vector3(0, 1, 10),
        quaternion: new THREE.Quaternion(),
        zoom: 1,
      },
      FABRIC_BOUNDS,
    );
    expect(resolved.usedDefaultSpawn).toBe(true);
    expect(
      isSpacetimePositionInFabricBounds(
        resolved.view.position.x,
        resolved.view.position.z,
        FABRIC_BOUNDS,
      ),
    ).toBe(true);
  });

  it('re-enters XR from persisted pose instead of a far desktop orbit camera', () => {
    setSpacetimeSceneWalkBounds(FABRIC_BOUNDS);
    const persisted = {
      position: new THREE.Vector3(1, 1.6, 2),
      target: new THREE.Vector3(1, 1, 8),
      quaternion: new THREE.Quaternion(),
      zoom: 1,
    };
    const orbit = {
      position: new THREE.Vector3(249, 80, 251),
      target: FABRIC_BOUNDS.center.clone(),
      quaternion: new THREE.Quaternion(),
      zoom: 1,
    };
    const resolved = resolveSpacetimeXrEnterView(persisted, orbit, FABRIC_BOUNDS);
    expect(resolved.source).toBe('persisted');
    expect(resolved.usedDefaultSpawn).toBe(false);
    expect(resolved.view.position.x).toBeCloseTo(1, 5);
    expect(resolved.view.position.z).toBeCloseTo(2, 5);
  });
});
