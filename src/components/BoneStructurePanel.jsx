import React, { useState, useEffect } from 'react';

const BoneStructurePanel = ({ sceneManager, currentModel, isVisible, onClose, isExpanded: externalIsExpanded }) => {
  const [boneStructures, setBoneStructures] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedBone, setSelectedBone] = useState(null);

  // Sync with external expansion state
  useEffect(() => {
    if (externalIsExpanded !== undefined) {
      setIsExpanded(externalIsExpanded);
    }
  }, [externalIsExpanded]);

  useEffect(() => {
    if (currentModel && currentModel.userData && currentModel.userData.vrm) {
      const bones = extractBoneStructures(currentModel);
      setBoneStructures(bones);
    } else {
      setBoneStructures([]);
    }
  }, [currentModel]);

  const extractBoneStructures = (model) => {
    console.log('extractBoneStructures called with model:', model);
    const bones = [];
    const boneMap = new Map();
    
    if (model.userData && model.userData.vrm) {
      const vrm = model.userData.vrm;
      console.log('VRM found, checking for bones...');
      
      // Extract humanoid bones if available
      if (vrm.humanoid && vrm.humanoid.humanBones) {
        const humanBones = vrm.humanoid.humanBones;
        Object.keys(humanBones).forEach(boneName => {
          const bone = humanBones[boneName];
          if (bone && bone.node) {
            const boneData = {
              name: boneName,
              type: 'Humanoid',
              position: bone.node.position,
              rotation: bone.node.rotation,
              scale: bone.node.scale,
              parent: bone.node.parent ? bone.node.parent.name : null,
              children: [],
              level: 0
            };
            bones.push(boneData);
            boneMap.set(boneName, boneData);
          }
        });
      }
      
      // Extract all bones from the scene
      model.traverse((child) => {
        if (child.isBone) {
          const boneData = {
            name: child.name || 'Unnamed Bone',
            type: 'Bone',
            position: child.position,
            rotation: child.rotation,
            scale: child.scale,
            parent: child.parent ? child.parent.name : null,
            children: [],
            level: 0
          };
          bones.push(boneData);
          boneMap.set(child.name || 'Unnamed Bone', boneData);
        }
      });
      
      // Build parent-child relationships
      bones.forEach(bone => {
        if (bone.parent && boneMap.has(bone.parent)) {
          const parent = boneMap.get(bone.parent);
          parent.children.push(bone);
          bone.level = parent.level + 1;
        }
      });
      
      // Find root bones (no parent or parent not in our list)
      const rootBones = bones.filter(bone => 
        !bone.parent || !boneMap.has(bone.parent)
      );
      
      return rootBones;
    }
    
    console.log('extractBoneStructures returning', bones.length, 'bones');
    return bones;
  };

  // Recursive component to render bone tree
  const BoneTreeNode = ({ bone, level = 0 }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = bone.children && bone.children.length > 0;
    
    return (
      <div className="bone-tree-node" style={{ marginLeft: `${level * 8}px` }}>
        <div 
          className={`bone-item ${selectedBone === bone.name ? 'selected' : ''}`}
          onClick={() => {
            // Toggle selection state
            if (selectedBone === bone.name) {
              setSelectedBone(null);
              if (sceneManager && sceneManager.highlightBone) {
                sceneManager.highlightBone(null); // This will deselect
              }
            } else {
              setSelectedBone(bone.name);
              if (sceneManager && sceneManager.highlightBone) {
                // First ensure we're in skeleton mode
                if (sceneManager.setRenderMode) {
                  sceneManager.setRenderMode('skeleton');
                }
                // Then highlight the bone
                sceneManager.highlightBone(bone.name);
              }
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <div className="bone-tree-header">
            {hasChildren && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="tree-expand-button"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            {!hasChildren && <span className="tree-spacer"></span>}
            <div className="bone-name-container">
              <span className="bone-name">{bone.name}</span>
              <span className="bone-type-badge">{bone.type}</span>
            </div>
            <div className="bone-info">
              Info
            </div>
            <div className="bone-position">
              ({bone.position.x.toFixed(0)}, {bone.position.y.toFixed(0)}, {bone.position.z.toFixed(0)})
            </div>
            <div className="bone-rotation">
              R: {bone.rotation ? `${bone.rotation.x.toFixed(1)}, ${bone.rotation.y.toFixed(1)}, ${bone.rotation.z.toFixed(1)}` : 'N/A'}
            </div>
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="bone-children">
            {bone.children.map((child, index) => (
              <BoneTreeNode key={`${child.name}-${index}`} bone={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  console.log('BoneStructurePanel render:', { isVisible, boneStructures: boneStructures.length, currentModel: !!currentModel });
  
  if (!isVisible) {
    console.log('BoneStructurePanel: not visible, returning null');
    return null;
  }

  return (
    <div className="bone-structure-panel">
      <div className="bone-panel-header sticky-header">
        <button 
          onClick={() => {
            console.log('Bone structure expand button clicked, current isExpanded:', isExpanded);
            setIsExpanded(!isExpanded);
          }}
          className="expand-icon-button"
          title={isExpanded ? "Collapse Bone Structure" : "Expand Bone Structure"}
        >
          {isExpanded ? '▼' : '▶'}
        </button>
        <span className="skeleton-icon">🦴</span>
        <h3 className="panel-title">Bone Structure</h3>
        <button 
          onClick={onClose}
          className="close-button"
          title="Close Bone Structure Panel"
        >
          ✕
        </button>
      </div>
      
      {isExpanded && (
        <div className="bone-structure-content">
          {boneStructures.length === 0 ? (
            <div className="no-bones">
              <p>No bone structure found</p>
              <p className="text-sm text-gray-400">
                Load a VRM model with bone structure to see bones here
              </p>
            </div>
          ) : (
            <div className="bone-tree">
              {boneStructures.map((bone, index) => (
                <BoneTreeNode key={`root-${index}`} bone={bone} level={0} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BoneStructurePanel;
