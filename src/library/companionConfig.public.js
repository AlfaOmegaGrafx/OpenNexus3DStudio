/**
 * Public companion URL stub. Live embed config is gitignored (src/moat/companion/).
 */
export function getDgxLanIp() {
  return String(import.meta.env.VITE_DGX_LAN_IP || '').trim();
}

export function getStudioHostname() {
  if (typeof window === 'undefined') return '';
  return String(window.location?.hostname || '').trim();
}

export function isSurfaceToDgxTopology() {
  return false;
}

export function getCompanionConnectivityHint() {
  return '';
}

export function getCompanionBaseUrl() {
  const configured = String(import.meta.env.VITE_COMPANION_URL || '').trim();
  if (!configured) return '';
  return configured.endsWith('/') ? configured : `${configured}/`;
}

export function isCompanionPublicDemo() {
  if (import.meta.env.VITE_PUBLIC_DEMO === '1') return true;
  if (import.meta.env.PROD && !String(import.meta.env.VITE_COMPANION_URL || '').trim()) {
    return true;
  }
  return false;
}

export function useCompanionLiveEmbed() {
  return false;
}

export function buildCompanionEmbedUrl() {
  return '';
}

export function getCompanionLaunchUrl() {
  return getCompanionBaseUrl();
}
