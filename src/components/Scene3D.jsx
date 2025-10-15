import React, { useRef, useEffect, useState } from 'react';
import { useScene } from '../context/SceneContext';

const Scene3D = ({ model, renderMode }) => {
  const mountRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const {
    isInitialized: sceneInitialized,
    currentModel,
    renderMode: currentRenderMode,
    isLoading,
    initializeScene,
    updateRenderMode,
    startRenderLoop
  } = useScene();

  // Initialize scene when component mounts
  useEffect(() => {
    if (mountRef.current && !isInitialized) {
      initializeScene(mountRef.current, {
        width: mountRef.current.clientWidth,
        height: mountRef.current.clientHeight
      }).then(() => {
        setIsInitialized(true);
        startRenderLoop();
      }).catch(error => {
        console.error('Failed to initialize scene:', error);
      });
    }
  }, [initializeScene, startRenderLoop, isInitialized]);

  // Handle render mode changes
  useEffect(() => {
    if (renderMode && renderMode !== currentRenderMode) {
      updateRenderMode(renderMode);
    }
  }, [renderMode, currentRenderMode, updateRenderMode]);

  return (
    <div className="scene-3d">
      <div 
        ref={mountRef}
        className="scene-viewport"
        style={{ width: '100%', height: '100%' }}
      />
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
