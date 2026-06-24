/**
 * Galaxy XR voice job → OpenNexus3DStudio handoff (DGX API is source of truth).
 */

/**
 * @param {string} studioBase e.g. https://100.94.108.18:3000
 * @param {string} jobId
 * @param {{ autoLoad?: boolean, openTasks?: boolean, prompt?: string }} [opts]
 * @returns {string}
 */
export function buildStudioHandoffUrl(studioBase, jobId, opts = {}) {
  const base = String(studioBase || '').trim().replace(/\/$/, '');
  if (!base || !jobId) return '';
  const params = new URLSearchParams();
  params.set('jobId', jobId);
  if (opts.autoLoad !== false) params.set('autoLoad', '1');
  if (opts.openTasks !== false) params.set('tasks', '1');
  if (opts.prompt) params.set('prompt', opts.prompt);
  return `${base}/?${params.toString()}`;
}

/**
 * Read handoff query params from the current page URL.
 * @returns {{ jobId: string, autoLoad: boolean, openTasks: boolean, prompt: string|null }|null}
 */
export function parseJobHandoffFromLocation(locationLike = typeof window !== 'undefined' ? window.location : null) {
  if (!locationLike?.search) return null;
  const params = new URLSearchParams(locationLike.search);
  const jobId = (params.get('jobId') || params.get('job') || '').trim();
  if (!jobId) return null;
  return {
    jobId,
    autoLoad: params.get('autoLoad') !== '0',
    openTasks: params.get('tasks') === '1' || params.get('openTasks') === '1',
    prompt: params.get('prompt') || null,
  };
}
