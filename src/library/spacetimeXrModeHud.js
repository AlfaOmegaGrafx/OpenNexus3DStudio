/**
 * Persistent Space-Time XR move-mode HUD — camera-locked plane visible in immersive XR.
 */
import * as THREE from 'three';
import { labelSpacetimeXrControlMode } from './spacetimeXrAvatarView.js';

const HUD_W = 0.42;
const HUD_H = 0.07;
const FONT_PX = 52;

/**
 * @param {string} text
 */
function createModeTexture(text) {
  const width = 1024;
  const height = 160;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(12, 16, 28, 0.72)';
  ctx.beginPath();
  const r = 28;
  ctx.moveTo(r, 0);
  ctx.arcTo(width, 0, width, height, r);
  ctx.arcTo(width, height, 0, height, r);
  ctx.arcTo(0, height, 0, 0, r);
  ctx.arcTo(0, 0, width, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 120, 200, 0.85)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#9eb6ff';
  ctx.font = `600 28px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MOVE', width / 2, height * 0.32);

  ctx.fillStyle = '#f2f5ff';
  ctx.font = `bold ${FONT_PX}px system-ui, sans-serif`;
  ctx.fillText(text, width / 2, height * 0.68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class SpacetimeXrModeHud {
  /**
   * @param {{ camera: THREE.Camera }} ctx
   */
  constructor(ctx) {
    this.camera = ctx.camera;
    this._mode = '';
    this.root = new THREE.Group();
    this.root.name = 'SpacetimeXrModeHud';
    this.root.position.set(0, -0.22, -0.62);

    this._material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this._mesh = new THREE.Mesh(new THREE.PlaneGeometry(HUD_W, HUD_H), this._material);
    this._mesh.renderOrder = 9999;
    this.root.add(this._mesh);
    this.root.visible = false;

    if (this.camera) {
      this.camera.add(this.root);
    }
  }

  /** @param {boolean} presenting */
  setPresenting(presenting) {
    this.root.visible = !!presenting;
  }

  /**
   * @param {string} mode
   * @param {string} [label]
   */
  setMode(mode, label = '') {
    const nextLabel = label || labelSpacetimeXrControlMode(mode) || String(mode || '');
    if (nextLabel === this._mode) return;
    this._mode = nextLabel;

    const prev = this._material.map;
    const tex = createModeTexture(nextLabel);
    if (!tex) return;
    this._material.map = tex;
    this._material.needsUpdate = true;
    prev?.dispose?.();
  }

  dispose() {
    if (this.camera && this.root.parent === this.camera) {
      this.camera.remove(this.root);
    }
    this._material.map?.dispose?.();
    this._material.dispose();
    this._mesh.geometry.dispose();
  }
}
