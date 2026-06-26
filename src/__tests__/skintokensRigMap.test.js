import { describe, expect, it } from 'vitest';
import { humanoidBoneToSkinTokensBone, mixamoRigNameToSkinTokensBone } from '../library/skintokensRigMap.js';

describe('skintokensRigMap', () => {
  it('maps core Mixamo bones to indexed SkinTokens joints', () => {
    expect(mixamoRigNameToSkinTokensBone('mixamorigHips')).toBe('bone_0');
    expect(mixamoRigNameToSkinTokensBone('mixamorigLeftArm')).toBe('bone_26');
    expect(mixamoRigNameToSkinTokensBone('mixamorigRightArm')).toBe('bone_7');
    expect(mixamoRigNameToSkinTokensBone('mixamorigRightToeBase')).toBe('bone_47');
  });

  it('maps VRM humanoid keys through Mixamo', () => {
    expect(humanoidBoneToSkinTokensBone('hips')).toBe('bone_0');
    expect(humanoidBoneToSkinTokensBone('leftUpperArm')).toBe('bone_26');
    expect(humanoidBoneToSkinTokensBone('rightFoot')).toBe('bone_46');
  });
});
