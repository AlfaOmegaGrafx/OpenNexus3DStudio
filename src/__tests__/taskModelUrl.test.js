import { describe, it, expect } from 'vitest';
import {
  getTaskResultModelUrl,
  getTaskResultMeshUrl,
  getTaskResultFileExtension,
  getTaskResultFbxUrl,
  getAutoRigMetaFromResult,
  resolveTaskModelUrl,
  inferModelFileExtensionFromSource,
  buildJobDownloadUrl,
  extractJobProgress,
  maybeProxyApiAssetUrl,
  enrichCompletedJobPayload,
  normalizeTaskLoadPayload,
} from '../library/taskModelUrl.js';

describe('taskModelUrl', () => {
  it('getTaskResultMeshUrl prefers mesh paths over splat sidecars', () => {
    const url = getTaskResultMeshUrl({
      job_id: 'mesh-job',
      feature: 'image_to_textured_mesh',
      output_splat_path: '/outputs/preview.ply',
      output_mesh_path: '/outputs/model.glb',
    });
    expect(url).toBe('/outputs/model.glb');
  });

  it('getTaskResultMeshUrl falls back to job download for mesh jobs', () => {
    expect(getTaskResultMeshUrl({ job_id: 'abc-123', feature: 'auto_rig' })).toBe(
      '/api/v1/system/jobs/abc-123/download',
    );
  });

  it('getTaskResultFileExtension prefers mesh extension when both paths exist', () => {
    const ext = getTaskResultFileExtension(
      {
        output_splat_path: '/outputs/env.ply',
        output_mesh_path: '/outputs/model.glb',
        mesh_file_info: { file_extension: '.ply' },
      },
      { preferMesh: true },
    );
    expect(ext).toBe('glb');
  });

  it('extracts mesh_url and nested result paths', () => {
    expect(getTaskResultModelUrl({ modelUrl: '/a.glb' })).toBe('/a.glb');
    expect(getTaskResultModelUrl({ mesh_url: '/b.glb' })).toBe('/b.glb');
    expect(getTaskResultModelUrl({ result: { mesh_url: '/c.glb' } })).toBe('/c.glb');
    expect(getTaskResultModelUrl({ job_id: 'abc-123' })).toBe('/api/v1/system/jobs/abc-123/download');
    expect(getTaskResultModelUrl(null)).toBeNull();
  });

  it('prefixes relative paths with api endpoint', () => {
    expect(resolveTaskModelUrl('/outputs/foo.glb', 'http://192.168.1.10:7842')).toBe(
      'http://192.168.1.10:7842/outputs/foo.glb',
    );
    expect(resolveTaskModelUrl('https://cdn.example/m.glb', 'http://local')).toBe(
      'https://cdn.example/m.glb',
    );
  });

  it('detects glb for DGX job download URLs (hostname with dots)', () => {
    const url =
      'http://dgx-spark.local:7842/api/v1/system/jobs/f51628ad-f2a6-4703-b621-cd2def5cf4c6/download';
    expect(inferModelFileExtensionFromSource(url)).toBe('glb');
  });

  it('getTaskResultFbxUrl prefers job download with asset=fbx', () => {
    expect(getTaskResultFbxUrl({ job_id: 'rig-job-1' })).toBe(
      '/api/v1/system/jobs/rig-job-1/download?asset=fbx',
    );
  });

  it('getTaskResultFbxUrl derives path from output_fbx_path or glb sibling', () => {
    expect(
      getTaskResultFbxUrl({
        output_fbx_path: '/outputs/rigged/model.fbx',
      }),
    ).toBe('/outputs/rigged/model.fbx');
    expect(
      getTaskResultFbxUrl({
        output_mesh_path: '/outputs/rigged/model.glb',
      }),
    ).toBe('/outputs/rigged/model.fbx');
  });

  it('getAutoRigMetaFromResult reads bone_count from nested result', () => {
    const meta = getAutoRigMetaFromResult({
      job_id: 'j1',
      result: { bone_count: 20, rig_info: { rig_mode: 'skeleton' } },
    });
    expect(meta.bone_count).toBe(20);
    expect(meta.job_id).toBe('j1');
    expect(meta.rig_info.rig_mode).toBe('skeleton');
  });

  it('detects fbx for job download with asset=fbx query', () => {
    const url =
      'http://dgx-spark.local:7842/api/v1/system/jobs/abc/download?asset=fbx';
    expect(inferModelFileExtensionFromSource(url)).toBe('fbx');
  });

  it('buildJobDownloadUrl falls back to standard download path', () => {
    const url = buildJobDownloadUrl({ status: 'completed' }, 'job-1', 'http://dgx:7842');
    expect(url).toBe('http://dgx:7842/api/v1/system/jobs/job-1/download');
  });

  it('extractJobProgress parses percent from API message', () => {
    const { percent, indeterminate } = extractJobProgress({
      status: 'processing',
      progress: 0,
      message: 'Texturing mesh 67%',
    });
    expect(percent).toBe(67);
    expect(indeterminate).toBe(false);
  });

  it('extractJobProgress uses API progress 0.0–1.0 scale', () => {
    const { percent, indeterminate } = extractJobProgress({
      status: 'processing',
      progress: 0.42,
      message: 'Texturing',
    });
    expect(percent).toBe(42);
    expect(indeterminate).toBe(false);
  });

  it('extractJobProgress is indeterminate when processing with progress 0', () => {
    const { percent, indeterminate } = extractJobProgress({
      status: 'processing',
      progress: 0,
    });
    expect(percent).toBeNull();
    expect(indeterminate).toBe(true);
  });

  it('extractJobProgress returns 100% when completed', () => {
    const { percent, indeterminate } = extractJobProgress({
      status: 'completed',
      progress: 1,
    });
    expect(percent).toBe(100);
    expect(indeterminate).toBe(false);
  });

  it('extractJobProgress returns 100% when completed with progress 1.0', () => {
    const { percent } = extractJobProgress({ status: 'completed', progress: 1.0 });
    expect(percent).toBe(100);
  });

  it('enrichCompletedJobPayload promotes nested result URLs to top level', () => {
    const enriched = enrichCompletedJobPayload(
      {
        job_id: '07da4284-e8be-4aca-938a-d5e4f9777582',
        feature: 'image_to_world',
        status: 'completed',
        result: {
          feature: 'image_to_world',
          mesh_url: 'http://127.0.0.1:7842/api/v1/system/jobs/07da4284-e8be-4aca-938a-d5e4f9777582/download',
          world_manifest_url:
            '/api/v1/system/jobs/07da4284-e8be-4aca-938a-d5e4f9777582/download?asset=manifest',
          world_base_url: '/api/v1/system/jobs/07da4284-e8be-4aca-938a-d5e4f9777582/world/',
          mesh_file_info: { file_extension: '.ply' },
        },
      },
      '07da4284-e8be-4aca-938a-d5e4f9777582',
      'image-to-world',
    );
    expect(enriched.mesh_url).toContain('/download');
    expect(enriched.world_manifest_url).toContain('asset=manifest');
    expect(enriched.pipelineStage).toBe('world_package');
    expect(getTaskResultModelUrl(enriched)).toContain('/download');
  });

  it('normalizeTaskLoadPayload merges synced task row for load handlers', () => {
    const payload = normalizeTaskLoadPayload({
      id: 'job_4fcf2cef-d4c0-4286-84d1-fc0b60e78b92',
      type: 'auto-rigging',
      job_id: '4fcf2cef-d4c0-4286-84d1-fc0b60e78b92',
      result: {
        job_id: '4fcf2cef-d4c0-4286-84d1-fc0b60e78b92',
        feature: 'auto_rig',
        result: {
          mesh_url: 'http://127.0.0.1:7842/api/v1/system/jobs/4fcf2cef-d4c0-4286-84d1-fc0b60e78b92/download',
          mesh_file_info: { file_extension: '.glb' },
        },
      },
    });
    expect(payload.mesh_url).toContain('/download');
    expect(getTaskResultFileExtension(payload)).toBe('glb');
  });

  it('maybeProxyApiAssetUrl rewrites cross-origin API paths in dev', () => {
    const original = globalThis.window;
    globalThis.window = { location: { origin: 'https://10.0.0.32:3000' } };
    try {
      const out = maybeProxyApiAssetUrl(
        'http://dgx-spark.local:7842/api/v1/system/jobs/x/download',
      );
      expect(out).toBe(
        'https://10.0.0.32:3000/__dev_dgx_proxy/api/v1/system/jobs/x/download',
      );
    } finally {
      globalThis.window = original;
    }
  });
});
