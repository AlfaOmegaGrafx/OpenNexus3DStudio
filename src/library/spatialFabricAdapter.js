/**
 * RP1 / OMB spatial fabric adapter for OpenNexus3DStudio.
 * Mirrors the IWSDK deep-link pattern in iwsdkWorldPackage.js.
 *
 * @see docs/SPATIAL_FABRIC_INTEGRATION.md
 */

import { inferModelFileExtensionFromSource } from './taskModelUrl.js';
import { get3daigcAuthHeaders } from './taskManager.js';
import {
  fetchWorldPackage,
  resolveWorldPackageUrls,
} from './worldPackage.js';

const DEFAULT_OMB_GUIDELINES =
  'https://omb.wiki/en/spatial-fabric/model-guidelines';

/** @type {{ endpoint: string, data: object|null, promise: Promise<object>|null }} */
const configCache = { endpoint: '', data: null, promise: null };

export function getSpatialFabricEnv() {
  return {
    msfPublicUrl: (import.meta.env.VITE_MSF_PUBLIC_URL || '').replace(/\/$/, ''),
    fabricMsfUrl: (import.meta.env.VITE_RP1_FABRIC_MSF_URL || '').replace(/\/$/, ''),
    companyId: import.meta.env.VITE_RP1_COMPANY_ID || '',
    ombGuidelines: DEFAULT_OMB_GUIDELINES,
  };
}

/** OMB tier triangle / texture budgets (base tier before PBR modifier). */
export const OMB_TIER_LIMITS = {
  1: { triangles: 500, texturePx: 64, label: 'Tier 1 Universal' },
  2: { triangles: 2000, texturePx: 128, label: 'Tier 2 Medium' },
  3: { triangles: 10000, texturePx: 256, label: 'Tier 3 Heavy' },
  4: { triangles: 150000, texturePx: 1024, label: 'Tier 4 Unique' },
  5: { triangles: 150000, texturePx: 2048, label: 'Tier 5 Solo' },
};

/**
 * Normalize API or client-side OMB tier objects to a consistent shape.
 * @param {object|null|undefined} omb
 */
export function normalizeOmbTier(omb) {
  if (!omb || typeof omb !== 'object') return null;
  const tier = omb.recommended_tier ?? omb.recommendedTier ?? null;
  const label = omb.label ?? (tier ? OMB_TIER_LIMITS[tier]?.label : null);
  return tier == null ? null : { recommendedTier: tier, label, raw: omb };
}

/**
 * @param {{ triangles?: number, textureMaxDimension?: number, usePbr?: boolean }} stats
 */
export function validateOmbTier(stats = {}) {
  const triangles = Number(stats.triangles) || 0;
  const textureMax = Number(stats.textureMaxDimension) || 0;
  const usePbr = stats.usePbr !== false;

  let tier = 1;
  for (const [key, limits] of Object.entries(OMB_TIER_LIMITS)) {
    if (triangles <= limits.triangles && textureMax <= limits.texturePx) {
      tier = Number(key);
      break;
    }
    tier = Math.min(Number(key) + 1, 5);
  }

  if (usePbr && tier < 5) tier += 1;
  const limits = OMB_TIER_LIMITS[tier];

  return {
    recommendedTier: tier,
    label: limits.label,
    withinBudget:
      triangles <= limits.triangles && textureMax <= limits.texturePx,
    limits,
  };
}

export function buildSpatialFabricPublishPayload({
  glbUrl,
  name,
  tier,
  companyId,
  jobId,
}) {
  return {
    asset_name: name || (jobId ? `job-${jobId}` : 'opennexus-export'),
    glb_url: glbUrl,
    omb_tier: tier,
    company_id: companyId,
    job_id: jobId || null,
  };
}

/**
 * Derive Scene Assembler root (HTML app) from a fabric .msf URL or any MSF host URL.
 * Never open raw .msf in a browser tab — it is JSON, not the editor UI.
 * @param {string} [url]
 */
export function deriveSceneAssemblerRootFromMsfUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return '';
  }
}

/** @param {string} url */
export function isFabricMsfFileUrl(url) {
  return typeof url === 'string' && /\.msf(\?|#|$)/i.test(url);
}

/**
 * Build the URL users should open for Scene Assembler (never a raw .msf file).
 * @param {{ msfPublicUrl?: string, fabricMsfUrl?: string, sceneAssemblerUrl?: string }} cfg
 * @param {{ sceneAssemblerUrl?: string, fabricMsfUrl?: string }} [opts]
 */
export function buildSceneAssemblerOpenUrl(cfg = {}, opts = {}) {
  const safeCfg = cfg ?? {};
  const safeOpts = opts ?? {};
  const explicit =
    safeOpts.sceneAssemblerUrl || safeCfg.sceneAssemblerUrl || safeCfg.msfPublicUrl || '';
  let root = explicit.replace(/\/$/, '');
  if (!root) {
    root = deriveSceneAssemblerRootFromMsfUrl(
      safeOpts.fabricMsfUrl || safeCfg.fabricMsfUrl || '',
    );
  }
  if (root && isFabricMsfFileUrl(root)) {
    root = deriveSceneAssemblerRootFromMsfUrl(root);
  }
  return root || '';
}

/**
 * Merge API config with Vite env fallbacks.
 * @param {object|null|undefined} apiConfig
 */
export function mergeSpatialFabricConfig(apiConfig) {
  const env = getSpatialFabricEnv();
  let msfPublicUrl = (apiConfig?.public_base_url || env.msfPublicUrl || '').replace(/\/$/, '');
  const fabricMsfUrl = (apiConfig?.fabric_msf_url || env.fabricMsfUrl || '').replace(/\/$/, '');
  if (!msfPublicUrl && fabricMsfUrl) {
    msfPublicUrl = deriveSceneAssemblerRootFromMsfUrl(fabricMsfUrl);
  }
  return {
    enabled: Boolean(apiConfig?.enabled ?? msfPublicUrl),
    msfPublicUrl,
    fabricMsfUrl,
    companyId: apiConfig?.company_id || env.companyId || '',
    ombGuidelines: apiConfig?.omb_guidelines || DEFAULT_OMB_GUIDELINES,
  };
}

/**
 * Open MSF Scene Assembler (sync, env-only). Never returns a raw .msf file URL.
 *
 * @param {{ fabricMsfUrl?: string, sceneAssemblerUrl?: string }} [opts]
 */
export function buildMetaverseBrowserUrl(opts = {}) {
  const env = getSpatialFabricEnv();
  const url = buildSceneAssemblerOpenUrl(
    { msfPublicUrl: env.msfPublicUrl, fabricMsfUrl: env.fabricMsfUrl },
    opts,
  );
  if (url) return url;
  return DEFAULT_OMB_GUIDELINES;
}

/** @param {object|null|undefined} cfg from mergeSpatialFabricConfig */
export function isSceneAssemblerConfigured(cfg) {
  return Boolean(buildSceneAssemblerOpenUrl(cfg ?? {}));
}

/** @param {object|null|undefined} cfg */
export function getOmbGuidelinesUrl(cfg) {
  return cfg?.ombGuidelines || DEFAULT_OMB_GUIDELINES;
}

function apiUrl(apiEndpoint, path) {
  const base = (apiEndpoint || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * @param {Response} res
 * @param {object} data
 * @param {string} action
 */
export function formatSpatialFabricApiError(res, data, action = 'Request') {
  const status = res?.status;
  const detail = data?.detail || data?.message || data?.error;
  const detailStr = typeof detail === 'string' ? detail : '';

  if (status === 404) {
    if (/job not found/i.test(detailStr)) {
      return (
        `${action} failed: job not found on 3DAIGC-API. ` +
        'Use Task Manager → Sync from API, or re-run the generation job on DGX.'
      );
    }
    if (/no mesh output/i.test(detailStr)) {
      return (
        `${action} failed: this job has no GLB mesh on the server ` +
        '(Image-to-World splat jobs need mesh props — use World Library RP1).'
      );
    }
    if (detailStr && !/^not found$/i.test(detailStr)) {
      return `${action} failed (404): ${detailStr}`;
    }
    return (
      `${action} failed (404): spatial-fabric API not loaded on 3DAIGC-API. ` +
      'On DGX run: bash scripts/sync-spatial-fabric-env.sh && restart API with .env sourced. ' +
      'On Surface restart npm run dev so /__dev_dgx_proxy forwards to DGX (see docs/SPATIAL_FABRIC_INTEGRATION.md).'
    );
  }
  if (status === 503) {
    return (
      typeof detail === 'string'
        ? detail
        : `${action} failed (503): MSF_PUBLIC_BASE_URL is not configured on the API server.`
    );
  }
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return `${action} failed (${status || 'unknown'})`;
}

async function readSpatialFabricJson(res) {
  return res.json().catch(() => ({}));
}

/**
 * Resolve spatial fabric config: API when endpoint is set, else Vite env.
 * @param {string} [apiEndpoint]
 */
export async function resolveSpatialFabricConfig(apiEndpoint) {
  if (!apiEndpoint) {
    return mergeSpatialFabricConfig(null);
  }

  if (configCache.endpoint === apiEndpoint && configCache.data) {
    return configCache.data;
  }

  if (!configCache.promise || configCache.endpoint !== apiEndpoint) {
    configCache.endpoint = apiEndpoint;
    configCache.promise = fetchSpatialFabricConfig(apiEndpoint)
      .then((apiConfig) => {
        const merged = mergeSpatialFabricConfig(apiConfig);
        configCache.data = merged;
        return merged;
      })
      .catch((err) => {
        console.warn('[SpatialFabric] config fetch failed, using env fallback:', err?.message || err);
        const merged = mergeSpatialFabricConfig(null);
        configCache.data = merged;
        return merged;
      });
  }

  return configCache.promise;
}

/**
 * Scene Assembler URL only (API config → Vite env). Empty when MSF is not linked.
 * @param {string} [apiEndpoint]
 * @param {{ fabricMsfUrl?: string, sceneAssemblerUrl?: string }} [opts]
 */
export async function resolveSceneAssemblerUrl(apiEndpoint, opts = {}) {
  const cfg = await resolveSpatialFabricConfig(apiEndpoint);
  return buildSceneAssemblerOpenUrl(cfg, opts);
}

/**
 * OMB spatial-fabric documentation (for public deploy when MSF is not linked).
 * @param {string} [apiEndpoint]
 */
export async function resolveOmbGuidelinesUrl(apiEndpoint) {
  const cfg = await resolveSpatialFabricConfig(apiEndpoint);
  return getOmbGuidelinesUrl(cfg);
}

/**
 * Scene Assembler when configured, else OMB guidelines wiki.
 * Prefer resolveSceneAssemblerUrl + resolveOmbGuidelinesUrl in UI for honest labels.
 * @param {string} [apiEndpoint]
 * @param {{ fabricMsfUrl?: string, sceneAssemblerUrl?: string }} [opts]
 */
export async function resolveMetaverseBrowserUrl(apiEndpoint, opts = {}) {
  const url = await resolveSceneAssemblerUrl(apiEndpoint, opts);
  if (url) return url;
  return resolveOmbGuidelinesUrl(apiEndpoint);
}

export async function fetchSpatialFabricConfig(apiEndpoint) {
  const res = await fetch(apiUrl(apiEndpoint, '/api/v1/spatial-fabric/config'));
  const data = await readSpatialFabricJson(res);
  if (!res.ok) throw new Error(formatSpatialFabricApiError(res, data, 'Spatial fabric config'));
  return data;
}

/**
 * Inspect a completed job's mesh + OMB stats before publishing.
 * @param {string} apiEndpoint
 * @param {string} jobId
 */
export async function fetchSpatialFabricAsset(apiEndpoint, jobId) {
  const res = await fetch(apiUrl(apiEndpoint, `/api/v1/spatial-fabric/assets/${jobId}`));
  const data = await readSpatialFabricJson(res);
  if (!res.ok) {
    throw new Error(formatSpatialFabricApiError(res, data, 'Asset lookup'));
  }
  return data;
}

export async function publishGlbBlobToSpatialFabric(
  apiEndpoint,
  blob,
  filename = 'export.glb',
  assetName,
  { usePbr = true } = {},
) {
  const form = new FormData();
  form.append('file', blob, filename);
  const stem =
    assetName ||
    filename.replace(/-draco\.glb$/i, '').replace(/\.glb$/i, '') ||
    'viewport-export';
  const params = new URLSearchParams({
    asset_name: stem,
    use_pbr: String(usePbr),
  });
  const res = await fetch(
    `${apiUrl(apiEndpoint, '/api/v1/spatial-fabric/publish-glb')}?${params}`,
    { method: 'POST', body: form },
  );
  const data = await readSpatialFabricJson(res);
  if (!res.ok) {
    throw new Error(formatSpatialFabricApiError(res, data, 'Publish GLB to spatial fabric'));
  }
  return data;
}

/**
 * Export viewport GLB (blob) → MSF object library → Scene Assembler.
 * @param {string} apiEndpoint
 * @param {Blob} blob
 * @param {string} filename
 * @param {string} [assetName]
 */
export async function publishGlbBlobAndOpenMetaverseBrowser(
  apiEndpoint,
  blob,
  filename = 'export.glb',
  assetName,
  opts = {},
) {
  const result = await publishGlbBlobToSpatialFabric(
    apiEndpoint,
    blob,
    filename,
    assetName,
    opts,
  );
  const url =
    buildSceneAssemblerOpenUrl(
      await resolveSpatialFabricConfig(apiEndpoint),
      { sceneAssemblerUrl: result.scene_assembler_url },
    ) || (await resolveSceneAssemblerUrl(apiEndpoint));
  if (url) openSpatialFabricInBrowser(url);
  return result;
}

export async function publishJobToSpatialFabric(apiEndpoint, jobId, assetName) {
  const res = await fetch(apiUrl(apiEndpoint, '/api/v1/spatial-fabric/publish'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, asset_name: assetName }),
  });
  const data = await readSpatialFabricJson(res);
  if (!res.ok) {
    throw new Error(formatSpatialFabricApiError(res, data, 'Publish to spatial fabric'));
  }
  return data;
}

/**
 * Publish job GLB to MSF object library and open Scene Assembler.
 * @param {string} apiEndpoint
 * @param {string} jobId
 * @param {string} [assetName]
 */
export async function publishJobAndOpenMetaverseBrowser(apiEndpoint, jobId, assetName) {
  const result = await publishJobToSpatialFabric(apiEndpoint, jobId, assetName);
  const url =
    buildSceneAssemblerOpenUrl(
      await resolveSpatialFabricConfig(apiEndpoint),
      { sceneAssemblerUrl: result.scene_assembler_url },
    ) || (await resolveSceneAssemblerUrl(apiEndpoint));
  if (url) openSpatialFabricInBrowser(url);
  return result;
}

function isGlbAssetUrl(url) {
  return typeof url === 'string' && /\.glb(\?|#|$)/i.test(url);
}

/**
 * Publish interactable GLB props from a world manifest into MSF object library.
 * Splat environments stay in-app only — Scene Assembler accepts GLB/GLTF props.
 * @param {string} apiEndpoint
 * @param {string} manifestUrl
 * @param {{ assetNamePrefix?: string }} [opts]
 */
export async function publishWorldPropsToSpatialFabric(
  apiEndpoint,
  manifestUrl,
  { assetNamePrefix = 'world-prop' } = {},
) {
  if (!apiEndpoint) {
    throw new Error('Configure API endpoint to publish worlds to spatial fabric');
  }

  const manifest = await fetchWorldPackage(manifestUrl, apiEndpoint);
  const resolved = resolveWorldPackageUrls(manifest, manifestUrl, apiEndpoint);
  const glbProps = resolved.props.filter((prop) => isGlbAssetUrl(prop.mesh_url));

  if (glbProps.length === 0) {
    throw new Error(
      'This world has no mesh props to publish (prop_count is 0). ' +
        'Image-to-World splat environments stay in the OpenNexus viewport; Scene Assembler only accepts GLB props.',
    );
  }

  const prefix = (assetNamePrefix || manifest.name || manifest.id || 'world')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .slice(0, 48);

  const published = [];
  for (const prop of glbProps) {
    const response = await fetch(prop.mesh_url, {
      headers: { Accept: 'model/gltf-binary,*/*', ...get3daigcAuthHeaders() },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch prop "${prop.id}" (${response.status})`);
    }
    const blob = await response.blob();
    const filename = `${prop.id}.glb`;
    const assetName = `${prefix}-${prop.id}`.replace(/[^a-z0-9._-]+/gi, '-');
    const result = await publishGlbBlobToSpatialFabric(
      apiEndpoint,
      blob,
      filename,
      assetName,
    );
    published.push({ propId: prop.id, assetName, ...result });
    console.log('[SpatialFabric] world prop published', prop.id, result?.published?.object_url);
  }

  return {
    manifestId: manifest.id,
    manifestName: manifest.name,
    published,
  };
}

/**
 * World manifest props → MSF object library → Scene Assembler.
 * @param {string} apiEndpoint
 * @param {string} manifestUrl
 * @param {string} [worldName]
 */
export async function publishWorldAndOpenMetaverseBrowser(
  apiEndpoint,
  manifestUrl,
  worldName,
) {
  const result = await publishWorldPropsToSpatialFabric(apiEndpoint, manifestUrl, {
    assetNamePrefix: worldName,
  });
  const url =
    buildSceneAssemblerOpenUrl(await resolveSpatialFabricConfig(apiEndpoint)) ||
    (await resolveSceneAssemblerUrl(apiEndpoint));
  if (url) openSpatialFabricInBrowser(url);
  console.log('[SpatialFabric] world publish complete', {
    manifestId: result.manifestId,
    propCount: result.published.length,
  });
  return result;
}

export async function validateGlbBlob(apiEndpoint, blob, filename = 'export.glb') {
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await fetch(
    apiUrl(apiEndpoint, '/api/v1/spatial-fabric/validate-glb'),
    { method: 'POST', body: form },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || `Validation failed (${res.status})`);
  }
  return data;
}

export function openSpatialFabricInBrowser(url) {
  let target = url || buildMetaverseBrowserUrl();
  if (isFabricMsfFileUrl(target)) {
    const root = deriveSceneAssemblerRootFromMsfUrl(target);
    if (root) {
      console.warn('[SpatialFabric] Redirecting .msf URL to Scene Assembler root:', root);
      target = root;
    }
  }
  if (target) window.open(target, '_blank', 'noopener,noreferrer');
}

const SPLAT_MESH_EXTENSIONS = new Set(['ply', 'splat', 'spz', 'ksplat', 'sog']);

/**
 * Whether a completed task is a candidate for spatial-fabric publish (GLB mesh on server).
 * @param {object} task
 * @param {object|null} loadPayload from normalizeTaskLoadPayload
 * @param {{ isSplatOnly?: boolean, hasMesh?: boolean, meshUrl?: string|null, isFullWorld?: boolean }} helpers
 */
export function canPublishTaskToSpatialFabric(
  task,
  loadPayload,
  { isSplatOnly = false, hasMesh = false, meshUrl = null, isFullWorld = false } = {},
) {
  if (!task || task.status !== 'completed') return false;
  if (isFullWorld) return false;
  if (isSplatOnly && !hasMesh) return false;
  if (!hasMesh) return false;
  if (/\.(ply|splat|spz|ksplat|sog)(?:$|[/?#])/i.test(meshUrl || '')) return false;
  const ext = meshUrl ? inferModelFileExtensionFromSource(meshUrl) : null;
  if (ext && SPLAT_MESH_EXTENSIONS.has(ext)) return false;
  return true;
}
