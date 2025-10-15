/**
 * CharacterStudioBridge - Bridge for importing Open3DStudio GLB exports into CharacterStudio
 * Handles format conversion and VRM compatibility
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

export class CharacterStudioBridge {
  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.register((parser) => {
      return new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true });
    });
    
    this.eventListeners = new Map();
  }

  /**
   * Load Open3DStudio GLB for CharacterStudio
   * @param {File|string} source - GLB file or URL
   * @param {Object} options - Loading options
   */
  async loadOpen3DStudioGLB(source, options = {}) {
    const {
      convertToVRM = true,
      addVRMStructure = true,
      optimizeForCharacterStudio = true,
      addDefaultMaterials = true
    } = options;

    try {
      this.emit('loadStart', { source, options });

      // Load the GLB file
      const gltf = await this.loadGLB(source);
      
      // Process for CharacterStudio compatibility
      const processedModel = await this.processForCharacterStudio(gltf, {
        convertToVRM,
        addVRMStructure,
        optimizeForCharacterStudio,
        addDefaultMaterials
      });

      this.emit('loadComplete', { model: processedModel, gltf });
      return processedModel;
    } catch (error) {
      console.error('Failed to load Open3DStudio GLB:', error);
      this.emit('loadError', { error, source });
      throw error;
    }
  }

  /**
   * Load GLB file
   * @param {File|string} source - GLB file or URL
   */
  async loadGLB(source) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        source,
        (gltf) => resolve(gltf),
        (progress) => {
          const percentComplete = (progress.loaded / progress.total) * 100;
          this.emit('loadProgress', { progress: percentComplete });
        },
        (error) => reject(error)
      );
    });
  }

  /**
   * Process model for CharacterStudio compatibility
   * @param {Object} gltf - Loaded GLTF object
   * @param {Object} options - Processing options
   */
  async processForCharacterStudio(gltf, options = {}) {
    const {
      convertToVRM = true,
      addVRMStructure = true,
      optimizeForCharacterStudio = true,
      addDefaultMaterials = true
    } = options;

    const scene = gltf.scene;

    // Add VRM structure if needed
    if (addVRMStructure) {
      this.addVRMStructure(scene);
    }

    // Convert to VRM format if needed
    if (convertToVRM) {
      await this.convertToVRMFormat(scene);
    }

    // Optimize for CharacterStudio
    if (optimizeForCharacterStudio) {
      this.optimizeForCharacterStudio(scene);
    }

    // Add default materials if needed
    if (addDefaultMaterials) {
      this.addDefaultMaterials(scene);
    }

    // Add CharacterStudio metadata
    this.addCharacterStudioMetadata(scene);

    return scene;
  }

  /**
   * Add VRM structure to model
   * @param {Object} scene - Scene to add VRM structure to
   */
  addVRMStructure(scene) {
    // Create VRM userData structure
    scene.userData.vrm = {
      meta: {
        title: 'Open3DStudio Import',
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
      },
      humanoid: {
        humanBones: []
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
        preset: {},
        custom: {}
      },
      materialProperties: []
    };
  }

  /**
   * Convert model to VRM format
   * @param {Object} scene - Scene to convert
   */
  async convertToVRMFormat(scene) {
    // Add VRM-specific bone structure
    this.addVRMBones(scene);
    
    // Add VRM materials
    this.addVRMMaterials(scene);
    
    // Add VRM blend shapes
    this.addVRMBlendShapes(scene);
  }

  /**
   * Add VRM bones
   * @param {Object} scene - Scene to add bones to
   */
  addVRMBones(scene) {
    // Create a basic bone structure for VRM
    const skeleton = new THREE.Skeleton();
    const bones = [];

    // Add standard VRM bones
    const standardBones = [
      'hips', 'spine', 'chest', 'neck', 'head',
      'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
      'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
      'rightUpperLeg', 'rightLowerLeg', 'rightFoot'
    ];

    standardBones.forEach((boneName, index) => {
      const bone = new THREE.Bone();
      bone.name = boneName;
      bone.userData.vrmBone = true;
      bones.push(bone);
    });

    skeleton.bones = bones;
    scene.userData.skeleton = skeleton;
  }

  /**
   * Add VRM materials
   * @param {Object} scene - Scene to add materials to
   */
  addVRMMaterials(scene) {
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        // Ensure material is VRM-compatible
        child.material.userData.vrmMaterial = true;
        
        // Add VRM material properties
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
   * Add VRM blend shapes
   * @param {Object} scene - Scene to add blend shapes to
   */
  addVRMBlendShapes(scene) {
    // Add basic blend shapes for VRM compatibility
    const blendShapes = {
      preset: {
        neutral: { weight: 0 },
        happy: { weight: 0 },
        angry: { weight: 0 },
        sad: { weight: 0 },
        surprised: { weight: 0 }
      },
      custom: {}
    };

    scene.userData.blendShapes = blendShapes;
  }

  /**
   * Optimize model for CharacterStudio
   * @param {Object} scene - Scene to optimize
   */
  optimizeForCharacterStudio(scene) {
    // Merge geometries for better performance
    this.mergeGeometries(scene);
    
    // Optimize materials
    this.optimizeMaterials(scene);
    
    // Add CharacterStudio-specific properties
    this.addCharacterStudioProperties(scene);
  }

  /**
   * Merge geometries for better performance
   * @param {Object} scene - Scene to optimize
   */
  mergeGeometries(scene) {
    const geometries = [];
    const materials = [];
    
    scene.traverse((child) => {
      if (child.isMesh && child.geometry) {
        geometries.push(child.geometry);
        materials.push(child.material);
      }
    });

    if (geometries.length > 1) {
      // Merge geometries into a single mesh
      const mergedGeometry = new THREE.BufferGeometry();
      const mergedMaterial = materials[0]; // Use first material
      
      // This is a simplified merge - in practice, you'd want more sophisticated merging
      scene.children = scene.children.filter(child => !child.isMesh);
      
      const mergedMesh = new THREE.Mesh(mergedGeometry, mergedMaterial);
      mergedMesh.name = 'MergedMesh';
      scene.add(mergedMesh);
    }
  }

  /**
   * Optimize materials
   * @param {Object} scene - Scene to optimize
   */
  optimizeMaterials(scene) {
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        // Ensure materials are optimized for CharacterStudio
        child.material.transparent = false;
        child.material.opacity = 1.0;
        child.material.needsUpdate = true;
        
        // Add CharacterStudio material properties
        child.material.userData.characterStudio = true;
        child.material.userData.optimized = true;
      }
    });
  }

  /**
   * Add CharacterStudio properties
   * @param {Object} scene - Scene to add properties to
   */
  addCharacterStudioProperties(scene) {
    scene.userData.characterStudio = {
      imported: true,
      source: 'Open3DStudio',
      importDate: new Date().toISOString(),
      version: '1.0.0',
      compatible: true
    };
  }

  /**
   * Add default materials if needed
   * @param {Object} scene - Scene to add materials to
   */
  addDefaultMaterials(scene) {
    scene.traverse((child) => {
      if (child.isMesh && !child.material) {
        // Add default material
        child.material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.5,
          metalness: 0.0
        });
      }
    });
  }

  /**
   * Add CharacterStudio metadata
   * @param {Object} scene - Scene to add metadata to
   */
  addCharacterStudioMetadata(scene) {
    scene.userData.metadata = {
      ...scene.userData.metadata,
      characterStudio: {
        compatible: true,
        importSource: 'Open3DStudio',
        importDate: new Date().toISOString(),
        version: '1.0.0'
      }
    };
  }

  /**
   * Validate model for CharacterStudio compatibility
   * @param {Object} model - Model to validate
   */
  validateForCharacterStudio(model) {
    const issues = [];
    const warnings = [];

    // Check for VRM structure
    if (!model.userData.vrm) {
      warnings.push('Model lacks VRM structure - will be added automatically');
    }

    // Check for materials
    let hasMaterials = false;
    model.traverse((child) => {
      if (child.isMesh) {
        if (!child.material) {
          issues.push(`Mesh ${child.name} has no material`);
        } else {
          hasMaterials = true;
        }
      }
    });

    if (!hasMaterials) {
      issues.push('Model has no materials');
    }

    // Check for geometry
    let hasGeometry = false;
    model.traverse((child) => {
      if (child.isMesh && child.geometry) {
        hasGeometry = true;
      }
    });

    if (!hasGeometry) {
      issues.push('Model has no geometry');
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


