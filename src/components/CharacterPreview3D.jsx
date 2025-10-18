import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import VRMToGLBConverter from '../library/vrmToGlbConverter';

const CharacterPreview3D = ({ model, className = "", cameraAngle = "3/4" }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const animationIdRef = useRef(null);
  const converterRef = useRef(null);
  const gltfLoaderRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a);
    
    // Create camera (smaller FOV for preview)
    const camera = new THREE.PerspectiveCamera(
      45, // Smaller FOV for preview
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    
    // Set camera position based on angle
    if (cameraAngle === "front") {
      camera.position.set(0, 1.5, 3); // Front view
    } else {
      camera.position.set(2, 1.5, 2); // 3/4 angle (default)
    }

    // Create renderer (lower resolution for performance)
    const renderer = new THREE.WebGLRenderer({ 
      antialias: false, // Disable antialiasing for performance
      alpha: true 
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limit pixel ratio for performance
    mountRef.current.appendChild(renderer.domElement);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Add controls (limited for preview)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 3;
    controls.maxPolarAngle = Math.PI / 2;
    controls.target.set(0, 1, 0);

    // Initialize converter and loader
    converterRef.current = new VRMToGLBConverter();
    gltfLoaderRef.current = new GLTFLoader();

    // Store references
    sceneRef.current = { scene, camera, controls };
    rendererRef.current = renderer;

    // Animation loop (throttled for performance)
    let lastTime = 0;
    const animate = (currentTime) => {
      if (currentTime - lastTime > 16) { // ~60fps max
        controls.update();
        renderer.render(scene, camera);
        lastTime = currentTime;
      }
      animationIdRef.current = requestAnimationFrame(animate);
    };
    animate(0);

    setIsInitialized(true);

    // Cleanup
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);

  // Handle model updates with VRM to GLB conversion
  useEffect(() => {
    if (!isInitialized || !sceneRef.current || !model || !converterRef.current || !gltfLoaderRef.current) return;

    const { scene } = sceneRef.current;
    
    // Remove existing model
    const existingModel = scene.getObjectByName('character-model');
    if (existingModel) {
      scene.remove(existingModel);
    }

    // Convert VRM to GLB and load the actual model
    const loadModel = async () => {
      try {
        setIsConverting(true);
        
        // Convert VRM to GLB
        const glbData = await converterRef.current.convertVRMToGLB(model);
        
        // Load GLB data
        const gltf = await converterRef.current.loadGLBData(glbData, gltfLoaderRef.current);
        
        // Clone the GLB model (now safe to clone)
        const modelClone = gltf.scene.clone();
        modelClone.name = 'character-model';
        modelClone.scale.setScalar(1);
        
        // Position the model
        const box = new THREE.Box3().setFromObject(modelClone);
        const center = box.getCenter(new THREE.Vector3());
        modelClone.position.sub(center);
        modelClone.position.y = 0; // Ground level
        
        scene.add(modelClone);
        
        console.log('✅ Character preview model loaded successfully');
        
      } catch (error) {
        console.error('❌ Failed to load model in preview:', error);
        
        // Fallback to silhouette if conversion fails
        createFallbackSilhouette(scene, model);
      } finally {
        setIsConverting(false);
      }
    };

    loadModel();
  }, [model, isInitialized]);

  // Fallback silhouette creation
  const createFallbackSilhouette = (scene, model) => {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    // Create a character-shaped silhouette
    const group = new THREE.Group();
    group.name = 'character-model';
    
    // Body (main cylinder)
    const bodyGeometry = new THREE.CylinderGeometry(size.x * 0.3, size.x * 0.4, size.y * 0.6, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4a90e2,
      metalness: 0.1,
      roughness: 0.8
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0, size.y * 0.2, 0);
    group.add(body);
    
    // Head (sphere)
    const headGeometry = new THREE.SphereGeometry(size.x * 0.25, 8, 6);
    const headMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x8b4513,
      metalness: 0.1,
      roughness: 0.8
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, size.y * 0.5, 0);
    group.add(head);
    
    // Position the group
    group.position.copy(center);
    group.position.y = 0; // Ground level
    
    scene.add(group);
  };

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !sceneRef.current) return;
      
      const { clientWidth, clientHeight } = mountRef.current;
      const { camera } = sceneRef.current;
      
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(clientWidth, clientHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={`character-preview-3d ${className}`} style={{ width: '100%', height: '200px', position: 'relative' }}>
      <div 
        ref={mountRef}
        style={{ width: '100%', height: '100%' }}
      />
      {(!isInitialized || isConverting) && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ccc',
          fontSize: '12px',
          textAlign: 'center'
        }}>
          {isConverting ? 'Converting VRM to GLB...' : 'Loading preview...'}
        </div>
      )}
    </div>
  );
};

export default CharacterPreview3D;
