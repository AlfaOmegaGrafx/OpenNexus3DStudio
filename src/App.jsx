import React, { useState, useEffect, useCallback } from 'react';
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
import './App.css';

function AppContent() {
  const [isElectron, setIsElectron] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState('http://localhost:8000');
  const [skeletonActive, setSkeletonActive] = useState(false);
  
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

  // Check if there are any running tasks
  const hasRunningTasks = tasks.some(task => task.status === 'running');

  return (
    <div className="app">
      <TaskProgressBar tasks={tasks} />
      <header className="app-header">
        <div className="title-container">
          <h1 className="main-title">Open3DStudio</h1>
          <div className="audiowave-text">SPACE-TIME EDITION</div>
        </div>
        <div className="header-controls">
          <APIStatus 
            endpoint={apiEndpoint} 
            isConnected={isConnected}
            onEndpointChange={setApiEndpoint}
          />
          <RenderModeSelector 
            currentMode={renderMode}
            onModeChange={handleRenderModeChange}
            renderModeStates={renderModeStates}
            skeletonActive={skeletonActive}
            onSkeletonClick={() => {
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
          />
        </div>
      </header>

      <div className={`app-content ${hasRunningTasks ? 'has-progress' : ''}`}>
        <div className="sidebar">
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
        </div>

        <div className="main-viewport">
          <Scene3D 
            model={currentModel}
            renderMode={renderMode}
          />
        </div>
      </div>
      
      {/* Global Audio Control */}
      <GlobalAudioControl />
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