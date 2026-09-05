/**
 * Space-Time XR 2D viewport — OrbitControls + gamepad trigger/grip (OpenNexus desktop parity).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const STICK_DEAD = 0.15;
const TRIGGER_ON = 0.45;
const GRIP_ON = 0.45;
const _orbitPivot = new THREE.Vector3();

/** Space-Time browser 2D only — unbounded dolly (OpenNexus main viewport keeps finite limits). */
export const SPACETIME_BROWSER_INFINITE_ZOOM = true;

/**
 * Re-apply unbounded zoom — OrbitControls or framing must not leave finite limits behind.
 * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls|null|undefined} controls
 */
export function applySpacetimeInfiniteZoom(controls) {
  if (!controls || !SPACETIME_BROWSER_INFINITE_ZOOM) return;
  controls.minDistance = 0;
  controls.maxDistance = Infinity;
  controls.maxZoom = Infinity;
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLElement} domElement
 * @param {THREE.Vector3} target
 */
export function createSpacetimeViewportControls(camera, domElement, target) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.enableZoom = true;
  controls.zoomSpeed = 1.5;
  if (SPACETIME_BROWSER_INFINITE_ZOOM) {
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    controls.maxZoom = Infinity;
  } else {
    controls.minDistance = 0.05;
    controls.maxDistance = 500;
  }
  controls.maxPolarAngle = Math.PI * 0.95;
  controls.target.copy(target);
  controls.update();
  applySpacetimeInfiniteZoom(controls);
  return controls;
}

/**
 * Read thumbstick axes from a Web Gamepad (Quest/Galaxy profile).
 * @param {Gamepad|null|undefined} gp
 */
function readRightStick(gp) {
  if (!gp?.axes?.length) return { x: 0, y: 0 };
  return {
    x: gp.axes[2] ?? gp.axes[0] ?? 0,
    y: gp.axes[3] ?? gp.axes[1] ?? 0,
  };
}

/**
 * Trigger + stick → orbit; grip + stick → pan (matches OpenNexus squeeze→pan + LMB orbit).
 * @param {OrbitControls} controls
 * @param {number} deltaSeconds
 * @param {{ camera?: THREE.PerspectiveCamera, eyeToFloor?: number }} [opts]
 */
export function updateGamepadViewportControls(controls, deltaSeconds = 0.016, opts = {}) {
  if (!controls || typeof navigator === 'undefined' || !navigator.getGamepads) return false;

  const pads = navigator.getGamepads();
  let acted = false;

  for (const gp of pads) {
    if (!gp?.connected) continue;
    const trigger = gp.buttons[0]?.value ?? (gp.buttons[0]?.pressed ? 1 : 0);
    const grip = gp.buttons[1]?.value ?? (gp.buttons[1]?.pressed ? 1 : 0);
    let { x, y } = readRightStick(gp);
    if (Math.abs(x) < STICK_DEAD) x = 0;
    if (Math.abs(y) < STICK_DEAD) y = 0;
    if (x === 0 && y === 0) continue;

    const dt = Math.min(Math.max(deltaSeconds, 0.001), 0.05);
    const triggerOn = trigger > TRIGGER_ON;
    const gripOn = grip > GRIP_ON;
    const eyeToFloor = opts.eyeToFloor ?? 1.6;

    // Orbit around viewer floor point (not fabric center).
    if (opts.camera && (triggerOn || (!gripOn && (x !== 0 || y !== 0)))) {
      opts.camera.getWorldPosition(_orbitPivot);
      controls.target.set(
        _orbitPivot.x,
        _orbitPivot.y - eyeToFloor,
        _orbitPivot.z,
      );
    }

    // Vertical stick without modifier → dolly (scroll-wheel zoom parity).
    if (!triggerOn && !gripOn && Math.abs(y) > STICK_DEAD && Math.abs(x) < STICK_DEAD * 1.5) {
      const scale = 1 + Math.abs(y) * dt * 4.5;
      if (y > 0) controls._dollyOut(scale);
      else controls._dollyIn(scale);
      acted = true;
    } else if (gripOn) {
      const dist = 2.5 * dt * 60;
      controls._pan(-x * dist, y * dist);
      acted = true;
    } else if (triggerOn) {
      controls._rotateLeft(x * 2.2 * dt * 60);
      controls._rotateUp(y * 2.2 * dt * 60);
      acted = true;
    } else if (x !== 0 || y !== 0) {
      controls._rotateLeft(x * 1.6 * dt * 60);
      controls._rotateUp(y * 1.6 * dt * 60);
      acted = true;
    }
  }

  return acted;
}

/**
 * Frame 2D viewport on the capsule with the walker visible inside it.
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls} controls
 * @param {THREE.Group|null|undefined} playerRoot
 * @param {{ center: THREE.Vector3, size: THREE.Vector3 }} bounds
 */
export function frameViewportOnCapsuleWalker(camera, controls, playerRoot, bounds) {
  if (!bounds?.center || !controls) return;

  const { center, size } = bounds;
  controls.target.copy(center);

  if (playerRoot?.visible) {
    playerRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(playerRoot);
    if (!box.isEmpty()) {
      box.getCenter(_orbitPivot);
      controls.target.lerp(_orbitPivot, 0.35);
    }
  }

  const radius = Math.max(size.x, size.y, size.z, 2);
  camera.position.set(
    center.x + radius * 0.85,
    center.y + Math.max(radius * 0.45, 1.25),
    center.z + radius * 0.85,
  );
  camera.lookAt(controls.target);
  applySpacetimeInfiniteZoom(controls);
  controls.update();
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ center: THREE.Vector3, size: THREE.Vector3 }} bounds
 * @param {OrbitControls} controls
 */
export function frameCameraOnFabricBounds(camera, bounds, controls) {
  if (!bounds?.center || !bounds?.size) return;
  const { center, size } = bounds;
  const radius = Math.max(size.x, size.y, size.z, 0.5);
  const dist = Math.max(radius * 2.2, 4);
  controls.target.copy(center);
  camera.position.set(
    center.x + dist * 0.85,
    center.y + Math.max(radius * 0.55, 1.5),
    center.z + dist * 0.85,
  );
  camera.lookAt(center);
  if (!SPACETIME_BROWSER_INFINITE_ZOOM) {
    controls.minDistance = Math.max(radius * 0.012, 0.05);
    controls.maxDistance = Math.max(radius * 100, 350);
  }
  applySpacetimeInfiniteZoom(controls);
  controls.update();
}

/**
 * Align XR locomotion rig so desktop orbit pivot carries into VR (XZ only; Y stays on local-floor).
 * @param {THREE.Group} rig
 * @param {THREE.Vector3} preXRTarget
 * @param {XRFrame} frame
 * @param {XRReferenceSpace} referenceSpace
 */
export function alignSpacetimeRigToDesktopView(rig, preXRTarget, frame, referenceSpace) {
  if (!rig || !preXRTarget || !frame || !referenceSpace) return false;
  const pose = frame.getViewerPose(referenceSpace);
  if (!pose?.transform?.position) return false;

  const hp = pose.transform.position;
  rig.position.set(preXRTarget.x - hp.x, 0, preXRTarget.z - hp.z);
  rig.rotation.set(0, 0, 0);
  rig.updateMatrixWorld(true);
  return true;
}

const _pivot = new THREE.Vector3();
const _desiredFwd = new THREE.Vector3();
const _headsetFwd = new THREE.Vector3();
const _headsetPos = new THREE.Vector3();
const _orientQuat = new THREE.Quaternion();
const _deltaAlign = new THREE.Vector3();
const _parentQuatAlign = new THREE.Quaternion();
const _capPos = new THREE.Vector3();
const _capQuat = new THREE.Quaternion();
const _capInv = new THREE.Matrix4();
const _capInvQuat = new THREE.Quaternion();
const _capTmpPos = new THREE.Vector3();
const _capScale = new THREE.Vector3();
const _capEuler = new THREE.Euler();
const _capFwd = new THREE.Vector3();
const _capTarget = new THREE.Vector3();
const _viewportFwd = new THREE.Vector3();

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls|null|undefined} controls
 */
export function snapshotSpacetimeDesktopView(camera, controls) {
  if (!camera) return null;
  camera.updateMatrixWorld(true);
  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: controls?.target?.clone?.() ?? new THREE.Vector3(),
    zoom: typeof camera.zoom === 'number' ? camera.zoom : 1,
  };
}

/**
 * Full viewport carry-over — desktop camera XZ + yaw into XR (persistent with exit capture).
 * @param {THREE.Group} rig
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ position: THREE.Vector3, target?: THREE.Vector3, quaternion?: THREE.Quaternion }|null|undefined} preXRView
 * @param {XRFrame} frame
 * @param {XRReferenceSpace} referenceSpace
 */
export function alignSpacetimeRigToViewport(
  rig,
  camera,
  preXRView,
  frame,
  referenceSpace,
) {
  if (!rig || !camera || !preXRView?.position || !frame || !referenceSpace) return false;

  const camPos = preXRView.position;
  if (!Number.isFinite(camPos.x) || !Number.isFinite(camPos.z)) return false;

  const pose = frame.getViewerPose(referenceSpace);
  if (!pose?.transform?.position) return false;

  const hp = pose.transform.position;
  _headsetPos.set(hp.x, hp.y, hp.z);
  const o = pose.transform.orientation;
  if (o) {
    _orientQuat.set(o.x, o.y, o.z, o.w);
    _headsetFwd.set(0, 0, -1).applyQuaternion(_orientQuat);
  } else {
    camera.getWorldDirection(_headsetFwd);
  }

  if (_headsetPos.distanceToSquared(camPos) < 1e-6) return false;

  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  rig.updateMatrixWorld(true);

  _deltaAlign.set(_headsetPos.x - camPos.x, 0, _headsetPos.z - camPos.z);
  const parent = rig.parent;
  if (parent) {
    parent.updateMatrixWorld(true);
    parent.getWorldQuaternion(_parentQuatAlign);
    _deltaAlign.applyQuaternion(_parentQuatAlign.invert());
    _deltaAlign.y = 0;
  }
  rig.position.copy(_deltaAlign);

  _viewportFwd.set(0, 0, -1);
  if (preXRView.target) {
    _viewportFwd.subVectors(preXRView.target, camPos);
  } else if (preXRView.quaternion) {
    _viewportFwd.set(0, 0, -1).applyQuaternion(preXRView.quaternion);
  }
  _viewportFwd.y = 0;
  _headsetFwd.y = 0;
  if (_viewportFwd.lengthSq() > 1e-6 && _headsetFwd.lengthSq() > 1e-6) {
    _viewportFwd.normalize();
    _headsetFwd.normalize();
    const cross = _viewportFwd.x * _headsetFwd.z - _viewportFwd.z * _headsetFwd.x;
    const dot = _viewportFwd.x * _headsetFwd.x + _viewportFwd.z * _headsetFwd.z;
    const yawDelta = Math.atan2(cross, dot);
    if (Math.abs(yawDelta) > 1e-3) {
      const pivotCam = {
        getWorldPosition(out) {
          return out.copy(_headsetPos);
        },
      };
      snapTurnSpacetimeRig(rig, pivotCam, yawDelta, frame, referenceSpace);
    }
  }

  rig.updateMatrixWorld(true);
  return true;
}

/**
 * Headset world pose. For XR enter/exit persist use
 * {@link captureSpacetimeXrViewAsDesktop} (scene space via inverse locomotion
 * rig) — the XR camera is outside the rig, so world capture sticks near ~(0,0).
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ position?: THREE.Vector3, target?: THREE.Vector3, zoom?: number }|null|undefined} preXRView
 */
export function captureSpacetimeXrWorldView(camera, preXRView = null) {
  if (!camera) return null;
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(_capPos);
  camera.getWorldQuaternion(_capQuat);
  return flattenCapturedXrView(_capPos, _capQuat, preXRView, camera);
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Group|null|undefined} locomotionRig
 * @param {{ position?: THREE.Vector3, target?: THREE.Vector3, zoom?: number }|null|undefined} preXRView
 */
export function captureSpacetimeXrViewAsDesktop(camera, locomotionRig, preXRView = null) {
  if (!camera) return null;

  camera.updateMatrixWorld(true);
  if (locomotionRig) locomotionRig.updateMatrixWorld(true);

  camera.getWorldPosition(_capPos);
  camera.getWorldQuaternion(_capQuat);

  if (locomotionRig?.matrixWorld) {
    _capInv.copy(locomotionRig.matrixWorld).invert();
    _capPos.applyMatrix4(_capInv);
    _capInv.decompose(_capTmpPos, _capInvQuat, _capScale);
    _capQuat.copy(_capInvQuat).multiply(_capQuat);
  }

  return flattenCapturedXrView(_capPos, _capQuat, preXRView, camera);
}

function flattenCapturedXrView(pos, quat, preXRView, camera) {
  _capEuler.setFromQuaternion(quat, 'YXZ');
  _capEuler.z = 0;
  _capQuat.setFromEuler(_capEuler);

  _capFwd.set(0, 0, -1).applyQuaternion(_capQuat);
  if (_capFwd.lengthSq() < 1e-8) {
    _capFwd.set(0, 0, -1);
  } else {
    _capFwd.normalize();
  }

  let lookDist = 2.5;
  if (preXRView?.position && preXRView?.target) {
    const d = preXRView.position.distanceTo(preXRView.target);
    if (Number.isFinite(d) && d > 0.15) lookDist = d;
  }
  _capTarget.copy(pos).addScaledVector(_capFwd, lookDist);

  return {
    position: pos.clone(),
    quaternion: _capQuat.clone(),
    target: _capTarget.clone(),
    zoom:
      typeof preXRView?.zoom === 'number'
        ? preXRView.zoom
        : typeof camera.zoom === 'number'
          ? camera.zoom
          : 1,
  };
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls|null|undefined} controls
 * @param {{ position: THREE.Vector3, quaternion: THREE.Quaternion, target: THREE.Vector3, zoom?: number }} view
 */
export function applySpacetimeDesktopViewFromXr(camera, controls, view) {
  if (!camera || !view?.position || !view?.quaternion || !view?.target) return false;

  camera.position.copy(view.position);
  camera.quaternion.copy(view.quaternion);
  camera.up.set(0, 1, 0);
  if (typeof view.zoom === 'number') {
    camera.zoom = view.zoom;
  }
  camera.updateProjectionMatrix?.();

  if (controls?.target) {
    controls.target.copy(view.target);
    controls.update?.();
  }
  applySpacetimeInfiniteZoom(controls);
  return true;
}

/**
 * Yaw the locomotion rig so the headset forward matches a world target (stadium center).
 * @param {THREE.Group} rig
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Vector3} target
 * @param {XRFrame} frame
 * @param {XRReferenceSpace} referenceSpace
 */
export function alignSpacetimeRigFacingTarget(
  rig,
  camera,
  target,
  frame,
  referenceSpace,
) {
  if (!rig || !camera || !target || !frame || !referenceSpace) return false;

  const pose = frame.getViewerPose(referenceSpace);
  if (!pose?.transform?.position) return false;

  const hp = pose.transform.position;
  _desiredFwd.set(target.x - hp.x, 0, target.z - hp.z);
  if (_desiredFwd.lengthSq() < 1e-6) return false;
  _desiredFwd.normalize();

  camera.getWorldDirection(_headsetFwd);
  _headsetFwd.y = 0;
  if (_headsetFwd.lengthSq() < 1e-6) return false;
  _headsetFwd.normalize();

  const cross = _desiredFwd.x * _headsetFwd.z - _desiredFwd.z * _headsetFwd.x;
  const dot = _desiredFwd.x * _headsetFwd.x + _desiredFwd.z * _headsetFwd.z;
  const yawDelta = Math.atan2(cross, dot);
  if (Math.abs(yawDelta) < 1e-3) return true;

  snapTurnSpacetimeRig(rig, camera, yawDelta, frame, referenceSpace);
  rig.updateMatrixWorld(true);
  return true;
}

/**
 * Snap-turn locomotion rig around the viewer (reference-space origin in VR).
 * Uses XR viewer pose when available so turn pivots on the headset, not stale camera state.
 * @param {THREE.Group} rig
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} radians
 * @param {XRFrame|null} [frame]
 * @param {XRReferenceSpace|null} [referenceSpace]
 */
export function snapTurnSpacetimeRig(rig, camera, radians, frame = null, referenceSpace = null) {
  let usedViewerPose = false;
  if (frame && referenceSpace) {
    const pose = frame.getViewerPose(referenceSpace);
    if (pose?.transform?.position) {
      _pivot.set(
        pose.transform.position.x,
        rig.position.y,
        pose.transform.position.z,
      );
      usedViewerPose = true;
    }
  }

  if (!usedViewerPose) {
    camera.getWorldPosition(_pivot);
    const parent = rig.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      parent.worldToLocal(_pivot);
    }
    _pivot.y = rig.position.y;
  }

  const ox = rig.position.x - _pivot.x;
  const oz = rig.position.z - _pivot.z;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  rig.position.x = _pivot.x + ox * cos + oz * sin;
  rig.position.z = _pivot.z + -ox * sin + oz * cos;
  rig.rotation.y += radians;
}
