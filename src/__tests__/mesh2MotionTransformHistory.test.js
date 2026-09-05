import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyTransformSnapshot,
  captureTransformSnapshot,
  createTransformHistory,
} from '../library/mesh2MotionTransformHistory.js';

describe('mesh2MotionTransformHistory', () => {
  it('captures and restores local transforms', () => {
    const obj = new THREE.Object3D();
    obj.position.set(1, 2, 3);
    obj.rotation.set(0.1, 0.2, 0.3);
    obj.scale.set(2, 2, 2);
    const snap = captureTransformSnapshot(obj);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    applyTransformSnapshot(obj, snap);
    expect(obj.position.toArray()).toEqual([1, 2, 3]);
    expect(obj.scale.toArray()).toEqual([2, 2, 2]);
  });

  it('undoes and redoes like Mesh2Motion UndoRedoSystem', () => {
    const obj = new THREE.Object3D();
    obj.uuid = 'test-uuid';
    const history = createTransformHistory(10);
    const resolve = (uuid) => (uuid === obj.uuid ? obj : null);
    const capture = () => [captureTransformSnapshot(obj)];

    history.push(capture());
    obj.position.set(5, 0, 0);
    expect(history.undo(resolve, capture)).toBe(true);
    expect(obj.position.x).toBe(0);
    expect(history.redo(resolve, capture)).toBe(true);
    expect(obj.position.x).toBe(5);
  });
});

describe('zoomToBone world position contract', () => {
  it('uses world position when helper is under a translated model', () => {
    const root = new THREE.Object3D();
    root.position.set(4, 0, -2);
    const helper = new THREE.Object3D();
    helper.position.set(0, 1.2, 0);
    root.add(helper);
    root.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    helper.getWorldPosition(world);
    expect(world.x).toBeCloseTo(4);
    expect(world.y).toBeCloseTo(1.2);
    expect(world.z).toBeCloseTo(-2);
    // Local position alone would wrongly focus near origin Y only
    expect(helper.position.x).toBe(0);
  });

  it('prefers live bone world position over stale helper bind position', () => {
    const root = new THREE.Object3D();
    const bone = new THREE.Bone();
    bone.position.set(0.5, 1.4, 0.1);
    root.add(bone);
    root.updateMatrixWorld(true);

    const helper = new THREE.Object3D();
    helper.position.set(0, 1.2, 0); // bind-era helper — wrong during animation
    root.add(helper);
    helper.userData.originalBone = bone;
    root.updateMatrixWorld(true);

    const fromHelper = new THREE.Vector3();
    helper.getWorldPosition(fromHelper);
    const fromBone = new THREE.Vector3();
    bone.getWorldPosition(fromBone);

    expect(fromBone.x).toBeCloseTo(0.5);
    expect(fromHelper.x).toBeCloseTo(0);
    expect(fromBone.distanceTo(fromHelper)).toBeGreaterThan(0.3);
  });
});
