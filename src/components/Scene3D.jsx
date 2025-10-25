import React, { useRef, useEffect, useState } from 'react';
import { useScene } from '../context/SceneContext';
import { useCore3D } from '../context/Core3DContext';

const Scene3D = ({ model, renderMode, showCharacterStudioOverlay = false }) => {
  const mountRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);

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

  // Handle render mode changes
  useEffect(() => {
    if (renderMode && renderMode !== currentRenderMode) {
      updateRenderMode(renderMode);
    }
  }, [renderMode, currentRenderMode, updateRenderMode]);

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
        style={{ width: '100%', height: '100%' }}
      />
      
      
      {/* CharacterStudio Overlay - Integrated into main viewer */}
      {showCharacterStudioOverlay && (
        <div className="character-studio-overlay">
          <div className="character-studio-overlay-title">
            CharacterStudio 3D View 
            <span className="overlay-status">VISIBLE</span>
          </div>
          <div className="character-studio-overlay-content">
            <div className="overlay-info">
              <p>Enhanced 3D viewing with CharacterStudio features</p>
              
              {/* Export Tools Section */}
              <div className="overlay-section">
                <h4>Export Tools</h4>
                <div className="overlay-buttons">
                  <button 
                    onClick={handleVRMExport}
                    className="overlay-button vrm-button"
                    disabled={!currentModel}
                    title="Export current model as VRM"
                  >
                    🎭 Export VRM
                  </button>
                  <button 
                    onClick={handleGLBExport}
                    className="overlay-button glb-button"
                    disabled={!currentModel}
                    title="Export current model as GLB"
                  >
                    📦 Export GLB
                  </button>
                </div>
              </div>

              {/* CharacterStudio Features */}
              <div className="overlay-section">
                <h4>CharacterStudio Features</h4>
                <div className="overlay-buttons">
                  <button 
                    onClick={handleMaterialEditor}
                    className="overlay-button material-button"
                    title="Open material editor"
                  >
                    🎨 Material Editor
                  </button>
                  <button 
                    onClick={handleBlendShapes}
                    className="overlay-button blend-button"
                    title="Open blend shapes controls"
                  >
                    ✨ Blend Shapes
                  </button>
                </div>
              </div>

              {/* Core3D Integration */}
              {core3dInitialized && (
                <div className="overlay-section">
                  <h4>Core3D Integration</h4>
                  <div className="overlay-buttons">
                    <button 
                      onClick={handleCore3DGenerate}
                      className="overlay-button core3d-generate-button"
                      disabled={!core3dModel || !core3dMaterial}
                      title="Generate Core3D design with selected model and material"
                    >
                      ✨ Generate Design
                    </button>
                    <button 
                      onClick={handleCore3DExport}
                      className="overlay-button core3d-export-button"
                      disabled={!currentDesign}
                      title="Export current Core3D design"
                    >
                      📤 Export Design
                    </button>
                  </div>
                </div>
              )}

              {/* Loot Assets Integration */}
              <div className="overlay-section">
                <h4>Loot Assets</h4>
                <div className="overlay-buttons">
                  <button 
                    onClick={handleLoadLootAssets}
                    className="overlay-button loot-load-button"
                    disabled={lootAssetsLoaded}
                    title="Load loot assets manifest and traits"
                  >
                    🎒 Load Assets
                  </button>
                  <button 
                    onClick={handleLoadLootCharacter}
                    className="overlay-button loot-character-button"
                    disabled={!lootAssetsLoaded}
                    title="Load default loot character"
                  >
                    👤 Load Character
                  </button>
                  <button 
                    onClick={handleRandomizeLootCharacter}
                    className="overlay-button loot-random-button"
                    disabled={!lootAssetsLoaded}
                    title="Generate random loot character"
                  >
                    🎲 Randomize
                  </button>
                  <button 
                    onClick={handleExportLootCharacter}
                    className="overlay-button loot-export-button"
                    disabled={!currentLootCharacter}
                    title="Export current loot character as VRM"
                  >
                    📤 Export Character
                  </button>
                </div>
              </div>

              {/* Status Information */}
              <div className="overlay-status-info">
                <div className="status-item">
                  <span className="status-label">Model:</span>
                  <span className="status-value">{currentModel ? '✅ Loaded' : '❌ None'}</span>
                </div>
                {core3dInitialized && (
                  <div className="status-item">
                    <span className="status-label">Core3D:</span>
                    <span className="status-value">✅ Connected</span>
                  </div>
                )}
                {currentDesign && (
                  <div className="status-item">
                    <span className="status-label">Design:</span>
                    <span className="status-value">✅ Ready</span>
                  </div>
                )}
                <div className="status-item">
                  <span className="status-label">Loot Assets:</span>
                  <span className="status-value">{lootAssetsLoaded ? '✅ Loaded' : '❌ Not Loaded'}</span>
                </div>
                {currentLootCharacter && (
                  <div className="status-item">
                    <span className="status-label">Loot Character:</span>
                    <span className="status-value">✅ Ready</span>
                  </div>
                )}
                {availableTraits.length > 0 && (
                  <div className="status-item">
                    <span className="status-label">Traits:</span>
                    <span className="status-value">{availableTraits.length} Available</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      )}
    </div>
  );
};

export default Scene3D;
