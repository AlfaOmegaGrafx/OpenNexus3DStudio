import React, { useState, useEffect } from 'react';
import Shared3DViewer from './Shared3DViewer';
import { useScene } from '../context/SceneContext';
import { useCore3D } from '../context/Core3DContext';
import './Shared3DViewer.css';

/**
 * Universal 3D Viewer Component
 * Automatically detects the application mode and provides appropriate 3D viewing capabilities
 * Works seamlessly with OpenNexus3DStudio (3D AIGC + avatar/VRM workflows)
 */
const Universal3DViewer = ({
  // Viewer configuration
  showControls = true,
  showStats = false,
  autoDetectMode = true,
  mode = null, // 'characterstudio' or 'opennexus3dstudio'
  
  // Model loading
  model = null,
  renderMode = 'solid',
  
  // Event handlers
  onModelLoad = null,
  onModelError = null,
  onViewerReady = null,
  
  // Styling
  className = '',
  style = {},
  
  // Advanced options
  enableVRM = true,
  enableCore3D = true,
  enableExport = true
}) => {
  const [detectedMode, setDetectedMode] = useState(null);
  const [isReady, setIsReady] = useState(false);
  
  // Get context data
  const sceneContext = useScene();
  const core3dContext = useCore3D();

  // Auto-detect application mode
  useEffect(() => {
    if (autoDetectMode && !mode) {
      // Detect based on available contexts and features
      const hasCore3D = core3dContext && core3dContext.isInitialized;
      const hasAvatarPanel = sceneContext && sceneContext.characterManager;
      
      if (hasCore3D && hasAvatarPanel) {
        // Both available - determine based on current state
        setDetectedMode(core3dContext.currentDesign ? 'opennexus3dstudio' : 'opennexus3dstudio');
      } else if (hasCore3D) {
        setDetectedMode('opennexus3dstudio');
      } else if (hasAvatarPanel) {
        setDetectedMode('opennexus3dstudio');
      } else {
        setDetectedMode('opennexus3dstudio'); // Default fallback
      }
    } else {
      setDetectedMode(mode || 'opennexus3dstudio');
    }
  }, [autoDetectMode, mode, core3dContext, sceneContext]);

  // Determine the active model based on mode
  const getActiveModel = () => {
    if (model) return model; // Explicit model provided
    
    if (detectedMode === 'opennexus3dstudio') {
      // For OpenNexus3DStudio, use Core3D design or selected model
      return core3dContext?.currentDesign || core3dContext?.selectedModel;
    } else {
      // OpenNexus3DStudio avatar viewport model
      return sceneContext?.currentModel;
    }
  };

  // Handle viewer ready
  useEffect(() => {
    if (detectedMode && isReady) {
      onViewerReady?.({
        mode: detectedMode,
        hasCore3D: core3dContext?.isInitialized || false,
        hasOpenNexusAvatar: sceneContext?.isInitialized || false
      });
    }
  }, [detectedMode, isReady, onViewerReady, core3dContext, sceneContext]);

  // Enhanced model load handler
  const handleModelLoad = (loadedModel) => {
    console.log(`3D Model loaded in ${detectedMode} mode:`, loadedModel);
    onModelLoad?.(loadedModel);
  };

  // Enhanced error handler
  const handleModelError = (error) => {
    console.error(`3D Model error in ${detectedMode} mode:`, error);
    onModelError?.(error);
  };

  // Get viewer configuration based on mode
  const getViewerConfig = () => {
    const baseConfig = {
      mode: detectedMode,
      model: getActiveModel(),
      renderMode,
      showControls,
      showStats,
      onModelLoad: handleModelLoad,
      onModelError: handleModelError,
      className,
      style
    };

    // Add mode-specific configurations
    if (detectedMode === 'opennexus3dstudio') {
      return {
        ...baseConfig,
        enableCore3D,
        enableExport,
        // Core3D specific options
        designMode: true,
        materialPreview: true
      };
    } else {
      return {
        ...baseConfig,
        enableVRM,
        enableExport,
        // OpenNexus3DStudio avatar panel options
        characterMode: true,
        blendShapes: true
      };
    }
  };

  // Render mode-specific controls
  const renderModeControls = () => {
    if (!showControls || !isReady) return null;

    const controls = [];
    
    if (detectedMode === 'opennexus3dstudio' && sceneContext?.characterManager) {
      controls.push(
        <div key="character-controls" className="mode-specific-controls">
          <h4>OpenNexus3DStudio Avatar Controls</h4>
          <div className="control-group">
            <button 
              onClick={() => sceneContext?.exportModel?.('vrm')}
              className="control-button"
              disabled={!sceneContext?.currentModel}
            >
              Export VRM
            </button>
            <button 
              onClick={() => sceneContext?.exportModel?.('glb')}
              className="control-button"
              disabled={!sceneContext?.currentModel}
            >
              Export GLB
            </button>
          </div>
        </div>
      );
    }
    
    if (detectedMode === 'opennexus3dstudio') {
      controls.push(
        <div key="core3d-controls" className="mode-specific-controls">
          <h4>OpenNexus3DStudio Controls</h4>
          <div className="control-group">
            <button 
              onClick={() => core3dContext?.exportDesign?.(core3dContext.currentDesign?.id)}
              className="control-button"
              disabled={!core3dContext?.currentDesign}
            >
              Export Design
            </button>
            <button 
              onClick={() => core3dContext?.generateDesign?.(
                core3dContext.selectedModel?.id,
                core3dContext.selectedMaterial?.id
              )}
              className="control-button"
              disabled={!core3dContext?.selectedModel || !core3dContext?.selectedMaterial}
            >
              Generate Design
            </button>
          </div>
        </div>
      );
    }
    
    return controls;
  };

  // Render status information
  const renderStatusInfo = () => {
    if (!isReady) return null;

    return (
      <div className="viewer-status-info">
        <div className="status-item">
          <span className="status-label">Mode:</span>
          <span className="status-value">{detectedMode}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Core3D:</span>
          <span className="status-value">
            {core3dContext?.isInitialized ? '✅' : '❌'}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">Scene:</span>
          <span className="status-value">
            {sceneContext?.isInitialized ? '✅' : '❌'}
          </span>
        </div>
        {getActiveModel() && (
          <div className="status-item">
            <span className="status-label">Model:</span>
            <span className="status-value">✅ Loaded</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`universal-3d-viewer ${detectedMode} ${className}`} style={style}>
      <Shared3DViewer
        {...getViewerConfig()}
        onModelLoad={() => setIsReady(true)}
      />
      
      {/* Mode-specific controls */}
      {renderModeControls()}
      
      {/* Status information */}
      {showStats && renderStatusInfo()}
      
      {/* Loading indicator */}
      {!isReady && (
        <div className="viewer-initializing">
          <div className="initializing-spinner"></div>
          <p>Initializing {detectedMode} viewer...</p>
        </div>
      )}
    </div>
  );
};

export default Universal3DViewer;
