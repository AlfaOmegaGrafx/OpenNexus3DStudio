import React, { useRef, useEffect, useState } from 'react';
import { useScene } from '../context/SceneContext';
import { useCore3D } from '../context/Core3DContext';

/**
 * Scene3D Component - Shared 3D Viewport
 * 
 * This component provides the main 3D viewport that is shared between:
 * - OpenNexus3DStudio (main application)
 * - CharacterStudio (sidebar panels)
 * 
 * Both applications access the same scene via SceneContext, ensuring:
 * - Single source of truth for the 3D scene
 * - Real-time updates when CharacterStudio panels modify the model
 * - Consistent rendering and state management
 */
const Scene3D = ({ model, renderMode }) => {
  const mountRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState({
    fps: 0,
    triangles: 0,
    drawCalls: 0
  });

  const {
    isInitialized: sceneInitialized,
    currentModel,
    renderMode: currentRenderMode,
    isLoading,
    initializeScene,
    updateRenderMode,
    startRenderLoop,
    exportModel,
    sceneManager
  } = useScene();

  const {
    isInitialized: core3dInitialized,
    currentDesign,
    selectedModel: core3dModel,
    selectedMaterial: core3dMaterial,
    generateDesign,
    exportDesign
  } = useCore3D();

  // Loot assets state
  const [lootAssetsLoaded, setLootAssetsLoaded] = useState(false);
  const [availableTraits, setAvailableTraits] = useState([]);
  const [currentLootCharacter, setCurrentLootCharacter] = useState(null);

  // Initialize scene when component mounts
  useEffect(() => {
    if (mountRef.current && !isInitialized) {
      console.log('🎬 Scene3D: Initializing 3D scene...');
      console.log('🎬 Scene3D: Container dimensions:', {
        width: mountRef.current.clientWidth,
        height: mountRef.current.clientHeight
      });
      
      initializeScene(mountRef.current, {
        width: mountRef.current.clientWidth,
        height: mountRef.current.clientHeight
      }).then(() => {
        console.log('✅ Scene3D: Scene initialized successfully');
        setIsInitialized(true);
        startRenderLoop();
        console.log('🎬 Scene3D: Render loop started');
      }).catch(error => {
        console.error('❌ Scene3D: Failed to initialize scene:', error);
        console.error('❌ Scene3D: Error details:', {
          message: error.message,
          stack: error.stack,
          container: mountRef.current,
          dimensions: {
            width: mountRef.current?.clientWidth,
            height: mountRef.current?.clientHeight
          }
        });
      });
    }
  }, [initializeScene, startRenderLoop, isInitialized]);

  // Monitor stats when enabled
  useEffect(() => {
    if (!showStats || !sceneManager) return;

    let animationId;
    let lastTime = performance.now();
    let frameCount = 0;

    const updateStats = (currentTime) => {
      frameCount++;
      
      if (currentTime - lastTime >= 1000) { // Update every second
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        
        if (sceneManager.renderer && sceneManager.renderer.info) {
          const info = sceneManager.renderer.info;
          setStats({
            fps: fps,
            triangles: info.render.triangles,
            drawCalls: info.render.calls
          });
        }
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(updateStats);
    };

    animationId = requestAnimationFrame(updateStats);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [showStats, sceneManager]);

  // Listen for stats toggle events
  useEffect(() => {
    const handleStatsToggle = (event) => {
      setShowStats(event.detail.showStats);
    };

    window.addEventListener('statsToggle', handleStatsToggle);
    
    return () => {
      window.removeEventListener('statsToggle', handleStatsToggle);
    };
  }, []);

  // Handle render mode changes
  useEffect(() => {
    if (renderMode && renderMode !== currentRenderMode) {
      updateRenderMode(renderMode);
    }
  }, [renderMode, currentRenderMode, updateRenderMode]);

  // Load Core3D design when it changes
  useEffect(() => {
    if (!isInitialized || !sceneManager || !currentDesign) return;

    const loadCore3DDesign = async () => {
      try {
        console.log('🎨 Scene3D: Loading Core3D design:', currentDesign);
        
        // If design has a 3D model URL, load it
        if (currentDesign.model_url) {
          await sceneManager.loadModel(currentDesign.model_url, {
            format: 'auto',
            optimize: true,
            center: true,
            scale: 1
          });
          console.log('✅ Scene3D: Core3D design loaded successfully');
        } else if (currentDesign.preview_url) {
          // If only preview available, show as texture on a plane
          console.log('📸 Scene3D: Loading Core3D design preview as texture');
          const THREE = await import('three');
          const geometry = new THREE.PlaneGeometry(2, 2);
          const textureLoader = new THREE.TextureLoader();
          const texture = textureLoader.load(currentDesign.preview_url);
          const material = new THREE.MeshBasicMaterial({ 
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
          });
          
          const plane = new THREE.Mesh(geometry, material);
          sceneManager.scene.add(plane);
          console.log('✅ Scene3D: Core3D design preview loaded');
        }
      } catch (error) {
        console.error('❌ Scene3D: Failed to load Core3D design:', error);
      }
    };

    loadCore3DDesign();
  }, [isInitialized, sceneManager, currentDesign]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (mountRef.current && isInitialized) {
        console.log('🔄 Scene3D: Handling window resize...');
        const container = mountRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        console.log('🔄 Scene3D: New dimensions:', { width, height });
        
        // Update camera aspect ratio
        if (sceneManager && sceneManager.camera) {
          sceneManager.camera.aspect = width / height;
          sceneManager.camera.updateProjectionMatrix();
        }
        
        // Update renderer size
        if (sceneManager && sceneManager.renderer) {
          sceneManager.renderer.setSize(width, height);
          console.log('✅ Scene3D: Renderer resized successfully');
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isInitialized, sceneManager]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInitialized) {
        console.log('🧹 Cleaning up 3D scene...');
        // The SceneContext will handle the cleanup via its useEffect
      }
    };
  }, [isInitialized]);

  // Button handlers for CharacterStudio features
  const handleVRMExport = async () => {
    if (!currentModel) {
      alert('No model loaded to export');
      return;
    }
    try {
      await exportModel('vrm');
      alert('VRM exported successfully!');
    } catch (error) {
      alert(`VRM export failed: ${error.message}`);
    }
  };

  const handleGLBExport = async () => {
    if (!currentModel) {
      alert('No model loaded to export');
      return;
    }
    try {
      await exportModel('glb');
      alert('GLB exported successfully!');
    } catch (error) {
      alert(`GLB export failed: ${error.message}`);
    }
  };

  const handleMaterialEditor = () => {
    // Open material editor or show material panel
    alert('Material Editor - This would open the material editing interface');
  };

  const handleBlendShapes = () => {
    // Open blend shapes panel
    alert('Blend Shapes - This would open the facial expression controls');
  };

  const handleCore3DGenerate = async () => {
    if (!core3dModel || !core3dMaterial) {
      alert('Please select both a model and material in the Core3D panel first');
      return;
    }
    try {
      await generateDesign(core3dModel.id, core3dMaterial.id);
      alert('Core3D design generated successfully!');
    } catch (error) {
      alert(`Core3D generation failed: ${error.message}`);
    }
  };

  const handleCore3DExport = async () => {
    if (!currentDesign) {
      alert('No Core3D design to export');
      return;
    }
    try {
      await exportDesign(currentDesign.id);
      alert('Core3D design exported successfully!');
    } catch (error) {
      alert(`Core3D export failed: ${error.message}`);
    }
  };

  // Loot Assets functionality
  const handleLoadLootAssets = async () => {
    try {
      // Load loot assets manifest
      const response = await fetch('/loot-assets/loot/models/manifest.json');
      const manifest = await response.json();
      
      // Extract available traits
      const traits = manifest.traits.map(trait => ({
        name: trait.name,
        trait: trait.trait,
        icon: trait.iconSvg,
        collection: trait.collection
      }));
      
      setAvailableTraits(traits);
      setLootAssetsLoaded(true);
      alert(`Loaded ${traits.length} loot asset traits!`);
    } catch (error) {
      alert(`Failed to load loot assets: ${error.message}`);
    }
  };

  const handleLoadLootCharacter = async () => {
    if (!lootAssetsLoaded) {
      alert('Please load loot assets first');
      return;
    }
    
    try {
      // Load a default loot character (Orion body)
      const characterData = {
        body: 'orion',
        head: 'leather_cap',
        hands: 'gloves',
        shoes: 'leather_boots',
        chest: 'leather_armor',
        neck: 'amulet',
        waist: 'leather_belt'
      };
      
      setCurrentLootCharacter(characterData);
      alert('Loot character loaded! Use trait buttons to customize.');
    } catch (error) {
      alert(`Failed to load loot character: ${error.message}`);
    }
  };

  const handleRandomizeLootCharacter = () => {
    if (!lootAssetsLoaded) {
      alert('Please load loot assets first');
      return;
    }
    
    try {
      const randomCharacter = {};
      availableTraits.forEach(trait => {
        if (trait.collection && trait.collection.length > 0) {
          const randomIndex = Math.floor(Math.random() * trait.collection.length);
          randomCharacter[trait.trait.toLowerCase()] = trait.collection[randomIndex].id;
        }
      });
      
      setCurrentLootCharacter(randomCharacter);
      alert('Random loot character generated!');
    } catch (error) {
      alert(`Failed to randomize character: ${error.message}`);
    }
  };

  const handleExportLootCharacter = async () => {
    if (!currentLootCharacter) {
      alert('No loot character to export');
      return;
    }
    
    try {
      // Export the current loot character as VRM
      await exportModel('vrm');
      alert('Loot character exported successfully!');
    } catch (error) {
      alert(`Failed to export loot character: ${error.message}`);
    }
  };

  return (
    <div className="scene-3d">
      <div 
        ref={mountRef}
        className="scene-viewport"
        style={{ 
          width: '100%', 
          height: '100%',
          background: '#1a1a1a',
          position: 'relative'
        }}
      />
      
      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      )}

      {/* Stats Overlay */}
      {showStats && isInitialized && (
        <div className="stats-overlay">
          <div className="stats-panel">
            <div className="stats-title">Performance Stats</div>
            <div className="stat-item">
              <span className="stat-label">FPS:</span>
              <span className="stat-value">{stats.fps}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Triangles:</span>
              <span className="stat-value">{stats.triangles.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Draw Calls:</span>
              <span className="stat-value">{stats.drawCalls}</span>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default Scene3D;
