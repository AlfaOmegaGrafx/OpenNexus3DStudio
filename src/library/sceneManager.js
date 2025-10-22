/**
 * SceneManager - Central orchestrator for 3D scene management
 * Similar to CharacterManager in CharacterStudio, but focused on 3D AIGC workflows
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GLBExporter } from './glbExporter.js';
import { VRMLoader } from './vrmLoader.js';
import { VRMExporter } from './VRMExporter.js';
import { VRMExpressionPresetName, VRMLoaderPlugin } from '@pixiv/three-vrm';
import { sharedHDRManager } from './sharedHDRManager.js';

export class SceneManager {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
      this.currentModel = null;
      this.renderMode = 'solid';
      this.isInitialized = false;
      this.selectedBoneName = null;
      
      // Multi-selection support
      this.selectedBones = new Set();
      this.boundingBoxSelection = {
        isActive: false,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        boxElement: null
      };
      
      // Loaders
    this.gltfLoader = new GLTFLoader();
    // Register VRM plugin so GLTFLoader can understand VRM extensions
    if (typeof this.gltfLoader.register === 'function') {
      try {
        this.gltfLoader.register((parser) => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true }));
      } catch (e) {
        console.warn('Failed to register VRMLoaderPlugin on SceneManager GLTFLoader:', e);
      }
    }
    this.objLoader = new OBJLoader();
    this.fbxLoader = new FBXLoader();
    
    // Event listeners
    this.eventListeners = new Map();
    
    // GLB Exporter
    this.glbExporter = new GLBExporter();
    
    // VRM Loader and Exporter
    this.vrmLoader = new VRMLoader();
    this.vrmExporter = new VRMExporter();
  }

  /**
   * Initialize the 3D scene
   * @param {HTMLElement} container - Container element for the scene
   * @param {Object} options - Scene configuration options
   */
  async initialize(container, options = {}) {
    try {
      const {
        width = container.clientWidth,
        height = container.clientHeight,
        backgroundColor = 0x1a1a1a,
        enableShadows = true,
        enableAntialias = true
      } = options;

      // Create scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(backgroundColor);

      // Create camera
      this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      this.camera.position.set(0, 1.5, 3); // Position camera to look at a human-sized model

      // Create renderer
      this.renderer = new THREE.WebGLRenderer({ 
        antialias: enableAntialias,
        alpha: true
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(window.devicePixelRatio);
      
      if (enableShadows) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      // Create controls
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;

      // Setup lighting
      this.setupLighting();

      // Setup HDR environment map
      this.setupHDREnvironment();

      // Ground plane removed - user doesn't want it

      // Add helpers
      this.addHelpers();

      // Mount renderer
      container.appendChild(this.renderer.domElement);

      // Setup resize handler
      this.setupResizeHandler();

      this.isInitialized = true;
      this.emit('initialized', { scene: this.scene, camera: this.camera, renderer: this.renderer });
      
      return { scene: this.scene, camera: this.camera, renderer: this.renderer, controls: this.controls };
    } catch (error) {
      console.error('Failed to initialize scene:', error);
      throw error;
    }
  }

  /**
   * Setup scene lighting
   */
  setupLighting() {
    // Enhanced Ambient light - much brighter overall illumination
    const ambientLight = new THREE.AmbientLight(0x606060, 1.2);
    this.scene.add(ambientLight);

    // Additional soft ambient light for extra brightness
    const softAmbientLight = new THREE.AmbientLight(0x808080, 0.6);
    this.scene.add(softAmbientLight);

    // 3-Point Lighting Setup
    
    // 1. Key Light (Main light) - Front and slightly to the right
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(5, 8, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    this.scene.add(keyLight);

    // 2. Fill Light (Softer light) - Front and slightly to the left
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-3, 5, 2);
    this.scene.add(fillLight);

    // 3. Rim Light (Back light) - Behind the model
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
    rimLight.position.set(-2, 3, -5);
    this.scene.add(rimLight);

    // Additional accent light for better illumination
    const accentLight = new THREE.PointLight(0xffffff, 0.7, 20);
    accentLight.position.set(0, 10, 0);
    this.scene.add(accentLight);

    // Soft hemisphere light for natural ambient lighting
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x362d1d, 0.8);
    hemisphereLight.position.set(0, 10, 0);
    this.scene.add(hemisphereLight);
  }

  /**
   * Setup HDR environment map using shared manager
   */
  setupHDREnvironment() {
    // Register this scene with the shared HDR manager
    sharedHDRManager.registerScene(this.scene);
    
    // Load HDR if not already loaded
    if (!sharedHDRManager.isHDRLoaded()) {
      sharedHDRManager.loadHDR();
    }
  }

  /**
   * Load a custom HDR environment map
   * @param {string} hdrPath - Path to the HDR file
   * @param {number} intensity - Environment intensity (default: 0.5)
   */
  loadHDREnvironment(hdrPath, intensity = 0.5) {
    if (!this.scene) {
      console.error('Scene not initialized. Call initialize() first.');
      return;
    }

    const rgbeLoader = new RGBELoader();
    
    rgbeLoader.load(hdrPath, (hdrTexture) => {
      // Configure the HDR texture
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
      hdrTexture.colorSpace = THREE.LinearSRGBColorSpace;
      
      // Set as scene environment
      this.scene.environment = hdrTexture;
      this.scene.environmentIntensity = intensity;
      
      console.log(`HDR environment map loaded: ${hdrPath}`);
      this.emit('environmentChanged', { path: hdrPath, intensity });
    }, undefined, (error) => {
      console.error(`Failed to load HDR environment map: ${hdrPath}`, error);
    });
  }

  /**
   * Add scene helpers (grid, axes)
   */
  addGroundPlane() {
    // Remove the ground plane - user doesn't want it
    // The existing grid helper is sufficient
  }

  addHelpers() {
    // Grid helper
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x444444);
    this.scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(2);
    this.scene.add(axesHelper);
  }

  /**
   * Load a 3D model
   * @param {File|string} source - File object or URL
   * @param {Object} options - Loading options
   */
  async loadModel(source, options = {}) {
    try {
      this.emit('modelLoadingStart', { source });
      console.log('Loading model:', source);

      let model;
      const fileExtension = this.getFileExtension(source);
      console.log('File extension detected:', fileExtension);

      switch (fileExtension) {
        case 'glb':
        case 'gltf':
          model = await this.loadGLTF(source);
          break;
        case 'obj':
          model = await this.loadOBJ(source);
          break;
        case 'fbx':
          model = await this.loadFBX(source);
          break;
        case 'vrm':
          model = await this.loadVRM(source);
          break;
        default:
          const supportedFormats = ['glb', 'gltf', 'obj', 'fbx', 'vrm'];
          const fileInfo = source instanceof File ? 
            `File: ${source.name} (Type: ${source.type})` : 
            `Source: ${source}`;
          throw new Error(`Unsupported file format: ${fileExtension || 'unknown'}. ${fileInfo}. Supported formats: ${supportedFormats.join(', ')}`);
      }

      // Remove existing model
      if (this.currentModel) {
        this.scene.remove(this.currentModel);
        this.currentModel = null;
        this.currentVRM = null; // Clear VRM reference
      }

      // Process and add new model
      console.log('Processing model with options:', options);
      this.currentModel = this.processModel(model, options);
      console.log('Model processed, adding to scene...');
      this.scene.add(this.currentModel);

      // Store original materials for render mode restoration
      this.storeOriginalMaterials();

      // Update materials based on render mode
      this.updateRenderMode(this.renderMode);

      // Force material restoration to ensure textures are properly displayed
      this.forceMaterialRestoration();

      // Ensure model is properly positioned
      this.ensureModelOnGround();

      // Debug: Log model position and camera position
      console.log('Model position:', this.currentModel.position);
      const boundingBox = new THREE.Box3().setFromObject(this.currentModel);
      console.log('Model bounding box:', boundingBox);
      console.log('Camera position:', this.camera.position);
      console.log('Camera target:', this.controls.target);

      // Auto-focus camera on the model
      this.focusOnModel();

      this.emit('modelLoaded', { model: this.currentModel });
      return this.currentModel;
    } catch (error) {
      console.error('Failed to load model:', error);
      this.emit('modelLoadError', { error });
      throw error;
    }
  }

  /**
   * Load GLTF/GLB model
   */
  async loadGLTF(source) {
    return new Promise((resolve, reject) => {
      console.log('🔄 Starting GLTF/GLB model loading...');
      console.log('📁 Source:', source instanceof File ? `File: ${source.name} (${source.size} bytes, ${source.type})` : `URL: ${source}`);
      
      const startTime = Date.now();
      
      this.gltfLoader.load(
        source,
        (gltf) => {
          const loadTime = Date.now() - startTime;
          console.log(`✅ GLTF/GLB loaded successfully in ${loadTime}ms`);
          console.log('📊 GLTF Structure:', {
            scene: !!gltf.scene,
            scenes: gltf.scenes?.length || 0,
            animations: gltf.animations?.length || 0,
            cameras: gltf.cameras?.length || 0,
            asset: gltf.asset,
            userData: gltf.userData
          });
          
          // Debug geometry detection
          if (gltf.scene) {
            let geometryCount = 0;
            let materialCount = 0;
            let textureCount = 0;
            let meshCount = 0;
            
            gltf.scene.traverse((child) => {
              if (child.isMesh) {
                meshCount++;
                console.log(`🔍 Mesh found: ${child.name}`, {
                  geometry: child.geometry?.type,
                  material: child.material?.type,
                  position: child.position,
                  visible: child.visible
                });
                
                if (child.geometry) {
                  geometryCount++;
                  console.log(`📐 Geometry details:`, {
                    type: child.geometry.type,
                    vertices: child.geometry.attributes?.position?.count || 0,
                    faces: child.geometry.index ? child.geometry.index.count / 3 : 0,
                    hasNormals: !!child.geometry.attributes?.normal,
                    hasUVs: !!child.geometry.attributes?.uv,
                    hasColors: !!child.geometry.attributes?.color
                  });
                }
                
                if (child.material) {
                  materialCount++;
                  console.log(`🎨 Material details:`, {
                    type: child.material.type,
                    color: child.material.color,
                    map: !!child.material.map,
                    normalMap: !!child.material.normalMap,
                    roughnessMap: !!child.material.roughnessMap,
                    metalnessMap: !!child.material.metalnessMap,
                    emissiveMap: !!child.material.emissiveMap
                  });
                  
                  // Count textures
                  if (child.material.map) textureCount++;
                  if (child.material.normalMap) textureCount++;
                  if (child.material.roughnessMap) textureCount++;
                  if (child.material.metalnessMap) textureCount++;
                  if (child.material.emissiveMap) textureCount++;
                }
              }
            });
            
            console.log(`📈 GLTF/GLB Summary:`, {
              meshes: meshCount,
              geometries: geometryCount,
              materials: materialCount,
              textures: textureCount,
              loadTime: `${loadTime}ms`
            });
            
            if (meshCount === 0) {
              console.warn('⚠️ No meshes found in GLTF/GLB model!');
            }
            if (geometryCount === 0) {
              console.warn('⚠️ No geometries found in GLTF/GLB model!');
            }
          }
          
          resolve(gltf.scene);
        },
        (progress) => {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log(`📊 GLTF/GLB loading progress: ${percentComplete.toFixed(1)}% (${progress.loaded}/${progress.total} bytes)`);
          this.emit('modelLoadingProgress', { progress: percentComplete });
        },
        (error) => {
          const loadTime = Date.now() - startTime;
          console.error(`❌ GLTF/GLB loading failed after ${loadTime}ms:`, {
            message: error.message,
            source: source instanceof File ? source.name : source,
            loadTime: `${loadTime}ms`
          });
          reject(error);
        }
      );
    });
  }

  /**
   * Load OBJ model
   */
  async loadOBJ(source) {
    return new Promise((resolve, reject) => {
      this.objLoader.load(
        source,
        (obj) => resolve(obj),
        (progress) => this.emit('modelLoadingProgress', { progress }),
        (error) => reject(error)
      );
    });
  }

  /**
   * Load FBX model
   */
  async loadFBX(source) {
    return new Promise((resolve, reject) => {
      console.log('🔄 Starting FBX model loading...');
      console.log('📁 Source:', source instanceof File ? `File: ${source.name} (${source.size} bytes, ${source.type})` : `URL: ${source}`);
      
      const startTime = Date.now();
      
      this.fbxLoader.load(
        source,
        (fbx) => {
          const loadTime = Date.now() - startTime;
          console.log(`✅ FBX loaded successfully in ${loadTime}ms`);
          console.log('📊 FBX Structure:', {
            type: fbx.type,
            name: fbx.name,
            children: fbx.children.length,
            animations: fbx.animations?.length || 0,
            userData: fbx.userData
          });
          
          // Debug geometry detection
          let geometryCount = 0;
          let materialCount = 0;
          let textureCount = 0;
          let meshCount = 0;
          let hasGeometry = false;
          
          fbx.traverse((child) => {
            if (child.isMesh) {
              meshCount++;
              console.log(`🔍 FBX Mesh found: ${child.name}`, {
                geometry: child.geometry?.type,
                material: child.material?.type,
                position: child.position,
                visible: child.visible
              });
              
              if (child.geometry) {
                hasGeometry = true;
                geometryCount++;
                console.log(`📐 FBX Geometry details:`, {
                  type: child.geometry.type,
                  vertices: child.geometry.attributes?.position?.count || 0,
                  faces: child.geometry.index ? child.geometry.index.count / 3 : 0,
                  hasNormals: !!child.geometry.attributes?.normal,
                  hasUVs: !!child.geometry.attributes?.uv,
                  hasColors: !!child.geometry.attributes?.color
                });
              }
              
              if (child.material) {
                materialCount++;
                console.log(`🎨 FBX Material details:`, {
                  type: child.material.type,
                  color: child.material.color,
                  map: !!child.material.map,
                  normalMap: !!child.material.normalMap,
                  roughnessMap: !!child.material.roughnessMap,
                  metalnessMap: !!child.material.metalnessMap,
                  emissiveMap: !!child.material.emissiveMap
                });
                
                // Count textures
                if (child.material.map) textureCount++;
                if (child.material.normalMap) textureCount++;
                if (child.material.roughnessMap) textureCount++;
                if (child.material.metalnessMap) textureCount++;
                if (child.material.emissiveMap) textureCount++;
              }
            }
          });
          
          console.log(`📈 FBX Summary:`, {
            meshes: meshCount,
            geometries: geometryCount,
            materials: materialCount,
            textures: textureCount,
            loadTime: `${loadTime}ms`
          });
          
          if (!hasGeometry) {
            console.warn('⚠️ FBX model has no geometry! Creating fallback geometry...');
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const cube = new THREE.Mesh(geometry, material);
            cube.name = 'FallbackGeometry';
            fbx.add(cube);
            console.log('✅ Fallback geometry added to FBX model');
          } else {
            console.log('✅ FBX model has valid geometry, preserving original materials');
          }
          
          if (meshCount === 0) {
            console.warn('⚠️ No meshes found in FBX model!');
          }
          if (geometryCount === 0) {
            console.warn('⚠️ No geometries found in FBX model!');
          }
          
          resolve(fbx);
        },
        (progress) => {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log(`📊 FBX loading progress: ${percentComplete.toFixed(1)}% (${progress.loaded}/${progress.total} bytes)`);
          this.emit('modelLoadingProgress', { progress: percentComplete });
        },
        (error) => {
          const loadTime = Date.now() - startTime;
          console.error(`❌ FBX loading failed after ${loadTime}ms:`, {
            message: error.message,
            source: source instanceof File ? source.name : source,
            loadTime: `${loadTime}ms`
          });
          reject(error);
        }
      );
    });
  }

  /**
   * Load VRM model
   */
  async loadVRM(source) {
    try {
      console.log('🔄 Starting VRM model loading...');
      console.log('📁 Source:', source instanceof File ? `File: ${source.name} (${source.size} bytes, ${source.type})` : `URL: ${source}`);
      
      const startTime = Date.now();
      
      const vrm = await this.vrmLoader.loadVRM(source, {
        normalize: true,
        addDefaultMaterials: true,
        processBlendShapes: true,
        setupBones: true
      });
      
      const loadTime = Date.now() - startTime;
      console.log(`✅ VRM loaded successfully in ${loadTime}ms`);
      
      // Store the VRM object for blend shape access
      this.currentVRM = vrm;
      
      // Debug: Log VRM object structure and userData
      console.log('🔍 VRM object stored in sceneManager:', vrm);
      console.log('🔍 VRM userData:', vrm.userData);
      console.log('🔍 VRM userData.gltf:', vrm.userData?.gltf);
      console.log('🔍 VRM userData.gltf.images:', vrm.userData?.gltf?.images);
      console.log('🔍 VRM userData.gltf.images length:', vrm.userData?.gltf?.images?.length);
      
      // Enhanced VRM debugging and texture/shader processing
      if (vrm.scene) {
        console.log('📊 VRM Structure:', {
          type: vrm.scene.type,
          name: vrm.scene.name,
          children: vrm.scene.children.length,
          userData: vrm.scene.userData
        });
        
        // Debug VRM materials and textures
        let geometryCount = 0;
        let materialCount = 0;
        let textureCount = 0;
        let meshCount = 0;
        let vrmMaterialCount = 0;
        
        vrm.scene.traverse((child) => {
          if (child.isMesh) {
            meshCount++;
            console.log(`🔍 VRM Mesh found: ${child.name}`, {
              geometry: child.geometry?.type,
              material: child.material?.type,
              position: child.position,
              visible: child.visible
            });
            
            if (child.geometry) {
              geometryCount++;
              console.log(`📐 VRM Geometry details:`, {
                type: child.geometry.type,
                vertices: child.geometry.attributes?.position?.count || 0,
                faces: child.geometry.index ? child.geometry.index.count / 3 : 0,
                hasNormals: !!child.geometry.attributes?.normal,
                hasUVs: !!child.geometry.attributes?.uv,
                hasColors: !!child.geometry.attributes?.color
              });
            }
            
            if (child.material) {
              materialCount++;
              
              // Check if it's a VRM material
              const isVRMMaterial = child.material.userData?.vrmMaterial || 
                                   child.material.userData?.isVRMMaterial ||
                                   child.material.type === 'VRMMaterial';
              
              if (isVRMMaterial) {
                vrmMaterialCount++;
                console.log(`🎨 VRM Material found: ${child.name}`, {
                  type: child.material.type,
                  color: child.material.color,
                  map: !!child.material.map,
                  normalMap: !!child.material.normalMap,
                  roughnessMap: !!child.material.roughnessMap,
                  metalnessMap: !!child.material.metalnessMap,
                  emissiveMap: !!child.material.emissiveMap,
                  isVRMMaterial: true
                });
                
                // Ensure VRM materials are properly configured
                this.ensureVRMMaterialProperties(child.material);
              } else {
                console.log(`🎨 Standard Material: ${child.name}`, {
                  type: child.material.type,
                  color: child.material.color,
                  map: !!child.material.map,
                  normalMap: !!child.material.normalMap,
                  roughnessMap: !!child.material.roughnessMap,
                  metalnessMap: !!child.material.metalnessMap,
                  emissiveMap: !!child.material.emissiveMap
                });
              }
              
              // Count textures
              if (child.material.map) textureCount++;
              if (child.material.normalMap) textureCount++;
              if (child.material.roughnessMap) textureCount++;
              if (child.material.metalnessMap) textureCount++;
              if (child.material.emissiveMap) textureCount++;
            }
          }
        });
        
        console.log(`📈 VRM Summary:`, {
          meshes: meshCount,
          geometries: geometryCount,
          materials: materialCount,
          vrmMaterials: vrmMaterialCount,
          textures: textureCount,
          loadTime: `${loadTime}ms`
        });
        
        if (vrmMaterialCount === 0) {
          console.warn('⚠️ No VRM materials found! This may cause texture/shader issues.');
        }
        if (textureCount === 0) {
          console.warn('⚠️ No textures found in VRM model!');
        }
      }
      
      // Return the VRM scene with VRM object attached
      const scene = vrm.scene;
      scene.userData.vrm = vrm;
      return scene;
    } catch (error) {
      const loadTime = Date.now() - startTime;
      console.error(`❌ VRM loading failed after ${loadTime}ms:`, {
        message: error.message,
        source: source instanceof File ? source.name : source,
        loadTime: `${loadTime}ms`
      });
      throw error;
    }
  }
  
  /**
   * Ensure VRM material properties are properly configured
   */
  ensureVRMMaterialProperties(material) {
    if (!material) return;
    
    // Ensure material has proper VRM properties
    if (!material.userData) {
      material.userData = {};
    }
    
    // Mark as VRM material
    material.userData.vrmMaterial = true;
    material.userData.isVRMMaterial = true;
    
    // Ensure material is properly configured for rendering
    if (material.map && !material.map.needsUpdate) {
      material.map.needsUpdate = true;
    }
    if (material.normalMap && !material.normalMap.needsUpdate) {
      material.normalMap.needsUpdate = true;
    }
    if (material.roughnessMap && !material.roughnessMap.needsUpdate) {
      material.roughnessMap.needsUpdate = true;
    }
    if (material.metalnessMap && !material.metalnessMap.needsUpdate) {
      material.metalnessMap.needsUpdate = true;
    }
    if (material.emissiveMap && !material.emissiveMap.needsUpdate) {
      material.emissiveMap.needsUpdate = true;
    }
    
    // Ensure material needs update
    material.needsUpdate = true;
    
    console.log(`🔧 VRM Material properties ensured for: ${material.type}`);
  }
  
  /**
   * Force material restoration for all meshes to ensure textures are properly displayed
   */
  forceMaterialRestoration() {
    if (!this.currentModel) return;
    
    console.log('🔧 Forcing material restoration...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        console.log(`🔍 Processing mesh: ${child.name}`);
        
        // Force material update
        child.material.needsUpdate = true;
        
        // Ensure all textures are properly updated
        if (child.material.map) {
          child.material.map.needsUpdate = true;
          console.log(`📷 Updated texture map for: ${child.name}`);
        }
        if (child.material.normalMap) {
          child.material.normalMap.needsUpdate = true;
        }
        if (child.material.roughnessMap) {
          child.material.roughnessMap.needsUpdate = true;
        }
        if (child.material.metalnessMap) {
          child.material.metalnessMap.needsUpdate = true;
        }
        if (child.material.emissiveMap) {
          child.material.emissiveMap.needsUpdate = true;
        }
        
        // Check if this is a VRM material and ensure proper properties
        const isVRMMaterial = child.material.userData?.vrmMaterial || 
                             child.material.userData?.isVRMMaterial ||
                             child.material.type === 'VRMMaterial';
        
        if (isVRMMaterial) {
          console.log(`🎨 Found VRM material on: ${child.name}`);
          this.ensureVRMMaterialProperties(child.material);
        }
        
        console.log(`✅ Material restoration completed for: ${child.name}`);
      }
    });
    
    console.log('✅ Material restoration completed');
  }

  /**
   * Get VRM blend shapes
   */
  getVRMBlendShapes() {
    console.log('getVRMBlendShapes called, currentVRM:', !!this.currentVRM);
    if (!this.currentVRM) {
      console.log('No currentVRM found');
      return [];
    }
    
    const blendShapes = [];
    
    // VRM standard blend shape name mapping based on VRMExpressionPresetName
    const blendShapeNameMap = {
      // Numeric blend shape mappings (common in some VRM models)
      '0': 'Neutral',
      '1': 'Happy',
      '2': 'Angry',
      '3': 'Sad',
      '4': 'Surprised',
      '5': 'Blink',
      '6': 'A (Mouth Open)',
      '7': 'I (Smile)',
      '8': 'U (Pucker)',
      '9': 'E (Grin)',
      '10': 'O (Round)',
      '11': 'Joy',
      '12': 'Fun',
      '13': 'Sorrow',
      '14': 'Left Blink',
      '15': 'Right Blink',
      '16': 'Look Up',
      '17': 'Look Down',
      '18': 'Look Left',
      '19': 'Look Right',
      
      // Facial expressions (VRM 1.0 standard)
      'happy': 'Happy',
      'angry': 'Angry', 
      'sorrow': 'Sorrow',
      'fun': 'Fun',
      'surprised': 'Surprised',
      'neutral': 'Neutral',
      'relaxed': 'Relaxed',
      'excited': 'Excited',
      'sleepy': 'Sleepy',
      'confused': 'Confused',
      'disgusted': 'Disgusted',
      'fearful': 'Fearful',
      'sad': 'Sad',
      
      // Lip sync visemes (phonemes)
      'aa': 'A (Mouth Open)',
      'ih': 'I (Smile)', 
      'ou': 'U (Pucker)',
      'ee': 'E (Grin)',
      'oh': 'O (Round)',
      
      // Eye movements
      'blink': 'Blink',
      'blink_l': 'Left Blink',
      'blink_r': 'Right Blink',
      'lookup': 'Look Up',
      'lookdown': 'Look Down', 
      'lookleft': 'Look Left',
      'lookright': 'Look Right',
      
      // Additional VRM expressions
      'joy': 'Joy',
      'a': 'A (Mouth Open)',
      'i': 'I (Smile)',
      'u': 'U (Pucker)',
      'e': 'E (Grin)',
      'o': 'O (Round)',
      
      // Legacy VRM 0.x mappings
      'Ah': 'A (Mouth Open)',
      'Ih': 'I (Smile)',
      'Ou': 'U (Pucker)', 
      'Ee': 'E (Grin)',
      'Oh': 'O (Round)',
      'Blink': 'Blink',
      'Blink_L': 'Left Blink',
      'Blink_R': 'Right Blink',
      'LookUp': 'Look Up',
      'LookDown': 'Look Down',
      'LookLeft': 'Look Left', 
      'LookRight': 'Look Right'
    };
    
    const getDisplayName = (technicalName) => {
      // First check our custom mapping
      if (blendShapeNameMap[technicalName]) {
        return blendShapeNameMap[technicalName];
      }
      
      // Then check if it's a VRMExpressionPresetName value
      const presetEntries = Object.entries(VRMExpressionPresetName);
      for (const [key, value] of presetEntries) {
        if (value === technicalName) {
          // Convert key to human-readable format
          return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
        }
      }
      
      // Fallback to original name
      return technicalName;
    };
    
    // Extract ALL blend shapes from the VRM model - both expressions and morph targets
    console.log('Extracting blend shapes from VRM model...');
    
    // First, try to get VRM expressions (these are the high-level expressions)
    let vrmExpressions = [];
    if (this.currentVRM.blendShapeProxy) {
      console.log('VRM has blendShapeProxy');
      const expressions = this.currentVRM.blendShapeProxy.getExpressionManager();
      if (expressions) {
        const expressionNames = expressions.getExpressionNames();
        console.log('Found VRM expressions:', expressionNames.length);
        vrmExpressions = expressionNames;
      }
    } else if (this.currentVRM.expressionManager) {
      console.log('VRM has direct expressionManager');
      const expressions = this.currentVRM.expressionManager.expressions;
      if (expressions) {
        const expressionNames = Object.keys(expressions);
        console.log('Found VRM expressions:', expressionNames.length);
        vrmExpressions = expressionNames;
      }
    }
    
    // Extract morph targets from all meshes in the scene
    if (this.currentVRM.scene) {
      console.log('Checking VRM scene for morph targets...');
      this.currentVRM.scene.traverse((child) => {
        if (child.isMesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
          console.log('Found morph targets on mesh:', child.name, child.morphTargetInfluences.length);
          if (child.morphTargetDictionary) {
            const morphTargetNames = Object.keys(child.morphTargetDictionary);
            console.log('Morph target dictionary:', morphTargetNames.length, 'targets');
            console.log('Morph target names:', morphTargetNames.slice(0, 10), '...'); // Show first 10 names
            
            morphTargetNames.forEach(name => {
              // Only add if not already in VRM expressions and not already added
              if (!vrmExpressions.includes(name) && !blendShapes.find(bs => bs.technicalName === name)) {
                blendShapes.push({
                  name: name, // Use the actual morph target name
                  technicalName: name,
                  value: 0
                });
              }
            });
          }
        }
      });
    }
    
    // Add VRM expressions (these are usually the main facial expressions)
    vrmExpressions.forEach(name => {
      if (!blendShapes.find(bs => bs.technicalName === name)) {
        blendShapes.push({
          name: getDisplayName(name),
          technicalName: name,
          value: 0
        });
      }
    });
    
    // Check for blend shapes in VRM metadata
    if (this.currentVRM.meta && this.currentVRM.meta.blendShapeGroups) {
      console.log('Found blend shape groups in VRM meta:', this.currentVRM.meta.blendShapeGroups.length);
      this.currentVRM.meta.blendShapeGroups.forEach(group => {
        if (group.binds) {
          group.binds.forEach(bind => {
            const name = bind.name || `BlendShape_${bind.index}`;
            // Only add if not already added
            if (!blendShapes.find(bs => bs.technicalName === name)) {
              blendShapes.push({
                name: name,
                technicalName: name,
                value: 0
              });
            }
          });
        }
      });
    }
    
    console.log('Total blend shapes extracted:', blendShapes.length);
    console.log('Blend shape names (first 10):', blendShapes.slice(0, 10).map(bs => bs.name));
    console.log('All blend shape technical names:', blendShapes.map(bs => bs.technicalName));
    return blendShapes;
  }

  /**
   * Set VRM blend shape value
   */
  setVRMBlendShape(name, value) {
    if (!this.currentVRM) return;
    
    // Try blendShapeProxy first (for VRM expressions)
    if (this.currentVRM.blendShapeProxy) {
      const expressions = this.currentVRM.blendShapeProxy.getExpressionManager();
      if (expressions) {
        expressions.setValue(name, value);
        return;
      }
    }
    
    // Try direct expressionManager
    if (this.currentVRM.expressionManager && this.currentVRM.expressionManager.expressions) {
      const expressions = this.currentVRM.expressionManager.expressions;
      if (expressions[name] && typeof expressions[name].setValue === 'function') {
        expressions[name].setValue(value);
        return;
      }
    }
    
    // Try blendShapeManager
    if (this.currentVRM.blendShapeManager && this.currentVRM.blendShapeManager.expressions) {
      const expressions = this.currentVRM.blendShapeManager.expressions;
      if (expressions[name] && typeof expressions[name].setValue === 'function') {
        expressions[name].setValue(value);
        return;
      }
    }
    
    // Try to set morph target directly on meshes
    if (this.currentVRM.scene) {
      this.currentVRM.scene.traverse((child) => {
        if (child.isMesh && child.morphTargetInfluences && child.morphTargetDictionary) {
          const morphIndex = child.morphTargetDictionary[name];
          if (morphIndex !== undefined) {
            child.morphTargetInfluences[morphIndex] = value;
            console.log(`Set morph target ${name} to ${value} on mesh ${child.name}`);
            return;
          }
        }
      });
    }
    
    console.warn('Could not set blend shape value for:', name);
  }

  /**
   * Process loaded model (center, scale, etc.)
   */
  processModel(model, options = {}) {
    const { autoCenter = true, autoScale = true, scale = 1 } = options;
    console.log('processModel called with options:', { autoCenter, autoScale, scale });

    if (autoCenter || autoScale) {
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      // Check if model has valid dimensions
      if (maxDim === 0 || !isFinite(maxDim)) {
        console.warn('Model has invalid or zero dimensions, using default scale');
        model.scale.setScalar(scale);
      } else {
        const targetScale = autoScale ? (2 / maxDim) * scale : scale;
        console.log('Initial model bounds:', { min: box.min, max: box.max, center, size, maxDim, targetScale });
        model.scale.setScalar(targetScale);
      }
      
      // Rotate model 180 degrees around Y-axis to face the viewport
      model.rotation.y += Math.PI;
      
              if (autoCenter) {
                // Recalculate bounding box after rotation and scaling
                const rotatedBox = new THREE.Box3().setFromObject(model);
                
                // Check if rotated box is valid
                if (rotatedBox.isEmpty() || !isFinite(rotatedBox.min.y) || !isFinite(rotatedBox.max.y)) {
                  console.warn('Model has invalid bounding box after processing, using default positioning');
                  model.position.set(0, 0, 0);
                } else {
                  // Position model so feet are at the ground plane (y = 0)
                  const modelBottom = rotatedBox.min.y;
                  
                  // Move the model down so its bottom is at y = 0
                  model.position.y = -modelBottom;
                  model.position.x = 0;
                  model.position.z = 0;
                }
                
                // Update controls target to look at the model center
                if (this.controls) {
                  this.controls.target.set(0, 1, 0); // Look at center height of a typical human
                }
                
                console.log('Model positioning:', {
                  originalBox: { min: box.min, max: box.max },
                  rotatedBox: { min: rotatedBox.min, max: rotatedBox.max },
                  modelBottom: rotatedBox.min.y,
                  finalPosition: model.position,
                  scale: model.scale,
                  controlsTarget: this.controls ? this.controls.target : 'no controls'
                });
              }
    } else {
      // Rotate model 180 degrees around Y-axis to face the viewport
      model.rotation.y += Math.PI;
    }

    return model;
  }

  /**
   * Ensure model is positioned with feet on the ground
   */
  ensureModelOnGround() {
    if (!this.currentModel) return;
    
    // Get the current bounding box
    const box = new THREE.Box3().setFromObject(this.currentModel);
    
    // Check if bounding box is valid
    if (box.isEmpty() || !isFinite(box.min.y) || !isFinite(box.max.y)) {
      console.warn('Model has invalid bounding box, skipping ground positioning');
      return;
    }
    
    const modelBottom = box.min.y;
    
    // If the model is floating above ground, move it down
    if (modelBottom > 0) {
      this.currentModel.position.y -= modelBottom;
      console.log('Model moved to ground level:', {
        originalBottom: modelBottom,
        newPosition: this.currentModel.position
      });
    }
  }

  /**
   * Create bone visualization for skeleton mode
   */
  createBoneVisualization() {
    try {
      console.log('Creating bone visualization...');
      if (!this.currentModel) {
        console.log('No current model found');
        return;
      }

      // Remove existing bone visualization
      this.clearBoneVisualization();

      const boneHelpers = [];
      const boneConnections = [];
      
      // Initialize skeleton selection state
      this.selectedBone = null;
      this.boneHelpers = [];

      // Create bone visualization for VRM models
      if (this.currentVRM && this.currentVRM.humanoid) {
        console.log('Creating VRM bone visualization');
        console.log('VRM object:', this.currentVRM);
        console.log('Humanoid:', this.currentVRM.humanoid);
        const humanoid = this.currentVRM.humanoid;
        
        // Create helpers for each bone
        if (humanoid.humanoidBones && Array.isArray(humanoid.humanoidBones)) {
          console.log('Found humanoid bones:', humanoid.humanoidBones.length, humanoid.humanoidBones);
          humanoid.humanoidBones.forEach((boneName, index) => {
            try {
              const bone = humanoid.getNormalizedBoneNode(boneName);
              console.log(`Processing bone ${boneName}:`, bone);
              if (bone) {
                // Create a small sphere to represent the bone joint
                // Make finger joints much smaller
                const isFingerBone = boneName.toLowerCase().includes('finger') || 
                                   boneName.toLowerCase().includes('thumb') || 
                                   boneName.toLowerCase().includes('hand') ||
                                   boneName.toLowerCase().includes('toe');
                const sphereSize = isFingerBone ? 0.008 : 0.015;
                const geometry = new THREE.SphereGeometry(sphereSize, 8, 6);
                const material = new THREE.MeshBasicMaterial({ 
                  color: 0xff0000, // Red for unselected bones
                  transparent: true,
                  opacity: 1.0 // Fully opaque for better visibility
                });
                const boneHelper = new THREE.Mesh(geometry, material);
                
                // Position at bone location in world space
                bone.getWorldPosition(boneHelper.position);
                boneHelper.userData.boneName = boneName;
                boneHelper.userData.isBoneHelper = true;
                boneHelper.userData.originalBone = bone;
                
                if (this.scene) {
                  this.scene.add(boneHelper);
                  boneHelpers.push(boneHelper);
                  console.log('Added bone helper for', boneName, 'at position:', boneHelper.position);
                } else {
                  console.warn('No scene available to add bone helper');
                }
              }
            } catch (error) {
              console.warn('Error creating bone helper for', boneName, error);
            }
          });
        }

        // Create bone connections (lines between parent and child bones)
        try {
          this.createBoneConnections(humanoid, boneConnections);
        } catch (error) {
          console.warn('Error creating bone connections:', error);
        }
        
        // If no bones were found via VRM humanoid, try to find bones directly from the model
        if (boneHelpers.length === 0) {
          console.log('No VRM humanoid bones found, trying direct model traversal...');
          this.currentModel.traverse((child) => {
            try {
              if (child.isBone) {
                console.log('Found direct bone:', child.name, 'at position:', child.position);
                // Create a small sphere to represent the bone joint
                // Make finger joints much smaller
                const isFingerBone = child.name.toLowerCase().includes('finger') || 
                                   child.name.toLowerCase().includes('thumb') || 
                                   child.name.toLowerCase().includes('hand') ||
                                   child.name.toLowerCase().includes('toe');
                const sphereSize = isFingerBone ? 0.008 : 0.015;
                const geometry = new THREE.SphereGeometry(sphereSize, 8, 6);
                const material = new THREE.MeshBasicMaterial({ 
                  color: 0xff0000, // Red for unselected bones
                  transparent: true,
                  opacity: 1.0 // Fully opaque for better visibility
                });
                const boneHelper = new THREE.Mesh(geometry, material);
                
                // Position at bone location in world space
                child.getWorldPosition(boneHelper.position);
                boneHelper.userData.boneName = child.name;
                boneHelper.userData.isBoneHelper = true;
                boneHelper.userData.originalBone = child;
                
                if (this.scene) {
                  this.scene.add(boneHelper);
                  boneHelpers.push(boneHelper);
                  console.log('Added direct bone helper for', child.name, 'at position:', boneHelper.position);
                } else {
                  console.warn('No scene available to add direct bone helper');
                }
              }
            } catch (error) {
              console.warn('Error creating direct bone helper for', child.name, error);
            }
          });
          
          // Create bone connections for direct bones
          try {
            this.createBoneConnectionsForModel(this.currentModel, boneConnections);
          } catch (error) {
            console.warn('Error creating direct bone connections:', error);
          }
        }
      } else {
        console.log('Creating non-VRM bone visualization');
        console.log('Current model:', this.currentModel);
        console.log('Current VRM:', this.currentVRM);
        let boneCount = 0;
        // For non-VRM models, traverse the scene to find bones
        this.currentModel.traverse((child) => {
          try {
            if (child.isBone) {
              boneCount++;
              console.log('Found bone:', child.name, 'at position:', child.position);
              // Create a small sphere to represent the bone joint
              // Make finger joints much smaller
              const isFingerBone = child.name.toLowerCase().includes('finger') || 
                                 child.name.toLowerCase().includes('thumb') || 
                                 child.name.toLowerCase().includes('hand') ||
                                 child.name.toLowerCase().includes('toe');
              const sphereSize = isFingerBone ? 0.008 : 0.015;
              const geometry = new THREE.SphereGeometry(sphereSize, 8, 6);
              const material = new THREE.MeshBasicMaterial({ 
                color: 0xff6600, // Bright orange like in the image
                transparent: true,
                opacity: 1.0 // Fully opaque for better visibility
              });
              const boneHelper = new THREE.Mesh(geometry, material);
              
              // Position at bone location in world space
              child.getWorldPosition(boneHelper.position);
              boneHelper.userData.boneName = child.name;
              boneHelper.userData.isBoneHelper = true;
              boneHelper.userData.originalBone = child;
              
              if (this.scene) {
                this.scene.add(boneHelper);
                boneHelpers.push(boneHelper);
                console.log('Added bone helper for', child.name, 'at position:', boneHelper.position);
              } else {
                console.warn('No scene available to add bone helper');
              }
            }
          } catch (error) {
            console.warn('Error creating bone helper for', child.name, error);
          }
        });

        console.log('Total bones found in model:', boneCount);
        
        // Create bone connections for non-VRM models
        try {
          this.createBoneConnectionsForModel(this.currentModel, boneConnections);
        } catch (error) {
          console.warn('Error creating bone connections for model:', error);
        }
      }

      // Store bone helpers and connections for cleanup
      this.boneHelpers = boneHelpers;
      this.boneConnections = boneConnections;
      console.log('Created bone visualization with', boneHelpers.length, 'bones and', boneConnections.length, 'connections');
      
      // Setup mouse interaction for skeleton selection
      this.setupSkeletonMouseInteraction();
      
      // If no bones were found, create a simple fallback visualization
      if (boneHelpers.length === 0) {
        console.log('No bones found, creating fallback visualization');
        this.createFallbackBoneVisualization();
      } else {
        console.log('Bones found, skipping fallback visualization');
      }
    } catch (error) {
      console.error('Error in createBoneVisualization:', error);
      // Clear any partial bone visualization on error
      this.clearBoneVisualization();
    }
  }

  /**
   * Create fallback bone visualization when no bones are found
   */
  createFallbackBoneVisualization() {
    try {
      console.log('Creating fallback bone visualization');
      
      // Create a simple wireframe box to represent the model's bounding box
      if (this.currentModel && this.scene) {
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        const geometry = new THREE.BoxGeometry(size.x * 0.8, size.y * 0.8, size.z * 0.8);
        const material = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00,
          wireframe: true,
          transparent: true,
          opacity: 0.3
        });
        const wireframeBox = new THREE.Mesh(geometry, material);
        wireframeBox.position.copy(center);
        wireframeBox.userData.isFallbackBone = true;
        
        this.scene.add(wireframeBox);
        this.boneHelpers = [wireframeBox];
        this.boneConnections = [];
        
        console.log('Created fallback wireframe box');
      }
    } catch (error) {
      console.warn('Error creating fallback bone visualization:', error);
    }
  }

  /**
   * Create bone connections for VRM models
   */
  createBoneConnections(humanoid, boneConnections) {
    try {
      const bonePositions = new Map();
      
      // First, collect all bone positions
      if (humanoid.humanoidBones && Array.isArray(humanoid.humanoidBones)) {
        humanoid.humanoidBones.forEach((boneName) => {
          try {
            const bone = humanoid.getNormalizedBoneNode(boneName);
            if (bone) {
              const worldPosition = new THREE.Vector3();
              bone.getWorldPosition(worldPosition);
              bonePositions.set(boneName, worldPosition);
            }
          } catch (error) {
            console.warn('Error getting bone position for', boneName, error);
          }
        });

        // Create connections between parent and child bones
        humanoid.humanoidBones.forEach((boneName) => {
          try {
            const bone = humanoid.getNormalizedBoneNode(boneName);
            if (bone && bone.parent && bone.parent.isBone) {
              const parentPosition = bonePositions.get(bone.parent.name);
              if (parentPosition) {
                const boneWorldPosition = new THREE.Vector3();
                bone.getWorldPosition(boneWorldPosition);
                const geometry = new THREE.BufferGeometry().setFromPoints([
                  parentPosition,
                  boneWorldPosition
                ]);
                const material = new THREE.LineBasicMaterial({ 
                  color: 0xff6600, // Bright orange like in the image
                  transparent: true,
                  opacity: 1.0 // Fully opaque for better visibility
                });
                const connection = new THREE.Line(geometry, material);
                connection.userData.isBoneConnection = true;
                if (this.scene) {
                  this.scene.add(connection);
                  boneConnections.push(connection);
                  console.log('Added bone connection from', bone.parent.name, 'to', boneName);
                } else {
                  console.warn('No scene available to add bone connection');
                }
              }
            }
          } catch (error) {
            console.warn('Error creating bone connection for', boneName, error);
          }
        });
      }
    } catch (error) {
      console.warn('Error in createBoneConnections:', error);
    }
  }

  /**
   * Create bone connections for non-VRM models
   */
  createBoneConnectionsForModel(model, boneConnections) {
    try {
      const bonePositions = new Map();
      
      // First, collect all bone positions
      model.traverse((child) => {
        try {
          if (child.isBone) {
            const worldPosition = new THREE.Vector3();
            child.getWorldPosition(worldPosition);
            bonePositions.set(child.name, worldPosition);
          }
        } catch (error) {
          console.warn('Error getting bone position for', child.name, error);
        }
      });

      // Create connections between parent and child bones
      model.traverse((child) => {
        try {
          if (child.isBone && child.parent && child.parent.isBone) {
            const parentPosition = bonePositions.get(child.parent.name);
            if (parentPosition) {
              const childWorldPosition = new THREE.Vector3();
              child.getWorldPosition(childWorldPosition);
              const geometry = new THREE.BufferGeometry().setFromPoints([
                parentPosition,
                childWorldPosition
              ]);
              const material = new THREE.LineBasicMaterial({ 
                color: 0xff6600, // Bright orange like in the image
                transparent: true,
                opacity: 1.0 // Fully opaque for better visibility
              });
              const connection = new THREE.Line(geometry, material);
              connection.userData.isBoneConnection = true;
              if (this.scene) {
                this.scene.add(connection);
                boneConnections.push(connection);
                console.log('Added bone connection from', child.parent.name, 'to', child.name);
              } else {
                console.warn('No scene available to add bone connection');
              }
            }
          }
        } catch (error) {
          console.warn('Error creating bone connection for', child.name, error);
        }
      });
    } catch (error) {
      console.warn('Error in createBoneConnectionsForModel:', error);
    }
  }

  /**
   * Highlight a specific bone with selection state
   */
  highlightBone(boneName) {
    if (!this.boneHelpers) return;
    
    // Check if this bone is already selected
    const currentlySelected = this.boneHelpers.find(helper => 
      helper.userData.boneName === this.selectedBoneName
    );
    
    // If clicking the same bone, toggle it off
    if (this.selectedBoneName === boneName && currentlySelected) {
      this.selectedBoneName = null;
      // Reset all bone colors and scales to default
      this.boneHelpers.forEach(helper => {
        helper.material.color.setHex(0xff0000); // Red for unselected
        helper.material.opacity = 1.0;
        helper.scale.set(1, 1, 1);
      });
      console.log('Deselected bone:', boneName);
      return;
    }
    
    // Reset all bone colors and scales to default
    this.boneHelpers.forEach(helper => {
      helper.material.color.setHex(0xff0000); // Red for unselected
      helper.material.opacity = 1.0;
      helper.scale.set(1, 1, 1);
    });
    
    // Highlight the selected bone
    const selectedBone = this.boneHelpers.find(helper => 
      helper.userData.boneName === boneName
    );
    
    if (selectedBone) {
      this.selectedBoneName = boneName;
      selectedBone.material.color.setHex(0x00ff00); // Green for selected
      selectedBone.material.opacity = 1.0;
      selectedBone.scale.set(1.5, 1.5, 1.5); // Make selected bone larger
      console.log('Selected bone:', boneName);
    }
  }

  /**
   * Clear bone visualization
   */
  clearBoneVisualization() {
    try {
      if (this.boneHelpers && this.scene) {
        this.boneHelpers.forEach(helper => {
          try {
            this.scene.remove(helper);
          } catch (error) {
            console.warn('Error removing bone helper:', error);
          }
        });
        this.boneHelpers = [];
      }
      
      if (this.boneConnections && this.scene) {
        this.boneConnections.forEach(connection => {
          try {
            this.scene.remove(connection);
          } catch (error) {
            console.warn('Error removing bone connection:', error);
          }
        });
        this.boneConnections = [];
      }
      
        // Clear selection state
        this.selectedBone = null;
        this.selectedBones.clear();
        
        // Clean up mouse interaction
        this.cleanupSkeletonMouseInteraction();
      } catch (error) {
        console.warn('Error in clearBoneVisualization:', error);
      }
    }

    /**
     * Clean up mouse interaction for skeleton selection
     */
    cleanupSkeletonMouseInteraction() {
      if (!this.container) return;
      
      // Remove event listeners
      if (this.skeletonClickHandler) {
        this.container.removeEventListener('click', this.skeletonClickHandler);
        this.skeletonClickHandler = null;
      }
      if (this.skeletonDoubleClickHandler) {
        this.container.removeEventListener('dblclick', this.skeletonDoubleClickHandler);
        this.skeletonDoubleClickHandler = null;
      }
      if (this.skeletonMouseDownHandler) {
        this.container.removeEventListener('mousedown', this.skeletonMouseDownHandler);
        this.skeletonMouseDownHandler = null;
      }
      if (this.skeletonMouseMoveHandler) {
        this.container.removeEventListener('mousemove', this.skeletonMouseMoveHandler);
        this.skeletonMouseMoveHandler = null;
      }
      if (this.skeletonMouseUpHandler) {
        this.container.removeEventListener('mouseup', this.skeletonMouseUpHandler);
        this.skeletonMouseUpHandler = null;
      }
      
      // Clean up bounding box selection
      this.boundingBoxSelection.isActive = false;
      this.removeBoundingBoxElement();
      
      console.log('Skeleton mouse interaction cleanup complete');
    }

  /**
   * Setup mouse interaction for skeleton selection
   */
  setupSkeletonMouseInteraction() {
    if (!this.container || !this.raycaster) return;
    
    // Remove existing listeners if any
    if (this.skeletonClickHandler) {
      this.container.removeEventListener('click', this.skeletonClickHandler);
    }
    if (this.skeletonDoubleClickHandler) {
      this.container.removeEventListener('dblclick', this.skeletonDoubleClickHandler);
    }
    if (this.skeletonMouseDownHandler) {
      this.container.removeEventListener('mousedown', this.skeletonMouseDownHandler);
    }
    if (this.skeletonMouseMoveHandler) {
      this.container.removeEventListener('mousemove', this.skeletonMouseMoveHandler);
    }
    if (this.skeletonMouseUpHandler) {
      this.container.removeEventListener('mouseup', this.skeletonMouseUpHandler);
    }
    
    // Create event handlers
    this.skeletonClickHandler = (event) => {
      this.handleSkeletonClick(event);
    };
    
    this.skeletonDoubleClickHandler = (event) => {
      this.handleSkeletonDoubleClick(event);
    };
    
    this.skeletonMouseDownHandler = (event) => {
      this.handleSkeletonMouseDown(event);
    };
    
    this.skeletonMouseMoveHandler = (event) => {
      this.handleSkeletonMouseMove(event);
    };
    
    this.skeletonMouseUpHandler = (event) => {
      this.handleSkeletonMouseUp(event);
    };
    
    // Add event listeners
    this.container.addEventListener('click', this.skeletonClickHandler);
    this.container.addEventListener('dblclick', this.skeletonDoubleClickHandler);
    this.container.addEventListener('mousedown', this.skeletonMouseDownHandler);
    this.container.addEventListener('mousemove', this.skeletonMouseMoveHandler);
    this.container.addEventListener('mouseup', this.skeletonMouseUpHandler);
    
    console.log('Skeleton mouse interaction setup complete');
  }

  /**
   * Handle mouse click for skeleton selection
   */
  handleSkeletonClick(event) {
    if (!this.boneHelpers || this.boneHelpers.length === 0) {
      console.log('No bone helpers available for selection');
      return;
    }
    
    // Only handle clicks in skeleton mode
    if (this.renderMode !== 'skeleton') {
      console.log('Not in skeleton mode, ignoring click');
      return;
    }
    
    const rect = this.container.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update raycaster
    this.raycaster.setFromCamera(mouse, this.camera);
    
    // Intersect with bone helpers
    const intersects = this.raycaster.intersectObjects(this.boneHelpers);
    
    console.log('Skeleton click - intersects:', intersects.length);
    
    if (intersects.length > 0) {
      const selectedHelper = intersects[0].object;
      const boneName = selectedHelper.userData.boneName;
      
      console.log('Selected bone:', boneName);
      
      // Toggle selection
      if (this.selectedBones.has(boneName)) {
        this.removeBoneFromSelection(boneName);
      } else {
        this.addBoneToSelection(boneName);
      }
    } else {
      // Click outside model: deselect all
      this.deselectAllBones();
    }
  }

  /**
   * Handle double-click for bounding box selection
   */
  handleSkeletonDoubleClick(event) {
    if (this.renderMode !== 'skeleton') return;
    
    // Start bounding box selection on double-click
    this.startBoundingBoxSelection(event);
  }

  /**
   * Handle mouse down for bounding box selection
   */
  handleSkeletonMouseDown(event) {
    if (this.renderMode !== 'skeleton') return;
    
    // Start bounding box selection on double-click drag
    if (event.button === 0 && this.boundingBoxSelection.isActive) {
      // Continue with existing bounding box
    }
  }

  /**
   * Handle mouse move for bounding box selection
   */
  handleSkeletonMouseMove(event) {
    if (this.renderMode !== 'skeleton') return;
    
    if (this.boundingBoxSelection.isActive) {
      this.updateBoundingBoxSelection(event);
    }
  }

  /**
   * Handle mouse up for bounding box selection
   */
  handleSkeletonMouseUp(event) {
    if (this.renderMode !== 'skeleton') return;
    
    if (this.boundingBoxSelection.isActive && event.button === 0) {
      this.finishBoundingBoxSelection(event);
    }
  }

  /**
   * Start bounding box selection
   */
  startBoundingBoxSelection(event) {
    const rect = this.container.getBoundingClientRect();
    
    this.boundingBoxSelection.isActive = true;
    this.boundingBoxSelection.startX = event.clientX - rect.left;
    this.boundingBoxSelection.startY = event.clientY - rect.top;
    this.boundingBoxSelection.endX = this.boundingBoxSelection.startX;
    this.boundingBoxSelection.endY = this.boundingBoxSelection.startY;
    
    // Create visual bounding box element
    this.createBoundingBoxElement();
    
    console.log('Started bounding box selection');
  }

  /**
   * Update bounding box selection
   */
  updateBoundingBoxSelection(event) {
    if (!this.boundingBoxSelection.isActive) return;
    
    const rect = this.container.getBoundingClientRect();
    this.boundingBoxSelection.endX = event.clientX - rect.left;
    this.boundingBoxSelection.endY = event.clientY - rect.top;
    
    this.updateBoundingBoxElement();
  }

  /**
   * Finish bounding box selection
   */
  finishBoundingBoxSelection(event) {
    if (!this.boundingBoxSelection.isActive) return;
    
    const rect = this.container.getBoundingClientRect();
    this.boundingBoxSelection.endX = event.clientX - rect.left;
    this.boundingBoxSelection.endY = event.clientY - rect.top;
    
    // Select bones within bounding box
    this.selectBonesInBoundingBox();
    
    // Clean up
    this.boundingBoxSelection.isActive = false;
    this.removeBoundingBoxElement();
    
    console.log('Finished bounding box selection');
  }

  /**
   * Create visual bounding box element
   */
  createBoundingBoxElement() {
    if (this.boundingBoxSelection.boxElement) {
      this.removeBoundingBoxElement();
    }
    
    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.border = '2px dashed #00ff00';
    box.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
    box.style.pointerEvents = 'none';
    box.style.zIndex = '1000';
    box.style.left = this.boundingBoxSelection.startX + 'px';
    box.style.top = this.boundingBoxSelection.startY + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
    
    this.container.appendChild(box);
    this.boundingBoxSelection.boxElement = box;
  }

  /**
   * Update visual bounding box element
   */
  updateBoundingBoxElement() {
    if (!this.boundingBoxSelection.boxElement) return;
    
    const startX = Math.min(this.boundingBoxSelection.startX, this.boundingBoxSelection.endX);
    const startY = Math.min(this.boundingBoxSelection.startY, this.boundingBoxSelection.endY);
    const width = Math.abs(this.boundingBoxSelection.endX - this.boundingBoxSelection.startX);
    const height = Math.abs(this.boundingBoxSelection.endY - this.boundingBoxSelection.startY);
    
    this.boundingBoxSelection.boxElement.style.left = startX + 'px';
    this.boundingBoxSelection.boxElement.style.top = startY + 'px';
    this.boundingBoxSelection.boxElement.style.width = width + 'px';
    this.boundingBoxSelection.boxElement.style.height = height + 'px';
  }

  /**
   * Remove visual bounding box element
   */
  removeBoundingBoxElement() {
    if (this.boundingBoxSelection.boxElement) {
      this.container.removeChild(this.boundingBoxSelection.boxElement);
      this.boundingBoxSelection.boxElement = null;
    }
  }

  /**
   * Select bones within bounding box
   */
  selectBonesInBoundingBox() {
    if (!this.boneHelpers || this.boneHelpers.length === 0) return;
    
    const rect = this.container.getBoundingClientRect();
    const startX = Math.min(this.boundingBoxSelection.startX, this.boundingBoxSelection.endX);
    const startY = Math.min(this.boundingBoxSelection.startY, this.boundingBoxSelection.endY);
    const endX = Math.max(this.boundingBoxSelection.startX, this.boundingBoxSelection.endX);
    const endY = Math.max(this.boundingBoxSelection.startY, this.boundingBoxSelection.endY);
    
    let selectedCount = 0;
    
    this.boneHelpers.forEach(helper => {
      // Convert 3D position to screen coordinates
      const screenPosition = new THREE.Vector3();
      helper.getWorldPosition(screenPosition);
      screenPosition.project(this.camera);
      
      // Convert to screen pixel coordinates
      const screenX = (screenPosition.x * 0.5 + 0.5) * rect.width;
      const screenY = (screenPosition.y * -0.5 + 0.5) * rect.height;
      
      // Check if within bounding box
      if (screenX >= startX && screenX <= endX && screenY >= startY && screenY <= endY) {
        const boneName = helper.userData.boneName;
        this.addBoneToSelection(boneName);
        selectedCount++;
      }
    });
    
    console.log(`Selected ${selectedCount} bones within bounding box`);
  }

  /**
   * Add bone to selection
   */
  addBoneToSelection(boneName) {
    if (!this.boneHelpers) return;
    
    const helper = this.boneHelpers.find(h => h.userData.boneName === boneName);
    if (helper) {
      this.selectedBones.add(boneName);
      helper.material.color.setHex(0x00ff00); // Green for selected
      
      console.log('Added bone to selection:', boneName);
      this.emit('boneSelected', { boneName, helper, action: 'add' });
    }
  }

  /**
   * Remove bone from selection
   */
  removeBoneFromSelection(boneName) {
    if (!this.boneHelpers) return;
    
    const helper = this.boneHelpers.find(h => h.userData.boneName === boneName);
    if (helper) {
      this.selectedBones.delete(boneName);
      helper.material.color.setHex(0xff0000); // Red for unselected
      
      console.log('Removed bone from selection:', boneName);
      this.emit('boneDeselected', { boneName, helper, action: 'remove' });
    }
  }

  /**
   * Deselect all bones
   */
  deselectAllBones() {
    if (!this.boneHelpers) return;
    
    this.selectedBones.forEach(boneName => {
      const helper = this.boneHelpers.find(h => h.userData.boneName === boneName);
      if (helper) {
        helper.material.color.setHex(0xff0000); // Red for unselected
      }
    });
    
    this.selectedBones.clear();
    console.log('Deselected all bones');
    this.emit('allBonesDeselected');
  }

  /**
   * Select a bone by name (legacy method for compatibility)
   */
  selectBone(boneName) {
    console.log('Attempting to select bone:', boneName);
    
    // Clear previous single selection
    if (this.selectedBone) {
      this.deselectBone();
    }
    
    // Add to multi-selection
    this.addBoneToSelection(boneName);
    this.selectedBone = boneName;
    
    console.log('Bone selected successfully:', boneName);
  }

  /**
   * Deselect current bone
   */
  deselectBone() {
    if (this.selectedBone) {
      const helper = this.boneHelpers.find(h => h.userData.boneName === this.selectedBone);
      if (helper) {
        // Restore original color
        helper.material.color.setHex(0xff0000); // Red for unselected
        console.log('Bone deselected:', this.selectedBone);
        
        // Emit deselection event
        this.emit('boneDeselected', { boneName: this.selectedBone, helper });
      } else {
        console.warn('Bone helper not found for deselection:', this.selectedBone);
      }
      
      this.selectedBone = null;
    }
  }

  /**
   * Highlight bone by name (called from bone hierarchy panel)
   */
  highlightBone(boneName) {
    console.log('Highlighting bone:', boneName);
    
    if (!boneName) {
      this.deselectBone();
      return;
    }
    
    // Ensure we're in skeleton mode
    if (this.renderMode !== 'skeleton') {
      console.log('Switching to skeleton mode for bone highlighting');
      this.setRenderMode('skeleton');
    }
    
    // Find the bone helper
    const helper = this.boneHelpers.find(h => h.userData.boneName === boneName);
    if (helper) {
      console.log('Found bone helper, zooming and selecting');
      // Zoom to the bone
      this.zoomToBone(helper);
      
      // Select the bone
      this.selectBone(boneName);
    } else {
      console.warn('Bone helper not found for highlighting:', boneName);
    }
  }

  /**
   * Zoom camera to a specific bone with smooth animation
   */
  zoomToBone(boneHelper) {
    if (!this.camera || !this.controls || !boneHelper) return;
    
    const bonePosition = boneHelper.position.clone();
    
    // Calculate distance for good viewing angle
    const distance = 0.5; // Adjust this value for closer/farther zoom
    
    // Set camera position relative to bone
    const cameraOffset = new THREE.Vector3(0, 0.2, distance);
    const targetCameraPosition = bonePosition.clone().add(cameraOffset);
    const targetLookAt = bonePosition.clone();
    
    // Store starting positions for animation
    const startCameraPosition = this.camera.position.clone();
    const startLookAt = this.controls.target ? this.controls.target.clone() : new THREE.Vector3();
    
    // Animation parameters
    const duration = 1000; // 1 second animation
    const startTime = performance.now();
    
    // Animation function
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Smooth easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate camera position
      this.camera.position.lerpVectors(startCameraPosition, targetCameraPosition, easeOut);
      
      // Interpolate look-at target
      if (this.controls.target) {
        this.controls.target.lerpVectors(startLookAt, targetLookAt, easeOut);
      }
      
      // Update controls
      this.controls.update();
      
      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log('Animated zoom to bone:', boneHelper.userData.boneName);
      }
    };
    
    // Start animation
    requestAnimationFrame(animate);
  }

  /**
   * Focus camera on the current model
   */
  focusOnModel() {
    if (!this.currentModel || !this.camera || !this.controls) return;

    console.log('Focusing camera on model...');
    
    // Get model bounding box
    const box = new THREE.Box3().setFromObject(this.currentModel);
    
    // Check if bounding box is valid
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
      console.warn('Model has invalid bounding box, using default camera position');
      // Use default camera position
      this.camera.position.set(0, 1.5, 3);
      this.controls.target.set(0, 1, 0);
      this.controls.update();
      return;
    }
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    console.log('Model center:', center);
    console.log('Model size:', size);
    console.log('Max dimension:', maxDim);

    // Use default distance if model has no size
    const distance = maxDim > 0 ? maxDim * 2 : 3;
    const cameraPosition = center.clone();
    cameraPosition.y += distance * 0.5; // Above the model
    cameraPosition.z += distance; // Behind the model

    // Set camera position and target
    this.camera.position.copy(cameraPosition);
    this.controls.target.copy(center);
    this.controls.update();

    console.log('Camera focused on model at:', cameraPosition);
    console.log('Camera looking at:', center);
  }


  /**
   * Set render mode
   * @param {string} mode - Render mode (solid, wireframe, skeleton, partColorize, rendered)
   */
  setRenderMode(mode) {
    this.renderMode = mode;
    this.updateRenderMode(mode);
    this.emit('renderModeChanged', { mode });
  }

  /**
   * Store original materials when model is loaded
   */
  storeOriginalMaterials() {
    if (!this.currentModel) return;
    
    console.log('🔧 Storing original materials...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        // Only store if not already stored
        if (!child.userData.originalMaterial) {
          // Store original material
          child.userData.originalMaterial = child.material.clone();
          child.userData.originalColor = child.material.color.clone();
          
          // Enhanced material preservation for all material types
          console.log(`🎨 Storing material for: ${child.name} (${child.material.type})`);
          
          // Store material properties
          child.userData.originalMaterialType = child.material.type;
          child.userData.originalOpacity = child.material.opacity;
          child.userData.originalTransparent = child.material.transparent;
          child.userData.originalSide = child.material.side;
          
          // Store textures if they exist
          if (child.material.map) {
            child.userData.originalMap = child.material.map;
            console.log(`📷 Stored texture map for: ${child.name}`);
          }
          if (child.material.normalMap) {
            child.userData.originalNormalMap = child.material.normalMap;
          }
          if (child.material.roughnessMap) {
            child.userData.originalRoughnessMap = child.material.roughnessMap;
          }
          if (child.material.metalnessMap) {
            child.userData.originalMetalnessMap = child.material.metalnessMap;
          }
          if (child.material.emissiveMap) {
            child.userData.originalEmissiveMap = child.material.emissiveMap;
          }
          
          // Store VRM-specific properties
          if (child.material.userData?.vrmMaterial || child.material.userData?.isVRMMaterial) {
            child.userData.isVRMMaterial = true;
            child.userData.originalVRMMaterial = true;
            console.log(`🎨 Preserving VRM material for: ${child.name}`);
          }
        }
      }
    });
    
    console.log('✅ Original materials stored');
  }

  /**
   * Restore original materials
   */
  restoreOriginalMaterials() {
    if (!this.currentModel) return;
    
    console.log('🔧 Restoring original materials...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.userData.originalMaterial) {
        // Restore original material properties
        const original = child.userData.originalMaterial;
        child.material.color.copy(child.userData.originalColor);
        child.material.wireframe = original.wireframe;
        child.material.transparent = original.transparent;
        child.material.opacity = original.opacity;
        
        // Restore textures if they were stored
        if (child.userData.originalMap) {
          child.material.map = child.userData.originalMap;
          child.material.map.needsUpdate = true;
          console.log(`📷 Restored texture map for: ${child.name}`);
        }
        if (child.userData.originalNormalMap) {
          child.material.normalMap = child.userData.originalNormalMap;
          child.material.normalMap.needsUpdate = true;
        }
        if (child.userData.originalRoughnessMap) {
          child.material.roughnessMap = child.userData.originalRoughnessMap;
          child.material.roughnessMap.needsUpdate = true;
        }
        if (child.userData.originalMetalnessMap) {
          child.material.metalnessMap = child.userData.originalMetalnessMap;
          child.material.metalnessMap.needsUpdate = true;
        }
        if (child.userData.originalEmissiveMap) {
          child.material.emissiveMap = child.userData.originalEmissiveMap;
          child.material.emissiveMap.needsUpdate = true;
        }
        
        // Enhanced VRM material restoration
        if (child.userData.isVRMMaterial || child.userData.originalVRMMaterial) {
          console.log(`🎨 Restoring VRM material for: ${child.name}`);
          
          // Ensure VRM material properties are maintained
          this.ensureVRMMaterialProperties(child.material);
        }
        
        // Ensure material needs update for proper rendering
        child.material.needsUpdate = true;
        
        console.log(`✅ Material restored for: ${child.name}`);
      }
    });
    
    console.log('✅ Original materials restored');
  }

  /**
   * Update model materials based on render mode
   */
  updateRenderMode(mode) {
    if (!this.currentModel) return;

    // Store original materials if not already stored
    this.storeOriginalMaterials();

    this.currentModel.traverse((child) => {
      if (child.isMesh) {
        switch (mode) {
          case 'solid':
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            // Restore original color
            if (child.userData.originalColor) {
              child.material.color.copy(child.userData.originalColor);
            }
            // Clear bone visualization
            this.clearBoneVisualization();
            break;
          case 'wireframe':
            child.material.wireframe = true;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            // Keep original color for wireframe
            if (child.userData.originalColor) {
              child.material.color.copy(child.userData.originalColor);
            }
            // Clear bone visualization
            this.clearBoneVisualization();
            break;
          case 'skeleton':
            try {
              console.log('Setting skeleton mode for mesh:', child.name);
              child.material.wireframe = true;
              child.material.transparent = true;
              child.material.opacity = 0.1; // More transparent to see bones better
              child.material.color.setHex(0x666666); // Gray wireframe
            } catch (error) {
              console.error('Error setting skeleton mode for mesh:', child.name, error);
            }
            break;
          case 'partColorize':
            const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
            const colorIndex = Math.floor(Math.random() * colors.length);
            child.material.color.setHex(colors[colorIndex]);
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            break;
          case 'rendered':
            // Restore original materials for rendered mode
            this.restoreOriginalMaterials();
            // Clear bone visualization
            this.clearBoneVisualization();
            break;
        }
      }
    });

    // Create bone visualization for skeleton mode (after mesh processing)
    if (mode === 'skeleton') {
      console.log('Creating bone visualization for skeleton mode');
      console.log('Current model:', this.currentModel);
      console.log('Current VRM:', this.currentVRM);
      console.log('Scene:', this.scene);
      this.createBoneVisualization();
    }
  }

  /**
   * Setup resize handler
   */
  setupResizeHandler() {
    const handleResize = () => {
      if (!this.renderer || !this.camera) return;
      
      const width = this.renderer.domElement.parentElement.clientWidth;
      const height = this.renderer.domElement.parentElement.clientHeight;
      
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    this.eventListeners.set('resize', handleResize);
  }

  /**
   * Get file extension from source
   */
  getFileExtension(source) {
    let extension = '';
    
    if (source instanceof File) {
      const fileName = source.name;
      console.log('File name:', fileName);
      console.log('File type:', source.type);
      const parts = fileName.split('.');
      console.log('File name parts:', parts);
      if (parts.length > 1) {
        extension = parts.pop().toLowerCase();
      }
      
      // Fallback: try to detect from MIME type
      if (!extension && source.type) {
        const mimeToExtension = {
          'model/gltf-binary': 'glb',
          'model/gltf+json': 'gltf',
          'model/obj': 'obj',
          'model/fbx': 'fbx',
          'application/octet-stream': 'vrm' // VRM files often have this MIME type
        };
        extension = mimeToExtension[source.type] || '';
      }
    } else if (typeof source === 'string') {
      console.log('String source:', source);
      const parts = source.split('.');
      console.log('String parts:', parts);
      if (parts.length > 1) {
        extension = parts.pop().toLowerCase();
      }
    }
    
    console.log('File extension detected:', extension);
    return extension;
  }

  /**
   * Export current model
   * @param {string} format - Export format (glb, gltf, obj)
   * @param {Object} options - Export options
   */
  async exportModel(format = 'glb', options = {}) {
    if (!this.currentModel) {
      throw new Error('No model to export');
    }

    try {
      this.emit('modelExportStart', { model: this.currentModel, format, options });

      let result;
      switch (format) {
        case 'glb':
          result = await this.exportToGLB(options);
          break;
        case 'gltf':
          result = await this.exportToGLTF(options);
          break;
        case 'vrm':
          result = await this.exportToVRM(options);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      this.emit('modelExportComplete', { model: this.currentModel, format, result });
      return result;
    } catch (error) {
      console.error('Model export failed:', error);
      this.emit('modelExportError', { error, model: this.currentModel, format });
      throw error;
    }
  }

  /**
   * Export to GLB format
   * @param {Object} options - Export options
   */
  async exportToGLB(options = {}) {
    const {
      filename = 'open3dstudio_export.glb',
      forCharacterStudio = true,
      ...exportOptions
    } = options;

    if (forCharacterStudio) {
      return await this.glbExporter.exportForCharacterStudio(this.currentModel, {
        filename,
        ...exportOptions
      });
    } else {
      return await this.glbExporter.exportToGLB(this.currentModel, {
        filename,
        ...exportOptions
      });
    }
  }

  /**
   * Export to GLTF format
   * @param {Object} options - Export options
   */
  async exportToGLTF(options = {}) {
    // Placeholder for GLTF export
    // Would implement similar to GLB export but with different format
    throw new Error('GLTF export not yet implemented');
  }

  /**
   * Export to VRM format
   * @param {Object} options - Export options
   */
  async exportToVRM(options = {}) {
    const {
      filename = 'open3dstudio_export.vrm',
      vrmVersion = '0.0',
      metadata = {},
      ...exportOptions
    } = options;

    return await this.vrmExporter.exportToVRM(this.currentModel, {
      filename,
      vrmVersion,
      metadata,
      ...exportOptions
    });
  }

  /**
   * Clear current model
   */
  clearModel() {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel = null;
      this.emit('modelCleared');
    }
  }

  /**
   * Start render loop
   */
  startRenderLoop() {
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (this.controls) {
        this.controls.update();
      }
      
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    
    animate();
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
    // Remove event listeners
    this.eventListeners.forEach((listeners, event) => {
      if (event === 'resize') {
        window.removeEventListener('resize', listeners[0]);
      }
    });
    this.eventListeners.clear();

    // Dispose Three.js objects
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.controls) {
      this.controls.dispose();
    }

    this.isInitialized = false;
  }
}
