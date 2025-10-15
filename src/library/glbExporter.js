/**
 * GLBExporter - Exports 3D models to GLB format compatible with CharacterStudio
 * Handles model optimization and VRM compatibility preparation
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export class GLBExporter {
  constructor() {
    this.exporter = new GLTFExporter();
    this.eventListeners = new Map();
  }

  /**
   * Export model to GLB format
   * @param {Object} model - Three.js model to export
   * @param {Object} options - Export options
   */
  async exportToGLB(model, options = {}) {
    const {
      filename = 'exported_model.glb',
      optimize = true,
      includeTextures = true,
      includeAnimations = true,
      metadata = {},
      vrmCompatible = true
    } = options;

    try {
      this.emit('exportStart', { model, options });

      // Clone the model to avoid modifying the original
      const clonedModel = model.clone();
      
      // Prepare model for export
      const preparedModel = await this.prepareModelForExport(clonedModel, {
        optimize,
        includeTextures,
        includeAnimations,
        vrmCompatible
      });

      // Create scene for export
      const exportScene = new THREE.Scene();
      exportScene.add(preparedModel);

      // Add metadata
      if (Object.keys(metadata).length > 0) {
        exportScene.userData = metadata;
      }

      // Export to GLB
      const glbData = await this.exporter.parseAsync(exportScene, {
        binary: true,
        includeCustomExtensions: vrmCompatible,
        animations: includeAnimations ? this.extractAnimations(model) : []
      });

      // Create blob and download
      const blob = new Blob([glbData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      this.downloadFile(url, filename);
      
      this.emit('exportComplete', { model, filename, blob });
      
      // Clean up
      URL.revokeObjectURL(url);
      
      return { blob, filename, url };
    } catch (error) {
      console.error('GLB export failed:', error);
      this.emit('exportError', { error, model });
      throw error;
    }
  }

  /**
   * Prepare model for export with optimizations
   * @param {Object} model - Model to prepare
   * @param {Object} options - Preparation options
   */
  async prepareModelForExport(model, options = {}) {
    const {
      optimize = true,
      includeTextures = true,
      includeAnimations = true,
      vrmCompatible = true
    } = options;

    // Optimize geometry
    if (optimize) {
      this.optimizeGeometry(model);
    }

    // Prepare materials
    if (includeTextures) {
      await this.prepareMaterials(model);
    }

    // Prepare for VRM compatibility
    if (vrmCompatible) {
      this.prepareForVRM(model);
    }

    // Clean up and optimize
    this.cleanupModel(model);

    return model;
  }

  /**
   * Optimize model geometry
   * @param {Object} model - Model to optimize
   */
  optimizeGeometry(model) {
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
   * Prepare materials for export
   * @param {Object} model - Model to prepare
   */
  async prepareMaterials(model) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        // Ensure material is properly configured
        if (child.material.map) {
          child.material.map.flipY = false;
          child.material.map.colorSpace = THREE.SRGBColorSpace;
        }
        
        // Set proper material properties
        child.material.transparent = false;
        child.material.opacity = 1.0;
        child.material.needsUpdate = true;
      }
    });
  }

  /**
   * Prepare model for VRM compatibility
   * @param {Object} model - Model to prepare
   */
  prepareForVRM(model) {
    // Add VRM-specific metadata
    model.userData = {
      ...model.userData,
      vrmCompatible: true,
      exportSource: 'Open3DStudio',
      exportDate: new Date().toISOString()
    };

    // Ensure proper bone structure for VRM
    this.ensureVRMBoneStructure(model);
    
    // Add required VRM extensions
    this.addVRMExtensions(model);
  }

  /**
   * Ensure VRM bone structure
   * @param {Object} model - Model to prepare
   */
  ensureVRMBoneStructure(model) {
    // This would add standard VRM bone structure if missing
    // For now, we'll just mark it as VRM-compatible
    model.traverse((child) => {
      if (child.isBone) {
        child.userData.vrmBone = true;
      }
    });
  }

  /**
   * Add VRM extensions
   * @param {Object} model - Model to prepare
   */
  addVRMExtensions(model) {
    // Add VRM extension metadata
    model.userData.extensions = {
      ...model.userData.extensions,
      VRM: {
        version: '0.0',
        meta: {
          title: 'Open3DStudio Export',
          version: '1.0.0',
          author: 'Open3DStudio',
          contactInformation: '',
          reference: '',
          texture: -1,
          allowedUserName: 'Everyone',
          violentUssageName: 'Disallow',
          sexualUssageName: 'Disallow',
          commercialUssageName: 'Allow',
          otherPermissionUrl: '',
          licenseUrl: '',
          otherLicenseUrl: ''
        }
      }
    };
  }

  /**
   * Extract animations from model
   * @param {Object} model - Model to extract animations from
   */
  extractAnimations(model) {
    const animations = [];
    
    model.traverse((child) => {
      if (child.animations && child.animations.length > 0) {
        animations.push(...child.animations);
      }
    });
    
    return animations;
  }

  /**
   * Clean up model for export
   * @param {Object} model - Model to clean up
   */
  cleanupModel(model) {
    model.traverse((child) => {
      // Remove unnecessary properties
      delete child.userData.originalMaterial;
      delete child.userData.originalGeometry;
      
      // Ensure proper naming
      if (!child.name || child.name === '') {
        child.name = child.type;
      }
    });
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
   * Export with CharacterStudio compatibility
   * @param {Object} model - Model to export
   * @param {Object} options - Export options
   */
  async exportForCharacterStudio(model, options = {}) {
    const characterStudioOptions = {
      ...options,
      vrmCompatible: true,
      optimize: true,
      includeTextures: true,
      includeAnimations: true,
      metadata: {
        source: 'Open3DStudio',
        target: 'CharacterStudio',
        compatibility: 'VRM',
        exportDate: new Date().toISOString()
      }
    };

    return await this.exportToGLB(model, characterStudioOptions);
  }

  /**
   * Validate model for CharacterStudio compatibility
   * @param {Object} model - Model to validate
   */
  validateForCharacterStudio(model) {
    const issues = [];
    
    // Check for required components
    if (!model) {
      issues.push('Model is null or undefined');
      return { valid: false, issues };
    }

    // Check for meshes
    let hasMeshes = false;
    model.traverse((child) => {
      if (child.isMesh) {
        hasMeshes = true;
        
        // Check material
        if (!child.material) {
          issues.push(`Mesh ${child.name} has no material`);
        }
        
        // Check geometry
        if (!child.geometry) {
          issues.push(`Mesh ${child.name} has no geometry`);
        }
      }
    });

    if (!hasMeshes) {
      issues.push('Model has no meshes');
    }

    return {
      valid: issues.length === 0,
      issues
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

  /**
   * Cleanup
   */
  dispose() {
    this.eventListeners.clear();
  }
}


