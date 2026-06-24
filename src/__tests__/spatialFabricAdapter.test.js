import { describe, expect, it } from 'vitest';
import {
  buildMetaverseBrowserUrl,
  buildSceneAssemblerOpenUrl,
  canPublishTaskToSpatialFabric,
  deriveSceneAssemblerRootFromMsfUrl,
  formatSpatialFabricApiError,
  getOmbGuidelinesUrl,
  isFabricMsfFileUrl,
  isSceneAssemblerConfigured,
  mergeSpatialFabricConfig,
  normalizeOmbTier,
  validateOmbTier,
} from '../library/spatialFabricAdapter.js';

describe('spatialFabricAdapter', () => {
  it('deriveSceneAssemblerRootFromMsfUrl strips fabric file path', () => {
    expect(
      deriveSceneAssemblerRootFromMsfUrl('https://dgx-spark.tail6121eb.ts.net/fabric/sample.msf'),
    ).toBe('https://dgx-spark.tail6121eb.ts.net');
  });

  it('buildSceneAssemblerOpenUrl never returns raw .msf', () => {
    const url = buildSceneAssemblerOpenUrl({
      fabricMsfUrl: 'https://example.com/fabric/demo.msf',
    });
    expect(url).toBe('https://example.com');
    expect(isFabricMsfFileUrl(url)).toBe(false);
  });

  it('mergeSpatialFabricConfig derives public URL from fabric when missing', () => {
    const merged = mergeSpatialFabricConfig({
      enabled: true,
      fabric_msf_url: 'https://dgx.example.com/fabric/sample.msf',
    });
    expect(merged.msfPublicUrl).toBe('https://dgx.example.com');
    expect(merged.fabricMsfUrl).toBe('https://dgx.example.com/fabric/sample.msf');
  });

  it('normalizeOmbTier maps API snake_case', () => {
    const norm = normalizeOmbTier({ recommended_tier: 2, label: 'Tier 2 Medium' });
    expect(norm.recommendedTier).toBe(2);
    expect(norm.label).toBe('Tier 2 Medium');
  });

  it('validateOmbTier assigns tier from triangle count', () => {
    const tier = validateOmbTier({ triangles: 1000, textureMaxDimension: 64 });
    expect(tier.recommendedTier).toBeGreaterThanOrEqual(1);
    expect(tier.label).toBeTruthy();
  });

  it('buildMetaverseBrowserUrl falls back to OMB guidelines when MSF URL unset', () => {
    const url = buildSceneAssemblerOpenUrl({});
    expect(url).toBe('');
    expect(getOmbGuidelinesUrl({})).toContain('omb.wiki');
  });

  it('isSceneAssemblerConfigured is false without MSF URL', () => {
    expect(isSceneAssemblerConfigured({})).toBe(false);
    expect(isSceneAssemblerConfigured(null)).toBe(false);
    expect(
      isSceneAssemblerConfigured({
        fabricMsfUrl: 'https://example.com/fabric/demo.msf',
      }),
    ).toBe(true);
  });

  it('formatSpatialFabricApiError maps job-not-found 404', () => {
    const msg = formatSpatialFabricApiError(
      { status: 404 },
      { detail: 'Job not found' },
      'Publish to spatial fabric',
    );
    expect(msg).toContain('job not found on 3DAIGC-API');
    expect(msg).not.toContain('spatial-fabric API not loaded');
  });

  it('canPublishTaskToSpatialFabric rejects splat/ply mesh paths', () => {
    const task = { status: 'completed' };
    expect(
      canPublishTaskToSpatialFabric(task, {}, {
        hasMesh: true,
        meshUrl: '/home/sifr/outputs/worlds/job/environment.ply',
      }),
    ).toBe(false);
    expect(
      canPublishTaskToSpatialFabric(task, {}, {
        hasMesh: true,
        meshUrl: '/api/v1/system/jobs/x/download?asset=model.glb',
        isFullWorld: true,
      }),
    ).toBe(false);
    expect(
      canPublishTaskToSpatialFabric(task, {}, {
        hasMesh: true,
        meshUrl: '/api/v1/system/jobs/x/download',
      }),
    ).toBe(true);
  });
});
