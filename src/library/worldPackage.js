/**
 * World Package — manifest format for explorable splat environments + mesh props.
 * @see docs/WORLD_PACKAGE.md
 */

import { ensureAbsoluteUrl, get3daigcAuthHeaders } from './taskManager.js';
import {
  enrichCompletedJobPayload,
  inferModelFileExtensionFromSource,
  normalizeTaskLoadPayload,
  resolveTaskModelUrl,
} from './taskModelUrl.js';

const WORLD_MANIFEST_VERSION = 1;

/**
 * @typedef {object} WorldTransform
 * @property {number[]} [position]
 * @property {number[]} [rotation] quaternion xyzw
 * @property {number} [rotation_y]
 * @property {number} [scale]
 */

/**
 * @typedef {object} WorldProp
 * @property {string} id
 * @property {string} [role]
 * @property {string} mesh_url
 * @property {WorldTransform} [transform]
 * @property {object} [interaction]
 */

/**
 * @typedef {object} WorldPackage
 * @property {string} id
 * @property {number} version
 * @property {string} name
 * @property {object} spawn
 * @property {object} environment
 * @property {WorldProp[]} props
 */

/**
 * @param {unknown} value
 * @returns {WorldPackage}
 */
export function parseWorldPackage(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('World manifest must be a JSON object');
  }
  const manifest = /** @type {Record<string, unknown>} */ (value);
  const version = Number(manifest.version ?? WORLD_MANIFEST_VERSION);
  if (!manifest.id || typeof manifest.id !== 'string') {
    throw new Error('World manifest requires string "id"');
  }
  if (!manifest.environment || typeof manifest.environment !== 'object') {
    throw new Error('World manifest requires "environment"');
  }
  const env = /** @type {Record<string, unknown>} */ (manifest.environment);
  if (!env.url || typeof env.url !== 'string') {
    throw new Error('World manifest environment requires "url"');
  }
  const props = Array.isArray(manifest.props) ? manifest.props : [];
  return {
    id: manifest.id,
    version,
    name: typeof manifest.name === 'string' ? manifest.name : manifest.id,
    source_image: typeof manifest.source_image === 'string' ? manifest.source_image : null,
    coordinate_system: manifest.coordinate_system === 'z-up' ? 'z-up' : 'y-up',
    spawn: normalizeSpawn(manifest.spawn),
    environment: {
      type: env.type === 'gaussian_splat' ? 'gaussian_splat' : 'gaussian_splat',
      url: env.url,
      format: typeof env.format === 'string' ? env.format : inferFormatFromUrl(env.url),
      renderer: env.renderer === 'spark' ? 'spark' : 'spark',
      transform: normalizeTransform(env.transform),
      collider_url:
        typeof env.collider_url === 'string'
          ? env.collider_url
          : typeof env.collision_mesh_url === 'string'
            ? env.collision_mesh_url
            : null,
    },
    props: props.map((p, index) => normalizeProp(p, index)),
    audio: manifest.audio && typeof manifest.audio === 'object' ? manifest.audio : {},
    metadata:
      manifest.metadata && typeof manifest.metadata === 'object' ? manifest.metadata : {},
  };
}

/**
 * @param {string} manifestUrl
 * @returns {Promise<WorldPackage>}
 */
export async function fetchWorldPackage(manifestUrl, apiEndpoint = '') {
  const resolved = resolveTaskModelUrl(manifestUrl, apiEndpoint) || ensureAbsoluteUrl(manifestUrl);
  console.log('[World] Fetching manifest:', resolved);
  const response = await fetch(resolved, {
    headers: { Accept: 'application/json', ...get3daigcAuthHeaders() },
  });
  if (!response.ok) {
    throw new Error(`Failed to load world manifest (${response.status}): ${resolved}`);
  }
  const json = await response.json();
  const manifest = parseWorldPackage(json);
  console.log('[World] Manifest parsed:', manifest.id, manifest.environment?.url);
  return manifest;
}

/**
 * Derive `/api/v1/system/jobs/{id}/world/` from a job manifest download URL.
 * @param {string} manifestUrl
 * @returns {string|null}
 */
export function inferWorldAssetBaseUrlFromManifestUrl(manifestUrl) {
  if (!manifestUrl || typeof manifestUrl !== 'string') return null;
  const match = manifestUrl.match(/\/api\/v1\/system\/jobs\/([^/?#]+)\/download/i);
  if (!match?.[1]) return null;
  return `/api/v1/system/jobs/${match[1]}/world/`;
}

/**
 * @param {string} manifestUrl
 * @param {string} relativeOrAbsolute
 * @returns {string}
 */
export function resolveWorldAssetUrl(manifestUrl, relativeOrAbsolute) {
  const asset = String(relativeOrAbsolute || '').trim();
  if (!asset) return '';
  if (/^https?:\/\//i.test(asset) || asset.startsWith('blob:')) return asset;
  if (asset.startsWith('/')) {
    return ensureAbsoluteUrl(asset);
  }
  const base = String(manifestUrl || '').replace(/[#?].*$/, '');
  let normalizedBase = base;
  if (!base.endsWith('/')) {
    const slash = base.lastIndexOf('/');
    normalizedBase = slash >= 0 ? base.slice(0, slash + 1) : `${base}/`;
  }
  try {
    return new URL(asset, normalizedBase).href;
  } catch {
    return ensureAbsoluteUrl(`${normalizedBase}${asset}`);
  }
}

/**
 * Resolve all asset URLs in a manifest against its base URL and optional API endpoint.
 * @param {WorldPackage} manifest
 * @param {string} manifestUrl
 * @param {string} [apiEndpoint]
 */
export function resolveWorldPackageUrls(manifest, manifestUrl, apiEndpoint = '', options = {}) {
  const baseManifestUrl = resolveTaskModelUrl(manifestUrl, apiEndpoint) || manifestUrl;
  const inferredWorldBase =
    inferWorldAssetBaseUrlFromManifestUrl(manifestUrl) ||
    inferWorldAssetBaseUrlFromManifestUrl(baseManifestUrl);
  const assetBaseUrl =
    (options.worldBaseUrl && resolveTaskModelUrl(options.worldBaseUrl, apiEndpoint)) ||
    (inferredWorldBase && resolveTaskModelUrl(inferredWorldBase, apiEndpoint)) ||
    baseManifestUrl;
  const environmentUrl = resolveTaskModelUrl(
    resolveWorldAssetUrl(assetBaseUrl, manifest.environment.url),
    apiEndpoint,
  );
  const colliderRaw = manifest.environment.collider_url || manifest.environment.collision_mesh_url;
  const colliderUrl = colliderRaw ? resolveWorldAssetUrl(assetBaseUrl, colliderRaw) : null;
  const props = manifest.props.map((prop) => ({
    ...prop,
    mesh_url: resolveWorldAssetUrl(assetBaseUrl, prop.mesh_url),
  }));
  return {
    ...manifest,
    manifestUrl: baseManifestUrl,
    environment: {
      ...manifest.environment,
      url: environmentUrl,
      collider_url: colliderUrl,
      fileExtension:
        manifest.environment.format ||
        inferModelFileExtensionFromSource(environmentUrl) ||
        'ply',
    },
    props,
  };
}

/**
 * @param {string} url
 */
function inferFormatFromUrl(url) {
  const ext = inferModelFileExtensionFromSource(url);
  return ext || 'ply';
}

/** @param {unknown} spawn */
function normalizeSpawn(spawn) {
  const s = spawn && typeof spawn === 'object' ? /** @type {Record<string, unknown>} */ (spawn) : {};
  const position = Array.isArray(s.position) && s.position.length >= 3 ? s.position : [0, 0, 0];
  return {
    position: [Number(position[0]) || 0, Number(position[1]) || 0, Number(position[2]) || 0],
    rotation_y: Number(s.rotation_y) || 0,
    player_height: Number(s.player_height) || 1.6,
  };
}

/** @param {unknown} transform */
function normalizeTransform(transform) {
  const t =
    transform && typeof transform === 'object' ? /** @type {Record<string, unknown>} */ (transform) : {};
  const position = Array.isArray(t.position) && t.position.length >= 3 ? t.position : [0, 0, 0];
  const rotation = Array.isArray(t.rotation) && t.rotation.length >= 4 ? t.rotation : [1, 0, 0, 0];
  return {
    position: [Number(position[0]) || 0, Number(position[1]) || 0, Number(position[2]) || 0],
    rotation: [
      Number(rotation[0]) ?? 1,
      Number(rotation[1]) ?? 0,
      Number(rotation[2]) ?? 0,
      Number(rotation[3]) ?? 0,
    ],
    rotation_y: Number(t.rotation_y) || 0,
    scale: Number(t.scale) || 1,
  };
}

/** @param {unknown} prop @param {number} index */
function normalizeProp(prop, index) {
  const p = prop && typeof prop === 'object' ? /** @type {Record<string, unknown>} */ (prop) : {};
  const id = typeof p.id === 'string' && p.id.trim() ? p.id : `prop_${index + 1}`;
  if (!p.mesh_url || typeof p.mesh_url !== 'string') {
    throw new Error(`World prop "${id}" requires mesh_url`);
  }
  return {
    id,
    role: typeof p.role === 'string' ? p.role : 'interactable',
    mesh_url: p.mesh_url,
    transform: normalizeTransform(p.transform),
    interaction:
      p.interaction && typeof p.interaction === 'object'
        ? p.interaction
        : { type: 'grabbable', collider: 'auto_bbox' },
    generation: p.generation && typeof p.generation === 'object' ? p.generation : null,
  };
}

/**
 * @typedef {object} WorldsIndex
 * @property {{ id: string, name?: string, manifest: string, thumbnail?: string }[]} worlds
 * @property {string} [active_world_id]
 */

/**
 * @param {string} [indexUrl]
 * @returns {Promise<WorldsIndex>}
 */
export async function fetchWorldsIndex(indexUrl = '/worlds/index.json') {
  const resolved = ensureAbsoluteUrl(indexUrl);
  const response = await fetch(resolved, { headers: { Accept: 'application/json' } });
  if (response.status === 404) {
    console.warn('[World] Static worlds index missing (404):', resolved);
    return { worlds: [], active_world_id: null };
  }
  if (!response.ok) {
    throw new Error(`Failed to load worlds index (${response.status}): ${resolved}`);
  }
  const json = await response.json();
  const worlds = Array.isArray(json.worlds) ? json.worlds : [];
  return {
    worlds: worlds
      .filter((w) => w && typeof w.manifest === 'string')
      .map((w) => ({
        id: w.id || w.manifest,
        name: w.name || w.id || 'World',
        manifest: resolveWorldAssetUrl(resolved, w.manifest),
        thumbnail: w.thumbnail ? resolveWorldAssetUrl(resolved, w.thumbnail) : null,
      })),
    active_world_id: typeof json.active_world_id === 'string' ? json.active_world_id : null,
  };
}

/**
 * @param {object|null|undefined} result
 * @returns {string|null}
 */
export function getWorldManifestUrlFromTaskResult(result) {
  if (!result || typeof result !== 'object') return null;
  for (const key of ['world_manifest_url', 'worldManifestUrl', 'manifest_url']) {
    const value = result[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const nested = result.result;
  if (nested && typeof nested === 'object') {
    for (const key of ['world_manifest_url', 'world_manifest_path', 'manifest_url']) {
      const value = nested[key];
      if (typeof value === 'string' && value.trim()) {
        const path = value.trim();
        if (path.includes('/download?asset=manifest')) return path;
        if (path.endsWith('.json')) return path;
      }
    }
  }
  const jobId = result.job_id || result.jobId || nested?.job_id;
  if (typeof jobId === 'string' && jobId.length > 0) {
    if (nested?.world_manifest_path || result.world_manifest_path) {
      return `/api/v1/system/jobs/${jobId}/download?asset=manifest`;
    }
    if (
      nested?.feature === 'image_to_world' ||
      result.feature === 'image_to_world' ||
      nested?.pipeline === 'image-to-world' ||
      result.pipeline === 'image-to-world'
    ) {
      return `/api/v1/system/jobs/${jobId}/download?asset=manifest`;
    }
  }
  return null;
}

/**
 * Build world library entries from completed Image-to-World tasks (API manifests).
 * @param {object[]} tasks
 * @param {string} [apiEndpoint]
 * @returns {{ id: string, name: string, manifest: string }[]}
 */
export function listWorldsFromCompletedTasks(tasks, apiEndpoint = '') {
  if (!Array.isArray(tasks)) return [];
  const seen = new Set();
  const worlds = [];

  for (const task of tasks) {
    if (!task || task.status !== 'completed') continue;
    const payload =
      normalizeTaskLoadPayload(task) ||
      enrichCompletedJobPayload(task.result, task.job_id, task.type);
    if (!payload || !isWorldLayerTaskResult(payload)) continue;

    const manifestPath = getWorldManifestUrlFromTaskResult(payload);
    if (!manifestPath) continue;

    const manifest = resolveTaskModelUrl(manifestPath, apiEndpoint) || manifestPath;
    const id = String(task.job_id || task.id || manifest);
    if (seen.has(id)) continue;
    seen.add(id);

    const label =
      task.name ||
      (typeof task.prompt === 'string' && task.prompt.trim()
        ? task.prompt.trim().slice(0, 48)
        : null) ||
      `World ${id.slice(0, 8)}`;

    worlds.push({ id, name: label, manifest });
  }

  return worlds.reverse();
}

const SPLAT_FILE_EXTENSIONS = new Set(['ply', 'splat', 'spz', 'ksplat', 'sog']);

/**
 * Full world package (manifest + splat env + props) — not splat-only preview.
 * @param {object|null|undefined} result
 */
export function isFullWorldPackageTaskResult(result) {
  if (!result || typeof result !== 'object') return false;
  if (getWorldManifestUrlFromTaskResult(result)) return true;
  if (result.feature === 'image_to_world') return true;
  if (result.pipeline === 'image-to-world') return true;
  if (result.pipelineStage === 'world_package') return true;
  return false;
}

/**
 * Splat environment only (TripoSplat preview, avatar optional splat) — loads to worldRoot.
 * @param {object|null|undefined} result
 */
export function isSplatEnvironmentTaskResult(result) {
  if (!result || typeof result !== 'object') return false;
  if (getWorldManifestUrlFromTaskResult(result)) return false;
  if (result.pipelineStage === 'splat_preview') return true;
  if (result.feature === 'image_to_splat') return true;
  if (result.output_mesh_path || result.result?.output_mesh_path) return false;
  const modelUrl =
    result.modelUrl ||
    result.downloadUrl ||
    result.result?.modelUrl ||
    result.result?.downloadUrl;
  const ext = inferModelFileExtensionFromSource(modelUrl);
  if (ext && SPLAT_FILE_EXTENSIONS.has(ext)) return true;
  return false;
}

/** Either a full world package or a splat-only environment (world layer, not player mesh). */
export function isWorldLayerTaskResult(result) {
  return isFullWorldPackageTaskResult(result) || isSplatEnvironmentTaskResult(result);
}
