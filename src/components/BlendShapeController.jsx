import React, { useState, useEffect } from 'react';
import BoneStructurePanel from './BoneStructurePanel';

const BlendShapeController = ({ sceneManager, currentModel, isActive, onToggle }) => {
  const [blendShapes, setBlendShapes] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBonePanel, setShowBonePanel] = useState(false);
  const [bonePanelExpanded, setBonePanelExpanded] = useState(false);

  useEffect(() => {
    console.log('BlendShapeController: currentModel changed', currentModel);
    if (currentModel && sceneManager) {
      // Use sceneManager to get blend shapes
      const shapes = sceneManager.getVRMBlendShapes();
      console.log('BlendShapeController: blend shapes found', shapes.length, 'shapes');
      console.log('BlendShapeController: first few shapes:', shapes.slice(0, 5));
      console.log('BlendShapeController: all blend shape names:', shapes.map(s => s.name));
      setBlendShapes(shapes);
      setIsVisible(shapes.length > 0);
      
      // Auto-expand blend shapes if they exist
      if (shapes.length > 0) {
        console.log('BlendShapeController: auto-expanding blend shapes');
        setIsExpanded(true);
        setShowBonePanel(true); // Also show bone panel when VRM is loaded
      }
    } else {
      console.log('BlendShapeController: no model or sceneManager');
      setBlendShapes([]);
      setIsVisible(false);
      setIsExpanded(false);
    }
  }, [currentModel, sceneManager]);

  // Expose toggle method to parent
  useEffect(() => {
    if (onToggle) {
      onToggle({
        toggleBonePanel: () => {
          console.log('External toggleBonePanel called, current state:', showBonePanel);
          setShowBonePanel(!showBonePanel);
        },
        toggleBlendShapes: () => {
          console.log('External toggleBlendShapes called, current state:', isExpanded);
          setIsExpanded(!isExpanded);
        },
        setBonePanelVisible: (visible) => {
          console.log('External setBonePanelVisible called with:', visible);
          console.log('Setting showBonePanel to:', visible);
          setShowBonePanel(visible);
          // When showing bone panel, also expand it for skeleton mode
          if (visible) {
            setBonePanelExpanded(true);
          } else {
            setBonePanelExpanded(false);
          }
        },
        setBlendShapesVisible: (visible) => {
          console.log('External setBlendShapesVisible called with:', visible);
          setIsExpanded(visible);
        },
        isVisible: isVisible
      });
    }
  }, [onToggle, showBonePanel, isExpanded, isVisible]);

  // Respond to external activation
  useEffect(() => {
    if (isActive) {
      setShowBonePanel(true);
      setIsExpanded(true);
    }
  }, [isActive]);

  const handleBlendShapeChange = (name, value) => {
    // Value is already 0-1 (alpha), no conversion needed
    const alphaValue = value;
    
    // Find the blend shape to get its technical name
    const blendShape = blendShapes.find(shape => shape.name === name);
    const technicalName = blendShape ? blendShape.technicalName : name;
    
    // Apply blend shape using sceneManager
    if (sceneManager) {
      sceneManager.setVRMBlendShape(technicalName, alphaValue);
      console.log(`Blend shape ${name} (${technicalName}) set to ${alphaValue.toFixed(2)} alpha`);
    }
    
    setBlendShapes(prev => 
      prev.map(shape => 
        shape.name === name ? { ...shape, value: alphaValue } : shape
      )
    );
  };

  const resetAllBlendShapes = () => {
    blendShapes.forEach(shape => {
      if (sceneManager) {
        sceneManager.setVRMBlendShape(shape.technicalName || shape.name, 0);
      }
    });
    setBlendShapes(prev => 
      prev.map(shape => ({ ...shape, value: 0 }))
    );
  };

  // Always show the controller, but control individual panels
  // if (!isVisible) {
  //   return null;
  // }

  return (
    <div className="blend-shape-controller">
      <div className="card">
        <div className="card-header">
          <button 
            onClick={() => {
              console.log('Skeleton icon clicked, current state:', showBonePanel);
              setShowBonePanel(!showBonePanel);
            }}
            className="skeleton-icon-button"
            title={showBonePanel ? "Hide Bone Structure" : "Show Bone Structure"}
          >
            🦴
          </button>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="expand-icon-button"
            title={isExpanded ? "Hide Blend Shapes" : "Show Blend Shapes"}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <h3 className="card-title">Blend Shapes</h3>
          {isExpanded && (
            <button 
              onClick={resetAllBlendShapes}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
            >
              Reset All
            </button>
          )}
        </div>
        
        {isExpanded && (
          <div className="blend-shape-list">
            {console.log('Rendering blend shapes:', blendShapes.length, 'shapes, isExpanded:', isExpanded)}
            {blendShapes.length === 0 ? (
              <div className="no-blend-shapes">
                <p>No blend shapes found</p>
                <p className="text-sm text-gray-400">
                  Load a VRM model with blend shapes to see them here
                </p>
              </div>
            ) : (
              blendShapes.map((shape, index) => (
              <div key={index} className="blend-shape-item">
                <label className="blend-shape-label" htmlFor={`blend-shape-${index}`}>
                  {shape.name}
                  <span className="blend-shape-value">{shape.value.toFixed(2)}</span>
                </label>
                <input
                  id={`blend-shape-${index}`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={shape.value}
                  onChange={(e) => handleBlendShapeChange(shape.name, parseFloat(e.target.value))}
                  className="blend-shape-slider"
                />
              </div>
              ))
            )}
          </div>
        )}
      </div>
      
      {console.log('Rendering BoneStructurePanel with showBonePanel:', showBonePanel)}
      {showBonePanel && (
        <BoneStructurePanel 
          sceneManager={sceneManager}
          currentModel={currentModel}
          isVisible={showBonePanel}
          onClose={() => setShowBonePanel(false)}
          isExpanded={bonePanelExpanded}
        />
      )}
    </div>
  );
};

export default BlendShapeController;
