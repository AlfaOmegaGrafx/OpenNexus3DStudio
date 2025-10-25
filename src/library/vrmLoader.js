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
    // Register VRM loader plugin with fallback for missing humanoid bones
    // Always register the VRM plugin - it's essential for VRM file recognition
    this.gltfLoader.register((parser) => {
      return new VRMLoaderPlugin(parser, { 
        autoUpdateHumanBones: false, // Disable strict humanoid bone checking
        strictHumanoidBones: false   // Allow VRM models without humanoid bones
      });
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
      setupBones = true,
      allowMissingHumanoidBones = true
    } = options;

    try {
      this.emit('vrmLoadingStart', { source, options });

      // Try to load the VRM file with fallback for missing humanoid bones
      let gltf;
      try {
        console.log('🔍 VRM Loader: Attempting to load VRM file...');
        gltf = await this.loadGLTF(source);
        console.log('🔍 VRM Loader: GLTF loaded successfully');
        console.log('🔍 VRM Loader: GLTF userData:', gltf.userData);
        console.log('🔍 VRM Loader: GLTF userData.vrm:', gltf.userData?.vrm);
      } catch (error) {
        console.error('🔍 VRM Loader: Failed to load VRM:', error);
        // If VRM loading fails due to missing humanoid bones, try fallback approach
        if (error.message.includes('humanoid bones are required') && allowMissingHumanoidBones) {
          console.warn('VRM loading failed due to missing humanoid bones, attempting fallback...');
          gltf = await this.loadVRMWithFallback(source);
        } else {
          throw error;
        }
      }
      
      if (!gltf || !gltf.userData) {
        throw new Error('Failed to load GLTF file or missing userData');
      }
      
      if (!gltf.userData.vrm) {
        throw new Error('File does not contain VRM data');
      }

      const vrm = gltf.userData.vrm;
      
      // Debug: Log the original GLTF structure
      console.log('🔍 Original GLTF structure:', gltf);
      console.log('🔍 Original GLTF keys:', Object.keys(gltf));
      console.log('🔍 Original GLTF images:', gltf.images);
      console.log('🔍 Original GLTF textures:', gltf.textures);
      console.log('🔍 Original GLTF scenes:', gltf.scenes);
      console.log('🔍 Original GLTF nodes:', gltf.nodes);
      console.log('🔍 Original GLTF materials:', gltf.materials);
      
      // Debug: Check if GLTF has parser or other properties
      console.log('🔍 GLTF parser:', gltf.parser);
      console.log('🔍 GLTF userData:', gltf.userData);
      console.log('🔍 GLTF animations:', gltf.animations);
      console.log('🔍 GLTF cameras:', gltf.cameras);
      console.log('🔍 GLTF asset:', gltf.asset);
      
      // Debug: Check if GLTF has any image-related properties
      for (const key of Object.keys(gltf)) {
        if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('buffer')) {
          console.log(`🔍 GLTF ${key}:`, gltf[key]);
        }
      }
      
      // Debug: Check if GLTF has any nested structures that might contain images
      if (gltf.parser) {
        console.log('🔍 GLTF parser keys:', Object.keys(gltf.parser));
        console.log('🔍 GLTF parser images:', gltf.parser.images);
        console.log('🔍 GLTF parser textures:', gltf.parser.textures);
        console.log('🔍 GLTF parser buffers:', gltf.parser.buffers);
        console.log('🔍 GLTF parser bufferViews:', gltf.parser.bufferViews);
        
        // Try to access GLTF data through parser
        if (gltf.parser.json) {
          console.log('🔍 GLTF parser.json keys:', Object.keys(gltf.parser.json));
          console.log('🔍 GLTF parser.json images:', gltf.parser.json.images);
          console.log('🔍 GLTF parser.json textures:', gltf.parser.json.textures);
          console.log('🔍 GLTF parser.json nodes:', gltf.parser.json.nodes);
          console.log('🔍 GLTF parser.json materials:', gltf.parser.json.materials);
          console.log('🔍 GLTF parser.json meshes:', gltf.parser.json.meshes);
          console.log('🔍 GLTF parser.json buffers:', gltf.parser.json.buffers);
          console.log('🔍 GLTF parser.json bufferViews:', gltf.parser.json.bufferViews);
        }
      }
      
      // Debug: Check if GLTF has any buffer-related properties
      if (gltf.buffers) {
        console.log('🔍 GLTF buffers:', gltf.buffers);
      }
      
      if (gltf.bufferViews) {
        console.log('🔍 GLTF bufferViews:', gltf.bufferViews);
      }
      
      if (gltf.accessors) {
        console.log('🔍 GLTF accessors:', gltf.accessors);
      }
      
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

      // Preserve the original GLTF data in the VRM's userData for thumbnail extraction
      if (!processedVRM.userData) {
        processedVRM.userData = {};
      }
      processedVRM.userData.gltf = gltf;
      
      // Also attach GLTF data directly to the VRM object for easier access
      processedVRM.gltf = gltf;
      
      // Debug: Log GLTF data attachment
      console.log('🔍 GLTF data attached to VRM userData:', gltf);
      console.log('🔍 GLTF structure keys:', Object.keys(gltf || {}));
      console.log('🔍 GLTF images array:', gltf?.images);
      console.log('🔍 GLTF images length:', gltf?.images?.length);
      console.log('🔍 GLTF textures array:', gltf?.textures);
      console.log('🔍 GLTF textures length:', gltf?.textures?.length);
      console.log('🔍 GLTF scenes:', gltf?.scenes);
      console.log('🔍 GLTF nodes:', gltf?.nodes);
      console.log('🔍 GLTF materials:', gltf?.materials);
      console.log('🔍 VRM userData after GLTF attachment:', processedVRM.userData);
      console.log('🔍 VRM userData.gltf after attachment:', processedVRM.userData.gltf);
      console.log('🔍 VRM.gltf after attachment:', processedVRM.gltf);
      
      // Debug: Check VRM metadata for thumbnail
      console.log('🔍 VRM metadata:', processedVRM.meta);
      console.log('🔍 VRM metadata texture index:', processedVRM.meta?.texture);
      console.log('🔍 VRM metadata keys:', Object.keys(processedVRM.meta || {}));
      
      // Debug: Check if VRM has any image-related properties
      for (const key of Object.keys(processedVRM.meta || {})) {
        if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
          console.log(`🔍 VRM metadata ${key}:`, processedVRM.meta[key]);
        }
      }

      this.emit('vrmLoaded', { vrm: processedVRM, gltf });
      return processedVRM;
    } catch (error) {
      console.error('Failed to load VRM:', error);
      
      // Provide more specific error information
      if (error.message.includes('Unexpected non-whitespace character')) {
        console.error('VRM Load Error: JSON parsing failed - file may be corrupted or not a valid VRM file');
        console.error('VRM Load Error: This usually indicates the exported VRM file has malformed JSON structure');
        throw new Error(`VRM file has invalid JSON structure: ${error.message}. The exported VRM file may be corrupted.`);
      } else if (error.message.includes('JSON')) {
        console.error('VRM Load Error: JSON parsing error - file format issue');
        throw new Error(`VRM file format error: ${error.message}`);
      } else {
        console.error('VRM Load Error: General loading error');
        throw new Error(`VRM loading failed: ${error.message}`);
      }
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
   * Load VRM with fallback for missing humanoid bones
   * @param {File|string} source - File or URL
   */
  async loadVRMWithFallback(source) {
    console.log('🔄 Attempting VRM fallback loading...');
    
    // Create a new GLTF loader without VRM plugin for fallback
    const fallbackLoader = new GLTFLoader();
    
    return new Promise((resolve, reject) => {
      // Handle File objects by creating a URL
      let url = source;
      if (source instanceof File) {
        url = URL.createObjectURL(source);
      }
      
      fallbackLoader.load(
        url,
        (gltf) => {
          // Clean up object URL if we created one
          if (source instanceof File) {
            URL.revokeObjectURL(url);
          }
          
          // Create a mock VRM object for models without humanoid bones
          const mockVRM = this.createMockVRM(gltf);
          gltf.userData.vrm = mockVRM;
          
          console.log('✅ VRM fallback loading successful');
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
          console.error('❌ VRM fallback loading failed:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Create a mock VRM object for models without humanoid bones
   * @param {Object} gltf - GLTF object
   */
  createMockVRM(gltf) {
    console.log('🔧 Creating mock VRM object for model without humanoid bones...');
    
    const mockVRM = {
      scene: gltf.scene,
      meta: {
        title: 'Untitled',
        version: '1.0.0',
        author: 'Unknown',
        contactInformation: '',
        reference: '',
        texture: -1,
        allowedUserName: 'Everyone',
        violentUssageName: 'Disallow',
        sexualUssageName: 'Disallow',
        commercialUssageName: 'Allow',
        otherPermissionUrl: '',
        licenseUrl: '',
        otherLicenseUrl: '',
        metaVersion: '0'
      },
      humanoid: null, // No humanoid bones
      expressionManager: null, // No expressions
      userData: {
        open3dstudio: {
          fallbackMode: true,
          hasHumanoidBones: false,
          loaded: true,
          loadDate: new Date().toISOString()
        }
      }
    };

    // Add basic scene processing and ensure meshes are properly detected
    if (gltf.scene) {
      let meshCount = 0;
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          meshCount++;
          // Ensure materials are properly set
          if (child.material) {
            child.material.needsUpdate = true;
          }
        }
      });
      
      console.log(`🔍 Mock VRM scene processing: found ${meshCount} meshes`);
      
      // If no meshes found, try to create a basic mesh for fallback
      if (meshCount === 0) {
        console.log('🔧 Creating fallback mesh for VRM model...');
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x888888 });
        const fallbackMesh = new THREE.Mesh(geometry, material);
        fallbackMesh.name = 'FallbackMesh';
        gltf.scene.add(fallbackMesh);
        console.log('✅ Fallback mesh created successfully');
      }
    }

    console.log('✅ Mock VRM object created successfully');
    return mockVRM;
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
      
      // Fix VRM model orientation - rotate to face forward
      vrm.scene.rotation.y = Math.PI;
      console.log('🔄 VRM model rotated to face forward during normalization');
      console.log('🔄 VRM scene rotation after fix:', vrm.scene.rotation);
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
          
          // Enhanced VRM material processing for textures and shaders
          this.processVRMMaterial(child.material);
        }
      });
    }
  }
  
  /**
   * Process VRM material for proper texture and shader handling
   * @param {Object} material - Material object
   */
  processVRMMaterial(material) {
    if (!material) return;
    
    console.log(`🔧 Processing VRM material: ${material.type}`);
    
    // Ensure material properties are properly set
    if (material.map) {
      material.map.needsUpdate = true;
      material.map.flipY = false; // VRM textures should not be flipped
      console.log(`📷 Texture map processed: ${material.map.image?.src || 'embedded'}`);
    }
    
    if (material.normalMap) {
      material.normalMap.needsUpdate = true;
      material.normalMap.flipY = false;
      console.log(`📷 Normal map processed: ${material.normalMap.image?.src || 'embedded'}`);
    }
    
    if (material.roughnessMap) {
      material.roughnessMap.needsUpdate = true;
      material.roughnessMap.flipY = false;
      console.log(`📷 Roughness map processed: ${material.roughnessMap.image?.src || 'embedded'}`);
    }
    
    if (material.metalnessMap) {
      material.metalnessMap.needsUpdate = true;
      material.metalnessMap.flipY = false;
      console.log(`📷 Metalness map processed: ${material.metalnessMap.image?.src || 'embedded'}`);
    }
    
    if (material.emissiveMap) {
      material.emissiveMap.needsUpdate = true;
      material.emissiveMap.flipY = false;
      console.log(`📷 Emissive map processed: ${material.emissiveMap.image?.src || 'embedded'}`);
    }
    
    // Force aggressive texture processing for VRM materials
    const textureMaps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'];
    textureMaps.forEach(mapType => {
      if (material[mapType]) {
        const texture = material[mapType];
        texture.needsUpdate = true;
        texture.flipY = false;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        console.log(`🔧 Aggressive texture processing for ${mapType}: ${texture.image?.src || 'embedded'}`);
      }
    });
    
    // Ensure material needs update for proper rendering
    material.needsUpdate = true;
    material.wireframe = false;
    material.transparent = false;
    material.opacity = 1.0;
    
    // Set proper material properties for VRM
    if (material.type === 'MeshStandardMaterial' || material.type === 'MeshPhysicalMaterial') {
      // Ensure proper material settings for VRM
      material.envMapIntensity = material.envMapIntensity || 1.0;
      material.roughness = material.roughness || 0.5;
      material.metalness = material.metalness || 0.0;
      material.emissive = material.emissive || new THREE.Color(0x000000);
      material.emissiveIntensity = material.emissiveIntensity || 1.0;
    }
    
    console.log(`✅ VRM material processed successfully: ${material.type}`);
    console.log(`✅ Material wireframe: ${material.wireframe}, transparent: ${material.transparent}, opacity: ${material.opacity}`);
    if (material.map) {
      console.log(`✅ Main texture: needsUpdate=${material.map.needsUpdate}, flipY=${material.map.flipY}`);
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

    // Check if this is a fallback VRM (no humanoid bones)
    const isFallbackVRM = vrm.userData?.open3dstudio?.fallbackMode === true;
    
    if (!vrm.humanoid && !isFallbackVRM) {
      warnings.push('VRM model lacks humanoid structure');
    } else if (isFallbackVRM) {
      warnings.push('VRM model loaded in fallback mode (no humanoid bones)');
    }

    if (!vrm.scene) {
      issues.push('VRM model has no scene');
    }

    // Check for meshes - improved detection
    let hasMeshes = false;
    let meshCount = 0;
    
    if (vrm.scene) {
      vrm.scene.traverse((child) => {
        if (child.isMesh) {
          hasMeshes = true;
          meshCount++;
          
          if (!child.material) {
            issues.push(`Mesh ${child.name} has no material`);
          }
        }
      });
      
      console.log(`🔍 VRM mesh detection: found ${meshCount} meshes`);
    }

    // For fallback VRMs, be more lenient with mesh detection
    if (!hasMeshes && !isFallbackVRM) {
      issues.push('VRM model has no meshes');
    } else if (!hasMeshes && isFallbackVRM) {
      warnings.push('VRM model has no meshes (fallback mode)');
    }

    // For fallback VRMs, be more lenient with validation
    const isStrictValidation = !isFallbackVRM;
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      isFallbackVRM,
      strictValidation: isStrictValidation
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
