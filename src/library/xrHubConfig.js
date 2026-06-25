/**
 * XR Voice hub URL (sidebar iframe). Dev on Surface uses the local :8443 proxy —
 * DGX :8088 / Tailscale :8088 use self-signed certs that browsers block inside iframes.
 * Not OpenNexus IWSDK lab `/xr` (PC :3000/xr).
 *
 * Dev: run `npm run xr-hub-proxy` on Surface, then iframe loads https://<Surface-LAN>:8443
 */

/** Surface dev default — xr-spark-hub-proxy.mjs → DGX https://10.0.0.158:8088 */
const DEFAULT_DEV_HUB = 'https://10.0.0.32:8443/';

/**
 * @param {string} url
 * @returns {string}
 */
function normalizeHubBase(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

/**
 * Hub URL for sidebar iframe (`embed=1` compact layout).
 * @param {string} [baseUrl]
 * @returns {string}
 */
function parentRemoteLogEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('remoteLog') === '1') {
      return true;
    }
    return localStorage.getItem('remoteLogEnabled') === '1';
  } catch {
    return false;
  }
}

export function buildXrHubEmbedUrl(baseUrl = getXrHubEmbedUrl()) {
  const base = String(baseUrl || '').trim();
  if (!base) return '';
  const url = new URL(base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('embed', '1');
  if (parentRemoteLogEnabled()) {
    url.searchParams.set('remoteLog', '1');
  }
  return url.toString();
}

/** @returns {string} Hub origin URL with trailing slash, or empty if disabled. */
export function getXrHubEmbedUrl() {
  const configured = String(import.meta.env.VITE_XR_HUB_URL || '').trim();
  if (configured) {
    return normalizeHubBase(configured);
  }
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_HUB;
  }
  return '';
}

export function showXrAiPanel() {
  return Boolean(getXrHubEmbedUrl());
}

/** Sidebar mic icon — scroll to and expand XR Voice. */
export const OPEN_XR_AI_PANEL_EVENT = 'openXrAiPanel';
