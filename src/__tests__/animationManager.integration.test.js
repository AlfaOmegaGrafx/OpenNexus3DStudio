import { describe, expect, it, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { AnimationManager, applyVrmHumanoidPose } from '../library/animationManager.js';
import { getMixamoAnimation } from '../library/loadMixamoAnimation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const idleFbxPath = path.join(root, 'public', 'loot-assets', 'animations', '2_Idle.fbx');

function buildMockVrm(boneNames) {
  const nodes = {};
  for (const [humanoidName, sceneName] of Object.entries(boneNames)) {
    const node = new THREE.Object3D();
    node.name = sceneName;
    nodes[humanoidName] = node;
  }

  const hips = nodes.hips;
  const spine = nodes.spine;
  hips.add(spine);
  const scene = new THREE.Object3D();
  scene.add(hips);
  scene.updateMatrixWorld(true);

  let updateCalls = 0;
  return {
    scene,
    humanoid: {
      autoUpdateHumanBones: false,
      getNormalizedBoneNode: (name) => nodes[name] ?? null,
      getRawBoneNode: (name) => nodes[name] ?? null,
      update: vi.fn(() => {
        updateCalls += 1;
      }),
    },
    update: vi.fn(),
    meta: { metaVersion: '1' },
    _updateCalls: () => updateCalls,
  };
}

describe('AnimationManager integration', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applyVrmHumanoidPose calls humanoid.update and vrm.update', () => {
    const vrm = buildMockVrm({ hips: 'hips', spine: 'spine' });
    applyVrmHumanoidPose(vrm, 1 / 30);
    expect(vrm.humanoid.update).toHaveBeenCalled();
    expect(vrm.update).toHaveBeenCalled();
  });

  it('mixer update + humanoid pose advances normalized hips (Mixamo idle)', async () => {
    if (!fs.existsSync(idleFbxPath)) {
      return;
    }

    vi.useFakeTimers();

    const vrm = buildMockVrm({
      hips: 'hips',
      spine: 'spine',
      leftUpperLeg: 'leftUpperLeg',
      rightUpperLeg: 'rightUpperLeg',
      leftLowerLeg: 'leftLowerLeg',
      rightLowerLeg: 'rightLowerLeg',
      leftFoot: 'leftFoot',
      rightFoot: 'rightFoot',
      neck: 'neck',
      head: 'head',
      chest: 'chest',
      upperChest: 'upperChest',
      leftUpperArm: 'leftUpperArm',
      rightUpperArm: 'rightUpperArm',
      leftLowerArm: 'leftLowerArm',
      rightLowerArm: 'rightLowerArm',
      leftHand: 'leftHand',
      rightHand: 'rightHand',
    });
    vrm.humanoid.autoUpdateHumanBones = true;

    const loader = new FBXLoader();
    const fbxArrayBuffer = fs.readFileSync(idleFbxPath);
    const fbx = loader.parse(fbxArrayBuffer.buffer, 'idle.fbx');
    fbx.updateMatrixWorld(true);

    const clip = getMixamoAnimation(fbx.animations, fbx, vrm);
    expect(clip).not.toBeNull();
    expect(clip.tracks.length).toBeGreaterThan(0);

    const mixer = new THREE.AnimationMixer(vrm.scene);
    const action = mixer.clipAction(clip);
    action.play();

    const hips = vrm.humanoid.getNormalizedBoneNode('hips');
    const rotBefore = hips.rotation.x;

    for (let i = 0; i < 10; i += 1) {
      mixer.update(1 / 30);
      applyVrmHumanoidPose(vrm, 1 / 30);
    }

    expect(Math.abs(hips.rotation.x - rotBefore)).toBeGreaterThan(0.0001);

    const manager = new AnimationManager();
    manager.mixamoModel = fbx;
    manager.mixamoAnimations = fbx.animations;
    manager.mainControl = { actions: [{ time: 0 }] };
    manager.addVRM(vrm);

    const diag = manager.getPlaybackDiagnostics();
    expect(diag.vrmControlCount).toBe(1);
    expect(diag.vrmControls[0].trackCount).toBeGreaterThan(0);

    manager.dispose();
  }, 30000);
});
