import { describe, it, expect } from 'vitest';
import {
  XR_ANDROID_FACE_PARAMETER_COUNT,
  OPENXR_ANDROID_FACE_PARAMETER_WEBXR_KEYS,
  openxrFloatParametersToWebXRRecord
} from '../library/openxrFaceParameterMap.js';

describe('openxrFaceParameterMap', () => {
  it('exports 68 keys aligned with Khronos enum order', () => {
    expect(XR_ANDROID_FACE_PARAMETER_COUNT).toBe(68);
    expect(OPENXR_ANDROID_FACE_PARAMETER_WEBXR_KEYS.length).toBe(68);
    expect(OPENXR_ANDROID_FACE_PARAMETER_WEBXR_KEYS[24]).toBe('jaw_drop');
    expect(OPENXR_ANDROID_FACE_PARAMETER_WEBXR_KEYS[12]).toBe('eyes_closed_left');
  });

  it('openxrFloatParametersToWebXRRecord maps jaw_drop index', () => {
    const arr = new Array(68).fill(0);
    arr[24] = 0.88;
    const rec = openxrFloatParametersToWebXRRecord(arr);
    expect(rec.jaw_drop).toBeCloseTo(0.88);
    expect(Object.keys(rec).length).toBe(1);
  });

  it('caps length to 68 and skips NaN', () => {
    const arr = new Array(100).fill(0);
    arr[24] = 0.5;
    arr[0] = Number.NaN;
    const rec = openxrFloatParametersToWebXRRecord(arr);
    expect(rec.brow_lowerer_left).toBeUndefined();
    expect(rec.jaw_drop).toBeCloseTo(0.5);
  });

  it('includeZero keeps zeros when requested', () => {
    const arr = [0, 0, 0.2];
    const rec = openxrFloatParametersToWebXRRecord(arr, { includeZero: true });
    expect(rec.brow_lowerer_left).toBe(0);
    expect(rec.cheek_puff_left).toBeCloseTo(0.2);
  });
});
