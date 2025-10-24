/**
 * Core3D API Service
 * Handles all interactions with the Core3D API
 */

class Core3DService {
  constructor() {
    this.apiKey = null;
    this.baseURL = 'https://api.core3d.io';
    this.isInitialized = false;
    this.eventListeners = new Map();
  }

  /**
   * Initialize the Core3D service with API key
   * @param {string} apiKey - Core3D API key
   */
  initialize(apiKey) {
    this.apiKey = apiKey;
    this.isInitialized = true;
    this.emit('initialized', { apiKey });
    console.log('Core3D Service: Initialized with API key');
  }

  /**
   * Get authentication headers
   * @returns {Object} Headers object
   */
  getHeaders() {
    if (!this.apiKey) {
      throw new Error('Core3D API key not set. Please initialize the service first.');
    }
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Make authenticated API request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise} API response
   */
  async makeRequest(endpoint, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Core3D service not initialized');
    }

    const url = `${this.baseURL}${endpoint}`;
    const headers = this.getHeaders();

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers }
      });

      if (!response.ok) {
        throw new Error(`Core3D API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Core3D API Request failed:', error);
      this.emit('error', { error, endpoint });
      throw error;
    }
  }

  /**
   * Get available models
   * @returns {Promise<Array>} List of available models
   */
  async getModels() {
    try {
      const response = await this.makeRequest('/models');
      this.emit('modelsLoaded', response);
      return response;
    } catch (error) {
      console.error('Failed to load models:', error);
      throw error;
    }
  }

  /**
   * Get model details
   * @param {string} modelId - Model ID
   * @returns {Promise<Object>} Model details
   */
  async getModel(modelId) {
    try {
      const response = await this.makeRequest(`/models/${modelId}`);
      this.emit('modelLoaded', { modelId, model: response });
      return response;
    } catch (error) {
      console.error(`Failed to load model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Get available materials/textures
   * @returns {Promise<Array>} List of available materials
   */
  async getMaterials() {
    try {
      const response = await this.makeRequest('/materials');
      this.emit('materialsLoaded', response);
      return response;
    } catch (error) {
      console.error('Failed to load materials:', error);
      throw error;
    }
  }

  /**
   * Get material details
   * @param {string} materialId - Material ID
   * @returns {Promise<Object>} Material details
   */
  async getMaterial(materialId) {
    try {
      const response = await this.makeRequest(`/materials/${materialId}`);
      this.emit('materialLoaded', { materialId, material: response });
      return response;
    } catch (error) {
      console.error(`Failed to load material ${materialId}:`, error);
      throw error;
    }
  }

  /**
   * Generate a design by combining model and material
   * @param {string} modelId - Model ID
   * @param {string} materialId - Material ID
   * @param {Object} options - Design options
   * @returns {Promise<Object>} Generated design
   */
  async generateDesign(modelId, materialId, options = {}) {
    try {
      const payload = {
        model_id: modelId,
        material_id: materialId,
        ...options
      };

      const response = await this.makeRequest('/designs', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      this.emit('designGenerated', { modelId, materialId, design: response });
      return response;
    } catch (error) {
      console.error('Failed to generate design:', error);
      throw error;
    }
  }

  /**
   * Get design details
   * @param {string} designId - Design ID
   * @returns {Promise<Object>} Design details
   */
  async getDesign(designId) {
    try {
      const response = await this.makeRequest(`/designs/${designId}`);
      this.emit('designLoaded', { designId, design: response });
      return response;
    } catch (error) {
      console.error(`Failed to load design ${designId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's designs
   * @returns {Promise<Array>} List of user's designs
   */
  async getUserDesigns() {
    try {
      const response = await this.makeRequest('/user/designs');
      this.emit('userDesignsLoaded', response);
      return response;
    } catch (error) {
      console.error('Failed to load user designs:', error);
      throw error;
    }
  }

  /**
   * Upload custom model
   * @param {File} modelFile - Model file
   * @param {Object} metadata - Model metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadModel(modelFile, metadata = {}) {
    try {
      const formData = new FormData();
      formData.append('model', modelFile);
      formData.append('metadata', JSON.stringify(metadata));

      const response = await fetch(`${this.baseURL}/models/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      this.emit('modelUploaded', { model: result });
      return result;
    } catch (error) {
      console.error('Failed to upload model:', error);
      throw error;
    }
  }

  /**
   * Upload custom material
   * @param {File} materialFile - Material file
   * @param {Object} metadata - Material metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadMaterial(materialFile, metadata = {}) {
    try {
      const formData = new FormData();
      formData.append('material', materialFile);
      formData.append('metadata', JSON.stringify(metadata));

      const response = await fetch(`${this.baseURL}/materials/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      this.emit('materialUploaded', { material: result });
      return result;
    } catch (error) {
      console.error('Failed to upload material:', error);
      throw error;
    }
  }

  /**
   * Export design as GLB
   * @param {string} designId - Design ID
   * @param {Object} options - Export options
   * @returns {Promise<Blob>} GLB file blob
   */
  async exportDesign(designId, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}/designs/${designId}/export`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(options)
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      this.emit('designExported', { designId, blob });
      return blob;
    } catch (error) {
      console.error('Failed to export design:', error);
      throw error;
    }
  }

  /**
   * Get API status
   * @returns {Promise<Object>} API status
   */
  async getStatus() {
    try {
      const response = await this.makeRequest('/status');
      return response;
    } catch (error) {
      console.error('Failed to get API status:', error);
      throw error;
    }
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
}

// Create singleton instance
const core3dService = new Core3DService();

export default core3dService;
