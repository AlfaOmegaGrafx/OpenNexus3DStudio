/**
 * GLBExporter - Exports 3D models to GLB format for OpenNexus3DStudio
 * Handles model optimization and VRM compatibility preparation
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getOptimizedTextureOptions } from './textureOptimizer.js';
import {
  cloneModelForGltfExport,
  modelHasVrmRoot,
  sanitizeForGltfExport,
} from './glbExportUtils.js';

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
    let {
      filename = 'exported_model.glb',
      optimize = true,
      includeTextures = true,
      includeAnimations = true,
      animationClips = null,
      metadata = {},
      vrmCompatible = modelHasVrmRoot(model),
      compressGlb = false,
      compressQuality = 50,
      compressPreset,
    } = options;

    const useVrmExtensions = vrmCompatible && modelHasVrmRoot(model);

    try {
      this.emit('exportStart', { model, options });

      const clonedModel = cloneModelForGltfExport(model);

      // Prepare model for export
      const preparedModel = await this.prepareModelForExport(clonedModel, {
        optimize,
        includeTextures,
        includeAnimations,
        vrmCompatible: useVrmExtensions,
      });

      // Create scene for export
      const exportScene = new THREE.Scene();
      exportScene.add(preparedModel);

      // Add metadata
      if (Object.keys(metadata).length > 0) {
        exportScene.userData = metadata;
      }

      // Export to GLB with optimized texture settings
      // OPTIMIZED: Apply texture size limiting and optimization options
      const optimizedTextureOptions = getOptimizedTextureOptions({
        // Allow user to override if needed
        maxTextureSize: options.maxTextureSize,
        forcePowerOfTwoTextures: options.forcePowerOfTwoTextures,
      });
      
      let glbData = await this.exporter.parseAsync(exportScene, {
        binary: true,
        includeCustomExtensions: useVrmExtensions,
        animations: includeAnimations
          ? (animationClips?.length ? animationClips : this.extractAnimations(model))
          : [],
        // OPTIMIZED: Add texture optimization options (ported from CharacterStudioRedux)
        truncateDrawRange: true,
        forcePowerOfTwoTextures: optimizedTextureOptions.forcePowerOfTwoTextures,  // false = allows exact sizes
        maxTextureSize: optimizedTextureOptions.maxTextureSize,  // 1024 = 16x size reduction vs 4096
      });

      let compressStats = null;
      if (compressGlb) {
        const { compressGlbBuffer } = await import('./glbCompress.js');
        const compressed = await compressGlbBuffer(glbData, {
          quality: compressQuality,
          preset: compressPreset,
          includeTextures,
        });
        glbData = compressed.buffer;
        compressStats = compressed.stats;
        if (!/-draco\.glb$/i.test(filename)) {
          filename = filename.replace(/\.glb$/i, '-draco.glb');
        }
        this.emit('compressComplete', compressStats);
      }

      // Create blob and download
      const blob = new Blob([glbData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      this.downloadFile(url, filename);
      
      this.emit('exportComplete', { model, filename, blob });
      
      // Clean up
      URL.revokeObjectURL(url);
      
      return { blob, filename, url, compressStats };
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

    if (vrmCompatible) {
      this.prepareForVRM(model);
    }

    sanitizeForGltfExport(model);
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
        if (typeof child.geometry.mergeVertices === 'function') {
          child.geometry.mergeVertices();
        } else if (typeof BufferGeometryUtils.mergeVertices === 'function') {
          child.geometry = BufferGeometryUtils.mergeVertices(child.geometry);
        }

        if (!child.geometry.attributes.normal && typeof child.geometry.computeVertexNormals === 'function') {
          child.geometry.computeVertexNormals();
        }

        if (typeof child.geometry.computeBoundingBox === 'function') {
          child.geometry.computeBoundingBox();
        }
        if (typeof child.geometry.computeBoundingSphere === 'function') {
          child.geometry.computeBoundingSphere();
        }
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
      exportSource: 'OpenNexus3DStudio',
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
          title: 'OpenNexus3DStudio Export',
          version: '1.0.0',
          author: 'OpenNexus3DStudio',
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
      vrmCompatible: options.vrmCompatible ?? modelHasVrmRoot(model),
      optimize: true,
      includeTextures: true,
      includeAnimations: true,
      metadata: {
        source: 'OpenNexus3DStudio',
        target: 'OpenNexus3DStudio',
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




