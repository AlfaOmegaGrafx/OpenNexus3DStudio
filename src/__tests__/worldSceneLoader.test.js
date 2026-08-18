import { describe, expect, it } from 'vitest';
import * as THREE from '../library/three.js';
import {
  applyWorldTransform,
  anchorObjectBottomToFloor,
  applyDefaultWorldEnvironmentVisibility,
  computeXrFloorAlignmentY,
  getObjectFloorBounds,
  getWorldEnvironmentLayerVisibility,
  isIdentityWorldRotation,
  scaleWorldPropsToHumanProportions,
  scaleWorldToHumanProportions,
  orientWorldPropFeetDown,
  setWorldEnvironmentLayerVisible,
  shouldSkipXrFloorWrap,
} from '../library/worldSceneLoader.js';

describe('worldSceneLoader transforms', () => {
  it('treats default manifest quaternion as identity', () => {
    expect(isIdentityWorldRotation([1, 0, 0, 0])).toBe(true);
    expect(isIdentityWorldRotation(undefined)).toBe(true);
  });

  it('preserves splat orientation when manifest rotation is identity', () => {
    const splat = new THREE.Group();
    splat.quaternion.set(1, 0, 0, 0);

    applyWorldTransform(splat, {
      position: [0, 0, 0],
      rotation: [1, 0, 0, 0],
      scale: 1,
    });

    expect(splat.quaternion.x).toBeCloseTo(1);
    expect(splat.quaternion.w).toBeCloseTo(0);
  });

  it('applies non-identity manifest rotation', () => {
    const splat = new THREE.Group();
    splat.quaternion.set(1, 0, 0, 0);

    applyWorldTransform(splat, {
      rotation: [0, 0, 1, 0],
      scale: 1,
    });

    expect(splat.quaternion.y).toBeCloseTo(1);
    expect(splat.quaternion.w).toBeCloseTo(0);
  });

  it('applies non-uniform XYZ scale from manifest', () => {
    const root = new THREE.Group();
    applyWorldTransform(root, { scale: [1.62, 1, 1.62] });
    expect(root.scale.x).toBeCloseTo(1.62);
    expect(root.scale.y).toBeCloseTo(1);
    expect(root.scale.z).toBeCloseTo(1.62);
  });

  it('orients props feet-down when longest axis is not Y', () => {
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 0.8),
      new THREE.MeshBasicMaterial(),
    );
    const stood = orientWorldPropFeetDown(desk);
    expect(stood).toBe(true);
    desk.updateMatrixWorld(true);
    const box = getObjectFloorBounds(desk);
    const size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(size.x * 0.5);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
  });

  it('anchors mesh bottom to floor plane (y=0)', () => {
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshBasicMaterial(),
    );
    cube.position.y = 2;
    cube.updateMatrixWorld(true);

    const lift = anchorObjectBottomToFloor(cube);
    cube.updateMatrixWorld(true);
    const box = getObjectFloorBounds(cube);

    expect(lift).toBeCloseTo(-1);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
  });

  it('computeXrFloorAlignmentY aligns world layer bottom to reference floor', () => {
    const worldRoot = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 4, 2),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 0;
    worldRoot.add(mesh);
    worldRoot.updateMatrixWorld(true);

    const sceneManager = {
      vrSceneWrapper: null,
      xrLocomotionRig: null,
      playerRoot: null,
      worldRoot,
      propsRoot: null,
      currentModel: null,
    };

    expect(computeXrFloorAlignmentY(sceneManager)).toBeCloseTo(2);
  });

  it('computeXrFloorAlignmentY uses mesh feet for rigged avatars, not armature tails', () => {
    const playerRoot = new THREE.Group();
    playerRoot.name = 'playerRoot';

    const boneLow = new THREE.Bone();
    boneLow.position.y = -1;
    const boneHigh = new THREE.Bone();
    boneHigh.position.y = 0.5;
    boneLow.add(boneHigh);

    const skinned = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(0.4, 1.6, 0.3),
      new THREE.MeshBasicMaterial(),
    );
    skinned.position.y = 0.8;
    skinned.add(boneLow);
    skinned.bind(new THREE.Skeleton([boneLow, boneHigh]));

    const model = new THREE.Group();
    model.userData.vrm = true;
    model.add(skinned);
    playerRoot.add(model);
    playerRoot.updateMatrixWorld(true);

    const sceneManager = {
      playerRoot,
      worldRoot: new THREE.Group(),
      propsRoot: new THREE.Group(),
      currentModel: model,
      vrSceneWrapper: null,
      xrLocomotionRig: null,
    };

    expect(computeXrFloorAlignmentY(sceneManager)).toBeCloseTo(0, 2);
    expect(sceneManager._lastXrFloorDiagnostics?.floorAlignmentY).toBeCloseTo(0, 2);
  });

  it('shouldSkipXrFloorWrap excludes viewport grid and axes helpers', () => {
    const grid = new THREE.GridHelper(10, 10);
    grid.name = 'viewportGridHelper';
    const axes = new THREE.AxesHelper(2);
    axes.name = 'viewportAxesHelper';
    const playerRoot = new THREE.Group();
    playerRoot.name = 'playerRoot';

    expect(shouldSkipXrFloorWrap(grid)).toBe(true);
    expect(shouldSkipXrFloorWrap(axes)).toBe(true);
    expect(shouldSkipXrFloorWrap(playerRoot)).toBe(false);
  });

  it('scales undersized world props toward human viewport proportions', () => {
    const sceneManager = {
      worldRoot: new THREE.Group(),
      propsRoot: new THREE.Group(),
      worldEnvironmentSplat: null,
      worldPropMeshes: [],
    };
    sceneManager.worldRoot.name = 'worldRoot';
    sceneManager.propsRoot.name = 'propsRoot';

    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshBasicMaterial(),
    );
    sceneManager.propsRoot.add(chair);
    sceneManager.worldPropMeshes.push(chair);

    const factor = scaleWorldPropsToHumanProportions(sceneManager);
    expect(factor).toBeGreaterThan(1);
    expect(chair.scale.x).toBeGreaterThan(1);
  });

  it('defaults to splat visible and mesh hidden when both layers exist', () => {
    const splat = new THREE.Group();
    const mesh = new THREE.Group();
    const sceneManager = {
      worldEnvironmentSplat: splat,
      worldEnvironmentMesh: mesh,
      emit: () => {},
    };
    applyDefaultWorldEnvironmentVisibility(sceneManager);
    expect(splat.visible).toBe(true);
    expect(mesh.visible).toBe(false);

    setWorldEnvironmentLayerVisible(sceneManager, 'mesh', true, { exclusive: true });
    expect(mesh.visible).toBe(true);
    expect(splat.visible).toBe(false);

    setWorldEnvironmentLayerVisible(sceneManager, 'mesh', false, { exclusive: true });
    expect(mesh.visible).toBe(false);
    expect(splat.visible).toBe(false);

    const vis = getWorldEnvironmentLayerVisibility(sceneManager);
    expect(vis.hasSplat).toBe(true);
    expect(vis.hasMesh).toBe(true);
    expect(vis.meshVisible).toBe(false);
  });
});
