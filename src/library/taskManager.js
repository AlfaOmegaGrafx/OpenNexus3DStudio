/**
 * TaskManager - Manages AI generation tasks and workflows
 * Similar to the task management in OpenNexus3DStudio but focused on 3DAIGC workflows
 *
 * HTTP targets 3DAIGC-API (AlfaOmegaGrafx/3DAIGC-API: mesh_generation.py, system.py).
 * There is no api.md in this repo; backend should publish OpenAPI or a consumer contract doc.
 */
import axios from 'axios';
import { logger } from './logger.js';
import { isLocalDev } from './runtimeUi.js';
import { performanceMonitor } from './performanceMonitor.js';
import { rollbackManager } from './rollbackManager.js';
import {
  buildJobDownloadUrl,
  enrichCompletedJobPayload,
  extractJobProgress,
  extractServerMeshPathFromJob,
  getTaskResultModelUrl,
  isTextToImageTaskResult,
  isTextToMotionTaskResult,
  resolveTaskModelUrl,
} from './taskModelUrl.js';
import {
  getDefaultAutoRigOutputFormat,
  getDefaultModelForFeature,
  resolveAutoRigModelForTask,
  resolveMeshModelForAvatarFromImage,
  AVATAR_MESH_DECIMATION_TARGET,
  API_MAX_MESH_VERTICES,
  PIPELINE_MESH_DECIMATION_TARGET,
  PIPELINE_MESH_SIMPLIFY_DEFAULT,
  clampPipelineDecimationTarget,
  getPipelineSafeMeshGenerationDefaults,
  isQuadRemeshModel,
} from './aiModelsCatalog.js';
import {
  buildTaskDisplayName,
  normalizeObjectName,
  withObjectNamePayload,
} from './objectNameUtils.js';
import {
  AUTO_RIG_MODES,
  buildTemplateAutoRigOptions,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  normalizeHumanoidTemplateId,
  TEMPLATE_RIG_MODEL_ID,
  APPEARANCE_COMPONENT_RIG_MODEL_ID,
  ARC2AVATAR_TASK_TYPE,
  ARC2AVATAR_IMAGE_TO_HEAD_PATH,
  ARC2AVATAR_MODEL_ID,
  fetchArc2AvatarStatus,
} from './avatarPipelineCatalog.js';
import {
  CREATURE_TEMPLATE_RIG_MODEL_ID,
  DEFAULT_CREATURE_TEMPLATE_ID,
  normalizeCreatureTemplateId,
} from './creaturePipelineCatalog.js';
import {
  applyJobTimestampsToTask,
  isApiJobStale,
  isJobDeletedLocally,
  isRunningTaskDetached,
  isTaskStale,
  loadPersistedTasks,
  mapApiJobStatusToTaskStatus,
  markJobDeletedLocally,
  partitionStaleTasks,
  resolveTaskJobId,
  sortTasksForDisplay,
  STALE_RUNNING_TASK_ERROR,
  taskFromApiJob,
  writeTaskStorageSnapshot,
} from './taskPersistence.js';

/** Transient poll failures — keep waiting; do not fail the task. */
export function isTransientApiPollError(error) {
  if (!error) return false;
  const status = error.response?.status;
  if (status != null && status >= 500) return true;
  if (status === 408 || status === 429) return true;
  const code = error.code;
  if (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ECONNREFUSED' ||
    code === 'ERR_CONNECTION_REFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ERR_BAD_RESPONSE'
  ) {
    return true;
  }
  const msg = String(error.message || '');
  return (
    /network error/i.test(msg) ||
    /timeout/i.test(msg) ||
    /ECONNREFUSED/i.test(msg) ||
    /socket hang up/i.test(msg) ||
    /Failed to fetch/i.test(msg)
  );
}

/**
 * How many consecutive transient poll failures before giving up.
 * Env-scan / world jobs can outlive brief uvicorn reloads and Vite proxy blips.
 */
export function maxConsecutiveTransientPollFailures(pollIntervalMs = 3000) {
  // ~5 minutes of continuous outage (Krea / env-scan jobs can exceed 2 min).
  const interval = Math.max(1000, Number(pollIntervalMs) || 3000);
  return Math.max(30, Math.ceil(300_000 / interval));
}

export function ensureAbsoluteUrl(url) {
  let s = (url || '').trim();
  if (!s) return '';
  // Same-origin path (e.g. Vite dev proxy) — required when the page is HTTPS and the real API is HTTP-only.
  if (s.startsWith('/')) {
    const path = s.replace(/\/$/, '') || '/';
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path === '/' ? '' : path}`;
    }
    return path;
  }
  s = s.replace(/\/$/, '');
  // Fix malformed scheme (e.g. "http/host" -> "http://host") so we never double-prepend
  const normalized = /^https?:\/[^/]/.test(s) ? s.replace(/^(https?):\//, '$1://') : s;
  return /^https?:\/\//i.test(normalized) ? normalized : `http://${normalized}`;
}

/**
 * Strip accidental /api/v1/... suffix from API base (common mis-set VITE_API_ENDPOINT).
 * @param {string} url
 * @returns {string}
 */
export function normalizeApiBaseUrl(url) {
  const raw = (url || '').trim();
  if (!raw) return '';
  const pathOnly = raw.startsWith('/');
  const abs = ensureAbsoluteUrl(raw);
  const stripped = abs.replace(/\/api\/v\d+(?:\/.*)?$/i, '').replace(/\/$/, '');
  if (pathOnly && typeof window !== 'undefined' && window.location?.origin) {
    try {
      const pathname = new URL(stripped).pathname.replace(/\/$/, '') || '';
      return pathname || '/';
    } catch {
      return raw.replace(/\/api\/v\d+(?:\/.*)?$/i, '').replace(/\/$/, '') || '/';
    }
  }
  return stripped;
}

/**
 * Downscale raster images so max(width,height) <= maxSide (3DAIGC-API commonly caps at 2048).
 * No-op in non-browser or if decode fails. Output JPEG for predictable size/type.
 * @param {File} imageFile
 * @param {number} maxSide
 * @returns {Promise<File>}
 */
export async function resizeImageFor3daigc(imageFile, maxSide = 2048) {
  if (!imageFile || !imageFile.type?.startsWith('image/')) return imageFile;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return imageFile;
  }
  if (!maxSide || maxSide < 64) return imageFile;

  let bitmap;
  try {
    bitmap = await createImageBitmap(imageFile);
  } catch {
    return imageFile;
  }

  try {
    const { width, height } = bitmap;
    if (width <= maxSide && height <= maxSide) {
      return imageFile;
    }
    const scale = maxSide / Math.max(width, height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageFile;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        0.92
      );
    });
    const baseName = (imageFile.name || 'image').replace(/\.[^.]+$/, '');
    const out = new File([blob], `${baseName}_resized.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
    logger.info('Image resized for API limits', {
      from: `${width}x${height}`,
      to: `${w}x${h}`,
      maxSide
    });
    return out;
  } catch (e) {
    logger.warn('Image resize failed; using original file', { message: e?.message });
    return imageFile;
  } finally {
    try {
      bitmap.close();
    } catch {
      // ignore
    }
  }
}

/** Optional Bearer token when 3DAIGC-API has security.api_key_required (see verify_api_key in backend). */
export function get3daigcAuthHeaders() {
  const token = (import.meta.env.VITE_3DAIGC_API_KEY || '').trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export class TaskManager {
  constructor(apiEndpoint = null) {
    this.apiEndpoint = normalizeApiBaseUrl(apiEndpoint ?? import.meta.env.VITE_API_ENDPOINT ?? '');
    this.tasks = new Map();
    this.activeTaskId = null;
    this.isConnected = false;
    this.eventListeners = new Map();
    this._persistTimer = null;
    this._resumingJobs = new Set();
    this._hydrateFromStorage();
    
    // Supported task types
    this.supportedTypes = [
      'text-to-3d',
      'image-to-3d',
      'image-to-raw-mesh',
      'mesh-painting',
      'mesh-painting-text',
      'mesh-segmentation',
      'auto-rigging',
      'mesh-retopology',
      'mesh-uv-unwrapping',
      'mesh-editing-text',
      'mesh-editing-image',
      'image-to-splat',
      'avatar-from-image',
      ARC2AVATAR_TASK_TYPE,
      'image-to-world',
      'environment-scan',
      'text-to-image',
      'image-edit',
      'text-to-motion',
    ];
  }

  /**
   * Check API connection with improved error handling
   */
  async checkConnection() {
    if (!this.apiEndpoint || !this.apiEndpoint.trim()) {
      this.isConnected = false;
      this.emit('connectionStatusChanged', { connected: false, endpoint: this.apiEndpoint });
      return false;
    }
    try {
      const startTime = Date.now();
      let response;
      const base = ensureAbsoluteUrl(normalizeApiBaseUrl(this.apiEndpoint || '')).replace(/\/$/, '');
      if (!base) {
        this.isConnected = false;
        this.emit('connectionStatusChanged', { connected: false, endpoint: this.apiEndpoint });
        return false;
      }
      const healthCandidates = [
        `${base}/health`,
        `${base}/api/v1/system/health`
      ];
      try {
        let lastHealthErr = null;
        for (const healthUrl of healthCandidates) {
          try {
            response = await axios.get(healthUrl, {
              timeout: 5000,
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...get3daigcAuthHeaders()
              },
              validateStatus: (status) => status >= 200 && status < 500
            });
            if (response.status === 200) break;
            lastHealthErr = new Error(`Health ${healthUrl} returned ${response.status}`);
          } catch (e) {
            lastHealthErr = e;
          }
        }
        if (!response || response.status !== 200) {
          throw lastHealthErr || new Error('Health check failed');
        }
      } catch (error) {
        // If health endpoint fails, try root endpoint as fallback
        if (
          error.code === 'ERR_NETWORK' ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ECONNREFUSED' ||
          error.code === 'ERR_CONNECTION_REFUSED'
        ) {
          try {
            response = await axios.get(`${base}/`, { 
              timeout: 3000,
              validateStatus: () => true // Accept any status
            });
          } catch (fallbackError) {
            throw error; // Throw original error if fallback also fails
          }
        } else {
          throw error;
        }
      }
      
      const responseTime = Date.now() - startTime;
      const wasConnected = this.isConnected;
      this.isConnected = response.status === 200;
      
      // Log connection status changes
      if (wasConnected !== this.isConnected) {
        if (this.isConnected) {
          console.log(`✅ API connected to ${this.apiEndpoint} (${responseTime}ms)`);
          if (response.data) {
            console.log(`   Status: ${response.data.status || 'OK'}`);
            if (response.data.services) {
              const availableServices = Object.keys(response.data.services).filter(
                key => response.data.services[key] === 'available'
              );
              console.log(`   Available services: ${availableServices.join(', ')}`);
            }
          }
        } else {
          console.warn(`⚠️ API disconnected from ${this.apiEndpoint}`);
        }
      }
      
      this.emit('connectionStatusChanged', { 
        connected: this.isConnected, 
        responseTime,
        endpoint: this.apiEndpoint,
        status: response.status,
        data: response.data
      });
      
      return this.isConnected;
    } catch (error) {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      
      // Provide detailed error information
      let errorDetails = {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        timeout: error.code === 'ECONNABORTED',
        networkError: error.code === 'ERR_NETWORK',
        connectionRefused: error.code === 'ECONNREFUSED' || error.code === 'ERR_CONNECTION_REFUSED'
      };
      
      // Log errors with structured logging (never throw so app keeps working)
      if (wasConnected || !this.lastErrorTime || Date.now() - this.lastErrorTime > 30000) {
        try {
          logger.error(
            'API connection failed',
            error,
            {
              endpoint: this.apiEndpoint,
              wasConnected,
              errorDetails,
              recovery: errorDetails.connectionRefused
                ? isLocalDev
                  ? 'Set VITE_API_ENDPOINT to your API server URL (e.g. DGX Sparks)'
                  : 'Connect a backend API in your hosted instance'
                : 'Check server accessibility',
            }
          );
        } catch (logErr) {
          console.warn('API connection failed (log suppressed):', error?.message || error);
        }
        this.lastErrorTime = Date.now();
      }
      
      this.emit('connectionStatusChanged', { 
        connected: false, 
        error: errorDetails,
        endpoint: this.apiEndpoint
      });
      return false;
    }
  }

  /**
   * Set API endpoint
   * @param {string} endpoint - New API endpoint
   */
  setApiEndpoint(endpoint) {
    this.apiEndpoint = normalizeApiBaseUrl(endpoint);
    this.emit('apiEndpointChanged', { endpoint: this.apiEndpoint });
  }

  /** Current API base URL (same-origin proxy path or absolute http(s) URL). */
  getApiEndpoint() {
    return this.apiEndpoint || '';
  }

  /**
   * Create a new task
   * @param {Object} taskData - Task configuration
   */
  createTask(taskData) {
    console.log('TaskManager: Creating task with data:', taskData);
    
    const {
      type,
      prompt,
      imageFile = null,
      options = {}
    } = taskData;

    if (!this.supportedTypes.includes(type)) {
      throw new Error(`Unsupported task type: ${type}`);
    }

    const objectName = normalizeObjectName(options?.object_name);
    if (!objectName) {
      throw new Error('Object name is required');
    }
    const taskOptions = { ...options, object_name: objectName };

    const taskId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const safePrompt = typeof prompt === 'string' ? prompt : '';
    const task = {
      id: taskId,
      type,
      name: buildTaskDisplayName(type, objectName, safePrompt),
      prompt: safePrompt,
      imageFile,
      options: taskOptions,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      result: null,
      error: null
    };

    this.tasks.set(taskId, task);
    this.schedulePersist();
    console.log('TaskManager: Task created and stored:', task);
    console.log('TaskManager: About to emit taskCreated event');
    this.emit('taskCreated', { task });
    console.log('TaskManager: TaskCreated event emitted');
    console.log('TaskManager: Event listeners count:', this.listenerCount('taskCreated'));
    
    return task;
  }

  /**
   * Retry function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {number} maxRetries - Maximum number of retries (default: 3)
   * @param {number} initialDelay - Initial delay in ms (default: 1000)
   * @param {Function} shouldRetry - Function to determine if error should be retried (default: retry on network errors)
   */
  async retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000, shouldRetry = null) {
    const defaultShouldRetry = (error) => {
      // Retry on network errors, timeouts, and 5xx server errors
      return error.code === 'ERR_NETWORK' || 
             error.code === 'ECONNABORTED' || 
             error.code === 'ECONNREFUSED' ||
             error.code === 'ERR_CONNECTION_REFUSED' ||
             (error.response && error.response.status >= 500);
    };
    
    const retryCheck = shouldRetry || defaultShouldRetry;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries || !retryCheck(error)) {
          throw error;
        }
        
        const delay = initialDelay * Math.pow(2, attempt);
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
          error: error.message,
          code: error.code,
          status: error.response?.status
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Start a task
   * @param {string} taskId - Task ID
   * @param {Object} modelData - Optional model data for model-based tasks
   */
  async startTask(taskId, modelData = null) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== 'pending') {
      throw new Error(`Task cannot be started. Current status: ${task.status}`);
    }

    // Create snapshot before task execution for rollback
    const snapshotKey = `task_${taskId}`;
    rollbackManager.createSnapshot(snapshotKey, {
      task: { ...task },
      tasks: Array.from(this.tasks.entries())
    });

    this.activeTaskId = taskId;
    try {
      this.updateTaskStatus(taskId, 'running', 0);
      this.emit('taskStarted', { task });

      const result = await this.executeTask(task, modelData);

      // 3DAIGC-API mesh-generation returns MeshGenerationResponse { job_id, status, message } and
      // completed job payloads use result.mesh_url (see system.py get_job_status). Await polling so
      // callers (e.g. TaskContext) see a single completed/failed lifecycle.
      if (result && result.job_id) {
        console.log('Job queued, polling for job_id:', result.job_id);
        this.tasks.get(taskId).job_id = result.job_id;

        const pollOptions =
          task.type === 'image-to-3d' ||
          task.type === 'image-to-splat' ||
          task.type === 'avatar-from-image' ||
          task.type === 'image-to-world' ||
          task.type === 'environment-scan' ||
          task.type === 'text-to-image' ||
          task.type === 'image-edit' ||
          task.type === 'text-to-motion' ||
          task.type === 'auto-rigging'
            ? {
                maxAttempts:
                  task.type === 'environment-scan'
                    ? 1200
                    : task.type === 'auto-rigging'
                      ? 900
                      : 600,
                pollInterval: 3000,
              }
            : {};
        const pollIntervalMs = pollOptions.pollInterval ?? 3000;
        const maxPollAttempts = pollOptions.maxAttempts ?? 200;
        const finalResult = await this.pollJobStatus(
          result.job_id,
          taskId,
          pollIntervalMs,
          maxPollAttempts
        );
        console.log('Job polling completed:', finalResult);

        if (finalResult && finalResult.statusPollingUnavailable) {
          const row = this.tasks.get(taskId);
          if (row) row.statusMessage = 'Submitted — use Sync DGX when the job finishes';
          this.updateTaskStatus(taskId, 'running', 10, finalResult, null);
          this.emit('taskUpdated', { task: this.tasks.get(taskId) });
          return finalResult;
        }
        const completedResult = this._buildCompletedTaskResult(
          finalResult,
          result.job_id,
          task.type,
        );
        this.updateTaskStatus(taskId, 'completed', 100, completedResult);
        this.emit('taskCompleted', { task: this.tasks.get(taskId), result: completedResult });
        const isMotionTask = task.type === 'text-to-motion';
        const isImageTask =
          task.type === 'text-to-image' ||
          task.type === 'image-edit' ||
          isTextToImageTaskResult(completedResult);
        const modelUrl = isMotionTask || isImageTask ? null : getTaskResultModelUrl(completedResult);
        const isWorldTask =
          task.type === 'image-to-world' ||
          task.type === 'environment-scan' ||
          completedResult.pipelineStage === 'world_package' ||
          completedResult.feature === 'image_to_world' ||
          completedResult.feature === 'environment_scan';
        const taskRow = this.tasks.get(taskId);
        if (isMotionTask) {
          window.dispatchEvent(
            new CustomEvent('taskCompleted', {
              detail: { taskId, task: taskRow, result: completedResult },
            }),
          );
        } else if (isImageTask) {
          // Raster image — no viewport auto-load; TaskManager row shows preview + chain to image-to-3d.
        } else if (modelUrl || isWorldTask) {
          console.log('Auto-loading task result:', {
            modelUrl,
            isWorldTask,
            taskType: taskRow?.type,
            manifest: completedResult?.world_manifest_url,
          });
          window.dispatchEvent(
            new CustomEvent('taskCompleted', {
              detail: { taskId, task: taskRow, result: completedResult },
            }),
          );
        }
        // Return enriched payload so Studio pipeline gets image_url / relative download paths.
        return completedResult;
      }

      // Direct result (no async job)
      this.updateTaskStatus(taskId, 'completed', 100, result);
      this.emit('taskCompleted', { task: this.tasks.get(taskId), result });
      const modelUrl = getTaskResultModelUrl(result);
      if (modelUrl) {
        window.dispatchEvent(
          new CustomEvent('taskCompleted', {
            detail: { taskId, task: this.tasks.get(taskId), result },
          }),
        );
      }
      return result;
    } catch (error) {
      if (error.code === 'JOB_NOT_FOUND' || error.jobNotFound) {
        const jobId = resolveTaskJobId(task);
        if (jobId) markJobDeletedLocally(jobId);
        this.removeTask(taskId);
        this.emit('taskRemoved', { task, reason: 'expired' });
        throw error;
      }

      logger.error('Task execution failed', error, {
        taskId,
        taskType: task.type,
        taskName: task.name,
        progress: task.progress
      });
      
      // Attempt rollback (optional - don't fail if rollback fails)
      try {
        const rollbackState = rollbackManager.rollback(`task_${taskId}`);
        logger.info('Task rolled back', { taskId, rollbackState });
      } catch (rollbackError) {
        // Rollback is optional - log but don't fail the error handling
        logger.warn('Rollback failed (this is non-critical)', rollbackError, { taskId });
      }
      
      const errorMessage =
        TaskManager.formatApiError(error) ||
        error.originalError?.message ||
        'Unknown error occurred';
      console.error(`Task ${taskId} failed:`, errorMessage);
      
      this.updateTaskStatus(taskId, 'failed', task.progress, null, errorMessage);
      this.emit('taskFailed', { task, error });
      throw error;
    } finally {
      this.activeTaskId = null;
    }
  }

  emitTaskProgress(payload = {}) {
    const data = { ...payload };
    if (this.activeTaskId && !data.taskId) {
      data.taskId = this.activeTaskId;
    }
    if (data.taskId) {
      const t = this.tasks.get(data.taskId);
      if (t) {
        if (data.indeterminate != null) {
          t.progressIndeterminate = data.indeterminate;
        }
        if (data.progress != null) {
          t.progress = data.progress;
          t.progressIndeterminate = false;
        } else if (data.indeterminate) {
          t.progress = null;
        }
        if (data.status) t.statusMessage = data.status;
        data.task = t;
      }
    }
    this.emit('taskProgress', data);
  }

  /**
   * Upload mesh for JSON-body API tasks (returns mesh_file_id).
   * Auto-decimates when over API_MAX_MESH_VERTICES / faces (e.g. dense TRELLIS GLBs).
   * @param {Blob|File|ArrayBuffer} modelData
   * @param {string} [filename]
   * @param {object} [uploadOptions]
   * @param {'auto-rig'|string} [uploadOptions.purpose] When `auto-rig`, preserve UVs/textures
   */
  async uploadMeshFile(modelData, filename = 'model.glb', uploadOptions = {}) {
    const forAutoRig = uploadOptions?.purpose === 'auto-rig';
    let uploadBlob = modelData;
    if (modelData) {
      try {
        this.emitTaskProgress({
          indeterminate: true,
          status: forAutoRig
            ? 'Preparing mesh for auto-rig (preserving textures)…'
            : 'Checking mesh for API limits…',
        });
        const arrayBuffer =
          modelData instanceof ArrayBuffer
            ? modelData
            : await modelData.arrayBuffer();
        const { prepareGlbForApiUpload } = await import('./glbCompress.js');
        const prepared = await prepareGlbForApiUpload(arrayBuffer, {
          maxVertices: API_MAX_MESH_VERTICES,
          maxFaces: API_MAX_MESH_VERTICES,
          preserveTextures: forAutoRig,
          allowPositionOnlyFallback: !forAutoRig,
        });
        if (prepared.stats.decimated) {
          logger.info('Decimated mesh for API upload', prepared.stats);
          this.emitTaskProgress({
            indeterminate: true,
            status: `Decimated mesh ${prepared.stats.sourceVerts.toLocaleString()} → ${prepared.stats.verts.toLocaleString()} verts…`,
          });
        }
        uploadBlob = new Blob([prepared.buffer], { type: 'model/gltf-binary' });
      } catch (prepError) {
        const msg = String(prepError?.message || prepError);
        // Never silently upload an oversize mesh — WASM / decimate failures must surface.
        if (
          /skinned|Could not decimate|API max|WebAssembly|CompileError|Aborted|exceeds maximum/i.test(
            msg,
          )
        ) {
          throw prepError instanceof Error
            ? prepError
            : new Error(`Mesh upload prep failed: ${msg}`);
        }
        logger.warn('Mesh upload prep skipped', { error: msg });
        uploadBlob =
          modelData instanceof ArrayBuffer
            ? new Blob([modelData], { type: 'model/gltf-binary' })
            : modelData;
      }
    }

    const endpoint = `${this.apiEndpoint}/api/v1/file-upload/mesh`;
    const formData = new FormData();
    formData.append('file', uploadBlob, filename);
    const response = await axios.post(endpoint, formData, {
      headers: { ...get3daigcAuthHeaders() },
      timeout: 300000,
      onUploadProgress: (e) => {
        if (e.total) {
          const uploadPct = Math.min(15, Math.round((e.loaded * 15) / e.total));
          this.emitTaskProgress({
            progress: uploadPct,
            status: 'Uploading mesh…',
            indeterminate: false,
          });
        }
      },
    });
    const fileId =
      response.data?.file_id ||
      response.data?.mesh_file_id ||
      response.data?.id;
    if (!fileId) {
      throw new Error(
        `Mesh upload succeeded but no file_id in response: ${JSON.stringify(response.data)}`,
      );
    }
    return fileId;
  }

  static formatNetworkError(endpoint, error) {
    const httpsPage =
      typeof window !== 'undefined' && window.location?.protocol === 'https:';
    const directHttpApi = /^https?:\/\//i.test(endpoint || '');
    const proxyHint =
      httpsPage && directHttpApi && !String(endpoint).includes('__dev_dgx_proxy')
        ? ' On HTTPS dev, set VITE_API_ENDPOINT=/__dev_dgx_proxy and DEV_API_PROXY_TARGET=http://<DGX_LAN_IP>:7842 in .env.'
        : '';
    const e = new Error(
      `Network error: No response from server at ${endpoint}. Ensure the API server is running.${proxyHint}`,
    );
    e.originalError = error;
    return e;
  }

  static formatApiError(error) {
    const data = error?.response?.data;
    if (typeof data === 'string' && data.length > 0) {
      return [error?.message, data].filter(Boolean).join(' — ');
    }
    if (data && typeof data === 'object') {
      const detail = data.detail;
      if (Array.isArray(detail)) {
        const validation = detail
          .map((item) => {
            const loc = Array.isArray(item?.loc) ? item.loc.join('.') : '';
            return loc ? `${loc}: ${item?.msg || item}` : String(item?.msg || item);
          })
          .join('; ');
        if (validation) {
          return [error?.message, validation].filter(Boolean).join(' — ');
        }
      }
      if (typeof detail === 'string' && detail.length > 0) {
        return [error?.message, detail].filter(Boolean).join(' — ');
      }
      if (data.message) {
        return [error?.message, data.message].filter(Boolean).join(' — ');
      }
      return [error?.message, JSON.stringify(data)].filter(Boolean).join(' — ');
    }
    return error?.message || 'Unknown error occurred';
  }

  /**
   * Execute a task based on its type
   * @param {Object} task - Task object
   * @param {Object} modelData - Optional model data for model-based tasks
   */
  async executeTask(task, modelData = null) {
    const { type, prompt, imageFile, options } = task;

    switch (type) {
      case 'text-to-3d':
        return await this.executeTextTo3D(prompt, options);
      case 'image-to-3d':
        return await this.executeImageTo3D(prompt, imageFile, options);
      case 'image-to-raw-mesh':
        return await this.executeImageToRawMesh(prompt, imageFile, options);
      case 'image-to-splat':
        return await this.executeImageToSplat(prompt, imageFile, options);
      case 'mesh-painting':
        return await this.executeMeshPainting(prompt, imageFile, options, modelData);
      case 'mesh-painting-text':
        return await this.executeTextMeshPainting(prompt, options, modelData);
      case 'mesh-segmentation':
        return await this.executeMeshSegmentation(options, modelData);
      case 'mesh-retopology':
        return await this.executeMeshRetopology(options, modelData);
      case 'mesh-uv-unwrapping':
        return await this.executeMeshUVUnwrapping(options, modelData);
      case 'mesh-editing-text':
        return await this.executeMeshEditingText(prompt, options, modelData);
      case 'mesh-editing-image':
        return await this.executeMeshEditingImage(prompt, imageFile, options, modelData);
      case 'auto-rigging':
        return await this.executeAutoRigging(options, modelData);
      case 'avatar-from-image':
        return await this.executeAvatarFromImage(prompt, imageFile, options);
      case ARC2AVATAR_TASK_TYPE:
        return await this.executeArc2AvatarHead(prompt, imageFile, options);
      case 'image-to-world':
        return await this.executeImageToWorld(prompt, imageFile, options);
      case 'environment-scan':
        return await this.executeEnvironmentScan(prompt, imageFile, options);
      case 'text-to-image':
        return await this.executeTextToImage(prompt, options);
      case 'image-edit':
        return await this.executeImageEdit(prompt, imageFile, options);
      case 'text-to-motion':
        return await this.executeTextToMotion(prompt, options);
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }

  /**
   * Execute text-to-3D generation (production API only)
   */
  async executeTextTo3D(prompt, options) {
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-generation/text-to-textured-mesh`;
    const pipelineDefaults = getPipelineSafeMeshGenerationDefaults();
    const meshSimplify = options?.mesh_simplify ?? pipelineDefaults.mesh_simplify;
    const modelParameters = {
      ...pipelineDefaults.model_parameters,
      ...(options?.model_parameters || {}),
    };
    modelParameters.decimation_target = clampPipelineDecimationTarget(
      modelParameters.decimation_target,
    );
    const requestData = withObjectNamePayload({
      text_prompt: prompt,
      texture_prompt: options?.texture_prompt ?? prompt,
      texture_resolution: options?.texture_resolution ?? 1024,
      output_format: 'glb',
      model_preference: options?.model_preference ?? 'trellis_text_to_textured_mesh',
      mesh_simplify: meshSimplify,
      model_parameters: modelParameters,
    }, options);
    const startTime = Date.now();
    try {
      const response = await axios.post(endpoint, requestData, {
        headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
        timeout: 300000,
        onUploadProgress: (e) => {
          if (e.total) this.emitTaskProgress( { progress: Math.round((e.loaded * 100) / e.total) });
        }
      });
      performanceMonitor.trackAPICall(endpoint, 'POST', Date.now() - startTime, response.status);
      return response.data;
    } catch (error) {
      performanceMonitor.trackAPICall(endpoint, 'POST', Date.now() - startTime, error.response?.status ?? 0, error);
      logger.error('Text-to-3D task failed', error, { prompt, endpoint });
      throw error;
    }
  }

  /**
   * Execute text-to-image (Krea 2 Turbo local weights → PNG/WebP).
   */
  async executeTextToImage(prompt, options) {
    const endpoint = `${this.apiEndpoint}/api/v1/image-generation/text-to-image`;
    const requestData = {
      text_prompt: prompt,
      width: options?.width ?? 1024,
      height: options?.height ?? 1024,
      output_format: options?.output_format ?? 'png',
      model_preference: options?.model_preference ?? 'krea2_turbo_text_to_image',
    };
    const mp = options?.model_parameters;
    if (mp && typeof mp === 'object') {
      const cleaned = { ...mp };
      for (const key of Object.keys(cleaned)) {
        if (cleaned[key] == null) delete cleaned[key];
      }
      if (Object.keys(cleaned).length > 0) {
        requestData.model_parameters = cleaned;
      }
    }

    const startTime = Date.now();
    try {
      const response = await axios.post(endpoint, requestData, {
        headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
        timeout: 120000,
      });
      performanceMonitor.trackAPICall(endpoint, 'POST', Date.now() - startTime, response.status);
      return response.data;
    } catch (error) {
      performanceMonitor.trackAPICall(endpoint, 'POST', Date.now() - startTime, error.response?.status ?? 0, error);
      logger.error('Text-to-image task failed', error, { prompt, endpoint });
      throw error;
    }
  }

  /**
   * Execute instruction-based image edit (Mage-Flow-Edit-Turbo → PNG/WebP).
   */
  async executeImageEdit(prompt, imageFile, options) {
    if (!imageFile) {
      throw new Error('Image edit requires an input image.');
    }
    const maxSide =
      Number(options?.max_image_side ?? import.meta.env.VITE_3DAIGC_MAX_IMAGE_SIDE ?? 2048) || 2048;
    const preparedImage = await resizeImageFor3daigc(imageFile, maxSide);
    const endpoint = `${this.apiEndpoint}/api/v1/image-generation/image-edit`;

    let imageFileId = null;
    try {
      imageFileId = await this.uploadImageFileForApi(preparedImage);
    } catch (uploadErr) {
      logger.warn('Image-edit upload failed; will try base64', {
        message: uploadErr?.message,
        status: uploadErr?.response?.status,
      });
    }

    const requestData = {
      text_prompt: prompt,
      output_format: options?.output_format ?? 'png',
      model_preference: options?.model_preference ?? 'mage_flow_edit_turbo',
    };
    if (imageFileId) {
      requestData.image_file_id = imageFileId;
    } else {
      requestData.image_base64 = await this.fileToBase64(preparedImage);
    }
    const mp = options?.model_parameters;
    if (mp && typeof mp === 'object') {
      const cleaned = { ...mp };
      for (const key of Object.keys(cleaned)) {
        if (cleaned[key] == null) delete cleaned[key];
      }
      if (Object.keys(cleaned).length > 0) {
        requestData.model_parameters = cleaned;
      }
    }

    const startTime = Date.now();
    try {
      const response = await axios.post(endpoint, requestData, {
        headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
        timeout: 120000,
      });
      performanceMonitor.trackAPICall(endpoint, 'POST', Date.now() - startTime, response.status);
      return response.data;
    } catch (error) {
      performanceMonitor.trackAPICall(endpoint, 'POST', Date.now() - startTime, error.response?.status ?? 0, error);
      logger.error('Image-edit task failed', error, { prompt, endpoint });
      throw error;
    }
  }

  /**
   * Execute text-to-motion (Kimodo → studio_motion.json for uploaded VRM).
   */
  async executeTextToMotion(prompt, options) {
    const endpoint = `${this.apiEndpoint}/api/v1/motion-generation/text-to-motion`;
    const requestData = withObjectNamePayload({
      text_prompt: prompt,
      duration: options?.duration ?? 5,
      output_format: 'studio_motion',
      model_preference: options?.model_preference ?? 'kimodo_text_to_motion',
      model_parameters: options?.model_parameters,
    }, options);

    const startTime = Date.now();
    try {
      const response = await axios.post(endpoint, requestData, {
        headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
        timeout: 120000,
      });
      performanceMonitor.trackAPICall(endpoint, 'POST', Date.now() - startTime, response.status);
      return response.data;
    } catch (error) {
      performanceMonitor.trackAPICall(endpoint, 'POST', Date.now() - startTime, error.response?.status ?? 0, error);
      logger.error('Text-to-motion task failed', error, { prompt, endpoint });
      throw error;
    }
  }

  /**
   * Convert File to base64 string
   * @param {File} file - File object to convert
   * @returns {Promise<string>} Base64 string (without data URL prefix)
   */
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  /** @param {Blob} blob */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Upload reference images for multi-image jobs (Phase 1).
   * @param {File[]} referenceFiles
   * @returns {Promise<string[]>}
   */
  async uploadReferenceImageFiles(referenceFiles = []) {
    const ids = [];
    for (const file of referenceFiles) {
      if (!file) continue;
      const maxSide =
        Number(import.meta.env.VITE_3DAIGC_MAX_IMAGE_SIDE ?? 2048) || 2048;
      const prepared = await resizeImageFor3daigc(file, maxSide);
      const id = await this.uploadImageFileForApi(prepared);
      if (id) ids.push(id);
    }
    return ids;
  }

  /**
   * @param {object} [options]
   * @returns {Promise<string[]>}
   */
  async resolveReferenceImageFileIds(options = {}) {
    const fromOptions = options.reference_image_file_ids;
    if (Array.isArray(fromOptions) && fromOptions.length > 0) {
      return fromOptions.filter((id) => typeof id === 'string' && id.length > 0);
    }
    const files = options.reference_image_files;
    if (!Array.isArray(files) || files.length === 0) {
      return [];
    }
    return this.uploadReferenceImageFiles(files);
  }

  /**
   * Upload image to 3DAIGC-API file store (preferred path for image-to-textured-mesh).
   * @returns {Promise<string|null>} file_id or null if upload is unavailable
   */
  async uploadImageFileForApi(imageFile) {
    const uploadUrl = `${this.apiEndpoint}/api/v1/file-upload/image`;
    const formData = new FormData();
    formData.append('file', imageFile);
    try {
      const response = await axios.post(uploadUrl, formData, {
        headers: { ...get3daigcAuthHeaders() },
        timeout: 120000,
        onUploadProgress: (e) => {
          if (e.total) this.emitTaskProgress( { progress: Math.round((e.loaded * 50) / e.total) });
        }
      });
      const id = response.data?.file_id;
      return typeof id === 'string' && id.length > 0 ? id : null;
    } catch (err) {
      const status = err.response?.status;
      if (status === 404 || status === 405) {
        logger.info('Image file upload endpoint not available; falling back to image_base64', { uploadUrl, status });
        return null;
      }
      const networkish =
        !err.response &&
        (err.code === 'ERR_NETWORK' ||
          err.code === 'ECONNABORTED' ||
          err.code === 'ECONNREFUSED' ||
          err.code === 'ERR_CONNECTION_REFUSED' ||
          err.request);
      if (networkish || status === 400 || status === 413 || status === 422) {
        logger.warn('Image file upload failed; falling back to image_base64', {
          uploadUrl,
          status,
          code: err.code,
          message: err.message,
        });
        return null;
      }
      throw err;
    }
  }

  /**
   * Execute image-to-3D generation (input is downscaled to max side before upload when in browser).
   */
  async executeImageTo3D(prompt, imageFile, options) {
    if (!imageFile) {
      throw new Error(
        'Image to 3D requires an input image. Select a photo before submitting — it will not fall back to text-to-3D.',
      );
    }
    const maxSide =
      Number(options?.max_image_side ?? import.meta.env.VITE_3DAIGC_MAX_IMAGE_SIDE ?? 2048) || 2048;
    const preparedImage = await resizeImageFor3daigc(imageFile, maxSide);

    const endpoint = `${this.apiEndpoint}/api/v1/mesh-generation/image-to-textured-mesh`;

    let imageFileId = null;
    try {
      imageFileId = await this.uploadImageFileForApi(preparedImage);
    } catch (uploadErr) {
      logger.warn('Image upload failed unexpectedly', {
        message: uploadErr?.message,
        status: uploadErr?.response?.status,
      });
    }

    const basePayload = withObjectNamePayload({
      output_format: 'glb',
      model_preference:
        options?.model_preference ??
        import.meta.env.VITE_DEFAULT_IMAGE_TO_3D_MODEL ??
        getDefaultModelForFeature('image-to-3d'),
    }, options);
    const referenceImageFileIds = await this.resolveReferenceImageFileIds(options);
    if (referenceImageFileIds.length > 0) {
      basePayload.reference_image_file_ids = referenceImageFileIds;
      basePayload.use_multiview_mesh = options.use_multiview_mesh !== false;
    }
    if (options?.texture_resolution != null) {
      basePayload.texture_resolution = options.texture_resolution;
    }
    const pipelineDefaults = getPipelineSafeMeshGenerationDefaults();
    basePayload.mesh_simplify = options?.mesh_simplify ?? pipelineDefaults.mesh_simplify;
    const modelParameters = {
      ...pipelineDefaults.model_parameters,
      ...(options?.model_parameters || {}),
    };
    modelParameters.decimation_target = clampPipelineDecimationTarget(
      modelParameters.decimation_target,
    );
    basePayload.model_parameters = modelParameters;

    const payload = imageFileId
      ? { ...basePayload, image_file_id: imageFileId }
      : {
          ...basePayload,
          image_base64: await this.fileToBase64(preparedImage)
        };

    try {
      const response = await axios.post(endpoint, payload, {
        headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
        timeout: 300000,
        onUploadProgress: () => this.emitTaskProgress( { progress: imageFileId ? 55 : 10 })
      });
      const data = response.data;
      if (data?.job_id) {
        return { job_id: data.job_id, status: 'queued', message: 'Job queued. Processing...', ...data };
      }
      return data;
    } catch (error) {
      if (error.response) {
        const body = error.response.data;
        let detail = body?.message ?? body?.error ?? body?.detail;
        if (detail == null && body && typeof body === 'object') {
          try {
            detail = JSON.stringify(body);
          } catch {
            detail = error.message;
          }
        }
        if (detail == null) detail = error.message;
        const e = new Error(
          `API request failed: ${error.response.status} ${error.response.statusText}. ${detail}. Endpoint: ${endpoint}`
        );
        e.originalError = error;
        e.status = error.response.status;
        throw e;
      }
      if (error.request) {
        throw TaskManager.formatNetworkError(endpoint, error);
      }
      throw error;
    }
  }

  /**
   * Queue Arc2Avatar SDS head splat (returns job_id immediately — does not wait for SDS).
   * Requires GET /arc2avatar/status integrated=true.
   */
  async queueArc2AvatarHead(prompt, imageFile, options = {}) {
    if (!imageFile) {
      throw new Error('avatar-head-arc2avatar requires a face photo');
    }
    const status = await fetchArc2AvatarStatus(this.apiEndpoint);
    if (!status?.integrated) {
      const reasons = (status?.blocking_reasons || []).join('; ') || 'not installed';
      throw new Error(`Arc2Avatar API not ready: ${reasons}`);
    }

    const maxSide =
      Number(options?.max_image_side ?? import.meta.env.VITE_3DAIGC_MAX_IMAGE_SIDE ?? 2048) || 2048;
    const preparedImage = await resizeImageFor3daigc(imageFile, maxSide);
    const endpoint = `${this.apiEndpoint}${ARC2AVATAR_IMAGE_TO_HEAD_PATH}`;

    let imageFileId = null;
    try {
      imageFileId = await this.uploadImageFileForApi(preparedImage);
    } catch (uploadErr) {
      const st = uploadErr?.response?.status;
      if (st === 400 || st === 413 || st === 422) {
        logger.warn('Arc2Avatar image upload rejected; falling back to image_base64', {
          status: st,
        });
      } else {
        throw uploadErr;
      }
    }

    const basePayload = withObjectNamePayload(
      {
        output_format: 'ply',
        model_preference: options?.model_preference ?? ARC2AVATAR_MODEL_ID,
        ...(options?.model_parameters && Object.keys(options.model_parameters).length
          ? { model_parameters: options.model_parameters }
          : {}),
      },
      options,
    );

    if (imageFileId) {
      return this.postJsonJob(
        endpoint,
        { ...basePayload, image_file_id: imageFileId },
        'Queued Arc2Avatar head job…',
      );
    }

    const imageBase64 = await this.fileToBase64(preparedImage);
    return this.postJsonJob(
      endpoint,
      { ...basePayload, image_base64: imageBase64 },
      'Queued Arc2Avatar head job…',
    );
  }

  /**
   * Arc2Avatar SDS head splat (FLAME 3DGS) — queues then polls until PLY is ready.
   */
  async executeArc2AvatarHead(prompt, imageFile, options) {
    const queued = await this.queueArc2AvatarHead(prompt, imageFile, options);
    if (!queued?.job_id) {
      throw new Error('Arc2Avatar did not return a job_id');
    }
    // SDS can run for hours (default 7000 iters).
    return this.pollJobStatus(queued.job_id, this.activeTaskId, 5000, 3600);
  }

  /**
   * Execute image-to-Gaussian-splat generation (TripoSplat → .ply / .splat for Spark.js).
   */
  async executeImageToSplat(prompt, imageFile, options) {
    if (!imageFile) {
      throw new Error('image-to-splat requires an input image');
    }

    const maxSide =
      Number(options?.max_image_side ?? import.meta.env.VITE_3DAIGC_MAX_IMAGE_SIDE ?? 2048) || 2048;
    const preparedImage = await resizeImageFor3daigc(imageFile, maxSide);
    const endpoint = `${this.apiEndpoint}/api/v1/splat-generation/image-to-splat`;

    let imageFileId = null;
    try {
      imageFileId = await this.uploadImageFileForApi(preparedImage);
    } catch (uploadErr) {
      const st = uploadErr?.response?.status;
      if (st === 400 || st === 413 || st === 422) {
        logger.warn('Image file upload rejected; falling back to image_base64', {
          status: st,
          detail: uploadErr?.response?.data,
        });
      } else {
        throw uploadErr;
      }
    }

    const outputFormat = options?.output_format === 'splat' ? 'splat' : 'ply';
    const referenceImageFileIds = await this.resolveReferenceImageFileIds(options);
    const splatModel =
      options?.model_preference ??
      import.meta.env.VITE_DEFAULT_IMAGE_TO_SPLAT_MODEL ??
      (referenceImageFileIds.length >= 1
        ? 'worldmirror2_reconstruct'
        : 'triposplat_image_to_splat');
    const basePayload = withObjectNamePayload({
      output_format: outputFormat,
      model_preference: splatModel,
      ...(referenceImageFileIds.length > 0
        ? { reference_image_file_ids: referenceImageFileIds }
        : {}),
    }, options);
    if (options?.model_parameters && Object.keys(options.model_parameters).length > 0) {
      basePayload.model_parameters = options.model_parameters;
    }

    const payload = imageFileId
      ? { ...basePayload, image_file_id: imageFileId }
      : {
          ...basePayload,
          image_base64: await this.fileToBase64(preparedImage),
        };

    try {
      const response = await axios.post(endpoint, payload, {
        headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
        timeout: 300000,
        onUploadProgress: () => this.emitTaskProgress({ progress: imageFileId ? 55 : 10 }),
      });
      const data = response.data;
      if (data?.job_id) {
        return { job_id: data.job_id, status: 'queued', message: 'Splat job queued. Processing...', ...data };
      }
      return data;
    } catch (error) {
      if (error.response) {
        const body = error.response.data;
        let detail = body?.message ?? body?.error ?? body?.detail;
        if (detail == null && body && typeof body === 'object') {
          try {
            detail = JSON.stringify(body);
          } catch {
            detail = error.message;
          }
        }
        if (detail == null) detail = error.message;
        const e = new Error(
          `API request failed: ${error.response.status} ${error.response.statusText}. ${detail}. Endpoint: ${endpoint}`,
        );
        e.originalError = error;
        e.status = error.response.status;
        throw e;
      }
      if (error.request) {
        const e = new Error(`Network error: No response from server at ${endpoint}. Ensure the API server is running.`);
        e.originalError = error;
        throw e;
      }
      throw error;
    }
  }

  /**
   * POST JSON job with standard headers.
   * @param {string} endpoint
   * @param {object} body
   * @param {string} [statusMessage]
   */
  async postJsonJob(endpoint, body, statusMessage = 'Queued on server…') {
    this.emitTaskProgress({ indeterminate: true, status: statusMessage });
    const response = await axios.post(endpoint, body, {
      headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
      timeout: 300000,
    });
    return response.data;
  }

  /**
   * @param {Blob} modelData
   * @param {object} [options]
   */
  async buildMeshJobBody(modelData, options = {}) {
    if (!modelData) {
      throw new Error('This task requires a mesh loaded in the viewport.');
    }
    this.emitTaskProgress({ indeterminate: true, status: 'Uploading mesh…' });
    const meshFileId = await this.uploadMeshFile(modelData, 'model.glb');
    const body = withObjectNamePayload({
      mesh_file_id: meshFileId,
      output_format: options.output_format ?? 'glb',
      model_preference: options.model_preference,
    }, options);
    if (options.model_parameters && Object.keys(options.model_parameters).length > 0) {
      body.model_parameters = options.model_parameters;
    }
    return body;
  }

  async executeImageToRawMesh(prompt, imageFile, options) {
    if (!imageFile) {
      throw new Error('image-to-raw-mesh requires an input image');
    }
    const maxSide =
      Number(options?.max_image_side ?? import.meta.env.VITE_3DAIGC_MAX_IMAGE_SIDE ?? 2048) || 2048;
    const preparedImage = await resizeImageFor3daigc(imageFile, maxSide);
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-generation/image-to-raw-mesh`;

    let imageFileId = null;
    try {
      imageFileId = await this.uploadImageFileForApi(preparedImage);
    } catch (uploadErr) {
      const st = uploadErr?.response?.status;
      if (st === 400 || st === 413 || st === 422) {
        logger.warn('Image upload rejected; falling back to image_base64', { status: st });
      } else {
        throw uploadErr;
      }
    }

    const payload = withObjectNamePayload({
      output_format: 'glb',
      model_preference:
        options?.model_preference ??
        import.meta.env.VITE_DEFAULT_IMAGE_TO_RAW_MESH_MODEL ??
        'hunyuan3dv21_image_to_raw_mesh',
      ...(imageFileId
        ? { image_file_id: imageFileId }
        : { image_base64: await this.fileToBase64(preparedImage) }),
    }, options);
    if (options?.model_parameters && Object.keys(options.model_parameters).length > 0) {
      payload.model_parameters = options.model_parameters;
    }

    return this.postJsonJob(endpoint, payload, 'Queued raw mesh job…');
  }

  async executeMeshPainting(prompt, imageFile, options, modelData = null) {
    if (!modelData) {
      throw new Error('Mesh painting (image) requires a mesh loaded in the viewport.');
    }
    if (!imageFile) {
      throw new Error('Mesh painting (image) requires a reference image.');
    }
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-generation/image-mesh-painting`;
    const body = await this.buildMeshJobBody(modelData, {
      output_format: 'glb',
      model_preference: options?.model_preference ?? getDefaultModelForFeature('image_mesh_painting'),
      model_parameters: options?.model_parameters,
    });
    body.texture_resolution = options?.texture_resolution ?? 1024;

    let imageFileId = null;
    try {
      imageFileId = await this.uploadImageFileForApi(imageFile);
    } catch (uploadErr) {
      const st = uploadErr?.response?.status;
      if (st === 400 || st === 413 || st === 422) {
        logger.warn('Image upload rejected for mesh painting; falling back to base64', { status: st });
      } else {
        throw uploadErr;
      }
    }
    if (imageFileId) {
      body.image_file_id = imageFileId;
    } else {
      body.image_base64 = await this.fileToBase64(imageFile);
    }

    return this.postJsonJob(endpoint, body, 'Queued mesh painting job…');
  }

  /**
   * Text-driven mesh painting (3DAIGC-API / Open3DStudio-style); requires mesh GLB blob.
   */
  async executeTextMeshPainting(prompt, options, modelData = null) {
    if (!modelData) {
      throw new Error('Text mesh painting requires a mesh (load a model in the viewport first).');
    }
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-generation/text-mesh-painting`;
    const meshBase64 = await this.blobToBase64(modelData);
    const requestData = withObjectNamePayload({
      text_prompt: prompt,
      mesh_base64: meshBase64,
      output_format: options?.output_format ?? 'glb',
      model_preference: options?.model_preference ?? 'trellis_text_mesh_painting'
    }, options);
    const response = await axios.post(endpoint, requestData, {
      headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
      timeout: 300000
    });
    return response.data;
  }

  async executeMeshSegmentation(options, modelData = null) {
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-segmentation/segment-mesh`;
    const body = await this.buildMeshJobBody(modelData, {
      output_format: options?.output_format ?? 'glb',
      model_preference: options?.model_preference ?? 'p3sam_mesh_segmentation',
      model_parameters: options?.model_parameters,
    });
    if (options?.num_parts != null) {
      body.num_parts = options.num_parts;
    }
    return this.postJsonJob(endpoint, body, 'Queued segmentation job…');
  }

  async executeMeshRetopology(options, modelData = null) {
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-retopology/retopologize-mesh`;
    const modelPreference = options?.model_preference ?? 'trimesh_decimate';
    const quadRemesh = isQuadRemeshModel(modelPreference);
    const outputFormat =
      options?.output_format ?? (quadRemesh ? 'obj' : 'glb');
    const body = await this.buildMeshJobBody(modelData, {
      output_format: outputFormat,
      model_preference: modelPreference,
      model_parameters: options?.model_parameters,
    });
    if (quadRemesh && outputFormat === 'obj') {
      body.poly_type = 'quad';
    }
    if (options?.target_vertex_count != null) {
      body.target_vertex_count = options.target_vertex_count;
    }
    if (options?.target_face_count != null) {
      body.target_face_count = options.target_face_count;
    } else if (modelPreference === 'trimesh_decimate') {
      body.target_face_count =
        options?.model_parameters?.target_face_count ??
        options?.model_parameters?.decimation_target ??
        PIPELINE_MESH_DECIMATION_TARGET;
    }
    if (options?.poly_type) {
      body.poly_type = options.poly_type;
    }
    return this.postJsonJob(endpoint, body, 'Queued retopology job…');
  }

  async executeMeshUVUnwrapping(options, modelData = null) {
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-uv-unwrapping/unwrap-mesh`;
    const body = await this.buildMeshJobBody(modelData, {
      output_format: options?.output_format ?? 'glb',
      model_preference: options?.model_preference ?? 'xatlas_uv_unwrapping',
      model_parameters: options?.model_parameters,
    });
    return this.postJsonJob(endpoint, body, 'Queued UV unwrap job…');
  }

  async executeMeshEditingText(prompt, options, modelData = null) {
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-editing/text-mesh-editing`;
    const body = await this.buildMeshJobBody(modelData, {
      output_format: 'glb',
      model_preference: options?.model_preference ?? 'voxhammer_text_mesh_editing',
      model_parameters: options?.model_parameters,
    });
    body.source_prompt = options?.source_prompt || prompt || 'original region';
    body.target_prompt = options?.target_prompt || prompt || 'edited region';
    const mask = options?.mask_bbox;
    if (!mask?.center || !mask?.dimensions) {
      throw new Error('Text mesh editing requires a 3D mask (bounding box center + dimensions).');
    }
    body.mask_bbox = {
      center: mask.center,
      dimensions: mask.dimensions,
    };
    if (options?.num_views != null) body.num_views = options.num_views;
    if (options?.resolution != null) body.resolution = options.resolution;
    return this.postJsonJob(endpoint, body, 'Queued text mesh editing job…');
  }

  async executeMeshEditingImage(prompt, imageFile, options, modelData = null) {
    const sourceImage = options?.source_image_file || imageFile;
    const targetImage = options?.target_image_file || imageFile;
    const maskImage = options?.mask_image_file;
    if (!sourceImage || !targetImage || !maskImage) {
      throw new Error(
        'Image mesh editing requires source, target, and mask images (upload target + mask; source defaults to target).',
      );
    }

    const endpoint = `${this.apiEndpoint}/api/v1/mesh-editing/image-mesh-editing`;
    const body = await this.buildMeshJobBody(modelData, {
      output_format: 'glb',
      model_preference: options?.model_preference ?? 'voxhammer_image_mesh_editing',
      model_parameters: options?.model_parameters,
    });

    const uploadImage = async (file, field) => {
      const fileId = await this.uploadImageFileForApi(file);
      if (fileId) {
        body[`${field}_file_id`] = fileId;
      } else {
        body[`${field}_base64`] = await this.fileToBase64(file);
      }
    };

    await uploadImage(sourceImage, 'source_image');
    await uploadImage(targetImage, 'target_image');
    await uploadImage(maskImage, 'mask_image');

    const mask = options?.mask_bbox;
    if (!mask?.center || !mask?.dimensions) {
      throw new Error('Image mesh editing requires a 3D mask (bounding box center + dimensions).');
    }
    body.mask_bbox = {
      center: mask.center,
      dimensions: mask.dimensions,
    };
    if (options?.num_views != null) body.num_views = options.num_views;
    if (options?.resolution != null) body.resolution = options.resolution;
    return this.postJsonJob(endpoint, body, 'Queued image mesh editing job…');
  }

  async executeAutoRigging(options, modelData = null) {
    const meshJobId =
      options?.mesh_job_id || options?.studio_input_mesh_job_id || null;
    if (!modelData && !meshJobId) {
      throw new Error('Auto-rigging requires a mesh (load a model in the viewport first).');
    }

    const endpoint = `${this.apiEndpoint}/api/v1/auto-rigging/generate-rig`;
    const config = { timeout: 300000 };

    let meshFileId = null;
    let meshPath = null;
    let resolvedMeshJobId = null;

    if (modelData) {
      this.emitTaskProgress({ indeterminate: true, status: 'Uploading mesh…' });
      meshFileId = await this.uploadMeshFile(modelData, 'model.glb', { purpose: 'auto-rig' });
    } else {
      this.emitTaskProgress({
        indeterminate: true,
        status: 'Reusing completed mesh job (no GLB re-download)…',
      });
      try {
        const jobStatus = await this.checkJobStatus(meshJobId);
        meshPath = extractServerMeshPathFromJob(jobStatus);
      } catch (err) {
        logger.warn('Could not read mesh path from job status', {
          meshJobId,
          error: err?.message || String(err),
        });
      }
      if (!meshPath) {
        resolvedMeshJobId = meshJobId;
      }
    }

    // Rig job must request fbx (supported-formats); completed jobs download as GLB for the viewport.
    const rigMode = options?.rig_mode ?? AUTO_RIG_MODES.FULL;
    const modelPreference = resolveAutoRigModelForTask(rigMode, options?.model_preference);
    const outputFormat =
      options?.output_format ?? getDefaultAutoRigOutputFormat(modelPreference, rigMode);
    const rigBody = {
      rig_mode: rigMode,
      output_format: outputFormat,
      model_preference: modelPreference,
    };
    if (meshFileId) {
      rigBody.mesh_file_id = meshFileId;
    } else if (meshPath) {
      rigBody.mesh_path = meshPath;
    } else if (resolvedMeshJobId) {
      rigBody.mesh_job_id = resolvedMeshJobId;
    } else {
      throw new Error('Auto-rigging requires a mesh (load a model in the viewport first).');
    }

    if (rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP) {
      rigBody.humanoid_template_id = normalizeHumanoidTemplateId(
        options?.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID,
      );
      if (modelPreference !== TEMPLATE_RIG_MODEL_ID) {
        logger.warn('Template rig requires UniRig; overriding model_preference', {
          requested: modelPreference,
          using: TEMPLATE_RIG_MODEL_ID,
        });
        rigBody.model_preference = TEMPLATE_RIG_MODEL_ID;
      }
    }

    if (rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT) {
      const slot =
        options?.appearance_slot ||
        options?.model_parameters?.appearance_slot ||
        null;
      if (slot) {
        rigBody.appearance_slot = slot;
      }
      if (modelPreference !== APPEARANCE_COMPONENT_RIG_MODEL_ID) {
        logger.warn('Appearance component rig requires appearance_component_auto_rig; overriding', {
          requested: modelPreference,
          using: APPEARANCE_COMPONENT_RIG_MODEL_ID,
        });
        rigBody.model_preference = APPEARANCE_COMPONENT_RIG_MODEL_ID;
      }
    }

    if (rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE) {
      rigBody.creature_template_id = normalizeCreatureTemplateId(
        options?.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID,
      );
      if (modelPreference !== CREATURE_TEMPLATE_RIG_MODEL_ID) {
        logger.warn('Creature template rig requires creature_template_auto_rig; overriding model_preference', {
          requested: modelPreference,
          using: CREATURE_TEMPLATE_RIG_MODEL_ID,
        });
        rigBody.model_preference = CREATURE_TEMPLATE_RIG_MODEL_ID;
      }
    }

    const modelParams = options?.model_parameters
      ? { ...options.model_parameters }
      : {};

    // Optional selfie for Likeness face_likeness (same upload as Arc2Avatar head track).
    // Must downscale first — API rejects images above 2048×2048 (common phone selfies).
    let likenessImageFileId = options?.likeness_image_file_id || null;
    const likenessFile =
      options?.likeness_image_file || options?.faceSelfieFile || null;
    if (!likenessImageFileId && likenessFile) {
      this.emitTaskProgress({
        indeterminate: true,
        status: 'Uploading face selfie for Likeness…',
      });
      const maxSide =
        Number(import.meta.env.VITE_3DAIGC_MAX_IMAGE_SIDE ?? 2048) || 2048;
      const preparedLikeness = await resizeImageFor3daigc(likenessFile, maxSide);
      likenessImageFileId = await this.uploadImageFileForApi(preparedLikeness);
    }
    if (likenessImageFileId) {
      rigBody.likeness_image_file_id = likenessImageFileId;
      if (!modelParams.likeness_source) {
        modelParams.likeness_source = 'auto';
      }
    }

    if (Object.keys(modelParams).length > 0) {
      const { with_skinning, ...rest } = modelParams;
      const rigModelParams =
        rigMode === 'full' && with_skinning === false
          ? { ...rest, with_skinning: false }
          : rest;
      if (Object.keys(rigModelParams).length > 0) {
        rigBody.model_parameters = rigModelParams;
      }
    }

    console.log('Auto-rigging: submitting generate-rig', rigBody);

    this.emitTaskProgress({ indeterminate: true, status: 'Queued on server…' });
    try {
      const response = await axios.post(endpoint, withObjectNamePayload(rigBody, options), {
        headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
        ...config,
      });
      return response.data;
    } catch (error) {
      const status = error?.response?.status;
      const detail = JSON.stringify(error?.response?.data || '');
      const unknownMeshJobId =
        Boolean(resolvedMeshJobId) &&
        !modelData &&
        !options?._skipMeshJobIdFallback &&
        (status === 422 ||
          (status === 400 && /mesh_path|mesh_file_id|mesh_job_id/i.test(detail)));
      if (!unknownMeshJobId) {
        throw error;
      }
      logger.warn('mesh_job_id not accepted by API; downloading mesh once as fallback', {
        meshJobId: resolvedMeshJobId,
        status,
      });
      const meshFile = await this.fetchJobDownloadBlob(
        `/api/v1/system/jobs/${resolvedMeshJobId}/download`,
        'model.glb',
      );
      return this.executeAutoRigging(
        {
          ...options,
          mesh_job_id: undefined,
          studio_input_mesh_job_id: undefined,
          _skipMeshJobIdFallback: true,
        },
        meshFile,
      );
    }
  }

  /**
   * Download completed job output as a File (for chained avatar pipeline steps).
   * @param {string} downloadUrl
   * @param {string} [filename]
   * @returns {Promise<File>}
   */
  async fetchJobDownloadBlob(downloadUrl, filename = 'generated.glb') {
    const resolved = resolveTaskModelUrl(downloadUrl, this.apiEndpoint);
    const response = await axios.get(resolved, {
      responseType: 'blob',
      headers: get3daigcAuthHeaders(),
      timeout: 300000,
    });
    const type = response.headers?.['content-type'] || 'application/octet-stream';
    return new File([response.data], filename, { type });
  }

  /**
   * Image → World Package (TripoSplat environment + optional TRELLIS.2 props on DGX).
   */
  async executeImageToWorld(prompt, imageFile, options = {}) {
    if (!imageFile) {
      throw new Error('Image to World requires a reference photo');
    }

    const maxSide =
      Number(options?.max_image_side ?? import.meta.env.VITE_3DAIGC_MAX_IMAGE_SIDE ?? 2048) || 2048;
    const preparedImage = await resizeImageFor3daigc(imageFile, maxSide);
    const endpoint = `${this.apiEndpoint}/api/v1/world-generation/image-to-world`;

    let imageFileId = null;
    try {
      imageFileId = await this.uploadImageFileForApi(preparedImage);
    } catch (uploadErr) {
      const st = uploadErr?.response?.status;
      if (st === 400 || st === 413 || st === 422) {
        logger.warn('Image upload rejected for image-to-world; falling back to base64', { status: st });
      } else {
        throw uploadErr;
      }
    }

    const referenceImageFileIds = await this.resolveReferenceImageFileIds(options);
    const payload = withObjectNamePayload({
      model_preference: options?.model_preference ?? 'opennexus_image_to_world',
      world_id: options?.world_id,
      world_name: options?.world_name || options?.object_name || prompt || 'Generated World',
      prop_regions: options?.prop_regions ?? [],
      prop_mesh_model_preference:
        options?.prop_mesh_model_preference ?? 'trellis2_image_to_textured_mesh',
      splat_parameters: options?.splat_parameters,
      prop_mesh_parameters: options?.prop_mesh_parameters,
      spawn: options?.spawn,
      ...(referenceImageFileIds.length > 0
        ? { reference_image_file_ids: referenceImageFileIds }
        : {}),
      ...(imageFileId
        ? { image_file_id: imageFileId }
        : { image_base64: await this.fileToBase64(preparedImage) }),
    }, options);

    const response = await axios.post(endpoint, payload, {
      headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
      timeout: 300000,
    });
    const data = response.data;
    if (!data?.job_id) {
      throw new Error('Image-to-world did not return a job_id');
    }
    return { job_id: data.job_id, status: 'queued', pipeline: 'image-to-world', ...data };
  }

  /**
   * Galaxy XR / walk-video → LingBot-Map environment scan with optional 1:1 metric scale.
   * Does not replace image-to-world (TripoSplat).
   */
  async executeEnvironmentScan(prompt, videoOrImageFile, options = {}) {
    const endpoint = `${this.apiEndpoint}/api/v1/world-generation/environment-scan`;
    let videoFileId = options?.video_file_id || null;
    const imageFileIds = Array.isArray(options?.image_file_ids)
      ? [...options.image_file_ids]
      : [];

    const isVideoFile = (file) => {
      if (!file) return false;
      const name = file.name || '';
      return (
        /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(name) ||
        String(file.type || '').startsWith('video/')
      );
    };

    if (!videoFileId && videoOrImageFile && isVideoFile(videoOrImageFile)) {
      const form = new FormData();
      form.append('file', videoOrImageFile);
      const up = await axios.post(`${this.apiEndpoint}/api/v1/file-upload/video`, form, {
        headers: { ...get3daigcAuthHeaders() },
        timeout: 600000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      videoFileId = up.data?.file_id;
      if (!videoFileId) throw new Error('Video upload did not return file_id');
    }

    if (!videoFileId && imageFileIds.length < 3) {
      const frameFiles = [];
      if (videoOrImageFile && !isVideoFile(videoOrImageFile)) {
        frameFiles.push(videoOrImageFile);
      }
      if (Array.isArray(options?.reference_image_files)) {
        for (const f of options.reference_image_files) {
          if (f && !isVideoFile(f)) frameFiles.push(f);
        }
      }
      for (const f of frameFiles) {
        imageFileIds.push(await this.uploadImageFileForApi(f));
      }
    }

    if (!videoFileId && imageFileIds.length < 3 && !options?.frame_dir) {
      throw new Error(
        'Environment scan needs a walk video or ≥3 frames (Galaxy XR outward cameras while walking)',
      );
    }

    const metric = options?.metric_calibration || null;
    const hasMetricHint =
      metric &&
      (metric.true_meters != null ||
        metric.mode === 'player_height' ||
        (Array.isArray(metric.point_a) && Array.isArray(metric.point_b)));
    if (!hasMetricHint) {
      logger.warn(
        'environment-scan without metric_calibration — twin will not be 1:1 meters until calibrated',
      );
    }

    const payload = withObjectNamePayload(
      {
        model_preference: options?.model_preference ?? 'lingbot_map_environment_scan',
        world_id: options?.world_id,
        world_name: options?.world_name || options?.object_name || prompt || 'Environment Scan',
        // Up to 600; API uses windowed CPU-resident LingBot for long walks on GB10.
        max_frames: options?.max_frames ?? 600,
        frame_stride: options?.frame_stride ?? 1,
        refine_to_3dgs: Boolean(options?.refine_to_3dgs),
        train_3dgs: Boolean(options?.train_3dgs),
        train_3dgs_steps: Number(options?.train_3dgs_steps) || 7000,
        bake_env_mesh: Boolean(options?.bake_env_mesh),
        ...(videoFileId ? { video_file_id: videoFileId } : {}),
        ...(imageFileIds.length >= 3 ? { image_file_ids: imageFileIds } : {}),
        ...(options?.frame_dir ? { frame_dir: options.frame_dir } : {}),
        ...(metric ? { metric_calibration: metric } : {}),
      },
      options,
    );

    const response = await axios.post(endpoint, payload, {
      headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
      timeout: 300000,
    });
    const data = response.data;
    if (!data?.job_id) {
      throw new Error('Environment scan did not return a job_id');
    }
    return { job_id: data.job_id, status: 'queued', pipeline: 'environment-scan', ...data };
  }

  /**
   * Full local avatar pipeline: image → textured mesh → template VRM rig (VRM).
   * Optionally queues TripoSplat preview in parallel when include_splat_preview is set.
   */
  async executeAvatarFromImage(prompt, imageFile, options = {}) {
    if (!imageFile) {
      throw new Error('Avatar from image requires an input photo');
    }

    const meshModel = resolveMeshModelForAvatarFromImage(
      options?.mesh_model_preference ?? options?.model_preference,
      {
        referenceCount: options?.reference_image_files?.length ?? 0,
        useMultiview: options?.use_multiview_mesh,
      },
    );

    let splatJobPromise = null;
    if (options?.include_splat_preview) {
      const refCount = options?.reference_image_files?.length ?? 0;
      splatJobPromise = this.executeImageToSplat(prompt, imageFile, {
        model_preference:
          options?.splat_model_preference ??
          (refCount >= 1 ? 'worldmirror2_reconstruct' : 'triposplat_image_to_splat'),
        output_format: options?.splat_output_format ?? 'ply',
        model_parameters: options?.splat_model_parameters,
        reference_image_files: options?.reference_image_files,
        reference_image_file_ids: options?.reference_image_file_ids,
      }).catch((err) => {
        logger.warn('Parallel splat preview failed (mesh+rig continues)', {
          message: err?.message,
        });
        return null;
      });
    }

    this.emitTaskProgress({ indeterminate: true, status: 'Generating textured mesh…' });
    const meshJob = await this.executeImageTo3D(prompt, imageFile, {
      ...options,
      model_preference: meshModel,
      use_multiview_mesh: options?.use_multiview_mesh !== false,
      model_parameters: {
        ...(options?.model_parameters || {}),
        decimation_target: clampPipelineDecimationTarget(
          options?.model_parameters?.decimation_target ?? AVATAR_MESH_DECIMATION_TARGET,
        ),
      },
    });
    if (!meshJob?.job_id) {
      throw new Error('Image-to-3D did not return a job_id');
    }

    const meshResult = await this.pollJobStatus(
      meshJob.job_id,
      this.activeTaskId,
      3000,
      600,
    );
    const meshDownloadUrl = buildJobDownloadUrl(meshResult, meshJob.job_id, this.apiEndpoint);
    if (!meshDownloadUrl) {
      throw new Error('Could not resolve mesh download URL after image-to-3D');
    }

    this.emitTaskProgress({ indeterminate: true, status: 'Applying template VRM rig…' });
    const templateRig = buildTemplateAutoRigOptions({
      humanoid_template_id: options?.humanoid_template_id,
    });
    const rigJob = await this.executeAutoRigging(
      {
        ...templateRig,
        model_parameters: options?.rig_model_parameters,
        studio_input_mesh_job_id: meshJob.job_id,
      },
      null,
    );

    if (splatJobPromise) {
      void splatJobPromise.then((splatJob) => {
        if (!splatJob?.job_id) return;
        void this.pollJobStatus(splatJob.job_id, this.activeTaskId, 3000, 600)
          .then((splatResult) => {
            const splatUrl = buildJobDownloadUrl(splatResult, splatJob.job_id, this.apiEndpoint);
            if (splatUrl) {
              window.dispatchEvent(
                new CustomEvent('taskCompleted', {
                  detail: {
                    taskId: this.activeTaskId,
                    result: {
                      ...splatResult,
                      modelUrl: splatUrl,
                      downloadUrl: splatUrl,
                      feature: 'image_to_splat',
                      pipelineStage: 'splat_preview',
                    },
                  },
                }),
              );
            }
          })
          .catch((err) => {
            logger.warn('Splat preview polling failed', { message: err?.message });
          });
      });
    }

    return {
      ...rigJob,
      pipeline: 'avatar-from-image',
      mesh_job_id: meshJob.job_id,
      humanoid_template_id: templateRig.humanoid_template_id,
    };
  }

  /**
   * Build list of job status URLs to try (env override + fallbacks).
   * @param {string} jobId - Job ID from API
   * @returns {string[]} URLs to try
   */
  _getJobStatusEndpoints(jobId) {
    const fromEnv = (import.meta.env.VITE_API_ENDPOINT || '').trim().replace(/\/$/, '');
    const fromInstance = (this.apiEndpoint || '').trim().replace(/\/$/, '');
    const base = ensureAbsoluteUrl(normalizeApiBaseUrl(fromEnv || fromInstance));
    if (!base) return [];

    const customPath = import.meta.env.VITE_JOB_STATUS_PATH;
    if (customPath && typeof customPath === 'string' && customPath.trim()) {
      const path = customPath.trim().replace(/^\/|\/$/g, '');
      const pathPart = [path, jobId].filter(Boolean).join('/').replace(/\/+/g, '/');
      return [`${base}/${pathPart}`];
    }

    const endpoints = [`${base}/api/v1/system/jobs/${jobId}`];
    if (import.meta.env.VITE_JOB_STATUS_TRY_LEGACY_PATHS === '1') {
      endpoints.push(
        `${base}/api/v1/jobs/${jobId}`,
        `${base}/api/v1/job/${jobId}`,
        `${base}/api/v1/status/${jobId}`,
        `${base}/jobs/${jobId}`,
        `${base}/job/${jobId}/status`,
      );
    }
    return endpoints;
  }

  /**
   * Check job status from API
   * @param {string} jobId - Job ID from API
   * @returns {Promise<Object>} Job status response
   */
  async checkJobStatus(jobId) {
    const possibleEndpoints = this._getJobStatusEndpoints(jobId);
    let lastError = null;
    for (let statusEndpoint of possibleEndpoints) {
      if (!statusEndpoint) continue;
      // Normalize malformed scheme (e.g. "http/host" -> "http://host") to avoid "http://http/host"
      if (/^https?:\/[^/]/.test(statusEndpoint)) {
        statusEndpoint = statusEndpoint.replace(/^(https?):\//, '$1://');
      }
      // Force absolute URL for host:port forms so axios does not hit the page origin.
      // Keep same-origin / Vite proxy paths (e.g. /__dev_dgx_proxy/...) relative.
      if (!/^https?:\/\//i.test(statusEndpoint) && !statusEndpoint.startsWith('/')) {
        statusEndpoint = `http://${statusEndpoint}`;
      }
      try {
        const response = await axios.get(statusEndpoint, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...get3daigcAuthHeaders()
          },
          // Vite/DGX proxy can stall briefly during heavy env-scan GPU work.
          timeout: 30000,
        });
        return response.data;
      } catch (error) {
        if (error.response?.status === 404) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    if (lastError) {
      const canonicalOnly = possibleEndpoints.length === 1;
      if (canonicalOnly) {
        const err = new Error(
          `Job not found on API (expired or deleted on DGX): ${jobId}`,
        );
        err.code = 'JOB_NOT_FOUND';
        err.jobNotFound = true;
        throw err;
      }
      const err = new Error(`Job status endpoint not found. Tried: ${possibleEndpoints.join(', ')}`);
      err.code = 'JOB_STATUS_404';
      err.all404 = true;
      throw err;
    }
    throw new Error('Unknown error checking job status');
  }

  /**
   * Poll job status until completion
   * @param {string} jobId - Job ID from API
   * @param {string} taskId - Internal task ID
   * @param {number} pollInterval - Polling interval in ms (default: 3000)
   * @param {number} maxAttempts - Maximum polling attempts (default: 200 = 10 minutes)
   * @returns {Promise<Object>} Final job result
   */
  async pollJobStatus(jobId, taskId, pollInterval = 3000, maxAttempts = 200) {
    let attempts = 0;
    let lastStatus = 'queued';
    let lastPercent = -1;
    let consecutive404 = 0;
    let consecutiveTransient = 0;
    const maxConsecutive404 = 3;
    const maxTransient = maxConsecutiveTransientPollFailures(pollInterval);

    console.log(`Starting job polling for job_id: ${jobId}, task_id: ${taskId}`);
    console.log(`Poll interval: ${pollInterval}ms, Max attempts: ${maxAttempts} (${(maxAttempts * pollInterval / 1000 / 60).toFixed(1)} minutes)`);

    while (attempts < maxAttempts) {
      try {
        const jobStatus = await this.checkJobStatus(jobId);
        consecutive404 = 0;
        if (consecutiveTransient > 0) {
          console.log(
            `Job polling reconnected after ${consecutiveTransient} transient error(s) (job_id: ${jobId})`,
          );
        }
        consecutiveTransient = 0;

        // Extract status from various possible fields
        const status = jobStatus.status ||
                      jobStatus.job_status ||
                      jobStatus.state ||
                      'unknown';

        const { percent, indeterminate, statusLabel, failed } = extractJobProgress(jobStatus);

        if (status !== lastStatus) {
          console.log(`Job status: ${lastStatus} -> ${status}`);
          lastStatus = status;
        }

        if (failed) {
          const errorMessage =
            jobStatus.error ||
            jobStatus.error_message ||
            jobStatus.message ||
            'Job failed';
          const err = new Error(errorMessage);
          err.code = 'JOB_TERMINAL_FAILURE';
          throw err;
        }

        const isActiveJob =
          status === 'processing' ||
          status === 'running' ||
          status === 'queued' ||
          status === 'pending';
        const percentChanged =
          percent != null && (lastPercent < 0 || Math.abs(percent - lastPercent) >= 1);
        if (attempts === 0 || isActiveJob || percentChanged) {
          const task = this.tasks.get(taskId);
          if (task) {
            task.progress = percent;
            task.progressIndeterminate = indeterminate;
            task.statusMessage = statusLabel;
            task.status = 'running';
            task.error = null;
          }
          const progressForStore = percent ?? 0;
          this.updateTaskStatus(taskId, 'running', progressForStore);
          this.emitTaskProgress({
            taskId,
            progress: percent,
            indeterminate,
            status: statusLabel,
          });
          if (percent != null) lastPercent = percent;
          const progressLog = indeterminate
            ? 'indeterminate'
            : `${percent}%`;
          console.log(`Task ${taskId}: ${progressLog} — ${statusLabel} (job progress=${jobStatus.progress})`);
        }

        if (status === 'completed' || status === 'success' || status === 'done' || status === 'succeeded') {
          const downloadUrl = buildJobDownloadUrl(jobStatus, jobId, this.apiEndpoint);
          const result = {
            ...jobStatus,
            job_id: jobId,
            status: 'completed',
            modelUrl: downloadUrl,
            downloadUrl,
            fileUrl: jobStatus.result?.file_url || jobStatus.file_url,
            metadata: jobStatus.result?.metadata || jobStatus.metadata || {},
          };
          const task = this.tasks.get(taskId);
          if (task) {
            task.progress = 100;
            task.statusMessage = statusLabel;
            task.error = null;
          }
          this.updateTaskStatus(taskId, 'running', 100);
          return result;
        }
        if (status === 'failed' || status === 'error' || status === 'failure') {
          const errorMessage = jobStatus.error ||
                              jobStatus.error_message ||
                              jobStatus.message ||
                              'Job failed';
          const err = new Error(errorMessage);
          err.code = 'JOB_TERMINAL_FAILURE';
          throw err;
        }
        if (status !== 'processing' && status !== 'running' && status !== 'queued' && status !== 'pending') {
          console.warn(`Unknown job status: ${status}, continuing to poll...`);
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;
      } catch (error) {
        if (error.code === 'JOB_TERMINAL_FAILURE') {
          throw error;
        }
        if (error.code === 'JOB_NOT_FOUND' || error.jobNotFound) {
          throw error;
        }

        // Real terminal job failures from the API (not "Network Error" / timeouts).
        if (
          !isTransientApiPollError(error) &&
          error.message &&
          (error.message.includes('failed') ||
            error.message.includes('error') ||
            error.message.includes('Job failed'))
        ) {
          throw error;
        }

        if (error.code === 'JOB_STATUS_404' || error.all404) {
          consecutive404++;
          consecutiveTransient = 0;
          if (consecutive404 >= maxConsecutive404) {
            const msg = isLocalDev
              ? 'Job submitted; status endpoint not available. Set VITE_JOB_STATUS_PATH in .env if your API supports job status polling.'
              : 'Job submitted; status polling is not available on this deployment.';
            console.warn(msg);
            this.updateTaskStatus(taskId, 'running', 10, { job_id: jobId, statusPollingUnavailable: true, message: msg }, null);
            return { job_id: jobId, status: 'submitted', statusPollingUnavailable: true, message: msg };
          }
          // Log once per 404 batch, not every attempt
          if (consecutive404 === 1) {
            console.warn('Job status endpoint returned 404; will retry a few times then treat as submitted.');
          }
        } else if (isTransientApiPollError(error)) {
          consecutive404 = 0;
          consecutiveTransient++;
          const task = this.tasks.get(taskId);
          const reconnectMsg = `Reconnecting to API… (${consecutiveTransient}/${maxTransient}) — job still running on DGX (${jobId.slice(0, 8)}…)`;
          if (task) {
            task.statusMessage = reconnectMsg;
            task.status = 'running';
            // Do not mark failed — keep UI on running with a reconnect hint.
            task.error = null;
          }
          this.emitTaskProgress({
            taskId,
            progress: task?.progress ?? null,
            indeterminate: true,
            status: reconnectMsg,
          });
          this.emit('taskUpdated', { task: this.getTask(taskId) });
          console.warn(
            `Transient poll error (attempt ${attempts + 1}/${maxAttempts}, streak ${consecutiveTransient}/${maxTransient}):`,
            error.message || error.code,
          );
          if (consecutiveTransient >= maxTransient) {
            throw new Error(
              'Lost connection to the API while the job was running. ' +
                'Waited ~2 minutes of continuous failures — check that the API and scheduler are online, then use Sync DGX or retry. ' +
                `(job_id: ${jobId})`,
            );
          }
        } else {
          consecutive404 = 0;
          consecutiveTransient = 0;
          console.warn(`Error polling job status (attempt ${attempts + 1}/${maxAttempts}):`, error.message);
        }

        await new Promise(resolve =>
          setTimeout(
            resolve,
            pollInterval *
              (error.code === 'JOB_STATUS_404' || error.all404
                ? 2
                : isTransientApiPollError(error)
                  ? Math.min(3, 1 + consecutiveTransient * 0.25)
                  : 1.5),
          ),
        );
        attempts++;
      }
    }

    const timeoutMinutes = (maxAttempts * pollInterval / 1000 / 60).toFixed(1);
    throw new Error(`Job polling timeout: Maximum attempts (${maxAttempts}) reached after ${timeoutMinutes} minutes. Job may still be processing on the server.`);
  }

  /**
   * Update task status
   * @param {string} taskId - Task ID
   * @param {string} status - New status
   * @param {number} progress - Progress percentage
   * @param {*} result - Task result
   * @param {string} error - Error message
   */
  updateTaskStatus(taskId, status, progress = null, result = null, error = null) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;
    task.updatedAt = new Date();

    if (status === 'running' && !task.startedAt) {
      task.startedAt = new Date();
    }
    if ((status === 'completed' || status === 'failed') && !task.completedAt) {
      task.completedAt = new Date();
    }
    
    if (progress !== null) {
      task.progress = progress;
    }
    if (result !== null) {
      task.result = result;
      applyJobTimestampsToTask(task, result);
    }
    if (error !== null) {
      task.error = error;
    }

    this.emit('taskUpdated', { task });
    this.schedulePersist();
  }

  _hydrateFromStorage() {
    const restored = loadPersistedTasks(this.apiEndpoint);
    if (!restored.length) return;
    for (const task of restored) {
      if (!task?.id || this.tasks.has(task.id)) continue;
      this.tasks.set(task.id, task);
    }
    this._pruneStaleTasks({ silent: true });
    if (this.tasks.size > 0) {
      this.emit('tasksRestored', { tasks: this.getAllTasks() });
    }
  }

  /**
   * Drop tasks older than JOB_RETENTION_MS (24h, matches API Redis TTL).
   * @param {{ silent?: boolean }} [options]
   * @returns {object[]} removed tasks
   */
  _pruneStaleTasks(options = {}) {
    const { silent = false } = options;
    const { kept, removed } = partitionStaleTasks(this.getAllTasks());
    if (!removed.length) return removed;

    this.tasks.clear();
    for (const task of kept) {
      this.tasks.set(task.id, task);
    }

    for (const task of removed) {
      const jobId = resolveTaskJobId(task);
      if (jobId) markJobDeletedLocally(jobId);
      if (!silent) {
        this.emit('taskRemoved', { task, reason: 'stale' });
      }
    }

    if (!silent) {
      this.emit('tasksPruned', { count: removed.length, tasks: removed });
    }
    this.schedulePersist();
    return removed;
  }

  schedulePersist() {
    if (typeof window === 'undefined') return;
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this.persistTasks();
    }, 250);
  }

  persistTasks() {
    this._pruneStaleTasks({ silent: true });
    writeTaskStorageSnapshot(this.getAllTasks(), this.apiEndpoint);
  }

  _buildCompletedTaskResult(finalResult, jobId, taskType) {
    const enriched = enrichCompletedJobPayload(finalResult, jobId, taskType);
    const downloadUrl = buildJobDownloadUrl(finalResult, jobId, this.apiEndpoint);
    const pipeline =
      taskType === 'avatar-from-image'
        ? 'avatar-from-image'
        : enriched?.pipeline || finalResult?.pipeline || null;

    if (
      isTextToImageTaskResult(enriched) ||
      taskType === 'text-to-image' ||
      taskType === 'image-edit'
    ) {
      return {
        ...enriched,
        pipeline,
        feature: 'text_to_image',
        image_url:
          enriched?.image_url ||
          getTaskResultImageUrl(enriched) ||
          (jobId ? `/api/v1/system/jobs/${jobId}/download` : null),
      };
    }

    return {
      ...enriched,
      pipeline,
      mesh_job_id: finalResult?.mesh_job_id || enriched?.mesh_job_id || null,
      modelUrl: downloadUrl || enriched?.modelUrl || null,
      downloadUrl: downloadUrl || enriched?.downloadUrl || null,
    };
  }

  _indexTasksByJobId() {
    const byJobId = new Map();
    for (const task of this.getAllTasks()) {
      const jobId = resolveTaskJobId(task);
      if (jobId) byJobId.set(jobId, task);
    }
    return byJobId;
  }

  async deleteJobOnApi(jobId) {
    if (!jobId || !this.apiEndpoint) {
      throw new Error('Missing job id or API endpoint');
    }
    const base = this.apiEndpoint.replace(/\/$/, '');
    const headers = {
      Accept: 'application/json',
      ...get3daigcAuthHeaders(),
    };
    try {
      await axios.delete(`${base}/api/v1/system/jobs/${jobId}/result`, {
        headers,
        timeout: 20000,
        validateStatus: (status) => status === 200 || status === 404,
      });
    } catch (error) {
      console.warn(`[TaskManager] Result cleanup failed for ${jobId}:`, error?.message || error);
    }
    const response = await axios.delete(`${base}/api/v1/system/jobs/${jobId}`, {
      headers,
      timeout: 20000,
      validateStatus: (status) => status === 200 || status === 404,
    });
    return response.data;
  }

  /**
   * Delete a task locally and on DGX when it has a backend job id.
   * @param {string} taskId
   */
  async deleteTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { deletedLocally: false, deletedRemotely: false, jobId: null };
    }

    const jobId = resolveTaskJobId(task);
    let deletedRemotely = false;

    if (jobId && this.isConnected && this.apiEndpoint) {
      try {
        await this.deleteJobOnApi(jobId);
        deletedRemotely = true;
      } catch (error) {
        if (error.response?.status === 404) {
          deletedRemotely = true;
        } else {
          throw new Error(
            error.response?.data?.detail ||
              error.message ||
              (isLocalDev ? 'Failed to delete job on DGX Spark' : 'Failed to delete job on API'),
          );
        }
      }
    }

    if (jobId) {
      markJobDeletedLocally(jobId);
    }

    this.removeTask(taskId);
    return { deletedLocally: true, deletedRemotely, jobId };
  }

  _dispatchAutoLoadIfNeeded(task, completedResult, source = 'taskCompleted') {
    if (
      task?.type === 'text-to-motion' ||
      isTextToMotionTaskResult(completedResult)
    ) {
      window.dispatchEvent(
        new CustomEvent('taskCompleted', {
          detail: {
            taskId: task?.id,
            task,
            result: completedResult,
            source,
          },
        }),
      );
      return;
    }
    if (
      task?.type === 'text-to-image' ||
      task?.type === 'image-edit' ||
      isTextToImageTaskResult(completedResult)
    ) {
      return;
    }
    const modelUrl = getTaskResultModelUrl(completedResult);
    const isWorldTask =
      task?.type === 'image-to-world' ||
      task?.type === 'environment-scan' ||
      completedResult?.pipelineStage === 'world_package' ||
      completedResult?.feature === 'image_to_world' ||
      completedResult?.feature === 'environment_scan';
    if (!modelUrl && !isWorldTask) return;
    window.dispatchEvent(
      new CustomEvent('taskCompleted', {
        detail: {
          taskId: task?.id,
          task,
          result: completedResult,
          source,
        },
      }),
    );
  }

  /**
   * Adopt a DGX job started elsewhere (e.g. Galaxy XR voice) and poll like a native task.
   * @param {string} jobId
   * @param {{ autoLoad?: boolean, source?: string, prompt?: string|null }} [opts]
   * @returns {Promise<object>}
   */
  async adoptJobFromHandoff(jobId, opts = {}) {
    const {
      autoLoad = true,
      source = 'galaxy-xr',
      prompt = null,
    } = opts;
    const normalizedJobId = String(jobId || '').trim();
    if (!normalizedJobId) {
      throw new Error('jobId is required');
    }
    if (!this.isConnected) {
      const connected = await this.checkConnection();
      if (!connected) {
        throw new Error('Not connected to DGX API');
      }
    }

    let jobStatus;
    try {
      jobStatus = await this.checkJobStatus(normalizedJobId);
    } catch (error) {
      if (error?.jobNotFound || error?.code === 'JOB_NOT_FOUND') {
        throw new Error(`Job not found on DGX: ${normalizedJobId}`);
      }
      throw error;
    }

    const byJobId = this._indexTasksByJobId();
    let task = byJobId.get(normalizedJobId) || null;
    const mapped = taskFromApiJob(jobStatus, task);
    if (!mapped) {
      throw new Error(`Could not map DGX job ${normalizedJobId}`);
    }
    mapped.handoffSource = source;
    mapped.origin = 'xr-voice';
    mapped.syncedFromApi = true;
    mapped.autoLoadOnComplete = Boolean(autoLoad);
    if (prompt) mapped.prompt = prompt;
    this.tasks.set(mapped.id, mapped);
    this.schedulePersist();
    if (!task) {
      this.emit('taskCreated', { task: mapped });
    } else {
      this.emit('taskUpdated', { task: mapped });
    }
    this.emit('tasksSynced', { tasks: sortTasksForDisplay(this.getAllTasks()) });
    task = mapped;

    const mappedStatus = mapApiJobStatusToTaskStatus(jobStatus?.status);
    if (mappedStatus === 'completed') {
      const completedResult = this._buildCompletedTaskResult(
        jobStatus,
        normalizedJobId,
        task.type,
      );
      this.updateTaskStatus(task.id, 'completed', 100, completedResult);
      this.emit('taskCompleted', { task: this.getTask(task.id), result: completedResult });
      if (autoLoad) {
        this._dispatchAutoLoadIfNeeded(task, completedResult, 'xrHandoff');
      }
      return task;
    }
    if (mappedStatus === 'failed') {
      this.updateTaskStatus(
        task.id,
        'failed',
        task.progress,
        jobStatus,
        jobStatus?.error || jobStatus?.message || 'Job failed',
      );
      this.emit('taskFailed', { task: this.getTask(task.id) });
      return task;
    }

    if (!this._resumingJobs.has(normalizedJobId)) {
      this._resumingJobs.add(normalizedJobId);
      void this._resumeTaskPolling(task).finally(() => {
        this._resumingJobs.delete(normalizedJobId);
      });
    }
    return task;
  }

  async syncTasksWithApiHistory(limit = 100) {
    if (!this.isConnected || !this.apiEndpoint) return [];
    await this._reconcileDetachedRunningTasks();
    const base = this.apiEndpoint.replace(/\/$/, '');
    const response = await axios.get(`${base}/api/v1/system/jobs/history`, {
      params: { limit },
      headers: {
        Accept: 'application/json',
        ...get3daigcAuthHeaders(),
      },
      timeout: 15000,
    });
    const jobs = Array.isArray(response.data?.jobs) ? response.data.jobs : [];
    const byJobId = this._indexTasksByJobId();

    const updated = [];
    for (const job of jobs) {
      const jobId = job?.job_id;
      if (!jobId || isJobDeletedLocally(jobId)) continue;
      if (isApiJobStale(job)) continue;
      const existing = byJobId.get(jobId) || null;
      let jobStatus = job;
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        (!job.result || typeof job.result !== 'object')
      ) {
        // Failed jobs usually have `error` and no result — avoid re-GETting every sync
        // (Task Manager was spamming DGX for stale failed rows).
        const hasTerminalError =
          job.status === 'failed' &&
          (typeof job.error === 'string' || typeof job.error_message === 'string');
        if (!hasTerminalError) {
          try {
            jobStatus = await this.checkJobStatus(jobId);
          } catch {
            // Keep history row when detail fetch fails.
          }
        }
      }
      const mapped = taskFromApiJob(jobStatus, existing);
      if (!mapped) continue;
      if (mapped.status === 'completed' || mapped.status === 'failed') {
        mapped.result = this._buildCompletedTaskResult(
          jobStatus,
          jobId,
          mapped.type,
        );
      }
      const loadUrl = getTaskResultModelUrl(mapped.result);
      console.log(
        `[TaskManager] Synced job ${jobId} (${mapped.type}): loadUrl=${loadUrl || 'none'}`,
      );
      if (existing) {
        const wasRunning = existing.status === 'running' || existing.status === 'pending';
        Object.assign(existing, mapped);
        if (wasRunning && mapped.status === 'failed') {
          this.emit('taskFailed', {
            task: existing,
            error: mapped.error || jobStatus?.error || jobStatus?.message || 'Job failed',
          });
        }
        this.tasks.set(existing.id, existing);
      } else {
        this.tasks.set(mapped.id, mapped);
        byJobId.set(jobId, mapped);
        this.emit('taskCreated', { task: mapped });
      }
      updated.push(mapped);
    }

    this._pruneStaleTasks({ silent: true });
    this.schedulePersist();
    this.emit('tasksSynced', { tasks: sortTasksForDisplay(this.getAllTasks()) });
    return updated;
  }

  async resumeInterruptedJobs() {
    if (!this.isConnected) return;
    this._pruneStaleTasks({ silent: true });
    await this._reconcileDetachedRunningTasks();
    for (const task of this.getAllTasks()) {
      if (!task.job_id) continue;
      if (isTaskStale(task)) continue;
      if (task.status !== 'running' && task.status !== 'pending') continue;
      if (this._resumingJobs.has(task.job_id)) continue;
      this._resumingJobs.add(task.job_id);
      void this._resumeTaskPolling(task).finally(() => {
        this._resumingJobs.delete(task.job_id);
      });
    }
  }

  async _reconcileDetachedRunningTasks() {
    if (!this.isConnected) return;

    for (const task of this.getAllTasks()) {
      if (task.status !== 'running' || !task.job_id) continue;
      if (this._resumingJobs.has(task.job_id)) continue;
      if (!isRunningTaskDetached(task)) continue;

      try {
        const status = await this.checkJobStatus(task.job_id);
        const mappedStatus = mapApiJobStatusToTaskStatus(status?.status);
        if (mappedStatus === 'completed') {
          const completedResult = this._buildCompletedTaskResult(status, task.job_id, task.type);
          this.updateTaskStatus(task.id, 'completed', 100, completedResult);
          this.emit('taskCompleted', { task: this.getTask(task.id), result: completedResult });
          continue;
        }
        if (mappedStatus === 'failed') {
          this.updateTaskStatus(
            task.id,
            'failed',
            task.progress,
            status,
            status?.error || status?.message || 'Job failed',
          );
          this.emit('taskFailed', { task: this.getTask(task.id) });
          continue;
        }
        if (mappedStatus === 'running' || mappedStatus === 'pending') {
          continue;
        }
      } catch (error) {
        if (error.code === 'JOB_NOT_FOUND' || error.jobNotFound) {
          const jobId = resolveTaskJobId(task);
          if (jobId) markJobDeletedLocally(jobId);
          this.removeTask(task.id);
          this.emit('taskRemoved', { task, reason: 'expired' });
          continue;
        }
        const isNetworkDown =
          error.code === 'ERR_NETWORK' ||
          error.code === 'ECONNABORTED' ||
          error.message?.includes('Network Error') ||
          error.response?.status >= 500;
        if (isNetworkDown) continue;
      }

      this.updateTaskStatus(
        task.id,
        'failed',
        task.progress,
        task.result ?? null,
        STALE_RUNNING_TASK_ERROR,
      );
      task.statusMessage = 'Sync DGX to refresh';
      this.emit('taskFailed', { task: this.getTask(task.id), error: STALE_RUNNING_TASK_ERROR });
    }
  }

  async _resumeTaskPolling(task) {
    try {
      const status = await this.checkJobStatus(task.job_id);
      const mappedStatus = mapApiJobStatusToTaskStatus(status?.status);
      if (mappedStatus === 'completed') {
        const completedResult = this._buildCompletedTaskResult(status, task.job_id, task.type);
        this.updateTaskStatus(task.id, 'completed', 100, completedResult);
        this.emit('taskCompleted', { task: this.getTask(task.id), result: completedResult });
        if (task.autoLoadOnComplete) {
          this._dispatchAutoLoadIfNeeded(task, completedResult, 'xrHandoff');
        }
        return;
      }
      if (mappedStatus === 'failed') {
        this.updateTaskStatus(
          task.id,
          'failed',
          task.progress,
          status,
          status?.error || status?.message || 'Job failed',
        );
        this.emit('taskFailed', { task: this.getTask(task.id) });
        return;
      }

      const pollOptions =
        task.type === 'image-to-3d' ||
        task.type === 'image-to-splat' ||
        task.type === 'avatar-from-image' ||
        task.type === 'image-to-world' ||
        task.type === 'environment-scan' ||
        task.type === 'auto-rigging'
          ? {
              maxAttempts:
                task.type === 'environment-scan'
                  ? 1200
                  : task.type === 'auto-rigging'
                    ? 900
                    : 600,
              pollInterval: 3000,
            }
          : {};
      const finalResult = await this.pollJobStatus(
        task.job_id,
        task.id,
        pollOptions.pollInterval ?? 3000,
        pollOptions.maxAttempts ?? 200,
      );
      if (finalResult?.statusPollingUnavailable) {
        const row = this.getTask(task.id);
        if (row) row.statusMessage = 'Submitted — use Sync DGX when the job finishes';
        this.updateTaskStatus(task.id, 'running', 10, finalResult, null);
        this.emit('taskUpdated', { task: this.getTask(task.id) });
        return;
      }
      const completedResult = this._buildCompletedTaskResult(finalResult, task.job_id, task.type);
      this.updateTaskStatus(task.id, 'completed', 100, completedResult);
      this.emit('taskCompleted', { task: this.getTask(task.id), result: completedResult });
      if (task.autoLoadOnComplete) {
        this._dispatchAutoLoadIfNeeded(task, completedResult, 'xrHandoff');
      }
    } catch (error) {
      if (error.code === 'JOB_NOT_FOUND' || error.jobNotFound) {
        const jobId = resolveTaskJobId(task);
        if (jobId) markJobDeletedLocally(jobId);
        this.removeTask(task.id);
        this.emit('taskRemoved', { task, reason: 'expired' });
        return;
      }
      const message =
        /polling timeout/i.test(error?.message || '')
          ? STALE_RUNNING_TASK_ERROR
          : error?.message || STALE_RUNNING_TASK_ERROR;
      console.warn(`[TaskManager] Failed to resume job ${task.job_id}:`, message);
      this.updateTaskStatus(task.id, 'failed', task.progress ?? null, task.result ?? null, message);
      this.emit('taskFailed', { task: this.getTask(task.id), error: message });
    }
  }

  /**
   * Get task by ID
   * @param {string} taskId - Task ID
   */
  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   * @param {string} status - Task status
   */
  getTasksByStatus(status) {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  /**
   * Get tasks by type
   * @param {string} type - Task type
   */
  getTasksByType(type) {
    return Array.from(this.tasks.values()).filter(task => task.type === type);
  }

  /**
   * Remove task
   * @param {string} taskId - Task ID
   */
  removeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task) {
      this.tasks.delete(taskId);
      this.emit('taskRemoved', { task });
      this.schedulePersist();
    }
  }

  /**
   * Clear completed tasks
   */
  clearCompletedTasks() {
    const completedTasks = this.getTasksByStatus('completed');
    completedTasks.forEach(task => {
      this.tasks.delete(task.id);
    });
    this.emit('tasksCleared', { count: completedTasks.length });
    this.schedulePersist();
  }

  /**
   * Clear all tasks
   */
  clearAllTasks() {
    const taskCount = this.tasks.size;
    this.tasks.clear();
    this.emit('allTasksCleared', { count: taskCount });
    this.schedulePersist();
  }

  /**
   * Get task statistics
   */
  getTaskStats() {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length
    };
  }

  /**
   * Event system
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => callback(data));
    }
  }

  listenerCount(event) {
    return this.eventListeners.has(event) ? this.eventListeners.get(event).length : 0;
  }

  /**
   * Cleanup
   */
  dispose() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    this.persistTasks();
    this.eventListeners.clear();
  }
}
