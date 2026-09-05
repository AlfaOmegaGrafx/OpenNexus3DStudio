import { describe, expect, it, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  computeBoneFocusCamera,
  getBoneFocusDistance,
  getCanvasSideCoverPx,
  getFreeViewportNdcBiasX,
} from '../library/boneFocusCamera.js';

describe('boneFocusCamera', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses closer distance for neck than body', () => {
    expect(getBoneFocusDistance('rightUpperArm').distance).toBeCloseTo(0.5);
    expect(getBoneFocusDistance('Neck').distance).toBeCloseTo(0.42);
    expect(getBoneFocusDistance('Head').distance).toBeCloseTo(0.5);
  });

  it('preserves orbit direction and aims so bone is optical center without chrome', () => {
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 100);
    camera.position.set(2, 1.5, 3);
    camera.up.set(0, 1, 0);
    camera.updateMatrixWorld(true);
    const controlsTarget = new THREE.Vector3(0, 1, 0);
    const boneWorld = new THREE.Vector3(0.4, 1.3, 0.05);
    const { endCam, endTarget, distance, biasX } = computeBoneFocusCamera({
      camera,
      controlsTarget,
      boneWorld,
      boneName: 'rightUpperArm',
      canvas: null,
    });
    expect(distance).toBeCloseTo(0.5);
    expect(biasX).toBe(0);
    expect(endTarget.x).toBeCloseTo(0.4);
    expect(endTarget.y).toBeCloseTo(1.3);
    const dir = endCam.clone().sub(endTarget).normalize();
    const prev = camera.position.clone().sub(controlsTarget).normalize();
    expect(dir.dot(prev)).toBeGreaterThan(0.99);
    expect(endCam.distanceTo(endTarget)).toBeCloseTo(0.5, 2);
  });

  it('classifies overlapping chrome as left/right cover by side of canvas', () => {
    document.body.innerHTML = `
      <canvas id="c"></canvas>
      <div class="bone-structure-panel"></div>
      <div class="m2m-overlay"></div>
    `;
    const canvas = document.getElementById('c');
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500,
    });
    // Bone panel sits on the LEFT half of the canvas (overlap).
    document.querySelector('.bone-structure-panel').getBoundingClientRect = () => ({
      left: 0, top: 0, right: 280, bottom: 500, width: 280, height: 500,
    });
    document.querySelector('.m2m-overlay').getBoundingClientRect = () => ({
      left: 820, top: 0, right: 1000, bottom: 200, width: 180, height: 200,
    });
    const { leftCover, rightCover } = getCanvasSideCoverPx(canvas);
    expect(leftCover).toBeCloseTo(280);
    expect(rightCover).toBeCloseTo(180);
    const bias = getFreeViewportNdcBiasX(canvas);
    // Free center at (280+820)/2=550, canvas center 500 → slight positive bias
    expect(bias).toBeGreaterThan(0);
  });

  it('shifts framing so the bone projects toward free-viewport NDC (not opposite)', () => {
    document.body.innerHTML = `
      <canvas id="c"></canvas>
      <div class="m2m-overlay"></div>
    `;
    const canvas = document.getElementById('c');
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500,
    });
    // Right-side Adjuster only → free center left of canvas center → negative bias.
    document.querySelector('.m2m-overlay').getBoundingClientRect = () => ({
      left: 820, top: 0, right: 1000, bottom: 200, width: 180, height: 200,
    });

    const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 1, 2);
    camera.up.set(0, 1, 0);
    camera.updateMatrixWorld(true);
    const controlsTarget = new THREE.Vector3(0, 1, 0);
    const boneWorld = new THREE.Vector3(0.2, 1.1, 0);
    const { endCam, endTarget, biasX } = computeBoneFocusCamera({
      camera,
      controlsTarget,
      boneWorld,
      boneName: 'leftHand',
      canvas,
    });
    expect(biasX).toBeLessThan(0);

    // Place a temp camera at the framed pose and project the bone.
    const framed = camera.clone();
    framed.position.copy(endCam);
    framed.lookAt(endTarget);
    framed.updateMatrixWorld(true);
    const ndc = boneWorld.clone().project(framed);
    // Bone should land near biasX (free center), not -biasX.
    expect(ndc.x).toBeCloseTo(biasX, 1);
  });

  it('ignores bone panel that sits fully outside the canvas (left sidebar)', () => {
    document.body.innerHTML = `
      <canvas id="c"></canvas>
      <div class="bone-structure-panel"></div>
    `;
    const canvas = document.getElementById('c');
    canvas.getBoundingClientRect = () => ({
      left: 320, top: 0, right: 1320, bottom: 800, width: 1000, height: 800,
    });
    document.querySelector('.bone-structure-panel').getBoundingClientRect = () => ({
      left: 0, top: 40, right: 310, bottom: 700, width: 310, height: 660,
    });
    const { leftCover, rightCover } = getCanvasSideCoverPx(canvas);
    expect(leftCover).toBe(0);
    expect(rightCover).toBe(0);
    expect(getFreeViewportNdcBiasX(canvas)).toBe(0);
  });
});
