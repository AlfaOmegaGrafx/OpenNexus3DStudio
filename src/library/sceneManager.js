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
import { VRMExpressionPresetName } from '@pixiv/three-vrm';
import { sharedHDRManager } from './sharedHDRManager.js';
import { createSoftwareRenderer, isSoftwareRenderingSupported } from './softwareRenderer.js';

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
    this.animationId = null;
    this.isRendering = false;
    
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
   * Check WebGL support and capabilities
   */
  checkWebGLSupport() {
    const canvas = document.createElement('canvas');
    let gl = null;
    let contextType = null;
    
    // Try different WebGL context types
    const contextTypes = [
      { name: 'webgl2', getContext: () => canvas.getContext('webgl2') },
      { name: 'webgl', getContext: () => canvas.getContext('webgl') },
      { name: 'experimental-webgl', getContext: () => canvas.getContext('experimental-webgl') }
    ];
    
    for (const context of contextTypes) {
      try {
        gl = context.getContext();
        if (gl) {
          contextType = context.name;
          break;
        }
      } catch (e) {
        console.warn(`Failed to get ${context.name} context:`, e);
      }
    }
    
    if (!gl) {
      return {
        supported: false,
        reason: 'WebGL not supported',
        fallback: 'Software rendering',
        recommendations: [
          'Update your browser to the latest version',
          'Update your graphics drivers',
          'Enable hardware acceleration in browser settings',
          'Try a different browser (Chrome, Firefox, Edge)',
          'Check if WebGL is disabled in browser settings'
        ]
      };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';

    // Check for specific problematic configurations
    const isSandboxed = vendor.includes('Disabled') || renderer.includes('Disabled');
    const isVirtualMachine = vendor.includes('VMware') || vendor.includes('VirtualBox');
    const isSoftwareRenderer = renderer.includes('Software') || renderer.includes('Mesa');
    
    // Test basic WebGL functionality
    let functionalityTest = 'unknown';
    try {
      const testProgram = gl.createProgram();
      gl.deleteProgram(testProgram);
      functionalityTest = 'basic';
    } catch (e) {
      functionalityTest = 'limited';
    }
    
    return {
      supported: true,
      contextType,
      vendor,
      renderer,
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
      isSandboxed,
      isVirtualMachine,
      isSoftwareRenderer,
      functionalityTest,
      recommendations: isSandboxed ? [
        'WebGL is disabled in your browser',
        'Enable hardware acceleration',
        'Disable browser security restrictions',
        'Try running in a different browser profile'
      ] : isVirtualMachine ? [
        'Running in virtual machine may limit WebGL performance',
        'Enable 3D acceleration in VM settings',
        'Update VM graphics drivers'
      ] : []
    };
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
      this.camera.position.set(0, 2.5, 2.5); // Position camera back and up for better view

      // Check WebGL support
      const webglSupport = this.checkWebGLSupport();
      console.log('🔍 WebGL Support Check:', webglSupport);

      // Create renderer with comprehensive WebGL fallback
      let renderer;
      const rendererConfigs = [
        // High-performance configuration
        {
          name: 'High Performance',
          config: {
            antialias: enableAntialias,
            alpha: true,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: true
          }
        },
        // Balanced configuration
        {
          name: 'Balanced',
          config: {
            antialias: false,
            alpha: true,
            powerPreference: "default",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: true
          }
        },
        // Low-power configuration
        {
          name: 'Low Power',
          config: {
            antialias: false,
            alpha: true,
            powerPreference: "low-power",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: true
          }
        },
        // Minimal configuration
        {
          name: 'Minimal',
          config: {
            antialias: false,
            alpha: false,
            powerPreference: "low-power",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: false,
            depth: true,
            stencil: false
          }
        },
        // Ultra-minimal configuration
        {
          name: 'Ultra Minimal',
          config: {
            antialias: false,
            alpha: false,
            powerPreference: "low-power",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: false,
            depth: false,
            stencil: false
          }
        }
      ];

      let lastError = null;
      for (const rendererConfig of rendererConfigs) {
        try {
          console.log(`🔄 Trying ${rendererConfig.name} WebGL configuration...`);
          renderer = new THREE.WebGLRenderer(rendererConfig.config);
          console.log(`✅ ${rendererConfig.name} WebGL renderer created successfully`);
          break;
        } catch (error) {
          console.warn(`⚠️ ${rendererConfig.name} WebGL failed:`, error.message);
          lastError = error;
          continue;
        }
      }

      if (!renderer) {
        console.error('❌ All WebGL configurations failed, trying software renderer...');
        
        // Try software rendering as last resort
        if (isSoftwareRenderingSupported()) {
          try {
            console.log('🔄 Attempting software rendering fallback...');
            renderer = createSoftwareRenderer(container, {
              backgroundColor: '#1a1a1a',
              showGrid: true,
              showAxes: true
            });
            console.log('✅ Software renderer created as fallback');
            this.isSoftwareRenderer = true;
          } catch (softwareError) {
            console.error('❌ Even software rendering failed:', softwareError);
            throw new Error(`WebGL is not supported on this system. Last error: ${lastError?.message}. Please try: 1) Updating your browser, 2) Updating graphics drivers, 3) Enabling hardware acceleration, 4) Using a different browser.`);
          }
        } else {
          throw new Error(`WebGL is not supported on this system. Last error: ${lastError?.message}. Please try: 1) Updating your browser, 2) Updating graphics drivers, 3) Enabling hardware acceleration, 4) Using a different browser.`);
        }
      }
      
      this.renderer = renderer;
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
      
      if (enableShadows) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      // Create enhanced controls with better UX
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.enableZoom = true;
      this.controls.enableRotate = true;
      this.controls.enablePan = true;
      this.controls.autoRotate = false;
      this.controls.autoRotateSpeed = 2.0;
      this.controls.minDistance = 0.5;
      this.controls.maxDistance = 50;
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = Math.PI;
      this.controls.target.set(0, 1, 0); // Look at human height

      // Setup lighting
      this.setupLighting();

      // Setup HDR environment map
      this.setupHDREnvironment();

      // Ground plane removed - user doesn't want it

      // Add helpers
      this.addHelpers();

      // Mount renderer
      try {
        container.appendChild(this.renderer.domElement);
        console.log('✅ SceneManager: Renderer DOM element added to container');
      } catch (error) {
        console.error('❌ SceneManager: Failed to add renderer to container:', error);
        throw new Error(`Failed to add renderer to container: ${error.message}`);
      }

      // Setup WebGL context loss recovery
      this.setupWebGLContextRecovery();

      // Setup resize handler
      this.setupResizeHandler();

      this.isInitialized = true;
      console.log('✅ SceneManager: Scene initialized successfully');
      console.log('✅ SceneManager: Scene details:', {
        scene: !!this.scene,
        camera: !!this.camera,
        renderer: !!this.renderer,
        controls: !!this.controls,
        container: container.tagName,
        dimensions: { width, height }
      });
      
      this.emit('initialized', { scene: this.scene, camera: this.camera, renderer: this.renderer });
      
      return { scene: this.scene, camera: this.camera, renderer: this.renderer, controls: this.controls };
    } catch (error) {
      console.error('❌ SceneManager: Failed to initialize scene:', error);
      console.error('❌ SceneManager: Error details:', {
        message: error.message,
        stack: error.stack,
        container: container,
        options: options
      });
      throw error;
    }
  }

  /**
   * Setup scene lighting with enhanced professional lighting setup
   */
  setupLighting() {
    // Store lights for dynamic control
    this.lights = {
      ambient: [],
      directional: [],
      point: [],
      hemisphere: []
    };

    // Enhanced Ambient light - much brighter overall illumination
    const ambientLight = new THREE.AmbientLight(0x606060, 1.2);
    ambientLight.name = 'mainAmbient';
    this.scene.add(ambientLight);
    this.lights.ambient.push(ambientLight);

    // Additional soft ambient light for extra brightness
    const softAmbientLight = new THREE.AmbientLight(0x808080, 0.6);
    softAmbientLight.name = 'softAmbient';
    this.scene.add(softAmbientLight);
    this.lights.ambient.push(softAmbientLight);

    // Professional 3-Point Lighting Setup with enhanced shadows
    
    // 1. Key Light (Main light) - Front and slightly to the right
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.name = 'keyLight';
    keyLight.position.set(5, 8, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 4096; // Increased shadow resolution
    keyLight.shadow.mapSize.height = 4096;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0001; // Reduce shadow acne
    this.scene.add(keyLight);
    this.lights.directional.push(keyLight);

    // 2. Fill Light (Softer light) - Front and slightly to the left
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.name = 'fillLight';
    fillLight.position.set(-3, 5, 2);
    this.scene.add(fillLight);
    this.lights.directional.push(fillLight);

    // 3. Rim Light (Back light) - Behind the model
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
    rimLight.name = 'rimLight';
    rimLight.position.set(-2, 3, -5);
    this.scene.add(rimLight);
    this.lights.directional.push(rimLight);

    // Additional accent light for better illumination
    const accentLight = new THREE.PointLight(0xffffff, 0.7, 20);
    accentLight.name = 'accentLight';
    accentLight.position.set(0, 10, 0);
    accentLight.castShadow = true;
    accentLight.shadow.mapSize.width = 2048;
    accentLight.shadow.mapSize.height = 2048;
    this.scene.add(accentLight);
    this.lights.point.push(accentLight);

    // Soft hemisphere light for natural ambient lighting
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x362d1d, 0.8);
    hemisphereLight.name = 'hemisphereLight';
    hemisphereLight.position.set(0, 10, 0);
    this.scene.add(hemisphereLight);
    this.lights.hemisphere.push(hemisphereLight);

    // Add subtle rim lighting for better model definition
    const rimLight2 = new THREE.DirectionalLight(0x4a90e2, 0.6);
    rimLight2.name = 'rimLight2';
    rimLight2.position.set(2, 2, -3);
    this.scene.add(rimLight2);
    this.lights.directional.push(rimLight2);
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

      // Restore VRM reference if this is a VRM model
      if (model && model.userData && model.userData.vrm) {
        this.currentVRM = model.userData.vrm;
        console.log('🔍 VRM reference restored after processing:', !!this.currentVRM);
        
        // Fix VRM model orientation - rotate to face forward
        if (this.currentModel && this.currentModel.rotation) {
          this.currentModel.rotation.y = Math.PI; // Rotate 180 degrees to face forward
          console.log('🔄 VRM model rotated to face forward in scene manager');
          console.log('🔄 Scene manager rotation after fix:', this.currentModel.rotation);
        }
        
        // Force VRM material restoration after processing
        this.forceVRMMaterialRestoration();
        
        // Additional VRM texture debugging and restoration
        setTimeout(() => {
          this.debugVRMTextures();
          this.validateVRMTextures();
          this.recreateVRMMaterials();
          this.forceVRMTextureBinding();
          this.forceVRMMaterialRestoration();
          this.forceRendererUpdate();
          // Force solid mode to ensure textures are visible
          this.updateRenderMode('solid');
        }, 100);
        
        // Final attempt after a longer delay
        setTimeout(() => {
          this.recreateVRMMaterials();
          this.forceVRMTextureBinding();
          this.forceVRMMaterialRestoration();
          this.forceRendererUpdate();
          // Force solid mode again to ensure textures are visible
          this.updateRenderMode('solid');
          // Force a final render
          if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
          }
        }, 500);
        
        // Ultimate attempt - force everything after 1 second
        setTimeout(() => {
          console.log('🚀 Ultimate VRM fix attempt...');
          this.currentModel.traverse((child) => {
            if (child.isMesh && child.material) {
              console.log(`🚀 Ultimate fix for: ${child.name}`);
              child.material.wireframe = false;
              child.material.transparent = false;
              child.material.opacity = 1.0;
              child.material.needsUpdate = true;
              if (child.material.map) {
                child.material.map.needsUpdate = true;
                child.material.map.flipY = false;
              }
            }
          });
          this.updateRenderMode('solid');
          if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
          }
          console.log('🚀 Ultimate VRM fix completed');
        }, 1000);
      }

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
    if (material.map) {
      material.map.needsUpdate = true;
      material.map.flipY = false; // VRM textures should not be flipped
    }
    if (material.normalMap) {
      material.normalMap.needsUpdate = true;
      material.normalMap.flipY = false;
    }
    if (material.roughnessMap) {
      material.roughnessMap.needsUpdate = true;
      material.roughnessMap.flipY = false;
    }
    if (material.metalnessMap) {
      material.metalnessMap.needsUpdate = true;
      material.metalnessMap.flipY = false;
    }
    if (material.emissiveMap) {
      material.emissiveMap.needsUpdate = true;
      material.emissiveMap.flipY = false;
    }
    
    // Ensure proper material properties for solid rendering
    material.wireframe = false;
    material.transparent = false;
    material.opacity = 1.0;
    
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
          child.material.map.flipY = false; // VRM textures should not be flipped
          console.log(`📷 Updated texture map for: ${child.name}`);
        }
        if (child.material.normalMap) {
          child.material.normalMap.needsUpdate = true;
          child.material.normalMap.flipY = false;
        }
        if (child.material.roughnessMap) {
          child.material.roughnessMap.needsUpdate = true;
          child.material.roughnessMap.flipY = false;
        }
        if (child.material.metalnessMap) {
          child.material.metalnessMap.needsUpdate = true;
          child.material.metalnessMap.flipY = false;
        }
        if (child.material.emissiveMap) {
          child.material.emissiveMap.needsUpdate = true;
          child.material.emissiveMap.flipY = false;
        }
        
        // Check if this is a VRM material and ensure proper properties
        const isVRMMaterial = child.material.userData?.vrmMaterial || 
                             child.material.userData?.isVRMMaterial ||
                             child.material.type === 'VRMMaterial';
        
        if (isVRMMaterial) {
          console.log(`🎨 Found VRM material on: ${child.name}`);
          this.ensureVRMMaterialProperties(child.material);
        }
        
        // Ensure proper material properties for solid rendering
        child.material.wireframe = false;
        child.material.transparent = false;
        child.material.opacity = 1.0;
        
        // Force texture coordinate update
        if (child.geometry && child.geometry.attributes && child.geometry.attributes.uv) {
          child.geometry.attributes.uv.needsUpdate = true;
        }
        
        console.log(`✅ Material restoration completed for: ${child.name}`);
      }
    });
    
    console.log('✅ Material restoration completed');
  }

  /**
   * Force VRM material restoration with aggressive texture binding
   */
  forceVRMMaterialRestoration() {
    if (!this.currentModel) return;
    
    console.log('🔧 Force VRM material restoration...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        console.log(`🔍 Force processing VRM mesh: ${child.name}`);
        
        // Force material recreation for VRM materials
        if (child.material.userData?.vrmMaterial || child.material.userData?.isVRMMaterial) {
          console.log(`🎨 Force VRM material restoration for: ${child.name}`);
          
          // Force texture binding
          if (child.material.map) {
            child.material.map.needsUpdate = true;
            child.material.map.flipY = false;
            child.material.map.generateMipmaps = true;
            child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
            child.material.map.magFilter = THREE.LinearFilter;
            child.material.map.wrapS = THREE.RepeatWrapping;
            child.material.map.wrapT = THREE.RepeatWrapping;
            console.log(`📷 Force texture binding for: ${child.name}`);
          }
          
          // Force all texture maps
          [child.material.normalMap, child.material.roughnessMap, child.material.metalnessMap, child.material.emissiveMap].forEach((texture, index) => {
            if (texture) {
              texture.needsUpdate = true;
              texture.flipY = false;
              texture.generateMipmaps = true;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
            }
          });
          
          // Force material properties
          child.material.needsUpdate = true;
          child.material.wireframe = false;
          child.material.transparent = false;
          child.material.opacity = 1.0;
          
          // Force geometry UV update
          if (child.geometry && child.geometry.attributes && child.geometry.attributes.uv) {
            child.geometry.attributes.uv.needsUpdate = true;
          }
          
          // Force material recreation if texture is not working
          if (child.material.map && !child.material.map.image) {
            console.log(`⚠️ Texture has no image, forcing recreation for: ${child.name}`);
            // Try to force texture recreation
            child.material.map.dispose();
            child.material.map = null;
            child.material.needsUpdate = true;
          }
          
          // Force material recreation if it's still not working
          if (child.material.map && child.material.map.image && child.material.map.image.width === 0) {
            console.log(`⚠️ Texture image not loaded, forcing material recreation for: ${child.name}`);
            // Force material recreation
            const oldMaterial = child.material;
            child.material = oldMaterial.clone();
            child.material.needsUpdate = true;
            oldMaterial.dispose();
          }
          
          console.log(`✅ Force VRM material restoration completed for: ${child.name}`);
        }
      }
    });
    
    console.log('✅ Force VRM material restoration completed');
  }

  /**
   * Debug VRM textures to see what's happening
   */
  debugVRMTextures() {
    if (!this.currentModel) return;
    
    console.log('🔍 Debugging VRM textures...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        console.log(`🔍 Mesh: ${child.name}`);
        console.log(`  Material type: ${child.material.type}`);
        console.log(`  Material needsUpdate: ${child.material.needsUpdate}`);
        console.log(`  Material wireframe: ${child.material.wireframe}`);
        console.log(`  Material transparent: ${child.material.transparent}`);
        console.log(`  Material opacity: ${child.material.opacity}`);
        
        if (child.material.map) {
          console.log(`  Map texture: ${child.material.map.image?.src || 'embedded'}`);
          console.log(`  Map needsUpdate: ${child.material.map.needsUpdate}`);
          console.log(`  Map flipY: ${child.material.map.flipY}`);
          console.log(`  Map format: ${child.material.map.format}`);
          console.log(`  Map type: ${child.material.map.type}`);
        } else {
          console.log(`  No map texture found`);
        }
        
        if (child.material.color) {
          console.log(`  Material color: ${child.material.color.getHexString()}`);
        }
        
        console.log(`  Material userData:`, child.material.userData);
        console.log('---');
      }
    });
  }

  /**
   * Force renderer update to refresh materials
   */
  forceRendererUpdate() {
    if (!this.renderer) return;
    
    console.log('🔧 Force renderer update...');
    
    // Force renderer to update
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    
    // Force material updates
    if (this.currentModel) {
      this.currentModel.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.needsUpdate = true;
          if (child.material.map) {
            child.material.map.needsUpdate = true;
          }
        }
      });
    }
    
    // Force render
    this.renderer.render(this.scene, this.camera);
    
    console.log('✅ Force renderer update completed');
  }

  /**
   * Validate and fix VRM textures
   */
  validateVRMTextures() {
    if (!this.currentModel) return;
    
    console.log('🔍 Validating VRM textures...');
    let fixedCount = 0;
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        if (child.material.map) {
          const texture = child.material.map;
          if (!texture.image || texture.image.width === 0) {
            console.log(`⚠️ Invalid texture found for: ${child.name}`);
            // Try to force texture recreation
            texture.needsUpdate = true;
            texture.flipY = false;
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            fixedCount++;
          }
        }
      }
    });
    
    console.log(`✅ VRM texture validation completed. Fixed ${fixedCount} textures.`);
  }

  /**
   * Force VRM texture binding - more aggressive approach
   */
  forceVRMTextureBinding() {
    if (!this.currentModel) return;
    
    console.log('🔧 Force VRM texture binding...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        console.log(`🔍 Force binding textures for: ${child.name}`);
        
        // Force all texture maps to be properly bound
        const textureMaps = [
          'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'
        ];
        
        textureMaps.forEach(mapType => {
          if (child.material[mapType]) {
            const texture = child.material[mapType];
            console.log(`📷 Force binding ${mapType} for: ${child.name}`);
            
            // Force texture properties
            texture.needsUpdate = true;
            texture.flipY = false;
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            
            // Force texture to be bound to GPU
            if (this.renderer) {
              this.renderer.initTexture(texture);
            }
          }
        });
        
        // Force material update
        child.material.needsUpdate = true;
        child.material.wireframe = false;
        child.material.transparent = false;
        child.material.opacity = 1.0;
        
        // Force geometry UV update
        if (child.geometry && child.geometry.attributes && child.geometry.attributes.uv) {
          child.geometry.attributes.uv.needsUpdate = true;
        }
        
        console.log(`✅ Force texture binding completed for: ${child.name}`);
      }
    });
    
    console.log('✅ Force VRM texture binding completed');
  }

  /**
   * Completely recreate VRM materials to fix texture issues
   */
  recreateVRMMaterials() {
    if (!this.currentModel) return;
    
    console.log('🔧 Recreating VRM materials...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        console.log(`🔄 Recreating material for: ${child.name}`);
        
        // Store original material properties
        const originalMaterial = child.material;
        const materialType = originalMaterial.type;
        
        // Create new material with same properties
        let newMaterial;
        if (materialType === 'MeshStandardMaterial') {
          newMaterial = new THREE.MeshStandardMaterial({
            map: originalMaterial.map,
            normalMap: originalMaterial.normalMap,
            roughnessMap: originalMaterial.roughnessMap,
            metalnessMap: originalMaterial.metalnessMap,
            emissiveMap: originalMaterial.emissiveMap,
            color: originalMaterial.color,
            roughness: originalMaterial.roughness,
            metalness: originalMaterial.metalness,
            emissive: originalMaterial.emissive,
            transparent: false,
            opacity: 1.0,
            wireframe: false
          });
        } else {
          newMaterial = new THREE.MeshBasicMaterial({
            map: originalMaterial.map,
            color: originalMaterial.color,
            transparent: false,
            opacity: 1.0,
            wireframe: false
          });
        }
        
        // Copy userData
        newMaterial.userData = { ...originalMaterial.userData };
        
        // Force texture updates
        if (newMaterial.map) {
          newMaterial.map.needsUpdate = true;
          newMaterial.map.flipY = false;
        }
        if (newMaterial.normalMap) {
          newMaterial.normalMap.needsUpdate = true;
          newMaterial.normalMap.flipY = false;
        }
        if (newMaterial.roughnessMap) {
          newMaterial.roughnessMap.needsUpdate = true;
          newMaterial.roughnessMap.flipY = false;
        }
        if (newMaterial.metalnessMap) {
          newMaterial.metalnessMap.needsUpdate = true;
          newMaterial.metalnessMap.flipY = false;
        }
        if (newMaterial.emissiveMap) {
          newMaterial.emissiveMap.needsUpdate = true;
          newMaterial.emissiveMap.flipY = false;
        }
        
        // Replace material
        child.material = newMaterial;
        child.material.needsUpdate = true;
        
        // Dispose old material
        originalMaterial.dispose();
        
        console.log(`✅ Material recreated for: ${child.name}`);
        console.log(`✅ New material wireframe: ${newMaterial.wireframe}, transparent: ${newMaterial.transparent}`);
        if (newMaterial.map) {
          console.log(`✅ New material texture: needsUpdate=${newMaterial.map.needsUpdate}, flipY=${newMaterial.map.flipY}`);
        }
      }
    });
    
    console.log('✅ VRM materials recreation completed');
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
    
    // Also ensure model orientation is correct
    this.ensureModelOrientation();
  }

  /**
   * Ensure model is properly oriented (facing forward)
   */
  ensureModelOrientation() {
    if (!this.currentModel) return;
    
    // Check if VRM model needs orientation correction
    if (this.currentVRM && this.currentVRM.scene) {
      const modelForward = new THREE.Vector3();
      this.currentModel.getWorldDirection(modelForward);
      
      // Only rotate if the model is actually facing backwards
      if (modelForward.z > 0.5) {
        console.log('🔄 Model is facing backwards, rotating 180 degrees');
        this.currentModel.rotation.y += Math.PI;
        console.log('🔄 Model rotation after correction:', this.currentModel.rotation);
      } else {
        console.log('✅ Model is already facing forward, no correction needed');
      }
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
   * Set camera mode
   * @param {string} mode - Camera mode (orbit, first-person, fixed)
   */
  setCameraMode(mode) {
    if (!this.controls) return;
    
    console.log(`📷 Setting camera mode: ${mode}`);
    
    switch (mode) {
      case 'orbit':
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
        this.controls.enableRotate = true;
        break;
      case 'first-person':
        this.controls.enableDamping = false;
        this.controls.enableZoom = false;
        this.controls.enablePan = false;
        this.controls.enableRotate = true;
        break;
      case 'fixed':
        this.controls.enableDamping = false;
        this.controls.enableZoom = false;
        this.controls.enablePan = false;
        this.controls.enableRotate = false;
        break;
    }
  }

  /**
   * Reset camera to default position
   */
  resetCamera() {
    if (!this.camera || !this.controls) return;
    
    console.log('🔄 Resetting camera to default position');
    
    // Reset camera position
    this.camera.position.set(0, 2.5, 2.5);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /**
   * Set camera view with smooth animation
   * @param {string} view - View preset (Front, Back, Left, Right, Top, Bottom, Isometric)
   */
  setView(view) {
    if (!this.camera || !this.controls) return;
    
    console.log(`👁️ Setting camera view: ${view}`);
    
    // Store current position and target
    const currentPosition = this.camera.position.clone();
    const currentTarget = this.controls.target.clone();
    
    // Calculate current distance from target
    const currentDistance = currentPosition.distanceTo(currentTarget);
    console.log(`📏 Current distance from target: ${currentDistance.toFixed(2)}`);
    
    // Calculate target position and target
    let targetPosition, targetLookAt;
    
    // Use the current distance to maintain consistent zoom level
    const distance = currentDistance;
    
    // Use the current target as the focus point for all views
    const focusPoint = currentTarget.clone();
    
    switch (view) {
      case 'Front':
        targetPosition = new THREE.Vector3(focusPoint.x, focusPoint.y, focusPoint.z + distance);
        targetLookAt = focusPoint.clone();
        break;
      case 'Back':
        targetPosition = new THREE.Vector3(focusPoint.x, focusPoint.y, focusPoint.z - distance);
        targetLookAt = focusPoint.clone();
        break;
      case 'Left':
        targetPosition = new THREE.Vector3(focusPoint.x - distance, focusPoint.y, focusPoint.z);
        targetLookAt = focusPoint.clone();
        break;
      case 'Right':
        targetPosition = new THREE.Vector3(focusPoint.x + distance, focusPoint.y, focusPoint.z);
        targetLookAt = focusPoint.clone();
        break;
      case 'Top':
        // Position directly above the model center, no X/Z offset inheritance
        targetPosition = new THREE.Vector3(0, focusPoint.y + distance, 0);
        targetLookAt = new THREE.Vector3(0, focusPoint.y, 0);
        break;
      case 'Bottom':
        // Position directly below the model center, no X/Z offset inheritance
        targetPosition = new THREE.Vector3(0, focusPoint.y - distance, 0);
        targetLookAt = new THREE.Vector3(0, focusPoint.y, 0);
        break;
      case 'Isometric':
        // Calculate isometric distance to maintain same zoom level
        const isoDistance = distance / Math.sqrt(3); // Divide by sqrt(3) to compensate for 3D diagonal
        targetPosition = new THREE.Vector3(
          focusPoint.x + isoDistance, 
          focusPoint.y + isoDistance, 
          focusPoint.z + isoDistance
        );
        targetLookAt = focusPoint.clone();
        break;
    }
    
    console.log(`🎯 Target position:`, targetPosition);
    console.log(`👁️ Target look-at:`, targetLookAt);
    
    // Animate camera transition
    this.animateCameraToPosition(currentPosition, targetPosition, currentTarget, targetLookAt);
  }

  /**
   * Animate camera to target position with smooth transition
   * @param {THREE.Vector3} startPos - Starting position
   * @param {THREE.Vector3} endPos - Ending position
   * @param {THREE.Vector3} startTarget - Starting target
   * @param {THREE.Vector3} endTarget - Ending target
   */
  animateCameraToPosition(startPos, endPos, startTarget, endTarget) {
    const duration = 1000; // 1 second animation
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use easing function for smooth animation
      const easeProgress = this.easeInOutCubic(progress);
      
      // Interpolate position
      this.camera.position.lerpVectors(startPos, endPos, easeProgress);
      
      // Interpolate target
      this.controls.target.lerpVectors(startTarget, endTarget, easeProgress);
      
      // Update controls
      this.controls.update();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  /**
   * Easing function for smooth animation
   * @param {number} t - Progress (0 to 1)
   * @returns {number} Eased progress
   */
  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Toggle performance stats display
   * @param {boolean} show - Whether to show stats
   */
  toggleStats(show) {
    console.log(`📊 Toggling stats: ${show}`);
    
    this.showStats = show;
    
    // Dispatch custom event to notify components
    const event = new CustomEvent('statsToggle', { 
      detail: { showStats: show } 
    });
    window.dispatchEvent(event);
    
    console.log(`Performance stats ${show ? 'enabled' : 'disabled'}`);
  }

  /**
   * Toggle auto-rotate for camera
   */
  toggleAutoRotate() {
    if (!this.controls) return;
    
    this.controls.autoRotate = !this.controls.autoRotate;
    console.log(`🔄 Auto-rotate: ${this.controls.autoRotate ? 'enabled' : 'disabled'}`);
  }

  /**
   * Take screenshot of current scene
   */
  takeScreenshot() {
    if (!this.renderer) return;
    
    console.log('📸 Taking screenshot');
    
    try {
      // Get canvas data URL
      const canvas = this.renderer.domElement;
      const dataURL = canvas.toDataURL('image/png');
      
      // Create download link
      const link = document.createElement('a');
      link.download = `screenshot_${new Date().getTime()}.png`;
      link.href = dataURL;
      link.click();
      
      console.log('Screenshot saved');
    } catch (error) {
      console.error('Failed to take screenshot:', error);
    }
  }

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen() {
    console.log('🖥️ Toggling fullscreen');
    
    if (!document.fullscreenElement) {
      // Enter fullscreen
      if (this.renderer && this.renderer.domElement.requestFullscreen) {
        this.renderer.domElement.requestFullscreen();
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  /**
   * Set lighting preset
   * @param {string} preset - Lighting preset (studio, outdoor, indoor, dramatic, soft, harsh)
   */
  setLighting(preset) {
    if (!this.scene) return;
    
    console.log(`💡 Setting lighting preset: ${preset}`);
    
    // Remove existing lights
    const existingLights = this.scene.children.filter(child => child.isLight);
    existingLights.forEach(light => this.scene.remove(light));
    
    // Create new lighting based on preset
    switch (preset) {
      case 'studio':
        this._createStudioLighting();
        break;
      case 'outdoor':
        this._createOutdoorLighting();
        break;
      case 'indoor':
        this._createIndoorLighting();
        break;
      case 'dramatic':
        this._createDramaticLighting();
        break;
      case 'soft':
        this._createSoftLighting();
        break;
      case 'harsh':
        this._createHarshLighting();
        break;
      default:
        this._createStudioLighting();
    }
  }

  /**
   * Set light intensity
   * @param {number} intensity - Light intensity (0-2)
   */
  setLightIntensity(intensity) {
    if (!this.scene) return;
    
    console.log(`💡 Setting light intensity: ${intensity}`);
    
    this.scene.traverse((child) => {
      if (child.isLight) {
        if (child.isAmbientLight) {
          child.intensity = intensity * 0.3;
        } else if (child.isDirectionalLight) {
          child.intensity = intensity;
        } else if (child.isPointLight) {
          child.intensity = intensity * 2;
        }
      }
    });
  }

  /**
   * Create studio lighting setup
   * @private
   */
  _createStudioLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);
    
    // Key light (main light)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(5, 5, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    this.scene.add(keyLight);
    
    // Fill light (softer)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-3, 2, 3);
    this.scene.add(fillLight);
    
    // Rim light
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, 5, -5);
    this.scene.add(rimLight);
  }

  /**
   * Create outdoor lighting setup
   * @private
   */
  _createOutdoorLighting() {
    // Bright ambient light
    const ambientLight = new THREE.AmbientLight(0x87CEEB, 0.6);
    this.scene.add(ambientLight);
    
    // Sun light
    const sunLight = new THREE.DirectionalLight(0xFFE4B5, 1.2);
    sunLight.position.set(10, 10, 5);
    sunLight.castShadow = true;
    this.scene.add(sunLight);
  }

  /**
   * Create indoor lighting setup
   * @private
   */
  _createIndoorLighting() {
    // Warm ambient light
    const ambientLight = new THREE.AmbientLight(0xFFF8DC, 0.4);
    this.scene.add(ambientLight);
    
    // Ceiling light
    const ceilingLight = new THREE.DirectionalLight(0xFFFFFF, 0.8);
    ceilingLight.position.set(0, 10, 0);
    this.scene.add(ceilingLight);
    
    // Table lamp
    const tableLight = new THREE.PointLight(0xFFE4B5, 0.5);
    tableLight.position.set(3, 2, 3);
    this.scene.add(tableLight);
  }

  /**
   * Create dramatic lighting setup
   * @private
   */
  _createDramaticLighting() {
    // Low ambient light
    const ambientLight = new THREE.AmbientLight(0x2F2F2F, 0.2);
    this.scene.add(ambientLight);
    
    // Strong directional light
    const mainLight = new THREE.DirectionalLight(0xFFFFFF, 1.5);
    mainLight.position.set(5, 10, 5);
    mainLight.castShadow = true;
    this.scene.add(mainLight);
    
    // Accent light
    const accentLight = new THREE.SpotLight(0xFF6B6B, 0.8);
    accentLight.position.set(-5, 5, 5);
    accentLight.angle = Math.PI / 6;
    this.scene.add(accentLight);
  }

  /**
   * Create soft lighting setup
   * @private
   */
  _createSoftLighting() {
    // High ambient light
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.8);
    this.scene.add(ambientLight);
    
    // Soft directional light
    const softLight = new THREE.DirectionalLight(0xFFFFFF, 0.4);
    softLight.position.set(3, 3, 3);
    this.scene.add(softLight);
  }

  /**
   * Create harsh lighting setup
   * @private
   */
  _createHarshLighting() {
    // Low ambient light
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.1);
    this.scene.add(ambientLight);
    
    // Very bright directional light
    const harshLight = new THREE.DirectionalLight(0xFFFFFF, 2.0);
    harshLight.position.set(0, 10, 0);
    harshLight.castShadow = true;
    this.scene.add(harshLight);
  }

  /**
   * Set auto tone mapping
   * @param {boolean} enabled - Whether auto tone mapping is enabled
   */
  setAutoTone(enabled) {
    if (!this.renderer) return;
    
    console.log(`🎨 Auto tone mapping: ${enabled ? 'enabled' : 'disabled'}`);
    
    this.renderer.toneMappingExposure = enabled ? 1.0 : 1.0;
    this.autoTone = enabled;
  }

  /**
   * Set tone mapping algorithm
   * @param {string} mapping - Tone mapping algorithm (ACES, Reinhard, Linear, Filmic)
   */
  setToneMapping(mapping) {
    if (!this.renderer) return;
    
    console.log(`🎨 Setting tone mapping: ${mapping}`);
    
    switch (mapping) {
      case 'ACES':
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        break;
      case 'Reinhard':
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        break;
      case 'Linear':
        this.renderer.toneMapping = THREE.LinearToneMapping;
        break;
      case 'Filmic':
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        break;
      default:
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
  }

  /**
   * Set exposure value
   * @param {number} exposure - Exposure value (0-3)
   */
  setExposure(exposure) {
    if (!this.renderer) return;
    
    console.log(`📸 Setting exposure: ${exposure}`);
    
    this.renderer.toneMappingExposure = exposure;
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
      this.camera.position.set(0, 1.5, 1.5);
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

    // Use closer distance for consistent zoom level
    const distance = maxDim > 0 ? maxDim * 1.2 : 1.5;
    const cameraPosition = center.clone();
    cameraPosition.y += distance * 0.2; // Slightly above the model
    cameraPosition.z += distance; // Behind the model

    // Set camera position and target
    this.camera.position.copy(cameraPosition);
    this.controls.target.copy(center);
    this.controls.update();

    console.log('Camera focused on model at:', cameraPosition);
    console.log('Camera looking at:', center);
  }


  /**
   * Set render mode with auto-focus
   * @param {string} mode - Render mode (solid, wireframe, skeleton, partColorize, rendered)
   */
  setRenderMode(mode) {
    this.renderMode = mode;
    this.updateRenderMode(mode);
    
    // Auto-focus on model when changing render modes for better viewing
    if (this.currentModel) {
      setTimeout(() => {
        this.focusOnModel();
      }, 100); // Small delay to ensure render mode is applied first
    }
    
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
          // Store original material (support single or multi-material)
          if (Array.isArray(child.material)) {
            child.userData.originalMaterial = child.material.map((m) => (typeof m?.clone === 'function' ? m.clone() : m));
          } else {
            child.userData.originalMaterial = typeof child.material?.clone === 'function' ? child.material.clone() : child.material;
          }
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
            // Restore original material if it exists (e.g., coming from UV mode)
            if (child.userData.originalMaterial) {
              const orig = child.userData.originalMaterial;
              if (Array.isArray(orig)) {
                child.material = orig.map((m) => (typeof m?.clone === 'function' ? m.clone() : m));
              } else if (typeof orig?.clone === 'function') {
                child.material = orig.clone();
              } else {
                // Fallback: use the stored object directly
                child.material = orig || child.material;
              }
            }
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            // Restore original color
            if (child.userData.originalColor) {
              child.material.color.copy(child.userData.originalColor);
            }
            
            // Enhanced VRM material handling for solid mode
            if (child.material.userData?.vrmMaterial || child.material.userData?.isVRMMaterial) {
              console.log(`🎨 Processing VRM material for solid mode: ${child.name}`);
              this.ensureVRMMaterialProperties(child.material);
              
              // Force aggressive texture binding for VRM materials
              if (child.material.map) {
                child.material.map.needsUpdate = true;
                child.material.map.flipY = false;
                child.material.map.generateMipmaps = true;
                child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
                child.material.map.magFilter = THREE.LinearFilter;
                child.material.map.wrapS = THREE.RepeatWrapping;
                child.material.map.wrapT = THREE.RepeatWrapping;
              }
            }
            
            // Force material and texture updates for solid rendering
            child.material.needsUpdate = true;
            if (child.material.map) {
              child.material.map.needsUpdate = true;
              child.material.map.flipY = false;
            }
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.uv) {
              child.geometry.attributes.uv.needsUpdate = true;
            }
            
            // Clear bone visualization
            this.clearBoneVisualization();
            
            // Force VRM model to face forward
            if (this.currentModel && this.currentVRM) {
              this.currentModel.rotation.y = Math.PI;
              console.log('🔄 VRM model orientation fixed for solid mode');
            }
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
          case 'normal':
            // Normal map visualization
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            if (child.material.normalMap) {
              child.material.map = child.material.normalMap;
              child.material.color.setHex(0x808080);
            }
            break;
          case 'uv':
            // UV map visualization
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            child.material.color.setHex(0xffffff);
            // Create UV visualization material
            const uvMaterial = new THREE.MeshBasicMaterial({
              map: this.createUVTexture(),
              side: THREE.DoubleSide
            });
            // Store the original material before replacing
            if (!child.userData.originalMaterial) {
              child.userData.originalMaterial = child.material.clone();
            }
            child.material = uvMaterial;
            break;
          case 'depth':
            // Depth visualization
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            child.material.color.setHex(0xffffff);
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
   * Setup WebGL context loss recovery
   */
  setupWebGLContextRecovery() {
    if (!this.renderer || !this.renderer.domElement) return;

    const canvas = this.renderer.domElement;
    
    // Handle context loss
    canvas.addEventListener('webglcontextlost', (event) => {
      console.warn('⚠️ WebGL context lost, preventing default behavior');
      event.preventDefault();
      this.isRendering = false;
    });

    // Handle context restoration
    canvas.addEventListener('webglcontextrestored', (event) => {
      console.log('🔄 WebGL context restored, reinitializing...');
      this.reinitializeScene();
    });
  }

  /**
   * Create UV visualization texture
   */
  createUVTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Create UV grid pattern
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    
    // Draw UV grid
    for (let i = 0; i <= 8; i++) {
      const x = (i / 8) * 512;
      const y = (i / 8) * 512;
      
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * Set lighting intensity for all lights
   * @param {number} intensity - Lighting intensity multiplier
   */
  setLightingIntensity(intensity) {
    if (!this.lights) return;
    
    // Adjust ambient lights
    this.lights.ambient.forEach(light => {
      if (!light.userData.originalIntensity) {
        light.userData.originalIntensity = light.intensity;
      }
      light.intensity = light.userData.originalIntensity * intensity;
    });
    
    // Adjust directional lights
    this.lights.directional.forEach(light => {
      if (!light.userData.originalIntensity) {
        light.userData.originalIntensity = light.intensity;
      }
      light.intensity = light.userData.originalIntensity * intensity;
    });
    
    // Adjust point lights
    this.lights.point.forEach(light => {
      if (!light.userData.originalIntensity) {
        light.userData.originalIntensity = light.intensity;
      }
      light.intensity = light.userData.originalIntensity * intensity;
    });
    
    // Adjust hemisphere lights
    this.lights.hemisphere.forEach(light => {
      if (!light.userData.originalIntensity) {
        light.userData.originalIntensity = light.intensity;
      }
      light.intensity = light.userData.originalIntensity * intensity;
    });
  }

  /**
   * Toggle specific light types
   * @param {string} lightType - Type of light to toggle ('ambient', 'directional', 'point', 'hemisphere')
   * @param {boolean} enabled - Whether to enable or disable
   */
  toggleLightType(lightType, enabled) {
    if (!this.lights || !this.lights[lightType]) return;
    
    this.lights[lightType].forEach(light => {
      light.visible = enabled;
    });
  }

  /**
   * Set camera to predefined positions with smooth animation and auto-focus
   * @param {string} position - Camera position ('front', 'back', 'left', 'right', 'top', 'bottom')
   * @param {number} duration - Animation duration in milliseconds (default: 1000ms)
   */
  setCameraPosition(position, duration = 1000) {
    if (!this.camera || !this.controls) return;
    
    // First, focus on the model to get proper distance
    this.focusOnModel();
    
    // Get the model's bounding box for proper positioning
    let modelCenter = new THREE.Vector3(0, 1, 0);
    let modelSize = 2; // Default size
    
    if (this.currentModel) {
      const box = new THREE.Box3().setFromObject(this.currentModel);
      if (!box.isEmpty()) {
        modelCenter = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        modelSize = Math.max(size.x, size.y, size.z);
      }
    }
    
    // Calculate distance based on model size for very close-up view
    const distance = Math.max(modelSize * 1.0, 1.0);
    
    const positions = {
      front: { x: modelCenter.x, y: modelCenter.y, z: modelCenter.z + distance },
      back: { x: modelCenter.x, y: modelCenter.y, z: modelCenter.z - distance },
      left: { x: modelCenter.x - distance, y: modelCenter.y, z: modelCenter.z },
      right: { x: modelCenter.x + distance, y: modelCenter.y, z: modelCenter.z },
      top: { x: modelCenter.x, y: modelCenter.y + distance, z: modelCenter.z },
      bottom: { x: modelCenter.x, y: modelCenter.y - distance, z: modelCenter.z }
    };
    
    const targetPos = positions[position];
    if (!targetPos) return;
    
    // Store current position and target
    const startPosition = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const endPosition = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
    const endTarget = modelCenter.clone();
    
    // Animation variables
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Smooth easing function (ease-in-out)
      const easeInOut = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      // Interpolate position
      this.camera.position.lerpVectors(startPosition, endPosition, easeInOut);
      
      // Interpolate target
      this.controls.target.lerpVectors(startTarget, endTarget, easeInOut);
      
      // Update controls
      this.controls.update();
      
      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Ensure final position is exact
        this.camera.position.copy(endPosition);
        this.controls.target.copy(endTarget);
        this.controls.update();
        
        console.log(`🎬 Camera animated to ${position} view with close-up focus`);
      }
    };
    
    // Start animation
    console.log(`🎬 Animating camera to ${position} view with close-up focus...`);
    animate();
  }

  /**
   * Enable/disable auto-rotation
   * @param {boolean} enabled - Whether to enable auto-rotation
   * @param {number} speed - Rotation speed (default: 2.0)
   */
  setAutoRotation(enabled, speed = 2.0) {
    if (this.controls) {
      this.controls.autoRotate = enabled;
      this.controls.autoRotateSpeed = speed;
    }
  }

  /**
   * Set renderer tone mapping and exposure
   * @param {string} toneMapping - Tone mapping type ('ACESFilmic', 'Reinhard', 'Cineon', 'Linear')
   * @param {number} exposure - Exposure value
   */
  setToneMapping(toneMapping, exposure = 1.0) {
    if (!this.renderer) return;
    
    const toneMappingTypes = {
      'ACESFilmic': THREE.ACESFilmicToneMapping,
      'Reinhard': THREE.ReinhardToneMapping,
      'Cineon': THREE.CineonToneMapping,
      'Linear': THREE.LinearToneMapping
    };
    
    this.renderer.toneMapping = toneMappingTypes[toneMapping] || THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
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
    if (this.isRendering) {
      console.warn('Render loop is already running');
      return;
    }
    
    this.isRendering = true;
    
    const animate = () => {
      if (!this.isRendering) {
        return;
      }
      
      this.animationId = requestAnimationFrame(animate);
      
      if (this.controls) {
        this.controls.update();
      }
      
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    
    animate();
    console.log('🎬 Render loop started');
  }

  /**
   * Stop render loop
   */
  stopRenderLoop() {
    if (!this.isRendering) {
      console.warn('Render loop is not running');
      return;
    }
    
    this.isRendering = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    console.log('⏹️ Render loop stopped');
  }

  /**
   * Cleanup and dispose of resources
   */
  dispose() {
    console.log('🧹 Cleaning up SceneManager...');
    
    // Stop render loop
    this.stopRenderLoop();
    
    // Clear current model
    this.clearModel();
    
    // Dispose of renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    
    // Dispose of controls
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    
    // Clear scene
    if (this.scene) {
      this.scene.clear();
      this.scene = null;
    }
    
    // Reset state
    this.isInitialized = false;
    this.camera = null;
    
    console.log('✅ SceneManager cleanup completed');
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
