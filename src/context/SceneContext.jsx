import React, { createContext, useContext, useRef, useEffect } from 'react';
import { SceneManager } from '../library/sceneManager';
import { CharacterManager } from '../library/characterManager';

export const SceneContext = createContext();

export const useScene = () => {
  const context = useContext(SceneContext);
  if (!context) {
    throw new Error('useScene must be used within a SceneProvider');
  }
  return context;
};

export const SceneProvider = ({ children }) => {
  const sceneManagerRef = useRef(null);
  const characterManagerRef = useRef(null);
  const containerRef = useRef(null);
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [currentModel, setCurrentModel] = React.useState(null);
  const [renderMode, setRenderMode] = React.useState('solid');
  const [isLoading, setIsLoading] = React.useState(false);

  // Initialize scene manager and character manager
  useEffect(() => {
    if (!sceneManagerRef.current) {
      sceneManagerRef.current = new SceneManager();
    }
    if (!characterManagerRef.current) {
      characterManagerRef.current = new CharacterManager({
        parentModel: null,
        renderCamera: null,
        manifestURL: null,
        manifestIdentifier: null
      });
    }
  }, []);

  // Setup event listeners after scene is initialized
  useEffect(() => {
    if (sceneManagerRef.current && isInitialized) {
      const handleModelLoaded = (data) => {
        // Use requestAnimationFrame to defer state update to next frame
        requestAnimationFrame(() => setCurrentModel(data.model));
      };

      const handleModelCleared = () => {
        // Use requestAnimationFrame to defer state update to next frame
        requestAnimationFrame(() => setCurrentModel(null));
      };

      const handleRenderModeChanged = (data) => {
        // Use requestAnimationFrame to defer state update to next frame
        requestAnimationFrame(() => setRenderMode(data.mode));
      };

      const handleBoneSelected = (data) => {
        console.log('Bone selected:', data.boneName);
        // You can add additional handling here if needed
      };

      const handleBoneDeselected = (data) => {
        console.log('Bone deselected:', data.boneName);
        // You can add additional handling here if needed
      };

      sceneManagerRef.current.on('modelLoaded', handleModelLoaded);
      sceneManagerRef.current.on('modelCleared', handleModelCleared);
      sceneManagerRef.current.on('renderModeChanged', handleRenderModeChanged);
      sceneManagerRef.current.on('boneSelected', handleBoneSelected);
      sceneManagerRef.current.on('boneDeselected', handleBoneDeselected);

      // Cleanup function
      return () => {
        if (sceneManagerRef.current) {
          sceneManagerRef.current.off('modelLoaded', handleModelLoaded);
          sceneManagerRef.current.off('modelCleared', handleModelCleared);
          sceneManagerRef.current.off('renderModeChanged', handleRenderModeChanged);
          sceneManagerRef.current.off('boneSelected', handleBoneSelected);
          sceneManagerRef.current.off('boneDeselected', handleBoneDeselected);
        }
      };
    }
  }, [isInitialized]);

  // Initialize scene when container is ready
  const initializeScene = async (container, options = {}) => {
    if (!sceneManagerRef.current || !container) return;

    try {
      setIsLoading(true);
      const sceneData = await sceneManagerRef.current.initialize(container, options);
      setIsInitialized(true);
      return sceneData;
    } catch (error) {
      console.error('Failed to initialize scene:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Load model
  const loadModel = async (source, options = {}) => {
    if (!sceneManagerRef.current) return;
    
    try {
      setIsLoading(true);
      const model = await sceneManagerRef.current.loadModel(source, options);
      return model;
    } catch (error) {
      console.error('Failed to load model:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Set render mode
  const updateRenderMode = (mode) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setRenderMode(mode);
    }
  };

  // Clear current model
  const clearModel = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.clearModel();
    }
  };

  // Export model
  const exportModel = async (format = 'glb') => {
    if (sceneManagerRef.current) {
      return await sceneManagerRef.current.exportModel(format);
    }
  };

  // Start render loop
  const startRenderLoop = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.startRenderLoop();
    }
  };

  // Stop render loop
  const stopRenderLoop = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.stopRenderLoop();
    }
  };

  // Get scene data
  const getSceneData = () => {
    if (sceneManagerRef.current) {
      return {
        scene: sceneManagerRef.current.scene,
        camera: sceneManagerRef.current.camera,
        renderer: sceneManagerRef.current.renderer,
        controls: sceneManagerRef.current.controls
      };
    }
    return null;
  };

  // Scene control methods
  const setLighting = (preset) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setLighting(preset);
    }
  };

  const setLightIntensity = (intensity) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setLightIntensity(intensity);
    }
  };

  const setCameraMode = (mode) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setCameraMode(mode);
    }
  };

  const resetCamera = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.resetCamera();
    }
  };

  const focusOnFace = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.focusOnFace();
    }
  };

  const setView = (view) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setView(view);
    }
  };

  const toggleStats = (show) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.toggleStats(show);
    }
  };

  const toggleAutoRotate = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.toggleAutoRotate();
    }
  };

  const takeScreenshot = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.takeScreenshot();
    }
  };

  const toggleFullscreen = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.toggleFullscreen();
    }
  };

  const setAutoTone = (enabled) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setAutoTone(enabled);
    }
  };

  const setToneMapping = (mapping) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setToneMapping(mapping);
    }
  };

  const setExposure = (exposure) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setExposure(exposure);
    }
  };

  // Load HDR environment
  const loadHDREnvironment = (hdrPath, intensity = 0.5) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.loadHDREnvironment(hdrPath, intensity);
    }
  };

  // Enable AR mode - returns ARButton element
  const enableAR = (container = null) => {
    if (sceneManagerRef.current) {
      return sceneManagerRef.current.enableAR(container);
    }
    return null;
  };

  // Enable VR mode - returns VRButton element
  const enableVR = (container = null) => {
    if (sceneManagerRef.current) {
      return sceneManagerRef.current.enableVR(container);
    }
    return null;
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (sceneManagerRef.current) {
        sceneManagerRef.current.dispose();
      }
    };
  }, []);

  const value = {
    // State
    isInitialized,
    currentModel,
    renderMode,
    isLoading,
    
    // Actions
    initializeScene,
    loadModel,
    updateRenderMode,
    clearModel,
    exportModel,
    startRenderLoop,
    stopRenderLoop,
    getSceneData,
    loadHDREnvironment,
    
    // Scene Controls
    setLighting,
    setLightIntensity,
    setCameraMode,
    resetCamera,
    focusOnFace,
    setView,
    toggleStats,
    toggleAutoRotate,
    takeScreenshot,
    toggleFullscreen,
    setAutoTone,
    setToneMapping,
    setExposure,
    
    // XR Controls
    enableAR,
    enableVR,
    
    // Refs
    containerRef,
    sceneManager: sceneManagerRef.current,
    characterManager: characterManagerRef.current
  };

  return (
    <SceneContext.Provider value={value}>
      {children}
    </SceneContext.Provider>
  );
};