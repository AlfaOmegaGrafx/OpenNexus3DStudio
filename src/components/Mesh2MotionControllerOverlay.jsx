import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Mesh2MotionControllerOverlay.css';
import { applyViewportOverlayScale, getViewportUiScaleForWidth } from '../library/viewportLayoutSync.js';

const toDeg = (radians) => (radians * 180) / Math.PI;
const toRad = (degrees) => (degrees * Math.PI) / 180;

const AXES = ['x', 'y', 'z'];

function clampScale(value) {
  return Math.max(0.001, Number(value) || 0.001);
}

function getSelectedBoneNode(sceneManager, model) {
  if (!sceneManager?.selectedBone || !model) return null;
  let found = null;
  model.traverse((node) => {
    if (found || !node?.isBone) return;
    if (node.name === sceneManager.selectedBone) {
      found = node;
    }
  });
  return found;
}

function formatAxisDisplay(value, channel) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return channel === 'rotate' ? n.toFixed(1) : n.toFixed(3);
}

/**
 * Galaxy XR numeric keyboard: controlled `type=number` + toFixed on every keystroke
 * fights IME/backspace. Draft string + inputMode=decimal commits on blur/Enter.
 */
function AxisNumberField({
  axis,
  channel,
  value,
  disabled,
  active,
  onFocusAxis,
  onCommit,
}) {
  const [draft, setDraft] = useState(() => formatAxisDisplay(value, channel));
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      setDraft(formatAxisDisplay(value, channel));
    }
  }, [value, channel, editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = String(draft).trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
      setDraft(formatAxisDisplay(value, channel));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(formatAxisDisplay(value, channel));
      return;
    }
    onCommit(axis, parsed);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className={active ? 'm2m-axis-active' : undefined}
      value={editing ? draft : formatAxisDisplay(value, channel)}
      disabled={disabled}
      onFocus={() => {
        setEditing(true);
        setDraft(formatAxisDisplay(value, channel));
        onFocusAxis(axis);
      }}
      onChange={(e) => {
        // Allow digits, sign, decimal — Galaxy numeric pad + backspace
        const next = e.target.value.replace(/[^\d.eE+-]/g, '');
        setDraft(next);
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          inputRef.current?.blur();
        } else if (e.key === 'Escape') {
          setDraft(formatAxisDisplay(value, channel));
          setEditing(false);
          inputRef.current?.blur();
        }
      }}
      onBlur={commit}
    />
  );
}

export default function Mesh2MotionControllerOverlay({ sceneManager, model }) {
  const [collapsed, setCollapsed] = useState(false);
  const [targetMode, setTargetMode] = useState('object');
  const [channel, setChannel] = useState('translate');
  const [space, setSpace] = useState('local');
  const [activeAxis, setActiveAxis] = useState('x');
  const [revision, setRevision] = useState(0);
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });

  const adjuster = sceneManager?.mesh2MotionAdjuster;

  // Galaxy XR: Adjuster mounts after layout sync — force inline scale on appear.
  useEffect(() => {
    if (!model || typeof window === 'undefined') return undefined;
    const apply = () => {
      const vp = document.querySelector('.main-viewport');
      const w = vp?.getBoundingClientRect().width
        || window.visualViewport?.width
        || window.innerWidth
        || 960;
      applyViewportOverlayScale(getViewportUiScaleForWidth(w));
    };
    apply();
    const id = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(id);
  }, [model]);

  useEffect(() => {
    if (!sceneManager) return undefined;
    const bump = () => setRevision((n) => n + 1);
    const onTransform = (payload) => {
      bump();
      if (payload) {
        setHistoryFlags({
          canUndo: Boolean(payload.canUndo),
          canRedo: Boolean(payload.canRedo),
        });
        if (payload.space) setSpace(payload.space);
      }
    };
    const onTarget = (payload) => {
      bump();
      if (payload?.kind === 'bone') setTargetMode('bone');
      if (payload?.kind === 'object') setTargetMode('object');
      if (payload?.kind == null) {
        /* deselected — keep last mode label */
      }
    };
    sceneManager.on('boneSelected', bump);
    sceneManager.on('boneDeselected', bump);
    sceneManager.on('modelLoaded', bump);
    sceneManager.on('adjusterTransformChanged', onTransform);
    sceneManager.on('adjusterTargetChanged', onTarget);
    sceneManager.on('adjusterSpaceChanged', (p) => {
      if (p?.space) setSpace(p.space);
    });
    return () => {
      sceneManager.off('boneSelected', bump);
      sceneManager.off('boneDeselected', bump);
      sceneManager.off('modelLoaded', bump);
      sceneManager.off('adjusterTransformChanged', onTransform);
      sceneManager.off('adjusterTargetChanged', onTarget);
      sceneManager.off('adjusterSpaceChanged', bump);
    };
  }, [sceneManager]);

  useEffect(() => {
    adjuster?.setMode(channel);
  }, [adjuster, channel]);

  const selectedBoneNode = useMemo(
    () => getSelectedBoneNode(sceneManager, model),
    [sceneManager, model, revision],
  );

  const attached = adjuster?.attachedTarget || null;
  const activeTarget = attached
    || (targetMode === 'bone' ? selectedBoneNode : model);
  const activeLabel = adjuster?.selectionKind === 'bone' || targetMode === 'bone'
    ? (sceneManager?.selectedBone || attached?.name || 'No bone selected')
    : (model?.name || 'No object loaded');
  const canEdit = Boolean(activeTarget);

  const readAxisValue = (axis) => {
    if (!activeTarget) return 0;
    if (channel === 'translate') return activeTarget.position[axis];
    if (channel === 'rotate') return toDeg(activeTarget.rotation[axis]);
    return activeTarget.scale[axis];
  };

  const writeAxisValue = (axis, value, { recordHistory = true } = {}) => {
    if (!activeTarget) return;
    if (recordHistory) adjuster?.pushHistoryBeforeEdit?.();
    if (channel === 'translate') {
      activeTarget.position[axis] = Number(value) || 0;
    } else if (channel === 'rotate') {
      activeTarget.rotation[axis] = toRad(Number(value) || 0);
    } else {
      activeTarget.scale[axis] = clampScale(value);
    }
    activeTarget.updateMatrixWorld?.(true);
    adjuster?.refresh?.();
    setRevision((n) => n + 1);
    setHistoryFlags({
      canUndo: Boolean(adjuster?.canUndo?.()),
      canRedo: Boolean(adjuster?.canRedo?.()),
    });
  };

  const nudge = (axis, direction) => {
    const current = readAxisValue(axis);
    const step = channel === 'translate' ? 0.05 : channel === 'rotate' ? 5 : 0.05;
    writeAxisValue(axis, current + direction * step);
  };

  const toggleNativeSelect = (event) => {
    const element = event.currentTarget;
    if (document.activeElement === element) {
      event.preventDefault();
      element.blur();
    }
  };

  const syncTargetMode = (mode) => {
    setTargetMode(mode);
    if (!sceneManager || !model) return;
    if (mode === 'bone') {
      // Auto skeleton render when targeting bones (header UI sync via event).
      if (sceneManager.renderMode !== 'skeleton') {
        sceneManager.setRenderMode('skeleton', { focus: false });
      }
      sceneManager.emit?.('adjusterUiRenderMode', { mode: 'skeleton' });
      if (selectedBoneNode) {
        adjuster?.attach(selectedBoneNode, 'bone', { focus: true, space: 'auto' });
      } else if (sceneManager.selectedBone) {
        sceneManager.highlightBone?.(sceneManager.selectedBone);
      }
      return;
    }
    // Object target → solid render (keep camera pose)
    if (sceneManager.renderMode !== 'solid') {
      sceneManager.setRenderMode('solid', { focus: false });
    }
    sceneManager.emit?.('adjusterUiRenderMode', { mode: 'solid' });
    adjuster?.attach(model, 'object', { focus: false, space: 'auto' });
  };

  const onSpaceChange = (next) => {
    setSpace(next);
    adjuster?.setSpace(next);
  };

  // Only mount when a model exists — avoids a permanent overlay hit target.
  if (!model) return null;

  return (
    <div className={`m2m-overlay ${collapsed ? 'collapsed' : ''}`}>
      <div className="m2m-header">
        <strong>Adjuster</strong>
        <button type="button" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="m2m-toolbar">
            <button
              type="button"
              title="Undo"
              disabled={!historyFlags.canUndo}
              onClick={() => adjuster?.undo()}
            >
              Undo
            </button>
            <button
              type="button"
              title="Redo"
              disabled={!historyFlags.canRedo}
              onClick={() => adjuster?.redo()}
            >
              Redo
            </button>
            <button
              type="button"
              title="Deselect — clear selection (camera stays put)"
              onClick={() => adjuster?.detach({ restoreWorld: true, focus: false })}
            >
              Deselect
            </button>
          </div>

          <div className="m2m-field">
            <label>Target</label>
            <select
              value={targetMode}
              onMouseDown={toggleNativeSelect}
              onTouchStart={toggleNativeSelect}
              onChange={(e) => syncTargetMode(e.target.value)}
            >
              <option value="object">Object</option>
              <option value="bone">Bone</option>
            </select>
          </div>

          <div className="m2m-field">
            <label>Channel</label>
            <select
              value={channel}
              onMouseDown={toggleNativeSelect}
              onTouchStart={toggleNativeSelect}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="translate">Translate</option>
              <option value="rotate">Rotate</option>
              <option value="scale">Scale</option>
            </select>
          </div>

          <div className="m2m-field">
            <label>Space</label>
            <select
              value={space}
              onMouseDown={toggleNativeSelect}
              onTouchStart={toggleNativeSelect}
              onChange={(e) => onSpaceChange(e.target.value)}
            >
              <option value="local">Object / Local</option>
              <option value="world">World</option>
            </select>
          </div>

          <div className="m2m-target-name" title={activeLabel}>
            {activeLabel}
          </div>

          {targetMode === 'bone' && !selectedBoneNode && !attached?.isBone && (
            <div className="m2m-hint">
              Click a bone in the viewport (or Bone Structure), then adjust it here.
            </div>
          )}

          {AXES.map((axis) => (
            <div className="m2m-axis-row" key={axis}>
              <span className="axis-label">{axis.toUpperCase()}</span>
              <button type="button" onClick={() => nudge(axis, -1)} disabled={!canEdit}>−</button>
              <AxisNumberField
                axis={axis}
                channel={channel}
                value={readAxisValue(axis)}
                disabled={!canEdit}
                active={activeAxis === axis}
                onFocusAxis={setActiveAxis}
                onCommit={(ax, val) => writeAxisValue(ax, val)}
              />
              <button type="button" onClick={() => nudge(axis, 1)} disabled={!canEdit}>+</button>
            </div>
          ))}

          <div className="m2m-toolbar">
            <button
              type="button"
              disabled={!canEdit}
              title={`Reset ${activeAxis.toUpperCase()} to ${channel === 'scale' ? '1' : '0'}`}
              onClick={() => {
                adjuster?.resetAxis?.(activeAxis);
                if (!adjuster) writeAxisValue(activeAxis, channel === 'scale' ? 1 : 0);
                setRevision((n) => n + 1);
              }}
            >
              Reset {activeAxis.toUpperCase()}
            </button>
            <button
              type="button"
              disabled={!canEdit}
              title="Reset X/Y/Z for current channel"
              onClick={() => {
                adjuster?.resetAllAxes?.();
                if (!adjuster) {
                  AXES.forEach((ax) => {
                    writeAxisValue(ax, channel === 'scale' ? 1 : 0, { recordHistory: ax === 'x' });
                  });
                }
                setRevision((n) => n + 1);
              }}
            >
              Reset all
            </button>
          </div>

          <div className="m2m-hint">
            Double-click mesh toggles solid ↔ prior mode · click bone to select
          </div>
        </>
      )}
    </div>
  );
}
