import { describe, expect, it } from 'vitest';
import * as THREE from '../library/three.js';
import {
  anchorModelFeetToFloor,
  getCreaturePawWorldMinY,
  getSkinnedDisplayWorldBounds,
  needsSkinnedMeshRigRepair,
} from '../library/rigBoneUtils.js';
import {
  retargetCreatureClip,
  isCreatureSoftAppendageBone,
  getCreaturePoseDeltaScale,
  isNearlyConstantQuatTrack,
  repairStaticCreatureTipTracks,
} from '../library/creatureAnimations.js';

function makeCreatureRig({ pawY = -0.4, bellyMinY = -0.15 } = {}) {
  const root = new THREE.Group();
  root.userData.autoRigMeta = {
    rig_info: {
      rig_mode: 'creature_template',
      creature_template_id: 'fox',
      generation_method: 'mesh2motion_creature_template',
    },
  };

  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.set(0, 0.5, 0);
  root.add(hips);

  const paws = [
    ['Front_Leg_Foot_L', -0.15, 0.2],
    ['Front_Leg_Foot_R', 0.15, 0.2],
    ['Back_Leg_Foot_L', -0.15, -0.25],
    ['Back_Leg_Foot_R', 0.15, -0.25],
  ];
  for (const [name, x, z] of paws) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(x, pawY, z);
    root.add(bone);
  }

  const height = 0.8;
  const geometry = new THREE.BoxGeometry(0.5, height, 0.9);
  const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  skinned.position.set(0, bellyMinY + height / 2, 0);
  const skeletonBones = [hips, ...root.children.filter((c) => c.isBone && c !== hips)];
  const skeleton = new THREE.Skeleton(skeletonBones);
  skinned.bind(skeleton, skinned.matrixWorld);
  root.add(skinned);
  root.updateMatrixWorld(true);
  return { root, skinned };
}

describe('creature floor grounding', () => {
  it('does not request humanoid skinned-mesh repair for creature templates', () => {
    const { root } = makeCreatureRig();
    expect(needsSkinnedMeshRigRepair(root)).toBe(false);
  });

  it('reads paw tip height for creature templates', () => {
    const { root } = makeCreatureRig({ pawY: -0.55 });
    expect(getCreaturePawWorldMinY(root)).toBeCloseTo(-0.55, 2);
  });

  it('anchors using the lower of mesh and paw Y so the fox does not sit mid-floor', () => {
    const { root, skinned } = makeCreatureRig({ pawY: -0.55, bellyMinY: -0.15 });
    const shift = anchorModelFeetToFloor(root);
    expect(shift).toBeGreaterThan(0.5);
    root.updateMatrixWorld(true);
    const pawY = getCreaturePawWorldMinY(root);
    expect(pawY).toBeCloseTo(0, 1);
    skinned.geometry.computeBoundingBox();
    const meshBox = skinned.geometry.boundingBox.clone();
    meshBox.applyMatrix4(skinned.matrixWorld);
    expect(meshBox.min.y).toBeGreaterThanOrEqual(-0.05);
  });

  it('keeps mesh and bones together after floor snap (no rebind desync)', () => {
    const { root, skinned } = makeCreatureRig({ pawY: -0.4, bellyMinY: -0.4 });
    root.updateMatrixWorld(true);
    skinned.skeleton?.update();
    const beforeMesh = getSkinnedDisplayWorldBounds(skinned).min.y;
    const beforePaw = getCreaturePawWorldMinY(root);
    const beforeDelta = beforeMesh - beforePaw;

    anchorModelFeetToFloor(root);
    root.updateMatrixWorld(true);
    skinned.skeleton?.update();
    const afterMesh = getSkinnedDisplayWorldBounds(skinned).min.y;
    const afterPaw = getCreaturePawWorldMinY(root);
    expect(afterPaw).toBeCloseTo(0, 1);
    expect(afterMesh - afterPaw).toBeCloseTo(beforeDelta, 2);
  });
});

describe('retargetCreatureClip', () => {
  it('drops bone scale and converts root location to in-place deltas', () => {
    const clip = new THREE.AnimationClip('Walk', 1, [
      new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [1, 2, 3, 1.5, 2.5, 4]),
      new THREE.VectorKeyframeTrack('Spine_1.position', [0, 1], [0, 0.2, 0, 0, 0.2, 0]),
      new THREE.VectorKeyframeTrack('Hips.scale', [0, 1], [1, 1, 1, 2, 2, 2]),
      new THREE.QuaternionKeyframeTrack(
        'Spine_1.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0, 0, 0, 1],
      ),
    ]);
    const next = retargetCreatureClip(clip, 0.5);
    const names = next.tracks.map((t) => t.name);
    expect(names).toContain('Hips.position');
    expect(names).toContain('Spine_1.quaternion');
    expect(names).not.toContain('Spine_1.position');
    expect(names).not.toContain('Hips.scale');
    const hipsPos = next.tracks.find((t) => t.name === 'Hips.position');
    expect(hipsPos.values[0]).toBeCloseTo(0, 5);
    expect(hipsPos.values[1]).toBeCloseTo(0, 5);
    expect(hipsPos.values[2]).toBeCloseTo(0, 5);
    expect(hipsPos.values[3]).toBeCloseTo(0.25, 5);
    expect(hipsPos.values[4]).toBeCloseTo(0, 5);
    expect(hipsPos.values[5]).toBeCloseTo(0.5, 5);
  });

  it('applies bind-relative pose onto fitted rest (not first-key deltas)', () => {
    // Source rest = identity. Anim key0 already 40° into stride; key1 = 70°.
    // First-key deltas would only apply 30°; bind-relative applies full 70° onto target.
    const q40 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (40 * Math.PI) / 180);
    const q70 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (70 * Math.PI) / 180);
    const clip = new THREE.AnimationClip('Walk', 1, [
      new THREE.QuaternionKeyframeTrack('Front_Leg_Lower_L.quaternion', [0, 1], [
        q40.x, q40.y, q40.z, q40.w,
        q70.x, q70.y, q70.z, q70.w,
      ]),
    ]);
    const sourceRest = new Map([['Front_Leg_Lower_L', new THREE.Quaternion()]]);
    const targetRest = new Map([['Front_Leg_Lower_L', new THREE.Quaternion()]]);
    const next = retargetCreatureClip(clip, 1, sourceRest, targetRest);
    const track = next.tracks.find((t) => t.name === 'Front_Leg_Lower_L.quaternion');
    const out0 = new THREE.Quaternion().fromArray(track.values, 0);
    const out1 = new THREE.Quaternion().fromArray(track.values, 4);
    expect(out0.angleTo(new THREE.Quaternion())).toBeCloseTo((40 * Math.PI) / 180, 5);
    expect(out1.angleTo(new THREE.Quaternion())).toBeCloseTo((70 * Math.PI) / 180, 5);
  });

  it('freezes only *.end helpers — never Tail_End mid-chain', () => {
    expect(isCreatureSoftAppendageBone('Tail_Tip.end')).toBe(true);
    expect(isCreatureSoftAppendageBone('Tail_End')).toBe(false);
    expect(isCreatureSoftAppendageBone('Tail_Tip')).toBe(false);
    expect(isCreatureSoftAppendageBone('Front_Leg_Tip_L')).toBe(false);
  });

  it('damps soft chains and keeps Walk legs at full scale', () => {
    expect(getCreaturePoseDeltaScale('Ear_L', 'Walk')).toBeLessThan(0.2);
    expect(getCreaturePoseDeltaScale('Tail_Mid', 'Idle Alert')).toBeLessThan(0.3);
    expect(getCreaturePoseDeltaScale('Spine_3', 'Howl')).toBeLessThan(0.4);
    expect(getCreaturePoseDeltaScale('Front_Leg_Upper_L', 'Walk')).toBe(1);
    expect(getCreaturePoseDeltaScale('Front_Leg_Upper_L', 'Fall')).toBe(1);
    expect(getCreaturePoseDeltaScale('Front_Leg_Upper_L', 'Death')).toBeLessThan(0.5);
  });

  it('repairs static Tail_Tip so it inherits Tail_End motion', () => {
    const qEnd1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
    const clip = new THREE.AnimationClip('Sit', 1, [
      new THREE.QuaternionKeyframeTrack(
        'Tail_End.quaternion',
        [0, 1],
        [0, 0, 0, 1, qEnd1.x, qEnd1.y, qEnd1.z, qEnd1.w],
      ),
      new THREE.QuaternionKeyframeTrack('Tail_Tip.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    expect(isNearlyConstantQuatTrack(clip.tracks[1])).toBe(true);
    const sourceRest = new Map([
      ['Tail_End', new THREE.Quaternion()],
      ['Tail_Tip', new THREE.Quaternion()],
    ]);
    repairStaticCreatureTipTracks(clip, sourceRest);
    const tip = clip.tracks.find((t) => t.name === 'Tail_Tip.quaternion');
    expect(isNearlyConstantQuatTrack(tip)).toBe(false);
    const tip1 = new THREE.Quaternion().fromArray(tip.values, 4);
    expect(tip1.angleTo(new THREE.Quaternion())).toBeCloseTo(0.3, 5);
  });

  it('keeps retargeted quaternions on the short hemisphere', () => {
    const clip = new THREE.AnimationClip('Idle', 1, [
      new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [
        0, 0, 0, 1,
        0, 0, 0, -1,
      ]),
    ]);
    const sourceRest = new Map([['Hips', new THREE.Quaternion(0, 0, 0, 1)]]);
    const targetRest = new Map([['Hips', new THREE.Quaternion(0, 0, 0, 1)]]);
    const next = retargetCreatureClip(clip, 1, sourceRest, targetRest);
    const track = next.tracks.find((t) => t.name === 'Hips.quaternion');
    const q0 = new THREE.Quaternion().fromArray(track.values, 0);
    const q1 = new THREE.Quaternion().fromArray(track.values, 4);
    expect(q0.dot(q1)).toBeGreaterThan(0);
  });
});
