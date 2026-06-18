import { describe, expect, it } from 'vitest';
import { extractVrmSummaryFromGltf, parseGlbJsonChunk } from '../library/vrmTemplateMetadata.js';

describe('vrmTemplateMetadata', () => {
  it('extractVrmSummaryFromGltf reads VRM 0.x presets', () => {
    const summary = extractVrmSummaryFromGltf({
      extensions: {
        VRM: {
          meta: { title: 'Test' },
          humanoid: { humanBones: { hips: {}, head: {} } },
          blendShapeMaster: {
            blendShapeGroups: [{ name: 'blink' }, { name: 'happy' }],
          },
        },
      },
    });
    expect(summary.spec).toBe('0.x');
    expect(summary.blendShapePresets).toContain('blink');
    expect(summary.humanBoneCount).toBe(2);
  });

  it('parseGlbJsonChunk rejects invalid buffer', () => {
    expect(parseGlbJsonChunk(new ArrayBuffer(8))).toBeNull();
  });
});
