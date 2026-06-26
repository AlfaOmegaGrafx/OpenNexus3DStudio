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

/** Vercel / public demo — static sidebar preview, no live DGX iframe. */
export function isXrVoicePublicDemo() {
  if (import.meta.env.VITE_PUBLIC_DEMO === '1') return true;
  // Production deploys without a hub URL (e.g. Vercel env drift) still use the demo preview.
  if (import.meta.env.PROD && !String(import.meta.env.VITE_XR_HUB_URL || '').trim()) {
    return true;
  }
  return false;
}

/** Whether the sidebar should embed the live Spark hub (local dev + configured hub only). */
export function useXrHubLiveEmbed() {
  if (isXrVoicePublicDemo()) return false;
  return Boolean(getXrHubEmbedUrl());
}

/** Include XR Voice in the bundle — must be true for typical Vercel prod builds. */
export function showXrAiPanel() {
  if (isXrVoicePublicDemo()) return true;
  if (getXrHubEmbedUrl()) return true;
  if (import.meta.env.PROD) return true;
  return false;
}

/** Top of left sidebar (Vercel demo); live hub stays lower near API status in local dev. */
export function showXrAiPanelAtSidebarTop() {
  if (!showXrAiPanel()) return false;
  return isXrVoicePublicDemo() || !useXrHubLiveEmbed();
}

/** Sidebar mic icon — scroll to and expand XR Voice. */
export const OPEN_XR_AI_PANEL_EVENT = 'openXrAiPanel';
