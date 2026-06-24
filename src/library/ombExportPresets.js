/**
 * OMB Spatial Fabric export / generation presets.
 * @see https://omb.wiki/en/spatial-fabric/model-guidelines
 */

import { OMB_TIER_LIMITS } from './spatialFabricAdapter.js';

export const OMB_GUIDELINES_URL =
  'https://omb.wiki/en/spatial-fabric/model-guidelines';

/** Typical concurrent visible instances per tier (OMB wiki). */
export const OMB_TIER_INSTANCE_COUNTS = {
  1: 200,
  2: 50,
  3: 10,
  4: 1,
  5: 1,
};

/**
 * @typedef {object} OmbExportPreset
 * @property {string} id
 * @property {number} tier
 * @property {string} label
 * @property {number} maxTriangles
 * @property {number} maxTexturePx
 * @property {number} instanceCount
 * @property {string} hint
 */

/** @type {OmbExportPreset[]} */
export const OMB_EXPORT_PRESETS = [1, 2, 3, 4, 5].map((tier) => {
  const limits = OMB_TIER_LIMITS[tier];
  const instances = OMB_TIER_INSTANCE_COUNTS[tier];
  return {
    id: `omb-tier-${tier}`,
    tier,
    label: limits.label,
    maxTriangles: limits.triangles,
    maxTexturePx: limits.texturePx,
    instanceCount: instances,
    hint: `≤${limits.triangles.toLocaleString()} triangles · ${limits.texturePx}px textures · ~${instances} visible instance${instances === 1 ? '' : 's'}`,
  };
});

/**
 * @param {string} [presetId]
 * @returns {OmbExportPreset|null}
 */
export function getOmbExportPresetById(presetId) {
  if (!presetId) return null;
  return OMB_EXPORT_PRESETS.find((preset) => preset.id === presetId) || null;
}

/**
 * Effective validation tier when PBR materials bump the budget (+1 tier, max 5).
 * @param {number} tier
 * @param {boolean} [usePbr]
 */
export function getOmbEffectiveTier(tier, usePbr = true) {
  const base = Math.max(1, Math.min(5, Number(tier) || 1));
  if (usePbr && base < 5) return base + 1;
  return base;
}

/**
 * Viewport GLB export options aligned to an OMB tier.
 * @param {string} presetId
 * @param {{ usePbr?: boolean, filename?: string }} [opts]
 */
export function buildOmbExportOptions(presetId, opts = {}) {
  const preset = getOmbExportPresetById(presetId);
  if (!preset) return null;
  const usePbr = opts.usePbr !== false;
  const effectiveTier = getOmbEffectiveTier(preset.tier, usePbr);
  return {
    compressGlb: true,
    optimize: true,
    includeTextures: true,
    ombTierPreset: presetId,
    ombUsePbr: usePbr,
    ombTargetTier: preset.tier,
    maxTextureSize: preset.maxTexturePx,
    compressPreset: preset.id,
    targetMaxTriangles: preset.maxTriangles,
    textureEdge: preset.maxTexturePx,
    compressQuality: 50,
    metadata: {
      omb_target_tier: preset.tier,
      omb_effective_tier: effectiveTier,
      omb_use_pbr: usePbr,
    },
    filename:
      opts.filename ||
      `omb-tier-${preset.tier}${usePbr ? '-pbr' : ''}-export.glb`,
  };
}

/**
 * @param {string} presetId
 * @param {boolean} [usePbr]
 */
export function getOmbPresetHint(presetId, usePbr = true) {
  const preset = getOmbExportPresetById(presetId);
  if (!preset) return '';
  const effective = getOmbEffectiveTier(preset.tier, usePbr);
  const limits = OMB_TIER_LIMITS[effective];
  return (
    `${preset.hint}. ` +
    `PBR ${usePbr ? 'on' : 'off'} → expect Tier ${effective} (${limits.label}) after validation.`
  );
}

/**
 * 3DAIGC task options that steer generation toward an OMB tier (best-effort).
 * @param {number} tier
 */
export function buildOmbTaskOptions(tier) {
  const safeTier = Math.max(1, Math.min(5, Number(tier) || 1));
  const limits = OMB_TIER_LIMITS[safeTier];
  const meshSimplify =
    safeTier <= 1 ? 0.5 : safeTier === 2 ? 0.62 : safeTier === 3 ? 0.75 : 0.92;
  return {
    texture_resolution: limits.texturePx,
    mesh_simplify: meshSimplify,
    model_parameters: {
      decimation_target: limits.triangles,
    },
  };
}
