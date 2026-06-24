import { describe, expect, it } from 'vitest';
import {
  buildWorldManifestFetchCandidates,
  inferWorldAssetBaseUrlFromManifestUrl,
  isFullWorldPackageTaskResult,
  isSplatEnvironmentTaskResult,
  isWorldLayerTaskResult,
  listWorldsFromCompletedTasks,
  parseWorldPackage,
  resolveWorldAssetUrl,
  resolveWorldPackageUrls,
} from '../library/worldPackage.js';

describe('worldPackage', () => {
  it('parses a minimal manifest', () => {
    const manifest = parseWorldPackage({
      id: 'test-world',
      environment: { url: 'environment.ply' },
      props: [{ id: 'lamp', mesh_url: 'props/lamp.glb' }],
    });
    expect(manifest.id).toBe('test-world');
    expect(manifest.environment.format).toBe('ply');
    expect(manifest.props).toHaveLength(1);
  });

  it('resolves relative asset URLs against manifest base', () => {
    const url = resolveWorldAssetUrl(
      'https://example.com/worlds/demo/world.manifest.json',
      'environment.ply',
    );
    expect(url).toBe('https://example.com/worlds/demo/environment.ply');
  });

  it('infers world asset base from job manifest download URL', () => {
    expect(
      inferWorldAssetBaseUrlFromManifestUrl(
        '/api/v1/system/jobs/07da4284-e8be-4aca-938a-d5e4f9777582/download?asset=manifest',
      ),
    ).toBe('/api/v1/system/jobs/07da4284-e8be-4aca-938a-d5e4f9777582/world/');
  });

  it('resolveWorldPackageUrls infers world base when worldBaseUrl is omitted', () => {
    const manifest = parseWorldPackage({
      id: 'w1',
      environment: { url: 'environment.ply' },
      props: [],
    });
    const resolved = resolveWorldPackageUrls(
      manifest,
      'https://api.test/api/v1/system/jobs/job1/download?asset=manifest',
      'https://api.test',
    );
    expect(resolved.environment.url).toContain('/api/v1/system/jobs/job1/world/environment.ply');
  });

  it('resolveWorldPackageUrls uses worldBaseUrl when provided', () => {
    const manifest = parseWorldPackage({
      id: 'w1',
      environment: { url: 'environment.ply' },
      props: [],
    });
    const resolved = resolveWorldPackageUrls(
      manifest,
      'https://api.test/api/v1/system/jobs/job1/download?asset=manifest',
      'https://api.test',
      { worldBaseUrl: '/api/v1/system/jobs/job1/world/' },
    );
    expect(resolved.environment.url).toContain('/api/v1/system/jobs/job1/world/environment.ply');
  });

  it('isWorldLayerTaskResult detects world pipeline results', () => {
    expect(isWorldLayerTaskResult({ pipelineStage: 'world_package' })).toBe(true);
    expect(isWorldLayerTaskResult({ feature: 'image_to_world' })).toBe(true);
    expect(isWorldLayerTaskResult({ feature: 'auto_rig' })).toBe(false);
  });

  it('isSplatEnvironmentTaskResult detects splat-only jobs without manifest', () => {
    expect(isSplatEnvironmentTaskResult({ feature: 'image_to_splat', modelUrl: '/a.ply' })).toBe(
      true,
    );
    expect(isSplatEnvironmentTaskResult({ pipelineStage: 'splat_preview', modelUrl: '/a.ply' })).toBe(
      true,
    );
    expect(
      isSplatEnvironmentTaskResult({
        feature: 'image_to_world',
        world_manifest_url: '/manifest.json',
      }),
    ).toBe(false);
  });

  it('isFullWorldPackageTaskResult requires manifest or world feature', () => {
    expect(isFullWorldPackageTaskResult({ feature: 'image_to_world' })).toBe(true);
    expect(isFullWorldPackageTaskResult({ pipelineStage: 'world_package' })).toBe(true);
    expect(isFullWorldPackageTaskResult({ feature: 'image_to_splat', modelUrl: '/a.ply' })).toBe(
      false,
    );
  });

  it('listWorldsFromCompletedTasks builds entries from completed world jobs', () => {
    const worlds = listWorldsFromCompletedTasks(
      [
        {
          id: 'job_abc',
          job_id: 'abc',
          status: 'completed',
          type: 'image-to-world',
          name: 'Forest scene',
          result: { feature: 'image_to_world', job_id: 'abc' },
        },
        { id: 'job_fail', status: 'failed', type: 'image-to-world' },
      ],
      '/__dev_dgx_proxy',
    );
    expect(worlds).toHaveLength(1);
    expect(worlds[0].name).toBe('Forest scene');
    expect(worlds[0].manifest).toContain('/api/v1/system/jobs/abc/download?asset=manifest');
  });

  it('buildWorldManifestFetchCandidates includes world.manifest.json fallback', () => {
    const urls = buildWorldManifestFetchCandidates(
      '/api/v1/system/jobs/abc-123/download?asset=manifest',
      '/__dev_dgx_proxy',
    );
    expect(urls.some((u) => u.includes('world.manifest.json'))).toBe(true);
    expect(urls.some((u) => u.includes('asset=manifest'))).toBe(true);
  });
});
