import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  allowsSpacetimeWallStepUpBypass,
  clampSpacetimeMoveDelta,
  clampSpacetimeMoveToSceneBounds,
  findClosestSpacetimeBlockingWallHit,
  followSpacetimeWalkSurfaceY,
  isSpacetimeFootingStable,
  hasSpacetimeOverheadBlock,
  isSpacetimeBeyondStadiumInclineLip,
  hasSpacetimeForwardWalkFloor,
  isSpacetimeBlockingWall,
  pickSpacetimeWalkSurfaceHit,
  pickSpacetimeWalkSurfaceHitForWalker,
  pickSpacetimeWalkSurfaceHitHighest,
  pickSpacetimeWalkSurfaceY,
  projectSpacetimeMoveOffWall,
  prepareSpacetimeWalkSurfaces,
  querySpacetimeWalkSurface,
  querySpacetimeWalkSurfaceForAvatar,
  raycastSpacetimeWalkSurfaceY,
  resetSpacetimeWalkSurfaces,
  setSpacetimeSceneWalkBounds,
  sampleSpacetimeWalkSurface,
  slideSpacetimeMoveAlongWall,
} from '../library/spacetimeXrGroundFollow.js';

describe('spacetimeXrGroundFollow', () => {
  beforeEach(() => {
    resetSpacetimeWalkSurfaces();
  });

  it('raycasts walk surface Y from capsule floor mesh', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 4),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.y = 0.1;
    capsule.add(floor);
    fabricRoot.add(capsule);

    expect(prepareSpacetimeWalkSurfaces(fabricRoot)).toBe(1);
    fabricRoot.updateMatrixWorld(true);

    const surfaceY = raycastSpacetimeWalkSurfaceY(0, 0, 10, 0);
    expect(surfaceY).not.toBeNull();
    expect(surfaceY).toBeCloseTo(0.2, 2);
  });

  it('ignores capsule roof and picks entrance floor', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 4),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.y = 0;
    capsule.add(floor);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 4),
      new THREE.MeshBasicMaterial(),
    );
    roof.position.y = 3;
    capsule.add(roof);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    const targetFootY = 0;
    const surfaceY = raycastSpacetimeWalkSurfaceY(0, 0, 10, targetFootY);
    expect(surfaceY).toBeCloseTo(0.1, 2);
  });

  it('querySpacetimeWalkSurfaceForAvatar picks interior floor not capsule roof', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 4),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.y = 0;
    capsule.add(floor);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 4),
      new THREE.MeshBasicMaterial(),
    );
    roof.position.y = 2.8;
    capsule.add(roof);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    const referenceFootY = 0.1;
    const headY = 5;
    const avatarFloor = querySpacetimeWalkSurfaceForAvatar(0, 0, referenceFootY, headY);

    expect(avatarFloor?.y).toBeCloseTo(0.1, 2);
  });

  it('pickSpacetimeWalkSurfaceY skips steep wall hits', () => {
    const hits = [
      {
        point: new THREE.Vector3(0, 2, 0),
        normal: new THREE.Vector3(0, 1, 0),
      },
      {
        point: new THREE.Vector3(0, 0.1, 0),
        normal: new THREE.Vector3(0, 1, 0),
      },
    ];
    expect(pickSpacetimeWalkSurfaceY(hits, 0, 1.6)).toBeCloseTo(0.1, 2);
  });

  it('sampleSpacetimeWalkSurface uses forward probe on uphill ramp', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const low = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    low.position.set(-1, 0, 0);
    capsule.add(low);

    const high = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    high.position.set(1, 0.6, 0);
    capsule.add(high);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    const moveHint = new THREE.Vector3(1, 0, 0);
    const sample = sampleSpacetimeWalkSurface(0, 0, 1.6, 0.1, moveHint);
    expect(sample?.y).toBeGreaterThan(0.5);
  });

  it('isSpacetimeFootingStable rejects capsule wedge gap', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const leftSlab = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.15, 1.2),
      new THREE.MeshBasicMaterial(),
    );
    leftSlab.rotation.z = 0.55;
    leftSlab.position.set(-0.15, 0.55, 0);
    capsule.add(leftSlab);

    const rightSlab = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.15, 1.2),
      new THREE.MeshBasicMaterial(),
    );
    rightSlab.rotation.z = -0.55;
    rightSlab.position.set(0.15, 0.55, 0);
    capsule.add(rightSlab);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.12, 1.2),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.set(0, 0.05, 0);
    capsule.add(floor);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    followSpacetimeWalkSurfaceY(
      new THREE.Group(),
      Object.assign(new THREE.PerspectiveCamera(), {
        getWorldPosition: (target) => target.set(0, 1.6, 0),
      }),
      1.6,
    );

    expect(isSpacetimeFootingStable(0, 0, 1.6, 0.1)).toBe(false);
  });

  it('clampSpacetimeMoveDelta blocks walk through stadium shell at incline lip', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    ramp.rotation.z = -0.22;
    ramp.position.set(-0.35, 0.28, 0);
    capsule.add(ramp);

    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    lip.position.set(0.42, 0.52, 0);
    capsule.add(lip);

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 3, 2),
      new THREE.MeshBasicMaterial(),
    );
    shell.position.set(0.55, 1.5, 0);
    capsule.add(shell);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    followSpacetimeWalkSurfaceY(
      new THREE.Group(),
      Object.assign(new THREE.PerspectiveCamera(), {
        getWorldPosition: (target) => target.set(0.46, 1.95, 0),
      }),
      1.6,
    );

    const head = new THREE.Vector3(0.46, 1.95, 0);
    const move = new THREE.Vector3(0.35, 0, 0);
    const wallHit = findClosestSpacetimeBlockingWallHit(
      head,
      move.clone().normalize(),
      move.length(),
      0.35,
    );
    expect(wallHit).not.toBeNull();
    const clamped = clampSpacetimeMoveDelta(head, move, 0.35);
    expect(clamped.length()).toBeLessThan(0.12);
  });

  it('clampSpacetimeMoveDelta blocks at lip when probe anchor is walker feet (3rd person)', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    ramp.rotation.z = -0.22;
    ramp.position.set(-0.35, 0.28, 0);
    capsule.add(ramp);

    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    lip.position.set(0.42, 0.52, 0);
    capsule.add(lip);

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 3, 2),
      new THREE.MeshBasicMaterial(),
    );
    shell.position.set(0.55, 1.5, 0);
    capsule.add(shell);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    followSpacetimeWalkSurfaceY(
      new THREE.Group(),
      Object.assign(new THREE.PerspectiveCamera(), {
        getWorldPosition: (target) => target.set(0.46, 1.95, 0),
      }),
      1.6,
    );

    const avatarAtLip = new THREE.Vector3(0.46, 1.95, 0);
    const cameraBehind = new THREE.Vector3(0.46 - 1.75, 1.95, 0);
    const move = new THREE.Vector3(0.35, 0, 0);

    const fromCamera = clampSpacetimeMoveDelta(cameraBehind, move, 0.35);
    const fromWalker = clampSpacetimeMoveDelta(avatarAtLip, move, 0.35);

    expect(fromCamera.length()).toBeGreaterThan(0.25);
    expect(fromWalker.length()).toBeLessThan(0.12);
  });

  it('clampSpacetimeMoveDelta blocks stadium mesh gap with no vertical wall hit', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.set(-0.2, 0, 0);
    capsule.add(floor);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    followSpacetimeWalkSurfaceY(
      new THREE.Group(),
      Object.assign(new THREE.PerspectiveCamera(), {
        getWorldPosition: (target) => target.set(0.46, 1.95, 0),
      }),
      1.6,
    );

    const head = new THREE.Vector3(0.85, 1.6, 0);
    const move = new THREE.Vector3(0.4, 0, 0);
    expect(
      hasSpacetimeForwardWalkFloor(
        head,
        move,
        move.clone().normalize(),
        0,
        head.y,
      ),
    ).toBe(false);
    const clamped = clampSpacetimeMoveDelta(head, move, 0);
    expect(clamped.length()).toBe(0);
  });

  it('clampSpacetimeMoveDelta blocks stepping off a cliff edge', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.set(0, 0, 0);
    capsule.add(floor);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    followSpacetimeWalkSurfaceY(
      new THREE.Group(),
      Object.assign(new THREE.PerspectiveCamera(), {
        getWorldPosition: (target) => target.set(0, 1.6, 0),
      }),
      1.6,
    );

    const head = new THREE.Vector3(0, 1.6, 0);
    const move = new THREE.Vector3(2, 0, 0);
    const clamped = clampSpacetimeMoveDelta(head, move, 0);
    expect(clamped.length()).toBe(0);
  });

  it('slideSpacetimeMoveAlongWall slides parallel to stadium risers', () => {
    const move = new THREE.Vector3(0.5, 0, 0.5);
    const wallNormal = new THREE.Vector3(-1, 0, 0);
    const slide = slideSpacetimeMoveAlongWall(move, wallNormal);
    expect(slide.x).toBeCloseTo(0, 2);
    expect(slide.z).toBeCloseTo(0.5, 2);
  });

  it('projectSpacetimeMoveOffWall allows slide when flush on a wall', () => {
    const move = new THREE.Vector3(0.5, 0, 0);
    const wallNormal = new THREE.Vector3(-1, 0, 0);
    const projected = projectSpacetimeMoveOffWall(move, wallNormal, 0);
    expect(projected.x).toBeCloseTo(0, 2);
    expect(projected.length()).toBe(0);
    const strafe = projectSpacetimeMoveOffWall(
      new THREE.Vector3(0, 0, 0.5),
      wallNormal,
      0,
    );
    expect(strafe.z).toBeCloseTo(0.5, 2);
  });

  it('clampSpacetimeMoveDelta allows walking past a doorway to exterior floor', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const interior = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    interior.position.set(-0.75, 0, 0);
    capsule.add(interior);

    const exterior = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    exterior.position.set(0.75, 0, 0);
    capsule.add(exterior);

    const jamb = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 2, 0.4),
      new THREE.MeshBasicMaterial(),
    );
    jamb.position.set(0, 1, 0.75);
    capsule.add(jamb);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    followSpacetimeWalkSurfaceY(
      new THREE.Group(),
      Object.assign(new THREE.PerspectiveCamera(), {
        getWorldPosition: (target) => target.set(-0.5, 1.6, 0),
      }),
      1.6,
    );

    const head = new THREE.Vector3(-0.5, 1.6, 0);
    const move = new THREE.Vector3(0.6, 0, 0);
    const clamped = clampSpacetimeMoveDelta(head, move, 0.1);
    expect(clamped.length()).toBeGreaterThan(0.2);
  });

  it('allowsSpacetimeWallStepUpBypass requires meaningful step-up not same-level deck', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const flat = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    flat.position.set(-0.5, 0, 0);
    capsule.add(flat);

    const riser = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.5, 2),
      new THREE.MeshBasicMaterial(),
    );
    riser.position.set(0.425, 0.25, 0);
    capsule.add(riser);

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    deck.position.set(1.5, 0.08, 0);
    capsule.add(deck);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    followSpacetimeWalkSurfaceY(
      new THREE.Group(),
      Object.assign(new THREE.PerspectiveCamera(), {
        getWorldPosition: (target) => target.set(0, 1.6, 0),
      }),
      1.6,
    );

    const head = new THREE.Vector3(0, 1.6, 0);
    expect(
      allowsSpacetimeWallStepUpBypass(head, 0.8, 0, 0.1),
    ).toBe(false);
  });

  it('clampSpacetimeMoveDelta steps onto ramp behind vertical riser', () => {
    const fabricRoot = new THREE.Group();
    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';

    const flat = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    flat.position.set(-0.5, 0, 0);
    capsule.add(flat);

    const riser = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.5, 2),
      new THREE.MeshBasicMaterial(),
    );
    riser.position.set(0.425, 0.25, 0);
    capsule.add(riser);

    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    ramp.position.set(1.5, 0.45, 0);
    capsule.add(ramp);

    fabricRoot.add(capsule);
    prepareSpacetimeWalkSurfaces(fabricRoot);
    fabricRoot.updateMatrixWorld(true);

    followSpacetimeWalkSurfaceY(
      new THREE.Group(),
      Object.assign(new THREE.PerspectiveCamera(), {
        getWorldPosition: (target) => target.set(0, 1.6, 0),
      }),
      1.6,
    );

    const head = new THREE.Vector3(0, 1.6, 0);
    const move = new THREE.Vector3(0.8, 0, 0);
    const clamped = clampSpacetimeMoveDelta(head, move, 0.1);
    expect(clamped.length()).toBeGreaterThan(0.4);
  });

  it('isSpacetimeBlockingWall ignores walkable ramp faces', () => {
    expect(isSpacetimeBlockingWall(new THREE.Vector3(0.3, 0.95, 0))).toBe(false);
    expect(isSpacetimeBlockingWall(new THREE.Vector3(1, 0, 0))).toBe(true);
  });

  it('pickSpacetimeWalkSurfaceHit rejects roof above step limit', () => {
    const hits = [
      {
        point: new THREE.Vector3(0, 2.5, 0),
        normal: new THREE.Vector3(0, 1, 0),
      },
      {
        point: new THREE.Vector3(0, 0.2, 0),
        normal: new THREE.Vector3(0, 1, 0),
      },
    ];
    const picked = pickSpacetimeWalkSurfaceHit(hits, 0, 1.6, { airborne: false });
    expect(picked?.y).toBeCloseTo(0.2, 2);
  });

  it('pickSpacetimeWalkSurfaceHitForWalker prefers local floor over sticky last foot Y', () => {
    const hits = [
      {
        point: new THREE.Vector3(0, 0.48, 0),
        normal: new THREE.Vector3(0, 1, 0),
      },
      {
        point: new THREE.Vector3(0, 0.12, 0),
        normal: new THREE.Vector3(0, 1, 0),
      },
    ];
    // Was on scene floor (0.12) — back on capsule deck should pick 0.48, not closest to 0.12.
    const picked = pickSpacetimeWalkSurfaceHitForWalker(hits, 0.12, 1.6);
    expect(picked?.y).toBeCloseTo(0.48, 2);
  });

  it('pickSpacetimeWalkSurfaceHitForWalker follows scene floor when leaving capsule', () => {
    const hits = [
      {
        point: new THREE.Vector3(0, 0.15, 0),
        normal: new THREE.Vector3(0, 1, 0),
      },
    ];
    const picked = pickSpacetimeWalkSurfaceHitForWalker(hits, 0.48, 1.6);
    expect(picked?.y).toBeCloseTo(0.15, 2);
  });

  it('lifts rig so floor sits under camera feet', () => {
    const scene = new THREE.Scene();
    const rig = new THREE.Group();
    scene.add(rig);

    const capsule = new THREE.Group();
    capsule.name = 'Hello World!';
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.2, 4),
      new THREE.MeshBasicMaterial(),
    );
    floor.position.y = 0;
    capsule.add(floor);
    rig.add(capsule);
    prepareSpacetimeWalkSurfaces(rig);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    scene.add(camera);

    rig.position.y = -1;
    scene.updateMatrixWorld(true);

    const query = querySpacetimeWalkSurface(0, 0, 5.6, 0, {
      airborne: true,
      headY: 1.6,
    });
    expect(query).not.toBeNull();

    const surfaceY = followSpacetimeWalkSurfaceY(rig, camera, 1.6);
    expect(surfaceY).not.toBeNull();
    expect(rig.position.y).toBeCloseTo(-0.1, 2);
  });

  it('clampSpacetimeMoveToSceneBounds slides along fabric edge instead of falling off', () => {
    setSpacetimeSceneWalkBounds({
      min: new THREE.Vector3(-5, 0, -5),
      max: new THREE.Vector3(5, 2, 5),
    });
    const head = new THREE.Vector3(4.8, 1.6, 0);
    const move = new THREE.Vector3(0.6, 0, 0);
    const clamped = clampSpacetimeMoveToSceneBounds(head, move);
    expect(head.x + clamped.x).toBeLessThanOrEqual(5 - 0.34 * 0.2 + 0.01);
    expect(clamped.length()).toBeGreaterThan(0);
  });
});
