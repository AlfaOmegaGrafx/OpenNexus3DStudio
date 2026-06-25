import React, { useState, useEffect } from 'react';
import './SceneControls.css';

/**
 * SceneControls - Advanced 3D scene control panel
 * Provides controls for lighting, camera, rendering modes, and visual effects
 */
export const SceneControls = ({ sceneManager, onRenderModeChange, onLightingChange }) => {
  const [renderMode, setRenderMode] = useState('solid');
  const [lightingIntensity, setLightingIntensity] = useState(1.0);
  const [autoRotation, setAutoRotation] = useState(false);
  const [rotationSpeed, setRotationSpeed] = useState(2.0);
  const [toneMapping, setToneMapping] = useState('ACESFilmic');
  const [exposure, setExposure] = useState(1.0);
  const [lightTypes, setLightTypes] = useState({
    ambient: true,
    directional: true,
    point: true,
    hemisphere: true
  });

  const renderModes = [
    { value: 'solid', label: 'Solid', description: 'Standard rendered view' },
    { value: 'wireframe', label: 'Wireframe', description: 'Mesh wireframe overlay' },
    { value: 'skeleton', label: 'Skeleton', description: 'Bone structure visualization' },
    { value: 'normal', label: 'Normal Map', description: 'Surface normal visualization' },
    { value: 'uv', label: 'UV Map', description: 'Texture coordinate visualization' },
    { value: 'depth', label: 'Depth', description: 'Depth buffer visualization' },
    { value: 'partColorize', label: 'Part Colors', description: 'Random part coloring' }
  ];

  const toneMappingOptions = [
    { value: 'ACESFilmic', label: 'ACES Filmic' },
    { value: 'Reinhard', label: 'Reinhard' },
    { value: 'Cineon', label: 'Cineon' },
    { value: 'Linear', label: 'Linear' }
  ];

  const cameraPositions = [
    { value: 'front', label: 'Front', icon: '👁️' },
    { value: 'back', label: 'Back', icon: '👁️‍🗨️' },
    { value: 'left', label: 'Left', icon: '👁️‍🗨️' },
    { value: 'right', label: 'Right', icon: '👁️‍🗨️' },
    { value: 'top', label: 'Top', icon: '⬆️' },
    { value: 'bottom', label: 'Bottom', icon: '⬇️' }
  ];

  useEffect(() => {
    if (sceneManager) {
      // Initialize with current settings
      setRenderMode(sceneManager.renderMode || 'solid');
    }
  }, [sceneManager]);

  const handleRenderModeChange = (mode) => {
    setRenderMode(mode);
    if (sceneManager) {
      sceneManager.setRenderMode(mode);
    }
    if (onRenderModeChange) {
      onRenderModeChange(mode);
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

  const handleLightTypeToggle = (lightType, enabled) => {
    setLightTypes(prev => ({ ...prev, [lightType]: enabled }));
    if (sceneManager) {
      sceneManager.toggleLightType(lightType, enabled);
    }
  };

  const handleCameraPosition = (position) => {
    if (sceneManager) {
      sceneManager.setCameraPosition(position);
    }
  };

  const handleAutoRotationToggle = (enabled) => {
    setAutoRotation(enabled);
    if (sceneManager) {
      sceneManager.setAutoRotation(enabled, rotationSpeed);
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
    <div className="scene-controls">
      <div className="scene-controls-header">
        <h3>🎨 Scene Controls</h3>
        <p>Advanced 3D scene management and rendering options</p>
      </div>

      <div className="scene-controls-content">
        {/* Rendering Modes */}
        <div className="control-section">
          <h4>Rendering Modes</h4>
          <div className="render-modes">
            {renderModes.map(mode => (
              <button
                key={mode.value}
                className={`render-mode-btn ${renderMode === mode.value ? 'active' : ''}`}
                onClick={() => handleRenderModeChange(mode.value)}
                title={mode.description}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Camera Controls */}
        <div className="control-section">
          <h4>Camera Position</h4>
          <div className="camera-positions">
            {cameraPositions.map(pos => (
              <button
                key={pos.value}
                className="camera-btn"
                onClick={() => handleCameraPosition(pos.value)}
                title={`View from ${pos.label}`}
              >
                <span className="camera-icon">{pos.icon}</span>
                {pos.label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto Rotation */}
        <div className="control-section">
          <h4>Auto Rotation</h4>
          <div className="auto-rotation-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoRotation}
                onChange={(e) => handleAutoRotationToggle(e.target.checked)}
              />
              <span>Enable Auto Rotation</span>
            </label>
            {autoRotation && (
              <div className="speed-control">
                <label>Speed: {rotationSpeed.toFixed(1)}x</label>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.1"
                  value={rotationSpeed}
                  onChange={(e) => {
                    const speed = parseFloat(e.target.value);
                    setRotationSpeed(speed);
                    if (sceneManager) {
                      sceneManager.setAutoRotation(autoRotation, speed);
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Lighting Controls */}
        <div className="control-section">
          <h4>Lighting</h4>
          <div className="lighting-controls">
            <div className="intensity-control">
              <label>Intensity: {lightingIntensity.toFixed(1)}x</label>
              <input
                type="range"
                min="0.1"
                max="3.0"
                step="0.1"
                value={lightingIntensity}
                onChange={(e) => handleLightingIntensityChange(parseFloat(e.target.value))}
              />
            </div>
            
            <div className="light-types">
              <h5>Light Types</h5>
              {Object.entries(lightTypes).map(([type, enabled]) => (
                <label key={type} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => handleLightTypeToggle(type, e.target.checked)}
                  />
                  <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Tone Mapping */}
        <div className="control-section">
          <h4>Tone Mapping</h4>
          <div className="tone-mapping-controls">
            <div className="tone-mapping-select">
              <label>Tone Mapping:</label>
              <select
                value={toneMapping}
                onChange={(e) => handleToneMappingChange(e.target.value)}
              >
                {toneMappingOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="exposure-control">
              <label>Exposure: {exposure.toFixed(1)}</label>
              <input
                type="range"
                min="0.1"
                max="3.0"
                step="0.1"
                value={exposure}
                onChange={(e) => handleExposureChange(parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="control-section">
          <h4>Quick Actions</h4>
          <div className="quick-actions">
            <button
              className="action-btn"
              onClick={() => {
                if (sceneManager) {
                  sceneManager.setCameraPosition('front');
                  sceneManager.setRenderMode('solid');
                  sceneManager.setLightingIntensity(1.0);
                  sceneManager.setAutoRotation(false);
                }
              }}
            >
              🔄 Reset View
            </button>
            <button
              className="action-btn"
              onClick={() => {
                if (sceneManager) {
                  sceneManager.setAutoRotation(true, 1.0);
                }
              }}
            >
              🎠 Auto Rotate
            </button>
            <button
              className="action-btn"
              onClick={() => {
                if (sceneManager) {
                  sceneManager.setRenderMode('wireframe');
                }
              }}
            >
              🔲 Wireframe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SceneControls;
