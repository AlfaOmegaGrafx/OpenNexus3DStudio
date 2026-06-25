import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useScene } from '../context/SceneContext';
import { useCore3D } from '../context/Core3DContext';

/**
 * Shared 3D Viewer Component
 * Works for OpenNexus3DStudio (avatar panels + 3D AIGC viewport)
 * Supports both traditional 3D models and Core3D designs
 */
const Shared3DViewer = ({ 
  mode = 'characterstudio', // 'characterstudio' or 'opennexus3dstudio'
  model = null,
  renderMode = 'solid',
  showControls = true,
  showStats = false,
  onModelLoad = null,
  onModelError = null,
  className = '',
  style = {}
}) => {
  const mountRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewerStats, setViewerStats] = useState({
    fps: 0,
    triangles: 0,
    drawCalls: 0
  });

  const {
    isInitialized: sceneInitialized,
    currentModel,
    renderMode: currentRenderMode,
    initializeScene,
    updateRenderMode,
    startRenderLoop,
    stopRenderLoop,
    loadModel,
    clearModel,
    sceneManager
  } = useScene();

  const {
    isInitialized: core3dInitialized,
    currentDesign,
    selectedModel: core3dModel,
    selectedMaterial: core3dMaterial
  } = useCore3D();

  // Initialize the 3D scene
  const initializeViewer = useCallback(async () => {
    if (!mountRef.current || isInitialized) return;

    try {
      setIsLoading(true);
      setError(null);

      const container = mountRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      await initializeScene(container, { width, height });
      setIsInitialized(true);
      startRenderLoop();

      // Setup stats monitoring if enabled
      if (showStats) {
        startStatsMonitoring();
      }

    } catch (err) {
      console.error('Failed to initialize 3D viewer:', err);
      setError(err.message);
      onModelError?.(err);
    } finally {
      setIsLoading(false);
    }
  }, [initializeScene, startRenderLoop, isInitialized, showStats, onModelError]);

  // Load model based on mode
  const loadModelIntoViewer = useCallback(async (modelToLoad) => {
    if (!sceneManager || !modelToLoad) return;

    try {
      setIsLoading(true);
      setError(null);

      if (mode === 'opennexus3dstudio') {
        // Handle Core3D designs - prioritize design over model
        if (currentDesign) {
          await loadCore3DDesign(currentDesign);
        } else if (modelToLoad) {
          // Use the model passed as prop, fallback to context model
          await loadCore3DModel(modelToLoad);
        } else if (core3dModel) {
          // Fallback to context model
          await loadCore3DModel(core3dModel);
        }
      } else {
        // Handle traditional models
        await loadModel(modelToLoad);
      }

      onModelLoad?.(modelToLoad);
    } catch (err) {
      console.error('Failed to load model:', err);
      setError(err.message);
      onModelError?.(err);
    } finally {
      setIsLoading(false);
    }
  }, [sceneManager, mode, currentDesign, core3dModel, loadModel, loadCore3DDesign, loadCore3DModel, onModelLoad, onModelError]);

  // Load Core3D design
  const loadCore3DDesign = useCallback(async (design) => {
    if (!sceneManager || !design) return;

    try {
      // If design has a 3D model URL, load it
      if (design.model_url) {
        await sceneManager.loadModel(design.model_url, {
          format: 'auto',
          optimize: true,
          center: true,
          scale: 1
        });
      } else if (design.preview_url) {
        // If only preview available, show as texture on a plane
        await loadDesignPreview(design);
      }
    } catch (err) {
      console.error('Failed to load Core3D design:', err);
      throw err;
    }
  }, [sceneManager]);

  // Load Core3D model
  const loadCore3DModel = useCallback(async (model) => {
    if (!sceneManager || !model) {
      console.warn('⚠️ Cannot load Core3D model: missing sceneManager or model', { sceneManager: !!sceneManager, model: !!model });
      return;
    }

    try {
      console.log('📦 Attempting to load Core3D model:', model);
      
      // Try multiple possible URL properties
      let modelUrl = model.model_url || 
                    model.download_url || 
                    model.file_url || 
                    model.url ||
                    (model.uri && model.uri.startsWith('http') ? model.uri : null) ||
                    (model.id && typeof model.id === 'string' && model.id.startsWith('http') ? model.id : null);
      
      // If we have a URI but not a direct URL, try to fetch model details
      if (!modelUrl && (model.uri || model.id)) {
        const modelId = model.uri || model.id;
        console.log('📦 Model has URI/ID but no direct URL, attempting to fetch details:', modelId);
        
        // Try to fetch model details from Core3D API
        try {
          // Import the Core3D service (it's a singleton instance)
          const core3dServiceModule = await import('../services/core3dService');
          const core3dService = core3dServiceModule.default;
          
          if (core3dService && core3dService.isInitialized) {
            const modelDetails = await core3dService.getModel(modelId);
            console.log('📦 Fetched model details:', modelDetails);
            
            // Try to get URL from fetched details
            modelUrl = modelDetails.model_url || 
                      modelDetails.download_url || 
                      modelDetails.file_url || 
                      modelDetails.url ||
                      (modelDetails.uri && modelDetails.uri.startsWith('http') ? modelDetails.uri : null);
          } else {
            console.warn('⚠️ Core3D service not initialized');
          }
        } catch (fetchErr) {
          console.warn('⚠️ Failed to fetch model details from API:', fetchErr);
        }
      }
      
      if (modelUrl) {
        console.log('📦 Loading Core3D model from URL:', modelUrl);
        await sceneManager.loadModel(modelUrl, {
          format: 'auto',
          optimize: true,
          center: true,
          scale: 1
        });
        console.log('✅ Core3D model loaded successfully');
      } else {
        console.warn('⚠️ Core3D model has no loadable URL. Model data:', {
          id: model.id,
          uri: model.uri,
          name: model.name,
          keys: Object.keys(model)
        });
        setError('Model has no downloadable URL. Please check the model details.');
      }
    } catch (err) {
      console.error('❌ Failed to load Core3D model:', err);
      setError(`Failed to load model: ${err.message}`);
      throw err;
    }
  }, [sceneManager]);

  // Load design preview as texture
  const loadDesignPreview = useCallback(async (design) => {
    if (!sceneManager || !design.preview_url) return;

    try {
      // Create a plane with the design preview as texture
      const geometry = new THREE.PlaneGeometry(2, 2);
      const texture = new THREE.TextureLoader().load(design.preview_url);
      const material = new THREE.MeshBasicMaterial({ 
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      });
      
      const plane = new THREE.Mesh(geometry, material);
      sceneManager.scene.add(plane);
    } catch (err) {
      console.error('Failed to load design preview:', err);
      throw err;
    }
  }, [sceneManager]);

  // Start stats monitoring
  const startStatsMonitoring = useCallback(() => {
    const updateStats = () => {
      if (sceneManager && sceneManager.renderer) {
        const info = sceneManager.renderer.info;
        setViewerStats({
          fps: Math.round(1000 / (performance.now() - (window.lastFrameTime || performance.now()))),
          triangles: info.render.triangles,
          drawCalls: info.render.calls
        });
        window.lastFrameTime = performance.now();
      }
      requestAnimationFrame(updateStats);
    };
    updateStats();
  }, [sceneManager]);

  // Handle render mode changes
  useEffect(() => {
    if (renderMode && renderMode !== currentRenderMode) {
      updateRenderMode(renderMode);
    }
  }, [renderMode, currentRenderMode, updateRenderMode]);

  // Initialize viewer on mount
  useEffect(() => {
    initializeViewer();
  }, [initializeViewer]);

  // Load model when it changes
  useEffect(() => {
    if (isInitialized && model) {
      loadModelIntoViewer(model);
    }
  }, [isInitialized, model, loadModelIntoViewer]);

  // Handle Core3D design changes (prioritize design over model)
  useEffect(() => {
    if (isInitialized && mode === 'opennexus3dstudio' && currentDesign) {
      loadCore3DDesign(currentDesign);
    }
  }, [isInitialized, mode, currentDesign, loadCore3DDesign]);

  // Handle Core3D model changes when in opennexus3dstudio mode (if no design is active)
  useEffect(() => {
    if (isInitialized && mode === 'opennexus3dstudio' && !currentDesign && core3dModel) {
      loadCore3DModel(core3dModel);
    }
  }, [isInitialized, mode, currentDesign, core3dModel, loadCore3DModel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInitialized) {
        stopRenderLoop();
      }
    };
  }, [isInitialized, stopRenderLoop]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (sceneManager && mountRef.current) {
        const container = mountRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        sceneManager.camera.aspect = width / height;
        sceneManager.camera.updateProjectionMatrix();
        sceneManager.renderer.setSize(width, height);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sceneManager]);

  return (
    <div className={`shared-3d-viewer ${className}`} style={style}>
      <div 
        ref={mountRef}
        className="viewer-container"
        style={{ 
          width: '100%', 
          height: '100%',
          position: 'relative',
          background: '#1a1a1a'
        }}
      />
      
      {/* Loading overlay */}
      {isLoading && (
        <div className="viewer-loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading 3D content...</p>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="viewer-error-overlay">
          <div className="error-icon">⚠️</div>
          <p>Error loading 3D content</p>
          <p className="error-details">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="error-dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats overlay */}
      {showStats && isInitialized && (
        <div className="viewer-stats-overlay">
          <div className="stats-panel">
            <div className="stat-item">
              <span className="stat-label">FPS:</span>
              <span className="stat-value">{viewerStats.fps}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Triangles:</span>
              <span className="stat-value">{viewerStats.triangles.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Draw Calls:</span>
              <span className="stat-value">{viewerStats.drawCalls}</span>
            </div>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      {showControls && isInitialized && (
        <div className="viewer-controls-overlay">
          <div className="controls-panel">
            <div className="control-group">
              <label>Render Mode:</label>
              <select 
                value={currentRenderMode}
                onChange={(e) => updateRenderMode(e.target.value)}
                className="control-select"
              >
                <option value="solid">Solid</option>
                <option value="wireframe">Wireframe</option>
                <option value="skeleton">Skeleton</option>
                <option value="textured">Textured</option>
              </select>
            </div>
            
            <div className="control-group">
              <button 
                onClick={() => sceneManager?.resetCamera()}
                className="control-button"
                title="Reset camera"
              >
                🎯 Reset View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mode indicator */}
      <div className="viewer-mode-indicator">
        <span className={`mode-badge ${mode}`}>
          {'🎭 OpenNexus3DStudio'}
        </span>
      </div>
    </div>
  );
};

export default Shared3DViewer;
