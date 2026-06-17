/**
 * Phase 4 — distance + proximity grab for SceneManager world props.
 */
import * as THREE from './three.js';
import { applyDeadzone } from './sceneManagerXrAxes.js';

const GRAB_LERP = 0.35;
const PROXIMITY_RADIUS = 0.22;
const RAY_MAX_DISTANCE = 12;
const RAY_MIN_DISTANCE = 0.15;
const PLACEMENT_SPEED = 2.8;

const _worldPos = new THREE.Vector3();
const _target = new THREE.Vector3();

/**
 * @param {THREE.Object3D} object
 */
export function isXrGrabbableObject(object) {
  if (!object) return false;
  let node = object;
  while (node) {
    const interaction = node.userData?.interaction;
    if (interaction?.type === 'static') return false;
    if (node.userData?.worldPropId || interaction?.type === 'grabbable') return true;
    if (node.userData?.xrGrabbable) return true;
    node = node.parent;
  }
  return false;
}

/**
 * @param {THREE.Object3D} hit
 * @returns {THREE.Object3D|null}
 */
export function resolveGrabbableRoot(hit) {
  let node = hit;
  while (node) {
    if (node.userData?.worldPropId || node.userData?.xrGrabbable) return node;
    const interaction = node.userData?.interaction;
    if (interaction?.type === 'grabbable') return node;
    node = node.parent;
  }
  return null;
}

export class SceneManagerXrGrab {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.raycaster = new THREE.Raycaster();
    /** @type {Map<string, { object: THREE.Object3D, mode: 'distance'|'proximity', anchor: THREE.Vector3, rayDistance: number, worldGrabDelta: THREE.Vector3 }>} */
    this.activeGrabs = new Map();
    this.cursorMeshes = new Map();
    this.rayLines = new Map();
    this._grabbableRoots = [];
    this._hitPoint = new THREE.Vector3();
  }

  reset() {
    this.releaseAll();
    for (const mesh of this.cursorMeshes.values()) {
      mesh.parent?.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
    for (const line of this.rayLines.values()) {
      line.parent?.remove(line);
      line.geometry?.dispose?.();
      line.material?.dispose?.();
    }
    this.cursorMeshes.clear();
    this.rayLines.clear();
    this._grabbableRoots = [];
  }

  /**
   * Collect grabbable roots from propsRoot (+ optional demo cube).
   */
  syncGrabbablesFromScene() {
    const roots = [];
    const propsRoot = this.sceneManager?.propsRoot;
    if (propsRoot) {
      propsRoot.traverse((child) => {
        if (child.userData?.worldPropId && isXrGrabbableObject(child)) {
          if (!roots.includes(child)) roots.push(child);
        }
      });
      for (const prop of propsRoot.children) {
        if (isXrGrabbableObject(prop) && !roots.includes(prop)) roots.push(prop);
      }
    }
    this._grabbableRoots = roots;
    return roots.length;
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   */
  raycast(pointer) {
    this.raycaster.set(pointer.rayOrigin, pointer.rayDirection.normalize());
    this.raycaster.far = RAY_MAX_DISTANCE;
    const targets = [];
    for (const root of this._grabbableRoots) {
      root.traverse((child) => {
        if (child.isMesh) targets.push(child);
      });
    }
    if (targets.length === 0) return null;
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      const root = resolveGrabbableRoot(hit.object);
      if (root) {
        this._hitPoint.copy(hit.point);
        return { root, point: hit.point.clone(), distance: hit.distance };
      }
    }
    return null;
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   */
  findProximityTarget(pointer) {
    let best = null;
    let bestDist = PROXIMITY_RADIUS;
    for (const root of this._grabbableRoots) {
      root.getWorldPosition(_worldPos);
      const d = _worldPos.distanceTo(pointer.gripPosition);
      if (d < bestDist) {
        bestDist = d;
        best = root;
      }
    }
    return best;
  }

  hasActiveGrab() {
    return this.activeGrabs.size > 0;
  }

  /**
   * Right thumbstick up/down moves held objects along the grabbing hand's pointer ray.
   * @param {number} stickY
   * @param {number} deltaSeconds
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   */
  applyRightStickPlacement(stickY, deltaSeconds, pointers) {
    const axis = applyDeadzone(stickY);
    if (axis === 0) return;

    for (const [hand, grab] of this.activeGrabs) {
      const pointer = pointers.find((p) => p.handedness === hand);
      if (!pointer) continue;
      grab.rayDistance += axis * PLACEMENT_SPEED * deltaSeconds;
      grab.rayDistance = THREE.MathUtils.clamp(
        grab.rayDistance,
        RAY_MIN_DISTANCE,
        RAY_MAX_DISTANCE,
      );
      this._followPointerRay(grab, pointer);
    }
  }

  /**
   * @param {{ object: THREE.Object3D, rayDistance: number, worldGrabDelta: THREE.Vector3 }} grab
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   */
  _followPointerRay(grab, pointer) {
    _target
      .copy(pointer.rayOrigin)
      .addScaledVector(pointer.rayDirection.clone().normalize(), grab.rayDistance);
    _worldPos.copy(_target).sub(grab.worldGrabDelta);
    if (grab.object.parent) {
      grab.object.parent.worldToLocal(_worldPos);
    }
    grab.object.position.lerp(_worldPos, GRAB_LERP);
    grab.object.updateMatrixWorld(true);
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   * @param {THREE.Object3D} object
   * @param {THREE.Vector3} anchorWorld
   * @param {number} rayDistance
   */
  _beginGrab(pointer, object, anchorWorld, rayDistance) {
    object.getWorldPosition(_worldPos);
    const worldGrabDelta = anchorWorld.clone().sub(_worldPos);
    this.activeGrabs.set(pointer.handedness, {
      object,
      mode: 'distance',
      anchor: anchorWorld.clone(),
      rayDistance,
      worldGrabDelta,
    });
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   */
  update(pointers) {
    const scene = this.sceneManager?.scene;
    if (!scene) return;

    for (const pointer of pointers) {
      const key = pointer.handedness;
      const grab = this.activeGrabs.get(key);
      const holding =
        grab &&
        ((grab.mode === 'distance' && pointer.selectPressed) ||
          (grab.mode === 'proximity' && pointer.squeezePressed));

      if (holding) {
        this._followPointerRay(grab, pointer);
      }

      if (pointer.selectStart && !grab) {
        const hit = this.raycast(pointer);
        if (hit) {
          this._beginGrab(pointer, hit.root, hit.point, hit.distance);
          this.sceneManager.emit?.('xrGrabStart', {
            handedness: key,
            object: hit.root,
            mode: 'distance',
          });
        }
      }

      if (pointer.squeezeStart && !this.activeGrabs.has(key)) {
        const near = this.findProximityTarget(pointer);
        if (near) {
          near.getWorldPosition(_worldPos);
          const rayDistance = pointer.rayOrigin.distanceTo(_worldPos);
          this.activeGrabs.set(key, {
            object: near,
            mode: 'proximity',
            anchor: pointer.gripPosition.clone(),
            rayDistance,
            worldGrabDelta: pointer.gripPosition.clone().sub(_worldPos),
          });
          this.sceneManager.emit?.('xrGrabStart', {
            handedness: key,
            object: near,
            mode: 'proximity',
          });
        }
      }

      if ((pointer.selectEnd || pointer.squeezeEnd) && grab) {
        if (
          (grab.mode === 'distance' && pointer.selectEnd) ||
          (grab.mode === 'proximity' && pointer.squeezeEnd)
        ) {
          this.activeGrabs.delete(key);
          this.sceneManager.emit?.('xrGrabEnd', {
            handedness: key,
            object: grab.object,
            mode: grab.mode,
          });
        }
      }

      this._updatePointerVisual(scene, pointer);
    }
  }

  releaseAll() {
    this.activeGrabs.clear();
  }

  /**
   * @param {THREE.Scene} scene
   * @param {import('./sceneManagerXrInput.js').XrPointerState} pointer
   */
  _updatePointerVisual(scene, pointer) {
    const key = pointer.handedness;
    let cursor = this.cursorMeshes.get(key);
    let line = this.rayLines.get(key);

    if (!cursor) {
      cursor = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
      );
      cursor.name = `XRCursor_${key}`;
      scene.add(cursor);
      this.cursorMeshes.set(key, cursor);
    }
    if (!line) {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
      ]);
      line = new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.55,
          linewidth: 2,
        }),
      );
      line.name = `XRRay_${key}`;
      scene.add(line);
      this.rayLines.set(key, line);
    }

    const hit = this.raycast(pointer);
    const end = hit?.point || pointer.rayOrigin.clone().addScaledVector(pointer.rayDirection, 2);
    cursor.position.copy(end);
    const active = pointer.selectPressed || pointer.pinchActive;
    const color = active ? 0xffdd00 : 0xffffff;
    cursor.material.color.setHex(color);
    line.material.color.setHex(color);

    const positions = line.geometry.attributes.position;
    positions.setXYZ(0, pointer.rayOrigin.x, pointer.rayOrigin.y, pointer.rayOrigin.z);
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;
    line.geometry.computeBoundingSphere();

    cursor.visible = pointer.connected;
    line.visible = pointer.connected;
  }
}
