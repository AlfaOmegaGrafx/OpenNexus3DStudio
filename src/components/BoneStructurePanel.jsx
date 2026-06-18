import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collectModelBones, buildBoneStructureTree, mergeModelBones } from '../library/rigBoneUtils.js';
import { pickPrimaryViewportModelRoot } from '../library/viewportExpressionVrm.js';

const BoneStructurePanel = ({
  sceneManager,
  characterManager,
  currentModel,
  viewportModelRevision = 0,
  isVisible,
  onClose,
  isExpanded: externalIsExpanded,
  autoScrollOnExpand = false,
}) => {
  const [boneStructures, setBoneStructures] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedBone, setSelectedBone] = useState(null);
  const headerRef = useRef(null);

  const viewportModelRoot = useMemo(() => {
    if (currentModel) return currentModel;
    return pickPrimaryViewportModelRoot(sceneManager, characterManager);
  }, [currentModel, sceneManager, characterManager, viewportModelRevision]);

  // Sync with external expansion state (no scroll — avoids jumping the left sidebar on trait load)
  useEffect(() => {
    if (externalIsExpanded !== undefined) {
      setIsExpanded(externalIsExpanded);
    }
  }, [externalIsExpanded]);

  useEffect(() => {
    if (!viewportModelRoot) {
      setBoneStructures([]);
      return;
    }
    setBoneStructures(extractBoneStructures(viewportModelRoot));
  }, [viewportModelRoot]);

  const extractBoneStructures = (model) => {
    const vrm = model.userData?.vrm;
    if (vrm?.humanoid?.humanBones) {
      const bones = [];
      const boneMap = new Map();
      const humanBones = vrm.humanoid.humanBones;
      Object.keys(humanBones).forEach((boneName) => {
        const bone = humanBones[boneName];
        if (bone?.node) {
          const boneData = {
            name: boneName,
            type: 'Humanoid',
            position: bone.node.position,
            rotation: bone.node.rotation,
            scale: bone.node.scale,
            parent: bone.node.parent ? bone.node.parent.name : null,
            children: [],
            level: 0,
          };
          bones.push(boneData);
          boneMap.set(boneName, boneData);
        }
      });
      collectModelBones(model).forEach((child) => {
        const name = child.name || 'Unnamed Bone';
        if (boneMap.has(name)) return;
        const boneData = {
          name,
          type: 'Bone',
          position: child.position,
          rotation: child.rotation,
          scale: child.scale,
          parent: child.parent?.isBone ? child.parent.name : null,
          children: [],
          level: 0,
        };
        bones.push(boneData);
        boneMap.set(name, boneData);
      });
      bones.forEach((bone) => {
        if (bone.parent && boneMap.has(bone.parent)) {
          const parent = boneMap.get(bone.parent);
          parent.children.push(bone);
          bone.level = parent.level + 1;
        }
      });
      return bones.filter((bone) => !bone.parent || !boneMap.has(bone.parent));
    }

    const rigBones = mergeModelBones(
      collectModelBones(model),
      model.userData?.collectedRigBones || [],
    );
    return buildBoneStructureTree(rigBones);
  };

  // Recursive component to render bone tree
  const BoneTreeNode = ({ bone, level = 0 }) => {
    const [nodeExpanded, setNodeExpanded] = useState(true);
    const hasChildren = bone.children && bone.children.length > 0;

    return (
      <div className="bone-tree-node" style={{ marginLeft: `${level * 8}px` }}>
        <div
          className={`bone-item ${selectedBone === bone.name ? 'selected' : ''}`}
          onClick={() => {
            if (selectedBone === bone.name) {
              setSelectedBone(null);
              if (sceneManager?.highlightBone) {
                sceneManager.highlightBone(null);
              }
            } else {
              setSelectedBone(bone.name);
              if (sceneManager?.highlightBone) {
                if (sceneManager.setRenderMode) {
                  sceneManager.setRenderMode('skeleton');
                }
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
                  setNodeExpanded(!nodeExpanded);
                }}
                className="tree-expand-button"
              >
                {nodeExpanded ? '▼' : '▶'}
              </button>
            )}
            {!hasChildren && <span className="tree-spacer"></span>}
            <div className="bone-name-container">
              <span className="bone-name">{bone.name}</span>
              <span className="bone-type-badge">{bone.type}</span>
            </div>
            <div className="bone-info">Info</div>
            <div className="bone-position">
              ({bone.position.x.toFixed(0)}, {bone.position.y.toFixed(0)}, {bone.position.z.toFixed(0)})
            </div>
            <div className="bone-rotation">
              R:{' '}
              {bone.rotation
                ? `${bone.rotation.x.toFixed(1)}, ${bone.rotation.y.toFixed(1)}, ${bone.rotation.z.toFixed(1)}`
                : 'N/A'}
            </div>
          </div>
        </div>

        {hasChildren && nodeExpanded && (
          <div className="bone-children">
            {bone.children.map((child, index) => (
              <BoneTreeNode key={`${child.name}-${index}`} bone={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="bone-structure-panel">
      <div className="bone-panel-header sticky-header" ref={headerRef}>
        <button
          onClick={() => {
            const newExpanded = !isExpanded;
            setIsExpanded(newExpanded);
            if (autoScrollOnExpand && newExpanded && headerRef.current) {
              setTimeout(() => {
                headerRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                  inline: 'nearest',
                });
              }, 0);
            }
          }}
          className="expand-icon-button"
          title={isExpanded ? 'Collapse Bone Structure' : 'Expand Bone Structure'}
        >
          {isExpanded ? '▼' : '▶'}
        </button>
        <span className="skeleton-icon">🦴</span>
        <h3 className="panel-title">Bone Structure</h3>
        <button onClick={onClose} className="close-button" title="Close Bone Structure Panel">
          ✕
        </button>
      </div>

      {isExpanded && (
        <div className="bone-structure-content">
          {boneStructures.length === 0 ? (
            <div className="no-bones">
              <p>No bone structure found</p>
              <p className="text-sm text-gray-400">
                {viewportModelRoot?.userData?.autoRigMeta?.bone_count > 0
                  ? 'Auto-rig finished on the server, but this GLB has no embedded skeleton. Use Skeleton view after reload, or try Full rig mode on the next run.'
                  : 'Assemble a character in Appearance or import a rigged VRM/GLB to see bones here'}
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
