/**
 * Map XR grip / secondary trigger (squeeze) to Windows right-mouse-button events
 * on the viewport canvas — OrbitControls pan, context menus, etc.
 * Skipped when squeeze starts a proximity grab on a world prop.
 */
import * as THREE from './three.js';

const _world = new THREE.Vector3();
const _ndc = new THREE.Vector3();

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
export class SceneManagerXrMouseEmulation {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    /** @type {Set<string>} */
    this._rmbDownHands = new Set();
    /** @type {Set<string>} */
    this._squeezeUsedForGrab = new Set();
  }

  reset() {
    this._rmbDownHands.clear();
    this._squeezeUsedForGrab.clear();
  }

  /**
   * Call after SceneManagerXrGrab.update each frame.
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   * @param {import('./sceneManagerXrGrab.js').SceneManagerXrGrab} grab
   */
  update(pointers, grab) {
    const dom = this.sceneManager.renderer?.domElement;
    const camera = this.sceneManager.camera;
    if (!dom || !camera || !Array.isArray(pointers)) return;

    for (const pointer of pointers) {
      const key = pointer.handedness;

      if (pointer.squeezeStart) {
        if (grab?.activeGrabs?.has(key)) {
          this._squeezeUsedForGrab.add(key);
          continue;
        }
        const near = grab?.findProximityTarget?.(pointer);
        if (near) {
          this._squeezeUsedForGrab.add(key);
          continue;
        }
        this._dispatchMouse(dom, camera, pointer, 'mousedown', 2);
        this._rmbDownHands.add(key);
      }

      if (pointer.squeezeEnd) {
        const usedForGrab = this._squeezeUsedForGrab.has(key);
        this._squeezeUsedForGrab.delete(key);
        if (usedForGrab || !this._rmbDownHands.has(key)) continue;
        this._dispatchMouse(dom, camera, pointer, 'mouseup', 2);
        this._dispatchMouse(dom, camera, pointer, 'contextmenu', 2);
        this._rmbDownHands.delete(key);
      }
    }
  }

  /**
   * @param {HTMLElement} dom
   * @param {THREE.Camera} camera
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   * @param {'mousedown' | 'mouseup' | 'contextmenu'} type
   * @param {number} button
   */
  _dispatchMouse(dom, camera, pointer, type, button) {
    const coords = this._pointerToClient(dom, camera, pointer);
    if (!coords) return;
    dom.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: typeof window !== 'undefined' ? window : undefined,
        clientX: coords.x,
        clientY: coords.y,
        button,
        buttons: type === 'mouseup' || type === 'contextmenu' ? 0 : 1 << button,
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

    _world.copy(pointer.rayOrigin).addScaledVector(pointer.rayDirection, 1.5);
    _ndc.copy(_world).project(camera);

    return {
      x: rect.left + (_ndc.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-_ndc.y * 0.5 + 0.5) * rect.height,
    };
  }
}
