import React, { useState } from 'react';
import { useScene } from '../context/SceneContext';
import SceneControlsCompact from './SceneControlsCompact';

/**
 * SceneControlsTest - Test component to verify all scene controls are working
 */
const SceneControlsTest = () => {
  const {
    isInitialized,
    currentModel,
    renderMode,
    setLighting,
    setLightIntensity,
    setCameraMode,
    resetCamera,
    setView,
    toggleStats,
    toggleAutoRotate,
    takeScreenshot,
    toggleFullscreen,
    setAutoTone,
    setToneMapping,
    setExposure
  } = useScene();

  const [renderModeStates, setRenderModeStates] = useState({
    solid: true,
    wireframe: false,
    skeleton: false,
    partColorize: false
  });

  const handleRenderModeChange = (mode) => {
    console.log(`🎨 Render mode changed to: ${mode}`);
    
    // Update render mode states
    const newStates = {
      solid: mode === 'solid',
      wireframe: mode === 'wireframe',
      skeleton: mode === 'skeleton',
      partColorize: mode === 'partColorize'
    };
    setRenderModeStates(newStates);
  };

  const handleLightingChange = (lighting) => {
    console.log(`💡 Lighting changed to: ${lighting}`);
  };

  const handleSkeletonClick = () => {
    console.log('🦴 Skeleton clicked');
  };

  // Test all controls programmatically
  const testAllControls = () => {
    console.log('🧪 Testing all scene controls...');
    
    // Test lighting
    setLighting('studio');
    setTimeout(() => setLighting('outdoor'), 1000);
    setTimeout(() => setLighting('dramatic'), 2000);
    
    // Test light intensity
    setLightIntensity(0.5);
    setTimeout(() => setLightIntensity(1.5), 1000);
    
    // Test camera modes
    setCameraMode('orbit');
    setTimeout(() => setCameraMode('first-person'), 1000);
    setTimeout(() => setCameraMode('fixed'), 2000);
    
    // Test views
    setView('Front');
    setTimeout(() => setView('Isometric'), 1000);
    
    // Test utility functions
    toggleStats(true);
    setTimeout(() => toggleStats(false), 1000);
    
    toggleAutoRotate();
    setTimeout(() => toggleAutoRotate(), 2000);
    
    // Test tone mapping
    setAutoTone(true);
    setToneMapping('ACES');
    setExposure(1.5);
    
    console.log('✅ All controls tested');
  };

  return (
    <div style={{ padding: '20px', background: '#1a1a1a', color: 'white', minHeight: '100vh' }}>
      <h2>Scene Controls Test</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Status</h3>
        <p>Scene Initialized: {isInitialized ? '✅' : '❌'}</p>
        <p>Current Model: {currentModel ? '✅' : '❌'}</p>
        <p>Render Mode: {renderMode}</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={testAllControls}
          style={{
            background: '#4ecdc4',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          🧪 Test All Controls
        </button>
        
        <button 
          onClick={takeScreenshot}
          style={{
            background: '#667eea',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          📸 Take Screenshot
        </button>
        
        <button 
          onClick={toggleFullscreen}
          style={{
            background: '#764ba2',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          🖥️ Toggle Fullscreen
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Scene Controls</h3>
        <SceneControlsCompact 
          onRenderModeChange={handleRenderModeChange}
          onLightingChange={handleLightingChange}
          renderModeStates={renderModeStates}
          onSkeletonClick={handleSkeletonClick}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Direct Control Tests</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => setLighting('studio')}>Studio Lighting</button>
          <button onClick={() => setLighting('outdoor')}>Outdoor Lighting</button>
          <button onClick={() => setLighting('dramatic')}>Dramatic Lighting</button>
          <button onClick={() => setLightIntensity(0.5)}>Low Light</button>
          <button onClick={() => setLightIntensity(1.5)}>High Light</button>
          <button onClick={() => setCameraMode('orbit')}>Orbit Camera</button>
          <button onClick={() => setCameraMode('first-person')}>First Person</button>
          <button onClick={() => resetCamera()}>Reset Camera</button>
          <button onClick={() => setView('Front')}>Front View</button>
          <button onClick={() => setView('Isometric')}>Isometric View</button>
          <button onClick={() => toggleStats(true)}>Show Stats</button>
          <button onClick={() => toggleStats(false)}>Hide Stats</button>
          <button onClick={() => toggleAutoRotate()}>Toggle Auto Rotate</button>
          <button onClick={() => setAutoTone(true)}>Enable Auto Tone</button>
          <button onClick={() => setToneMapping('ACES')}>ACES Tone Mapping</button>
          <button onClick={() => setExposure(2.0)}>High Exposure</button>
        </div>
      </div>
    </div>
  );
};

export default SceneControlsTest;
