import React, { useState, useEffect, useRef } from 'react';
import { SceneManager } from '../library/sceneManager';
import SceneControls from './SceneControls';
import './SceneControlsDemo.css';

/**
 * SceneControlsDemo - Demonstration of enhanced 3D scene controls
 * Shows how to integrate the new SceneManager features with the UI
 */
export const SceneControlsDemo = () => {
  const [sceneManager, setSceneManager] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentRenderMode, setCurrentRenderMode] = useState('solid');
  const [sceneStats, setSceneStats] = useState({
    triangles: 0,
    vertices: 0,
    materials: 0,
    lights: 0
  });
  
  const containerRef = useRef(null);
  const animationIdRef = useRef(null);

  useEffect(() => {
    initializeScene();
    
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (sceneManager) {
        sceneManager.dispose();
      }
    };
  }, []);

  const initializeScene = async () => {
    try {
      const manager = new SceneManager();
      
      // Initialize with enhanced options
      await manager.initialize(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        backgroundColor: 0x1a1a1a,
        enableShadows: true,
        enableAntialias: true
      });

      setSceneManager(manager);
      setIsInitialized(true);
      
      // Start render loop
      startRenderLoop(manager);
      
      // Load a sample model for demonstration
      loadSampleModel(manager);
      
    } catch (error) {
      console.error('Failed to initialize scene:', error);
    }
  };

  const startRenderLoop = (manager) => {
    const animate = () => {
      if (manager && manager.controls) {
        manager.controls.update();
        manager.render();
        
        // Update scene stats
        updateSceneStats(manager);
      }
      
      animationIdRef.current = requestAnimationFrame(animate);
    };
    
    animate();
  };

  const updateSceneStats = (manager) => {
    if (!manager.scene) return;
    
    let triangles = 0;
    let vertices = 0;
    let materials = 0;
    let lights = 0;
    
    manager.scene.traverse((object) => {
      if (object.isMesh) {
        if (object.geometry.index) {
          triangles += object.geometry.index.count / 3;
        } else {
          triangles += object.geometry.attributes.position.count / 3;
        }
        vertices += object.geometry.attributes.position.count;
        materials += Array.isArray(object.material) ? object.material.length : 1;
      }
      if (object.isLight) {
        lights++;
      }
    });
    
    setSceneStats({ triangles, vertices, materials, lights });
  };

  const loadSampleModel = async (manager) => {
    try {
      // Load a sample VRM model for demonstration
      const sampleModelUrl = '/loot-assets/0N1/0N1_1.vrm';
      await manager.loadVRMModel(sampleModelUrl);
    } catch (error) {
      console.log('No sample model available, scene ready for user models');
    }
  };

  const handleRenderModeChange = (mode) => {
    setCurrentRenderMode(mode);
    console.log(`🎨 Render mode changed to: ${mode}`);
  };

  const handleLightingChange = (lightingData) => {
    console.log('💡 Lighting changed:', lightingData);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && sceneManager) {
      const url = URL.createObjectURL(file);
      
      if (file.name.endsWith('.vrm')) {
        sceneManager.loadVRMModel(url);
      } else if (file.name.endsWith('.glb') || file.name.endsWith('.gltf')) {
        sceneManager.loadModel(url);
      } else {
        console.warn('Unsupported file format');
      }
    }
  };

  return (
    <div className="scene-controls-demo">
      <div className="demo-header">
        <h2>🎨 Enhanced 3D Scene Controls</h2>
        <p>Advanced rendering, lighting, and camera controls for your 3D models</p>
      </div>

      <div className="demo-content">
        {/* 3D Viewport */}
        <div className="viewport-container">
          <div className="viewport-header">
            <h3>3D Viewport</h3>
            <div className="viewport-stats">
              <span>Triangles: {sceneStats.triangles.toLocaleString()}</span>
              <span>Vertices: {sceneStats.vertices.toLocaleString()}</span>
              <span>Materials: {sceneStats.materials}</span>
              <span>Lights: {sceneStats.lights}</span>
            </div>
          </div>
          
          <div 
            ref={containerRef} 
            className="viewport"
            style={{ 
              width: '100%', 
              height: '500px',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          />
          
          {!isInitialized && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <p>Initializing 3D Scene...</p>
            </div>
          )}
        </div>

        {/* Scene Controls */}
        <div className="controls-container">
          <SceneControls
            sceneManager={sceneManager}
            onRenderModeChange={handleRenderModeChange}
            onLightingChange={handleLightingChange}
          />
        </div>
      </div>

      {/* File Upload */}
      <div className="file-upload-section">
        <h3>📁 Load 3D Model</h3>
        <div className="file-upload-area">
          <input
            type="file"
            id="model-upload"
            accept=".vrm,.glb,.gltf,.fbx,.obj"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <label htmlFor="model-upload" className="file-upload-btn">
            📁 Choose 3D Model File
          </label>
          <p className="file-upload-hint">
            Supports VRM, GLB, GLTF, FBX, and OBJ formats
          </p>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="feature-highlights">
        <h3>✨ New Features</h3>
        <div className="features-grid">
          <div className="feature-card">
            <h4>🎨 Advanced Rendering Modes</h4>
            <p>Solid, Wireframe, Skeleton, Normal Map, UV Map, and Depth visualization</p>
          </div>
          <div className="feature-card">
            <h4>💡 Professional Lighting</h4>
            <p>3-point lighting setup with dynamic intensity and type controls</p>
          </div>
          <div className="feature-card">
            <h4>📷 Enhanced Camera</h4>
            <p>Predefined positions, auto-rotation, and smooth controls</p>
          </div>
          <div className="feature-card">
            <h4>🎬 Tone Mapping</h4>
            <p>ACES Filmic, Reinhard, Cineon, and Linear tone mapping options</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SceneControlsDemo;
