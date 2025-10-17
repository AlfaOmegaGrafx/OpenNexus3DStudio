/**
 * AssetManager - Handles file operations and asset management
 * Similar to the asset management in CharacterStudio
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export class AssetManager {
  constructor() {
    this.supportedFormats = {
      '3d': ['glb', 'gltf', 'obj', 'fbx', 'dae', 'stl'],
      'image': ['jpg', 'jpeg', 'png', 'bmp', 'tga', 'webp'],
      'audio': ['mp3', 'wav', 'ogg'],
      'video': ['mp4', 'webm', 'mov']
    };
    
    this.loaders = {
      gltf: new GLTFLoader(),
      obj: new OBJLoader(),
      fbx: new FBXLoader()
    };
    
    this.eventListeners = new Map();
  }

  /**
   * Validate file format
   * @param {File} file - File object
   * @param {string} category - File category (3d, image, audio, video)
   */
  validateFile(file, category) {
    const extension = this.getFileExtension(file.name);
    const supportedExtensions = this.supportedFormats[category] || [];
    
    if (!supportedExtensions.includes(extension)) {
      throw new Error(`Unsupported file format: ${extension}. Supported formats: ${supportedExtensions.join(', ')}`);
    }
    
    return true;
  }

  /**
   * Get file extension
   * @param {string} filename - File name
   */
  getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
  }

  /**
   * Get file category based on extension
   * @param {string} filename - File name
   */
  getFileCategory(filename) {
    const extension = this.getFileExtension(filename);
    
    for (const [category, extensions] of Object.entries(this.supportedFormats)) {
      if (extensions.includes(extension)) {
        return category;
      }
    }
    
    return 'unknown';
  }

  /**
   * Load 3D model from file
   * @param {File} file - 3D model file
   * @param {Object} options - Loading options
   */
  async loadModel(file, options = {}) {
    try {
      this.validateFile(file, '3d');
      this.emit('modelLoadingStart', { file, options });

      const extension = this.getFileExtension(file.name);
      const url = URL.createObjectURL(file);
      
      let model;
      switch (extension) {
        case 'glb':
        case 'gltf':
          model = await this.loadGLTF(url, options);
          break;
        case 'obj':
          model = await this.loadOBJ(url, options);
          break;
        case 'fbx':
          model = await this.loadFBX(url, options);
          break;
        default:
          throw new Error(`Unsupported 3D format: ${extension}`);
      }

      // Process model
      const processedModel = this.processModel(model, options);
      
      // Clean up object URL
      URL.revokeObjectURL(url);
      
      this.emit('modelLoaded', { model: processedModel, file });
      return processedModel;
    } catch (error) {
      this.emit('modelLoadError', { error, file });
      throw error;
    }
  }

  /**
   * Load GLTF/GLB model
   * @param {string} url - Model URL
   * @param {Object} options - Loading options
   */
  async loadGLTF(url, options) {
    return new Promise((resolve, reject) => {
      this.loaders.gltf.load(
        url,
        (gltf) => {
          this.emit('modelLoadingProgress', { progress: 100 });
          resolve(gltf.scene);
        },
        (progress) => {
          const percentComplete = (progress.loaded / progress.total) * 100;
          this.emit('modelLoadingProgress', { progress: percentComplete });
        },
        (error) => reject(error)
      );
    });
  }

  /**
   * Load OBJ model
   * @param {string} url - Model URL
   * @param {Object} options - Loading options
   */
  async loadOBJ(url, options) {
    return new Promise((resolve, reject) => {
      this.loaders.obj.load(
        url,
        (obj) => {
          this.emit('modelLoadingProgress', { progress: 100 });
          resolve(obj);
        },
        (progress) => {
          const percentComplete = (progress.loaded / progress.total) * 100;
          this.emit('modelLoadingProgress', { progress: percentComplete });
        },
        (error) => reject(error)
      );
    });
  }

  /**
   * Load FBX model
   * @param {string} url - Model URL
   * @param {Object} options - Loading options
   */
  async loadFBX(url, options) {
    return new Promise((resolve, reject) => {
      this.loaders.fbx.load(
        url,
        (fbx) => {
          this.emit('modelLoadingProgress', { progress: 100 });
          resolve(fbx);
        },
        (progress) => {
          const percentComplete = (progress.loaded / progress.total) * 100;
          this.emit('modelLoadingProgress', { progress: percentComplete });
        },
        (error) => reject(error)
      );
    });
  }

  /**
   * Process loaded model
   * @param {Object} model - Three.js model
   * @param {Object} options - Processing options
   */
  processModel(model, options = {}) {
    const {
      autoCenter = true,
      autoScale = true,
      scale = 1,
      normalize = true
    } = options;

    if (normalize) {
      // Center and scale the model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetScale = autoScale ? (2 / maxDim) * scale : scale;
      
      model.scale.setScalar(targetScale);
      if (autoCenter) {
        model.position.sub(center.multiplyScalar(targetScale));
      }
    }

    return model;
  }

  /**
   * Load image from file
   * @param {File} file - Image file
   * @param {Object} options - Loading options
   */
  async loadImage(file, options = {}) {
    try {
      this.validateFile(file, 'image');
      this.emit('imageLoadingStart', { file, options });

      const url = URL.createObjectURL(file);
      const img = new Image();
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          URL.revokeObjectURL(url);
          this.emit('imageLoaded', { image: img, file });
          resolve(img);
        };
        
        img.onerror = (error) => {
          URL.revokeObjectURL(url);
          this.emit('imageLoadError', { error, file });
          reject(error);
        };
        
        img.src = url;
      });
    } catch (error) {
      this.emit('imageLoadError', { error, file });
      throw error;
    }
  }

  /**
   * Create texture from image
   * @param {HTMLImageElement} image - Image element
   * @param {Object} options - Texture options
   */
  createTexture(image, options = {}) {
    const {
      wrapS = THREE.RepeatWrapping,
      wrapT = THREE.RepeatWrapping,
      minFilter = THREE.LinearFilter,
      magFilter = THREE.LinearFilter,
      generateMipmaps = true
    } = options;

    const texture = new THREE.Texture(image);
    texture.wrapS = wrapS;
    texture.wrapT = wrapT;
    texture.minFilter = minFilter;
    texture.magFilter = magFilter;
    texture.generateMipmaps = generateMipmaps;
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Export model to different formats
   * @param {Object} model - Three.js model
   * @param {string} format - Export format
   * @param {Object} options - Export options
   */
  async exportModel(model, format = 'glb', options = {}) {
    try {
      this.emit('modelExportStart', { model, format, options });

      // This is a placeholder for actual export functionality
      // In a real implementation, you would use appropriate exporters
      const result = {
        format,
        data: null, // Would contain the exported data
        url: null   // Would contain the download URL
      };

      this.emit('modelExported', { model, format, result });
      return result;
    } catch (error) {
      this.emit('modelExportError', { error, model, format });
      throw error;
    }
  }

  /**
   * Generate thumbnail from model
   * @param {Object} model - Three.js model
   * @param {Object} options - Thumbnail options
   */
  async generateThumbnail(model, options = {}) {
    const {
      width = 256,
      height = 256,
      format = 'image/png',
      quality = 0.9
    } = options;

    try {
      this.emit('thumbnailGenerationStart', { model, options });

      // This is a placeholder for actual thumbnail generation
      // In a real implementation, you would render the model to a canvas
      const thumbnail = {
        width,
        height,
        format,
        data: null, // Would contain the thumbnail data
        url: null   // Would contain the thumbnail URL
      };

      this.emit('thumbnailGenerated', { model, thumbnail });
      return thumbnail;
    } catch (error) {
      this.emit('thumbnailGenerationError', { error, model });
      throw error;
    }
  }

  /**
   * Get supported formats for a category
   * @param {string} category - File category
   */
  getSupportedFormats(category) {
    return this.supportedFormats[category] || [];
  }

  /**
   * Get all supported formats
   */
  getAllSupportedFormats() {
    return this.supportedFormats;
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

  /**
   * Cleanup
   */
  dispose() {
    this.eventListeners.clear();
  }
}




