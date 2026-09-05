/**
 * RP1 / OMB spatial fabric adapter for OpenNexus3DStudio.
 * Mirrors the IWSDK deep-link pattern in iwsdkWorldPackage.js.
 *
 * @see docs/SPATIAL_FABRIC_INTEGRATION.md
 */

import { inferModelFileExtensionFromSource } from './taskModelUrl.js';
import { get3daigcAuthHeaders, normalizeApiBaseUrl } from './taskManager.js';
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
  // Browser-reachable VITE_MSF_PUBLIC_URL wins over API scene_assembler_url (often Tailscale).
  const explicit =
    safeCfg.msfPublicUrl
    || safeOpts.sceneAssemblerUrl
    || safeCfg.sceneAssemblerUrl
    || '';
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
export function rewriteFabricUrlToPublicBase(fabricUrl, publicBase) {
  if (!fabricUrl || !publicBase) return fabricUrl || '';
  try {
    const path = new URL(fabricUrl).pathname + new URL(fabricUrl).search;
    return `${publicBase.replace(/\/$/, '')}${path}`;
  } catch {
    return fabricUrl;
  }
}

/**
 * Rewrite Tailscale/DGX fabric URLs to the browser-reachable MSF proxy (:8453 on Surface).
 * @param {string} fabricUrl
 * @param {object|null|undefined} [cfg]
 * @param {{ rootIx?: number, publicBase?: string }} [opts]
 */
export function resolveBrowserReachableFabricUrl(fabricUrl, cfg = {}, opts = {}) {
  const merged = mergeSpatialFabricConfig(cfg ?? {});
  const rootIx = Number(opts.rootIx ?? merged.rootIx ?? 1);
  let publicBase = (opts.publicBase || merged.msfPublicUrl || '').replace(/\/$/, '');
  if (!publicBase && typeof window !== 'undefined' && window.location?.hostname) {
    publicBase = `${window.location.protocol}//${window.location.hostname}:8453`;
  }
  const normalized = normalizeSpaceTimeFabricUrl(
    fabricUrl || merged.fabricMsfUrl || '',
    { rootIx },
  );
  if (!normalized) return '';
  return publicBase ? rewriteFabricUrlToPublicBase(normalized, publicBase) : normalized;
}

export function mergeSpatialFabricConfig(apiConfig) {
  const env = getSpatialFabricEnv();
  let msfPublicUrl = (
    env.msfPublicUrl ||
    apiConfig?.msfPublicUrl ||
    apiConfig?.public_base_url ||
    ''
  ).replace(/\/$/, '');
  let fabricMsfUrl = (
    env.fabricMsfUrl ||
    apiConfig?.fabricMsfUrl ||
    apiConfig?.fabric_msf_url ||
    ''
  ).replace(/\/$/, '');
  if (msfPublicUrl && fabricMsfUrl && env.msfPublicUrl) {
    fabricMsfUrl = rewriteFabricUrlToPublicBase(fabricMsfUrl, msfPublicUrl);
  }
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
  { usePbr = true, viewportLighting = null } = {},
) {
  const form = new FormData();
  form.append('file', blob, filename);
  if (viewportLighting && typeof viewportLighting === 'object') {
    form.append('viewport_lighting', JSON.stringify(viewportLighting));
  }
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
  if (url) openSpatialFabricInBrowser(url, opts.preopenedTab);
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
export async function publishJobAndOpenMetaverseBrowser(apiEndpoint, jobId, assetName, opts = {}) {
  const result = await publishJobToSpatialFabric(apiEndpoint, jobId, assetName);
  const url =
    buildSceneAssemblerOpenUrl(
      await resolveSpatialFabricConfig(apiEndpoint),
      { sceneAssemblerUrl: result.scene_assembler_url },
    ) || (await resolveSceneAssemblerUrl(apiEndpoint));
  if (url) openSpatialFabricInBrowser(url, opts.preopenedTab);
  return result;
}

function isGlbAssetUrl(url) {
  return typeof url === 'string' && /\.glb(\?|#|$)/i.test(url);
}

/**
 * Publish interactable GLB props (+ optional baked environment mesh) from a world
 * manifest into MSF object library. Splat PLYs stay in-app only.
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
  const envMeshUrl = resolved.environment?.mesh_url;
  const envGlb = envMeshUrl && isGlbAssetUrl(envMeshUrl) ? envMeshUrl : null;

  if (glbProps.length === 0 && !envGlb) {
    throw new Error(
      'This world has no GLB meshes to publish (no props and no environment.mesh_url). ' +
        'Image-to-World: add TRELLIS props. Env-scan: run Bake env mesh (POST /bake-env-mesh) first. ' +
        'Spark splat PLYs are not published to Scene Assembler.',
    );
  }

  const prefix = (assetNamePrefix || manifest.name || manifest.id || 'world')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .slice(0, 48);

  const published = [];

  if (envGlb) {
    const response = await fetch(envGlb, {
      headers: { Accept: 'model/gltf-binary,*/*', ...get3daigcAuthHeaders() },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch environment mesh (${response.status})`);
    }
    const blob = await response.blob();
    const assetName = `${prefix}-environment`.replace(/[^a-z0-9._-]+/gi, '-');
    const result = await publishGlbBlobToSpatialFabric(
      apiEndpoint,
      blob,
      'environment_mesh.glb',
      assetName,
    );
    published.push({ propId: 'environment', assetName, role: 'environment', ...result });
    console.log('[SpatialFabric] world environment mesh published', result?.published?.object_url);
  }

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
 * Queue env mesh bake on DGX for a world with gs_dataset/ (LingBot Phase A+).
 * Defaults to photo quality (denser mesh + vertex colors for studio viewport).
 * @param {string} apiEndpoint
 * @param {string} worldId
 * @param {{ quality?: string, targetFaceCount?: number, maxViews?: number, voxelResolution?: number, dataFactor?: number, colorExport?: string }} [opts]
 */
export async function queueBakeEnvMesh(apiEndpoint, worldId, opts = {}) {
  if (!apiEndpoint) {
    throw new Error('Configure API endpoint to bake environment mesh');
  }
  if (!worldId) {
    throw new Error('worldId is required for bake-env-mesh');
  }
  const body = {
    world_id: worldId,
    quality: opts.quality ?? 'photo',
    model_preference: 'env_mesh_bake',
  };
  if (opts.targetFaceCount != null) body.target_face_count = opts.targetFaceCount;
  if (opts.maxViews != null) body.max_views = opts.maxViews;
  if (opts.voxelResolution != null) body.voxel_resolution = opts.voxelResolution;
  if (opts.dataFactor != null) body.data_factor = opts.dataFactor;
  if (opts.colorExport != null) body.color_export = opts.colorExport;
  const res = await fetch(apiUrl(apiEndpoint, '/api/v1/world-generation/bake-env-mesh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...get3daigcAuthHeaders(),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === 'string'
        ? data.detail
        : `Bake env mesh failed (${res.status})`,
    );
  }
  return data;
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
  opts = {},
) {
  const result = await publishWorldPropsToSpatialFabric(apiEndpoint, manifestUrl, {
    assetNamePrefix: worldName,
  });
  const url =
    buildSceneAssemblerOpenUrl(await resolveSpatialFabricConfig(apiEndpoint)) ||
    (await resolveSceneAssemblerUrl(apiEndpoint));
  if (url) openSpatialFabricInBrowser(url, opts.preopenedTab);
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

export function getSyncSceneAssemblerUrl() {
  return buildSceneAssemblerOpenUrl(mergeSpatialFabricConfig(null)) || '';
}

/**
 * Call synchronously from a click handler before async publish (keeps user-gesture for popups).
 * When initialUrl is set, opens Scene Assembler immediately in the new tab.
 * @param {string} [initialUrl] Scene Assembler root (from getSyncSceneAssemblerUrl())
 * @returns {Window|null}
 */
export function preopenSpatialFabricTab(initialUrl = null) {
  if (typeof window === 'undefined') return null;
  let target = String(initialUrl || '').trim();
  if (target && isFabricMsfFileUrl(target)) {
    target = deriveSceneAssemblerRootFromMsfUrl(target) || '';
  }
  try {
    // Do not use noopener — parent must navigate this tab after async publish completes.
    return window.open(target || 'about:blank', '_blank');
  } catch {
    return null;
  }
}

function navigateSpatialFabricTab(tab, target) {
  if (!tab || tab.closed) return false;
  try {
    const current = tab.location?.href;
    if (current === target) {
      tab.focus?.();
      return true;
    }
    tab.location.replace(target);
    tab.focus?.();
    return true;
  } catch {
    try {
      tab.location.href = target;
      tab.focus?.();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * @param {string} [url]
 * @param {Window|null} [preopenedTab] from preopenSpatialFabricTab() on the same click
 * @param {{ fallbackSameTab?: boolean }} [opts]
 */
export function openSpatialFabricInBrowser(url, preopenedTab = null, opts = {}) {
  let target = url || buildMetaverseBrowserUrl();
  if (isFabricMsfFileUrl(target)) {
    const root = deriveSceneAssemblerRootFromMsfUrl(target);
    if (root) {
      console.warn('[SpatialFabric] Redirecting .msf URL to Scene Assembler root:', root);
      target = root;
    }
  }
  if (!target) {
    throw new Error('Scene Assembler URL is not configured.');
  }
  if (navigateSpatialFabricTab(preopenedTab, target)) {
    return;
  }
  const opened = window.open(target, '_blank', 'noopener,noreferrer');
  if (opened) {
    return;
  }
  if (preopenedTab && !preopenedTab.closed) {
    console.warn(
      '[SpatialFabric] Publish succeeded but could not navigate the preopened tab. Open manually:',
      target,
    );
    throw new Error(
      `Published to RP1, but Scene Assembler did not open automatically. Open manually: ${target}`,
    );
  }
  if (opts.fallbackSameTab !== false && typeof window !== 'undefined') {
    console.warn('[SpatialFabric] Popup blocked; opening Scene Assembler in this tab:', target);
    window.location.assign(target);
    return;
  }
  throw new Error(
    `Browser blocked opening Scene Assembler. Open manually: ${target}`,
  );
}

/**
 * Normalize fabric URL for Space-Time Host (live Sneeze scene from MySQL).
 * Rewrites legacy sample.msf → sneeze.msf and appends ?root= when missing.
 * @param {string} url
 * @param {{ rootIx?: number }} [opts]
 */
export function normalizeSpaceTimeFabricUrl(url, opts = {}) {
  const rootIx = Number(opts.rootIx ?? 1);
  let fabric = (url || '').replace(/\/$/, '');
  if (!fabric) return '';
  fabric = fabric.replace(/\/fabric\/sample\.msf(\?.*)?$/i, '/fabric/sneeze.msf$1');
  if (/\/fabric\/sneeze\.msf$/i.test(fabric) && rootIx > 0) {
    fabric += `?root=${rootIx}`;
  } else if (/sneeze\.msf/i.test(fabric) && !/[?&]root=/i.test(fabric) && rootIx > 0) {
    fabric += `${fabric.includes('?') ? '&' : '?'}root=${rootIx}`;
  }
  return fabric;
}

/**
 * Fabric URL for the native Space-Time Browser (not Scene Assembler HTML).
 * Uses sneeze.msf (live DB scene), not sample.msf (RP1 MVIO pointer only).
 * @param {object|null|undefined} cfg from mergeSpatialFabricConfig
 * @param {{ rootIx?: number }} [opts]
 */
export function buildSpaceTimeBrowserFabricUrl(cfg = {}, opts = {}) {
  const rootIx = Number(opts.rootIx ?? cfg.rootIx ?? 1);
  let directFabric = (cfg.fabricMsfUrl || cfg.fabric_msf_url || '').replace(/\/$/, '');
  const merged = mergeSpatialFabricConfig(cfg ?? {});
  if (!directFabric && merged.fabricMsfUrl) directFabric = merged.fabricMsfUrl;
  if (!directFabric && merged.msfPublicUrl) {
    directFabric = `${merged.msfPublicUrl.replace(/\/$/, '')}/fabric/sneeze.msf`;
  }
  return normalizeSpaceTimeFabricUrl(directFabric, { rootIx });
}

/**
 * Deep link consumed by spacetime-host (Phase B).
 * @param {string} fabricUrl
 */
export function buildSpaceTimeBrowserDeepLink(fabricUrl) {
  if (!fabricUrl) return '';
  const encoded = encodeURIComponent(fabricUrl);
  return `spacetime://fabric?url=${encoded}`;
}

/**
 * WebXR immersive fabric URL for Galaxy XR (Chrome on headset + nativeFaceRelay).
 * @param {object|null|undefined} cfg
 * @param {{ rootIx?: number, origin?: string }} [opts]
 */
export function buildSpaceTimeImmersivePageUrl(cfg = {}, opts = {}) {
  const merged = mergeSpatialFabricConfig(cfg ?? {});
  const fabricUrl = resolveBrowserReachableFabricUrl(
    buildSpaceTimeBrowserFabricUrl(merged, opts),
    merged,
    opts,
  );
  if (!fabricUrl) return '';
  const origin =
    opts.origin ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const params = new URLSearchParams({
    nativeFaceRelay: '1',
    remoteLog: '1',
    fabricUrl,
  });
  if (opts.useMainAvatar === true || opts.useMainAvatar === '1') {
    params.set('useMainAvatar', '1');
  } else if (typeof window !== 'undefined') {
    try {
      if (sessionStorage.getItem('opennexus.spacetimeXrVrmUrl')) {
        params.set('useMainAvatar', '1');
      }
    } catch {
      /* ignore */
    }
  }
  if (opts.vrmUrl) {
    params.set('vrmUrl', opts.vrmUrl);
  }
  return `${origin.replace(/\/$/, '')}/spacetime-xr?${params.toString()}`;
}

/**
 * Open Galaxy XR immersive fabric walker in a new tab (Surface / headset Chrome).
 * @param {object|null|undefined} cfg
 */
export function openSpaceTimeImmersive(cfg = {}) {
  const url = buildSpaceTimeImmersivePageUrl(cfg);
  if (!url) {
    throw new Error(
      'Space-Time XR needs MSF fabric URL — set VITE_RP1_FABRIC_MSF_URL or link MSF in API config.',
    );
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(url);
  }
  return { url, fabricUrl: buildSpaceTimeBrowserFabricUrl(cfg), copied: true };
}

/**
 * Ask 3DAIGC-API to launch Space-Time Browser on DGX, or return launch hints.
 * @param {object|null|undefined} cfg
 * @param {{ fabricMsfUrl?: string, apiEndpoint?: string }} [opts]
 */
export async function openSpaceTimeBrowser(cfg = {}, opts = {}) {
  const merged = mergeSpatialFabricConfig(cfg ?? {});
  const fabricUrl = opts.fabricMsfUrl
    ? normalizeSpaceTimeFabricUrl(opts.fabricMsfUrl, { rootIx: opts.rootIx })
    : buildSpaceTimeBrowserFabricUrl(merged, opts);
  if (!fabricUrl) {
    throw new Error(
      'Space-Time Browser needs MSF fabric URL — set VITE_RP1_FABRIC_MSF_URL or link MSF in API config.',
    );
  }

  const deepLink = buildSpaceTimeBrowserDeepLink(fabricUrl);
  const apiBase = normalizeApiBaseUrl(
    opts.apiEndpoint ?? import.meta.env.VITE_API_ENDPOINT ?? '',
  );

  if (apiBase) {
    try {
      const res = await fetch(
        apiUrl(apiBase, '/api/v1/spatial-fabric/open-space-time-browser'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...get3daigcAuthHeaders(),
          },
          body: JSON.stringify({ fabric_url: fabricUrl, deep_link: deepLink }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        console.log('[SpatialFabric] Space-Time Browser launch:', data);
        return { launched: true, fabricUrl, deepLink, ...data };
      }
      const errBody = await readSpatialFabricJson(res);
      throw new Error(
        formatSpatialFabricApiError(res, errBody, 'Space-Time Browser launch'),
      );
    } catch (err) {
      if (err instanceof Error && /Space-Time Browser launch failed/i.test(err.message)) {
        throw err;
      }
      console.warn('[SpatialFabric] Space-Time Browser API launch error', err);
      throw new Error(
        `Space-Time Browser launch failed: could not reach 3DAIGC-API at ${apiBase}. ` +
          'On Surface use /__dev_dgx_proxy and restart npm run dev so Vite forwards to DGX.',
      );
    }
  }

  const hint =
    `No API endpoint configured — on DGX run:\n` +
    `bash /home/sifr/SpaceTimeHost/scripts/run-dgx.sh --url '${fabricUrl}'\n\n` +
    `Deep link: ${deepLink}`;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(deepLink);
  }

  return { launched: false, fabricUrl, deepLink, hint };
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
