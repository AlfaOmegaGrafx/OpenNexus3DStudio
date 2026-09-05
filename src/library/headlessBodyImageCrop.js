/**
 * Crop Krea body reference images before TRELLIS when headless_body is requested.
 * Prompts alone often still produce a mannequin head — removing the top band is reliable.
 */

/** Fraction of image height to discard above the shoulders (typical head band). */
export const DEFAULT_HEADLESS_CROP_TOP_FRACTION = 0.2;

/**
 * Remove the top band of a raster (head region) and scale the neck-down body to fill the frame.
 * No-op outside browser or when decode fails.
 * @param {File} imageFile
 * @param {{ cropTopFraction?: number }} [options]
 * @returns {Promise<File>}
 */
export async function cropHeadlessBodyReferenceImage(
  imageFile,
  { cropTopFraction = DEFAULT_HEADLESS_CROP_TOP_FRACTION } = {},
) {
  if (!imageFile || !imageFile.type?.startsWith('image/')) return imageFile;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return imageFile;
  }
  const frac = Number(cropTopFraction);
  if (!Number.isFinite(frac) || frac <= 0 || frac >= 0.45) return imageFile;

  let bitmap;
  try {
    bitmap = await createImageBitmap(imageFile);
  } catch {
    return imageFile;
  }

  try {
    const { width, height } = bitmap;
    const srcY = Math.round(height * frac);
    const srcH = Math.max(1, height - srcY);
    if (srcH >= height - 2) return imageFile;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageFile;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, srcY, width, srcH, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/png',
      );
    });
    const baseName = (imageFile.name || 'body').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}_headless_crop.png`, {
      type: 'image/png',
      lastModified: Date.now(),
    });
  } catch {
    return imageFile;
  } finally {
    try {
      bitmap.close?.();
    } catch {
      /* ignore */
    }
  }
}
