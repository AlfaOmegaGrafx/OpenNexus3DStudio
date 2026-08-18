/**
 * Capture the WebGL canvas as base64 JPEG for vision APIs.
 * @param {import('three').WebGLRenderer} renderer
 * @param {{ mime?: string, quality?: number }} [opts]
 * @returns {string} raw base64 (no data: prefix)
 */
export function captureRendererFrameBase64(renderer, opts = {}) {
  const { mime = 'image/jpeg', quality = 0.85 } = opts;
  if (!renderer?.domElement)
    throw new Error('Renderer canvas not available');
  const dataUrl = renderer.domElement.toDataURL(mime, quality);
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/**
 * @param {string} dataUrlOrBase64
 * @returns {string}
 */
export function stripDataUrlPrefix(dataUrlOrBase64) {
  const s = String(dataUrlOrBase64 || '');
  const comma = s.indexOf(',');
  return comma >= 0 ? s.slice(comma + 1) : s;
}
