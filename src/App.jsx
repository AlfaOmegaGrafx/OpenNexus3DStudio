import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SceneProvider, useScene } from './context/SceneContext';
import { TaskProvider, useTask } from './context/TaskContext';
import { AudioProvider } from './context/AudioContext';
import { SoundProvider } from './context/SoundContext';
import Scene3D from './components/Scene3D';
import TaskManager from './components/TaskManager';
import CombinedImport from './components/CombinedImport';
import RenderModeSelector from './components/RenderModeSelector';
import APIStatus from './components/APIStatus';
import GLBExport from './components/GLBExport';
import VRMExport from './components/VRMExport';
import BlendShapeController from './components/BlendShapeController';
import TaskProgressBar from './components/TaskProgressBar';
import GlobalAudioControl from './components/GlobalAudioControl';
import { sceneInitializer } from './library/sceneInitializer';
import { sharedHDRManager } from './library/sharedHDRManager';

// Import CharacterStudio pages (simplified versions)
import AppearanceSimple from './pages/AppearanceSimple';
import SaveSimple from './pages/SaveSimple';
import MintSimple from './pages/MintSimple';
import LoadSimple from './pages/LoadSimple';
import './App.css';

function AppContent() {
  const [isElectron, setIsElectron] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState('http://localhost:8000');
  const [skeletonActive, setSkeletonActive] = useState(false);
  const [currentPanel, setCurrentPanel] = useState('appearance'); // Panel state - default to appearance
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Sidebar collapse state
  const [characterStudioSidebarCollapsed, setCharacterStudioSidebarCollapsed] = useState(true); // CharacterStudio sidebar collapse state - default to collapsed
  const [characterStudioViewportVisible, setCharacterStudioViewportVisible] = useState(true); // CharacterStudio 3D viewport visibility
  const [characterStudioInitialized, setCharacterStudioInitialized] = useState(false);
  const characterStudioRef = useRef(null);
  
  // Debug class changes
  useEffect(() => {
    console.log('🔍 Class Debug:', {
      sidebarCollapsed,
      characterStudioSidebarCollapsed,
      hasCharacterStudio: !characterStudioSidebarCollapsed,
      mainSidebarCollapsed: sidebarCollapsed
    });
  }, [sidebarCollapsed, characterStudioSidebarCollapsed]);
  
  // Synchronized hamburger handlers - when one expands, the other collapses
  const handleLeftHamburgerClick = () => {
    if (sidebarCollapsed) {
      // Left hamburger is expanding - collapse right hamburger and main viewport
      setSidebarCollapsed(false);
      setCharacterStudioSidebarCollapsed(true);
      // Main viewport expands when left hamburger expands
    } else {
      // Left hamburger is collapsing - expand right hamburger and collapse main viewport
      setSidebarCollapsed(true);
      setCharacterStudioSidebarCollapsed(false);
      // Main viewport collapses when left hamburger collapses
    }
  };

  const handleRightHamburgerClick = () => {
    if (characterStudioSidebarCollapsed) {
      // Right hamburger is expanding - collapse left hamburger and main viewport
      setCharacterStudioSidebarCollapsed(false);
      setSidebarCollapsed(true);
      // Main viewport collapses when right hamburger expands
    } else {
      // Right hamburger is collapsing - expand left hamburger and main viewport
      setCharacterStudioSidebarCollapsed(true);
      setSidebarCollapsed(false);
      // Main viewport expands when right hamburger collapses
    }
  };

  // CharacterStudio menu cycling
  const characterStudioMenus = ['appearance', 'save', 'mint', 'load'];
  const [currentMenuIndex, setCurrentMenuIndex] = useState(0); // Default to appearance (index 0)
  
  const handleCharacterStudioNavigation = (direction) => {
    if (direction === 'next') {
      const nextIndex = (currentMenuIndex + 1) % characterStudioMenus.length;
      setCurrentMenuIndex(nextIndex);
      setCurrentPanel(characterStudioMenus[nextIndex]);
    } else if (direction === 'back') {
      const prevIndex = currentMenuIndex === 0 ? characterStudioMenus.length - 1 : currentMenuIndex - 1;
      setCurrentMenuIndex(prevIndex);
      setCurrentPanel(characterStudioMenus[prevIndex]);
    }
  };
  
  // Track render mode states
  const [renderModeStates, setRenderModeStates] = useState({
    solid: true, // Start with solid mode active
    rendered: false,
    wireframe: false,
    skeleton: false,
    partColorize: false
  });
  
  const { 
    isInitialized,
    currentModel,
    renderMode,
    isLoading: sceneLoading,
    loadModel,
    updateRenderMode,
    clearModel,
    exportModel,
    startRenderLoop,
    getSceneData,
    sceneManager
  } = useScene();
  
  const {
    isConnected,
    tasks,
    isLoading: taskLoading,
    checkConnection,
    forceConnectionCheck,
    setApiEndpoint: setTaskApiEndpoint,
    createAndStartTask,
    removeTask,
    clearCompletedTasks
  } = useTask();

  // Check if running in Electron
  useEffect(() => {
    setIsElectron(!!window.electronAPI);
  }, []);

  // Handle task completion and auto-load generated models
  useEffect(() => {
    const handleTaskCompleted = (event) => {
      const { taskId, result } = event.detail;
      console.log('App: Task completed, loading model:', result);
      
      if (result && result.modelUrl) {
        // Load the generated model into the viewport
        const modelUrl = result.modelUrl.startsWith('/') ? 
          `http://localhost:8000${result.modelUrl}` : 
          result.modelUrl;
        
        console.log('App: Loading model from URL:', modelUrl);
        loadModel(modelUrl).catch(error => {
          console.error('App: Failed to load generated model:', error);
        });
      }
    };

    window.addEventListener('taskCompleted', handleTaskCompleted);
    
    return () => {
      window.removeEventListener('taskCompleted', handleTaskCompleted);
    };
  }, [loadModel]);

  // Handle render mode changes with state tracking
  const handleRenderModeChange = useCallback((mode) => {
    console.log('Render mode change requested:', mode);
    
    // Update render mode states - toggle the selected mode
    setRenderModeStates(prev => {
      const newStates = { ...prev };
      
      // If clicking the same mode, toggle it off
      if (prev[mode]) {
        newStates[mode] = false;
        // If toggling off, switch to solid mode
        updateRenderMode('solid');
        newStates.solid = true;
      } else {
        // Turn off all other modes and turn on the selected one
        Object.keys(newStates).forEach(key => {
          newStates[key] = key === mode;
        });
        updateRenderMode(mode);
      }
      
      return newStates;
    });
  }, [updateRenderMode]);

  // Sync API endpoint with TaskContext
  useEffect(() => {
    setTaskApiEndpoint(apiEndpoint);
  }, [apiEndpoint, setTaskApiEndpoint]);

  // Check API connection
  useEffect(() => {
    const checkApiConnection = async () => {
      await checkConnection();
    };

    checkApiConnection();
    const interval = setInterval(checkApiConnection, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [checkConnection]);

  // Handle file loading
  const handleFileLoad = useCallback(async (file) => {
    try {
      await loadModel(file);
    } catch (error) {
      console.error('Error loading file:', error);
      
      // Show user-friendly error message
      if (error.message.includes('Unsupported file format')) {
        alert(`❌ ${error.message}\n\nPlease try uploading a supported 3D model file (.glb, .gltf, .obj, .fbx, or .vrm)`);
      } else {
        alert(`❌ Failed to load file: ${error.message}`);
      }
    }
  }, [loadModel]);

  // Handle AI generation tasks
  const handleAITask = useCallback(async (taskType, prompt, imageFile = null) => {
    console.log('App: handleAITask called with:', { taskType, prompt, imageFile });
    try {
      const result = await createAndStartTask({
        type: taskType,
        prompt,
        imageFile
      });
      console.log('App: createAndStartTask result:', result);
    } catch (error) {
      console.error(`Error in ${taskType}:`, error);
    }
  }, [createAndStartTask]);

  // Handle menu events from Electron
  useEffect(() => {
    if (isElectron && window.electronAPI) {
      const handleNewProject = () => {
        clearModel();
      };

      const handleOpen = async () => {
        const result = await window.electronAPI.openFileDialog();
        if (!result.canceled && result.filePaths.length > 0) {
          // Handle file opening logic here
          console.log('Opening file:', result.filePaths[0]);
        }
      };

      const handleSave = () => {
        // Handle save logic here
        console.log('Saving project');
      };

      window.electronAPI.onMenuNewProject(handleNewProject);
      window.electronAPI.onMenuOpen(handleOpen);
      window.electronAPI.onMenuSave(handleSave);

      return () => {
        window.electronAPI.removeAllListeners('menu-new-project');
        window.electronAPI.removeAllListeners('menu-open');
        window.electronAPI.removeAllListeners('menu-save');
      };
    }
  }, [isElectron, clearModel]);

  // Initialize CharacterStudio 3D renderer
  useEffect(() => {
    const initCharacterStudio = async () => {
      if (!characterStudioRef.current || characterStudioInitialized) return;
      
      try {
        console.log('🎬 Initializing CharacterStudio 3D renderer...');
        const characterStudioScene = await sceneInitializer('character-studio-scene');
        characterStudioRef.current = characterStudioScene;
        setCharacterStudioInitialized(true);
        console.log('✅ CharacterStudio 3D renderer initialized');
      } catch (error) {
        console.error('❌ Failed to initialize CharacterStudio renderer:', error);
      }
    };

    initCharacterStudio();
  }, [characterStudioInitialized]);

  // Sync model between main scene and CharacterStudio
  useEffect(() => {
    if (!characterStudioInitialized || !characterStudioRef.current || !currentModel) return;

    const syncModelToCharacterStudio = async () => {
      try {
        console.log('🔄 Syncing model to CharacterStudio renderer...');
        
        // Get the CharacterStudio scene and character manager
        const { scene, characterManager } = characterStudioRef.current;
        
        // Create a URL for the model if it's a File object
        let modelUrl;
        if (currentModel instanceof File) {
          modelUrl = URL.createObjectURL(currentModel);
        } else if (typeof currentModel === 'string') {
          modelUrl = currentModel;
        } else {
          console.warn('Unsupported model type for CharacterStudio sync:', typeof currentModel);
          return;
        }
        
        // Load the model into CharacterStudio using direct VRM loading
        if (characterManager) {
          // Try to load VRM directly into the character model
          try {
            // Clear existing character model
            if (characterManager.characterModel) {
              characterManager.characterModel.clear();
            }
            
            // Load VRM directly using the GLTFLoader with VRM plugin
            const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader');
            const { VRMLoaderPlugin } = await import('@pixiv/three-vrm');
            
            const gltfLoader = new GLTFLoader();
            gltfLoader.register((parser) => {
              return new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true });
            });
            
            const gltf = await gltfLoader.loadAsync(modelUrl);
            const vrm = gltf.userData.vrm;
            
            if (vrm && vrm.scene) {
              // Add the VRM to the character model
              characterManager.characterModel.add(vrm.scene);
              console.log('✅ VRM loaded directly into CharacterStudio renderer');
            } else {
              console.error('❌ Failed to load VRM - no VRM data found');
            }
          } catch (error) {
            console.error('❌ Failed to load VRM directly:', error);
            // Fallback to optimizer character method
            if (characterManager.loadOptimizerCharacter) {
              await characterManager.loadOptimizerCharacter(modelUrl);
              console.log('✅ Model synced to CharacterStudio renderer (fallback)');
            }
          }
          
          // Clean up object URL if we created one
          if (currentModel instanceof File) {
            URL.revokeObjectURL(modelUrl);
          }
        }
      } catch (error) {
        console.error('❌ Failed to sync model to CharacterStudio:', error);
      }
    };

    syncModelToCharacterStudio();
  }, [currentModel, characterStudioInitialized]);

  // Handle viewport visibility changes - pause/resume render loop based on sidebar state
  useEffect(() => {
    if (!characterStudioInitialized || !characterStudioRef.current) return;

    const { pauseRendering, resumeRendering } = characterStudioRef.current;
    
    if (!characterStudioSidebarCollapsed && characterStudioViewportVisible) {
      console.log('🎮 Resuming CharacterStudio render loop (sidebar open and viewport visible)');
      resumeRendering();
      // Re-apply HDR environment to all scenes
      sharedHDRManager.applyToAllScenes();
    } else {
      console.log('⏸️ Pausing CharacterStudio render loop (sidebar collapsed or viewport hidden)');
      pauseRendering();
      // Clear HDR environment from all scenes to save memory
      sharedHDRManager.clearFromAllScenes();
    }
  }, [characterStudioSidebarCollapsed, characterStudioViewportVisible, characterStudioInitialized]);

  // Note: Removed incorrect main viewport control
  // The CharacterStudio viewport should operate independently from the main viewport

  // Check if there are any running tasks
  const hasRunningTasks = tasks.some(task => task.status === 'running');

  return (
    <div className="app">
      <TaskProgressBar tasks={tasks} />
      <header className="app-header">
        <div className="title-container">
          <h1 className="main-title">Open3DStudio:</h1>
          <div className="audiowave-text">
            <div className="space-time-row">
              <span className="space-time">SPACE-TIME</span>
            </div>
            <div className="edition-row">
              <span className="edition">EDITION</span>
            </div>
          </div>
          <div className="title-api-control">
            <div className="api-status-compact">
              <div 
                className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}
              />
              <span className="status-text">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
        <div className="header-controls">
          {/* Audio Controls */}
          <div className="header-section audio-section">
            <div className="header-section-title">Audio</div>
            <div className="header-controls-group">
              <GlobalAudioControl />
            </div>
          </div>

          {/* File Operations */}
          <div className="header-section two-button-section">
            <div className="header-section-title">File</div>
            <div className="header-controls-group">
              <button 
                className="header-btn"
                onClick={() => document.querySelector('input[type="file"]')?.click()}
                title="Import File"
              >
                📁 Import
              </button>
              <button 
                className="header-btn"
                onClick={() => {
                  if (currentModel) {
                    exportModel('glb', { filename: 'export.glb' });
                  } else {
                    alert('No model to export');
                  }
                }}
                title="Export GLB"
              >
                📤 Export
              </button>
            </div>
          </div>

          {/* AI Tasks */}
          <div className="header-section two-button-section">
            <div className="header-section-title">AI</div>
            <div className="header-controls-group">
              <button 
                className="header-btn"
                onClick={() => {
                  const userPrompt = window.prompt('Enter text-to-3D prompt:');
                  if (userPrompt) {
                    handleAITask('text-to-3d', userPrompt);
                  }
                }}
                disabled={!isConnected}
                title="Text to 3D"
              >
                ✨ Text-3D
              </button>
              <button 
                className="header-btn"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => {
                    if (e.target.files[0]) {
                      handleAITask('image-to-3d', 'Convert image to 3D', e.target.files[0]);
                    }
                  };
                  input.click();
                }}
                disabled={!isConnected}
                title="Image to 3D"
              >
                🖼️ Image-3D
              </button>
            </div>
          </div>

          {/* Render Modes */}
          <div className="header-section three-button-section">
            <div className="header-section-title">Render</div>
            <div className="header-controls-group">
              <button 
                className={`header-btn ${renderModeStates.solid ? 'active' : ''}`}
                onClick={() => handleRenderModeChange('solid')}
                title="Solid Mode"
              >
                🔲 Solid
              </button>
              <button 
                className={`header-btn ${renderModeStates.wireframe ? 'active' : ''}`}
                onClick={() => handleRenderModeChange('wireframe')}
                title="Wireframe Mode"
              >
                📐 Wire
              </button>
              <button 
                className={`header-btn ${renderModeStates.skeleton ? 'active' : ''}`}
                onClick={() => {
              console.log('Skeleton button clicked, current skeletonActive:', skeletonActive);
              const newSkeletonActive = !skeletonActive;
              setSkeletonActive(newSkeletonActive);
              
              if (newSkeletonActive) {
                // SKELETON ON: Activate skeleton mode
                console.log('Activating skeleton mode');
                
                // 1. Set render mode to skeleton (direct call, not through handleRenderModeChange)
                updateRenderMode('skeleton');
                
                // 2. Update render mode states
                setRenderModeStates(prev => {
                  const newStates = { ...prev };
                  Object.keys(newStates).forEach(key => {
                    newStates[key] = key === 'skeleton';
                  });
                  return newStates;
                });
                
                // 3. Control panels via blendShapeControls
                if (window.blendShapeControls) {
                  console.log('Skeleton ON - hiding blend shapes, showing bone structure');
                  window.blendShapeControls.setBlendShapesVisible(false); // Collapse blend shapes
                  window.blendShapeControls.setBonePanelVisible(true);   // Expand bone structure
                  
                  // 4. Auto-scroll to bone structure panel
                  setTimeout(() => {
                    const bonePanel = document.querySelector('.bone-structure-panel');
                    if (bonePanel) {
                      bonePanel.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest'
                      });
                      console.log('Scrolled to bone structure panel');
                    } else {
                      console.log('Bone structure panel not found for scrolling');
                    }
                  }, 100); // Small delay to ensure panel is rendered
                } else {
                  console.log('window.blendShapeControls not available');
                }
              } else {
                // SKELETON OFF: Return to normal mode
                console.log('Deactivating skeleton mode');
                
                // 1. Set render mode back to solid (direct call, not through handleRenderModeChange)
                updateRenderMode('solid');
                
                // 2. Update render mode states
                setRenderModeStates(prev => {
                  const newStates = { ...prev };
                  Object.keys(newStates).forEach(key => {
                    newStates[key] = key === 'solid';
                  });
                  return newStates;
                });
                
                // 3. Control panels via blendShapeControls
                if (window.blendShapeControls) {
                  console.log('Skeleton OFF - showing blend shapes, hiding bone structure');
                  window.blendShapeControls.setBlendShapesVisible(true);  // Expand blend shapes
                  window.blendShapeControls.setBonePanelVisible(false);  // Collapse bone structure
                  
                  // 4. Auto-scroll to blend shapes panel
                  setTimeout(() => {
                    const blendShapesPanel = document.querySelector('.blend-shape-controller');
                    if (blendShapesPanel) {
                      blendShapesPanel.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start',
                        inline: 'nearest'
                      });
                      console.log('Scrolled to blend shapes panel');
                    } else {
                      console.log('Blend shapes panel not found for scrolling');
                    }
                  }, 100); // Small delay to ensure panel is rendered
                } else {
                  console.log('window.blendShapeControls not available');
                }
              }
            }}
                title="Skeleton Mode"
              >
                🦴 Skeleton
              </button>
            </div>
          </div>

          {/* Task Status */}
          <div className="header-section single-button-section">
            <div className="header-section-title">Tasks</div>
            <div className="header-controls-group">
              <div className="task-status-compact">
                <div className="task-count">
                  {tasks.length > 0 && (
                    <span className="task-badge">
                      {tasks.filter(t => t.status === 'running').length} running
                    </span>
                  )}
                </div>
                <button 
                  className="header-btn"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      if (e.target.files[0]) {
                        handleAITask('mesh-painting', 'Paint mesh', e.target.files[0]);
                      }
                    };
                    input.click();
                  }}
                  disabled={!isConnected}
                  title="Mesh Painting"
                >
                  🎨 Paint
                </button>
              </div>
            </div>
          </div>

          {/* CharacterStudio Panels - Moved to end */}
          <div className="header-section four-button-section">
            <div className="header-section-title">Studio</div>
            <div className="header-controls-group studio-controls">
              <button 
                className={`header-btn studio-btn ${currentPanel === 'appearance' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPanel('appearance');
                  setCurrentMenuIndex(0);
                  setCharacterStudioSidebarCollapsed(false);
                }}
                title="Character Appearance"
              >
                👤
              </button>
              <button 
                className={`header-btn studio-btn ${currentPanel === 'save' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPanel('save');
                  setCurrentMenuIndex(1);
                  setCharacterStudioSidebarCollapsed(false);
                }}
                title="Save Character"
              >
                💾
              </button>
              <button 
                className={`header-btn studio-btn ${currentPanel === 'mint' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPanel('mint');
                  setCurrentMenuIndex(2);
                  setCharacterStudioSidebarCollapsed(false);
                }}
                title="Mint Character"
              >
                🪙
              </button>
              <button 
                className={`header-btn studio-btn ${currentPanel === 'load' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPanel('load');
                  setCurrentMenuIndex(3);
                  setCharacterStudioSidebarCollapsed(false);
                }}
                title="Load Character"
              >
                📁
              </button>
              <button 
                className={`header-btn studio-btn ${characterStudioViewportVisible ? 'active' : ''}`}
                onClick={() => {
                  setCharacterStudioViewportVisible(!characterStudioViewportVisible);
                }}
                title="Toggle CharacterStudio 3D Viewport"
              >
                🎮
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* Anchored Hamburger Menus */}
      <button
        className="anchored-left-hamburger"
        onClick={handleLeftHamburgerClick}
        title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        <div className="hamburger-icon">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>

      <button
        className="anchored-right-hamburger"
        onClick={handleRightHamburgerClick}
        title={characterStudioSidebarCollapsed ? 'Expand CharacterStudio' : 'Collapse CharacterStudio'}
      >
        <div className="hamburger-icon">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>

      {/* Removed redundant viewport toggle - now controlled by sidebar */}

      <div className={`app-content ${hasRunningTasks ? 'has-progress' : ''} ${!characterStudioSidebarCollapsed ? 'has-character-studio' : ''} ${sidebarCollapsed ? 'main-sidebar-collapsed' : ''}`}>
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {/* Hamburger Menu Button */}
          <button 
            className="hamburger-menu"
            onClick={handleLeftHamburgerClick}
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <div className="hamburger-icon">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

            {/* Collapsed Sidebar Icons */}
            {sidebarCollapsed && (
              <div className="collapsed-sidebar-icons">
                <button 
                  className="sidebar-icon"
                  onClick={() => document.querySelector('input[type="file"]')?.click()}
                  data-tooltip="Import Files"
                  title="Import Files"
                >
                  📁
                </button>
                <button 
                  className="sidebar-icon"
                  onClick={() => {
                    setSkeletonActive(!skeletonActive);
                  }}
                  data-tooltip="Toggle Skeleton"
                  title="Toggle Skeleton"
                >
                  👤
                </button>
                <button 
                  className="sidebar-icon"
                  onClick={() => {
                    if (currentModel) {
                      exportModel('glb', { filename: 'export.glb' });
                    } else {
                      alert('No model to export');
                    }
                  }}
                  data-tooltip="Export GLB"
                  title="Export GLB"
                >
                  📤
                </button>
                <button 
                  className="sidebar-icon"
                  onClick={() => {
                    const userPrompt = window.prompt('Enter text-to-3D prompt:');
                    if (userPrompt) {
                      handleAITask('text-to-3d', userPrompt);
                    }
                  }}
                  data-tooltip="AI Text-to-3D"
                  title="AI Text-to-3D"
                >
                  🎭
                </button>
                <button 
                  className="sidebar-icon"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      if (e.target.files[0]) {
                        handleAITask('image-to-3d', null, e.target.files[0]);
                      }
                    };
                    input.click();
                  }}
                  data-tooltip="AI Image-to-3D"
                  title="AI Image-to-3D"
                >
                  🤖
                </button>
              </div>
            )}

          {/* Full Sidebar Content */}
          {!sidebarCollapsed && (
            <>
          <CombinedImport onFileLoad={handleFileLoad} />
          <BlendShapeController 
            sceneManager={sceneManager}
            currentModel={currentModel}
            isVisible={true}
            onToggle={(controls) => {
              // Store the controls for use by skeleton button
              window.blendShapeControls = controls;
            }}
            isActive={skeletonActive}
          />
          <GLBExport />
          <VRMExport />
          <TaskManager 
            tasks={tasks}
            onAITask={handleAITask}
            isApiConnected={isConnected}
          />
          {/* Debug info */}
          <div style={{ background: '#333', padding: '10px', margin: '10px 0', borderRadius: '4px', fontSize: '12px' }}>
            <div>API Connected: {isConnected ? 'YES' : 'NO'}</div>
            <div>Tasks: {tasks.length}</div>
            <div>Tasks: {JSON.stringify(tasks.map(t => ({ id: t.id, status: t.status, name: t.name })))}</div>
            <div>API Endpoint: {apiEndpoint}</div>
            <button 
              onClick={forceConnectionCheck}
              style={{ 
                background: '#007bff', 
                color: 'white', 
                border: 'none', 
                padding: '5px 10px', 
                borderRadius: '3px', 
                cursor: 'pointer',
                marginTop: '5px'
              }}
            >
              Force Check Connection
            </button>
          </div>
            </>
          )}
        </div>

        <div className="main-viewport">
          <Scene3D 
            model={currentModel}
            renderMode={renderMode}
          />
          
          {/* CharacterStudio 3D Renderer - Overlay on main viewport */}
          <div 
            className="character-studio-viewport-overlay"
            style={{
              opacity: (!characterStudioSidebarCollapsed && characterStudioViewportVisible) ? 1 : 0,
              visibility: (!characterStudioSidebarCollapsed && characterStudioViewportVisible) ? 'visible' : 'hidden',
              transform: (!characterStudioSidebarCollapsed && characterStudioViewportVisible) ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
              display: (!characterStudioSidebarCollapsed && characterStudioViewportVisible) ? 'flex' : 'none',
              transition: 'opacity 0.3s ease, transform 0.3s ease, visibility 0.3s ease'
            }}
          >
            <div className="character-studio-viewport-title">
              CharacterStudio 3D View 
              <span style={{ 
                color: !characterStudioSidebarCollapsed ? '#00ff00' : '#ff0000',
                fontSize: '12px',
                marginLeft: '10px'
              }}>
                {!characterStudioSidebarCollapsed ? 'VISIBLE' : 'HIDDEN'}
              </span>
            </div>
            <div 
              id="character-studio-scene" 
              className="character-studio-viewport-canvas"
              style={{ width: '100%', height: '625px', background: 'transparent' }}
              onDrop={(e) => {
                e.preventDefault();
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                  console.log('📁 File dropped on CharacterStudio renderer:', files[0].name);
                  // Handle file drop - could sync with main scene or load directly
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => e.preventDefault()}
            />
            {!characterStudioInitialized && (
              <div style={{ 
                position: 'absolute', 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)', 
                color: '#ccc', 
                fontSize: '14px',
                textAlign: 'center'
              }}>
                Initializing CharacterStudio 3D Renderer...
              </div>
            )}
          </div>
        </div>

        {/* CharacterStudio Sidebar */}
        <div className={`character-studio-sidebar ${characterStudioSidebarCollapsed ? 'collapsed' : ''}`}>
          {/* CharacterStudio Sticky Hamburger Menu - Always Visible */}
          <button 
            className="character-studio-sticky-hamburger"
            onClick={handleRightHamburgerClick}
            title={characterStudioSidebarCollapsed ? 'Expand CharacterStudio' : 'Collapse CharacterStudio'}
          >
            <div className="hamburger-icon">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

          {/* Collapsed CharacterStudio Sidebar Icons */}
          {characterStudioSidebarCollapsed && (
            <div className="collapsed-character-studio-icons">
              <button 
                className={`character-studio-sidebar-icon ${currentPanel === 'appearance' ? 'active' : ''}`}
                onClick={() => {
                  setCharacterStudioSidebarCollapsed(false);
                  setCurrentPanel('appearance');
                  setCurrentMenuIndex(0);
                }}
                data-tooltip="Character Appearance"
                title="Character Appearance"
              >
                👤
              </button>
              <button 
                className={`character-studio-sidebar-icon ${currentPanel === 'save' ? 'active' : ''}`}
                onClick={() => {
                  setCharacterStudioSidebarCollapsed(false);
                  setCurrentPanel('save');
                  setCurrentMenuIndex(1);
                }}
                data-tooltip="Save Character"
                title="Save Character"
              >
                💾
              </button>
              <button 
                className={`character-studio-sidebar-icon ${currentPanel === 'mint' ? 'active' : ''}`}
                onClick={() => {
                  setCharacterStudioSidebarCollapsed(false);
                  setCurrentPanel('mint');
                  setCurrentMenuIndex(2);
                }}
                data-tooltip="Mint Character"
                title="Mint Character"
              >
                🪙
              </button>
              <button 
                className={`character-studio-sidebar-icon ${currentPanel === 'load' ? 'active' : ''}`}
                onClick={() => {
                  setCharacterStudioSidebarCollapsed(false);
                  setCurrentPanel('load');
                  setCurrentMenuIndex(3);
                }}
                data-tooltip="Load Character"
                title="Load Character"
              >
                📁
              </button>
              <button 
                className={`character-studio-sidebar-icon ${characterStudioViewportVisible ? 'active' : ''}`}
                onClick={() => {
                  setCharacterStudioViewportVisible(!characterStudioViewportVisible);
                }}
                data-tooltip="Toggle 3D Viewport"
                title="Toggle CharacterStudio 3D Viewport"
              >
                🎮
              </button>
            </div>
          )}

          {/* Full CharacterStudio Sidebar Content */}
          {!characterStudioSidebarCollapsed && (
            <div className="character-studio-content">
              <div className="character-studio-header">
                <h3 className="character-studio-title">CharacterStudio</h3>
              </div>
              <div className="character-studio-panels">
                {currentPanel === 'appearance' && <AppearanceSimple onNavigate={handleCharacterStudioNavigation} />}
                {currentPanel === 'save' && <SaveSimple onNavigate={handleCharacterStudioNavigation} />}
                {currentPanel === 'mint' && <MintSimple onNavigate={handleCharacterStudioNavigation} />}
                {currentPanel === 'load' && <LoadSimple onNavigate={handleCharacterStudioNavigation} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AudioProvider>
      <SoundProvider>
        <SceneProvider>
          <TaskProvider>
            <AppContent />
          </TaskProvider>
        </SceneProvider>
      </SoundProvider>
    </AudioProvider>
  );
}

export default App;