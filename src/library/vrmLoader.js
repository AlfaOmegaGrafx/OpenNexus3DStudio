/**
 * VRMLoader - VRM model loading and processing for Open3DStudio
 * Based on CharacterStudio's VRM handling patterns
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

export class VRMLoader {
  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.register((parser) => {
      return new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true });
    });
    
    this.eventListeners = new Map();
  }

  /**
   * Load VRM model from file or URL
   * @param {File|string} source - VRM file or URL
   * @param {Object} options - Loading options
   */
  async loadVRM(source, options = {}) {
    const {
      normalize = true,
      addDefaultMaterials = true,
      processBlendShapes = true,
      setupBones = true
    } = options;

    try {
      this.emit('vrmLoadingStart', { source, options });

      // Load the VRM file
      const gltf = await this.loadGLTF(source);
      
      if (!gltf || !gltf.userData) {
        throw new Error('Failed to load GLTF file or missing userData');
      }
      
      if (!gltf.userData.vrm) {
        throw new Error('File does not contain VRM data');
      }

      const vrm = gltf.userData.vrm;
      
      if (!vrm) {
        throw new Error('VRM object is null or undefined');
      }
      
      // Process the VRM model
      const processedVRM = await this.processVRM(vrm, {
        normalize,
        addDefaultMaterials,
        processBlendShapes,
        setupBones
      });

      this.emit('vrmLoaded', { vrm: processedVRM, gltf });
      return processedVRM;
    } catch (error) {
      console.error('Failed to load VRM:', error);
      this.emit('vrmLoadError', { error, source });
      throw error;
    }
  }

  /**
   * Load GLTF file with VRM support
   * @param {File|string} source - File or URL
   */
  async loadGLTF(source) {
    return new Promise((resolve, reject) => {
      // Handle File objects by creating a URL
      let url = source;
      if (source instanceof File) {
        url = URL.createObjectURL(source);
      }
      
      this.gltfLoader.load(
        url,
        (gltf) => {
          // Clean up object URL if we created one
          if (source instanceof File) {
            URL.revokeObjectURL(url);
          }
          resolve(gltf);
        },
        (progress) => {
          const percentComplete = (progress.loaded / progress.total) * 100;
          this.emit('vrmLoadingProgress', { progress: percentComplete });
        },
        (error) => {
          // Clean up object URL if we created one
          if (source instanceof File) {
            URL.revokeObjectURL(url);
          }
          reject(error);
        }
      );
    });
  }

  /**
   * Process VRM model for Open3DStudio
   * @param {Object} vrm - VRM object
   * @param {Object} options - Processing options
   */
  async processVRM(vrm, options = {}) {
    const {
      normalize = true,
      addDefaultMaterials = true,
      processBlendShapes = true,
      setupBones = true
    } = options;

    // Normalize the model
    if (normalize) {
      this.normalizeVRM(vrm);
    }

    // Setup bone structure
    if (setupBones) {
      this.setupVRMBones(vrm);
    }

    // Process blend shapes
    if (processBlendShapes) {
      this.processVRMBlendShapes(vrm);
    }

    // Add default materials if needed
    if (addDefaultMaterials) {
      this.addDefaultVRMMaterials(vrm);
    }

    // Add Open3DStudio metadata
    this.addOpen3DStudioMetadata(vrm);

    return vrm;
  }

  /**
   * Normalize VRM model
   * @param {Object} vrm - VRM object
   */
  normalizeVRM(vrm) {
    if (!vrm) {
      console.warn('VRM object is undefined, cannot normalize');
      return;
    }
    
    if (vrm.scene) {
      // Center and scale the model
      const box = new THREE.Box3().setFromObject(vrm.scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;
      
      vrm.scene.scale.setScalar(scale);
      vrm.scene.position.sub(center.multiplyScalar(scale));
    }
  }

  /**
   * Setup VRM bone structure
   * @param {Object} vrm - VRM object
   */
  setupVRMBones(vrm) {
    if (!vrm) {
      console.warn('VRM object is undefined, cannot setup bones');
      return;
    }
    
    if (vrm.humanoid) {
      // Process humanoid bones
      this.processHumanoidBones(vrm);
    }

    if (vrm.scene) {
      // Setup bone hierarchy
      this.setupBoneHierarchy(vrm.scene);
    }
  }

  /**
   * Process humanoid bones
   * @param {Object} vrm - VRM object
   */
  processHumanoidBones(vrm) {
    if (vrm.humanoid && vrm.humanoid.humanBones) {
      const humanBones = vrm.humanoid.humanBones;
      
      // Process each human bone
      Object.keys(humanBones).forEach(boneName => {
        const boneData = humanBones[boneName];
        if (boneData && boneData.node) {
          // Add Open3DStudio bone metadata
          boneData.node.userData.open3dstudio = {
            boneType: boneName,
            isHumanBone: true
          };
        }
      });
    }
  }

  /**
   * Setup bone hierarchy
   * @param {Object} scene - Scene object
   */
  setupBoneHierarchy(scene) {
    scene.traverse((child) => {
      if (child.isBone) {
        // Add bone metadata
        child.userData.open3dstudio = {
          ...child.userData.open3dstudio,
          isBone: true,
          boneIndex: child.boneIndex || -1
        };
      }
    });
  }

  /**
   * Process VRM blend shapes
   * @param {Object} vrm - VRM object
   */
  processVRMBlendShapes(vrm) {
    if (!vrm) {
      console.warn('VRM object is undefined, cannot process blend shapes');
      return;
    }
    
    if (vrm.expressionManager) {
      // Process expression blend shapes
      const expressions = vrm.expressionManager.expressions;
      
      Object.keys(expressions).forEach(expressionName => {
        const expression = expressions[expressionName];
        if (expression) {
          // Add Open3DStudio expression metadata
          if (!expression.userData) {
            expression.userData = {};
          }
          expression.userData.open3dstudio = {
            expressionName,
            isBlendShape: true
          };
        }
      });
    }
  }

  /**
   * Add default VRM materials
   * @param {Object} vrm - VRM object
   */
  addDefaultVRMMaterials(vrm) {
    if (!vrm) {
      console.warn('VRM object is undefined, cannot add default materials');
      return;
    }
    
    if (vrm.scene) {
      vrm.scene.traverse((child) => {
        if (child.isMesh && child.material) {
          // Ensure material has VRM properties
          if (!child.material.userData) {
            child.material.userData = {};
          }
          if (!child.material.userData.vrmMaterial) {
            child.material.userData.vrmMaterial = true;
          }
          
          // Add Open3DStudio material metadata
          child.material.userData.open3dstudio = {
            isVRMMaterial: true,
            processed: true
          };
        }
      });
    }
  }

  /**
   * Add Open3DStudio metadata
   * @param {Object} vrm - VRM object
   */
  addOpen3DStudioMetadata(vrm) {
    if (!vrm) {
      console.warn('VRM object is undefined, cannot add Open3DStudio metadata');
      return;
    }
    
    if (!vrm.userData) {
      vrm.userData = {};
    }
    
    vrm.userData.open3dstudio = {
      loaded: true,
      loadDate: new Date().toISOString(),
      version: '1.0.0',
      compatible: true
    };
  }

  /**
   * Get VRM metadata
   * @param {Object} vrm - VRM object
   */
  getVRMMetadata(vrm) {
    if (!vrm.meta) return null;

    return {
      title: vrm.meta.title || 'Untitled',
      version: vrm.meta.version || '1.0.0',
      author: vrm.meta.author || 'Unknown',
      contactInformation: vrm.meta.contactInformation || '',
      reference: vrm.meta.reference || '',
      texture: vrm.meta.texture || -1,
      allowedUserName: vrm.meta.allowedUserName || 'Everyone',
      violentUssageName: vrm.meta.violentUssageName || 'Disallow',
      sexualUssageName: vrm.meta.sexualUssageName || 'Disallow',
      commercialUssageName: vrm.meta.commercialUssageName || 'Allow',
      otherPermissionUrl: vrm.meta.otherPermissionUrl || '',
      licenseUrl: vrm.meta.licenseUrl || '',
      otherLicenseUrl: vrm.meta.otherLicenseUrl || ''
    };
  }

  /**
   * Get VRM humanoid bones
   * @param {Object} vrm - VRM object
   */
  getVRMHumanoidBones(vrm) {
    if (!vrm.humanoid || !vrm.humanoid.humanBones) return [];

    const bones = [];
    Object.keys(vrm.humanoid.humanBones).forEach(boneName => {
      const boneData = vrm.humanoid.humanBones[boneName];
      if (boneData && boneData.node) {
        bones.push({
          name: boneName,
          node: boneData.node,
          bone: boneData.bone
        });
      }
    });

    return bones;
  }

  /**
   * Get VRM expressions
   * @param {Object} vrm - VRM object
   */
  getVRMExpressions(vrm) {
    if (!vrm.expressionManager) return [];

    const expressions = [];
    if (vrm.expressionManager.expressions) {
      Object.keys(vrm.expressionManager.expressions).forEach(expressionName => {
        const expression = vrm.expressionManager.expressions[expressionName];
        expressions.push({
          name: expressionName,
          expression: expression
        });
      });
    }

    return expressions;
  }

  /**
   * Validate VRM model
   * @param {Object} vrm - VRM object
   */
  validateVRM(vrm) {
    const issues = [];
    const warnings = [];

    // Check for basic VRM structure
    if (!vrm.meta) {
      warnings.push('VRM model lacks metadata');
    }

    if (!vrm.humanoid) {
      warnings.push('VRM model lacks humanoid structure');
    }

    if (!vrm.scene) {
      issues.push('VRM model has no scene');
    }

    // Check for meshes
    let hasMeshes = false;
    if (vrm.scene) {
      vrm.scene.traverse((child) => {
        if (child.isMesh) {
          hasMeshes = true;
          
          if (!child.material) {
            issues.push(`Mesh ${child.name} has no material`);
          }
        }
      });
    }

    if (!hasMeshes) {
      issues.push('VRM model has no meshes');
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings
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
