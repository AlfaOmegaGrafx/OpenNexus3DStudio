/**
 * VRMExporter - VRM model export for Open3DStudio
 * Based on CharacterStudio's VRM export patterns
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export class VRMExporter {
  constructor() {
    this.gltfExporter = new GLTFExporter();
    this.eventListeners = new Map();
  }

  /**
   * Export model to VRM format
   * @param {Object} model - Three.js model to export
   * @param {Object} options - Export options
   */
  async exportToVRM(model, options = {}) {
    const {
      filename = 'exported_model.vrm',
      vrmVersion = '0.0',
      metadata = {},
      humanoidBones = {},
      expressions = {},
      materials = [],
      screenshot = null,
      optimize = true
    } = options;

    try {
      this.emit('vrmExportStart', { model, options });

      // Clone the model to avoid modifying the original
      const clonedModel = model.clone();
      
      // Prepare model for VRM export
      const preparedModel = await this.prepareModelForVRM(clonedModel, {
        vrmVersion,
        metadata,
        humanoidBones,
        expressions,
        materials,
        optimize
      });

      // Create VRM structure
      const vrmData = this.createVRMData(preparedModel, {
        vrmVersion,
        metadata,
        humanoidBones,
        expressions,
        screenshot
      });

      // Export to GLB with VRM extensions
      const glbData = await this.exportToGLB(preparedModel, vrmData);

      // Create blob and download
      const blob = new Blob([glbData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      this.downloadFile(url, filename);
      
      this.emit('vrmExportComplete', { model, filename, blob });
      
      // Clean up
      URL.revokeObjectURL(url);
      
      return { blob, filename, url };
    } catch (error) {
      console.error('VRM export failed:', error);
      this.emit('vrmExportError', { error, model });
      throw error;
    }
  }

  /**
   * Prepare model for VRM export
   * @param {Object} model - Model to prepare
   * @param {Object} options - Preparation options
   */
  async prepareModelForVRM(model, options = {}) {
    const {
      vrmVersion = '0.0',
      metadata = {},
      humanoidBones = {},
      expressions = {},
      materials = [],
      optimize = true
    } = options;

    // Optimize model
    if (optimize) {
      this.optimizeModelForVRM(model);
    }

    // Setup VRM structure
    this.setupVRMStructure(model, {
      vrmVersion,
      metadata,
      humanoidBones,
      expressions
    });

    // Process materials
    this.processVRMMaterials(model, materials);

    return model;
  }

  /**
   * Optimize model for VRM export
   * @param {Object} model - Model to optimize
   */
  optimizeModelForVRM(model) {
    model.traverse((child) => {
      if (child.isMesh && child.geometry) {
        // Merge vertices
        child.geometry.mergeVertices();
        
        // Compute normals if missing
        if (!child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals();
        }
        
        // Compute bounding box
        child.geometry.computeBoundingBox();
        child.geometry.computeBoundingSphere();
      }
    });
  }

  /**
   * Setup VRM structure
   * @param {Object} model - Model to setup
   * @param {Object} options - Setup options
   */
  setupVRMStructure(model, options = {}) {
    const {
      vrmVersion = '0.0',
      metadata = {},
      humanoidBones = {},
      expressions = {}
    } = options;

    // Add VRM userData
    model.userData.vrm = {
      meta: {
        version: vrmVersion,
        ...metadata
      },
      humanoid: {
        humanBones: humanoidBones
      },
      expressions: {
        preset: expressions.preset || {},
        custom: expressions.custom || {}
      }
    };
  }

  /**
   * Process VRM materials
   * @param {Object} model - Model to process
   * @param {Array} materials - Material definitions
   */
  processVRMMaterials(model, materials = []) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        // Add VRM material properties
        child.material.userData.vrmMaterial = true;
        child.material.userData.vrmProperties = {
          renderQueue: 2000,
          stringTagMap: {},
          floatTagMap: {},
          vectorTagMap: {},
          textureProperties: {}
        };
      }
    });
  }

  /**
   * Create VRM data structure
   * @param {Object} model - Model to create data for
   * @param {Object} options - VRM data options
   */
  createVRMData(model, options = {}) {
    const {
      vrmVersion = '0.0',
      metadata = {},
      humanoidBones = {},
      expressions = {},
      screenshot = null
    } = options;

    return {
      meta: {
        version: vrmVersion,
        title: metadata.title || 'Open3DStudio Export',
        version: metadata.version || '1.0.0',
        author: metadata.author || 'Open3DStudio',
        contactInformation: metadata.contactInformation || '',
        reference: metadata.reference || '',
        texture: metadata.texture || -1,
        allowedUserName: metadata.allowedUserName || 'Everyone',
        violentUssageName: metadata.violentUssageName || 'Disallow',
        sexualUssageName: metadata.sexualUssageName || 'Disallow',
        commercialUssageName: metadata.commercialUssageName || 'Allow',
        otherPermissionUrl: metadata.otherPermissionUrl || '',
        licenseUrl: metadata.licenseUrl || '',
        otherLicenseUrl: metadata.otherLicenseUrl || ''
      },
      humanoid: {
        humanBones: humanoidBones
      },
      firstPerson: {
        firstPersonBone: -1,
        firstPersonBoneOffset: { x: 0, y: 0, z: 0 },
        meshAnnotations: [],
        lookAtTypeName: 'Bone',
        lookAtHorizontalInner: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
        lookAtHorizontalOuter: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
        lookAtVerticalDown: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
        lookAtVerticalUp: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 }
      },
      lookAt: {
        lookAtHorizontalInner: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
        lookAtHorizontalOuter: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
        lookAtVerticalDown: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
        lookAtVerticalUp: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 }
      },
      expressions: {
        preset: expressions.preset || {},
        custom: expressions.custom || {}
      },
      materialProperties: []
    };
  }

  /**
   * Export to GLB with VRM extensions
   * @param {Object} model - Model to export
   * @param {Object} vrmData - VRM data
   */
  async exportToGLB(model, vrmData) {
    // Create scene for export
    const scene = new THREE.Scene();
    scene.add(model);
    
    // Add VRM extensions to scene
    scene.userData.vrm = vrmData;
    
    // Export to GLB
    const glbData = await this.gltfExporter.parseAsync(scene, {
      binary: true,
      includeCustomExtensions: true,
      extensions: {
        VRM: vrmData
      }
    });

    return glbData;
  }

  /**
   * Download file
   * @param {string} url - File URL
   * @param {string} filename - Filename
   */
  downloadFile(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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