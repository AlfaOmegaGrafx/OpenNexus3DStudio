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

      // Validate model
      if (!model) {
        throw new Error('No model provided for VRM export');
      }

      console.log('VRM Export: Model details:', {
        type: model.type,
        isMesh: model.isMesh,
        isGroup: model.isGroup,
        isObject3D: model.isObject3D,
        children: model.children?.length || 0,
        geometry: model.geometry ? 'has geometry' : 'no geometry',
        material: model.material ? 'has material' : 'no material',
        materials: model.materials ? model.materials.length : 0
      });
      
      // Debug: Check model for morph targets before export
      let morphTargetCount = 0;
      model.traverse((child) => {
        if (child.isMesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
          morphTargetCount++;
          console.log(`🎭 VRM Export: Found mesh "${child.name}" with ${child.morphTargetInfluences.length} morph targets`);
          console.log(`🎭 VRM Export: Morph target dictionary:`, Object.keys(child.morphTargetDictionary || {}));
        }
      });
      console.log(`🎭 VRM Export: Total meshes with morph targets: ${morphTargetCount}`);

      // Preserve model transform and positioning before export
      this.preserveModelTransform(model);
      
      // Extract blend shapes and morph targets from model before export
      const extractedBlendShapes = this.extractBlendShapes(model);
      console.log('VRM Export: Extracted blend shapes:', extractedBlendShapes.length);

      // Extract VRM data from the model if it exists
      const extractedVRMData = this.extractVRMData(model);
      console.log('VRM Export: Extracted VRM data:', {
        hasVRM: !!extractedVRMData,
        hasMeta: !!extractedVRMData?.meta,
        hasHumanoid: !!extractedVRMData?.humanoid,
        hasExpressions: !!extractedVRMData?.expressionManager,
        hasSpringBones: !!extractedVRMData?.springBoneManager
      });

      // Clone textures to prevent immutable texture errors
      this.cloneTexturesForExport(model);

      // Create a scene and export as GLTF first
      const scene = new THREE.Scene();
      scene.add(model);
      
      // Clone textures to prevent immutable texture errors
      this.cloneTexturesForExport(model);
      
      // Export as GLB (binary: true) to get proper bufferViews for images and geometry
      const glbArrayBuffer = await this.gltfExporter.parseAsync(scene, {
        binary: true,
        includeCustomExtensions: false,
        animations: [],
        onlyVisible: false,
        truncateDrawRange: false,
        embedImages: true,
        maxTextureSize: 4096,
        forceIndices: false,
        forcePowerOfTwoTextures: false
      });
      
      // Parse the GLB to extract JSON and binary chunks
      const gltfData = this.parseGLB(glbArrayBuffer);
      
      console.log('VRM Export: GLTF data structure:', {
        scenes: gltfData.scenes?.length || 0,
        nodes: gltfData.nodes?.length || 0,
        meshes: gltfData.meshes?.length || 0,
        materials: gltfData.materials?.length || 0,
        textures: gltfData.textures?.length || 0,
        images: gltfData.images?.length || 0,
        accessors: gltfData.accessors?.length || 0,
        bufferViews: gltfData.bufferViews?.length || 0,
        buffers: gltfData.buffers?.length || 0,
        binaryData: gltfData.binaryData ? gltfData.binaryData.byteLength : 0
      });
      
      // Debug: Check if meshes have morph targets
      if (gltfData.meshes && gltfData.meshes.length > 0) {
        gltfData.meshes.forEach((mesh, idx) => {
          const primitives = mesh.primitives || [];
          primitives.forEach((prim, primIdx) => {
            if (prim.targets && prim.targets.length > 0) {
              console.log(`VRM Export: Mesh ${idx} primitive ${primIdx} has ${prim.targets.length} morph targets`);
              console.log(`VRM Export: Mesh ${idx} extras:`, mesh.extras);
            } else {
              console.warn(`VRM Export: Mesh ${idx} primitive ${primIdx} has NO morph targets`);
            }
          });
        });
      }
      
      // Debug: Check how images are stored
      if (gltfData.images && gltfData.images.length > 0) {
        console.log('VRM Export: First image structure:', gltfData.images[0]);
        const hasBufferViews = gltfData.images.filter(img => img.bufferView !== undefined).length;
        const hasDataURIs = gltfData.images.filter(img => img.uri && img.uri.startsWith('data:')).length;
        console.log(`VRM Export: Images with bufferView: ${hasBufferViews}, with data URIs: ${hasDataURIs}`);
      }

      // Debug binary data
      if (gltfData.binaryData) {
        console.log('VRM Export: Binary data extracted, size:', gltfData.binaryData.byteLength);
      } else {
        console.warn('VRM Export: No binary data found in GLB');
      }

      // Create VRM 0.0 file structure manually with extracted VRM data
      const vrmFile = await this.createVRM0File(gltfData, {
        vrmVersion,
        metadata,
        humanoidBones,
        expressions,
        materials,
        screenshot,
        extractedVRMData
      });

      const glbData = vrmFile;

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
   * Clone textures to prevent immutable texture errors during export
   * @param {Object} model - Model to process
   */
  cloneTexturesForExport(model) {
    console.log('🔄 VRM Export: Cloning textures to prevent immutable errors...');
    
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const material = child.material;
        
        // Clone the material to avoid modifying the original
        if (!material.userData.originalMaterial) {
          material.userData.originalMaterial = material.clone();
        }
        
        // Clone textures to prevent immutable errors
        if (material.map) {
          material.map = material.map.clone();
          material.map.needsUpdate = true;
        }
        if (material.normalMap) {
          material.normalMap = material.normalMap.clone();
          material.normalMap.needsUpdate = true;
        }
        if (material.roughnessMap) {
          material.roughnessMap = material.roughnessMap.clone();
          material.roughnessMap.needsUpdate = true;
        }
        if (material.metalnessMap) {
          material.metalnessMap = material.metalnessMap.clone();
          material.metalnessMap.needsUpdate = true;
        }
        if (material.aoMap) {
          material.aoMap = material.aoMap.clone();
          material.aoMap.needsUpdate = true;
        }
        if (material.emissiveMap) {
          material.emissiveMap = material.emissiveMap.clone();
          material.emissiveMap.needsUpdate = true;
        }
        if (material.bumpMap) {
          material.bumpMap = material.bumpMap.clone();
          material.bumpMap.needsUpdate = true;
        }
        if (material.displacementMap) {
          material.displacementMap = material.displacementMap.clone();
          material.displacementMap.needsUpdate = true;
        }
        if (material.alphaMap) {
          material.alphaMap = material.alphaMap.clone();
          material.alphaMap.needsUpdate = true;
        }
        if (material.envMap) {
          material.envMap = material.envMap.clone();
          material.envMap.needsUpdate = true;
        }
        
        // Handle array of materials
        if (Array.isArray(material)) {
          material.forEach((mat, index) => {
            if (mat.map) {
              mat.map = mat.map.clone();
              mat.map.needsUpdate = true;
            }
            // Clone other texture properties as needed
            if (mat.normalMap) {
              mat.normalMap = mat.normalMap.clone();
              mat.normalMap.needsUpdate = true;
            }
          });
        }
        
        material.needsUpdate = true;
      }
    });
    
    console.log('✅ VRM Export: Texture cloning completed');
  }

  /**
   * Optimize model for VRM export
   * @param {Object} model - Model to optimize
   */
  optimizeModelForVRM(model) {
    model.traverse((child) => {
      if (child.isMesh && child.geometry) {
        // Merge vertices if the method exists
        if (typeof child.geometry.mergeVertices === 'function') {
          child.geometry.mergeVertices();
        }
        
        // Compute normals if missing
        if (!child.geometry.attributes.normal && typeof child.geometry.computeVertexNormals === 'function') {
          child.geometry.computeVertexNormals();
        }
        
        // Compute bounding box if methods exist
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
    // Create VRM 0.0 data structure that VRM applications expect
    return {
      specVersion: "0.0",
      meta: {
        version: "0.0",
        title: options.metadata?.title || 'Open3DStudio Export',
        author: options.metadata?.author || 'Open3DStudio',
        contactInformation: "",
        reference: "",
        texture: -1,
        allowedUserName: "Everyone",
        violentUssageName: "Disallow",
        sexualUssageName: "Disallow",
        commercialUssageName: "Allow",
        otherPermissionUrl: "",
        licenseUrl: "",
        otherLicenseUrl: ""
      },
      humanoid: {
        humanBones: []
      },
      firstPerson: {
        firstPersonBone: -1,
        firstPersonBoneOffset: { x: 0, y: 0, z: 0 },
        meshAnnotations: [],
        lookAtTypeName: "Bone",
        lookAtHorizontalInner: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
        lookAtHorizontalOuter: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
        lookAtVerticalDown: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
        lookAtVerticalUp: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 }
      },
      expressions: {
        preset: {},
        custom: {}
      },
      blendShapeMaster: {
        blendShapeGroups: []
      },
      secondaryAnimation: {
        boneGroups: [],
        colliderGroups: []
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
    
    // Export as standard GLTF/GLB - VRM applications can often read GLTF files
    const gltfData = await this.gltfExporter.parseAsync(scene, {
      binary: true,
      includeCustomExtensions: false,
      animations: [],
      onlyVisible: false,
      truncateDrawRange: false,
      embedImages: true,
      maxTextureSize: 4096
    });

    // Return the GLB data directly - many VRM applications can import GLTF files
    return gltfData;
  }

  /**
   * Create minimal but valid VRM 0.0 file
   * @param {Object} gltfData - GLTF data
   * @param {Object} vrmData - VRM metadata
   * @returns {ArrayBuffer} VRM 0.0 file data
   */
  createMinimalVRM(gltfData, vrmData) {
    // Create a minimal VRM file that VRM applications can recognize
    const vrmFile = {
      asset: {
        version: "2.0",
        generator: "Open3DStudio VRM Exporter"
      },
      extensions: {
        VRM: {
          specVersion: "0.0",
          meta: {
            version: "0.0",
            title: vrmData.meta?.title || "Open3DStudio Export",
            author: vrmData.meta?.author || "Open3DStudio",
            contactInformation: "",
            reference: "",
            texture: -1,
            allowedUserName: "Everyone",
            violentUssageName: "Disallow",
            sexualUssageName: "Disallow",
            commercialUssageName: "Allow",
            otherPermissionUrl: "",
            licenseUrl: "",
            otherLicenseUrl: ""
          },
          humanoid: {
            humanBones: []
          },
          firstPerson: {
            firstPersonBone: -1,
            firstPersonBoneOffset: { x: 0, y: 0, z: 0 },
            meshAnnotations: [],
            lookAtTypeName: "Bone",
            lookAtHorizontalInner: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
            lookAtHorizontalOuter: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
            lookAtVerticalDown: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
            lookAtVerticalUp: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 }
          },
          expressions: {
            preset: {},
            custom: {}
          },
          blendShapeMaster: {
            blendShapeGroups: []
          },
          secondaryAnimation: {
            boneGroups: [],
            colliderGroups: []
          },
          materialProperties: []
        }
      },
      extensionsRequired: ["VRM"],
      extensionsUsed: ["VRM"],
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: "Root" }],
      meshes: gltfData.meshes || [],
      materials: gltfData.materials || [],
      textures: gltfData.textures || [],
      images: gltfData.images || [],
      accessors: gltfData.accessors || [],
      bufferViews: gltfData.bufferViews || [],
      buffers: gltfData.buffers || []
    };

    // Convert to GLB format
    return this.convertToGLB(vrmFile, gltfData);
  }

  /**
   * Create proper VRM 0.0 file structure
   * @param {Object} gltfData - GLTF data (with binaryData)
   * @param {Object} vrmData - VRM metadata
   * @returns {ArrayBuffer} VRM 0.0 file data
   */
  async createVRM0File(gltfData, vrmData) {
    // Store binaryData separately (will be used by convertToGLB)
    const binaryData = gltfData.binaryData;
    
    // Ensure all GLTF arrays are properly initialized
    const ensureArray = (data, defaultValue = []) => {
      return Array.isArray(data) ? data : defaultValue;
    };

    console.log('VRM Export: Creating VRM file with GLTF data:', {
      hasScenes: !!gltfData.scenes,
      hasNodes: !!gltfData.nodes,
      hasMeshes: !!gltfData.meshes,
      hasMaterials: !!gltfData.materials,
      hasBuffers: !!gltfData.buffers,
      bufferCount: gltfData.buffers?.length || 0,
      hasBinaryData: !!binaryData,
      binaryDataSize: binaryData ? binaryData.byteLength : 0
    });

    // Clean up buffer references (remove data URIs as we'll embed in binary chunk)
    const cleanBuffers = ensureArray(gltfData.buffers).map(buffer => ({
      byteLength: buffer.byteLength
      // Remove uri property as data will be in the GLB binary chunk
    }));
    
    // CRITICAL FIX: Keep bufferView references for images, remove data URIs
    // Images in GLB files should reference bufferViews for texture data
    const cleanImages = ensureArray(gltfData.images).map((image, idx) => {
      // If image has bufferView, keep it (this is the proper GLB way)
      if (image.bufferView !== undefined) {
        console.log(`VRM Export: Image ${idx} has bufferView ${image.bufferView}, keeping it`);
        // Remove URI if present, keep bufferView and mimeType
        return {
          bufferView: image.bufferView,
          mimeType: image.mimeType || 'image/png',
          name: image.name
        };
      }
      // If image only has data URI, we need to keep it (not ideal but necessary)
      // The GLTFExporter should have created bufferViews, but if not, keep the URI
      if (image.uri && image.uri.startsWith('data:')) {
        console.warn(`VRM Export: Image ${idx} has data URI but no bufferView, keeping data URI`);
        // Keep the image as-is since there's no bufferView alternative
        // This will make the JSON large, but textures will work
        return image;
      }
      console.warn(`VRM Export: Image ${idx} has neither bufferView nor data URI!`, image);
      return image;
    });
    
    console.log(`VRM Export: Cleaned ${cleanImages.length} images, preserved texture data`);

    // Extract VRM-specific data from extracted VRM if available
    const extractedVRM = vrmData.extractedVRMData;
    const vrmMeta = extractedVRM?.meta || vrmData.metadata || {};
    const vrmHumanoid = extractedVRM?.humanoid;
    const vrmExpressions = extractedVRM?.expressionManager;
    const vrmSpringBones = extractedVRM?.springBoneManager;
    const vrmMaterials = extractedVRM?.materials || [];
    
    // Build humanoid bones array from extracted VRM data
    let humanBones = [];
    if (vrmHumanoid?.humanBones) {
      // Convert humanBones object to array format for VRM 0.0
      for (const [boneName, boneData] of Object.entries(vrmHumanoid.humanBones)) {
        if (boneData?.node) {
          // Find node index for this bone
          const nodeIndex = gltfData.nodes?.findIndex(n => n.name === boneData.node.name);
          if (nodeIndex >= 0) {
            humanBones.push({
              bone: boneName,
              node: nodeIndex,
              useDefaultValues: true
            });
          }
        }
      }
    }
    
    // Build blend shape groups from extracted expressions
    let blendShapeGroups = [];
    if (vrmExpressions?.expressionMap) {
      console.log(`🎭 VRM Export: Processing ${Object.keys(vrmExpressions.expressionMap).length} expressions from VRM data`);
      for (const [expressionName, expression] of Object.entries(vrmExpressions.expressionMap)) {
        if (expression._binds && expression._binds.length > 0) {
          console.log(`🎭 VRM Export: Expression "${expressionName}" has ${expression._binds.length} binds`);
          const binds = expression._binds.map(bind => ({
            mesh: 0, // Simplified - would need proper mesh mapping
            index: bind.index,
            weight: bind.weight * 100
          }));
          
          blendShapeGroups.push({
            name: expressionName,
            presetName: this.getVRM0BlendshapeName(expressionName),
            binds: binds,
            isBinary: expression.isBinary || false
          });
        } else {
          console.warn(`🎭 VRM Export: Expression "${expressionName}" has no binds, skipping`);
        }
      }
    } else {
      console.warn('🎭 VRM Export: No expression manager found in extracted VRM data');
    }
    console.log(`🎭 VRM Export: Created ${blendShapeGroups.length} blend shape groups for export`);

    // Create complete VRM 0.0 GLTF structure with embedded model data
    const vrmFile = {
      asset: {
        version: "2.0",
        generator: "Open3DStudio VRM Exporter"
      },
      extensions: {
        VRM: {
          specVersion: "0.0",
          meta: {
            version: vrmMeta.version || "0.0",
            title: vrmMeta.title || vrmMeta.name || "Open3DStudio Export",
            author: vrmMeta.author || (vrmMeta.authors ? vrmMeta.authors.join(", ") : "Open3DStudio"),
            contactInformation: vrmMeta.contactInformation || "",
            reference: vrmMeta.reference || "",
            texture: vrmData.meta?.texture || -1,
            allowedUserName: vrmMeta.allowedUserName || vrmMeta.avatarPermission || "Everyone",
            violentUssageName: vrmMeta.violentUssageName || (vrmMeta.allowExcessivelyViolentUsage ? "Allow" : "Disallow"),
            sexualUssageName: vrmMeta.sexualUssageName || (vrmMeta.allowExcessivelySexualUsage ? "Allow" : "Disallow"),
            commercialUssageName: vrmMeta.commercialUssageName || (vrmMeta.commercialUsage === "personalProfit" ? "Allow" : "Disallow"),
            otherPermissionUrl: vrmMeta.otherPermissionUrl || "",
            licenseName: vrmMeta.licenseName || vrmMeta.copyrightInformation || "",
            licenseUrl: vrmMeta.licenseUrl || "https://vrm.dev/licenses/1.0/",
            otherLicenseUrl: vrmMeta.otherLicenseUrl || ""
          },
          humanoid: {
            humanBones: humanBones.length > 0 ? humanBones : (vrmData.humanoid?.humanBones || [])
          },
          firstPerson: {
            firstPersonBone: -1,
            firstPersonBoneOffset: { x: 0, y: 0, z: 0 },
            meshAnnotations: [],
            lookAtTypeName: "Bone",
            lookAtHorizontalInner: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
            lookAtHorizontalOuter: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
            lookAtVerticalDown: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 },
            lookAtVerticalUp: { curve: [0, 0, 0, 1, 1, 1, 1, 0], xRange: 0, yRange: 0 }
          },
          expressions: {
            preset: vrmData.expressions?.preset || {},
            custom: vrmData.expressions?.custom || {}
          },
          blendShapeMaster: {
            blendShapeGroups: blendShapeGroups.length > 0 ? blendShapeGroups : (vrmData.blendShapeMaster?.blendShapeGroups || [])
          },
          secondaryAnimation: {
            boneGroups: vrmData.secondaryAnimation?.boneGroups || [],
            colliderGroups: vrmData.secondaryAnimation?.colliderGroups || []
          },
          materialProperties: this.extractMaterialProperties(vrmMaterials, gltfData.materials) || vrmData.materialProperties || []
        }
      },
      extensionsRequired: ["VRM"],
      extensionsUsed: ["VRM"],
      scene: 0,
      scenes: ensureArray(gltfData.scenes, [{ nodes: [0] }]),
      nodes: ensureArray(gltfData.nodes, [{ name: "Root" }]),
      meshes: ensureArray(gltfData.meshes),
      materials: ensureArray(gltfData.materials),
      textures: ensureArray(gltfData.textures),
      images: cleanImages, // Use cleaned images without data URIs
      accessors: ensureArray(gltfData.accessors),
      bufferViews: ensureArray(gltfData.bufferViews),
      buffers: cleanBuffers,
      // CRITICAL: Include skins array - required for VRM skeleton binding
      skins: ensureArray(gltfData.skins)
    };

    // Debug: Log the VRM file structure before conversion
    console.log('VRM Export: VRM file structure:', {
      hasAsset: !!vrmFile.asset,
      hasExtensions: !!vrmFile.extensions,
      hasVRMExtension: !!vrmFile.extensions?.VRM,
      scenesCount: vrmFile.scenes?.length || 0,
      nodesCount: vrmFile.nodes?.length || 0,
      meshesCount: vrmFile.meshes?.length || 0,
      materialsCount: vrmFile.materials?.length || 0,
      buffersCount: vrmFile.buffers?.length || 0,
      skinsCount: vrmFile.skins?.length || 0
    });

    // Convert to proper GLB binary format with embedded binary data
    return this.convertToGLB(vrmFile, gltfData);
  }

  /**
   * Convert VRM data to GLB binary format
   * @param {Object} vrmFile - VRM file data
   * @param {Object} gltfData - Original GLTF data with binary buffers
   * @returns {ArrayBuffer} GLB binary data
   */
  convertToGLB(vrmFile, gltfData = null) {
    // Remove binaryData from vrmFile before sanitizing (it shouldn't be in JSON)
    const { binaryData, ...vrmFileWithoutBinary } = vrmFile;
    
    // Sanitize VRM data to prevent JSON parsing issues
    const sanitizedVRMFile = this.sanitizeVRMData(vrmFileWithoutBinary);
    
    // Convert to JSON string without formatting (compact)
    const jsonString = JSON.stringify(sanitizedVRMFile);
    
    console.log('VRM Export: JSON size before encoding:', jsonString.length, 'characters');
    
    // Check for embedded data URIs in images (they shouldn't be there)
    if (jsonString.includes('data:image')) {
      console.warn('VRM Export: JSON contains data URIs! This will make the file very large.');
      // Count how many data URIs
      const dataUriCount = (jsonString.match(/data:image/g) || []).length;
      console.warn(`VRM Export: Found ${dataUriCount} embedded data URIs in JSON`);
    }
    
    // Validate JSON before proceeding
    try {
      JSON.parse(jsonString);
      console.log('VRM Export: JSON validation successful');
    } catch (error) {
      console.error('VRM Export: JSON validation failed:', error);
      console.error('VRM Export: Invalid JSON at position:', error.message);
      // Log a sample of the JSON around the error position
      if (error.message.includes('position')) {
        const match = error.message.match(/position (\d+)/);
        if (match) {
          const pos = parseInt(match[1]);
          const start = Math.max(0, pos - 100);
          const end = Math.min(jsonString.length, pos + 100);
          console.error('VRM Export: JSON context around error:', jsonString.substring(start, end));
        }
      }
      throw new Error(`Invalid JSON structure: ${error.message}`);
    }
    
    const jsonBuffer = new TextEncoder().encode(jsonString);
    
    // Get actual binary data from parsed GLB
    let binaryBuffer = new ArrayBuffer(0);
    
    // First check if we have binaryData directly from parseGLB
    if (gltfData && gltfData.binaryData) {
      binaryBuffer = gltfData.binaryData;
      console.log('VRM Export: Using binary data from parsed GLB, size:', binaryBuffer.byteLength);
    }
    // Fallback: try to extract from buffers array (for backward compatibility)
    else if (gltfData && gltfData.buffers && gltfData.buffers.length > 0) {
      const buffer = gltfData.buffers[0];
      
      // When binary: false is used, buffers have 'uri' property with data URL
      if (buffer && buffer.uri) {
        console.log('VRM Export: Extracting binary data from data URI');
        // Extract base64 data from data URI
        const base64Data = buffer.uri.split(',')[1];
        const binaryString = atob(base64Data);
        binaryBuffer = new ArrayBuffer(binaryString.length);
        const binaryView = new Uint8Array(binaryBuffer);
        for (let i = 0; i < binaryString.length; i++) {
          binaryView[i] = binaryString.charCodeAt(i);
        }
        console.log('VRM Export: Extracted binary data from URI, size:', binaryBuffer.byteLength);
      }
      // Direct buffer data (if available)
      else if (buffer && buffer.data) {
        binaryBuffer = buffer.data;
        console.log('VRM Export: Using direct binary data, size:', binaryBuffer.byteLength);
      }
    }
    
    // If no binary data found, log error - this shouldn't happen
    if (binaryBuffer.byteLength === 0) {
      console.error('VRM Export: No binary data found in GLTF export! The exported VRM will not contain model geometry.');
      throw new Error('Failed to extract binary buffer data from GLTF export');
    }
    
    // Ensure JSON is padded to 4-byte boundary with space characters (0x20)
    const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
    const paddedJsonBuffer = new Uint8Array(jsonBuffer.length + jsonPadding);
    paddedJsonBuffer.set(jsonBuffer);
    // Fill padding with spaces (0x20) as per GLB spec
    for (let i = jsonBuffer.length; i < paddedJsonBuffer.length; i++) {
      paddedJsonBuffer[i] = 0x20;
    }
    
    // Create GLB header (12 bytes)
    const header = new ArrayBuffer(12);
    const headerView = new DataView(header);
    
    // GLB magic number (0x46546C67 = "glTF")
    headerView.setUint32(0, 0x46546C67, true);
    // Version (2)
    headerView.setUint32(4, 2, true);
    // Total length (will be updated)
    headerView.setUint32(8, 0, true);
    
    // JSON chunk header (8 bytes)
    const jsonChunkHeader = new ArrayBuffer(8);
    const jsonChunkView = new DataView(jsonChunkHeader);
    jsonChunkView.setUint32(0, paddedJsonBuffer.length, true);
    jsonChunkView.setUint32(4, 0x4E4F534A, true); // "JSON"
    
    // Binary chunk header (8 bytes) - only if we have binary data
    let binaryChunkHeader = null;
    if (binaryBuffer.byteLength > 0) {
      binaryChunkHeader = new ArrayBuffer(8);
      const binaryChunkView = new DataView(binaryChunkHeader);
      binaryChunkView.setUint32(0, binaryBuffer.byteLength, true);
      binaryChunkView.setUint32(4, 0x004E4942, true); // "BIN\0"
    }
    
    // Calculate total length
    const totalLength = header.byteLength + 
                       jsonChunkHeader.byteLength + 
                       paddedJsonBuffer.length + 
                       (binaryChunkHeader ? binaryChunkHeader.byteLength : 0) + 
                       binaryBuffer.byteLength;
    
    // Create final GLB buffer
    const glbBuffer = new ArrayBuffer(totalLength);
    const glbView = new Uint8Array(glbBuffer);
    
    // Copy header
    glbView.set(new Uint8Array(header), 0);
    
    // Update total length in header
    new DataView(glbBuffer).setUint32(8, totalLength, true);
    
    let offset = header.byteLength;
    
    // Copy JSON chunk header
    glbView.set(new Uint8Array(jsonChunkHeader), offset);
    offset += jsonChunkHeader.byteLength;
    
    // Copy JSON data
    glbView.set(paddedJsonBuffer, offset);
    offset += paddedJsonBuffer.length;
    
    // Copy binary chunk header and data if available
    if (binaryChunkHeader && binaryBuffer.byteLength > 0) {
      glbView.set(new Uint8Array(binaryChunkHeader), offset);
      offset += binaryChunkHeader.byteLength;
      
      // Copy binary data
      glbView.set(new Uint8Array(binaryBuffer), offset);
    }
    
    console.log('VRM Export: Final GLB size:', glbBuffer.byteLength);
    return glbBuffer;
  }


  /**
   * Sanitize VRM data to prevent JSON parsing issues
   * @param {Object} vrmFile - VRM file data
   * @returns {Object} Sanitized VRM file data
   */
  sanitizeVRMData(vrmFile) {
    // Deep clone the VRM file to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(vrmFile));
    
    // Recursively sanitize all string values
    const sanitizeObject = (obj) => {
      if (typeof obj === 'string') {
        // Remove any non-printable characters and control characters
        return obj.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
      } else if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      } else if (obj && typeof obj === 'object') {
        const sanitizedObj = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitizedObj[key] = sanitizeObject(value);
        }
        return sanitizedObj;
      }
      return obj;
    };
    
    return sanitizeObject(sanitized);
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
   * Parse a GLB ArrayBuffer to extract JSON and binary data
   * @param {ArrayBuffer} glbArrayBuffer - The GLB file as ArrayBuffer
   * @returns {Object} Object containing the parsed GLTF JSON and binary data
   */
  parseGLB(glbArrayBuffer) {
    const dataView = new DataView(glbArrayBuffer);
    
    // Read GLB header
    const magic = dataView.getUint32(0, true);
    const version = dataView.getUint32(4, true);
    const length = dataView.getUint32(8, true);
    
    if (magic !== 0x46546C67) { // "glTF" in ASCII
      throw new Error('Invalid GLB file: wrong magic number');
    }
    
    console.log('VRM Export: Parsing GLB - version:', version, 'length:', length);
    
    let offset = 12; // After header
    let jsonData = null;
    let binaryData = null;
    
    // Read chunks
    while (offset < length) {
      const chunkLength = dataView.getUint32(offset, true);
      const chunkType = dataView.getUint32(offset + 4, true);
      offset += 8;
      
      if (chunkType === 0x4E4F534A) { // "JSON" chunk
        const jsonBytes = new Uint8Array(glbArrayBuffer, offset, chunkLength);
        const jsonString = new TextDecoder().decode(jsonBytes);
        jsonData = JSON.parse(jsonString);
        console.log('VRM Export: Found JSON chunk, size:', chunkLength);
      } else if (chunkType === 0x004E4942) { // "BIN\0" chunk
        binaryData = glbArrayBuffer.slice(offset, offset + chunkLength);
        console.log('VRM Export: Found BIN chunk, size:', chunkLength);
      }
      
      offset += chunkLength;
    }
    
    if (!jsonData) {
      throw new Error('Invalid GLB file: no JSON chunk found');
    }
    
    // Return the parsed data
    return {
      ...jsonData,
      binaryData: binaryData
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
   * Preserve model transform during export to maintain correct orientation and positioning
   * @param {Object} model - Model to process
   */
  preserveModelTransform(model) {
    console.log('🔄 VRM Export: Preserving model transform...');
    
    // Store original model transform
    const originalTransform = {
      position: model.position.clone(),
      rotation: model.rotation.clone(),
      quaternion: model.quaternion.clone(),
      scale: model.scale.clone()
    };

    // Ensure model is properly oriented (facing forward)
    const modelForward = new THREE.Vector3();
    model.getWorldDirection(modelForward);
    
    // If model is facing backwards, we need to preserve this orientation in the export
    if (modelForward.z > 0.5) {
      console.log('🔄 Export: Model is facing backwards, preserving this orientation');
    } else {
      console.log('✅ Export: Model is facing forward, preserving this orientation');
    }

    // Ensure model is positioned correctly (feet on ground)
    const box = new THREE.Box3().setFromObject(model);
    if (!box.isEmpty() && isFinite(box.min.y) && isFinite(box.max.y)) {
      const modelBottom = box.min.y;
      if (modelBottom > 0) {
        console.log('🔄 Export: Adjusting model position to ensure feet touch ground');
        model.position.y -= modelBottom;
      }
    }

    // Store the transform in userData for reference
    model.userData.originalTransform = originalTransform;
    model.userData.exportTransform = {
      position: model.position.clone(),
      rotation: model.rotation.clone(),
      quaternion: model.quaternion.clone(),
      scale: model.scale.clone()
    };

    console.log('✅ VRM Export: Model transform preserved');
  }

  /**
   * Extract VRM data from a loaded VRM model
   * @param {Object} model - Three.js model (potentially with VRM data)
   * @returns {Object|null} Extracted VRM data or null
   */
  extractVRMData(model) {
    // Check if model has VRM data in userData
    let vrm = model.userData?.vrm;
    
    // Also check children for VRM data (common in loaded VRM files)
    if (!vrm && model.children) {
      for (const child of model.children) {
        if (child.userData?.vrm) {
          vrm = child.userData.vrm;
          break;
        }
      }
    }
    
    if (!vrm) {
      console.log('VRM Export: No VRM data found in model');
      return null;
    }
    
    return vrm;
  }

  /**
   * Convert VRM 1.0 expression names to VRM 0.0 format
   * @param {string} expressionName - VRM 1.0 expression name
   * @returns {string} VRM 0.0 expression name
   */
  getVRM0BlendshapeName(expressionName) {
    const nameMap = {
      'happy': 'joy',
      'sad': 'sorrow',
      'relaxed': 'fun',
      'aa': 'a',
      'ih': 'i',
      'ou': 'u',
      'ee': 'e',
      'oh': 'o'
    };
    
    return nameMap[expressionName] || expressionName;
  }

  /**
   * Extract material properties from VRM materials for VRM 0.0 export
   * @param {Array} vrmMaterials - VRM materials from source model
   * @param {Array} gltfMaterials - GLTF materials from export
   * @returns {Array} Material properties for VRM 0.0
   */
  extractMaterialProperties(vrmMaterials, gltfMaterials) {
    if (!vrmMaterials || vrmMaterials.length === 0) {
      return [];
    }

    const materialProperties = [];
    
    // Map VRM materials to exported GLTF materials
    vrmMaterials.forEach((vrmMat, index) => {
      // Check if this is an MToon material
      const isMToon = vrmMat.type === 'ShaderMaterial' || vrmMat.isMToonMaterial;
      
      if (isMToon) {
        // Extract MToon properties
        const mtoonProps = {
          name: vrmMat.name || `Material_${index}`,
          shader: "VRM/MToon",
          renderQueue: 2000,
          keywordMap: {
            _NORMALMAP: !!vrmMat.normalMap,
            MTOON_OUTLINE_COLOR_FIXED: true,
            MTOON_OUTLINE_WIDTH_WORLD: true
          },
          tagMap: {
            RenderType: vrmMat.transparent ? "TransparentCutout" : "Opaque"
          },
          floatProperties: {
            _ShadeShift: vrmMat.uniforms?.shadeShift?.value || 0,
            _ShadeToony: vrmMat.uniforms?.shadeToony?.value || 0.9,
            _ShadingGradeRate: vrmMat.uniforms?.shadingGradeRate?.value || 1.0,
            _DstBlend: 0,
            _Cutoff: vrmMat.uniforms?.cutoff?.value || 0.5
          },
          vectorProperties: {
            _Color: vrmMat.color ? [vrmMat.color.r, vrmMat.color.g, vrmMat.color.b, 1.0] : [1, 1, 1, 1],
            _ShadeColor: vrmMat.uniforms?.shadeColorFactor?.value ? 
              [vrmMat.uniforms.shadeColorFactor.value.r, vrmMat.uniforms.shadeColorFactor.value.g, vrmMat.uniforms.shadeColorFactor.value.b, 1.0] :
              [0.97, 0.81, 0.86, 1],
            _EmissionColor: [0, 0, 0, 1],
            _OutlineColor: [0, 0, 0, 1],
            _RimColor: [0, 0, 0, 1]
          },
          textureProperties: {}
        };
        
        // Map texture indices if they exist
        if (vrmMat.map) {
          mtoonProps.textureProperties._MainTex = index;
        }
        if (vrmMat.userData?.shadeTexture || vrmMat.uniforms?.shadeMultiplyTexture) {
          mtoonProps.textureProperties._ShadeTexture = index;
        }
        
        materialProperties.push(mtoonProps);
      } else {
        // Standard material
        materialProperties.push({
          name: vrmMat.name || `Material_${index}`,
          shader: "VRM_USE_GLTFSHADER"
        });
      }
    });
    
    return materialProperties;
  }

  /**
   * Create default humanoid bones structure for VRM
   * @param {Object} model - Three.js model to analyze
   * @returns {Object} Humanoid bones mapping
   */
  createDefaultHumanoidBones(model) {
    const humanoidBones = [];
    
    // Standard VRM humanoid bone names
    const standardBones = [
      'hips', 'spine', 'chest', 'neck', 'head',
      'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
      'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
      'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
      'leftEye', 'rightEye', 'jaw'
    ];

    // Try to find bones in the model
    const foundBones = new Map();
    model.traverse((child) => {
      if (child.isBone) {
        const boneName = child.name.toLowerCase();
        // Try to match with standard bone names
        for (const standardBone of standardBones) {
          if (boneName.includes(standardBone.toLowerCase()) || 
              standardBone.toLowerCase().includes(boneName)) {
            foundBones.set(standardBone, child);
            break;
          }
        }
      }
    });

    // Create humanoid bones array (VRM 0.0 format)
    foundBones.forEach((bone, boneName) => {
      humanoidBones.push({
        bone: boneName,
        node: 0, // Use valid node index (0 for root node)
        position: {
          x: bone.position.x,
          y: bone.position.y,
          z: bone.position.z
        },
        rotation: {
          x: bone.rotation.x,
          y: bone.rotation.y,
          z: bone.rotation.z,
          order: bone.rotation.order
        },
        scale: {
          x: bone.scale.x,
          y: bone.scale.y,
          z: bone.scale.z
        }
      });
    });

    return humanoidBones;
  }

  /**
   * Sanitize model for export by removing circular references
   * @param {Object} model - Three.js model to sanitize
   * @returns {Object} Sanitized model
   */
  sanitizeModelForExport(model) {
    // Instead of cloning, create a new Group and copy only essential properties
    const sanitized = new THREE.Group();
    sanitized.name = model.name || 'VRM_Export';
    sanitized.position.copy(model.position);
    sanitized.rotation.copy(model.rotation);
    sanitized.scale.copy(model.scale);
    sanitized.visible = model.visible;
    
    // Copy children without circular references
    model.traverse((child) => {
      if (child === model) return; // Skip the root model itself
      
      let sanitizedChild;
      
      if (child.isMesh) {
        sanitizedChild = new THREE.Mesh(child.geometry, child.material);
      } else if (child.isBone) {
        sanitizedChild = new THREE.Bone();
      } else if (child.isGroup) {
        sanitizedChild = new THREE.Group();
      } else {
        sanitizedChild = new THREE.Object3D();
      }
      
      // Copy essential properties
      sanitizedChild.name = child.name;
      sanitizedChild.position.copy(child.position);
      sanitizedChild.rotation.copy(child.rotation);
      sanitizedChild.scale.copy(child.scale);
      sanitizedChild.visible = child.visible;
      
      // Clean userData
      if (child.userData) {
        sanitizedChild.userData = {};
        for (const [key, value] of Object.entries(child.userData)) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            sanitizedChild.userData[key] = value;
          }
        }
      }
      
      // Add to sanitized model
      sanitized.add(sanitizedChild);
    });
    
    return sanitized;
  }

  /**
   * Sanitize data structure to remove circular references
   * @param {Object} obj - Object to sanitize
   * @param {Set} seen - Set of already processed objects
   * @returns {Object} Sanitized object
   */
  sanitizeForJSON(obj, seen = new Set()) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (seen.has(obj)) {
      return '[Circular Reference]';
    }

    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeForJSON(item, seen));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip problematic properties that often contain circular references
      if (key === 'userData' || key === 'parent' || key === 'children' || 
          key === 'scene' || key === 'object' || key === 'vrm') {
        continue;
      }

      // Handle Three.js specific objects
      if (value && typeof value === 'object') {
        if (value.isVector3) {
          sanitized[key] = { x: value.x, y: value.y, z: value.z };
        } else if (value.isEuler) {
          sanitized[key] = { x: value.x, y: value.y, z: value.z, order: value.order };
        } else if (value.isQuaternion) {
          sanitized[key] = { x: value.x, y: value.y, z: value.z, w: value.w };
        } else if (value.isMatrix4) {
          sanitized[key] = value.elements ? [...value.elements] : '[Matrix4]';
        } else if (value.isColor) {
          sanitized[key] = { r: value.r, g: value.g, b: value.b };
        } else if (value.isBone || value.isMesh || value.isObject3D) {
          // For Three.js objects, only include essential properties
          sanitized[key] = {
            name: value.name || '',
            type: value.type || '',
            uuid: value.uuid || '',
            visible: value.visible,
            position: value.position ? { x: value.position.x, y: value.position.y, z: value.position.z } : null,
            rotation: value.rotation ? { x: value.rotation.x, y: value.rotation.y, z: value.rotation.z, order: value.rotation.order } : null,
            scale: value.scale ? { x: value.scale.x, y: value.scale.y, z: value.scale.z } : null
          };
        } else {
          sanitized[key] = this.sanitizeForJSON(value, seen);
        }
      } else {
        sanitized[key] = value;
      }
    }

    seen.delete(obj);
    return sanitized;
  }

  /**
   * Create default expressions for VRM
   * @returns {Object} Default expressions mapping
   */
  createDefaultExpressions() {
    const expressions = {
      // Basic expressions
      'happy': {
        name: 'Happy',
        preset: 'happy',
        morphTargets: []
      },
      'angry': {
        name: 'Angry',
        preset: 'angry',
        morphTargets: []
      },
      'sad': {
        name: 'Sad',
        preset: 'sad',
        morphTargets: []
      },
      'surprised': {
        name: 'Surprised',
        preset: 'surprised',
        morphTargets: []
      },
      'relaxed': {
        name: 'Relaxed',
        preset: 'relaxed',
        morphTargets: []
      },
      // Visemes
      'aa': {
        name: 'A',
        preset: 'aa',
        morphTargets: []
      },
      'ih': {
        name: 'I',
        preset: 'ih',
        morphTargets: []
      },
      'ou': {
        name: 'U',
        preset: 'ou',
        morphTargets: []
      },
      'ee': {
        name: 'E',
        preset: 'ee',
        morphTargets: []
      },
      'oh': {
        name: 'O',
        preset: 'oh',
        morphTargets: []
      }
    };

    return expressions;
  }

  /**
   * Convert blend shapes to VRM blendShapeGroups format
   * @param {Array} blendShapes - Extracted blend shapes
   * @returns {Array} VRM blend shape groups
   */
  convertBlendShapesToVRM(blendShapes) {
    const blendShapeGroups = [];
    
    // VRM preset blend shape names mapping
    const presetNames = {
      'happy': 'joy',
      'angry': 'angry',
      'sad': 'sorrow',
      'surprised': 'fun',
      'relaxed': 'neutral',
      'blink': 'blink',
      'blinkLeft': 'blink_l',
      'blinkRight': 'blink_r',
      'aa': 'a',
      'ih': 'i',
      'ou': 'u',
      'ee': 'e',
      'oh': 'o'
    };

    blendShapes.forEach(blendShape => {
      // Check if this is a preset blend shape
      const presetName = presetNames[blendShape.name.toLowerCase()] || 'unknown';
      
      blendShapeGroups.push({
        name: blendShape.name,
        presetName: presetName,
        binds: blendShape.binds || [],
        isBinary: false,
        materialValues: [],
        overrideBlink: 'none',
        overrideLookAt: 'none',
        overrideMouth: 'none'
      });
    });

    console.log(`🔄 Converted ${blendShapeGroups.length} blend shapes to VRM format`);
    return blendShapeGroups;
  }

  /**
   * Extract blend shapes and morph targets from model
   * @param {Object} model - Three.js model
   * @returns {Array} Array of blend shape data
   */
  extractBlendShapes(model) {
    const blendShapes = [];
    const processedNames = new Set();
    let totalBlendShapes = 0;

    if (!model) return blendShapes;

    console.log('🔄 VRM Export: Extracting blend shapes...');

    // Traverse model to find all meshes with morph targets
    model.traverse((child) => {
      if (child.isMesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
        console.log(`🔍 Found mesh with ${child.morphTargetInfluences.length} morph targets: ${child.name}`);
        totalBlendShapes += child.morphTargetInfluences.length;
        
        // Ensure morph targets are properly initialized
        for (let i = 0; i < child.morphTargetInfluences.length; i++) {
          if (child.morphTargetInfluences[i] === undefined) {
            child.morphTargetInfluences[i] = 0;
          }
        }
        
        if (child.morphTargetDictionary) {
          const morphTargetNames = Object.keys(child.morphTargetDictionary);
          console.log(`📋 Morph target dictionary has ${morphTargetNames.length} entries`);
          
          morphTargetNames.forEach(morphName => {
            if (!processedNames.has(morphName)) {
              const morphIndex = child.morphTargetDictionary[morphName];
              
              blendShapes.push({
                name: morphName,
                mesh: child.name,
                index: morphIndex,
                weight: child.morphTargetInfluences[morphIndex] || 0,
                isActive: (child.morphTargetInfluences[morphIndex] || 0) > 0,
                // Store morph target data for VRM export
                binds: [{
                  mesh: 0, // Will be updated during GLTF processing
                  index: morphIndex,
                  weight: 100 // VRM uses 0-100 scale
                }]
              });
              
              processedNames.add(morphName);
              console.log(`✅ Added blend shape: ${morphName} (index: ${morphIndex}, weight: ${child.morphTargetInfluences[morphIndex] || 0})`);
            }
          });
        } else {
          // Handle meshes without morphTargetDictionary
          console.log(`⚠️ Mesh "${child.name}" has morph targets but no dictionary`);
          for (let i = 0; i < child.morphTargetInfluences.length; i++) {
            const morphName = `morphTarget_${i}`;
            if (!processedNames.has(morphName)) {
              blendShapes.push({
                name: morphName,
                mesh: child.name,
                index: i,
                weight: child.morphTargetInfluences[i] || 0,
                isActive: (child.morphTargetInfluences[i] || 0) > 0,
                binds: [{
                  mesh: 0,
                  index: i,
                  weight: 100
                }]
              });
              processedNames.add(morphName);
            }
          }
        }
      }
    });

    console.log(`🎭 Total blend shapes extracted: ${blendShapes.length} from ${totalBlendShapes} morph targets`);
    
    // Store blend shape count in model userData for reference
    model.userData.blendShapeCount = totalBlendShapes;
    model.userData.extractedBlendShapes = blendShapes;
    
    return blendShapes;
  }

  /**
   * Extract all textures from model materials
   * @param {Object} model - Three.js model
   * @returns {Array} Array of texture data
   */
  extractTextures(model) {
    const textures = [];
    const processedTextures = new Set();

    if (!model) return textures;

    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach(material => {
          // Check all possible texture maps
          const textureProperties = [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap', 
            'emissiveMap', 'aoMap', 'lightMap', 'bumpMap',
            'displacementMap', 'alphaMap', 'envMap'
          ];
          
          textureProperties.forEach(prop => {
            const texture = material[prop];
            if (texture && texture.image && !processedTextures.has(texture.uuid)) {
              textures.push({
                uuid: texture.uuid,
                name: texture.name || `${prop}_texture`,
                type: prop,
                image: texture.image,
                wrapS: texture.wrapS,
                wrapT: texture.wrapT,
                magFilter: texture.magFilter,
                minFilter: texture.minFilter,
                flipY: texture.flipY
              });
              processedTextures.add(texture.uuid);
              console.log(`🖼️ Extracted texture: ${texture.name || prop} from material: ${material.name}`);
            }
          });
        });
      }
    });

    console.log(`🎨 Total textures extracted: ${textures.length}`);
    return textures;
  }

  /**
   * Cleanup
   */
  dispose() {
    this.eventListeners.clear();
  }
}