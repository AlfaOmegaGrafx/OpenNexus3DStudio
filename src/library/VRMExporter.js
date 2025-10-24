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

      // Extract blend shapes and morph targets from model before export
      const extractedBlendShapes = this.extractBlendShapes(model);
      console.log('VRM Export: Extracted blend shapes:', extractedBlendShapes.length);

      // Create a scene and export as GLTF first
      const scene = new THREE.Scene();
      scene.add(model);
      
      // Export as standard GLTF with proper binary data
      const gltfData = await this.gltfExporter.parseAsync(scene, {
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
        skins: gltfData.skins?.length || 0,
        animations: gltfData.animations?.length || 0
      });

      // Debug binary data
      if (gltfData.buffers && gltfData.buffers.length > 0) {
        const buffer = gltfData.buffers[0];
        console.log('VRM Export: Buffer details:', {
          hasData: !!buffer.data,
          dataType: buffer.data ? buffer.data.constructor.name : 'no data',
          dataSize: buffer.data ? buffer.data.byteLength : 0,
          bufferType: buffer.type || 'unknown'
        });
      } else {
        console.warn('VRM Export: No buffers found in GLTF data');
      }

      // Create VRM 0.0 file structure manually
      const glbData = await this.createVRM0File(gltfData, {
        vrmVersion,
        metadata,
        humanoidBones,
        expressions,
        materials,
        screenshot,
        blendShapes: extractedBlendShapes
      });

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
   * Create VRM 0.0 file structure
   * @param {Object} gltfData - GLTF data from Three.js exporter
   * @param {Object} options - VRM options
   */
  async createVRM0File(gltfData, options = {}) {
    // Ensure GLTF data has required arrays
    const ensureArray = (arr) => Array.isArray(arr) ? arr : [];
    
    // Create VRM 0.0 extensions
    const vrmExtensions = {
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

    // Create VRM GLTF structure
    const vrmGltf = {
      asset: {
        version: "2.0",
        generator: "Open3DStudio VRM Exporter"
      },
      scene: 0,
      scenes: ensureArray(gltfData.scenes),
      nodes: ensureArray(gltfData.nodes),
      meshes: ensureArray(gltfData.meshes),
      materials: ensureArray(gltfData.materials),
      textures: ensureArray(gltfData.textures),
      images: ensureArray(gltfData.images),
      accessors: ensureArray(gltfData.accessors),
      bufferViews: ensureArray(gltfData.bufferViews),
      buffers: ensureArray(gltfData.buffers),
      extensions: {
        VRM: vrmExtensions
      },
      extensionsRequired: ["VRM"],
      extensionsUsed: ["VRM"]
    };

    // Convert to GLB format
    return await this.convertToGLB(vrmGltf, gltfData);
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
      buffers: gltfData.buffers || [],
      // CRITICAL: Include skins array for skeleton/bone data
      skins: gltfData.skins || [],
      // Also include animations if present
      animations: gltfData.animations || []
    };

    // Convert to GLB format
    return this.convertToGLB(vrmFile, gltfData);
  }

  /**
   * Create proper VRM 0.0 file structure
   * 
   * CRITICAL: This method must include ALL GLTF arrays, especially:
   * - skins: Contains skeleton/bone data. Without this, the GLTFLoader will fail
   *   with "Cannot read properties of undefined (reading '0')" when loading skin data.
   * - animations: Contains animation data for the model.
   * 
   * The VRM file format is essentially GLTF 2.0 with a VRM extension, so all
   * standard GLTF arrays must be preserved for the file to load correctly.
   * 
   * @param {Object} gltfData - GLTF data from Three.js exporter
   * @param {Object} vrmData - VRM metadata
   * @returns {ArrayBuffer} VRM 0.0 file data
   */
  createVRM0File(gltfData, vrmData) {
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
        hasSkins: !!gltfData.skins,
        hasAnimations: !!gltfData.animations,
        bufferCount: gltfData.buffers?.length || 0,
        skinsCount: gltfData.skins?.length || 0,
        animationsCount: gltfData.animations?.length || 0,
        blendShapesCount: vrmData.blendShapes?.length || 0
      });

      // Convert extracted blend shapes to VRM blendShapeGroups format
      const blendShapeGroups = this.convertBlendShapesToVRM(vrmData.blendShapes || []);
      console.log('VRM Export: Converted blend shape groups:', blendShapeGroups.length);
      
      console.log('VRM Export: Creating VRM file with GLTF data:', {
        hasScenes: !!gltfData.scenes,
        hasNodes: !!gltfData.nodes,
        hasMeshes: !!gltfData.meshes,
        hasMaterials: !!gltfData.materials,
        hasBuffers: !!gltfData.buffers,
      hasSkins: !!gltfData.skins,
      hasAnimations: !!gltfData.animations,
      bufferCount: gltfData.buffers?.length || 0,
      skinsCount: gltfData.skins?.length || 0,
      animationsCount: gltfData.animations?.length || 0
    });

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
            version: "0.0",
            title: vrmData.meta?.title || "Open3DStudio Export",
            author: vrmData.meta?.author || "Open3DStudio",
            contactInformation: vrmData.meta?.contactInformation || "",
            reference: vrmData.meta?.reference || "",
            texture: vrmData.meta?.texture || -1,
            allowedUserName: vrmData.meta?.allowedUserName || "Everyone",
            violentUssageName: vrmData.meta?.violentUssageName || "Disallow",
            sexualUssageName: vrmData.meta?.sexualUssageName || "Disallow",
            commercialUssageName: vrmData.meta?.commercialUssageName || "Allow",
            otherPermissionUrl: vrmData.meta?.otherPermissionUrl || "",
            licenseUrl: vrmData.meta?.licenseUrl || "",
            otherLicenseUrl: vrmData.meta?.otherLicenseUrl || ""
          },
          humanoid: {
            humanBones: vrmData.humanoid?.humanBones || []
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
          materialProperties: vrmData.materialProperties || []
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
      images: ensureArray(gltfData.images),
      accessors: ensureArray(gltfData.accessors),
      bufferViews: ensureArray(gltfData.bufferViews),
      buffers: ensureArray(gltfData.buffers),
      // CRITICAL: Include skins array for skeleton/bone data
      skins: ensureArray(gltfData.skins),
      // Also include animations if present
      animations: ensureArray(gltfData.animations)
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
      skinsCount: vrmFile.skins?.length || 0,
      animationsCount: vrmFile.animations?.length || 0
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
    // Sanitize VRM data to prevent JSON parsing issues
    const sanitizedVRMFile = this.sanitizeVRMData(vrmFile);
    
    // Convert to JSON string with proper formatting
    const jsonString = JSON.stringify(sanitizedVRMFile, null, 0);
    
    // Additional validation: Check for any non-printable characters in JSON
    const hasNonPrintableChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(jsonString);
    if (hasNonPrintableChars) {
      console.warn('VRM Export: JSON contains non-printable characters, cleaning...');
      // Remove non-printable characters except for valid JSON whitespace
      const cleanedJsonString = jsonString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
      console.log('VRM Export: Cleaned JSON length:', cleanedJsonString.length, 'vs original:', jsonString.length);
    }
    
    // Validate JSON before proceeding
    try {
      const parsedJson = JSON.parse(jsonString);
      console.log('VRM Export: JSON validation successful, length:', jsonString.length);
    } catch (error) {
      console.error('VRM Export: JSON validation failed:', error);
      console.error('VRM Export: Invalid JSON at position:', error.message);
      console.error('VRM Export: JSON string around error position:', 
        jsonString.substring(Math.max(0, error.message.match(/\d+/)?.[0] - 50 || 0), 
        (error.message.match(/\d+/)?.[0] || 0) + 50));
      throw new Error(`Invalid JSON structure: ${error.message}`);
    }
    
    const jsonBuffer = new TextEncoder().encode(jsonString);
    
    // Get actual binary data from GLTF export
    let binaryBuffer = new ArrayBuffer(0);
    if (gltfData && gltfData.buffers && gltfData.buffers.length > 0) {
      const buffer = gltfData.buffers[0];
      if (buffer && buffer.data) {
        // Validate that the buffer data is actually an ArrayBuffer
        if (buffer.data instanceof ArrayBuffer) {
          binaryBuffer = buffer.data;
          console.log('VRM Export: Using actual binary data, size:', binaryBuffer.byteLength);
        } else {
          console.warn('VRM Export: Buffer data is not ArrayBuffer, type:', typeof buffer.data, buffer.data.constructor.name);
          // Try to convert to ArrayBuffer if it's a Uint8Array
          if (buffer.data instanceof Uint8Array) {
            binaryBuffer = buffer.data.buffer.slice(buffer.data.byteOffset, buffer.data.byteOffset + buffer.data.byteLength);
            console.log('VRM Export: Converted Uint8Array to ArrayBuffer, size:', binaryBuffer.byteLength);
          }
        }
      }
    }
    
    // If no binary data from GLTF, create empty buffer (don't add fake data)
    if (binaryBuffer.byteLength === 0) {
      console.log('VRM Export: No binary data found in GLTF, creating empty buffer');
      binaryBuffer = new ArrayBuffer(0);
    }
    
    // Ensure JSON is padded to 4-byte boundary
    const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
    const paddedJsonBuffer = new Uint8Array(jsonBuffer.length + jsonPadding);
    paddedJsonBuffer.set(jsonBuffer);
    
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
                       (binaryBuffer.byteLength > 0 ? binaryBuffer.byteLength : 0);
    
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
      offset += binaryBuffer.byteLength;
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

    if (!model) return blendShapes;

    // Traverse model to find all meshes with morph targets
    model.traverse((child) => {
      if (child.isMesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
        console.log(`🔍 Found mesh with ${child.morphTargetInfluences.length} morph targets: ${child.name}`);
        
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
                // Store morph target data for VRM export
                binds: [{
                  mesh: 0, // Will be updated during GLTF processing
                  index: morphIndex,
                  weight: 100 // VRM uses 0-100 scale
                }]
              });
              
              processedNames.add(morphName);
              console.log(`✅ Added blend shape: ${morphName} (index: ${morphIndex})`);
            }
          });
        }
      }
    });

    console.log(`🎭 Total blend shapes extracted: ${blendShapes.length}`);
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