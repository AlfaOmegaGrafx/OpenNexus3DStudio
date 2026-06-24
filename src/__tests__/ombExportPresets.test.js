import { describe, expect, it } from 'vitest';
import {
  OMB_EXPORT_PRESETS,
  buildOmbExportOptions,
  buildOmbTaskOptions,
  getOmbEffectiveTier,
  getOmbExportPresetById,
  getOmbPresetHint,
} from '../library/ombExportPresets.js';
import { resolveCompressProfile } from '../library/glbCompressPresets.js';

describe('ombExportPresets', () => {
  it('defines five OMB tiers aligned with spatial fabric limits', () => {
    expect(OMB_EXPORT_PRESETS).toHaveLength(5);
    expect(OMB_EXPORT_PRESETS[0]).toMatchObject({
      tier: 1,
      maxTriangles: 500,
      maxTexturePx: 64,
      instanceCount: 200,
    });
    expect(OMB_EXPORT_PRESETS[4]).toMatchObject({
      tier: 5,
      maxTriangles: 150000,
      maxTexturePx: 2048,
    });
  });

  it('buildOmbExportOptions caps compression for tier 2', () => {
    const opts = buildOmbExportOptions('omb-tier-2', { usePbr: false });
    expect(opts).toMatchObject({
      compressGlb: true,
      targetMaxTriangles: 2000,
      textureEdge: 128,
      maxTextureSize: 128,
      ombTargetTier: 2,
    });
  });

  it('getOmbEffectiveTier bumps tier when PBR is enabled', () => {
    expect(getOmbEffectiveTier(2, true)).toBe(3);
    expect(getOmbEffectiveTier(2, false)).toBe(2);
    expect(getOmbEffectiveTier(5, true)).toBe(5);
  });

  it('getOmbPresetHint mentions effective tier', () => {
    const hint = getOmbPresetHint('omb-tier-1', true);
    expect(hint).toContain('Tier 2');
  });

  it('buildOmbTaskOptions sets generation decimation and textures', () => {
    const opts = buildOmbTaskOptions(3);
    expect(opts.texture_resolution).toBe(256);
    expect(opts.model_parameters.decimation_target).toBe(10000);
    expect(opts.mesh_simplify).toBeLessThan(0.8);
  });

  it('resolveCompressProfile honors OMB target triangles', () => {
    const profile = resolveCompressProfile({
      preset: 'omb-tier-1',
      targetMaxTriangles: 500,
      textureEdge: 64,
    });
    expect(profile.targetMaxTriangles).toBe(500);
    expect(profile.textureEdge).toBe(64);
    expect(getOmbExportPresetById('omb-tier-4')?.maxTriangles).toBe(150000);
  });
});
