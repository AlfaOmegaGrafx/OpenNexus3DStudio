/**
 * Human-readable names for generated 3D objects (tasks, RP1 publish, DGX job sync).
 */

export const OBJECT_NAME_MAX_LEN = 64;

export function normalizeObjectName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, OBJECT_NAME_MAX_LEN);
}

export function slugifyObjectName(value, fallback = 'opennexus-mesh') {
  const normalized = normalizeObjectName(value);
  const stem = (normalized || fallback)
    .slice(0, 48)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return stem || fallback;
}

export function buildTaskDisplayName(taskType, objectName, promptFallback = '') {
  const name = normalizeObjectName(objectName);
  if (name) return name;
  const prompt = typeof promptFallback === 'string' ? promptFallback.trim() : '';
  const typeLabel = String(taskType || 'task')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (prompt) {
    const short = prompt.length > 30 ? `${prompt.slice(0, 30)}...` : prompt;
    return `${typeLabel} - ${short}`;
  }
  return typeLabel;
}

export function resolveObjectNameFromJob(job) {
  const inputs = job?.inputs && typeof job.inputs === 'object' ? job.inputs : {};
  const meta = job?.metadata && typeof job.metadata === 'object' ? job.metadata : {};
  return (
    normalizeObjectName(inputs.object_name) ||
    normalizeObjectName(meta.object_name) ||
    normalizeObjectName(inputs.world_name) ||
    null
  );
}

export function objectNameFromFilename(filename) {
  if (typeof filename !== 'string' || !filename.trim()) return null;
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return normalizeObjectName(stem);
}

export function withObjectNamePayload(payload, options) {
  const name = normalizeObjectName(options?.object_name);
  if (!name) return payload;
  return { ...payload, object_name: name };
}

/**
 * @param {string} [defaultValue]
 * @returns {string|null}
 */
export function requireObjectNameFromOptions(options) {
  const name = normalizeObjectName(options?.object_name);
  if (!name) {
    throw new Error('Object name is required before starting a generation job.');
  }
  return name;
}

/**
 * @param {string} [defaultValue]
 * @returns {string|null}
 */
export function promptForObjectName(defaultValue = '') {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
    return normalizeObjectName(defaultValue);
  }
  const result = window.prompt('Name this 3D object:', defaultValue || '');
  return normalizeObjectName(result || '');
}
