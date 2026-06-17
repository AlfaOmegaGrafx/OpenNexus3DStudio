import { describe, it, expect } from 'vitest';
import {
  isBlenderExportedGltf,
  isDgxApiExportedGltf,
  isViewportExportedGltf,
  shouldPreserveExportedOrientation,
} from '../library/modelOrientationUtils.js';

describe('isViewportExportedGltf', () => {
  it('detects THREE.GLTFExporter generator from remote log exports', () => {
    expect(isViewportExportedGltf({ generator: 'THREE.GLTFExporter r180' })).toBe(true);
  });

  it('ignores Blender and other generators', () => {
    expect(
      isViewportExportedGltf({ generator: 'Khronos glTF Blender I/O v4.0.44' }),
    ).toBe(false);
  });

  it('handles missing asset', () => {
    expect(isViewportExportedGltf(null)).toBe(false);
    expect(isViewportExportedGltf(undefined)).toBe(false);
  });
});

describe('isBlenderExportedGltf', () => {
  it('detects Khronos glTF Blender I/O from DGX avatar-from-image GLBs', () => {
    const asset = { generator: 'Khronos glTF Blender I/O v4.0.44' };
    expect(isBlenderExportedGltf(asset)).toBe(true);
    expect(isDgxApiExportedGltf(asset)).toBe(true);
  });
});

describe('shouldPreserveExportedOrientation', () => {
  it('preserves avatar-from-image and template rig loads', () => {
    expect(
      shouldPreserveExportedOrientation({
        avatarFromImage: true,
        fromAigc: true,
      }),
    ).toBe(true);
    expect(
      shouldPreserveExportedOrientation({
        templateRig: true,
        autoRigMeta: { rig_info: { rig_mode: 'template' } },
      }),
    ).toBe(true);
  });

  it('preserves DGX Blender-exported skinned GLBs', () => {
    expect(
      shouldPreserveExportedOrientation(
        { fromAigc: true, autoRigMeta: { bone_count: 50 } },
        null,
        { generator: 'Khronos glTF Blender I/O v4.0.44' },
      ),
    ).toBe(true);
  });
});
