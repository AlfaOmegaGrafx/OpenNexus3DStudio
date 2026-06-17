/**
 * TaskManager - Manages AI generation tasks and workflows
 * Similar to the task management in CharacterStudio but focused on 3DAIGC workflows
 *
 * HTTP targets 3DAIGC-API (AlfaOmegaGrafx/3DAIGC-API: mesh_generation.py, system.py).
 * There is no api.md in this repo; backend should publish OpenAPI or a consumer contract doc.
 */
import axios from 'axios';
import { logger } from './logger.js';
import { performanceMonitor } from './performanceMonitor.js';
import { rollbackManager } from './rollbackManager.js';
import avatarSdkService from '../services/avatarSdkService.js';
import {
  buildJobDownloadUrl,
  enrichCompletedJobPayload,
  extractJobProgress,
  getTaskResultModelUrl,
  resolveTaskModelUrl,
} from './taskModelUrl.js';
import {
  getDefaultAutoRigOutputFormat,
  getDefaultModelForFeature,
  resolveAutoRigModelForTask,
  resolveMeshModelForAvatarFromImage,
  AVATAR_MESH_DECIMATION_TARGET,
} from './aiModelsCatalog.js';
import {
  AUTO_RIG_MODES,
  buildTemplateAutoRigOptions,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  normalizeHumanoidTemplateId,
  TEMPLATE_RIG_MODEL_ID,
} from './avatarPipelineCatalog.js';
import {
  applyJobTimestampsToTask,
  isJobDeletedLocally,
  loadPersistedTasks,
  mapApiJobStatusToTaskStatus,
  markJobDeletedLocally,
  resolveTaskJobId,
  sortTasksForDisplay,
  taskFromApiJob,
  writeTaskStorageSnapshot,
} from './taskPersistence.js';

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
      'avatar-from-photo',
      'image-to-world',
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
      const base = (this.apiEndpoint || '').replace(/\/$/, '');
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
            response = await axios.get(`${this.apiEndpoint}/`, { 
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
              recovery: errorDetails.connectionRefused ? 'Set VITE_API_ENDPOINT to your API server URL (e.g. DGX Sparks)' : 'Check server accessibility'
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

    const taskId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const task = {
      id: taskId,
      type,
      name: `${type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}`,
      prompt,
      imageFile,
      options,
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
          task.type === 'image-to-world'
            ? { maxAttempts: 600, pollInterval: 3000 }
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
          this.updateTaskStatus(taskId, 'running', 10, finalResult, null);
          this.emit('taskUpdated', { task: this.tasks.get(taskId) });
        } else {
          const completedResult = this._buildCompletedTaskResult(
            finalResult,
            result.job_id,
            task.type,
          );
          this.updateTaskStatus(taskId, 'completed', 100, completedResult);
          this.emit('taskCompleted', { task: this.tasks.get(taskId), result: completedResult });
          const modelUrl = getTaskResultModelUrl(completedResult);
          const isWorldTask =
            task.type === 'image-to-world' ||
            completedResult.pipelineStage === 'world_package' ||
            completedResult.feature === 'image_to_world';
          if (modelUrl || isWorldTask) {
            const taskRow = this.tasks.get(taskId);
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
        }
        return finalResult;
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
   * @param {Blob} modelData
   * @param {string} [filename]
   */
  async uploadMeshFile(modelData, filename = 'model.glb') {
    const endpoint = `${this.apiEndpoint}/api/v1/file-upload/mesh`;
    const formData = new FormData();
    formData.append('file', modelData, filename);
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
      case 'avatar-from-photo':
        return await this.executeAvatarFromPhoto(prompt, imageFile, options);
      case 'avatar-from-image':
        return await this.executeAvatarFromImage(prompt, imageFile, options);
      case 'image-to-world':
        return await this.executeImageToWorld(prompt, imageFile, options);
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }

  /**
   * Execute text-to-3D generation (production API only)
   */
  async executeTextTo3D(prompt, options) {
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-generation/text-to-textured-mesh`;
    const requestData = {
      text_prompt: prompt,
      texture_prompt: options?.texture_prompt ?? prompt,
      texture_resolution: options?.texture_resolution ?? 1024,
      output_format: 'glb',
      model_preference: options?.model_preference ?? 'trellis_text_to_textured_mesh',
    };
    if (options?.mesh_simplify != null) {
      requestData.mesh_simplify = options.mesh_simplify;
    }
    if (options?.model_parameters && Object.keys(options.model_parameters).length > 0) {
      requestData.model_parameters = options.model_parameters;
    }
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
      throw err;
    }
  }

  /**
   * Execute image-to-3D generation (input is downscaled to max side before upload when in browser).
   */
  async executeImageTo3D(prompt, imageFile, options) {
    if (!imageFile) {
      return await this.executeTextTo3D(prompt || 'Convert image to 3D', options);
    }
    const maxSide =
      Number(options?.max_image_side ?? import.meta.env.VITE_3DAIGC_MAX_IMAGE_SIDE ?? 2048) || 2048;
    const preparedImage = await resizeImageFor3daigc(imageFile, maxSide);

    const endpoint = `${this.apiEndpoint}/api/v1/mesh-generation/image-to-textured-mesh`;

    let imageFileId = null;
    try {
      imageFileId = await this.uploadImageFileForApi(preparedImage);
    } catch (uploadErr) {
      const st = uploadErr?.response?.status;
      if (st === 400 || st === 413 || st === 422) {
        logger.warn('Image file upload rejected; falling back to image_base64', {
          status: st,
          detail: uploadErr?.response?.data
        });
      } else {
        throw uploadErr;
      }
    }

    const basePayload = {
      output_format: 'glb',
      model_preference:
        options?.model_preference ??
        import.meta.env.VITE_DEFAULT_IMAGE_TO_3D_MODEL ??
        getDefaultModelForFeature('image-to-3d'),
    };
    if (options?.texture_resolution != null) {
      basePayload.texture_resolution = options.texture_resolution;
    }
    if (options?.mesh_simplify != null) {
      basePayload.mesh_simplify = options.mesh_simplify;
    }
    if (options?.model_parameters && Object.keys(options.model_parameters).length > 0) {
      basePayload.model_parameters = options.model_parameters;
    }

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
        const e = new Error(`Network error: No response from server at ${endpoint}. Ensure the API server is running.`);
        e.originalError = error;
        throw e;
      }
      throw error;
    }
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
    const basePayload = {
      output_format: outputFormat,
      model_preference:
        options?.model_preference ??
        import.meta.env.VITE_DEFAULT_IMAGE_TO_SPLAT_MODEL ??
        'triposplat_image_to_splat',
    };
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
    const body = {
      mesh_file_id: meshFileId,
      output_format: options.output_format ?? 'glb',
      model_preference: options.model_preference,
    };
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

    const payload = {
      output_format: 'glb',
      model_preference:
        options?.model_preference ??
        import.meta.env.VITE_DEFAULT_IMAGE_TO_RAW_MESH_MODEL ??
        'hunyuan3dv21_image_to_raw_mesh',
      ...(imageFileId
        ? { image_file_id: imageFileId }
        : { image_base64: await this.fileToBase64(preparedImage) }),
    };
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
    const requestData = {
      text_prompt: prompt,
      mesh_base64: meshBase64,
      output_format: options?.output_format ?? 'glb',
      model_preference: options?.model_preference ?? 'trellis_text_mesh_painting'
    };
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
    const body = await this.buildMeshJobBody(modelData, {
      output_format: options?.output_format ?? 'obj',
      model_preference: options?.model_preference ?? 'instant_meshes_retopology',
      model_parameters: options?.model_parameters,
    });
    if (options?.target_vertex_count != null) {
      body.target_vertex_count = options.target_vertex_count;
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
    if (!modelData) {
      throw new Error('Auto-rigging requires a mesh (load a model in the viewport first).');
    }

    const endpoint = `${this.apiEndpoint}/api/v1/auto-rigging/generate-rig`;
    const config = { timeout: 300000 };

    this.emitTaskProgress({ indeterminate: true, status: 'Uploading mesh…' });
    const meshFileId = await this.uploadMeshFile(modelData, 'model.glb');

    // Rig job must request fbx (supported-formats); completed jobs download as GLB for the viewport.
    const rigMode = options?.rig_mode ?? AUTO_RIG_MODES.FULL;
    const modelPreference = resolveAutoRigModelForTask(rigMode, options?.model_preference);
    const outputFormat =
      options?.output_format ?? getDefaultAutoRigOutputFormat(modelPreference, rigMode);
    const rigBody = {
      mesh_file_id: meshFileId,
      rig_mode: rigMode,
      output_format: outputFormat,
      model_preference: modelPreference,
    };

    if (rigMode === AUTO_RIG_MODES.TEMPLATE) {
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

    const modelParams = options?.model_parameters;
    if (modelParams && typeof modelParams === 'object' && Object.keys(modelParams).length > 0) {
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
    const response = await axios.post(endpoint, rigBody, {
      headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
      ...config,
    });
    return response.data;
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

    const payload = {
      model_preference: options?.model_preference ?? 'opennexus_image_to_world',
      world_id: options?.world_id,
      world_name: options?.world_name || prompt || 'Generated World',
      prop_regions: options?.prop_regions ?? [],
      prop_mesh_model_preference:
        options?.prop_mesh_model_preference ?? 'trellis2_image_to_textured_mesh',
      splat_parameters: options?.splat_parameters,
      prop_mesh_parameters: options?.prop_mesh_parameters,
      spawn: options?.spawn,
      ...(imageFileId
        ? { image_file_id: imageFileId }
        : { image_base64: await this.fileToBase64(preparedImage) }),
    };

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
   * Full local avatar pipeline: image → textured mesh → template VRM rig (GLB).
   * Optionally queues TripoSplat preview in parallel when include_splat_preview is set.
   */
  async executeAvatarFromImage(prompt, imageFile, options = {}) {
    if (!imageFile) {
      throw new Error('Avatar from image requires an input photo');
    }

    const meshModel = resolveMeshModelForAvatarFromImage(
      options?.mesh_model_preference ?? options?.model_preference,
    );

    let splatJobPromise = null;
    if (options?.include_splat_preview) {
      splatJobPromise = this.executeImageToSplat(prompt, imageFile, {
        model_preference:
          options?.splat_model_preference ?? 'triposplat_image_to_splat',
        output_format: options?.splat_output_format ?? 'ply',
        model_parameters: options?.splat_model_parameters,
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
      model_parameters: {
        decimation_target:
          options?.model_parameters?.decimation_target ?? AVATAR_MESH_DECIMATION_TARGET,
        ...(options?.model_parameters || {}),
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
    const meshFile = await this.fetchJobDownloadBlob(meshDownloadUrl, 'avatar_mesh.glb');
    const templateRig = buildTemplateAutoRigOptions({
      humanoid_template_id: options?.humanoid_template_id,
    });
    const rigJob = await this.executeAutoRigging(
      {
        ...templateRig,
        model_parameters: options?.rig_model_parameters,
      },
      meshFile,
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

  async executeAvatarFromPhoto(prompt, imageFile, options = {}) {
    if (!imageFile) {
      throw new Error('AvatarSDK task requires an input photo.');
    }

    return avatarSdkService.generateAvatarFromPhoto({
      imageFile,
      name: options?.name || prompt || `Avatar ${new Date().toISOString()}`,
      description: options?.description || '',
      pipeline: options?.pipeline,
      pipelineSubtype: options?.pipeline_subtype,
      onProgress: ({ stage, status, progress }) => {
        this.emitTaskProgress( { stage, status, progress });
      }
    });
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
      // Force absolute URL so the request always goes to the API host, not the page origin (fixes relative URL → localhost)
      if (!/^https?:\/\//i.test(statusEndpoint)) {
        statusEndpoint = `http://${statusEndpoint}`;
      }
      try {
        const response = await axios.get(statusEndpoint, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...get3daigcAuthHeaders()
          },
          timeout: 10000
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
    const maxConsecutive404 = 3;

    console.log(`Starting job polling for job_id: ${jobId}, task_id: ${taskId}`);
    console.log(`Poll interval: ${pollInterval}ms, Max attempts: ${maxAttempts} (${(maxAttempts * pollInterval / 1000 / 60).toFixed(1)} minutes)`);

    while (attempts < maxAttempts) {
      try {
        const jobStatus = await this.checkJobStatus(jobId);
        consecutive404 = 0;

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
          throw new Error(errorMessage);
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
          }
          this.updateTaskStatus(taskId, 'running', 100);
          return result;
        }
        if (status === 'failed' || status === 'error' || status === 'failure') {
          const errorMessage = jobStatus.error ||
                              jobStatus.error_message ||
                              jobStatus.message ||
                              'Job failed';
          throw new Error(errorMessage);
        }
        if (status !== 'processing' && status !== 'running' && status !== 'queued' && status !== 'pending') {
          console.warn(`Unknown job status: ${status}, continuing to poll...`);
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;
      } catch (error) {
        if (error.message && (error.message.includes('failed') || error.message.includes('error') || error.message.includes('Job failed'))) {
          throw error;
        }

        if (error.code === 'JOB_NOT_FOUND' || error.jobNotFound) {
          throw error;
        }

        if (error.code === 'JOB_STATUS_404' || error.all404) {
          consecutive404++;
          if (consecutive404 >= maxConsecutive404) {
            const msg = 'Job submitted; status endpoint not available. Set VITE_JOB_STATUS_PATH in .env if your API supports job status polling.';
            console.warn(msg);
            this.updateTaskStatus(taskId, 'running', 10, { job_id: jobId, statusPollingUnavailable: true, message: msg }, null);
            return { job_id: jobId, status: 'submitted', statusPollingUnavailable: true, message: msg };
          }
          // Log once per 404 batch, not every attempt
          if (consecutive404 === 1) {
            console.warn('Job status endpoint returned 404; will retry a few times then treat as submitted.');
          }
        } else {
          consecutive404 = 0;
          console.warn(`Error polling job status (attempt ${attempts + 1}/${maxAttempts}):`, error.message);
        }

        const isNetworkDown =
          error.code === 'ERR_NETWORK' ||
          error.code === 'ECONNABORTED' ||
          error.message?.includes('Network Error') ||
          error.response?.status >= 500;
        if (attempts > 5 && isNetworkDown) {
          throw new Error(
            'Lost connection to the API while the job was running. ' +
              'The server may have restarted — check that the API and scheduler are online, then retry. ' +
              `(job_id: ${jobId})`
          );
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval * (error.code === 'JOB_STATUS_404' || error.all404 ? 2 : 1.5)));
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
    if (this.tasks.size > 0) {
      this.emit('tasksRestored', { tasks: this.getAllTasks() });
    }
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
    writeTaskStorageSnapshot(this.getAllTasks(), this.apiEndpoint);
  }

  _buildCompletedTaskResult(finalResult, jobId, taskType) {
    const enriched = enrichCompletedJobPayload(finalResult, jobId, taskType);
    const downloadUrl = buildJobDownloadUrl(finalResult, jobId, this.apiEndpoint);
    const pipeline =
      taskType === 'avatar-from-image'
        ? 'avatar-from-image'
        : enriched?.pipeline || finalResult?.pipeline || null;
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
              'Failed to delete job on DGX Spark',
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

  async syncTasksWithApiHistory(limit = 100) {
    if (!this.isConnected || !this.apiEndpoint) return [];
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
      const existing = byJobId.get(jobId) || null;
      let jobStatus = job;
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        (!job.result || typeof job.result !== 'object')
      ) {
        try {
          jobStatus = await this.checkJobStatus(jobId);
        } catch {
          // Keep history row when detail fetch fails.
        }
      }
      const mapped = taskFromApiJob(jobStatus, existing);
      if (!mapped) continue;
      const loadUrl = getTaskResultModelUrl(mapped.result);
      console.log(
        `[TaskManager] Synced job ${jobId} (${mapped.type}): loadUrl=${loadUrl || 'none'}`,
      );
      if (existing) {
        Object.assign(existing, mapped);
        this.tasks.set(existing.id, existing);
      } else {
        this.tasks.set(mapped.id, mapped);
        byJobId.set(jobId, mapped);
        this.emit('taskCreated', { task: mapped });
      }
      updated.push(mapped);
    }

    this.schedulePersist();
    this.emit('tasksSynced', { tasks: sortTasksForDisplay(this.getAllTasks()) });
    return updated;
  }

  async resumeInterruptedJobs() {
    if (!this.isConnected) return;
    for (const task of this.getAllTasks()) {
      if (!task.job_id) continue;
      if (task.status !== 'running' && task.status !== 'pending') continue;
      if (this._resumingJobs.has(task.job_id)) continue;
      this._resumingJobs.add(task.job_id);
      void this._resumeTaskPolling(task).finally(() => {
        this._resumingJobs.delete(task.job_id);
      });
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
        task.type === 'image-to-world'
          ? { maxAttempts: 600, pollInterval: 3000 }
          : {};
      const finalResult = await this.pollJobStatus(
        task.job_id,
        task.id,
        pollOptions.pollInterval ?? 3000,
        pollOptions.maxAttempts ?? 200,
      );
      if (finalResult?.statusPollingUnavailable) {
        this.updateTaskStatus(task.id, 'running', 10, finalResult, null);
        this.emit('taskUpdated', { task: this.getTask(task.id) });
        return;
      }
      const completedResult = this._buildCompletedTaskResult(finalResult, task.job_id, task.type);
      this.updateTaskStatus(task.id, 'completed', 100, completedResult);
      this.emit('taskCompleted', { task: this.getTask(task.id), result: completedResult });
    } catch (error) {
      if (error.code === 'JOB_NOT_FOUND' || error.jobNotFound) {
        this.updateTaskStatus(
          task.id,
          'failed',
          task.progress ?? 0,
          null,
          error.message ||
            'Job not found on API (expired or deleted on DGX). Submit a new task or clear this entry.',
        );
        this.emit('taskFailed', { task: this.getTask(task.id) });
        return;
      }
      console.warn(`[TaskManager] Failed to resume job ${task.job_id}:`, error?.message || error);
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
