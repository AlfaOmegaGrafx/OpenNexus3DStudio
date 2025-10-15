import React from 'react';

const RenderModeSelector = ({ currentMode, onModeChange, renderModeStates, onSkeletonClick, skeletonActive }) => {
  const renderModes = [
    { value: 'solid', label: 'Solid', icon: '🔲' },
    { value: 'rendered', label: 'Rendered', icon: '🎨' },
    { value: 'wireframe', label: 'Wireframe', icon: '📐' },
    { value: 'skeleton', label: 'Skeleton', icon: '🦴' },
    { value: 'partColorize', label: 'Part Colorize', icon: '🌈' }
  ];

  return (
    <div className="render-mode-selector">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Render Mode</h3>
        </div>
        
        <div className="mode-buttons">
          {renderModes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => {
                // Always change render mode first
                onModeChange(mode.value);
                // If skeleton mode, also trigger bone/blend shape features
                if (mode.value === 'skeleton' && onSkeletonClick) {
                  onSkeletonClick();
                }
              }}
              className={`mode-button ${renderModeStates[mode.value] ? 'active' : ''}`}
              title={mode.value === 'skeleton' ? 'Show Bone Structure & Blend Shapes' : mode.label}
            >
              <span className="mode-icon">{mode.icon}</span>
              <span className="mode-label">{mode.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RenderModeSelector;
