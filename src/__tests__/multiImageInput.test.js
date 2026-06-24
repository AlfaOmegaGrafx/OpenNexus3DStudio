import { describe, expect, it } from 'vitest';
import {
  resolveMeshModelForAvatarFromImage,
  resolveSplatModelForPhotos,
} from '../library/aiModelsCatalog.js';
import {
  MAX_REFERENCE_IMAGES,
  MAX_TOTAL_IMAGES,
  multiImageUploadHint,
  splitPrimaryAndReferenceFiles,
  supportsMultiImageInput,
} from '../library/multiImageInput.js';

describe('multiImageInput', () => {
  it('flags splat/world/avatar tasks', () => {
    expect(supportsMultiImageInput('image-to-splat')).toBe(true);
    expect(supportsMultiImageInput('image-to-3d')).toBe(false);
  });

  it('splits primary and references with cap', () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ name: `f${i}.jpg` }));
    const { primary, references } = splitPrimaryAndReferenceFiles(files, 2);
    expect(primary?.name).toBe('f2.jpg');
    expect(references).toHaveLength(MAX_REFERENCE_IMAGES);
    expect(references[0].name).toBe('f0.jpg');
  });

  it('documents phase limits', () => {
    expect(MAX_TOTAL_IMAGES).toBe(MAX_REFERENCE_IMAGES + 1);
    expect(multiImageUploadHint('image-to-splat')).toMatch(/WorldMirror/i);
  });

  it('routes splat model by photo count', () => {
    expect(resolveSplatModelForPhotos(1, 0)).toBe('triposplat_image_to_splat');
    expect(resolveSplatModelForPhotos(1, 1)).toBe('worldmirror2_reconstruct');
  });

  it('switches avatar mesh to TRELLIS multiview when refs present', () => {
    expect(
      resolveMeshModelForAvatarFromImage('trellis2_image_to_textured_mesh', {
        referenceCount: 2,
        useMultiview: true,
      }),
    ).toBe('trellis_image_to_textured_mesh');
  });
});
