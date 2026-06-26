import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  quaternionAngularErrorDeg,
  sampleClipLocalQuaternionsInterp,
  compareClipToActualPose,
  auditStudioMotionResolution,
} from '../library/bonePlaybackDiagnostics.js';

describe('bonePlaybackDiagnostics', () => {
  it('quaternionAngularErrorDeg is 0 for identical quats', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, -0.3, 0.1));
    expect(quaternionAngularErrorDeg(q, q.clone())).toBe(0);
  });

  it('quaternionAngularErrorDeg increases for different rotations', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
    const rotated = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    expect(quaternionAngularErrorDeg(q, rotated)).toBeCloseTo(90, 0);
  });

  it('sampleClipLocalQuaternionsInterp interpolates between keys', () => {
    const track = new THREE.QuaternionKeyframeTrack(
      'Hips.quaternion',
      [0, 1],
      [0, 0, 0, 1, 0, 0.707, 0, 0.707],
    );
    const clip = new THREE.AnimationClip('test', 1, [track]);
    const at0 = sampleClipLocalQuaternionsInterp(clip, 0).get('Hips');
    const at05 = sampleClipLocalQuaternionsInterp(clip, 0.5).get('Hips');
    const at1 = sampleClipLocalQuaternionsInterp(clip, 1).get('Hips');
    expect(at0?.w).toBeCloseTo(1, 3);
    expect(at1?.y).toBeCloseTo(0.707, 2);
    expect(at05?.y).toBeGreaterThan(0);
    expect(at05?.y).toBeLessThan(0.707);
  });

  it('compareClipToActualPose flags large mismatch', () => {
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    const rig = new THREE.Group();
    rig.add(hips);

    const track = new THREE.QuaternionKeyframeTrack(
      'Hips.quaternion',
      [0],
      [0, 0.5, 0, 0.866],
    );
    const clip = new THREE.AnimationClip('walk', 1, [track]);
    hips.quaternion.set(0, 0, 0, 1);

    const report = compareClipToActualPose({
      clip,
      time: 0,
      rigRoot: rig,
      humanoidBones: ['hips'],
    });

    const hipsRow = report.rows.find((r) => r.humanoidBone === 'hips');
    expect(hipsRow?.errorDeg).toBeGreaterThan(25);
    expect(hipsRow?.status).toBe('misbehaving');
  });

  it('auditStudioMotionResolution lists unresolved motion bones on empty rig', () => {
    const rig = new THREE.Group();
    const motion = {
      name: 'kimodo',
      tracks: [{ bone: 'leftUpperArm' }, { bone: 'hips' }],
    };
    const audit = auditStudioMotionResolution(motion, { rigRoot: rig });
    expect(audit.resolvedCount).toBe(0);
    expect(audit.unresolved).toHaveLength(2);
  });
});
