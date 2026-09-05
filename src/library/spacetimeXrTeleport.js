/**
 * Space-Time XR teleport — OpenNexus parity (right stick back aim, release to land).
 * Target Y snaps to capsule BVH walk mesh.
 */
import * as THREE from 'three';
import {
  isThumbstickTeleportAim,
  readRightThumbstickAxes,
} from './sceneManagerXrAxes.js';
import {
  followSpacetimeWalkSurfaceY,
  isSpacetimeFootingStable,
  isSpacetimeBeyondStadiumInclineLip,
  isSpacetimeTeleportDestinationValid,
  raycastSpacetimeWalkSurfaceAlongRay,
  SPACETIME_XR_EYE_TO_FLOOR,
} from './spacetimeXrGroundFollow.js';
import { snapSpacetimeWalkerToWalkSurface } from './spacetimeXrWalkerSnap.js';

const ARC_SEGMENTS = 16;
const GRAVITY = -0.4;
const MIN_TELEPORT_DIST = 0.35;
const MAX_TELEPORT_DIST = 12;
/** Green arc + reticle while teleport aim is active and target is valid. */
const TELEPORT_COLOR_ACTIVE = 0x22ff66;
const TELEPORT_COLOR_INVALID = 0xed4337;

const _ray = new THREE.Ray();
const _plane = new THREE.Vector3(0, 1, 0);
const _hit = new THREE.Vector3();
const _head = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _probe = new THREE.Vector3();

/**
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} direction
 * @param {number} floorY
 * @param {THREE.Vector3[]} out
 */
function sampleParabolicArc(origin, direction, floorY, out) {
  _vel.copy(direction).normalize().multiplyScalar(3);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / (out.length - 1);
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

export class SpacetimeXrTeleport {
  /**
   * @param {{ scene: THREE.Scene, locomotionRig: THREE.Group, camera: THREE.Camera, playerRoot?: THREE.Group|null }} ctx
   */
  constructor(ctx) {
    this.scene = ctx.scene;
    this.locomotionRig = ctx.locomotionRig;
    this.camera = ctx.camera;
    this.playerRoot = ctx.playerRoot ?? null;
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
   * @param {XRFrame|null} [frame]
   * @param {XRReferenceSpace|null} [referenceSpace]
   */
  update(right, frame = null, referenceSpace = null) {
    const rig = this.locomotionRig;
    const camera = this.camera;
    const scene = this.scene;
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
      this._targetValid = this._resolveWalkTarget(_ray, camera, this._target);

      if (this._targetValid) {
        const dist = _ray.origin.distanceTo(this._target);
        if (dist < MIN_TELEPORT_DIST || dist > MAX_TELEPORT_DIST) {
          this._targetValid = false;
        }
      }

      this._updateVisuals(this._targetValid);
    } else if (this._aiming) {
      if (this._targetValid) {
        this._commitTeleport(rig, camera, this._target, frame, referenceSpace);
      }
      this._endAim();
    }
  }

  /**
   * @param {THREE.Ray} ray
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} out
   */
  _resolveWalkTarget(ray, camera, out) {
    camera.getWorldPosition(_head);
    const headY = _head.y;

    const alongRay = raycastSpacetimeWalkSurfaceAlongRay(
      ray,
      MAX_TELEPORT_DIST,
      headY,
    );
    if (alongRay) {
      out.copy(alongRay.point);
      const referenceFootY = headY - SPACETIME_XR_EYE_TO_FLOOR;
      if (!isSpacetimeTeleportDestinationValid(_head, out.x, out.z, referenceFootY)) {
        return false;
      }
      return true;
    }

    const referenceFootY = headY - SPACETIME_XR_EYE_TO_FLOOR;
    const plane = new THREE.Plane(_plane, -referenceFootY);
    if (!ray.intersectPlane(plane, out)) return false;

    const fallback = raycastSpacetimeWalkSurfaceAlongRay(
      new THREE.Ray(
        new THREE.Vector3(out.x, headY + 4, out.z),
        new THREE.Vector3(0, -1, 0),
      ),
      headY + 8,
      headY,
    );
    if (!fallback) return false;
    out.copy(fallback.point);
    if (!isSpacetimeTeleportDestinationValid(_head, out.x, out.z, referenceFootY)) {
      return false;
    }
    return true;
  }

  /**
   * @param {THREE.Group} rig
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} target
   * @param {XRFrame|null} frame
   * @param {XRReferenceSpace|null} referenceSpace
   */
  _commitTeleport(rig, camera, target, frame, referenceSpace) {
    camera.getWorldPosition(_head);
    _head.y = 0;
    _pos.copy(target);
    _pos.y = 0;
    rig.position.x += _head.x - _pos.x;
    rig.position.z += _head.z - _pos.z;
    rig.updateMatrixWorld(true);

    followSpacetimeWalkSurfaceY(rig, camera, SPACETIME_XR_EYE_TO_FLOOR, 0.016, null);
    if (this.playerRoot?.visible) {
      snapSpacetimeWalkerToWalkSurface(this.playerRoot, camera);
    }
    console.info('[spacetime-xr] teleport', { x: target.x, z: target.z, y: target.y });
  }

  _ensureVisuals(scene) {
    if (!this._marker) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.15, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.name = 'SpacetimeXRTeleportMarker';
      scene.add(ring);
      this._marker = ring;
    }
    if (!this._line) {
      const geom = new THREE.BufferGeometry().setFromPoints(this._arcPoints);
      const line = new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
      );
      line.name = 'SpacetimeXRTeleportArc';
      scene.add(line);
      this._line = line;
    }
    this._marker.visible = true;
    this._line.visible = true;
  }

  /** @param {boolean} valid */
  _updateVisuals(valid) {
    if (this._marker) {
      this._marker.position.copy(this._target);
      this._marker.position.y += 0.01;
      this._marker.material.color.setHex(valid ? TELEPORT_COLOR_ACTIVE : TELEPORT_COLOR_INVALID);
      this._marker.scale.setScalar(valid ? 1 : 0.5);
    }
    if (this._line) {
      this._line.geometry.setFromPoints(this._arcPoints);
      this._line.geometry.attributes.position.needsUpdate = true;
      this._line.material.color.setHex(valid ? TELEPORT_COLOR_ACTIVE : TELEPORT_COLOR_INVALID);
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
