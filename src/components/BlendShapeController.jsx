import React, { useState, useEffect, useRef } from 'react';
import BoneStructurePanel from './BoneStructurePanel';

const BlendShapeController = ({
  sceneManager,
  characterManager,
  currentModel,
  expressionVrmRevision = 0,
  isActive,
  onToggle,
}) => {
  const [blendShapes, setBlendShapes] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBonePanel, setShowBonePanel] = useState(false);
  const [bonePanelExpanded, setBonePanelExpanded] = useState(false);
  const cardHeaderRef = useRef(null);

  useEffect(() => {
    if (!sceneManager) {
      setBlendShapes([]);
      setIsVisible(false);
      return;
    }

    const shapes = sceneManager.getVRMBlendShapes();
    setBlendShapes((prev) => {
      if (prev.length === shapes.length && prev.every((p, i) => p.name === shapes[i]?.name)) {
        return prev.map((p, i) => ({ ...p, value: shapes[i]?.value ?? p.value }));
      }
      return shapes;
    });
    setIsVisible(shapes.length > 0);
  }, [sceneManager, expressionVrmRevision]);

  useEffect(() => {
    if (onToggle) {
      onToggle({
        toggleBonePanel: () => {
          setShowBonePanel(!showBonePanel);
        },
        toggleBlendShapes: () => {
          setIsExpanded(!isExpanded);
        },
        setBonePanelVisible: (visible) => {
          setShowBonePanel(visible);
          if (visible) {
            setBonePanelExpanded(true);
          } else {
            setBonePanelExpanded(false);
          }
        },
        setBlendShapesVisible: (visible) => {
          setIsExpanded(visible);
        },
        isVisible: isVisible
      });
    }
  }, [onToggle, showBonePanel, isExpanded, isVisible]);

  useEffect(() => {
    if (isActive) {
      setShowBonePanel(true);
      setIsExpanded(true);
      if (cardHeaderRef.current) {
        setTimeout(() => {
          cardHeaderRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
          });
        }, 0);
      }
    }
  }, [isActive]);

  const handleBlendShapeChange = (name, value) => {
    const alphaValue = value;
    const blendShape = blendShapes.find((shape) => shape.name === name);
    const technicalName = blendShape ? blendShape.technicalName : name;

    if (sceneManager) {
      sceneManager.setVRMBlendShape(technicalName, alphaValue);
    }

    setBlendShapes((prev) =>
      prev.map((shape) =>
        shape.name === name ? { ...shape, value: alphaValue } : shape
      )
    );
  };

  const resetAllBlendShapes = () => {
    blendShapes.forEach((shape) => {
      if (sceneManager) {
        sceneManager.setVRMBlendShape(shape.technicalName || shape.name, 0);
      }
    });
    setBlendShapes((prev) => prev.map((shape) => ({ ...shape, value: 0 })));
  };

  return (
    <div className="blend-shape-controller">
      <div className="card">
        <div className="card-header" ref={cardHeaderRef}>
          <button
            onClick={() => {
              const newExpanded = !isExpanded;
              setIsExpanded(newExpanded);
              if (newExpanded && cardHeaderRef.current) {
                setTimeout(() => {
                  cardHeaderRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'nearest'
                  });
                }, 0);
              }
            }}
            className="expand-icon-button"
            title={isExpanded ? 'Hide Blend Shapes' : 'Show Blend Shapes'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <button
            onClick={() => setShowBonePanel(!showBonePanel)}
            className="skeleton-icon-button"
            title={showBonePanel ? 'Hide Bone Structure' : 'Show Bone Structure'}
          >
            🦴
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
            {blendShapes.length === 0 ? (
              <div className="no-blend-shapes">
                <p>No blend shapes found</p>
                <p className="text-sm text-gray-400">
                  Assemble a character in Appearance or import a VRM — facial blend shapes appear here
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

      {showBonePanel && (
        <BoneStructurePanel
          sceneManager={sceneManager}
          characterManager={characterManager}
          currentModel={currentModel}
          viewportModelRevision={expressionVrmRevision}
          isVisible={showBonePanel}
          onClose={() => setShowBonePanel(false)}
          isExpanded={bonePanelExpanded}
        />
      )}
    </div>
  );
};

export default BlendShapeController;
