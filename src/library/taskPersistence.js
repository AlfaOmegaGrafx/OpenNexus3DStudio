/**
 * Persist Character Studio task list across refresh and route changes.
 */

import { TASK_TYPE_TO_FEATURE } from './aiModelsCatalog.js';
import { enrichCompletedJobPayload } from './taskModelUrl.js';

export const TASK_STORAGE_KEY = 'opennexus3d_tasks_v1';
export const DELETED_JOBS_STORAGE_KEY = 'opennexus3d_deleted_jobs_v1';
export const MAX_STORED_TASKS = 100;
export const MAX_DELETED_JOB_IDS = 500;

const FEATURE_TO_TASK_TYPE = Object.fromEntries(
  Object.entries(TASK_TYPE_TO_FEATURE)
    .filter(([, feature]) => feature)
    .map(([taskType, feature]) => [feature, taskType]),
);

const API_STATUS_TO_TASK_STATUS = {
  queued: 'pending',
  pending: 'pending',
  processing: 'running',
  running: 'running',
  completed: 'completed',
  success: 'completed',
  done: 'completed',
  succeeded: 'completed',
  failed: 'failed',
  error: 'failed',
  cancelled: 'failed',
  canceled: 'failed',
};

/**
 * @param {unknown} value
 * @returns {Date}
 */
function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const naiveApiIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
    const parsed = new Date(naiveApiIso.test(trimmed) ? `${trimmed}Z` : trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * @param {object} task
 * @returns {object}
 */
export function serializeTaskForStorage(task) {
  const { imageFile, ...rest } = task;
  return {
    ...rest,
    createdAt: task.createdAt ? toDate(task.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: task.updatedAt ? toDate(task.updatedAt).toISOString() : new Date().toISOString(),
    startedAt: task.startedAt ? toDate(task.startedAt).toISOString() : undefined,
    completedAt: task.completedAt ? toDate(task.completedAt).toISOString() : undefined,
    hadImageFile: Boolean(imageFile),
  };
}

/**
 * @param {object} stored
 * @returns {object}
 */
export function deserializeTaskFromStorage(stored) {
  if (!stored || typeof stored !== 'object') return null;
  const { hadImageFile, ...rest } = stored;
  return {
    ...rest,
    imageFile: null,
    createdAt: toDate(stored.createdAt),
    updatedAt: toDate(stored.updatedAt),
    startedAt: stored.startedAt ? toDate(stored.startedAt) : null,
    completedAt: stored.completedAt ? toDate(stored.completedAt) : null,
    hadImageFile: Boolean(hadImageFile),
  };
}

/**
 * @param {object} task
 * @param {object} job
 * @returns {object}
 */
export function applyJobTimestampsToTask(task, job) {
  if (!task || !job || typeof job !== 'object') return task;
  if (job.started_at) task.startedAt = toDate(job.started_at);
  else if (job.created_at && !task.startedAt) task.startedAt = toDate(job.created_at);
  if (job.completed_at) task.completedAt = toDate(job.completed_at);
  return task;
}

/** US Eastern — matches 3DAIGC-API job clock (`America/New_York`). */
export const TASK_JOB_TIMEZONE = 'America/New_York';

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatTaskTimestamp(value) {
  if (!value) return '—';
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TASK_JOB_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(date);

  const part = (type) => parts.find((entry) => entry.type === type)?.value ?? '';
  const dateStr = `${part('month')}-${part('day')}-${part('year')}`;
  const timeStr = `${part('hour')}:${part('minute')}:${part('second')} ${part('dayPeriod')}`.trim();
  const tz = part('timeZoneName');
  return tz ? `${dateStr} ${timeStr} ${tz}` : `${dateStr} ${timeStr}`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatTaskDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
}

/**
 * @param {object} task
 * @returns {number|null}
 */
export function getTaskElapsedMs(task) {
  if (!task || typeof task !== 'object') return null;
  const start = task.startedAt || task.createdAt;
  const end = task.completedAt;
  if (!start || !end) return null;
  const ms = toDate(end).getTime() - toDate(start).getTime();
  return ms >= 0 ? ms : null;
}

/**
 * @returns {{ version: number, apiEndpoint: string, tasks: object[], savedAt: string }|null}
 */
export function readTaskStorageSnapshot() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(TASK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {object[]} tasks
 * @param {string} [apiEndpoint]
 */
export function writeTaskStorageSnapshot(tasks, apiEndpoint = '') {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const serialized = tasks
      .slice(0, MAX_STORED_TASKS)
      .map(serializeTaskForStorage)
      .filter(Boolean);
    window.localStorage.setItem(
      TASK_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        apiEndpoint: apiEndpoint || '',
        tasks: serialized,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.warn('[taskPersistence] Failed to save tasks:', error?.message || error);
  }
}

/**
 * @param {object|null|undefined} task
 * @returns {string|null}
 */
export function resolveTaskJobId(task) {
  if (!task || typeof task !== 'object') return null;
  if (typeof task.job_id === 'string' && task.job_id.trim()) return task.job_id.trim();
  const nested = task.result;
  if (nested && typeof nested === 'object') {
    const fromResult = nested.job_id || nested.jobId;
    if (typeof fromResult === 'string' && fromResult.trim()) return fromResult.trim();
  }
  if (typeof task.id === 'string' && task.id.startsWith('job_')) {
    return task.id.slice(4);
  }
  return null;
}

/**
 * @returns {Set<string>}
 */
export function readDeletedJobIds() {
  if (typeof window === 'undefined' || !window.localStorage) return new Set();
  try {
    const raw = window.localStorage.getItem(DELETED_JOBS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === 'string' && id.trim()));
  } catch {
    return new Set();
  }
}

/**
 * @param {string} jobId
 */
export function markJobDeletedLocally(jobId) {
  if (!jobId || typeof window === 'undefined' || !window.localStorage) return;
  const ids = readDeletedJobIds();
  ids.add(jobId);
  const trimmed = Array.from(ids).slice(-MAX_DELETED_JOB_IDS);
  window.localStorage.setItem(DELETED_JOBS_STORAGE_KEY, JSON.stringify(trimmed));
}

/**
 * @param {string} jobId
 * @returns {boolean}
 */
export function isJobDeletedLocally(jobId) {
  if (!jobId) return false;
  return readDeletedJobIds().has(jobId);
}

/**
 * @param {object[]} tasks
 * @returns {object[]}
 */
export function sortTasksForDisplay(tasks) {
  return [...tasks].sort((a, b) => {
    const aTime = toDate(a?.createdAt).getTime();
    const bTime = toDate(b?.createdAt).getTime();
    return bTime - aTime;
  });
}

/**
 * @param {string} [apiEndpoint]
 * @returns {object[]}
 */
export function loadPersistedTasks(apiEndpoint = '') {
  const snapshot = readTaskStorageSnapshot();
  if (!snapshot?.tasks?.length) return [];
  const restored = snapshot.tasks
    .map(deserializeTaskFromStorage)
    .filter((task) => task && typeof task.id === 'string')
    .filter((task) => {
      const jobId = resolveTaskJobId(task);
      return !jobId || !isJobDeletedLocally(jobId);
    });
  if (!apiEndpoint || !snapshot.apiEndpoint) return restored;
  return restored;
}

/**
 * @param {string} feature
 * @returns {string}
 */
export function featureToTaskType(feature) {
  if (!feature || typeof feature !== 'string') return 'image-to-3d';
  return FEATURE_TO_TASK_TYPE[feature] || 'image-to-3d';
}

/**
 * @param {string} status
 * @returns {string}
 */
export function mapApiJobStatusToTaskStatus(status) {
  const key = String(status || '').toLowerCase();
  return API_STATUS_TO_TASK_STATUS[key] || 'running';
}

/**
 * @param {object} job
 * @returns {string}
 */
export function buildTaskPromptFromJob(job) {
  const inputs = job?.inputs && typeof job.inputs === 'object' ? job.inputs : {};
  const candidates = [
    inputs.world_name,
    inputs.prompt,
    inputs.text,
    job?.metadata?.feature_type,
    job?.feature,
    job?.job_id,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'API job';
}

/**
 * @param {object} job
 * @returns {string}
 */
export function buildTaskNameFromJob(job) {
  const type = featureToTaskType(job?.feature);
  const label = type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const prompt = buildTaskPromptFromJob(job);
  const shortPrompt = prompt.length > 30 ? `${prompt.slice(0, 30)}...` : prompt;
  return `${label} - ${shortPrompt}`;
}

/**
 * Build a UI task record from GET /jobs/history or /jobs/{id} payload.
 * @param {object} jobStatus
 * @param {object} [existing]
 * @returns {object}
 */
export function taskFromApiJob(jobStatus, existing = null) {
  const jobId = jobStatus?.job_id || jobStatus?.jobId;
  if (!jobId) return null;

  const status = mapApiJobStatusToTaskStatus(jobStatus?.status);
  const type = existing?.type || featureToTaskType(jobStatus?.feature);
  const prompt = existing?.prompt || buildTaskPromptFromJob(jobStatus);
  const resultPayload = jobStatus?.result && typeof jobStatus.result === 'object'
    ? jobStatus.result
    : null;

  const completedSource = resultPayload
    ? { ...jobStatus, result: resultPayload }
    : jobStatus?.status === 'completed' || jobStatus?.status === 'failed'
      ? jobStatus
      : null;
  const completedResult =
    completedSource && (status === 'completed' || status === 'failed')
      ? enrichCompletedJobPayload(completedSource, jobId, type)
      : existing?.result || null;

  const createdAt = existing?.createdAt || toDate(jobStatus?.created_at || Date.now());
  const updatedAt = toDate(
    jobStatus?.completed_at || jobStatus?.started_at || jobStatus?.created_at || Date.now(),
  );
  const startedAt =
    existing?.startedAt ||
    (jobStatus?.started_at
      ? toDate(jobStatus.started_at)
      : jobStatus?.created_at
        ? toDate(jobStatus.created_at)
        : null);
  const completedAt =
    status === 'completed' || status === 'failed'
      ? existing?.completedAt ||
        (jobStatus?.completed_at ? toDate(jobStatus.completed_at) : updatedAt)
      : existing?.completedAt || null;

  return {
    id: existing?.id || `job_${jobId}`,
    type,
    name: existing?.name || buildTaskNameFromJob(jobStatus),
    prompt,
    imageFile: null,
    options: existing?.options || {},
    status,
    progress: status === 'completed' ? 100 : status === 'failed' ? existing?.progress || 0 : existing?.progress || 10,
    progressIndeterminate: status === 'running' || status === 'pending',
    createdAt,
    updatedAt,
    startedAt,
    completedAt,
    job_id: jobId,
    result: status === 'completed' || status === 'failed' ? completedResult : existing?.result || { job_id: jobId },
    error:
      status === 'failed'
        ? jobStatus?.error || jobStatus?.message || existing?.error || 'Job failed'
        : existing?.error || null,
    syncedFromApi: true,
  };
}
