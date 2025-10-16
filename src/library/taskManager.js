/**
 * TaskManager - Manages AI generation tasks and workflows
 * Similar to the task management in CharacterStudio but focused on 3DAIGC workflows
 */
import axios from 'axios';

export class TaskManager {
  constructor(apiEndpoint = 'http://localhost:8000') {
    this.apiEndpoint = apiEndpoint;
    this.tasks = new Map();
    this.isConnected = false;
    this.eventListeners = new Map();
    
    // Supported task types
    this.supportedTypes = [
      'text-to-3d',
      'image-to-3d', 
      'mesh-painting',
      'mesh-segmentation',
      'part-completion',
      'auto-rigging'
    ];
  }

  /**
   * Check API connection
   */
  async checkConnection() {
    try {
      console.log(`🔗 Checking API connection to: ${this.apiEndpoint}/health`);
      const startTime = Date.now();
      
      const response = await axios.get(`${this.apiEndpoint}/health`, { 
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ API response received in ${responseTime}ms:`, response.data);
      console.log(`📊 API Status: ${response.status} | Headers:`, response.headers);
      
      this.isConnected = response.status === 200;
      this.emit('connectionStatusChanged', { 
        connected: this.isConnected, 
        responseTime,
        endpoint: this.apiEndpoint,
        status: response.status,
        data: response.data
      });
      
      console.log(`🎯 API connection status: ${this.isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
      return this.isConnected;
    } catch (error) {
      console.error('❌ API connection failed:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        endpoint: this.apiEndpoint,
        timeout: error.code === 'ECONNABORTED'
      });
      
      this.isConnected = false;
      this.emit('connectionStatusChanged', { 
        connected: false, 
        error: {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          timeout: error.code === 'ECONNABORTED'
        },
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
    this.apiEndpoint = endpoint;
    this.emit('apiEndpointChanged', { endpoint });
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
   * Start a task
   * @param {string} taskId - Task ID
   */
  async startTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== 'pending') {
      throw new Error(`Task cannot be started. Current status: ${task.status}`);
    }

    try {
      this.updateTaskStatus(taskId, 'running', 0);
      this.emit('taskStarted', { task });

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        const currentTask = this.tasks.get(taskId);
        if (currentTask && currentTask.status === 'running') {
          const newProgress = Math.min(95, currentTask.progress + Math.random() * 20);
          this.updateTaskStatus(taskId, 'running', newProgress);
        }
      }, 500);

      const result = await this.executeTask(task);
      
      clearInterval(progressInterval);
      this.updateTaskStatus(taskId, 'completed', 100, result);
      this.emit('taskCompleted', { task, result });
      
      return result;
    } catch (error) {
      this.updateTaskStatus(taskId, 'failed', task.progress, null, error.message);
      this.emit('taskFailed', { task, error });
      throw error;
    }
  }

  /**
   * Execute a task based on its type
   * @param {Object} task - Task object
   */
  async executeTask(task) {
    const { type, prompt, imageFile, options } = task;

    switch (type) {
      case 'text-to-3d':
        return await this.executeTextTo3D(prompt, options);
      case 'image-to-3d':
        return await this.executeImageTo3D(prompt, imageFile, options);
      case 'mesh-painting':
        return await this.executeMeshPainting(prompt, imageFile, options);
      case 'mesh-segmentation':
        return await this.executeMeshSegmentation(options);
      case 'part-completion':
        return await this.executePartCompletion(prompt, options);
      case 'auto-rigging':
        return await this.executeAutoRigging(options);
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }

  /**
   * Execute text-to-3D generation
   */
  async executeTextTo3D(prompt, options) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('options', JSON.stringify(options));

    const response = await axios.post(`${this.apiEndpoint}/generate/text-to-3d`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        this.emit('taskProgress', { progress });
      }
    });

    return response.data;
  }

  /**
   * Execute image-to-3D generation
   */
  async executeImageTo3D(prompt, imageFile, options) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    if (imageFile) {
      formData.append('image', imageFile);
    }
    formData.append('options', JSON.stringify(options));

    const response = await axios.post(`${this.apiEndpoint}/generate/image-to-3d`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        this.emit('taskProgress', { progress });
      }
    });

    return response.data;
  }

  /**
   * Execute mesh painting
   */
  async executeMeshPainting(prompt, imageFile, options) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    if (imageFile) {
      formData.append('image', imageFile);
    }
    formData.append('options', JSON.stringify(options));

    const response = await axios.post(`${this.apiEndpoint}/generate/mesh-painting`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    return response.data;
  }

  /**
   * Execute mesh segmentation
   */
  async executeMeshSegmentation(options) {
    const response = await axios.post(`${this.apiEndpoint}/generate/mesh-segmentation`, {
      options
    });

    return response.data;
  }

  /**
   * Execute part completion
   */
  async executePartCompletion(prompt, options) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('options', JSON.stringify(options));

    const response = await axios.post(`${this.apiEndpoint}/generate/part-completion`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    return response.data;
  }

  /**
   * Execute auto rigging
   */
  async executeAutoRigging(options) {
    const response = await axios.post(`${this.apiEndpoint}/generate/auto-rigging`, {
      options
    });

    return response.data;
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
