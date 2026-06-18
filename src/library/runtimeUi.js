/** True only for `npm run dev`. False on Vercel / `vite build` production bundles. */
export const isLocalDev = import.meta.env.DEV;

/** True for `vite build` output (Vercel, GitHub Pages, npm run serve). */
export const isPublicBuild = import.meta.env.PROD;

/**
 * Vercel public demo flag (`VITE_PUBLIC_DEMO=1` in vercel.json).
 * Inlined at build time — do not expect runtime changes in the browser.
 */
export const isPublicDemo = import.meta.env.VITE_PUBLIC_DEMO === '1';

/** Show API Status in the left sidebar (dev always; production hidden when public demo). */
export function showApiStatusPanel() {
  if (import.meta.env.DEV) return true;
  return import.meta.env.VITE_PUBLIC_DEMO !== '1';
}

/** User-facing copy for production when no AI backend is configured (no env var names). */
export const AI_BACKEND_UNAVAILABLE_MSG =
  'AI generation is not available on this site. Run your own instance and connect a backend API.';

/**
 * Whether an API endpoint string looks like a private / internal host.
 * @param {string} endpoint
 */
export function isLikelyPrivateApiEndpoint(endpoint) {
  const s = String(endpoint || '').trim().toLowerCase();
  if (!s) return false;
  return (
    /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(s) ||
    /\.local\b|tailscale|10\.\d+\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\./.test(s) ||
    /dgx-spark|spark\.local/.test(s)
  );
}

/**
 * Safe label for API endpoint in production UI (never show private LAN URLs).
 * @param {string} endpoint
 */
export function formatApiEndpointForDisplay(endpoint) {
  const s = String(endpoint || '').trim();
  if (!s) return 'Not configured';
  if (isLocalDev) return s;
  if (isLikelyPrivateApiEndpoint(s)) return 'Private API (hidden)';
  try {
    const u = new URL(s.startsWith('/') ? `https://placeholder.invalid${s}` : s);
    if (s.startsWith('/')) return 'Same-origin API proxy';
    return u.origin;
  } catch {
    return 'Configured';
  }
}
