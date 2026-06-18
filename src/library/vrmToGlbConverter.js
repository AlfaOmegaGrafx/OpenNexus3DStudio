import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * VRM to GLB Converter
 * Converts VRM models to GLB format for better compatibility and cloning
 */
export class VRMToGLBConverter {
  constructor() {
    this.exporter = new GLTFExporter();
    this.conversionCache = new Map(); // Cache converted models
  }

  /**
   * Convert VRM model to GLB format
   * @param {Object} vrmModel - The VRM model object
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} - GLB model data
   */
  async convertVRMToGLB(vrmModel, options = {}) {
    try {
      // Check cache first
      const cacheKey = this.getModelCacheKey(vrmModel);
      if (this.conversionCache.has(cacheKey)) {
        console.log('🔄 Using cached GLB conversion');
        return this.conversionCache.get(cacheKey);
      }

      console.log('🔄 Converting VRM to GLB format...');
      
      // Extract the scene from VRM model
      const scene = vrmModel.scene || vrmModel;
      
      // Create a clean copy of the scene for conversion
      const cleanScene = this.createCleanSceneCopy(scene);
      
      // Export options
      const exportOptions = {
        binary: true, // Export as GLB (binary)
        includeCustomExtensions: false, // Remove VRM-specific extensions
        animations: [], // We'll handle animations separately if needed
        ...options
      };

      // Convert to GLB
      const glbData = await new Promise((resolve, reject) => {
        this.exporter.parse(cleanScene, (result) => {
          resolve(result);
        }, (error) => {
          reject(error);
        }, exportOptions);
      });

      console.log('✅ VRM to GLB conversion completed');
      
      // Cache the result
      this.conversionCache.set(cacheKey, glbData);
      
      return glbData;
      
    } catch (error) {
      console.error('❌ VRM to GLB conversion failed:', error);
      throw error;
    }
  }

  /**
   * Create a clean scene copy without VRM-specific metadata
   * @param {Object} originalScene - Original VRM scene
   * @returns {Object} - Clean scene copy
   */
  createCleanSceneCopy(originalScene) {
    // Create a new scene
    const cleanScene = originalScene.clone();
    
    // Remove VRM-specific metadata
    this.removeVRMMetadata(cleanScene);
    
    // Clean up materials
    this.cleanMaterials(cleanScene);
    
    return cleanScene;
  }

  /**
   * Remove VRM-specific metadata from scene
   * @param {Object} scene - Scene to clean
   */
  removeVRMMetadata(scene) {
    scene.traverse((child) => {
      // Remove VRM-specific userData
      if (child.userData) {
        delete child.userData.vrm;
        delete child.userData.vrmHumanoid;
        delete child.userData.vrmBlendShapeMaster;
        delete child.userData.vrmSecondaryAnimation;
        delete child.userData.vrmFirstPerson;
        delete child.userData.vrmLookAt;
        delete child.userData.vrmExpression;
      }
      
      // Remove VRM-specific properties
      if (child.vrm) {
        delete child.vrm;
      }
    });
  }

  /**
   * Clean materials for GLB compatibility
   * @param {Object} scene - Scene to clean
   */
  cleanMaterials(scene) {
    scene.traverse((child) => {
      if (child.material) {
        // Ensure materials are GLB-compatible
        if (child.material.map) {
          child.material.map.flipY = false; // GLB standard
        }
        
        // Remove VRM-specific material properties
        if (child.material.userData) {
          delete child.material.userData.vrm;
        }
      }
    });
  }

  /**
   * Generate cache key for model
   * @param {Object} model - Model object
   * @returns {string} - Cache key
   */
  getModelCacheKey(model) {
    // Use model's UUID or name as cache key
    return model.uuid || model.name || 'unknown';
  }

  /**
   * Load GLB data as Three.js object
   * @param {Object} glbData - GLB data from conversion
   * @param {Object} loader - GLTFLoader instance
   * @returns {Promise<Object>} - Loaded GLB model
   */
  async loadGLBData(glbData, loader) {
    try {
      // Convert GLB data to blob
      const blob = new Blob([glbData], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      
      // Load the GLB
      const gltf = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      
      // Clean up URL
      URL.revokeObjectURL(url);
      
      return gltf;
      
    } catch (error) {
      console.error('❌ Failed to load GLB data:', error);
      throw error;
    }
  }

  /**
   * Clear conversion cache
   */
  clearCache() {
    this.conversionCache.clear();
    console.log('🗑️ VRM to GLB conversion cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getCacheStats() {
    return {
      size: this.conversionCache.size,
      keys: Array.from(this.conversionCache.keys())
    };
  }
}

export default VRMToGLBConverter;
