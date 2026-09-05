/**
 * Space-Time WebXR E2E helpers — fabric preflight + walk collision diagnostics.
 */
import { findCapsuleWalkRoot } from './spacetimeXrFloor.js';

/**
 * Verify MSF fabric is reachable before loading GLBs (Galaxy must hit Surface :8453, not DGX Tailscale).
 * @param {string} fabricUrl
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function preflightSpacetimeFabricUrl(fabricUrl, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(fabricUrl, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(
        `Fabric unreachable (HTTP ${res.status}). Start Surface dev:spark-proxies (:8453) and set VITE_MSF_PUBLIC_URL. URL: ${fabricUrl}`,
      );
    }
    const body = await res.json();
    if (!body || typeof body !== 'object') {
      throw new Error(`Fabric response is not JSON. URL: ${fabricUrl}`);
    }
    return { ok: true, fabricUrl, nodeCount: Array.isArray(body.nodes) ? body.nodes.length : null };
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `Fabric fetch timed out after ${timeoutMs}ms. Is Surface :8453 running? URL: ${fabricUrl}`,
      );
    }
    const msg = err?.message || String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      throw new Error(
        `Fabric fetch failed (network/CORS). Galaxy Chrome must reach Surface MSF proxy — not Tailscale DGX :8443. URL: ${fabricUrl}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {import('three').Object3D} fabricRoot
 * @param {number} walkMeshCount from prepareSpacetimeWalkSurfaces
 */
export function summarizeSpacetimeWalkSetup(fabricRoot, walkMeshCount) {
  const capsule = findCapsuleWalkRoot(fabricRoot);
  return {
    capsuleFound: Boolean(capsule),
    walkRootName: capsule?.name || 'fabricRoot-fallback',
    walkMeshCount,
    collisionReady: walkMeshCount > 0,
  };
}
