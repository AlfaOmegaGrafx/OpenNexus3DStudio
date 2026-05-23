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
    this.apiEndpoint = ensureAbsoluteUrl(apiEndpoint ?? import.meta.env.VITE_API_ENDPOINT ?? '');
    this.tasks = new Map();
    this.isConnected = false;
    this.eventListeners = new Map();
    
    // Supported task types
    this.supportedTypes = [
      'text-to-3d',
      'image-to-3d',
      'mesh-painting',
      'mesh-painting-text',
      'mesh-segmentation',
      'part-completion',
      'auto-rigging',
      'mesh-retopology',
      'mesh-uv-unwrapping',
      'mesh-editing-text',
      'mesh-editing-image',
      'avatar-from-photo'
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
    this.apiEndpoint = ensureAbsoluteUrl(endpoint);
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

        const finalResult = await this.pollJobStatus(result.job_id, taskId);
        console.log('Job polling completed:', finalResult);

        if (finalResult && finalResult.statusPollingUnavailable) {
          this.updateTaskStatus(taskId, 'running', 10, finalResult, null);
          this.emit('taskUpdated', { task: this.tasks.get(taskId) });
        } else {
          this.updateTaskStatus(taskId, 'completed', 100, finalResult);
          this.emit('taskCompleted', { task: this.tasks.get(taskId), result: finalResult });
          const modelUrl =
            finalResult.modelUrl ||
            finalResult.downloadUrl ||
            finalResult.mesh_url ||
            finalResult.result?.mesh_url;
          if (modelUrl) {
            console.log('Auto-loading generated model:', modelUrl);
            window.dispatchEvent(new CustomEvent('taskCompleted', { detail: { taskId, result: { modelUrl } } }));
          }
        }
        return finalResult;
      }

      // Direct result (no async job)
      this.updateTaskStatus(taskId, 'completed', 100, result);
      this.emit('taskCompleted', { task: this.tasks.get(taskId), result });
      const directUrl = result?.modelUrl || result?.downloadUrl || result?.mesh_url;
      if (directUrl) {
        window.dispatchEvent(new CustomEvent('taskCompleted', { detail: { taskId, result: { modelUrl: directUrl } } }));
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
      
      // Extract user-friendly error message
      const errorMessage = error.message || 
                          (error.originalError?.message) || 
                          'Unknown error occurred';
      
      this.updateTaskStatus(taskId, 'failed', task.progress, null, errorMessage);
      this.emit('taskFailed', { task, error });
      throw error;
    }
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
      case 'mesh-painting':
        return await this.executeMeshPainting(prompt, imageFile, options, modelData);
      case 'mesh-painting-text':
        return await this.executeTextMeshPainting(prompt, options, modelData);
      case 'mesh-segmentation':
        return await this.executeMeshSegmentation(options, modelData);
      case 'part-completion':
        return await this.executePartCompletion(prompt, options, modelData);
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
      output_format: options?.output_format ?? 'glb',
      model_preference: options?.model_preference ?? 'trellis_text_to_textured_mesh'
    };
    const startTime = Date.now();
    try {
      const response = await axios.post(endpoint, requestData, {
        headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() },
        timeout: 300000,
        onUploadProgress: (e) => {
          if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 100) / e.total) });
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
          if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 50) / e.total) });
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
      output_format: options?.output_format ?? 'glb',
      model_preference: options?.model_preference ?? 'hunyuan3dv20_image_to_textured_mesh'
    };
    if (options?.texture_resolution != null) {
      basePayload.texture_resolution = options.texture_resolution;
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
        onUploadProgress: () => this.emit('taskProgress', { progress: imageFileId ? 55 : 10 })
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

  async executeMeshPainting(prompt, imageFile, options, modelData = null) {
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-generation/image-mesh-painting`;
    const formData = new FormData();
    formData.append('prompt', prompt);
    if (imageFile) formData.append('image', imageFile);
    if (modelData) formData.append('model', modelData, 'model.glb');
    if (options) formData.append('options', JSON.stringify(options));
    const response = await axios.post(endpoint, formData, {
      headers: { ...get3daigcAuthHeaders() },
      timeout: 300000,
      onUploadProgress: (e) => { if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 100) / e.total) }); }
    });
    return response.data;
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
    const config = { timeout: 300000 };
    if (modelData) {
      const formData = new FormData();
      formData.append('model', modelData, 'model.glb');
      if (options) formData.append('options', JSON.stringify(options));
      const response = await axios.post(endpoint, formData, {
        headers: { ...get3daigcAuthHeaders() },
        ...config,
        onUploadProgress: (e) => { if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 100) / e.total) }); }
      });
      return response.data;
    }
    const response = await axios.post(endpoint, { options }, { headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() }, ...config });
    return response.data;
  }

  async executePartCompletion(prompt, options, modelData = null) {
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-generation/part-completion`;
    const formData = new FormData();
    formData.append('prompt', prompt);
    if (modelData) formData.append('model', modelData, 'model.glb');
    if (options) formData.append('options', JSON.stringify(options));
    const response = await axios.post(endpoint, formData, {
      headers: { ...get3daigcAuthHeaders() },
      timeout: 300000,
      onUploadProgress: (e) => { if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 100) / e.total) }); }
    });
    return response.data;
  }

  async executeMeshRetopology(options, modelData = null) {
    if (!modelData) {
      throw new Error('Mesh retopology requires a mesh (load a model in the viewport first).');
    }
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-retopology/retopologize-mesh`;
    const formData = new FormData();
    formData.append('model', modelData, 'model.glb');
    if (options) formData.append('options', JSON.stringify(options));
    const response = await axios.post(endpoint, formData, {
      headers: { ...get3daigcAuthHeaders() },
      timeout: 300000,
      onUploadProgress: (e) => { if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 100) / e.total) }); }
    });
    return response.data;
  }

  async executeMeshUVUnwrapping(options, modelData = null) {
    if (!modelData) {
      throw new Error('UV unwrapping requires a mesh (load a model in the viewport first).');
    }
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-uv-unwrapping/unwrap-mesh`;
    const formData = new FormData();
    formData.append('model', modelData, 'model.glb');
    if (options) formData.append('options', JSON.stringify(options));
    const response = await axios.post(endpoint, formData, {
      headers: { ...get3daigcAuthHeaders() },
      timeout: 300000,
      onUploadProgress: (e) => { if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 100) / e.total) }); }
    });
    return response.data;
  }

  async executeMeshEditingText(prompt, options, modelData = null) {
    if (!modelData) {
      throw new Error('Mesh editing (text) requires a mesh (load a model in the viewport first).');
    }
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-editing/text-mesh-editing`;
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', modelData, 'model.glb');
    if (options) formData.append('options', JSON.stringify(options));
    const response = await axios.post(endpoint, formData, {
      headers: { ...get3daigcAuthHeaders() },
      timeout: 300000,
      onUploadProgress: (e) => { if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 100) / e.total) }); }
    });
    return response.data;
  }

  async executeMeshEditingImage(prompt, imageFile, options, modelData = null) {
    if (!modelData) {
      throw new Error('Mesh editing (image) requires a mesh (load a model in the viewport first).');
    }
    if (!imageFile) {
      throw new Error('Mesh editing (image) requires a reference image.');
    }
    const endpoint = `${this.apiEndpoint}/api/v1/mesh-editing/image-mesh-editing`;
    const formData = new FormData();
    formData.append('prompt', prompt || 'Apply reference to mesh');
    formData.append('model', modelData, 'model.glb');
    formData.append('image', imageFile);
    if (options) formData.append('options', JSON.stringify(options));
    const response = await axios.post(endpoint, formData, {
      headers: { ...get3daigcAuthHeaders() },
      timeout: 300000,
      onUploadProgress: (e) => { if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 100) / e.total) }); }
    });
    return response.data;
  }

  async executeAutoRigging(options, modelData = null) {
    const endpoint = `${this.apiEndpoint}/api/v1/auto-rigging/generate-rig`;
    const config = { timeout: 300000 };
    if (modelData) {
      const formData = new FormData();
      formData.append('model', modelData, 'model.glb');
      if (options) formData.append('options', JSON.stringify(options));
      const response = await axios.post(endpoint, formData, {
        headers: { ...get3daigcAuthHeaders() },
        ...config,
        onUploadProgress: (e) => { if (e.total) this.emit('taskProgress', { progress: Math.round((e.loaded * 100) / e.total) }); }
      });
      return response.data;
    }
    const response = await axios.post(endpoint, { options }, { headers: { 'Content-Type': 'application/json', ...get3daigcAuthHeaders() }, ...config });
    return response.data;
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
        this.emit('taskProgress', { stage, status, progress });
      }
    });
  }

  /**
   * Build list of job status URLs to try (env override + fallbacks).
   * @param {string} jobId - Job ID from API
   * @returns {string[]} URLs to try
   */
  _getJobStatusEndpoints(jobId) {
    // Always use an absolute base URL so requests go to the API host, not the page origin.
    const fromEnv = (import.meta.env.VITE_API_ENDPOINT || '').trim().replace(/\/$/, '');
    const fromInstance = (this.apiEndpoint || '').trim().replace(/\/$/, '');
    const base = ensureAbsoluteUrl(fromEnv || fromInstance);
    if (!base) return [];
    const customPath = import.meta.env.VITE_JOB_STATUS_PATH;
    if (customPath && typeof customPath === 'string' && customPath.trim()) {
      const path = customPath.trim().replace(/^\/|\/$/g, '');
      const pathPart = [path, jobId].filter(Boolean).join('/').replace(/\/+/g, '/');
      const pathPartStatus = [path, jobId, 'status'].filter(Boolean).join('/').replace(/\/+/g, '/');
      return [`${base}/${pathPart}`, `${base}/${pathPartStatus}`];
    }
    // 3DAIGC-API / DGX Spark default: GET /api/v1/system/jobs/{job_id}
    return [
      `${base}/api/v1/system/jobs/${jobId}`,
      `${base}/api/v1/jobs/${jobId}`,
      `${base}/api/v1/job/${jobId}`,
      `${base}/api/v1/status/${jobId}`,
      `${base}/jobs/${jobId}`,
      `${base}/job/${jobId}/status`
    ];
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
    let lastProgress = 0;
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

        // Extract progress (0-100)
        let progress = jobStatus.progress;
        if (progress === undefined || progress === null) {
          if (status === 'queued' || status === 'pending') {
            progress = 5;
          } else if (status === 'processing' || status === 'running') {
            progress = Math.min(10 + (attempts / maxAttempts * 80), 90);
          } else if (status === 'completed' || status === 'success' || status === 'succeeded') {
            progress = 100;
          } else {
            progress = lastProgress || 10;
          }
        }

        progress = Math.max(0, Math.min(100, Number(progress) || 0));

        if (status !== lastStatus) {
          console.log(`Job status: ${lastStatus} -> ${status}`);
          lastStatus = status;
        }
        if (Math.abs(progress - lastProgress) >= 5 || attempts === 0) {
          this.updateTaskStatus(taskId, 'running', progress);
          this.emit('taskProgress', { taskId, progress, status });
          lastProgress = progress;
        }

        if (status === 'completed' || status === 'success' || status === 'done' || status === 'succeeded') {
          const r = jobStatus.result || {};
          const modelUrl =
            r.mesh_url ||
            r.model_url ||
            r.output_mesh_path ||
            jobStatus.model_url ||
            jobStatus.result_url ||
            jobStatus.download_url ||
            r.download_url;
          const result = {
            ...jobStatus,
            job_id: jobId,
            status: 'completed',
            modelUrl,
            downloadUrl: r.download_url || jobStatus.download_url || jobStatus.result_url || modelUrl,
            fileUrl: r.file_url || jobStatus.file_url,
            metadata: r.metadata || jobStatus.metadata || {}
          };
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

        if (attempts > 20 && (error.code === 'ERR_NETWORK' || error.response?.status >= 500)) {
          throw new Error(`Network error while polling job status after ${attempts} attempts: ${error.message}`);
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
    
    if (progress !== null) {
      task.progress = progress;
    }
    if (result !== null) {
      task.result = result;
    }
    if (error !== null) {
      task.error = error;
    }

    this.emit('taskUpdated', { task });
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
  }

  /**
   * Clear all tasks
   */
  clearAllTasks() {
    const taskCount = this.tasks.size;
    this.tasks.clear();
    this.emit('allTasksCleared', { count: taskCount });
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
    this.tasks.clear();
    this.eventListeners.clear();
  }
}
