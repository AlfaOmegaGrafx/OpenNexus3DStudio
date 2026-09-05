/**
 * Mesh2Motion-style Adjuster session: TransformControls gizmo, pick, focus, undo.
 * Patterns from scottpetrovic/mesh2motion-app (StepEditSkeleton + UndoRedoSystem).
 */
import * as THREE from './three.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  applyTransformSnapshot,
  captureTransformSnapshot,
  createTransformHistory,
} from './mesh2MotionTransformHistory.js';
import { computeBoneFocusCamera } from './boneFocusCamera.js';

const _world = new THREE.Vector3();

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export function createSceneManagerMesh2MotionAdjuster(sceneManager) {
  return new SceneManagerMesh2MotionAdjuster(sceneManager);
}

export class SceneManagerMesh2MotionAdjuster {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    /** @type {TransformControls|null} */
    this.transformControls = null;
    /** @type {import('three').Object3D|null} */
    this.attachedTarget = null;
    /** @type {'object'|'bone'|null} */
    this.selectionKind = null;
    /** @type {'local'|'world'} */
    this.space = 'local';
    /** @type {'translate'|'rotate'|'scale'} */
    this.mode = 'translate';
    this.history = createTransformHistory(50);
    this._pickingEnabled = true;
    this._dragSnapshot = null;
    this._clickHandler = null;
    this._dblClickHandler = null;
    this._pointerDownHandler = null;
    this._suppressClickUntil = 0;
    /** @type {string|null} render mode before double-click → solid object */
    this._renderModeBeforeObject = null;
  }

  ensureInitialized() {
    const sm = this.sceneManager;
    if (this.transformControls || !sm?.camera || !sm?.renderer || !sm?.scene) return;

    const tc = new TransformControls(sm.camera, sm.renderer.domElement);
    tc.setSize(0.85);
    tc.setSpace(this.space);
    tc.setMode(this.mode);
    tc.addEventListener('dragging-changed', (event) => {
      if (sm.controls) sm.controls.enabled = !event.value;
      if (event.value) {
        this._dragSnapshot = this._captureAttached();
      } else if (this._dragSnapshot?.length) {
        this.history.push(this._dragSnapshot);
        this._dragSnapshot = null;
        this._emitChanged();
      }
      this._suppressClickUntil = performance.now() + 250;
    });
    tc.addEventListener('objectChange', () => {
      this._emitChanged();
    });

    // TransformControls root helper must be in the scene (three r152+).
    sm.scene.add(tc.getHelper());
    this.transformControls = tc;
    this._bindPickListeners();
  }

  dispose() {
    this.detach();
    this._unbindPickListeners();
    const sm = this.sceneManager;
    if (this.transformControls) {
      const helper = this.transformControls.getHelper();
      sm?.scene?.remove(helper);
      this.transformControls.dispose?.();
      this.transformControls = null;
    }
    this.history.clear();
  }

  /**
   * @param {'translate'|'rotate'|'scale'} mode
   */
  setMode(mode) {
    this.mode = mode;
    this.transformControls?.setMode(mode);
  }

  /**
   * @param {'local'|'world'} space
   */
  setSpace(space) {
    this.space = space;
    this.transformControls?.setSpace(space);
    this.sceneManager.emit?.('adjusterSpaceChanged', { space });
  }

  /**
   * Auto: selection → local (object space); none → world.
   * @param {'auto'|'local'|'world'} [preference='auto']
   */
  applySpacePreference(preference = 'auto') {
    if (preference === 'local' || preference === 'world') {
      this.setSpace(preference);
      return;
    }
    this.setSpace(this.attachedTarget ? 'local' : 'world');
  }

  /**
   * @param {import('three').Object3D|null} target
   * @param {'object'|'bone'|null} kind
   * @param {{ focus?: boolean, space?: 'auto'|'local'|'world' }} [opts]
   */
  attach(target, kind, opts = {}) {
    this.ensureInitialized();
    const sm = this.sceneManager;
    if (!this.transformControls) return;

    if (!target) {
      this.detach({ restoreWorld: true, focus: opts.focus !== false });
      return;
    }

    this.attachedTarget = target;
    this.selectionKind = kind;
    this.transformControls.attach(target);
    this.transformControls.enabled = true;
    const helper = this.transformControls.getHelper();
    if (helper) helper.visible = true;
    this.applySpacePreference(opts.space ?? 'auto');

    // Camera moves only when explicitly requested (e.g. bone pick zoom).
    if (opts.focus === true) {
      this.focusOnAttached();
    }

    sm.emit?.('adjusterTargetChanged', {
      kind,
      name: target.name || null,
      uuid: target.uuid,
    });
    this._emitChanged();
  }

  /**
   * @param {{ restoreWorld?: boolean, focus?: boolean }} [opts]
   */
  detach(opts = {}) {
    const sm = this.sceneManager;
    if (this.transformControls) {
      this.transformControls.detach();
      this.transformControls.enabled = false;
      const helper = this.transformControls.getHelper();
      if (helper) helper.visible = false;
    }
    this.attachedTarget = null;
    this.selectionKind = null;

    if (opts.restoreWorld) {
      this.setSpace('world');
      // Never auto-move the camera on deselect — only clear selection / gizmo.
    }

    this._restoreRenderModeBeforeObject();

    sm.deselectBone?.();
    sm.deselectAllBones?.();
    sm.emit?.('adjusterTargetChanged', { kind: null, name: null, uuid: null });
    this._emitChanged();
  }

  focusOnAttached() {
    const sm = this.sceneManager;
    const target = this.attachedTarget;
    if (!target || !sm?.camera || !sm?.controls) return;

    if (this.selectionKind === 'bone' || target.isBone) {
      const name = target.name || '';
      target.updateWorldMatrix?.(true, false);
      target.getWorldPosition(_world);
      sm._boneZoomToken = (sm._boneZoomToken || 0) + 1;
      sm._syncBoneHelperWorldPositions?.();
      this._zoomToWorldPoint(_world, name);
      return;
    }

    sm.focusOnModel?.();
  }

  /**
   * Restore render mode saved when entering object (solid) via double-click.
   */
  _restoreRenderModeBeforeObject() {
    const sm = this.sceneManager;
    const prev = this._renderModeBeforeObject;
    if (!prev || !sm) return;
    this._renderModeBeforeObject = null;
    if (sm.renderMode === prev) return;
    sm.setRenderMode?.(prev, { focus: false });
    sm.emit?.('adjusterUiRenderMode', { mode: prev });
  }

  /**
   * Center bone in the free viewport; preserve orbit direction.
   * @param {import('three').Vector3} worldPoint
   * @param {string} [boneName]
   */
  _zoomToWorldPoint(worldPoint, boneName = '') {
    const sm = this.sceneManager;
    if (!sm?.camera || !sm?.controls) return;
    const { endCam, endTarget } = computeBoneFocusCamera({
      camera: sm.camera,
      controlsTarget: sm.controls.target,
      boneWorld: worldPoint,
      boneName,
      canvas: sm.renderer?.domElement || null,
    });
    const startCam = sm.camera.position.clone();
    const startLook = sm.controls.target.clone();
    const start = performance.now();
    const duration = 450;
    const token = (this._zoomToken = (this._zoomToken || 0) + 1);
    const tick = (now) => {
      if (token !== this._zoomToken) return;
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - (1 - t) ** 3;
      sm.camera.position.lerpVectors(startCam, endCam, ease);
      sm.controls.target.lerpVectors(startLook, endTarget, ease);
      sm.controls.update();
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /**
   * @returns {TransformSnapshot[]}
   */
  _captureAttached() {
    const snap = captureTransformSnapshot(this.attachedTarget);
    return snap ? [snap] : [];
  }

  /**
   * @param {string} uuid
   */
  _resolveUuid(uuid) {
    if (this.attachedTarget?.uuid === uuid) return this.attachedTarget;
    const model = this.sceneManager.currentModel;
    if (!model) return null;
    if (model.uuid === uuid) return model;
    let found = null;
    model.traverse((node) => {
      if (!found && node.uuid === uuid) found = node;
    });
    return found;
  }

  pushHistoryBeforeEdit() {
    const snaps = this._captureAttached();
    if (snaps.length) this.history.push(snaps);
  }

  undo() {
    const ok = this.history.undo(
      (uuid) => this._resolveUuid(uuid),
      () => this._captureAttached(),
    );
    if (ok) this._emitChanged();
    return ok;
  }

  redo() {
    const ok = this.history.redo(
      (uuid) => this._resolveUuid(uuid),
      () => this._captureAttached(),
    );
    if (ok) this._emitChanged();
    return ok;
  }

  canUndo() {
    return this.history.canUndo();
  }

  canRedo() {
    return this.history.canRedo();
  }

  /**
   * Reset one axis of the current mode on the attached target.
   * @param {'x'|'y'|'z'} axis
   */
  resetAxis(axis) {
    const target = this.attachedTarget;
    if (!target) return;
    this.pushHistoryBeforeEdit();
    if (this.mode === 'translate') target.position[axis] = 0;
    else if (this.mode === 'rotate') target.rotation[axis] = 0;
    else target.scale[axis] = 1;
    target.updateMatrixWorld?.(true);
    this._emitChanged();
  }

  resetAllAxes() {
    const target = this.attachedTarget;
    if (!target) return;
    this.pushHistoryBeforeEdit();
    if (this.mode === 'translate') target.position.set(0, 0, 0);
    else if (this.mode === 'rotate') target.rotation.set(0, 0, 0);
    else target.scale.set(1, 1, 1);
    target.updateMatrixWorld?.(true);
    this._emitChanged();
  }

  _emitChanged() {
    this.sceneManager.emit?.('adjusterTransformChanged', {
      kind: this.selectionKind,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      space: this.space,
      mode: this.mode,
    });
  }

  _bindPickListeners() {
    const el = this._pickElement();
    if (!el || this._clickHandler) return;

    this._pointerDownPos = null;
    this._pointerDownHandler = (event) => {
      this._pointerDownPos = { x: event.clientX, y: event.clientY };
    };
    this._clickHandler = (event) => {
      // Ignore click that followed an orbit drag.
      if (this._pointerDownPos) {
        const dx = event.clientX - this._pointerDownPos.x;
        const dy = event.clientY - this._pointerDownPos.y;
        this._pointerDownPos = null;
        if ((dx * dx + dy * dy) > 36) return;
      }
      // detail === 2 is the second click of a double-click; skip (dblclick handles mesh).
      if (event.detail > 1) return;
      this.handleViewportClick(event);
    };
    this._dblClickHandler = (event) => {
      if (this._pointerDownPos) {
        const dx = event.clientX - this._pointerDownPos.x;
        const dy = event.clientY - this._pointerDownPos.y;
        this._pointerDownPos = null;
        if ((dx * dx + dy * dy) > 36) return;
      }
      this.handleViewportDoubleClick(event);
    };
    el.addEventListener('pointerdown', this._pointerDownHandler);
    el.addEventListener('click', this._clickHandler);
    el.addEventListener('dblclick', this._dblClickHandler);
  }

  _pickElement() {
    const sm = this.sceneManager;
    return sm?.renderer?.domElement || sm?.container || sm?.sceneHostElement || null;
  }

  _unbindPickListeners() {
    const el = this._pickElement();
    if (el && this._clickHandler) {
      el.removeEventListener('click', this._clickHandler);
    }
    if (el && this._dblClickHandler) {
      el.removeEventListener('dblclick', this._dblClickHandler);
    }
    if (el && this._pointerDownHandler) {
      el.removeEventListener('pointerdown', this._pointerDownHandler);
    }
    this._clickHandler = null;
    this._dblClickHandler = null;
    this._pointerDownHandler = null;
  }

  /**
   * @param {MouseEvent} event
   * @returns {{ mouse: import('three').Vector2, host: Element } | null}
   */
  _rayFromEvent(event) {
    const sm = this.sceneManager;
    const host = sm?.container || sm?.sceneHostElement || sm?.renderer?.domElement;
    if (!sm?.camera || !host) return null;
    if (!sm.raycaster) sm.raycaster = new THREE.Raycaster();
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    sm.raycaster.setFromCamera(mouse, sm.camera);
    return { mouse, host };
  }

  /**
   * Double-click mesh:
   * - non-solid → solid + select object (remembers prior mode)
   * - solid again → restore the render mode left behind
   * @param {MouseEvent} event
   */
  handleViewportDoubleClick(event) {
    if (!this._pickingEnabled) return;
    if (performance.now() < this._suppressClickUntil) return;
    if (this.transformControls?.dragging) return;
    if (!this._rayFromEvent(event)) return;

    const sm = this.sceneManager;
    const model = sm.currentModel;
    if (!model) return;

    const meshHits = sm.raycaster.intersectObject(model, true)
      .filter((h) => h.object?.isMesh && !h.object.userData?.isBoneHelper);
    if (meshHits.length === 0) return;

    event.stopPropagation?.();
    event.preventDefault?.();

    // Second double-click while solid → return to previous render mode.
    if (sm.renderMode === 'solid' && this._renderModeBeforeObject) {
      this._restoreRenderModeBeforeObject();
      return;
    }

    if (sm.renderMode && sm.renderMode !== 'solid') {
      this._renderModeBeforeObject = sm.renderMode;
      sm.setRenderMode?.('solid', { focus: false });
      sm.emit?.('adjusterUiRenderMode', { mode: 'solid' });
    }
    this.attach(model, 'object', { focus: false, space: 'auto' });
  }

  /**
   * Single-click: bone helpers only. Mesh pick is double-click in every render mode.
   * @param {MouseEvent} event
   */
  handleViewportClick(event) {
    if (!this._pickingEnabled) return;
    if (performance.now() < this._suppressClickUntil) return;
    if (this.transformControls?.dragging) return;
    if (!this._rayFromEvent(event)) return;

    const sm = this.sceneManager;

    if (sm.boneHelpers?.length) {
      const boneHits = sm.raycaster.intersectObjects(sm.boneHelpers, false);
      if (boneHits.length > 0) {
        const helper = boneHits[0].object;
        const boneName = helper.userData?.boneName;
        const bone = helper.userData?.originalBone
          || this._findBoneByName(boneName);
        if (bone) {
          event.stopPropagation?.();
          this._restoreRenderModeBeforeObject();
          sm.selectBone?.(boneName);
          if (sm.renderMode !== 'skeleton') {
            sm.setRenderMode?.('skeleton', { focus: false });
          }
          sm.emit?.('adjusterUiRenderMode', { mode: 'skeleton' });
          // Always focus — Head/eyes preserve distance; others use classic offset.
          this.attach(bone, 'bone', { focus: true, space: 'auto' });
          return;
        }
      }
    }

    // Any render mode: single-click mesh does nothing (double-click selects object).
    const model = sm.currentModel;
    if (model) {
      const meshHits = sm.raycaster.intersectObject(model, true)
        .filter((h) => h.object?.isMesh && !h.object.userData?.isBoneHelper);
      if (meshHits.length > 0) {
        return;
      }
    }

    // Empty space → deselect only (do not move camera); restore prior render mode.
    this.detach({ restoreWorld: true, focus: false });
  }

  /**
   * @param {string} boneName
   */
  _findBoneByName(boneName) {
    if (!boneName || !this.sceneManager.currentModel) return null;
    let found = null;
    this.sceneManager.currentModel.traverse((node) => {
      if (!found && node.isBone && node.name === boneName) found = node;
    });
    return found;
  }

  /**
   * Keep gizmo in sync after external numeric edits.
   */
  refresh() {
    if (this.attachedTarget && this.transformControls) {
      this.transformControls.attach(this.attachedTarget);
    }
  }
}
