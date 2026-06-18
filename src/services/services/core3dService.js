/**
 * Core3D API Service
 * Handles all interactions with the Core3D API
 * 
 * API Specification: https://api.core3d.io/v1/openapi.json
 * Documentation: https://www.core3d.io/docs/api/reference
 * 
 * Base URL: https://api.core3d.io/v1
 * Authentication: Bearer token (HTTP Bearer Auth)
 * 
 * Pagination: Uses cursor-based pagination via Link headers
 * Rate Limits: 4500 tokens/hour, check RateLimit-Remaining header
 */

class Core3DService {
  constructor() {
    this.apiKey = null;
    this.baseURL = 'https://api.core3d.io/v1';
    this.isInitialized = false;
    this.eventListeners = new Map();
    
    // Set up fetch interceptor for browser requests
    this.setupFetchInterceptor();
  }
  
  /**
   * Intercept fetch requests to Core3D API and add authentication
   */
  setupFetchInterceptor() {
    // Store original fetch
    const originalFetch = window.fetch;
    
    // Override fetch to intercept Core3D API requests
    window.fetch = async (url, options = {}) => {
      // Check if this is a Core3D API request
      const urlString = typeof url === 'string' ? url : url.toString();
      if (urlString.includes('api.core3d.io') && this.apiKey) {
        // Clone options to avoid mutating original
        const modifiedOptions = { ...options };
        
        // Ensure headers object exists
        if (!modifiedOptions.headers) {
          modifiedOptions.headers = {};
        }
        
        // Convert Headers object to plain object if needed
        let headers = {};
        if (modifiedOptions.headers instanceof Headers) {
          modifiedOptions.headers.forEach((value, key) => {
            headers[key] = value;
          });
        } else {
          headers = { ...modifiedOptions.headers };
        }
        
        // Add Authorization header if not already present
        if (!headers['Authorization'] && !headers['authorization']) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        
        // Add Content-Type if not present
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
        
        modifiedOptions.headers = headers;
        
        console.log('🔐 Core3D Service: Intercepted browser request and added auth header');
        
        return originalFetch(url, modifiedOptions);
      }
      
      // For non-Core3D requests, use original fetch
      return originalFetch(url, options);
    };
  }

  /**
   * Initialize the Core3D service with API key
   * @param {string} apiKey - Core3D API key
   */
  initialize(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('API key cannot be empty');
    }
    
    const trimmedKey = apiKey.trim();
    this.apiKey = trimmedKey;
    this.isInitialized = true;
    this.emit('initialized', { apiKey: trimmedKey });
    console.log('✅ Core3D Service: Initialized with API key:', trimmedKey.substring(0, 4) + '...' + trimmedKey.substring(trimmedKey.length - 4));
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
      console.log(`🔗 Core3D API Request: ${url}`);
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers }
      });

      console.log(`📡 Core3D API Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        // Handle 404s - throw error for POST/PUT/DELETE, return null for GET
        if (response.status === 404) {
          const method = options.method || 'GET';
          if (method !== 'GET') {
            const errorMessage = `Core3D API endpoint not found: ${endpoint} (404)`;
            console.error(errorMessage);
            const error = new Error(errorMessage);
            error.status = response.status;
            throw error;
          }
          console.warn(`Core3D API endpoint not found: ${endpoint} (404) - This endpoint may not be available`);
          return null;
        }
        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
          const errorMessage = `Core3D API Authentication Error: ${response.status} ${response.statusText}. Please check your API key.`;
          const error = new Error(errorMessage);
          error.status = response.status;
          throw error;
        }
        // Handle validation errors (422) - try to get error details
        if (response.status === 422) {
          let errorDetails = '';
          let errorData = null;
          try {
            errorData = await response.json();
            console.error('Core3D API Validation Error Details (Full):', errorData);
            console.error('Core3D API Validation Error (Stringified):', JSON.stringify(errorData, null, 2));
            // Try to extract more detailed error information
            if (errorData.errors) {
              errorDetails = JSON.stringify(errorData.errors, null, 2);
            } else if (errorData.message) {
              errorDetails = errorData.message;
            } else if (errorData.error) {
              errorDetails = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
            } else if (errorData.detail) {
              errorDetails = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
            } else {
              errorDetails = JSON.stringify(errorData, null, 2);
            }
          } catch (e) {
            console.error('Failed to parse error response:', e);
            errorDetails = response.statusText;
          }
          const errorMessage = `Core3D API Validation Error: ${errorDetails}`;
          const error = new Error(errorMessage);
          error.status = response.status;
          error.details = errorDetails;
          error.data = errorData;
          throw error;
        }
        const errorMessage = `Core3D API Error: ${response.status} ${response.statusText}`;
        const error = new Error(errorMessage);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      
      // Extract pagination info from headers (per OpenAPI spec)
      const linkHeader = response.headers.get('Link');
      const totalCount = response.headers.get('X-Total-Count');
      const rateLimitRemaining = response.headers.get('RateLimit-Remaining');
      const requestId = response.headers.get('Request-Id');
      
      if (linkHeader) {
        console.log(`📄 Pagination Links: ${linkHeader}`);
      }
      if (totalCount) {
        console.log(`📊 Total Count: ${totalCount}`);
      }
      if (rateLimitRemaining) {
        console.log(`⏱️ Rate Limit Remaining: ${rateLimitRemaining}`);
      }
      if (requestId) {
        console.log(`🆔 Request ID: ${requestId}`);
      }
      
      console.log(`✅ Core3D API Success: Received data from ${endpoint}`, data);
      return data;
    } catch (error) {
      // Only emit error for non-404 errors
      if (error.status !== 404 && !error.message.includes('404')) {
        console.error('Core3D API Request failed:', error);
        this.emit('error', { error, endpoint });
        throw error;
      } else {
        // For 404s, just log a warning, don't emit error event, and return null
        console.warn(`Core3D API endpoint not found: ${endpoint}`);
        return null;
      }
    }
  }

  /**
   * Get available models
   * Based on OpenAPI spec: GET /v1/models (modelList operation)
   * @param {Object} options - Query options per OpenAPI spec
   * @param {string} options.cursor - Pagination cursor from Links header
   * @param {number} options.limit - Number of resources to return (min 1, max 10)
   * @param {string} options.sort - Sort by created_at or -created_at
   * @param {Object} options.filter - Filter options (deepObject style)
   * @returns {Promise<Array>} List of ModelResource objects
   */
  async getModels(options = {}) {
    try {
      // Build query string per OpenAPI spec
      const queryParams = new URLSearchParams();
      if (options.cursor) {
        queryParams.append('cursor', options.cursor);
      }
      if (options.limit !== undefined) {
        // Clamp limit between 1 and 10 per OpenAPI spec
        const limit = Math.max(1, Math.min(10, parseInt(options.limit) || 10));
        queryParams.append('limit', limit.toString());
      }
      if (options.sort) {
        queryParams.append('sort', options.sort);
      }
      // Filter uses deepObject style - handle nested properties
      if (options.filter) {
        Object.keys(options.filter).forEach(key => {
          queryParams.append(`filter[${key}]`, options.filter[key]);
        });
      }
      
      const queryString = queryParams.toString();
      const endpoint = `/models${queryString ? `?${queryString}` : ''}`;
      
      const response = await this.makeRequest(endpoint);
      
      // Per OpenAPI spec: Returns array of ModelResource objects
      let modelsArray = null;
      if (response && Array.isArray(response)) {
        modelsArray = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        modelsArray = response.data;
      } else if (response && response.models && Array.isArray(response.models)) {
        modelsArray = response.models;
      }
      
      if (modelsArray) {
        // Ensure each model has required properties for UI display
        const normalizedModels = modelsArray.map(model => ({
          id: model.id || model.uri || model._id,
          uri: model.uri || model.id,
          name: model.name || model.title || 'Unnamed Model',
          description: model.description || '',
          category: model.category || 'uncategorized',
          thumbnail: model.thumbnail || model.images?.default?.fullsize?.url || model.preview_url,
          polygons: model.polygons || model.polygon_count,
          ...model // Keep all original properties
        }));
        
        console.log('📦 Normalized models:', normalizedModels.length, 'models');
        this.emit('modelsLoaded', normalizedModels);
        return normalizedModels;
      }
      
      // If response is not an array, return empty array
      console.warn('Unexpected response format from /models endpoint:', response);
      return [];
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
   * Based on OpenAPI spec: GET /v1/materials (materialList operation)
   * @param {Object} options - Query options per OpenAPI spec
   * @param {string} options.cursor - Pagination cursor from Links header
   * @param {number} options.limit - Number of resources to return (min 1, max 10)
   * @param {string} options.sort - Sort by created_at or -created_at
   * @param {Object} options.filter - Filter options (deepObject style)
   * @returns {Promise<Array>} List of MaterialResource objects
   */
  async getMaterials(options = {}) {
    try {
      // Build query string per OpenAPI spec
      const queryParams = new URLSearchParams();
      if (options.cursor) {
        queryParams.append('cursor', options.cursor);
      }
      if (options.limit !== undefined) {
        // Clamp limit between 1 and 10 per OpenAPI spec
        const limit = Math.max(1, Math.min(10, parseInt(options.limit) || 10));
        queryParams.append('limit', limit.toString());
      }
      if (options.sort) {
        queryParams.append('sort', options.sort);
      }
      // Filter uses deepObject style - handle nested properties
      if (options.filter) {
        Object.keys(options.filter).forEach(key => {
          queryParams.append(`filter[${key}]`, options.filter[key]);
        });
      }
      
      const queryString = queryParams.toString();
      const endpoint = `/materials${queryString ? `?${queryString}` : ''}`;
      
      const response = await this.makeRequest(endpoint);
      
      // Per OpenAPI spec: Returns array of MaterialResource objects
      let materialsArray = null;
      if (response && Array.isArray(response)) {
        materialsArray = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        materialsArray = response.data;
      } else if (response && response.materials && Array.isArray(response.materials)) {
        materialsArray = response.materials;
      }
      
      if (materialsArray) {
        // Ensure each material has required properties for UI display
        const normalizedMaterials = materialsArray.map(material => ({
          id: material.id || material.uri || material._id,
          uri: material.uri || material.id,
          name: material.name || material.title || 'Unnamed Material',
          description: material.description || '',
          type: material.type || material.category || 'texture',
          thumbnail: material.thumbnail || material.images?.default?.fullsize?.url || material.preview_url,
          resolution: material.resolution || material.texture_resolution || '2K',
          ...material // Keep all original properties
        }));
        
        console.log('🎨 Normalized materials:', normalizedMaterials.length, 'materials');
        this.emit('materialsLoaded', normalizedMaterials);
        return normalizedMaterials;
      }
      
      // If response is not an array, return empty array
      console.warn('Unexpected response format from /materials endpoint:', response);
      return [];
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
   * Get generation status
   * @param {string} generationId - Generation ID or URI
   * @returns {Promise<Object>} Generation status
   */
  async getGenerationStatus(generationId) {
    try {
      // Handle both URI format (core3d:generation:...) and plain ID
      // The API accepts URIs directly in the path
      const generationUri = generationId.startsWith('core3d:') 
        ? generationId 
        : generationId; // Use ID as-is, API may accept it directly
      
      const response = await this.makeRequest(`/generations/${encodeURIComponent(generationUri)}`);
      return response;
    } catch (error) {
      console.error(`Failed to get generation status for ${generationId}:`, error);
      throw error;
    }
  }

  /**
   * Poll generation status until complete
   * @param {string} generationId - Generation ID or URI
   * @param {Function} onProgress - Progress callback (status, progress)
   * @param {number} pollInterval - Polling interval in ms (default: 2000)
   * @param {number} maxAttempts - Maximum polling attempts (default: 60)
   * @returns {Promise<Object>} Completed generation
   */
  async pollGenerationStatus(generationId, onProgress, pollInterval = 2000, maxAttempts = 60) {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const generation = await this.getGenerationStatus(generationId);
      
      if (onProgress) {
        onProgress(generation.status, attempts / maxAttempts * 100);
      }
      
      if (generation.status === 'ok') {
        return generation;
      }
      
      if (generation.status === 'error' || generation.status === 'failed') {
        throw new Error(`Generation failed with status: ${generation.status}`);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;
    }
    
    throw new Error('Generation timeout: maximum polling attempts reached');
  }

  /**
   * Generate a design by combining model and material
   * Based on Core3D API documentation: https://www.core3d.io/docs/api/guides/generate-a-design
   * @param {string} modelId - Model ID (ModelIdentity format)
   * @param {string} materialId - Material ID (MaterialIdentity format) 
   * @param {Object} options - Design options
   * @param {string} options.team - Team context (optional)
   * @param {Function} options.onProgress - Progress callback (status, progress)
   * @returns {Promise<Object>} Generation result
   */
  async generateDesign(modelId, materialId, options = {}) {
    try {
      // Validate required parameters
      if (!modelId) {
        throw new Error('Model ID is required');
      }
      if (!materialId) {
        throw new Error('Material ID is required');
      }

      // Only include valid API fields
      const validOptions = {};
      if (options.team) {
        validOptions.team = options.team;
      }
      
      // Extract ID if modelId/materialId are objects, otherwise use as-is
      const modelIdValue = typeof modelId === 'object' && modelId.id 
        ? modelId.id 
        : modelId;
      
      const materialIdValue = typeof materialId === 'object' && materialId.id 
        ? materialId.id 
        : materialId;
      
      // Check if IDs are already in URI format, otherwise construct URIs
      // Model IDs from API might already be in format like "core3d:model:..." or just the UUID
      let modelUri = modelIdValue;
      if (!modelIdValue.startsWith('core3d:')) {
        // If it's just a UUID, prefix with core3d:model:
        modelUri = `core3d:model:${modelIdValue}`;
      }
      
      // Material/upload IDs - check if it's already a URI or needs prefix
      let materialUri = materialIdValue;
      if (!materialIdValue.startsWith('core3d:')) {
        // Try core3d:upload: first (for uploaded images/patterns)
        materialUri = `core3d:upload:${materialIdValue}`;
      }

      // Based on Core3D API documentation example:
      // { "type": "design", "data": { "model": "...", "upload": "...", "type": "pattern" } }
      const payload = {
        type: 'design',
        data: {
          model: modelUri,
          upload: materialUri,
          type: 'pattern', // Required inside data object per API schema
          ...validOptions
        }
      };

      console.log('📤 Core3D API Request Payload:', JSON.stringify(payload, null, 2));

      // Create generation (POST /v1/generations)
      // Note: baseURL is https://api.core3d.io/v1, so endpoint is just /generations
      const generation = await this.makeRequest('/generations', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // Handle 404 or null response
      if (!generation) {
        throw new Error('Failed to create generation: endpoint returned 404 or null response');
      }

      console.log('✅ Generation created:', generation);

      // If onProgress callback provided, poll for status
      if (options.onProgress && (generation.uri || generation.id)) {
        try {
          const generationId = generation.uri || generation.id;
          const completedGeneration = await this.pollGenerationStatus(
            generationId,
            options.onProgress
          );

          // Extract design URI from result if available
          if (completedGeneration.result && completedGeneration.result.designs && completedGeneration.result.designs.length > 0) {
            const designUri = completedGeneration.result.designs[0].uri;
            const design = await this.makeRequest(`/designs/${designUri}`);
            this.emit('designGenerated', { modelId, materialId, design, generation: completedGeneration });
            return design;
          }
        } catch (pollError) {
          console.warn('Polling failed, returning generation result:', pollError);
        }
      }

      this.emit('designGenerated', { modelId, materialId, design: generation });
      return generation;
    } catch (error) {
      console.error('Failed to generate design:', error);
      if (error.details) {
        console.error('Error details:', error.details);
      }
      if (error.data) {
        console.error('Full error data:', error.data);
      }
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
   * Based on OpenAPI spec: GET /v1/designs (teamDesignList or userDesignList operations)
   * @param {Object} options - Query options per OpenAPI spec
   * @param {string} options.cursor - Pagination cursor from Links header
   * @param {number} options.limit - Number of resources to return (min 1, max 10)
   * @param {string} options.sort - Sort by created_at or -created_at
   * @param {string} options.team - Team context (optional, for teamDesignList)
   * @returns {Promise<Array>} List of DesignResource objects
   */
  async getUserDesigns(options = {}) {
    try {
      // Build query string per OpenAPI spec
      const queryParams = new URLSearchParams();
      if (options.cursor) {
        queryParams.append('cursor', options.cursor);
      }
      if (options.limit !== undefined) {
        // Clamp limit between 1 and 10 per OpenAPI spec
        const limit = Math.max(1, Math.min(10, parseInt(options.limit) || 10));
        queryParams.append('limit', limit.toString());
      }
      if (options.sort) {
        queryParams.append('sort', options.sort);
      }
      if (options.team) {
        queryParams.append('team', options.team);
      }
      
      const queryString = queryParams.toString();
      const endpoint = `/designs${queryString ? `?${queryString}` : ''}`;
      
      const response = await this.makeRequest(endpoint);
      
      // Per OpenAPI spec: Returns array of DesignResource objects
      if (response && Array.isArray(response)) {
        this.emit('userDesignsLoaded', response);
        return response;
      } else if (response && response.data && Array.isArray(response.data)) {
        this.emit('userDesignsLoaded', response.data);
        return response.data;
      }
      
      return response || [];
    } catch (error) {
      console.error('Failed to load user designs:', error);
      throw error;
    }
  }

  /**
   * Upload custom model
   * @param {File} modelFile - Model file
   * @param {Object} metadata - Model metadata
   * @param {string} metadata.team - Team context (optional)
   * @returns {Promise<Object>} Upload result (UploadResource)
   */
  async uploadModel(modelFile, metadata = {}) {
    try {
      const formData = new FormData();
      formData.append('file', modelFile);
      if (metadata.team) {
        formData.append('team', metadata.team);
      }
      // Add other metadata fields as needed

      const response = await fetch(`${this.baseURL}/uploads`, {
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
   * @param {string} metadata.team - Team context (optional)
   * @returns {Promise<Object>} Upload result (UploadResource)
   */
  async uploadMaterial(materialFile, metadata = {}) {
    try {
      const formData = new FormData();
      formData.append('file', materialFile);
      if (metadata.team) {
        formData.append('team', metadata.team);
      }
      // Add other metadata fields as needed

      const response = await fetch(`${this.baseURL}/uploads`, {
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
   * Export design
   * @param {string} designId - Design ID (DesignIdentity format)
   * @param {Object} options - Export options
   * @param {string} options.format - Export format (e.g., 'glb', 'usdz')
   * @param {Object} options.preset - Preset export data (optional)
   * @param {Object} options.bake - Bake export data (optional)
   * @returns {Promise<Object>} Export result (ExportResource)
   */
  async exportDesign(designId, options = {}) {
    try {
      const payload = {
        design: designId,
        ...options
      };

      const response = await this.makeRequest('/exports', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      this.emit('designExported', { designId, export: response });
      return response;
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
   * Create a new token
   * @param {Object} tokenData - Token creation data
   * @param {string} tokenData.name - Token name (optional)
   * @param {string} tokenData.description - Token description (optional)
   * @param {Array<string>} tokenData.origins - Allowed origins for CORS (optional)
   * @returns {Promise<Object>} Created token information
   */
  async createToken(tokenData = {}) {
    try {
      const payload = {
        ...tokenData
      };

      const response = await this.makeRequest('/operations/tokenCreate', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      this.emit('tokenCreated', { token: response });
      return response;
    } catch (error) {
      console.error('Failed to create token:', error);
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
