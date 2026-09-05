/**
 * Bone camera framing — put the selected bone / gizmo in the center of the free
 * viewport (between overlapping side chrome), preserving the current orbit direction.
 */
import * as THREE from './three.js';

const _offset = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _endCam = new THREE.Vector3();
const _endTarget = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * @param {string} boneName
 * @returns {{ distance: number }}
 */
export function getBoneFocusDistance(boneName) {
  const nameKey = String(boneName || '').toLowerCase().replace(/[\s_-]+/g, '');
  const headEye =
    nameKey === 'head'
    || nameKey === 'headtop'
    || (nameKey.includes('eye') && !nameKey.includes('brow'));
  const neck = /neck/i.test(String(boneName || ''));
  if (neck) return { distance: 0.42 };
  if (headEye) return { distance: 0.5 };
  return { distance: 0.5 };
}

/**
 * How much of `canvas` is covered from the left / right by overlapping chrome.
 * Only elements that actually intersect the canvas count; classified by which
 * half of the canvas their overlap sits in.
 * @param {HTMLElement | null | undefined} canvas
 * @returns {{ leftCover: number, rightCover: number }}
 */
export function getCanvasSideCoverPx(canvas) {
  const empty = { leftCover: 0, rightCover: 0 };
  if (typeof document === 'undefined' || !canvas) return empty;
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width <= 1) return empty;

  let leftCover = 0;
  let rightCover = 0;
  const canvasMidX = (canvasRect.left + canvasRect.right) / 2;

  const consider = (el) => {
    if (!(el instanceof HTMLElement)) return;
    // Collapsed / invisible overlays should not bias framing.
    const style = typeof window !== 'undefined' ? window.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(canvasRect.left, r.left);
    const right = Math.min(canvasRect.right, r.right);
    const overlap = right - left;
    if (overlap < 8) return;
    const mid = (left + right) / 2;
    if (mid <= canvasMidX) {
      leftCover = Math.max(leftCover, right - canvasRect.left);
    } else {
      rightCover = Math.max(rightCover, canvasRect.right - left);
    }
  };

  consider(document.querySelector('.bone-structure-panel'));
  consider(document.querySelector('.m2m-overlay'));
  consider(document.querySelector('.opennexus-sidebar:not(.collapsed)'));
  // Left task sidebar only if it actually overlaps the canvas (rare).
  consider(document.querySelector('.sidebar:not(.collapsed)'));

  leftCover = Math.max(0, Math.min(canvasRect.width, leftCover));
  rightCover = Math.max(0, Math.min(canvasRect.width, rightCover));
  return { leftCover, rightCover };
}

/**
 * Horizontal NDC bias so the gizmo sits in the free area between left/right chrome
 * (not the raw WebGL canvas center under overlays).
 * @param {HTMLElement | null | undefined} canvas
 * @returns {number} NDC x of free-viewport center in [-0.45, 0.45]
 */
export function getFreeViewportNdcBiasX(canvas) {
  if (typeof document === 'undefined' || !canvas) return 0;
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width <= 1) return 0;

  const { leftCover, rightCover } = getCanvasSideCoverPx(canvas);
  const freeLeft = leftCover;
  const freeRight = canvasRect.width - rightCover;
  if (freeRight - freeLeft < 40) return 0;
  const freeCenter = (freeLeft + freeRight) / 2;
  const canvasCenter = canvasRect.width / 2;
  // Pixel offset of free-center from canvas-center → NDC (ndc +1 = right edge).
  const bias = ((freeCenter - canvasCenter) / canvasRect.width) * 2;
  return Math.max(-0.45, Math.min(0.45, bias));
}

/**
 * @param {object} args
 * @param {import('three').PerspectiveCamera} args.camera
 * @param {import('three').Vector3} args.controlsTarget current orbit target
 * @param {import('three').Vector3} args.boneWorld
 * @param {string} [args.boneName]
 * @param {HTMLElement | null} [args.canvas]
 * @returns {{ endCam: import('three').Vector3, endTarget: import('three').Vector3, distance: number, biasX: number }}
 */
export function computeBoneFocusCamera({
  camera,
  controlsTarget,
  boneWorld,
  boneName = '',
  canvas = null,
}) {
  const { distance: focusDistance } = getBoneFocusDistance(boneName);
  _offset.copy(camera.position).sub(controlsTarget);
  if (_offset.lengthSq() < 1e-8) {
    _offset.set(0, 0.15, 1);
  }
  const currentDist = _offset.length();
  // Keep viewing angle; use focus distance (do not preserve a far full-model orbit).
  const distance = focusDistance;
  _offset.multiplyScalar(distance / currentDist);

  // Orbit target on the bone → gizmo at optical center before bias.
  _endTarget.copy(boneWorld);
  _endCam.copy(boneWorld).add(_offset);

  const bias = getFreeViewportNdcBiasX(canvas);
  if (Math.abs(bias) > 0.001 && camera.isPerspectiveCamera) {
    // Camera-right from the preserved orbit, not stale matrixWorld alone.
    _look.copy(_offset).normalize();
    _up.copy(camera.up).normalize();
    _right.crossVectors(_up, _look);
    if (_right.lengthSq() < 1e-10) {
      _right.set(1, 0, 0);
    } else {
      _right.normalize();
    }
    const vFov = (camera.fov * Math.PI) / 180;
    const halfWidthAtDist = distance * Math.tan(vFov / 2) * camera.aspect;
    // Shift cam+target so the bone (fixed in world) projects to NDC x = bias.
    // With identical cam/target shifts S along +right: bone appears at NDC ≈ -S/halfWidth.
    // Want NDC = bias ⇒ S = -bias * halfWidth.
    const worldShift = -bias * halfWidthAtDist;
    _endCam.addScaledVector(_right, worldShift);
    _endTarget.addScaledVector(_right, worldShift);
  }

  return {
    endCam: _endCam.clone(),
    endTarget: _endTarget.clone(),
    distance,
    biasX: bias,
  };
}
