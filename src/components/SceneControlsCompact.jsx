import React, { useState } from 'react';
import { useScene } from '../context/SceneContext';

/**
 * SceneControlsCompact - Comprehensive 3D scene controls for header
 * Provides render modes, lighting, camera, and additional scene controls
 */
const SceneControlsCompact = ({ 
  onRenderModeChange, 
  onLightingChange,
  renderModeStates = {},
  skeletonActive = false,
  onSkeletonClick 
}) => {
  const {
    sceneManager,
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
    setExposure,
    updateRenderMode
  } = useScene();
  const [lighting, setLightingState] = useState('studio');
  const [cameraMode, setCameraModeState] = useState('orbit');
  const [showStats, setShowStats] = useState(false);
  const [lightIntensity, setLightIntensityState] = useState(1.0);
  const [selectedView, setSelectedView] = useState('Select View');
  const [autoTone, setAutoToneState] = useState(false);
  const [toneMapping, setToneMappingState] = useState('ACES');
  const [exposure, setExposureState] = useState(1.0);

  const handleRenderModeChange = (mode) => {
    console.log(`🎨 Render mode changed to: ${mode}`);
    if (onRenderModeChange) {
      onRenderModeChange(mode);
    }
    updateRenderMode(mode);
  };

  const handleSkeletonClick = () => {
    console.log('🦴 Skeleton button clicked');
    if (onSkeletonClick) {
      onSkeletonClick();
    }
  };

  const handleLightingChange = (newLighting) => {
    console.log('💡 Lighting changed:', newLighting);
    setLightingState(newLighting);
    if (onLightingChange) {
      onLightingChange(newLighting);
    }
    setLighting(newLighting);
  };

  const handleCameraModeChange = (mode) => {
    console.log('📷 Camera mode changed:', mode);
    setCameraModeState(mode);
    setCameraMode(mode);
  };

  const handleFocusModel = () => {
    console.log('🎯 Focusing on model');
    if (sceneManager && sceneManager.focusOnModel) {
      sceneManager.focusOnModel();
    }
  };

  const handleResetCamera = () => {
    console.log('🔄 Resetting camera');
    resetCamera();
  };

  const handleToggleStats = () => {
    console.log('📊 Toggling stats');
    const newShowStats = !showStats;
    setShowStats(newShowStats);
    toggleStats(newShowStats);
  };

  const handleAutoRotate = () => {
    console.log('🔄 Toggling auto-rotate');
    toggleAutoRotate();
  };

  const handleScreenshot = () => {
    console.log('📸 Taking screenshot');
    takeScreenshot();
  };

  const handleFullscreen = () => {
    console.log('🖥️ Toggling fullscreen');
    toggleFullscreen();
  };

  const handleLightIntensityChange = (value) => {
    console.log('💡 Light intensity changed:', value);
    setLightIntensityState(value);
    setLightIntensity(value);
  };

  const handleViewChange = (view) => {
    console.log('👁️ View changed:', view);
    setSelectedView(view);
    setView(view);
  };

  const handleAutoToneChange = (checked) => {
    console.log('🎨 Auto tone changed:', checked);
    setAutoToneState(checked);
    setAutoTone(checked);
  };

  const handleToneMappingChange = (mapping) => {
    console.log('🎨 Tone mapping changed:', mapping);
    setToneMappingState(mapping);
    setToneMapping(mapping);
  };

  const handleExposureChange = (value) => {
    console.log('📸 Exposure changed:', value);
    setExposureState(value);
    setExposure(value);
  };

  return (
    <div className="scene-controls-compact">

      {/* Original Lighting Controls */}
      <div className="lighting-controls">
        <label className="control-label">Lighting</label>
        <select 
          className="control-select"
          value={lighting}
          onChange={(e) => handleLightingChange(e.target.value)}
        >
          <option value="studio">Studio</option>
          <option value="outdoor">Outdoor</option>
          <option value="indoor">Indoor</option>
          <option value="dramatic">Dramatic</option>
          <option value="soft">Soft</option>
          <option value="harsh">Harsh</option>
        </select>
      </div>

      {/* Light Intensity Slider - moved to right of lighting controls */}
      <div className="light-intensity-controls">
        <label className="control-label">Light:</label>
        <div className="slider-container">
          <input 
            type="range"
            className="control-slider"
            min="0"
            max="2"
            step="0.1"
            value={lightIntensity}
            onChange={(e) => handleLightIntensityChange(parseFloat(e.target.value))}
          />
          <span className="slider-value">{lightIntensity.toFixed(1)}</span>
        </div>
      </div>

      {/* Original Camera Controls */}
      <div className="camera-controls">
        <label className="control-label">Camera</label>
        <select 
          className="control-select"
          value={cameraMode}
          onChange={(e) => handleCameraModeChange(e.target.value)}
        >
          <option value="orbit">Orbit</option>
          <option value="first-person">First Person</option>
          <option value="fixed">Fixed</option>
        </select>
        <button 
          className="control-button"
          onClick={handleFocusModel}
          title="Focus on Model"
        >
          🎯
        </button>
        <button 
          className="control-button"
          onClick={handleResetCamera}
          title="Reset Camera"
        >
          🔄
        </button>
      </div>

      {/* Original Tools */}
      <div className="additional-controls">
        <label className="control-label">Tools</label>
        <button 
          className={`control-button ${showStats ? 'active' : ''}`}
          onClick={handleToggleStats}
          title="Toggle Stats"
        >
          📊
        </button>
        <button 
          className="control-button"
          onClick={handleAutoRotate}
          title="Auto Rotate"
        >
          🔄
        </button>
        <button 
          className="control-button"
          onClick={handleScreenshot}
          title="Screenshot"
        >
          📸
        </button>
        <button 
          className="control-button"
          onClick={handleFullscreen}
          title="Fullscreen"
        >
          🖥️
        </button>
      </div>

      {/* View Selector */}
      <div className="view-controls">
        <label className="control-label">View:</label>
        <select 
          className="control-select"
          value={selectedView}
          onChange={(e) => handleViewChange(e.target.value)}
        >
          <option value="Select View">Select View</option>
          <option value="Front">Front</option>
          <option value="Back">Back</option>
          <option value="Left">Left</option>
          <option value="Right">Right</option>
          <option value="Top">Top</option>
          <option value="Bottom">Bottom</option>
          <option value="Isometric">Isometric</option>
        </select>
      </div>

      {/* Auto Tone Checkbox and Dropdown */}
      <div className="auto-tone-controls">
        <input 
          type="checkbox"
          className="control-checkbox"
          checked={autoTone}
          onChange={(e) => handleAutoToneChange(e.target.checked)}
        />
        <label className="control-label">Auto Tone:</label>
        <select 
          className="control-select"
          value={toneMapping}
          onChange={(e) => handleToneMappingChange(e.target.value)}
          disabled={!autoTone}
        >
          <option value="ACES">ACES</option>
          <option value="Reinhard">Reinhard</option>
          <option value="Linear">Linear</option>
          <option value="Filmic">Filmic</option>
        </select>
      </div>

      {/* Exposure Slider */}
      <div className="exposure-controls">
        <label className="control-label">Exp:</label>
        <div className="slider-container">
          <input 
            type="range"
            className="control-slider"
            min="0"
            max="3"
            step="0.1"
            value={exposure}
            onChange={(e) => handleExposureChange(parseFloat(e.target.value))}
          />
          <span className="slider-value">{exposure.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};

export default SceneControlsCompact;
