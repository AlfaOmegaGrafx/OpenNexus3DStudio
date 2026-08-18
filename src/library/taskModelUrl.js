/**
 * Resolve mesh download paths from 3DAIGC-API task results for viewport loading.
 * Aligns with Open3DStudio TaskItem (downloadUrl / mesh_url) and DGX Spark job payloads.
 */

export const DEV_DGX_PROXY_PREFIX = '/__dev_dgx_proxy';

const MESH_URL_KEYS = [
  'modelUrl',
  'downloadUrl',
  'mesh_url',
  'model_url',
  'output_mesh_path',
  'mesh_path',
  'output_path',
  'fileUrl',
  'result_url',
];

const MOTION_URL_KEYS = [
  'motion_url',
  'studio_motion_url',
  'mesh_url',
  'download_url',
  'downloadUrl',
  'modelUrl',
];

/** Server-side artifact paths (outputs/...) — not fetchable from the browser. */
const MOTION_ARTIFACT_PATH_KEYS = [
  'output_motion_path',
  'output_studio_motion_path',
];

/** Includes splat paths — use only for splat/world environment loads. */
const URL_KEYS = [
  ...MESH_URL_KEYS.slice(0, 5),
  'output_splat_path',
  ...MESH_URL_KEYS.slice(5),
];

const SPLAT_ONLY_FEATURES = new Set(['image_to_splat']);

const TERMINAL_SUCCESS = new Set(['completed', 'success', 'done', 'succeeded']);
const TERMINAL_FAILURE = new Set(['failed', 'error', 'failure', 'cancelled', 'canceled']);

/**
 * Kimodo text-to-motion jobs return studio_motion.json — not a viewport mesh.
 * @param {object|null|undefined} result
 * @returns {boolean}
 */
export function isTextToMotionTaskResult(result) {
  if (!result || typeof result !== 'object') return false;

  const feature = result.feature || result.result?.feature || null;
  const taskType = result.type || result.taskType || null;
  if (feature === 'text_to_motion' || taskType === 'text-to-motion') {
    return true;
  }

  const motionPath =
    result.output_studio_motion_path ||
    result.output_motion_path ||
    result.result?.output_studio_motion_path ||
    result.result?.output_motion_path;
  if (typeof motionPath === 'string' && motionPath.includes('studio_motion')) {
    return true;
  }

  const ext =
    result.mesh_file_info?.file_extension ||
    result.result?.mesh_file_info?.file_extension;
  if (ext === '.json') {
    const fmt =
      result.generation_info?.output_format ||
      result.result?.generation_info?.output_format;
    if (fmt === 'studio_motion' || motionPath) return true;
  }

  return false;
}

const SERVER_MESH_PATH_KEYS = [
  'output_mesh_path',
  'output_mesh_path_glb',
  'rigged_mesh_path',
  'mesh_path',
  'output_path',
  'file_path',
];

/**
 * True for DGX filesystem artifact paths the browser must not fetch
 * (e.g. `/outputs/model.glb`). Job download URLs and http(s) are excluded.
 * @param {string} [value]
 * @returns {boolean}
 */
export function isServerFilesystemArtifactPath(value) {
  if (typeof value !== 'string') return false;
  const path = value.trim();
  if (!path) return false;
  if (/^https?:\/\//i.test(path)) return false;
  if (path.startsWith('/api/')) return false;
  if (path.startsWith(DEV_DGX_PROXY_PREFIX)) return false;
  return (
    path.startsWith('/') ||
    path.startsWith('outputs/') ||
    path.startsWith('uploads/') ||
    path.includes('/outputs/') ||
    path.includes('/uploads/') ||
    /^[A-Za-z]:[\\/]/.test(path)
  );
}

/**
 * Server-side mesh path from a completed job status payload.
 * Used to chain auto-rig without downloading the GLB through Vite.
 * @param {object|null|undefined} jobStatus
 * @returns {string|null}
 */
export function extractServerMeshPathFromJob(jobStatus) {
  if (!jobStatus || typeof jobStatus !== 'object') return null;
  const bags = [jobStatus.result, jobStatus].filter((o) => o && typeof o === 'object');
  for (const bag of bags) {
    for (const key of SERVER_MESH_PATH_KEYS) {
      const value = bag[key];
      if (isServerFilesystemArtifactPath(value)) return value.trim();
    }
  }
  return null;
}

const IMAGE_URL_KEYS = [
  'image_url',
  'output_image_path',
  'preview_url',
];

/**
 * Text-to-image jobs (Krea 2) return PNG/WebP — not viewport meshes.
 * @param {object|null|undefined} result
 * @returns {boolean}
 */
export function isTextToImageTaskResult(result) {
  if (!result || typeof result !== 'object') return false;

  const feature = result.feature || result.result?.feature || null;
  const taskType = result.type || result.taskType || null;
  if (
    feature === 'text_to_image' ||
    feature === 'image_edit' ||
    taskType === 'text-to-image' ||
    taskType === 'image-edit'
  ) {
    return true;
  }

  const imagePath =
    result.output_image_path ||
    result.result?.output_image_path ||
    null;
  if (typeof imagePath === 'string' && /\.(png|webp|jpe?g)$/i.test(imagePath)) {
    const fmt =
      result.generation_info?.output_format ||
      result.result?.generation_info?.output_format;
    if (fmt === 'png' || fmt === 'webp' || imagePath.includes('/images/')) {
      return true;
    }
  }

  const ext =
    result.mesh_file_info?.file_extension ||
    result.result?.mesh_file_info?.file_extension;
  if (ext === '.png' || ext === '.webp') {
    const inference =
      result.generation_info?.inference_mode ||
      result.result?.generation_info?.inference_mode;
    if (
      inference === 'local_open_weights' ||
      inference === 'isolated_venv_subprocess' ||
      feature === 'text_to_image' ||
      feature === 'image_edit'
    ) {
      return true;
    }
  }

  return false;
}

export function resolveTextToImageDownloadUrl(task) {
  const payload = normalizeTaskLoadPayload(task);
  if (!payload) return null;
  const url = getTaskResultImageUrl(payload);
  if (url) return url;
  const jobId =
    payload.job_id ||
    payload.jobId ||
    (typeof task?.id === 'string' && task.id.startsWith('job_') ? task.id.slice(4) : null);
  if (
    jobId &&
    (payload.feature === 'text_to_image' ||
      payload.feature === 'image_edit' ||
      task?.type === 'text-to-image' ||
      task?.type === 'image-edit' ||
      isTextToImageTaskResult(payload))
  ) {
    return `/api/v1/system/jobs/${jobId}/download`;
  }
  return null;
}

/**
 * Strip scheme/host from absolute API asset URLs so the client can re-base via
 * VITE_API_ENDPOINT / `__dev_dgx_proxy` (avoids mixed-content + 127.0.0.1 from DGX).
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function toApiRelativeAssetPath(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/api/')) return trimmed;
  if (trimmed.includes(`${DEV_DGX_PROXY_PREFIX}/api/`)) {
    const idx = trimmed.indexOf('/api/');
    return idx >= 0 ? trimmed.slice(idx) : trimmed;
  }
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith('/api/')) {
      return `${parsed.pathname}${parsed.search || ''}`;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {object|null|undefined} result
 * @returns {string|null}
 */
export function getTaskResultImageUrl(result) {
  if (!result || typeof result !== 'object') return null;

  const nested = result.result && typeof result.result === 'object' ? result.result : null;
  const isImage =
    isTextToImageTaskResult(result) ||
    result?.feature === 'text_to_image' ||
    nested?.feature === 'text_to_image';

  // Prefer host-agnostic job download for T2I — API often returns absolute mesh_url
  // with 127.0.0.1 or LAN IP that breaks Surface HTTPS / Vite proxy fetches.
  if (isImage) {
    const jobPath =
      resolveJobDownloadPath(result) ||
      resolveJobDownloadPath(nested) ||
      toApiRelativeAssetPath(
        pickFetchableUrlFromObject(result, ['image_url', 'downloadUrl', 'modelUrl', 'mesh_url']) ||
          pickFetchableUrlFromObject(nested, ['image_url', 'downloadUrl', 'modelUrl', 'mesh_url']),
      );
    if (jobPath) return jobPath;
  }

  const fetchable =
    pickFetchableUrlFromObject(result, IMAGE_URL_KEYS) ||
    pickFetchableUrlFromObject(nested, IMAGE_URL_KEYS) ||
    pickFetchableUrlFromObject(result, ['image_url', 'downloadUrl', 'modelUrl', 'mesh_url']) ||
    pickFetchableUrlFromObject(nested, ['image_url', 'downloadUrl', 'modelUrl', 'mesh_url']);
  if (fetchable) {
    return toApiRelativeAssetPath(fetchable) || fetchable;
  }

  if (isImage) {
    return resolveJobDownloadPath(result) || resolveJobDownloadPath(nested);
  }

  return null;
}

function pickUrlFromObject(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/**
 * True when the client can fetch this value with HTTP (API download, proxy, absolute URL).
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export function isClientFetchableAssetUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('/api/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.includes(DEV_DGX_PROXY_PREFIX)
  );
}

function pickFetchableUrlFromObject(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && isClientFetchableAssetUrl(value)) {
      return value.trim();
    }
  }
  return null;
}

function resolveJobDownloadPath(result) {
  const jobId = result?.job_id || result?.jobId;
  if (typeof jobId === 'string' && jobId.length > 0) {
    return `/api/v1/system/jobs/${jobId}/download`;
  }
  return null;
}

/**
 * @param {object|null|undefined} result
 * @returns {string|null}
 */
export function getTaskResultModelUrl(result) {
  if (!result || typeof result !== 'object') return null;
  if (isTextToMotionTaskResult(result)) return null;
  if (isTextToImageTaskResult(result)) return null;

  const top = pickUrlFromObject(result, URL_KEYS);
  if (top) return top;

  const nested = result.result;
  if (nested && typeof nested === 'object') {
    const nestedUrl = pickUrlFromObject(nested, [
      'mesh_url',
      'model_url',
      'download_url',
      'output_splat_path',
      'output_mesh_path',
    ]);
    if (nestedUrl) return nestedUrl;
  }

  return resolveJobDownloadPath(result);
}

/**
 * Job thumbnail URL when the API generated one (may 404 — callers should fall back).
 * @param {object|null|undefined} result
 * @param {string|null|undefined} [jobId]
 * @returns {string|null}
 */
export function getTaskResultThumbnailUrl(result, jobId) {
  if (!result || typeof result !== 'object') {
    if (typeof jobId === 'string' && jobId.length > 0) {
      return `/api/v1/system/jobs/${jobId}/thumbnail`;
    }
    return null;
  }
  const fromResult =
    pickUrlFromObject(result, ['thumbnail_url', 'thumbnail_path']) ||
    (result.result && typeof result.result === 'object'
      ? pickUrlFromObject(result.result, ['thumbnail_url', 'thumbnail_path'])
      : null);
  if (fromResult) return fromResult;
  const id = jobId || result.job_id || result.jobId || result.result?.job_id;
  if (typeof id === 'string' && id.length > 0) {
    return `/api/v1/system/jobs/${id}/thumbnail`;
  }
  return null;
}

/**
 * Mesh/GLB download URL for viewport "Load Model" — never prefers splat paths.
 * @param {object|null|undefined} result
 * @returns {string|null}
 */
export function getTaskResultMeshUrl(result) {
  if (!result || typeof result !== 'object') return null;
  if (isTextToMotionTaskResult(result)) return null;
  if (isTextToImageTaskResult(result)) return null;

  const feature = result.feature || result.result?.feature || null;
  const splatOnly =
    SPLAT_ONLY_FEATURES.has(feature) || result.pipelineStage === 'splat_preview';

  if (splatOnly) {
    return getTaskResultModelUrl(result);
  }

  const top = pickUrlFromObject(result, MESH_URL_KEYS);
  if (top) return top;

  const nested = result.result;
  if (nested && typeof nested === 'object') {
    const nestedUrl = pickUrlFromObject(nested, [
      'mesh_url',
      'model_url',
      'download_url',
      'output_mesh_path',
      'mesh_path',
      'output_path',
    ]);
    if (nestedUrl) return nestedUrl;
  }

  return resolveJobDownloadPath(result);
}

/**
 * studio_motion.json URL for text-to-motion jobs (Kimodo → VRM playback).
 * @param {object|null|undefined} result
 * @returns {string|null}
 */
export function getTaskResultMotionUrl(result) {
  if (!result || typeof result !== 'object') return null;

  const nested = result.result && typeof result.result === 'object' ? result.result : null;

  const fetchable =
    pickFetchableUrlFromObject(result, MOTION_URL_KEYS) ||
    pickFetchableUrlFromObject(nested, MOTION_URL_KEYS);
  if (fetchable) return fetchable;

  const jobId =
    result.job_id ||
    result.jobId ||
    nested?.job_id ||
    nested?.jobId ||
    null;
  if (typeof jobId === 'string' && jobId.length > 0) {
    return `/api/v1/system/jobs/${jobId}/download`;
  }

  return null;
}

/**
 * FBX download URL for auto-rig jobs (armature often remains in FBX when GLB is mesh-only).
 * @param {object|null|undefined} result
 * @param {string} [jobId]
 * @returns {string|null}
 */
export function getTaskResultFbxUrl(result, jobId = null) {
  const id =
    jobId ||
    result?.job_id ||
    result?.jobId ||
    result?.result?.job_id ||
    null;

  if (typeof id === 'string' && id.length > 0) {
    return `/api/v1/system/jobs/${id}/download?asset=fbx`;
  }

  const pickPath = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    const path = obj.output_fbx_path;
    if (typeof path === 'string' && path.trim().length > 0) {
      return path.trim();
    }
    const glb = obj.output_mesh_path;
    if (typeof glb === 'string' && glb.toLowerCase().endsWith('.glb')) {
      return glb.replace(/\.glb$/i, '.fbx');
    }
    return null;
  };

  return pickPath(result) || pickPath(result?.result);
}

/**
 * @param {object|null|undefined} result
 * @returns {{ bone_count: number, rig_info: object|null, job_id: string|null }}
 */
export function getAutoRigMetaFromResult(result) {
  const payload = result?.result && typeof result.result === 'object' ? result.result : result;
  const boneCount = Number(payload?.bone_count);
  return {
    bone_count: Number.isFinite(boneCount) && boneCount > 0 ? boneCount : 0,
    rig_info: payload?.rig_info && typeof payload.rig_info === 'object' ? payload.rig_info : null,
    job_id:
      result?.job_id ||
      result?.jobId ||
      payload?.job_id ||
      null,
  };
}

/**
 * Infer file extension from a completed job result (mesh_file_info or output paths).
 * @param {object|null|undefined} result
 * @returns {string}
 */
export function getTaskResultFileExtension(result, options = {}) {
  if (!result || typeof result !== 'object') return '';

  if (isTextToImageTaskResult(result)) {
    const nested = result.result && typeof result.result === 'object' ? result.result : null;
    for (const obj of [result, nested]) {
      if (!obj) continue;
      const fromInfo = obj.mesh_file_info?.file_extension;
      if (typeof fromInfo === 'string' && fromInfo.length > 1) {
        return fromInfo.replace(/^\./, '').toLowerCase();
      }
      const imagePath = obj.output_image_path;
      if (typeof imagePath === 'string') {
        const ext = inferModelFileExtensionFromSource(imagePath);
        if (ext) return ext;
      }
      const fmt = obj.generation_info?.output_format;
      if (fmt === 'png' || fmt === 'webp') return fmt;
    }
  }

  const preferMesh = options.preferMesh !== false;
  const pathKeys = preferMesh
    ? ['output_image_path', 'output_mesh_path', 'mesh_path', 'output_path', 'output_splat_path']
    : ['output_splat_path', 'output_image_path', 'output_mesh_path', 'mesh_path', 'output_path'];

  const pickFromObject = (obj) => {
    if (!obj || typeof obj !== 'object') return '';
    const fromInfo = obj.mesh_file_info?.file_extension;
    if (typeof fromInfo === 'string' && fromInfo.length > 1) {
      const ext = fromInfo.replace(/^\./, '').toLowerCase();
      if (preferMesh && ['ply', 'splat', 'spz', 'ksplat', 'sog'].includes(ext)) {
        // mesh_file_info can describe world env; fall through to mesh paths
      } else if (ext) {
        return ext;
      }
    }
    // Clothing / template wrap primary artifact is VRM even when download URL has no suffix.
    const fmt = String(obj.format || obj.generation_info?.output_format || '').toLowerCase();
    if (fmt === 'vrm') return 'vrm';
    const vrmPath = obj.output_vrm_path || obj.download_urls?.vrm;
    if (typeof vrmPath === 'string' && vrmPath.trim()) {
      const ext = inferModelFileExtensionFromSource(vrmPath);
      if (ext) return ext;
      if (/\.vrm(\?|#|$)/i.test(vrmPath)) return 'vrm';
      return 'vrm';
    }
    for (const key of pathKeys) {
      const path = obj[key];
      if (typeof path === 'string' && path.trim()) {
        const ext = inferModelFileExtensionFromSource(path);
        if (ext) return ext;
      }
    }
    const downloadUrl = pickUrlFromObject(obj, MESH_URL_KEYS) || resolveJobDownloadPath(obj);
    if (downloadUrl) {
      return inferModelFileExtensionFromSource(downloadUrl);
    }
    return '';
  };

  return pickFromObject(result) || pickFromObject(result.result);
}

/**
 * Infer loader extension from URL pathname (handles hostnames like dgx-spark.local).
 * @param {string} source
 * @returns {string}
 */
export function inferModelFileExtensionFromSource(source) {
  if (!source || typeof source !== 'string') return '';

  if (source instanceof File) {
    const name = source.name || '';
    const dot = name.lastIndexOf('.');
    if (dot > 0) return name.slice(dot + 1).toLowerCase();
    return '';
  }

  try {
    const base =
      typeof window !== 'undefined' && window.location?.href
        ? window.location.href
        : 'http://localhost/';
    const pathname = new URL(source, base).pathname.toLowerCase();

    if (pathname.endsWith('/download') || /\/jobs\/[^/]+\/download$/.test(pathname)) {
      const params = new URL(source, base).searchParams;
      if (params.get('asset') === 'fbx') return 'fbx';
      if (params.get('asset') === 'manifest') return 'json';
      return 'glb';
    }

    const dot = pathname.lastIndexOf('.');
    if (dot > 0 && dot < pathname.length - 1) {
      const ext = pathname.slice(dot + 1);
      if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
    }

    if (/mesh|download|output|\.glb|gltf/i.test(pathname)) return 'glb';
    if (/\.(ply|splat|spz|ksplat|sog)(?:$|[/?#])/i.test(pathname)) {
      const match = pathname.match(/\.(ply|splat|spz|ksplat|sog)(?:$|[/?#])/i);
      if (match) return match[1].toLowerCase();
    }
  } catch {
    const pathOnly = source.split('?')[0].split('#')[0];
    if (/\/download$/i.test(pathOnly)) return 'glb';
  }

  return '';
}

/**
 * Collapse accidental duplicate Vite DGX proxy prefixes.
 * e.g. /__dev_dgx_proxy/__dev_dgx_proxy/api/... → /__dev_dgx_proxy/api/...
 * @param {string} url
 * @returns {string}
 */
export function collapseDevDgxProxyPrefix(url) {
  if (!url || typeof url !== 'string') return url;
  const p = DEV_DGX_PROXY_PREFIX;
  let out = url.trim();
  const doubledPath = `${p}${p}/`;
  while (out.includes(doubledPath)) {
    out = out.replace(doubledPath, `${p}/`);
  }
  // Absolute same-origin URLs with a doubled proxy path
  try {
    if (/^https?:\/\//i.test(out)) {
      const parsed = new URL(out);
      if (parsed.pathname.includes(doubledPath) || parsed.pathname.startsWith(`${p}${p}/`)) {
        parsed.pathname = parsed.pathname.split(doubledPath).join(`${p}/`);
        while (parsed.pathname.startsWith(`${p}${p}/`)) {
          parsed.pathname = `${p}/${parsed.pathname.slice((p + p + '/').length)}`;
        }
        return parsed.toString();
      }
    }
  } catch {
    // keep collapsed relative form
  }
  return out;
}

/**
 * In dev, route cross-origin API asset URLs through the Vite DGX proxy (same-origin, avoids CORS).
 * @param {string} url
 * @returns {string}
 */
export function maybeProxyApiAssetUrl(url) {
  if (!url || typeof window === 'undefined' || !import.meta.env.DEV) return url;

  try {
    const collapsed = collapseDevDgxProxyPrefix(url);
    const parsed = new URL(collapsed, window.location.origin);
    if (parsed.pathname.startsWith(`${DEV_DGX_PROXY_PREFIX}/`)) return collapsed;
    if (!parsed.pathname.startsWith('/api/')) return collapsed;
    if (parsed.origin === window.location.origin) return collapsed;
    return `${window.location.origin}${DEV_DGX_PROXY_PREFIX}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * @param {string} rawUrl
 * @param {string} [apiEndpoint]
 * @returns {string}
 */
export function resolveTaskModelUrl(rawUrl, apiEndpoint = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;

  let trimmed = collapseDevDgxProxyPrefix(rawUrl.trim());
  const asRelativeApi = toApiRelativeAssetPath(trimmed);
  if (asRelativeApi) trimmed = asRelativeApi;

  if (trimmed.startsWith('/')) {
    const base = (apiEndpoint || '').replace(/\/$/, '');
    const alreadyProxied =
      trimmed === DEV_DGX_PROXY_PREFIX ||
      trimmed.startsWith(`${DEV_DGX_PROXY_PREFIX}/`);
    const alreadyHasBase =
      !!base &&
      base.startsWith('/') &&
      (trimmed === base || trimmed.startsWith(`${base}/`));
    if (base.startsWith('/') && !alreadyHasBase && !alreadyProxied) {
      trimmed = `${base}${trimmed}`;
    } else if (base && !base.startsWith('/') && !/^https?:\/\//i.test(trimmed)) {
      trimmed = `${base}${trimmed}`;
    } else if (!base && typeof window !== 'undefined' && window.location?.origin) {
      trimmed = `${window.location.origin}${trimmed}`;
    }
  } else if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('blob:') && !trimmed.startsWith('data:')) {
    const base = (apiEndpoint || '').replace(/\/$/, '');
    trimmed = base ? `${base}/${trimmed.replace(/^\/+/, '')}` : `http://${trimmed.replace(/^\/+/, '')}`;
  }

  return maybeProxyApiAssetUrl(collapseDevDgxProxyPrefix(trimmed));
}

/**
 * @param {object|null|undefined} jobStatus
 * @param {string} jobId
 * @param {string} apiBase
 * @returns {string|null}
 */
export function buildJobDownloadUrl(jobStatus, jobId, apiBase) {
  const base = (apiBase || '').replace(/\/$/, '');
  if (!base || !jobId) return null;

  const r = jobStatus?.result || {};
  let modelUrl =
    getTaskResultModelUrl(jobStatus) ||
    getTaskResultModelUrl({ result: r, job_id: jobId });

  if (!modelUrl) {
    modelUrl = `/api/v1/system/jobs/${jobId}/download`;
  }

  modelUrl = collapseDevDgxProxyPrefix(modelUrl);

  if (modelUrl.startsWith('/')) {
    const alreadyHasBase =
      modelUrl === base ||
      modelUrl.startsWith(`${base}/`) ||
      modelUrl.startsWith(`${DEV_DGX_PROXY_PREFIX}/`);
    if (alreadyHasBase) return modelUrl;
    return collapseDevDgxProxyPrefix(`${base}${modelUrl}`);
  }
  if (!/^https?:\/\//i.test(modelUrl) && base) {
    return collapseDevDgxProxyPrefix(`${base}/${modelUrl.replace(/^\/+/, '')}`);
  }
  return modelUrl;
}

/**
 * Flatten nested `job.result` fields onto the load payload so synced DGX tasks
 * expose mesh_url, world_manifest_url, mesh_file_info, etc. at the top level.
 * @param {object|null|undefined} jobStatus
 * @param {string|null} [jobId]
 * @param {string|null} [taskType]
 * @returns {object|null}
 */
export function enrichCompletedJobPayload(jobStatus, jobId = null, taskType = null) {
  if (!jobStatus || typeof jobStatus !== 'object') return null;

  const id = jobId || jobStatus.job_id || jobStatus.jobId || null;
  const nested =
    jobStatus.result && typeof jobStatus.result === 'object' ? jobStatus.result : null;
  const downloadPath = id ? `/api/v1/system/jobs/${id}/download` : null;
  const meshUrl = jobStatus.mesh_url || nested?.mesh_url || downloadPath;
  const normalizedTaskType =
    typeof taskType === 'string' ? taskType.replace(/-/g, '_') : null;
  const isWorldJob =
    normalizedTaskType === 'image_to_world' ||
    normalizedTaskType === 'environment_scan' ||
    nested?.feature === 'image_to_world' ||
    nested?.feature === 'environment_scan' ||
    jobStatus.feature === 'image_to_world' ||
    jobStatus.feature === 'environment_scan' ||
    nested?.pipeline === 'image-to-world' ||
    nested?.pipeline === 'environment-scan' ||
    nested?.pipeline === 'lingbot_map_environment_scan' ||
    jobStatus.pipeline === 'image-to-world' ||
    jobStatus.pipeline === 'environment-scan' ||
    jobStatus.pipeline === 'lingbot_map_environment_scan';
  const worldManifestUrl =
    jobStatus.world_manifest_url ||
    nested?.world_manifest_url ||
    (isWorldJob && id ? `/api/v1/system/jobs/${id}/download?asset=manifest` : null);
  const worldBaseUrl =
    jobStatus.world_base_url ||
    nested?.world_base_url ||
    (isWorldJob && id ? `/api/v1/system/jobs/${id}/world/` : null);
  const isMotionJob =
    normalizedTaskType === 'text_to_motion' ||
    nested?.feature === 'text_to_motion' ||
    jobStatus.feature === 'text_to_motion' ||
    pickUrlFromObject(jobStatus, MOTION_ARTIFACT_PATH_KEYS) ||
    pickUrlFromObject(nested, MOTION_ARTIFACT_PATH_KEYS);
  const isImageJob =
    normalizedTaskType === 'text_to_image' ||
    nested?.feature === 'text_to_image' ||
    jobStatus.feature === 'text_to_image' ||
    isTextToImageTaskResult(jobStatus) ||
    (nested && isTextToImageTaskResult(nested));
  const imageUrl = isImageJob
    ? downloadPath ||
      toApiRelativeAssetPath(
        pickFetchableUrlFromObject(jobStatus, IMAGE_URL_KEYS) ||
          pickFetchableUrlFromObject(nested, IMAGE_URL_KEYS) ||
          pickFetchableUrlFromObject(jobStatus, ['mesh_url', 'image_url']) ||
          pickFetchableUrlFromObject(nested, ['mesh_url', 'image_url']),
      )
    : pickFetchableUrlFromObject(jobStatus, IMAGE_URL_KEYS) ||
      pickFetchableUrlFromObject(nested, IMAGE_URL_KEYS) ||
      pickFetchableUrlFromObject(jobStatus, ['mesh_url', 'image_url']) ||
      pickFetchableUrlFromObject(nested, ['mesh_url', 'image_url']) ||
      null;
  const motionUrl =
    pickFetchableUrlFromObject(jobStatus, ['motion_url', 'studio_motion_url']) ||
    pickFetchableUrlFromObject(nested, ['motion_url', 'studio_motion_url']) ||
    pickFetchableUrlFromObject(jobStatus, ['mesh_url']) ||
    pickFetchableUrlFromObject(nested, ['mesh_url']) ||
    (isMotionJob && downloadPath ? downloadPath : null);

  const payload = {
    ...jobStatus,
    job_id: id,
    feature: nested?.feature || jobStatus.feature || normalizedTaskType || null,
    pipeline: nested?.pipeline || jobStatus.pipeline || null,
    motion_url: motionUrl,
    output_studio_motion_path:
      nested?.output_studio_motion_path || jobStatus.output_studio_motion_path || null,
    world_manifest_url: worldManifestUrl,
    world_base_url: worldBaseUrl,
    mesh_file_info: jobStatus.mesh_file_info || nested?.mesh_file_info || null,
    pipelineStage:
      taskType === 'image-to-world' ||
      taskType === 'environment-scan' ||
      nested?.feature === 'image_to_world' ||
      nested?.feature === 'environment_scan'
        ? 'world_package'
        : jobStatus.pipelineStage,
    result: nested || jobStatus.result,
  };

  if (isMotionJob) {
    payload.feature = 'text_to_motion';
    delete payload.mesh_url;
    delete payload.modelUrl;
    delete payload.downloadUrl;
    return payload;
  }

  if (isImageJob) {
    payload.feature = 'text_to_image';
    payload.image_url = imageUrl;
    delete payload.mesh_url;
    delete payload.modelUrl;
    delete payload.downloadUrl;
    return payload;
  }

  return {
    ...payload,
    mesh_url: meshUrl,
    modelUrl: jobStatus.modelUrl || meshUrl,
    downloadUrl: jobStatus.downloadUrl || jobStatus.modelUrl || meshUrl,
  };
}

/**
 * Merge a UI task row into a single object for viewport load handlers.
 * @param {object|null|undefined} task
 * @returns {object|null}
 */
export function normalizeTaskLoadPayload(task) {
  if (!task || typeof task !== 'object') return null;

  const jobId =
    task.job_id ||
    task.result?.job_id ||
    task.result?.jobId ||
    (typeof task.id === 'string' && task.id.startsWith('job_') ? task.id.slice(4) : null);

  const base =
    task.result && typeof task.result === 'object'
      ? { ...task.result }
      : { job_id: jobId, feature: task.type };

  if (jobId && !base.job_id) base.job_id = jobId;
  if (!base.feature && task.type) {
    base.feature = String(task.type).replace(/-/g, '_');
  }

  return enrichCompletedJobPayload(base, jobId, task.type);
}

/**
 * Map GET /api/v1/system/jobs/{job_id} payload to UI progress.
 * API contract: progress is 0.0–1.0; workers often leave it at 0 until completed (then 1.0).
 *
 * @param {object} jobStatus
 * @returns {{ percent: number|null, indeterminate: boolean, statusLabel: string, failed: boolean }}
 */
export function extractJobProgress(jobStatus) {
  const status = String(
    jobStatus.status || jobStatus.job_status || jobStatus.state || 'unknown',
  ).toLowerCase();

  const statusLabel = String(
    jobStatus.message ||
      jobStatus.status_message ||
      jobStatus.stage ||
      status,
  );

  if (TERMINAL_FAILURE.has(status)) {
    return { percent: null, indeterminate: false, statusLabel, failed: true };
  }

  if (TERMINAL_SUCCESS.has(status)) {
    return { percent: 100, indeterminate: false, statusLabel, failed: false };
  }

  const raw = jobStatus.progress;
  if (typeof raw === 'number' && !Number.isNaN(raw) && raw > 0) {
    const percent =
      raw <= 1 ? Math.round(raw * 100) : Math.max(1, Math.min(99, Math.round(raw)));
    return { percent, indeterminate: false, statusLabel, failed: false };
  }

  const messageText = statusLabel;
  const percentMatch = messageText.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    const percent = Math.max(1, Math.min(99, Math.round(parseFloat(percentMatch[1]))));
    return { percent, indeterminate: false, statusLabel, failed: false };
  }

  return { percent: null, indeterminate: true, statusLabel, failed: false };
}
