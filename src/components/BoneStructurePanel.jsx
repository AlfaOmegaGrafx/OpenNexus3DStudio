import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collectModelBones, buildBoneStructureTree, mergeModelBones } from '../library/rigBoneUtils.js';
import { pickPrimaryViewportModelRoot } from '../library/viewportExpressionVrm.js';
import {
  scrollBoneRowJustBelowTitle,
  scrollBoneRowWhenReady,
} from '../library/boneStructurePanelScroll.js';

function extractBoneStructures(model) {
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
          nodeName: bone.node.name || boneName,
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
        nodeName: name,
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
}

/** Stable tree node — must live outside the panel so selection does not remount the tree. */
function BoneTreeNode({
  bone,
  level = 0,
  selectedBone,
  sceneManager,
  onSelectBone,
}) {
  const [nodeExpanded, setNodeExpanded] = useState(true);
  const hasChildren = bone.children && bone.children.length > 0;

  return (
    <div className="bone-tree-node" style={{ marginLeft: `${level * 8}px` }}>
      <div
        className={`bone-item ${
          selectedBone === bone.name || selectedBone === bone.nodeName ? 'selected' : ''
        }`}
        data-bone-name={bone.name}
        data-bone-node-name={bone.nodeName || bone.name}
        onClick={() => onSelectBone(bone.name)}
        style={{ cursor: 'pointer' }}
      >
        <div className="bone-tree-header">
          {hasChildren && (
            <button
              type="button"
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
            <span className="bone-info">Info</span>
            <div className="bone-transform">
              <span className="bone-position">
                ({bone.position.x.toFixed(0)}, {bone.position.y.toFixed(0)}, {bone.position.z.toFixed(0)})
              </span>
              <span className="bone-rotation">
                R:{' '}
                {bone.rotation
                  ? `${bone.rotation.x.toFixed(1)}, ${bone.rotation.y.toFixed(1)}, ${bone.rotation.z.toFixed(1)}`
                  : 'N/A'}
              </span>
            </div>
            <span className="bone-type-badge">{bone.type}</span>
          </div>
        </div>
      </div>

      {hasChildren && nodeExpanded && (
        <div className="bone-children">
          {bone.children.map((child, index) => (
            <BoneTreeNode
              key={`${child.name}-${index}`}
              bone={child}
              level={level + 1}
              selectedBone={selectedBone}
              sceneManager={sceneManager}
              onSelectBone={onSelectBone}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
  const panelRef = useRef(null);

  const viewportModelRoot = useMemo(() => {
    if (currentModel) return currentModel;
    return pickPrimaryViewportModelRoot(sceneManager, characterManager);
  }, [currentModel, sceneManager, characterManager, viewportModelRevision]);

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

  const pinSelectedBoneUnderTitle = useCallback((boneName) => {
    if (!boneName) return;
    scrollBoneRowWhenReady(boneName, {
      panel: panelRef.current,
      maxAttempts: 32,
      delayMs: 40,
    });
    // Extra passes after layout / sidebar scroll settles.
    [0, 50, 120, 250, 450].forEach((ms) => {
      window.setTimeout(() => {
        scrollBoneRowJustBelowTitle(boneName, { panel: panelRef.current });
      }, ms);
    });
  }, []);

  // After selection + expand + mount, pin the active row flush under the title.
  useEffect(() => {
    if (!isVisible || !isExpanded || !selectedBone) return undefined;
    const boneName = selectedBone;
    const timers = [];
    timers.push(window.setTimeout(() => pinSelectedBoneUnderTitle(boneName), 0));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [isVisible, isExpanded, selectedBone, pinSelectedBoneUnderTitle]);

  const revealBone = useCallback((boneName) => {
    if (!boneName) {
      setSelectedBone(null);
      return;
    }
    setSelectedBone(boneName);
    setIsExpanded(true);
    if (typeof window !== 'undefined' && window.blendShapeControls) {
      window.blendShapeControls.setBlendShapesVisible?.(false);
      window.blendShapeControls.setBonePanelVisible?.(true);
    }
    pinSelectedBoneUnderTitle(boneName);
  }, [pinSelectedBoneUnderTitle]);

  const onSelectBone = useCallback(
    (boneName) => {
      const isSame =
        selectedBone === boneName
        || (selectedBone
          && boneName
          && String(selectedBone).toLowerCase() === String(boneName).toLowerCase());
      if (isSame) {
        setSelectedBone(null);
        sceneManager?.highlightBone?.(null);
        return;
      }
      setSelectedBone(boneName);
      setIsExpanded(true);
      if (sceneManager?.highlightBone) {
        if (sceneManager.setRenderMode && sceneManager.renderMode !== 'skeleton') {
          sceneManager.setRenderMode('skeleton', { focus: false });
        }
        sceneManager.highlightBone(boneName);
      }
      pinSelectedBoneUnderTitle(boneName);
    },
    [selectedBone, sceneManager, pinSelectedBoneUnderTitle],
  );

  useEffect(() => {
    if (!sceneManager) return undefined;

    const onBoneSelected = (payload) => {
      const name = payload?.boneName || sceneManager.selectedBone;
      if (name) revealBone(name);
    };
    const onAdjusterTarget = (payload) => {
      if (payload?.kind === 'bone' && payload?.name) revealBone(payload.name);
      if (payload?.kind == null) setSelectedBone(null);
    };
    const onDeselected = () => setSelectedBone(null);

    sceneManager.on('boneSelected', onBoneSelected);
    sceneManager.on('boneDeselected', onDeselected);
    sceneManager.on('allBonesDeselected', onDeselected);
    sceneManager.on('adjusterTargetChanged', onAdjusterTarget);
    return () => {
      sceneManager.off('boneSelected', onBoneSelected);
      sceneManager.off('boneDeselected', onDeselected);
      sceneManager.off('allBonesDeselected', onDeselected);
      sceneManager.off('adjusterTargetChanged', onAdjusterTarget);
    };
  }, [sceneManager, revealBone]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="bone-structure-panel" ref={panelRef}>
      <div className="bone-panel-header sticky-header" ref={headerRef}>
        <button
          type="button"
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
        <button type="button" onClick={onClose} className="close-button" title="Close Bone Structure Panel">
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
                  ? 'Bone count reported by auto-rig, but no Three.js bones were found on this model.'
                  : 'Load a rigged model to see bone structure'}
              </p>
            </div>
          ) : (
            <div className="bone-tree">
              {boneStructures.map((bone, index) => (
                <BoneTreeNode
                  key={`${bone.name}-${index}`}
                  bone={bone}
                  selectedBone={selectedBone}
                  sceneManager={sceneManager}
                  onSelectBone={onSelectBone}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BoneStructurePanel;
// Re-export for existing tests / callers
export { scrollBoneRowJustBelowTitle };
