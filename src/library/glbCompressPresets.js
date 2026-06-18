const SMALLEST = {
  id: 'smallest',
  label: 'Smallest file',
  hint: 'Far away or tiny on screen',
  simplifyRatio: 0.004,
  simplifyError: 0.02,
  textureEdge: 256,
  quality: 0,
};

const BALANCED = {
  id: 'balanced',
  label: 'Balanced',
  hint: 'Recommended for most projects',
  simplifyRatio: 0.008,
  simplifyError: 0.02,
  textureEdge: 384,
  quality: 50,
};

const SHARPEST = {
  id: 'sharpest',
  label: 'Sharpest look',
  hint: 'Close-up or hero objects',
  simplifyRatio: 0.035,
  simplifyError: 0.01,
  textureEdge: 512,
  quality: 100,
};

const SAFE = {
  id: 'safe',
  label: 'Rig-safe',
  hint: 'Skinned or morph targets — Draco + textures only',
  simplifyRatio: 0,
  simplifyError: 0,
  textureEdge: 512,
  quality: 70,
  simplify: false,
};

export const COMPRESS_PRESETS = [SMALLEST, BALANCED, SHARPEST];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPreset(from, to, t) {
  return {
    simplifyRatio: lerp(from.simplifyRatio, to.simplifyRatio, t),
    simplifyError: lerp(from.simplifyError, to.simplifyError, t),
    textureEdge: Math.round(lerp(from.textureEdge, to.textureEdge, t)),
  };
}

export function resolveCompressProfile(options = {}) {
  if (options.preset === 'safe') {
    return { ...SAFE, quality: options.quality ?? SAFE.quality };
  }

  const quality = Math.max(0, Math.min(100, options.quality ?? 50));
  const t = quality / 100;
  let interpolated;

  if (t <= 0.5) {
    interpolated = lerpPreset(SMALLEST, BALANCED, t * 2);
  } else {
    interpolated = lerpPreset(BALANCED, SHARPEST, (t - 0.5) * 2);
  }

  return {
    quality,
    simplify: options.simplify !== false,
    ...interpolated,
  };
}

export function getCompressHint(quality) {
  const q = Math.max(0, Math.min(100, quality ?? 50));
  if (q <= 20) return 'Tiny file — best for background props you barely notice.';
  if (q <= 40) return 'Small file — good for distant scene objects.';
  if (q <= 60) return 'Balanced — the sweet spot for most projects.';
  if (q <= 80) return 'More detail — edges and textures stay sharper.';
  return 'Maximum detail — for close-up viewing, larger file size.';
}

export function formatByteSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
