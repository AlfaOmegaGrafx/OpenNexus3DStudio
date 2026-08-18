/**
 * Client for DGX Grounding DINO proxy (NVIDIA zero-shot object detection).
 * Web adaptation of Unity-MetaXR-AI-ZeroShot.
 * @see https://github.com/lucas-martinic/Unity-MetaXR-AI-ZeroShot
 */

function resolveProxyBase() {
  const fromEnv = String(import.meta.env.VITE_GROUNDING_DINO_PROXY_URL || '').trim().replace(/\/$/, '');
  if (fromEnv)
    return fromEnv;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname || 'localhost';
    return `${window.location.protocol}//${host}:8456`;
  }
  return 'https://localhost:8456';
}

/**
 * @typedef {object} GroundingDetection
 * @property {string} phrase
 * @property {string} label
 * @property {number} confidence
 * @property {[number, number, number, number]} bbox - pixel [x, y, w, h]
 * @property {[number, number, number, number]} bboxNormalized - [x1, y1, x2, y2] 0–1
 */

/**
 * @typedef {object} GroundingDinoResult
 * @property {GroundingDetection[]} detections
 * @property {string} summary
 * @property {number} frameWidth
 * @property {number} frameHeight
 */

/**
 * Run Grounding DINO on a JPEG frame.
 * @param {string} imageBase64 - raw or data-URL base64
 * @param {string} prompt - comma-separated objects, e.g. "desk, chair, door"
 * @param {{ threshold?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<GroundingDinoResult>}
 */
export async function detectObjectsGroundingDino(imageBase64, prompt, opts = {}) {
  const { threshold = 0.3, signal } = opts;
  const base = resolveProxyBase();
  const res = await fetch(`${base}/api/grounding-dino`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      prompt: String(prompt).trim(),
      threshold,
    }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || `Grounding DINO failed (${res.status})`);
  return data;
}

/** @returns {Promise<{ ok: boolean, hasKey: boolean }>} */
export async function pingGroundingDinoProxy() {
  const base = resolveProxyBase();
  const res = await fetch(`${base}/health`, { method: 'GET' });
  if (!res.ok)
    return { ok: false, hasKey: false };
  return res.json();
}

export { resolveProxyBase as getGroundingDinoProxyBase };
