import { describe, expect, it } from 'vitest';
import * as THREE from '../library/three.js';
import {
  alignDetachedArmatureToMesh,
  alignSkinnedMeshToArmature,
  alignSkinnedMeshToRig,
  ensureCreatureTemplateFacesForward,
  getBoneDisplayWorldPosition,
  getPrimarySkeletonBones,
  getSkeletonJointSphereRadius,
  SKELETON_JOINT_SPHERE_RADIUS,
  getSkinnedDisplayWorldBounds,
  getViewportLayoutBounds,
  anchorModelFeetToFloor,
  isHumanoidTemplateWrapExport,
  normalizeRiggedModelTransforms,
  needsSkinnedMeshRigRepair,
  rebindSkinnedMeshes,
  updateSkeletonDisplayCorrection,
} from '../library/rigBoneUtils.js';

describe('rigBoneUtils', () => {
  it('rebinds skinned meshes after parent scale', () => {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.position.set(0, 1, 0);
    root.add(bone);

    const geometry = new THREE.BoxGeometry(0.4, 1.6, 0.2);
    const material = new THREE.MeshBasicMaterial();
    const skinned = new THREE.SkinnedMesh(geometry, material);
    skinned.add(bone);
    const skeleton = new THREE.Skeleton([bone]);
    skinned.bind(skeleton, skinned.matrixWorld);
    root.add(skinned);

    root.scale.setScalar(2);
    root.updateMatrixWorld(true);
    const rebound = rebindSkinnedMeshes(root);
    expect(rebound).toBe(1);
  });

  it('uses a fixed joint sphere radius for every model', () => {
    expect(getSkeletonJointSphereRadius()).toBe(SKELETON_JOINT_SPHERE_RADIUS);
    expect(getSkeletonJointSphereRadius()).toBe(0.012);
  });

  it('prefers active skinned skeleton bones for visualization', () => {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = 'Hips';
    root.add(bone);
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinned.add(bone);
    skinned.bind(new THREE.Skeleton([bone]), skinned.matrixWorld);
    root.add(skinned);

    const bones = getPrimarySkeletonBones(root);
    expect(bones).toHaveLength(1);
    expect(bones[0].name).toBe('Hips');
  });

  it('anchors mesh feet to y=0 when model is below the floor', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(0.4, 1.6, 0.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinned.position.set(0, -0.4, 0);
    root.add(skinned);
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 0.4, 0);
    skinned.add(hips);
    skinned.bind(new THREE.Skeleton([hips]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    const shift = anchorModelFeetToFloor(root);
    expect(shift).toBeGreaterThan(0);
    const box = getSkinnedDisplayWorldBounds(skinned);
    expect(box.min.y).toBeCloseTo(0, 2);
  });

  it('stores skeleton display offset without moving skinned mesh', () => {
    const root = new THREE.Group();
    root.userData.autoRigMeta = { bone_count: 1 };

    const geometry = new THREE.BoxGeometry(0.4, 1.6, 0.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinned.position.set(0, 0.8, 0);
    root.add(skinned);

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 2.5, 0);
    skinned.add(hips);
    skinned.bind(new THREE.Skeleton([hips]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    const meshYBefore = skinned.position.y;
    updateSkeletonDisplayCorrection(root);
    expect(skinned.position.y).toBe(meshYBefore);
    expect(root.userData.rigSkeletonDisplayOffset?.y).toBeLessThan(0);

    const raw = hips.getWorldPosition(new THREE.Vector3());
    const display = new THREE.Vector3();
    getBoneDisplayWorldPosition(hips, root, display);
    expect(display.y).toBeLessThan(raw.y);
    expect(display.y - raw.y).toBeCloseTo(root.userData.rigSkeletonDisplayOffset.y, 1);
  });

  it('unions mesh and bone bounds for viewport layout', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial(),
    );
    root.add(mesh);
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 2, 0);
    root.add(hips);
    root.updateMatrixWorld(true);

    const layout = getViewportLayoutBounds(root);
    const size = layout.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(1.5);
  });

  it('aligns skinned mesh to armature without moving bones', () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 1.5, 0);
    const spine = new THREE.Bone();
    spine.name = 'Spine';
    spine.position.set(0, 0.3, 0);
    hips.add(spine);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.4, 1.2, 0.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips, spine]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    const hipsYBefore = hips.getWorldPosition(new THREE.Vector3()).y;
    alignSkinnedMeshToArmature(root);
    expect(hips.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(hipsYBefore, 5);
    expect(skinned.position.y).not.toBe(0);
  });

  it('resets baked skinned mesh node transform for AIGC exports', () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 1, 0);
    const spine = new THREE.Bone();
    spine.name = 'Spine';
    spine.position.set(0, 0.4, 0);
    const leftArm = new THREE.Bone();
    leftArm.name = 'LeftArm';
    leftArm.position.set(0.3, 0.3, 0);
    const rightArm = new THREE.Bone();
    rightArm.name = 'RightArm';
    rightArm.position.set(-0.3, 0.3, 0);
    hips.add(spine);
    spine.add(leftArm);
    spine.add(rightArm);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.4, 1.6, 0.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinned.position.set(0, 2.5, 0);
    skinned.rotation.y = Math.PI;
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips, spine, leftArm, rightArm]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    const hipsYBefore = hips.getWorldPosition(new THREE.Vector3()).y;
    alignSkinnedMeshToRig(root);
    root.updateMatrixWorld(true);

    expect(hips.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(hipsYBefore, 5);
    expect(Math.abs(skinned.rotation.y)).toBeLessThan(0.05);
    expect(skinned.position.y).toBeLessThan(2.5);
  });

  it('aligns detached skinned mesh to rig without moving bones', () => {
    const root = new THREE.Group();

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 1, 0);
    const spine = new THREE.Bone();
    spine.name = 'Spine';
    spine.position.set(0, 0.4, 0);
    const leftArm = new THREE.Bone();
    leftArm.name = 'LeftArm';
    leftArm.position.set(0.3, 0.3, 0);
    const rightArm = new THREE.Bone();
    rightArm.name = 'RightArm';
    rightArm.position.set(-0.3, 0.3, 0);
    hips.add(spine);
    spine.add(leftArm);
    spine.add(rightArm);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.4, 1.6, 0.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinned.position.set(0, 3, 0);
    skinned.rotation.y = Math.PI;
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips, spine, leftArm, rightArm]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    const hipsYBefore = hips.getWorldPosition(new THREE.Vector3()).y;
    const meshBefore = getSkinnedDisplayWorldBounds(skinned).getCenter(new THREE.Vector3());

    alignSkinnedMeshToRig(root);
    root.updateMatrixWorld(true);

    expect(hips.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(hipsYBefore, 5);
    const meshAfter = getSkinnedDisplayWorldBounds(skinned).getCenter(new THREE.Vector3());
    const boneCenter = new THREE.Box3()
      .expandByPoint(hips.getWorldPosition(new THREE.Vector3()))
      .getCenter(new THREE.Vector3());
    expect(Math.abs(meshAfter.y - meshBefore.y)).toBeGreaterThan(0.5);
    expect(meshAfter.distanceTo(boneCenter)).toBeLessThan(meshBefore.distanceTo(boneCenter));
  });

  it('aligns detached armature to mesh center', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 0.5),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.set(0, 1, 0);
    root.add(mesh);

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 3, 0);
    const armature = new THREE.Group();
    armature.add(hips);
    root.add(armature);

    const aligned = alignDetachedArmatureToMesh(root);
    expect(aligned).toBe(true);
    hips.updateMatrixWorld(true);
    const hipsWorld = new THREE.Vector3();
    hips.getWorldPosition(hipsWorld);
    expect(hipsWorld.y).toBeCloseTo(1, 0);
  });

  it('runs mesh rig repair on preserved export when feet mismatch despite contract pass', () => {
    const root = new THREE.Group();
    root.userData.preserveExportedOrientation = true;
    root.userData.fromAigc = true;
    root.userData.aigcRigContract = { status: 'pass', failures: [] };

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 0.5, 0);
    const spine = new THREE.Bone();
    spine.name = 'Spine';
    spine.position.set(0, 0.8, 0);
    hips.add(spine);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.4, 1.6, 0.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinned.position.set(0.25, 2.5, 0.1);
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips, spine]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    expect(needsSkinnedMeshRigRepair(root)).toBe(true);
    normalizeRiggedModelTransforms(root, {
      label: 'test-aigc-pass',
      preserveExportedOrientation: true,
    });
    expect(skinned.position.y).toBeLessThan(2.5);
  });

  it('always repairs avatar-from-image skinned exports', () => {
    const root = new THREE.Group();
    root.userData.preserveExportedOrientation = true;
    root.userData.avatarFromImage = true;
    root.userData.aigcRigContract = { status: 'pass', failures: [] };

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 1, 0);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.4, 1.6, 0.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    expect(needsSkinnedMeshRigRepair(root)).toBe(true);
  });

  it('skips mesh repair for template_wrap head-stitch multi-mesh exports', () => {
    const root = new THREE.Group();
    root.userData.fromAigc = true;
    root.userData.autoRigMeta = {
      rig_info: {
        rig_mode: 'template_wrap',
        wrap_status: 'head_stitch',
        generation_method: 'humanoid_vrm_template',
        validation: { passed: false, codes: ['character_facing_backwards'] },
      },
    };

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 1, 0);
    root.add(hips);

    const body = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(0.4, 1.6, 0.2),
      new THREE.MeshBasicMaterial(),
    );
    body.name = 'geometry_0';
    const head = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(0.2, 0.25, 0.2),
      new THREE.MeshBasicMaterial(),
    );
    head.name = 'AvatarHead';
    head.position.set(0, 2.2, 0);
    root.add(body);
    root.add(head);
    const skel = new THREE.Skeleton([hips]);
    body.bind(skel, body.matrixWorld);
    head.bind(skel, head.matrixWorld);
    root.updateMatrixWorld(true);

    expect(isHumanoidTemplateWrapExport(root)).toBe(true);
    expect(needsSkinnedMeshRigRepair(root)).toBe(false);
    expect(alignSkinnedMeshToRig(root)).toBe(false);
    expect(head.position.y).toBeCloseTo(2.2, 5);
  });

  it('skips feet repair and skeleton squash for appearance_component slot meshes', () => {
    const root = new THREE.Group();
    root.userData.preserveExportedOrientation = true;
    root.userData.autoRigMeta = {
      rig_info: {
        rig_mode: 'appearance_component',
        generation_method: 'appearance_component_vrm_fit',
        appearance_slot: 'Head',
      },
    };

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 1.0, 0);
    const foot = new THREE.Bone();
    foot.name = 'LeftFoot';
    foot.position.set(0, 0, 0);
    root.add(hips);
    root.add(foot);

    // Helmet-sized mesh high on the body — feet delta would trigger full-body repair.
    const helmet = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(0.3, 0.35, 0.3),
      new THREE.MeshBasicMaterial(),
    );
    helmet.position.set(0, 1.7, 0);
    root.add(helmet);
    helmet.bind(new THREE.Skeleton([hips, foot]), helmet.matrixWorld);
    root.updateMatrixWorld(true);

    const beforeY = helmet.position.y;
    expect(needsSkinnedMeshRigRepair(root)).toBe(false);
    expect(alignSkinnedMeshToRig(root)).toBe(false);

    normalizeRiggedModelTransforms(root, {
      label: 'appearance-component-test',
      preserveExportedOrientation: true,
    });
    updateSkeletonDisplayCorrection(root);

    expect(helmet.position.y).toBeCloseTo(beforeY, 5);
    expect(root.userData.rigSkeletonDisplayOffset).toBeUndefined();
  });

  it('skips armature mesh repair for uploaded VRM roots', () => {
    const root = new THREE.Group();
    root.userData.vrm = { meta: { metaVersion: '1' } };

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 1, 0);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.4, 1.6, 0.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinned.position.set(0, 0, 0);
    skinned.rotation.y = 0;
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    normalizeRiggedModelTransforms(root, { label: 'test-vrm' });
    expect(skinned.rotation.y).toBe(0);
  });

  it('does not flip quadruped skeleton display when head faces glTF -Z', () => {
    const root = new THREE.Group();
    root.userData.preserveExportedOrientation = true;
    root.userData.fromAigc = true;
    root.userData.autoRigMeta = {
      rig_info: {
        rig_mode: 'creature_template',
        creature_template_id: 'fox',
        generation_method: 'mesh2motion_creature_template',
      },
    };

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 0.5, 0.3);
    const head = new THREE.Bone();
    head.name = 'Head';
    head.position.set(0, 0.55, -0.2);
    hips.add(head);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.8, 0.4, 1.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips, head]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    updateSkeletonDisplayCorrection(root);
    expect(root.userData.rigSkeletonDisplayFlipY).toBeUndefined();
  });

  it('never flips creature skeleton display even when rig faces glTF +Z', () => {
    const root = new THREE.Group();
    root.userData.preserveExportedOrientation = true;
    root.userData.autoRigMeta = {
      rig_info: {
        rig_mode: 'creature_template',
        generation_method: 'mesh2motion_creature_template',
      },
    };

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 0.5, 0);
    const head = new THREE.Bone();
    head.name = 'Head';
    head.position.set(0, 0.55, 0.8);
    hips.add(head);
    const frontL = new THREE.Bone();
    frontL.name = 'Front_Leg_Foot_L';
    frontL.position.set(-0.1, 0, 0.5);
    hips.add(frontL);
    const backL = new THREE.Bone();
    backL.name = 'Back_Leg_Foot_L';
    backL.position.set(-0.1, 0, -0.5);
    hips.add(backL);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.8, 0.4, 1.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips, head, frontL, backL]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    updateSkeletonDisplayCorrection(root);
    expect(root.userData.rigSkeletonDisplayFlipY).toBeUndefined();
  });

  it('yaws creature template root 180° when rig faces glTF -Z (Mesh2Motion is +Z)', () => {
    const root = new THREE.Group();
    root.userData.preserveExportedOrientation = true;
    root.userData.autoRigMeta = {
      rig_info: { rig_mode: 'creature_template', generation_method: 'mesh2motion_creature_template' },
    };

    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 0.5, 0.3);
    const head = new THREE.Bone();
    head.name = 'Head';
    // Nose toward -Z (common Blender/glTF export) — opposite Mesh2Motion +Z
    head.position.set(0, 0.55, -0.2);
    hips.add(head);
    root.add(hips);

    const geometry = new THREE.BoxGeometry(0.8, 0.4, 1.2);
    const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips, head]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    expect(ensureCreatureTemplateFacesForward(root)).toBe(true);
    root.updateMatrixWorld(true);
    const forward = head.getWorldPosition(new THREE.Vector3()).sub(
      hips.getWorldPosition(new THREE.Vector3()),
    );
    forward.y = 0;
    forward.normalize();
    expect(forward.dot(new THREE.Vector3(0, 0, 1))).toBeGreaterThan(0.5);
  });

  it('does not yaw creature template when already Mesh2Motion +Z forward', () => {
    const root = new THREE.Group();
    root.userData.autoRigMeta = {
      rig_info: { rig_mode: 'creature_template', generation_method: 'mesh2motion_creature_template' },
    };
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 0.5, 0);
    const head = new THREE.Bone();
    head.name = 'Head';
    head.position.set(0, 0.55, 0.8);
    hips.add(head);
    root.add(hips);
    const skinned = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(0.8, 0.4, 1.2),
      new THREE.MeshBasicMaterial(),
    );
    root.add(skinned);
    skinned.bind(new THREE.Skeleton([hips, head]), skinned.matrixWorld);
    root.updateMatrixWorld(true);

    expect(ensureCreatureTemplateFacesForward(root)).toBe(false);
  });
});
