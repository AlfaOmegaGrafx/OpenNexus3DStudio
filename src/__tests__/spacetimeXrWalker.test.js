import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  anchorSpacetimeWalkerFeetToFloor,
  placeSpacetimeWalkerStandoff,
  rememberSpacetimeWalkerVrm,
  resolveSpacetimeWalkerVrmSource,
  scaleSpacetimeWalkerToHeight,
  snapSpacetimeWalkerToWalkSurface,
  SPACETIME_XR_VRM_SESSION_KEY,
} from '../library/spacetimeXrWalker.js';
import { prepareSpacetimeWalkSurfaces, resetSpacetimeWalkSurfaces } from '../library/spacetimeXrGroundFollow.js';

describe('resolveSpacetimeWalkerVrmSource', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('prefers vrmUrl query param', () => {
    const params = new URLSearchParams('vrmUrl=https://example.com/me.vrm');
    expect(resolveSpacetimeWalkerVrmSource(params)).toBe('https://example.com/me.vrm');
  });

  it('reads sessionStorage when useMainAvatar=1', () => {
    sessionStorage.setItem(SPACETIME_XR_VRM_SESSION_KEY, 'blob:test');
    const params = new URLSearchParams('useMainAvatar=1');
    expect(resolveSpacetimeWalkerVrmSource(params)).toBe('blob:test');
  });
});

describe('spacetime walker scale and floor', () => {
  it('scales mesh to target height and anchors feet', () => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 1;
    scene.add(mesh);

    scaleSpacetimeWalkerToHeight(scene, 1.8);
    anchorSpacetimeWalkerFeetToFloor(scene);

    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.getSize(new THREE.Vector3()).y).toBeCloseTo(1.8, 1);
  });
});

describe('snapSpacetimeWalkerToWalkSurface', () => {
  beforeEach(() => {
    resetSpacetimeWalkSurfaces();
  });

  it('aligns playerRoot Y to capsule walk mesh height', () => {
    const scene = new THREE.Scene();
    const rig = new THREE.Group();
    scene.add(rig);

    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.2, 6),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.y = 0.5;
    capsule.add(floor);
    rig.add(capsule);
    prepareSpacetimeWalkSurfaces(rig);

    const playerRoot = new THREE.Group();
    rig.add(playerRoot);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.8, 0.4),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 0.9;
    playerRoot.add(mesh);
    anchorSpacetimeWalkerFeetToFloor(playerRoot);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 2.1, 0);
    scene.add(camera);

    playerRoot.position.set(0, 0, -1.75);
    scene.updateMatrixWorld(true);

    const surfaceY = snapSpacetimeWalkerToWalkSurface(playerRoot, camera);
    expect(surfaceY).not.toBeNull();
    expect(surfaceY).toBeCloseTo(0.6, 2);

    playerRoot.updateMatrixWorld(true);
    const feet = new THREE.Box3().setFromObject(playerRoot);
    expect(feet.min.y).toBeCloseTo(0.6, 2);
  });
});

describe('rememberSpacetimeWalkerVrm', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('stores blob object URL in sessionStorage', () => {
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    const url = rememberSpacetimeWalkerVrm(blob);
    expect(url).toMatch(/^blob:/);
    expect(sessionStorage.getItem(SPACETIME_XR_VRM_SESSION_KEY)).toBe(url);
  });
});
