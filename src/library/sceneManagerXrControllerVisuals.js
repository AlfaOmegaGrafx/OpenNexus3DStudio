/**
 * Controller + hand meshes for SceneManager WebXR (product `/` path).
 * IWSDK `/xr` already shows these via XRControllerVisualAdapter / XRHandVisualAdapter;
 * Three.js WebXRManager only tracks poses — models must be attached explicitly.
 *
 * Galaxy XR keeps dormant controllers in ``inputSources`` while hands are used.
 * Three.js only has two WebXRController slots, so hand sources are often ignored and
 * ``getHand()`` joints never update (meshes sit at the floor origin). When hands are
 * preferred we drive joints from ``frame.getJointPose`` ourselves (same idea as IWSDK).
 */
import * as THREE from './three.js';
import { XR_HAND_TRACKING_FEATURE } from './sceneManagerXrConstants.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';

export { XR_HAND_TRACKING_FEATURE };

/** Opacity for controller meshes while hands are the primary input (seated / hand tracking). */
export const XR_CONTROLLER_IDLE_OPACITY = 0.5;

/** Target-ray line length (m) from controller aim pose. */
export const XR_CONTROLLER_RAY_LENGTH_M = 4;

/** World-space reticle diameter (m). */
const XR_RETICLE_WORLD_SIZE_M = 0.09;

let _reticleRingTexture = null;

/** @returns {import('three').CanvasTexture} */
function getReticleRingTexture() {
  if (_reticleRingTexture) return _reticleRingTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#88ccff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.22, 0, Math.PI * 2);
    ctx.stroke();
  }
  _reticleRingTexture = new THREE.CanvasTexture(canvas);
  _reticleRingTexture.colorSpace = THREE.SRGBColorSpace;
  return _reticleRingTexture;
}

const _reticleWorldPos = new THREE.Vector3();
const _reticleRayDir = new THREE.Vector3();

/**
 * @param {import('three').Object3D|null|undefined} root
 * @param {number} opacity
 * @param {boolean} transparent
 */
function setObjectOpacity(root, opacity, transparent) {
  if (!root) return;
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (typeof mat.opacity === 'number') {
        if (mat.userData.opennexusBaseOpacity == null) {
          mat.userData.opennexusBaseOpacity = mat.opacity;
        }
        mat.transparent = transparent || mat.userData.opennexusBaseOpacity < 1;
        mat.opacity = transparent
          ? opacity * (mat.userData.opennexusBaseOpacity ?? 1)
          : mat.userData.opennexusBaseOpacity ?? 1;
        mat.depthWrite = mat.opacity >= 0.99;
        mat.needsUpdate = true;
      }
    }
  });
}

/** Names / markers that must stay on the XR camera scene (not floor-offset wrapper). */
export function isXrInputVisualObject(obj) {
  if (!obj) return false;
  if (obj.userData?.opennexusXrInputVisual) return true;
  const name = String(obj.name || '');
  return (
    name.startsWith('XRController') ||
    name.startsWith('XRHand') ||
    name.startsWith('XRControllerGrip')
  );
}

/**
 * @param {import('./sceneManager.js').SceneManager} sceneManager
 */
/**
 * @param {import('./sceneManager.js').SceneManager | { scene: import('three').Scene, renderer: import('three').WebGLRenderer, alwaysShowTargetRay?: boolean }} sceneManager
 */
export function createSceneManagerXrControllerVisuals(sceneManager) {
  return new SceneManagerXrControllerVisuals(sceneManager);
}

export class SceneManagerXrControllerVisuals {
  /**
   * @param {import('./sceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.alwaysShowTargetRay = !!sceneManager?.alwaysShowTargetRay;
    /** @type {(import('three').Group|undefined)[]} */
    this._grips = [];
    /** @type {(import('three').Group|undefined)[]} */
    this._hands = [];
    /** @type {(import('three').Group|undefined)[]} */
    this._controllers = [];
    /** @type {Map<string, import('three').Group>} */
    this._handsByHandedness = new Map();
    this._attached = false;
    this._prepared = false;
    /** @type {((ev: XRInputSourceChangeEvent) => void) | null} */
    this._onInputSourcesChange = null;
    /** @type {XRSession | null} */
    this._session = null;
    /** @type {Map<string, import('three').Sprite>} */
    this._worldReticles = new Map();
  }

  /**
   * Parent for XR tracked spaces — must match the XR camera's scene parent.
   *
   * Do NOT parent under `xrLocomotionRig` / `vrSceneWrapper`: those offset the
   * world floor (Y + Z) while the headset camera stays in reference space.
   *
   * @returns {import('three').Object3D|null}
   */
  _parent() {
    return this.sceneManager.scene || null;
  }

  /**
   * @param {XRInputSource[]} sources
   * @param {'left'|'right'} handedness
   */
  _handSource(sources, handedness) {
    return (
      sources.find((s) => s?.handedness === handedness && s.hand) || null
    );
  }

  /**
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   * @param {'left'|'right'} handedness
   */
  _pointerFor(pointers, handedness) {
    return pointers.find((p) => p?.handedness === handedness) || null;
  }

  /**
   * Ensure joint Groups exist on a hand space (mirrors WebXRController._getHandJoint).
   * @param {import('three').Group} hand
   * @param {XRJointSpace} inputJoint
   */
  _getHandJoint(hand, inputJoint) {
    if (!hand.joints) hand.joints = {};
    const name = inputJoint.jointName;
    let joint = hand.joints[name];
    if (!joint) {
      joint = new THREE.Group();
      joint.name = `XRJoint:${name}`;
      joint.matrixAutoUpdate = false;
      joint.visible = false;
      hand.joints[name] = joint;
      hand.add(joint);
    }
    return joint;
  }

  /**
   * Bind a hand Group to a handedness and fire ``connected`` once so XRHandModelFactory
   * loads the mesh (even when Three.js never assigned the hand input source to a slot).
   * @param {'left'|'right'} handedness
   * @param {XRInputSource} handSrc
   */
  _bindHandVisual(handedness, handSrc) {
    let hand = this._handsByHandedness.get(handedness) || null;
    if (!hand) {
      const used = new Set(this._handsByHandedness.values());
      hand =
        this._hands.find((h) => h && !used.has(h) && !h.userData.opennexusHandSource) ||
        this._hands[handedness === 'left' ? 0 : 1] ||
        this._hands[0] ||
        null;
      if (hand) this._handsByHandedness.set(handedness, hand);
    }
    if (!hand) return null;

    if (!hand.joints) hand.joints = {};
    if (!hand.inputState) hand.inputState = { pinching: false };

    if (hand.userData.opennexusHandSource !== handSrc) {
      for (const inputJoint of handSrc.hand.values()) {
        this._getHandJoint(hand, inputJoint);
      }
      try {
        hand.dispatchEvent({ type: 'connected', data: handSrc });
      } catch (err) {
        console.warn('[XR][visuals] hand connected dispatch failed:', err?.message || err);
      }
      hand.userData.opennexusHandSource = handSrc;
      hand.userData.inputSource = handSrc;
      hand.userData.opennexusXrInputVisual = true;
    }
    return hand;
  }

  /**
   * Drive hand joints from the XR frame when hands are preferred.
   * Call each XR frame after Three.js WebXRManager updates (our animation loop is after).
   *
   * @param {XRFrame|null} frame
   * @param {XRReferenceSpace|null} referenceSpace
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} [pointers]
   */
  update(frame, referenceSpace, pointers = []) {
    if (!this._attached || !frame || !referenceSpace) return;

    let sources = [];
    try {
      sources = frame.session?.inputSources
        ? Array.from(frame.session.inputSources)
        : [];
    } catch {
      sources = [];
    }

    for (const handedness of /** @type {const} */ (['left', 'right'])) {
      const handSrc = this._handSource(sources, handedness);
      const pointer = this._pointerFor(pointers, handedness);
      const preferHand = pointer ? !!pointer.preferHand : false;

      if (!handSrc?.hand || !preferHand) {
        continue;
      }

      const hand = this._bindHandVisual(handedness, handSrc);
      if (!hand) continue;

      for (const inputJoint of handSrc.hand.values()) {
        const joint = this._getHandJoint(hand, inputJoint);
        let jointPose = null;
        try {
          jointPose = frame.getJointPose(inputJoint, referenceSpace);
        } catch {
          jointPose = null;
        }
        if (jointPose) {
          joint.matrix.fromArray(jointPose.transform.matrix);
          joint.matrix.decompose(joint.position, joint.quaternion, joint.scale);
          joint.matrixWorldNeedsUpdate = true;
          joint.jointRadius = jointPose.radius;
          joint.visible = true;
        } else {
          joint.visible = false;
        }
      }
      hand.matrixAutoUpdate = false;
      hand.matrix.identity();
      hand.matrixWorldNeedsUpdate = true;
    }

    this._syncPlaceholders();
    this.syncVisibility(pointers, sources);
  }

  /**
   * Show hand meshes when hand-tracking is preferred; keep controllers visible at
   * reduced opacity (do not hide — seated / hands-primary still need to see them).
   *
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} [pointers]
   * @param {XRInputSource[]} [sources]
   */
  syncVisibility(pointers = [], sources = []) {
    if (!this._attached) return;

    const byHand = new Map();
    for (const p of pointers) {
      if (p?.handedness === 'left' || p?.handedness === 'right') {
        byHand.set(p.handedness, p);
      }
    }

    const somePreferHand = [...byHand.values()].some((p) => p.preferHand);

    // Controllers stay visible; fade when hands are primary.
    // Never touch hand-mesh opacity here — only controller grip / target-ray groups.
    for (let i = 0; i < 2; i += 1) {
      if (this._hands[i]) {
        this._hands[i].visible = false;
        // Ensure prior mistaken opacity fades are cleared on hand materials.
        setObjectOpacity(this._hands[i], 1, false);
      }
      if (this._grips[i]) {
        this._grips[i].visible = true;
        setObjectOpacity(
          this._grips[i],
          somePreferHand ? XR_CONTROLLER_IDLE_OPACITY : 1,
          somePreferHand,
        );
      }
      if (this._controllers[i]) {
        this._controllers[i].visible = true;
        setObjectOpacity(
          this._controllers[i],
          somePreferHand ? XR_CONTROLLER_IDLE_OPACITY : 1,
          somePreferHand,
        );
        const ray = this._controllers[i].userData.opennexusTargetRay;
        const reticle = this._controllers[i].userData.opennexusTargetReticle;
        if (ray) ray.visible = this.alwaysShowTargetRay || !somePreferHand;
        if (reticle) reticle.visible = this.alwaysShowTargetRay || !somePreferHand;
      }
    }

    for (const handedness of /** @type {const} */ (['left', 'right'])) {
      const pointer = byHand.get(handedness) || null;
      const preferHand = pointer ? !!pointer.preferHand : false;
      const handSrc = this._handSource(sources, handedness);
      const showHand = preferHand && !!handSrc?.hand;

      const hand =
        this._handsByHandedness.get(handedness) ||
        this._hands.find(
          (h) =>
            h?.userData?.opennexusHandSource?.handedness === handedness ||
            h?.userData?.inputSource?.handedness === handedness,
        ) ||
        null;

      const slotIndex = hand ? this._hands.indexOf(hand) : -1;

      if (showHand && hand) {
        hand.visible = true;
        setObjectOpacity(hand, 1, false);
        // Hide opaque controller placeholder / model on the shared slot so the
        // hand mesh is not covered by a solid controller mesh.
        if (slotIndex >= 0) {
          if (this._grips[slotIndex]) {
            this._grips[slotIndex].visible = true;
            setObjectOpacity(this._grips[slotIndex], XR_CONTROLLER_IDLE_OPACITY, true);
            const ph = this._grips[slotIndex].userData?.opennexusPlaceholder;
            if (ph) ph.visible = false;
          }
          if (this._controllers[slotIndex]) {
            this._controllers[slotIndex].visible = true;
            setObjectOpacity(
              this._controllers[slotIndex],
              XR_CONTROLLER_IDLE_OPACITY,
              true,
            );
          }
        }
      }

      if (!showHand && pointer && !preferHand) {
        for (let i = 0; i < 2; i += 1) {
          const g = this._grips[i];
          const c = this._controllers[i];
          if (g?.userData?.inputSource?.handedness === handedness) {
            g.visible = true;
            setObjectOpacity(g, 1, false);
          }
          if (c?.userData?.inputSource?.handedness === handedness) {
            c.visible = true;
            setObjectOpacity(c, 1, false);
          }
        }
      }
    }
  }

  _syncPlaceholders() {
    for (const grip of this._grips) {
      const ph = grip?.userData?.opennexusPlaceholder;
      if (!ph) continue;
      const model = grip.userData.opennexusControllerModel;
      // Profile GLTF has loaded when the factory model has scene children.
      const modelReady = !!(model && model.children && model.children.length > 0);
      ph.visible = !modelReady;
    }
  }

  /**
   * Aim ray + ring reticle on the WebXR target-ray space (Three.js getController slot).
   * @param {import('three').Group} controller
   */
  _ensureTargetRay(controller) {
    if (!controller || controller.userData.opennexusTargetRay) return;

    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.88,
        depthTest: false,
      }),
    );
    line.scale.z = XR_CONTROLLER_RAY_LENGTH_M;
    line.name = 'XRTargetRay';
    line.renderOrder = 10;
    controller.add(line);

    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.024, 0.036, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    );
    reticle.position.z = -XR_CONTROLLER_RAY_LENGTH_M;
    reticle.visible = false;
    reticle.name = 'XRTargetReticle';
    reticle.renderOrder = 11;
    controller.add(reticle);

    controller.userData.opennexusTargetRay = line;
    controller.userData.opennexusTargetReticle = reticle;
  }

  /**
   * Billboard ring in world space — always faces the headset (not edge-on to the ray).
   * @param {'left'|'right'} handedness
   */
  _ensureWorldReticle(handedness) {
    let sprite = this._worldReticles.get(handedness);
    const parent = this._parent();
    if (!sprite && parent) {
      const mat = new THREE.SpriteMaterial({
        map: getReticleRingTexture(),
        transparent: true,
        opacity: 0.96,
        depthTest: false,
        depthWrite: false,
      });
      sprite = new THREE.Sprite(mat);
      sprite.name = `XRTargetReticleWorld:${handedness}`;
      sprite.renderOrder = 999;
      parent.add(sprite);
      this._worldReticles.set(handedness, sprite);
    }
    return sprite || null;
  }

  /**
   * Place billboard reticle at ray hit distance (menu, etc.).
   * @param {import('./sceneManagerXrInput.js').XrPointerState[]} pointers
   * @param {(pointer: import('./sceneManagerXrInput.js').XrPointerState) => { distance: number }|null} hitResolver
   */
  updateTargetReticles(pointers, hitResolver) {
    if (!this._attached || !hitResolver) return;

    const activeHands = new Set();

    for (const pointer of pointers) {
      if (!pointer?.connected) continue;
      activeHands.add(pointer.handedness);

      const controller =
        this._controllers.find(
          (c) => c?.userData?.inputSource?.handedness === pointer.handedness,
        ) ||
        this._controllers[pointer.handedness === 'left' ? 0 : 1] ||
        null;

      const ray = controller?.userData?.opennexusTargetRay;
      const meshReticle = controller?.userData?.opennexusTargetReticle;
      const worldReticle = this._ensureWorldReticle(pointer.handedness);

      const hit = hitResolver(pointer);
      const dist = hit?.distance ?? XR_CONTROLLER_RAY_LENGTH_M;
      const clamped = Math.max(0.08, Math.min(XR_CONTROLLER_RAY_LENGTH_M, dist));

      if (ray) ray.scale.z = clamped;
      if (meshReticle) meshReticle.visible = false;

      if (worldReticle) {
        _reticleRayDir.copy(pointer.rayDirection).normalize();
        _reticleWorldPos
          .copy(pointer.rayOrigin)
          .addScaledVector(_reticleRayDir, clamped);
        worldReticle.position.copy(_reticleWorldPos);
        worldReticle.scale.set(XR_RETICLE_WORLD_SIZE_M, XR_RETICLE_WORLD_SIZE_M, 1);
        worldReticle.visible = true;
      }
    }

    for (const [handedness, sprite] of this._worldReticles) {
      if (!activeHands.has(handedness)) {
        sprite.visible = false;
      }
    }
  }

  _ensurePlaceholder(parent, name, color) {
    if (parent.userData.opennexusPlaceholder) return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.03, 0.1),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.1,
      }),
    );
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    parent.userData.opennexusPlaceholder = mesh;
  }

  /**
   * Create grip/hand tracked groups + model loaders before setSession so we do not
   * miss the initial WebXR ``connected`` events.
   */
  prepare(renderer = this.sceneManager.renderer) {
    if (!renderer?.xr || this._prepared) return;
    const controllerFactory = new XRControllerModelFactory();
    const handFactory = new XRHandModelFactory();

    for (let i = 0; i < 2; i += 1) {
      const grip = renderer.xr.getControllerGrip(i);
      grip.name = `XRControllerGrip${i}`;
      grip.userData.opennexusXrInputVisual = true;
      this._ensurePlaceholder(grip, `XRControllerPlaceholder${i}`, 0x3a3a3a);
      if (!grip.userData.opennexusControllerModel) {
        const model = controllerFactory.createControllerModel(grip);
        model.name = `XRControllerModel${i}`;
        grip.add(model);
        grip.userData.opennexusControllerModel = model;
      }
      grip.visible = true;
      this._grips[i] = grip;

      const controller = renderer.xr.getController(i);
      controller.name = `XRController${i}`;
      controller.userData.opennexusXrInputVisual = true;
      this._ensureTargetRay(controller);
      this._controllers[i] = controller;

      const hand = renderer.xr.getHand(i);
      hand.name = `XRHand${i}`;
      hand.userData.opennexusXrInputVisual = true;
      hand.matrixAutoUpdate = false;
      if (!hand.joints) hand.joints = {};
      if (!hand.inputState) hand.inputState = { pinching: false };
      if (!hand.userData.opennexusHandModel) {
        // 'mesh' needs CDN; joints still drive bones once connected. Spheres work offline.
        const handModel = handFactory.createHandModel(hand, 'mesh');
        handModel.name = `XRHandModel${i}`;
        hand.add(handModel);
        hand.userData.opennexusHandModel = handModel;
      }
      hand.visible = false;
      this._hands[i] = hand;
    }
    this._prepared = true;
  }

  /**
   * @param {XRSession} [session]
   */
  onSessionStart(session) {
    const renderer = this.sceneManager.renderer;
    this.prepare(renderer);
    const parent = this._parent();
    if (!renderer?.xr || !parent) {
      console.warn('[XR][visuals] Missing renderer.xr or parent — skip controller/hand meshes');
      return;
    }

    for (let i = 0; i < 2; i += 1) {
      const grip = this._grips[i] || renderer.xr.getControllerGrip(i);
      const hand = this._hands[i] || renderer.xr.getHand(i);
      const controller = this._controllers[i] || renderer.xr.getController(i);
      grip.userData.opennexusXrInputVisual = true;
      hand.userData.opennexusXrInputVisual = true;
      controller.userData.opennexusXrInputVisual = true;
      if (grip.parent !== parent) parent.add(grip);
      if (hand.parent !== parent) parent.add(hand);
      if (controller.parent !== parent) parent.add(controller);
      grip.visible = true;
      hand.visible = false;
      controller.visible = true;
      this._grips[i] = grip;
      this._hands[i] = hand;
      this._controllers[i] = controller;
    }

    this._attached = true;
    this._handsByHandedness.clear();
    this._session = session || null;
    this._bindInputSourcesListener(session);
    this._syncPlaceholders();
    this.syncVisibility([]);

    const features = session?.enabledFeatures
      ? Array.from(session.enabledFeatures)
      : [];
    console.log(
      '[XR][visuals] Controller + hand meshes attached',
      features.includes('hand-tracking')
        ? '(hand-tracking enabled; joints driven when hands preferred)'
        : '(hand-tracking not in session — controllers only until feature is granted)',
    );
  }

  /**
   * @param {XRSession} [session]
   */
  _bindInputSourcesListener(session) {
    if (!session) return;
    if (this._onInputSourcesChange && this._session) {
      try {
        this._session.removeEventListener(
          'inputsourceschange',
          this._onInputSourcesChange,
        );
      } catch {
        // ignore
      }
    }
    this._onInputSourcesChange = () => {
      // Handedness binding happens lazily in update(); just clear stale maps when
      // sources drop so a later hand can take the visual slot.
      for (const [handedness, hand] of this._handsByHandedness) {
        const stillThere = [...(session.inputSources || [])].some(
          (s) => s.handedness === handedness && s.hand,
        );
        if (!stillThere) {
          hand.userData.opennexusHandSource = null;
          this._handsByHandedness.delete(handedness);
        }
      }
    };
    session.addEventListener('inputsourceschange', this._onInputSourcesChange);
  }

  onSessionEnd() {
    if (this._session && this._onInputSourcesChange) {
      try {
        this._session.removeEventListener(
          'inputsourceschange',
          this._onInputSourcesChange,
        );
      } catch {
        // ignore
      }
    }
    this._onInputSourcesChange = null;
    this._session = null;
    this._handsByHandedness.clear();

    const detach = (obj) => {
      if (obj?.parent) {
        obj.parent.remove(obj);
      }
    };
    for (const g of this._grips) detach(g);
    for (const h of this._hands) detach(h);
    for (const c of this._controllers) detach(c);
    this._attached = false;
  }

  /** @returns {boolean} */
  get isAttached() {
    return this._attached;
  }
}
