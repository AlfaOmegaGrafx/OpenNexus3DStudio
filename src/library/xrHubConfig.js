/**
 * XR Media Hub URL for the left-sidebar voice panel (DGX).
 * Galaxy XR / Surface reach DGX hub over Tailscale by default.
 */

const DEFAULT_DEV_HUB = 'https://dgx-spark.tail6121eb.ts.net/';

/**
 * Hub URL for sidebar iframe (`embed=1` compact layout).
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function buildXrHubEmbedUrl(baseUrl = getXrHubEmbedUrl()) {
  const base = String(baseUrl || '').trim();
  if (!base) return '';
  const url = new URL(base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('embed', '1');
  return url.toString();
}

/** @returns {string} Hub origin URL with trailing slash, or empty if disabled. */
export function getXrHubEmbedUrl() {
  const configured = String(import.meta.env.VITE_XR_HUB_URL || '').trim();
  if (configured) {
    return configured.endsWith('/') ? configured : `${configured}/`;
  }
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_HUB;
  }
  return '';
}

export function showXrAiPanel() {
  return Boolean(getXrHubEmbedUrl());
}
