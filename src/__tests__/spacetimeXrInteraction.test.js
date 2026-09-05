import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  SpacetimeXrLocomotion,
  XR_LOCOMOTION_MODE_AVATAR,
  XR_LOCOMOTION_MODE_VIEWPOINT,
} from '../library/spacetimeXrLocomotion.js';
import { isThumbstickTeleportAim } from '../library/sceneManagerXrAxes.js';
import {
  SPACETIME_XR_CONTROL_AVATAR,
  SPACETIME_XR_CONTROL_FIRST_PERSON,
  SPACETIME_XR_CONTROL_THIRD_FOLLOW,
  SPACETIME_XR_CONTROL_THIRD_FREE,
  SpacetimeXrAvatarView,
  THIRD_PERSON_BEHIND_M,
  getSpacetimeWalkerHeadWorldPosition,
} from '../library/spacetimeXrAvatarView.js';

describe('spacetimeXrLocomotion', () => {
  it('toggles locomotion mode between avatar and viewpoint', () => {
    const rig = { position: { x: 0, y: 0, z: 0, add: vi.fn() }, rotation: { y: 0 } };
    const camera = {
      getWorldDirection: vi.fn(),
      getWorldPosition: vi.fn(),
      up: { x: 0, y: 1, z: 0 },
    };
    const loco = new SpacetimeXrLocomotion({ locomotionRig: rig, camera, playerRoot: null });
    expect(loco.mode).toBe(XR_LOCOMOTION_MODE_VIEWPOINT);
    loco.toggleMode();
    expect(loco.mode).toBe(XR_LOCOMOTION_MODE_AVATAR);
    loco.toggleMode();
    expect(loco.mode).toBe(XR_LOCOMOTION_MODE_VIEWPOINT);
  });
});

describe('SpacetimeXrAvatarView control cycle', () => {
  it('cycles forward and reverse through four control modes', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    const locomotion = { setMode: vi.fn() };
    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: null }),
      locomotion,
    });

    expect(view.controlMode).toBe(SPACETIME_XR_CONTROL_THIRD_FREE);

    view.cycleControl(1);
    expect(view.controlMode).toBe(SPACETIME_XR_CONTROL_FIRST_PERSON);

    view.cycleControl(1);
    expect(view.controlMode).toBe(SPACETIME_XR_CONTROL_THIRD_FOLLOW);

    view.cycleControl(1);
    expect(view.controlMode).toBe(SPACETIME_XR_CONTROL_AVATAR);

    view.cycleControl(-1);
    expect(view.controlMode).toBe(SPACETIME_XR_CONTROL_THIRD_FOLLOW);
  });

  it('pulls the viewer behind the avatar after first-person exit', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(0, 0, 2);

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.55, 2);

    const locomotion = { setMode: vi.fn() };
    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion,
    });

    view.setControlMode(SPACETIME_XR_CONTROL_FIRST_PERSON);
    view.setControlMode(SPACETIME_XR_CONTROL_THIRD_FOLLOW);
    view.applyPendingFollowFromAvatarSnap();
    for (let i = 0; i < 24; i += 1) {
      view.updateTransition(0.05);
    }
    view.finishDeferredFollowYawAlign();

    const head = new THREE.Vector3();
    getSpacetimeWalkerHeadWorldPosition(
      { humanoid: { humanBones: { head: { node: headBone } } } },
      playerRoot,
      head,
    );
    const cam = new THREE.Vector3();
    camera.getWorldPosition(cam);

    const dist = Math.hypot(cam.x - head.x, cam.z - head.z);
    expect(dist).toBeGreaterThanOrEqual(THIRD_PERSON_BEHIND_M * 0.85);
    expect(playerRoot.visible).toBe(true);
  });

  it('moves the viewpoint to the avatar on first-person enter (fabric plant unchanged)', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    // Avatar planted ahead of the headset on the fabric.
    playerRoot.position.set(1.5, 0, -3);

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.55, 0);
    camera.lookAt(0, 1.55, -1);
    camera.updateMatrixWorld(true);
    rig.updateMatrixWorld(true);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion: { setMode: vi.fn() },
    });

    // Leftover follow snap must not re-plant the avatar onto the headset.
    view._followSnapPreserveWorld = {
      pos: new THREE.Vector3(0, 0, 0),
      rotY: 0,
      localPos: new THREE.Vector3(0, 0, 0),
    };
    view._holdFollowAvatarWorld = true;

    const localBefore = playerRoot.position.clone();
    view.setControlMode(SPACETIME_XR_CONTROL_FIRST_PERSON);
    for (let i = 0; i < 24; i += 1) {
      view.updateTransition(0.05);
    }
    view.finishDeferredFollowYawAlign();

    expect(playerRoot.position.x).toBeCloseTo(localBefore.x, 5);
    expect(playerRoot.position.z).toBeCloseTo(localBefore.z, 5);
    expect(view._followYawAlignPending).toBe(false);
    expect(view._followSnapPreserveWorld).toBeNull();

    const head = new THREE.Vector3();
    getSpacetimeWalkerHeadWorldPosition(
      { humanoid: { humanBones: { head: { node: headBone } } } },
      playerRoot,
      head,
    );
    const cam = new THREE.Vector3();
    camera.getWorldPosition(cam);
    expect(Math.hypot(head.x - cam.x, head.z - cam.z)).toBeLessThan(0.05);
    expect(playerRoot.visible).toBe(false);
  });

  it('keeps the walked first-person pose when exiting to third-person follow', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    // Corridor start plant (fabric-local).
    playerRoot.position.set(0, 0, 0);

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    // Headset after walking in first-person (rig moved; camera stays in room).
    camera.position.set(3, 1.55, -4);
    camera.lookAt(3, 1.55, -5);
    camera.updateMatrixWorld(true);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion: { setMode: vi.fn() },
    });

    view.setControlMode(SPACETIME_XR_CONTROL_FIRST_PERSON);
    // Simulate FP stick walk: world slides under a fixed headset; hidden avatar
    // stays at the old fabric plant until disembody.
    rig.position.set(-3, 0, 4);
    rig.updateMatrixWorld(true);
    const localBefore = playerRoot.position.clone();

    view.setControlMode(SPACETIME_XR_CONTROL_THIRD_FOLLOW);
    view.applyPendingFollowFromAvatarSnap();
    for (let i = 0; i < 24; i += 1) {
      view.updateTransition(0.05);
    }
    view.finishDeferredFollowYawAlign();

    // Disembody re-plants fabric-local under the headset — not corridor origin.
    expect(playerRoot.position.distanceTo(localBefore)).toBeGreaterThan(1);
    expect(playerRoot.position.length()).toBeGreaterThan(1);

    const head = new THREE.Vector3();
    getSpacetimeWalkerHeadWorldPosition(
      { humanoid: { humanBones: { head: { node: headBone } } } },
      playerRoot,
      head,
    );
    const cam = new THREE.Vector3();
    camera.getWorldPosition(cam);
    expect(Math.hypot(cam.x - head.x, cam.z - head.z)).toBeGreaterThanOrEqual(
      THIRD_PERSON_BEHIND_M * 0.85,
    );
  });

  it('places the viewer 2 m behind the avatar when leaving first-person for walk-around', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(0, 0, 0);
    playerRoot.rotation.y = Math.PI / 5;

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2, 1.55, -3);
    // Headset look differs from avatar facing — exit must not yaw to match look.
    camera.lookAt(5, 1.55, -3);
    camera.updateMatrixWorld(true);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion: { setMode: vi.fn() },
    });

    view.setControlMode(SPACETIME_XR_CONTROL_FIRST_PERSON);
    const facingDuringFp = playerRoot.rotation.y;
    rig.position.set(-2, 0, 3);
    rig.updateMatrixWorld(true);

    view.setControlMode(SPACETIME_XR_CONTROL_THIRD_FREE);

    expect(playerRoot.rotation.y).toBeCloseTo(facingDuringFp, 5);
    expect(playerRoot.rotation.y).toBeCloseTo(Math.PI / 5, 5);

    const head = new THREE.Vector3();
    getSpacetimeWalkerHeadWorldPosition(
      { humanoid: { humanBones: { head: { node: headBone } } } },
      playerRoot,
      head,
    );
    const cam = new THREE.Vector3();
    camera.getWorldPosition(cam);
    expect(Math.hypot(cam.x - head.x, cam.z - head.z)).toBeGreaterThanOrEqual(
      THIRD_PERSON_BEHIND_M * 0.85,
    );
    expect(playerRoot.visible).toBe(true);
  });

  it('keeps avatar facing across first-person ↔ walk-around round trips', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(0, 0, -2);
    playerRoot.rotation.y = 0.7;

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.55, 0);
    camera.lookAt(1, 1.55, 0); // look ≠ avatar facing
    camera.updateMatrixWorld(true);
    rig.updateMatrixWorld(true);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion: { setMode: vi.fn() },
    });

    const facing0 = playerRoot.rotation.y;
    view.setControlMode(SPACETIME_XR_CONTROL_FIRST_PERSON);
    expect(playerRoot.rotation.y).toBeCloseTo(facing0, 5);

    view.setControlMode(SPACETIME_XR_CONTROL_THIRD_FREE);
    expect(playerRoot.rotation.y).toBeCloseTo(facing0, 5);

    view.setControlMode(SPACETIME_XR_CONTROL_FIRST_PERSON);
    expect(playerRoot.rotation.y).toBeCloseTo(facing0, 5);
  });

  it('does not adopt walk-around snap-turn yaw when returning to first-person', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(0, 0, -2);
    playerRoot.rotation.y = 0.4;
    rig.rotation.y = 0.15;

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.55, 0);
    camera.lookAt(0, 1.55, -1);
    camera.updateMatrixWorld(true);
    rig.updateMatrixWorld(true);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion: { setMode: vi.fn() },
    });

    view.setControlMode(SPACETIME_XR_CONTROL_FIRST_PERSON);
    const fpRigYaw = rig.rotation.y;
    const fpAvatarYaw = playerRoot.rotation.y;

    view.setControlMode(SPACETIME_XR_CONTROL_THIRD_FREE);
    // Simulate walk-around right-stick snap turn.
    rig.rotation.y += 0.9;
    rig.updateMatrixWorld(true);

    view.setControlMode(SPACETIME_XR_CONTROL_FIRST_PERSON);
    expect(rig.rotation.y).toBeCloseTo(fpRigYaw, 4);
    expect(playerRoot.rotation.y).toBeCloseTo(fpAvatarYaw, 4);
  });

  it('orients avatar toward stadium focus and pulls viewer behind on follow XR entry', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(0, 0, 8);

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);

    const stadiumCenter = new THREE.Vector3(0, 0, -20);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion: { setMode: vi.fn() },
    });

    view.setControlMode(SPACETIME_XR_CONTROL_THIRD_FOLLOW);
    view.applyEntryStandoff(stadiumCenter);

    const head = new THREE.Vector3();
    getSpacetimeWalkerHeadWorldPosition(
      { humanoid: { humanBones: { head: { node: headBone } } } },
      playerRoot,
      head,
    );
    const cam = new THREE.Vector3();
    camera.getWorldPosition(cam);

    const dist = Math.hypot(cam.x - head.x, cam.z - head.z);
    expect(dist).toBeGreaterThanOrEqual(THIRD_PERSON_BEHIND_M * 0.85);
    expect(playerRoot.rotation.y).not.toBe(0);
  });

  it('walk-around XR entry does not snap the viewport', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(0, 0, 8);

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion: { setMode: vi.fn() },
    });

    expect(view.controlMode).toBe(SPACETIME_XR_CONTROL_THIRD_FREE);
    view.applyEntryStandoff();
    expect(rig.position.length()).toBeLessThan(1e-4);
  });

  it('third-person follow snap-turn rotates rig and locks avatar world yaw', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    camera.updateMatrixWorld(true);

    const loco = new SpacetimeXrLocomotion({ locomotionRig: rig, camera, playerRoot });
    const rigStart = rig.rotation.y;
    const avatarStart = playerRoot.rotation.y;

    loco.update(
      0.016,
      [{ handedness: 'right', connected: true, axes: [0, 0, 0.9, 0] }],
      {
        preferAvatarMove: false,
        lockAvatarFacingOnTurn: true,
        thirdPersonFollowLead: true,
      },
    );

    expect(rig.rotation.y).not.toBe(rigStart);
    expect(playerRoot.rotation.y).not.toBe(avatarStart);
    expect(rig.rotation.y).toBeCloseTo(-playerRoot.rotation.y, 4);
  });

  it('leaving avatar move for third follow snaps viewer behind and holds standoff', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(6, 0, -4);
    playerRoot.rotation.y = Math.PI / 4;

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    camera.updateMatrixWorld(true);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion: { setMode: vi.fn() },
    });

    view.setControlMode(SPACETIME_XR_CONTROL_AVATAR);
    const avatarBefore = new THREE.Vector3();
    playerRoot.getWorldPosition(avatarBefore);

    view.setControlMode(SPACETIME_XR_CONTROL_THIRD_FOLLOW);
    view.applyPendingFollowFromAvatarSnap();
    for (let i = 0; i < 24; i += 1) {
      view.updateTransition(0.05);
    }
    view.finishDeferredFollowYawAlign();

    const head = new THREE.Vector3();
    getSpacetimeWalkerHeadWorldPosition(
      { humanoid: { humanBones: { head: { node: headBone } } } },
      playerRoot,
      head,
    );
    const cam = new THREE.Vector3();
    camera.getWorldPosition(cam);
    const dist = Math.hypot(cam.x - head.x, cam.z - head.z);

    expect(dist).toBeGreaterThanOrEqual(THIRD_PERSON_BEHIND_M * 0.85);
    expect(view.prefersAvatarStickMove()).toBe(false);
    // Entry snap complete — hold blocks standoff until left stick walks.
    expect(view._holdFollowAvatarWorld).toBe(true);
    // Fabric-local facing is preserved; scene yaw may rotate so world facing
    // matches the headset look axis.
    expect(playerRoot.rotation.y).toBeCloseTo(Math.PI / 4, 4);
    const worldFwd = new THREE.Vector3();
    playerRoot.getWorldDirection(worldFwd);
    worldFwd.y = 0;
    worldFwd.normalize();
    const camFwd = new THREE.Vector3();
    camera.getWorldDirection(camFwd);
    camFwd.y = 0;
    camFwd.normalize();
    expect(worldFwd.dot(camFwd)).toBeGreaterThan(0.85);

    const avatarLocalBefore = new THREE.Vector3(6, 0, -4);
    expect(playerRoot.position.distanceTo(avatarLocalBefore)).toBeLessThan(1e-3);

    view.refreshThirdPersonFollowOffset();
    expect(playerRoot.position.distanceTo(avatarLocalBefore)).toBeLessThan(1e-3);

    view.releaseFollowAvatarWorldHold();
    // Walk the viewpoint first — then the standoff leash advances the avatar.
    rig.position.z -= 1.5;
    rig.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    view.refreshThirdPersonFollowOffset();
    expect(playerRoot.position.distanceTo(avatarLocalBefore)).toBeGreaterThan(0.5);
  });

  it('leaving avatar move for walk-around keeps viewport and avatar in place', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(4, 0, -3);

    const headBone = new THREE.Object3D();
    headBone.position.set(0, 1.55, 0);
    playerRoot.add(headBone);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: { humanBones: { head: { node: headBone } } } }),
      locomotion: { setMode: vi.fn() },
    });

    view.setControlMode(SPACETIME_XR_CONTROL_AVATAR);
    const avatarBefore = new THREE.Vector3();
    playerRoot.getWorldPosition(avatarBefore);

    view.setControlMode(SPACETIME_XR_CONTROL_THIRD_FREE);

    const avatarAfter = new THREE.Vector3();
    playerRoot.getWorldPosition(avatarAfter);
    expect(avatarAfter.distanceTo(avatarBefore)).toBeLessThan(1e-4);
    expect(rig.position.length()).toBeLessThan(1e-4);
  });

  it('avatar move mode turns viewport on right stick, not avatar yaw', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.rotation.y = 0.5;

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    camera.updateMatrixWorld(true);

    const loco = new SpacetimeXrLocomotion({ locomotionRig: rig, camera, playerRoot });
    const avatarYawBefore = playerRoot.rotation.y;
    const rigYawBefore = rig.rotation.y;

    loco.update(
      0.016,
      [{ handedness: 'right', connected: true, axes: [0, 0, 0.9, 0] }],
      { preferAvatarMove: true, turnViewportOnly: true },
    );

    expect(playerRoot.rotation.y).toBeCloseTo(avatarYawBefore, 4);
    expect(rig.rotation.y).not.toBeCloseTo(rigYawBefore, 4);
  });

  it('avatar move mode faces walker toward stick move direction', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    camera.updateMatrixWorld(true);

    const loco = new SpacetimeXrLocomotion({ locomotionRig: rig, camera, playerRoot });
    loco._applyLeftStickMove(
      camera,
      1,
      0,
      0.5,
      rig,
      true,
      true,
      false,
      false,
      false,
      false,
      0,
    );

    expect(Math.abs(playerRoot.rotation.y)).toBeGreaterThan(0.01);
  });


  it('does not sync the avatar into the headset in third-person free', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(3, 0, 0);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);

    const view = new SpacetimeXrAvatarView({
      locomotionRig: rig,
      playerRoot,
      camera,
      getVrm: () => ({ humanoid: null }),
      locomotion: { setMode: vi.fn() },
    });

    view.setControlMode(SPACETIME_XR_CONTROL_THIRD_FREE);
    expect(view.shouldSyncAvatarToViewpoint()).toBe(false);

    playerRoot.updateMatrixWorld(true);
    const avatarWorld = new THREE.Vector3();
    playerRoot.getWorldPosition(avatarWorld);
    const camWorld = new THREE.Vector3();
    camera.getWorldPosition(camWorld);
    expect(Math.abs(camWorld.x - avatarWorld.x)).toBeGreaterThan(0.5);
  });
});

describe('spacetimeXrLocomotion avatar move', () => {
  it('moves playerRoot in avatar mode, not the locomotion rig', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(1, 0, 0);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    camera.updateMatrixWorld(true);

    const loco = new SpacetimeXrLocomotion({ locomotionRig: rig, camera, playerRoot });
    const rigStart = rig.position.clone();
    const playerStart = playerRoot.position.clone();

    loco._applyLeftStickMove(
      camera,
      0,
      1,
      0.5,
      rig,
      true,
      false,
      false,
      false,
      false,
      false,
      0,
    );

    expect(playerRoot.position.distanceTo(playerStart)).toBeGreaterThan(0.01);
    expect(rig.position.distanceTo(rigStart)).toBeLessThan(1e-6);
  });

  it('moves the locomotion rig in third-person follow (viewpoint + standoff leash)', () => {
    const rig = new THREE.Group();
    const playerRoot = new THREE.Group();
    rig.add(playerRoot);
    playerRoot.position.set(2, 0, -1);
    playerRoot.visible = true;

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    camera.updateMatrixWorld(true);

    const loco = new SpacetimeXrLocomotion({ locomotionRig: rig, camera, playerRoot });
    loco.setMode('viewpoint');
    const playerStart = playerRoot.position.clone();
    const rigStart = rig.position.clone();

    loco._applyLeftStickMove(
      camera,
      0,
      1,
      0.5,
      rig,
      false,
      false,
      false,
      true,
      false,
      false,
      0,
    );

    expect(rig.position.distanceTo(rigStart)).toBeGreaterThan(0.01);
    expect(playerRoot.position.distanceTo(playerStart)).toBeLessThan(1e-6);
  });
});

describe('OpenNexus teleport aim parity', () => {
  it('teleport aims on stick back dominant axis', () => {
    expect(isThumbstickTeleportAim(-0.8, 0.1)).toBe(true);
    expect(isThumbstickTeleportAim(0.1, 0.8)).toBe(false);
  });
});
