/**
 * Sample a uniform face-region skin swatch from a selfie (browser canvas).
 * Used to bias Body+Cloth Krea neck-open body prompts toward matching head tone.
 */

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string} #rrggbb
 */
export function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const h = (n) => clamp(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Map RGB to a short complexion prompt fragment for Krea body generation.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function complexionPhraseFromRgb(r, g, b) {
  const R = Number(r) || 0;
  const G = Number(g) || 0;
  const B = Number(b) || 0;
  const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const warmth = R - B;

  let depth = 'medium';
  if (L >= 200) depth = 'very fair';
  else if (L >= 170) depth = 'fair';
  else if (L >= 140) depth = 'light';
  else if (L >= 110) depth = 'medium';
  else if (L >= 80) depth = 'medium-tan';
  else if (L >= 55) depth = 'deep';
  else depth = 'very deep';

  let undertone = 'neutral';
  if (warmth > 25) undertone = 'warm';
  else if (warmth < -15) undertone = 'cool';

  const hex = rgbToHex(R, G, B);
  return (
    `${undertone} ${depth} skin tone approximately ${hex}, ` +
    'uniform complexion, consistent neck and arms matching face reference'
  );
}

/**
 * Average RGB over forehead + cheek boxes; drop extreme luminance outliers.
 * @param {ImageData|Uint8ClampedArray} imageDataOrPixels
 * @param {number} width
 * @param {number} height
 * @returns {{ r: number, g: number, b: number, sampleCount: number }}
 */
export function averageCenterFaceRgb(imageDataOrPixels, width, height) {
  const data =
    imageDataOrPixels &&
    typeof imageDataOrPixels === 'object' &&
    'data' in imageDataOrPixels &&
    imageDataOrPixels.data
      ? imageDataOrPixels.data
      : imageDataOrPixels;
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));

  /** @type {{ x0: number, y0: number, x1: number, y1: number }[]} */
  const boxes = [
    // forehead
    { x0: 0.35, y0: 0.22, x1: 0.65, y1: 0.38 },
    // left cheek
    { x0: 0.22, y0: 0.42, x1: 0.42, y1: 0.62 },
    // right cheek
    { x0: 0.58, y0: 0.42, x1: 0.78, y1: 0.62 },
  ];

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (const box of boxes) {
    const xStart = Math.floor(box.x0 * w);
    const xEnd = Math.ceil(box.x1 * w);
    const yStart = Math.floor(box.y0 * h);
    const yEnd = Math.ceil(box.y1 * h);
    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 128) continue;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Skip hair/shadows and blown highlights / specular.
        if (L < 35 || L > 245) continue;
        sumR += r;
        sumG += g;
        sumB += b;
        count += 1;
      }
    }
  }

  if (count === 0) {
    // Fallback: center third of the image with softer clamps.
    const xStart = Math.floor(w * 0.33);
    const xEnd = Math.ceil(w * 0.67);
    const yStart = Math.floor(h * 0.25);
    const yEnd = Math.ceil(h * 0.7);
    for (let y = yStart; y < yEnd; y += 2) {
      for (let x = xStart; x < xEnd; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 128) continue;
        sumR += r;
        sumG += g;
        sumB += b;
        count += 1;
      }
    }
  }

  if (count === 0) {
    return { r: 180, g: 140, b: 120, sampleCount: 0 };
  }

  return {
    r: sumR / count,
    g: sumG / count,
    b: sumB / count,
    sampleCount: count,
  };
}

/**
 * @param {Blob|File} fileOrBlob
 * @returns {Promise<{ hex: string, phrase: string, rgb: { r: number, g: number, b: number }, sampleCount: number }>}
 */
export async function sampleFaceSkinSwatch(fileOrBlob) {
  if (!fileOrBlob) {
    throw new Error('sampleFaceSkinSwatch requires a File or Blob');
  }

  const bitmap = await createImageBitmap(fileOrBlob);
  try {
    const maxSide = 256;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for skin swatch');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const avg = averageCenterFaceRgb(imageData, width, height);
    const hex = rgbToHex(avg.r, avg.g, avg.b);
    const phrase = complexionPhraseFromRgb(avg.r, avg.g, avg.b);
    return {
      hex,
      phrase,
      rgb: { r: avg.r, g: avg.g, b: avg.b },
      sampleCount: avg.sampleCount,
    };
  } finally {
    bitmap.close?.();
  }
}
