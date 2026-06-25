import { describe, it, expect, beforeEach } from 'vitest';
import {
  inferMediaPipeFaceWeightRecord,
  resetWebcamFaceNeutralBaseline,
} from '../library/webcamFaceWeightInference.js';

function makeLm(n = 478) {
  const lm = Array.from({ length: n }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[13] = { x: 0.5, y: 0.48, z: 0 };
  lm[14] = { x: 0.5, y: 0.52, z: 0 };
  lm[61] = { x: 0.42, y: 0.46, z: 0 };
  lm[291] = { x: 0.58, y: 0.46, z: 0 };
  lm[133] = { x: 0.45, y: 0.4, z: 0 };
  lm[362] = { x: 0.55, y: 0.4, z: 0 };
  return lm;
}

function faceRig() {
  return {
    eye: { l: 0.95, r: 0.95 },
    brow: 0.05,
    mouth: { y: 0.2, shape: {} },
    pupil: { x: 0, y: 0 },
  };
}

describe('inferMediaPipeFaceWeightRecord', () => {
  beforeEach(() => {
    resetWebcamFaceNeutralBaseline();
  });

  it('returns empty during neutral capture window', () => {
    const lm = makeLm();
    expect(inferMediaPipeFaceWeightRecord(lm, faceRig())).toEqual({});
  });

  it('neutral face has low smile after calibration', () => {
    const lm = makeLm();
    const rig = faceRig();
    for (let i = 0; i < 30; i++) inferMediaPipeFaceWeightRecord(lm, rig);
    const rec = inferMediaPipeFaceWeightRecord(lm, rig);
    expect(rec.lip_corner_puller_left ?? 0).toBeLessThan(0.15);
    expect(rec.lip_corner_puller_right ?? 0).toBeLessThan(0.15);
  });

  it('returns empty object when landmarks are missing', () => {
    expect(inferMediaPipeFaceWeightRecord(null, null)).toEqual({});
  });
});
