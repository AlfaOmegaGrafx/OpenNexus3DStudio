import React, { useState, useEffect } from 'react';
import './SceneControlsCompact.css';

/**
 * SceneControlsCompact - Compact 3D scene controls for header
 * Provides essential scene controls in a compact horizontal layout
 */
const SceneControlsCompact = ({ sceneManager, onRenderModeChange, onLightingChange }) => {
  const [renderMode, setRenderMode] = useState('solid');
  const [lightingIntensity, setLightingIntensity] = useState(1.0);
  const [autoRotation, setAutoRotation] = useState(false);
  const [toneMapping, setToneMapping] = useState('ACESFilmic');
  const [exposure, setExposure] = useState(1.0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (sceneManager) {
      setRenderMode(sceneManager.renderMode || 'solid');
    }
  }, [sceneManager]);

  const handleRenderModeChange = (mode) => {
    // Toggle behavior: if same mode is selected, switch to solid
    const newMode = (renderMode === mode) ? 'solid' : mode;
    setRenderMode(newMode);
    if (sceneManager) {
      sceneManager.setRenderMode(newMode);
    }
    if (onRenderModeChange) {
      onRenderModeChange(newMode);
    }
  };

  const handleLightingIntensityChange = (intensity) => {
    setLightingIntensity(intensity);
    if (sceneManager) {
      sceneManager.setLightingIntensity(intensity);
    }
    if (onLightingChange) {
      onLightingChange({ intensity });
    }
  };

  const handleCameraPosition = (position) => {
    if (sceneManager) {
      setIsAnimating(true);
      sceneManager.setCameraPosition(position);
      
      // Reset animation state after animation completes
      setTimeout(() => {
        setIsAnimating(false);
      }, 1000); // Match the default animation duration
    }
  };

  const handleAutoRotationToggle = (enabled) => {
    setAutoRotation(enabled);
    if (sceneManager) {
      sceneManager.setAutoRotation(enabled, 2.0);
    }
  };

  const handleToneMappingChange = (mapping) => {
    setToneMapping(mapping);
    if (sceneManager) {
      sceneManager.setToneMapping(mapping, exposure);
    }
  };

  const handleExposureChange = (newExposure) => {
    setExposure(newExposure);
    if (sceneManager) {
      sceneManager.setToneMapping(toneMapping, newExposure);
    }
  };

  return (
    <div className="scene-controls-compact">
      {/* Render Mode */}
      <div className="control-item">
        <label>Mode:</label>
        <select value={renderMode} onChange={(e) => handleRenderModeChange(e.target.value)}>
          <option value="solid">Solid</option>
          <option value="wireframe">Wire</option>
          <option value="skeleton">Skeleton</option>
          <option value="partColorize">Parts</option>
          <option value="normal">Normal</option>
          <option value="uv">UV</option>
          <option value="depth">Depth</option>
        </select>
      </div>

      {/* Lighting Intensity */}
      <div className="control-item">
        <label>Light:</label>
        <input
          type="range"
          min="0.1"
          max="2.0"
          step="0.1"
          value={lightingIntensity}
          onChange={(e) => handleLightingIntensityChange(parseFloat(e.target.value))}
          title={`Lighting: ${lightingIntensity.toFixed(1)}x`}
        />
        <span className="value-display">{lightingIntensity.toFixed(1)}</span>
      </div>

      {/* Camera Positions */}
      <div className="control-item">
        <label>View:</label>
        <select 
          value="" 
          onChange={(e) => {
            if (e.target.value) {
              handleCameraPosition(e.target.value);
              e.target.value = ''; // Reset selection
            }
          }}
          disabled={isAnimating}
          className={isAnimating ? 'animating' : ''}
        >
          <option value="">{isAnimating ? 'Animating...' : 'Select View'}</option>
          <option value="front">Front</option>
          <option value="back">Back</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>

      {/* Auto Rotate */}
      <div className="control-item">
        <label>
          <input
            type="checkbox"
            checked={autoRotation}
            onChange={(e) => handleAutoRotationToggle(e.target.checked)}
          />
          Auto
        </label>
      </div>

      {/* Tone Mapping */}
      <div className="control-item">
        <label>Tone:</label>
        <select value={toneMapping} onChange={(e) => handleToneMappingChange(e.target.value)}>
          <option value="ACESFilmic">ACES</option>
          <option value="Reinhard">Reinhard</option>
          <option value="Cineon">Cineon</option>
          <option value="Linear">Linear</option>
        </select>
      </div>

      {/* Exposure */}
      <div className="control-item">
        <label>Exp:</label>
        <input
          type="range"
          min="0.1"
          max="2.0"
          step="0.1"
          value={exposure}
          onChange={(e) => handleExposureChange(parseFloat(e.target.value))}
          title={`Exposure: ${exposure.toFixed(1)}x`}
        />
        <span className="value-display">{exposure.toFixed(1)}</span>
      </div>
    </div>
  );
};

export default SceneControlsCompact;
