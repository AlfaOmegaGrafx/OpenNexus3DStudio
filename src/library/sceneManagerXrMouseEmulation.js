/**
 * Map XR grip / secondary trigger (squeeze) to desktop mouse:
 * - Ray hit on scene model/mesh → right-click context menu
 * - Ray miss → Ctrl + right-drag pan (OrbitControls)
 * Primary trigger (select) is handled separately for grab — never duplicated here.
 */
import * as THREE from './three.js';

const _world = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

/**
 * @typedef {'context' | 'pan'} XrRmbMode
 */

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export class SceneManagerXrMouseEmulation {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    /** @type {Map<string, XrRmbMode>} */
    this._rmbModeByHand = new Map();
    /** @type {Set<string>} */
    this._rmbDownHands = new Set();
    this._raycaster = new THREE.Raycaster();
  }

  reset() {
    this._rmbModeByHand.clear();
    this._rmbDownHands.clear();
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   */
  update(pointers) {
    const dom = this.sceneManager.renderer?.domElement;
    const camera = this.sceneManager.camera;
    if (!dom || !camera || !Array.isArray(pointers)) return;

    for (const pointer of pointers) {
      const key = pointer.handedness;

      if (pointer.squeezeStart) {
        const hit = this._raycastScene(pointer);
        const mode = hit ? 'context' : 'pan';
        this._rmbModeByHand.set(key, mode);
        this._dispatchMouse(dom, camera, pointer, 'mousedown', 2, {
          ctrlKey: mode === 'pan',
        });
        this._rmbDownHands.add(key);
      }

      if (pointer.squeezePressed && this._rmbDownHands.has(key)) {
        const mode = this._rmbModeByHand.get(key);
        if (mode === 'pan') {
          this._dispatchMouse(dom, camera, pointer, 'mousemove', 2, { ctrlKey: true });
        }
      }

      if (pointer.squeezeEnd) {
        const mode = this._rmbModeByHand.get(key);
        this._rmbModeByHand.delete(key);
        if (!this._rmbDownHands.has(key)) continue;

        this._dispatchMouse(dom, camera, pointer, 'mouseup', 2, {
          ctrlKey: mode === 'pan',
        });
        if (mode === 'context') {
          this._dispatchMouse(dom, camera, pointer, 'contextmenu', 2, { ctrlKey: false });
        }
        this._rmbDownHands.delete(key);
      }
    }
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   */
  _raycastScene(pointer) {
    const sm = this.sceneManager;
    if (!sm?.scene) return null;

    _rayDir.copy(pointer.rayDirection).normalize();
    this._raycaster.set(pointer.rayOrigin, _rayDir);
    this._raycaster.far = 50;

    const targets = [];
    const collectMeshes = (root) => {
      if (!root) return;
      root.traverse((child) => {
        if (child.isMesh && child.visible) targets.push(child);
      });
    };
    collectMeshes(sm.currentModel);
    collectMeshes(sm.propsRoot);
    if (sm.player) collectMeshes(sm.player);

    if (targets.length === 0) return null;
    const hits = this._raycaster.intersectObjects(targets, false);
    return hits[0] || null;
  }

  /**
   * @param {HTMLElement} dom
   * @param {THREE.Camera} camera
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   * @param {'mousedown' | 'mouseup' | 'mousemove' | 'contextmenu'} type
   * @param {number} button
   * @param {{ ctrlKey?: boolean }} [modifiers]
   */
  _dispatchMouse(dom, camera, pointer, type, button, modifiers = {}) {
    const coords = this._pointerToClient(dom, camera, pointer);
    if (!coords) return;

    const ctrlKey = !!modifiers.ctrlKey;
    const buttons =
      type === 'mouseup' || type === 'contextmenu' ? 0 : ctrlKey ? 0 : 1 << button;

    dom.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: typeof window !== 'undefined' ? window : undefined,
        clientX: coords.x,
        clientY: coords.y,
        button,
        buttons,
        ctrlKey,
      }),
    );
  }

  /**
   * @param {HTMLElement} dom
   * @param {THREE.Camera} camera
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   */
  _pointerToClient(dom, camera, pointer) {
    const rect = dom.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const hit = this._raycastScene(pointer);
    if (hit) {
      _world.copy(hit.point);
    } else {
      _world.copy(pointer.rayOrigin).addScaledVector(pointer.rayDirection, 1.5);
    }
    _ndc.copy(_world).project(camera);

    return {
      x: rect.left + (_ndc.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-_ndc.y * 0.5 + 0.5) * rect.height,
    };
  }
}
