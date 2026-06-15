/**
 * Right-thumbstick teleport for SceneManager XR (matches IWSDK /xr lab: aim, release to land).
 */
import * as THREE from './three.js';
import {
  isThumbstickTeleportAim,
  readRightThumbstickAxes,
} from './sceneManagerXrAxes.js';

const ARC_SEGMENTS = 16;
const GRAVITY = -0.4;
const MIN_TELEPORT_DIST = 0.35;
const MAX_TELEPORT_DIST = 12;

const _ray = new THREE.Ray();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();
const _head = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _pos = new THREE.Vector3();

/**
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} direction
 * @param {number} floorY
 * @param {THREE.Vector3[]} out
 */
function sampleParabolicArc(origin, direction, floorY, out) {
  const count = out.length;
  _vel.copy(direction).normalize().multiplyScalar(3);
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const time = t * 1.2;
    out[i].set(
      origin.x + _vel.x * time,
      origin.y + _vel.y * time + 0.5 * GRAVITY * time * time,
      origin.z + _vel.z * time,
    );
    if (out[i].y < floorY) {
      out[i].y = floorY;
    }
  }
}

export class SceneManagerXrTeleport {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this._aiming = false;
    this._targetValid = false;
    this._target = new THREE.Vector3();
    this._arcPoints = Array.from({ length: ARC_SEGMENTS }, () => new THREE.Vector3());
    this._marker = null;
    this._line = null;
  }

  reset() {
    this._aiming = false;
    this._targetValid = false;
    this._hideVisuals();
  }

  isAiming() {
    return this._aiming;
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState|null} right
   */
  update(right) {
    const rig = this.sceneManager?.xrLocomotionRig;
    const camera = this.sceneManager?.camera;
    const scene = this.sceneManager?.scene;
    if (!rig || !camera || !scene || !right?.connected) {
      this._endAim();
      return;
    }

    const stick = readRightThumbstickAxes(right);
    const aimNow = isThumbstickTeleportAim(stick.y, stick.x);

    if (aimNow) {
      if (!this._aiming) {
        this._ensureVisuals(scene);
        this._aiming = true;
      }
      _ray.origin.copy(right.rayOrigin);
      _ray.direction.copy(right.rayDirection).normalize();

      const floorY = rig.position.y;
      sampleParabolicArc(_ray.origin, _ray.direction, floorY, this._arcPoints);
      this._targetValid = this._raycastFloor(_ray, floorY, this._target);

      if (this._targetValid) {
        const dist = _ray.origin.distanceTo(this._target);
        if (dist < MIN_TELEPORT_DIST || dist > MAX_TELEPORT_DIST) {
          this._targetValid = false;
        }
      }

      this._updateVisuals(this._targetValid);
    } else if (this._aiming) {
      if (this._targetValid) {
        this._commitTeleport(rig, camera, this._target);
        this.sceneManager.emit?.('xrLocomotion', { type: 'teleport', target: this._target.clone() });
      }
      this._endAim();
    }
  }

  /**
   * @param {THREE.Ray} ray
   * @param {number} floorY
   * @param {THREE.Vector3} out
   */
  _raycastFloor(ray, floorY, out) {
    _plane.constant = -floorY;
    const hit = ray.intersectPlane(_plane, out);
    return !!hit;
  }

  /**
   * @param {THREE.Object3D} rig
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} target
   */
  _commitTeleport(rig, camera, target) {
    _head.copy(camera.position);
    _head.y = 0;
    _pos.copy(target);
    _pos.y = 0;
    const dx = _head.x - _pos.x;
    const dz = _head.z - _pos.z;
    rig.position.x += dx;
    rig.position.z += dz;
  }

  _ensureVisuals(scene) {
    if (!this._marker) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.15, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.name = 'XRTeleportMarker';
      scene.add(ring);
      this._marker = ring;
    }
    if (!this._line) {
      const geom = new THREE.BufferGeometry().setFromPoints(this._arcPoints);
      const line = new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
      );
      line.name = 'XRTeleportArc';
      scene.add(line);
      this._line = line;
    }
    this._marker.visible = true;
    this._line.visible = true;
  }

  /**
   * @param {boolean} valid
   */
  _updateVisuals(valid) {
    if (this._marker) {
      this._marker.position.copy(this._target);
      this._marker.position.y += 0.01;
      this._marker.material.color.setHex(valid ? 0xffffff : 0xed4337);
      this._marker.scale.setScalar(valid ? 1 : 0.5);
    }
    if (this._line) {
      this._line.geometry.setFromPoints(this._arcPoints);
      this._line.geometry.attributes.position.needsUpdate = true;
      this._line.material.color.setHex(valid ? 0xffffff : 0xed4337);
    }
  }

  _hideVisuals() {
    if (this._marker) this._marker.visible = false;
    if (this._line) this._line.visible = false;
  }

  _endAim() {
    this._aiming = false;
    this._targetValid = false;
    this._hideVisuals();
  }
}
