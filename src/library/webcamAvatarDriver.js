/**
 * Webcam Avatar Driver – MediaPipe Holistic + Kalidokit → VRM expressions, pose, and hands.
 */

import * as THREE from 'three';
import { applyExpressionWeightRecordToVRMS } from './xrExpressionTrackingDriver.js';
import {
  inferMediaPipeFaceWeightRecord,
  resetWebcamFaceNeutralBaseline,
} from './webcamFaceWeightInference.js';

const MEDIAPIPE_HOLISTIC_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5';

const HEAD_LERP = 0.18;
const BONE_LERP = 0.55;
const HAND_LERP = 0.5;
const MIN_SEND_INTERVAL_MS = 40;
const FACE_EXPR_LERP = 0.22;

/** Bones driven from Kalidokit pose / hands / head (raw humanoid nodes). */
const DRIVEN_BONE_NAMES = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftThumbMetacarpal',
  'leftThumbProximal',
  'leftThumbDistal',
  'leftIndexProximal',
  'leftIndexIntermediate',
  'leftIndexDistal',
  'leftMiddleProximal',
  'leftMiddleIntermediate',
  'leftMiddleDistal',
  'leftRingProximal',
  'leftRingIntermediate',
  'leftRingDistal',
  'leftLittleProximal',
  'leftLittleIntermediate',
  'leftLittleDistal',
  'rightThumbMetacarpal',
  'rightThumbProximal',
  'rightThumbDistal',
  'rightIndexProximal',
  'rightIndexIntermediate',
  'rightIndexDistal',
  'rightMiddleProximal',
  'rightMiddleIntermediate',
  'rightMiddleDistal',
  'rightRingProximal',
  'rightRingIntermediate',
  'rightRingDistal',
  'rightLittleProximal',
  'rightLittleIntermediate',
  'rightLittleDistal',
];

const HAND_BONE_ALIASES = {
  leftThumbProximal: 'leftThumbMetacarpal',
  rightThumbProximal: 'rightThumbMetacarpal',
  leftThumbIntermediate: 'leftThumbProximal',
  rightThumbIntermediate: 'rightThumbProximal',
};

const _euler = new THREE.Euler();
const _quatTarget = new THREE.Quaternion();

function cloneLandmarks(lm) {
  if (!lm?.length) return null;
  return lm.map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z ?? 0,
    visibility: p.visibility,
  }));
}

function kalidokitBoneToVrm(name) {
  if (!name) return null;
  const base = name.charAt(0).toLowerCase() + name.slice(1);
  return HAND_BONE_ALIASES[base] || base;
}

function pose3dFrom2d(pose2D) {
  if (!pose2D?.length) return null;
  return pose2D.map((p) => ({
    x: p.x,
    y: p.y,
    z: (p.z ?? 0) * 0.4,
    visibility: p.visibility ?? 1,
  }));
}

export class WebcamAvatarDriver {
  constructor(options) {
    this.getVRMs = options.getVRMs || (() => []);
    this.getRenderer = options.getRenderer || (() => null);
    this.onStateChange = options.onStateChange || null;
    this.onError = options.onError || null;
    this.setBodyFrameHook = options.setBodyFrameHook || null;

    this._active = false;
    this._video = null;
    this._stream = null;
    this._holistic = null;
    this._Kalidokit = null;
    this._rafId = null;
    this._smoothHead = { x: 0, y: 0, z: 0 };
    this._processing = false;
    this._lastSendAt = 0;
    this._warnedNoVrm = false;
    this._debugBodyLogged = false;

    this._bodyRig = { pose: null, leftHand: null, rightHand: null, head: null };
    /** @type {WeakMap<object, { rest: Map<string, THREE.Quaternion>, autoUpdate: boolean }>} */
    this._vrmBodyState = new WeakMap();
  }

  get active() {
    return this._active;
  }

  isWebXRActive() {
    const r = this.getRenderer();
    return !!(r?.renderer?.xr?.isPresenting);
  }

  tickBodyRig() {
    if (!this._active) return;
    this._applyBodyRigToVRMs();
  }

  async start() {
    if (this._active) return true;
    if (this.isWebXRActive()) {
      this._reportError('Webcam control is disabled while in VR/AR.');
      return false;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      this._reportError('Camera API unavailable. Open the app over HTTPS (e.g. https://localhost:3000).');
      return false;
    }

    try {
      const [HolisticCtor, Kalidokit] = await Promise.all([
        this._ensureHolistic(),
        this._ensureKalidokit(),
      ]);

      if (!HolisticCtor) {
        this._reportError('MediaPipe Holistic failed to load. Check your network/CDN access.');
        return false;
      }
      if (!Kalidokit?.Face?.solve) {
        this._reportError('Face solver (Kalidokit) failed to load.');
        return false;
      }

      this._Kalidokit = Kalidokit;
      resetWebcamFaceNeutralBaseline();
      this._debugBodyLogged = false;

      this._holistic = new HolisticCtor({
        locateFile: (file) => `${MEDIAPIPE_HOLISTIC_CDN}/${file}`,
      });
      this._holistic.setOptions?.({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        refineFaceLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      this._holistic.onResults((results) => this._onHolisticResults(results));

      this._video = document.createElement('video');
      this._video.playsInline = true;
      this._video.muted = true;
      this._video.setAttribute('playsinline', 'true');

      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false,
      });
      this._video.srcObject = this._stream;
      await this._video.play();

      this._processing = false;
      this._lastSendAt = 0;
      this._warnedNoVrm = false;
      this._bodyRig = { pose: null, leftHand: null, rightHand: null, head: null };
      this._active = true;
      this.setBodyFrameHook?.(() => this.tickBodyRig());
      this.onStateChange?.(true);
      this._runDetectionLoop();
      return true;
    } catch (err) {
      console.error('[WebcamAvatarDriver] start failed:', err);
      this._reportError(this._describeStartError(err));
      this._stopMedia();
      this._disposeHolistic();
      return false;
    }
  }

  _reportError(message) {
    try {
      this.onError?.(message);
    } catch (_) {
      /* ignore */
    }
  }

  _describeStartError(err) {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Camera permission was denied. Allow camera access in your browser and try again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera was found on this device.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'The camera is already in use by another app.';
    }
    return `Could not start webcam control: ${err?.message || err}`;
  }

  async _ensureHolistic() {
    if (typeof window !== 'undefined' && typeof window.Holistic === 'function') {
      return window.Holistic;
    }
    try {
      await this._loadScript(`${MEDIAPIPE_HOLISTIC_CDN}/holistic.js`, 'holistic');
    } catch (e) {
      console.error('[WebcamAvatarDriver] Holistic CDN load failed:', e?.message || e);
    }
    return typeof window !== 'undefined' && typeof window.Holistic === 'function'
      ? window.Holistic
      : null;
  }

  async _ensureKalidokit() {
    try {
      const mod = await import('kalidokit');
      if (mod?.Face?.solve) return mod;
      if (mod?.default?.Face?.solve) return mod.default;
      return mod?.default ?? mod ?? null;
    } catch (e) {
      console.error('[WebcamAvatarDriver] Kalidokit import failed:', e?.message || e);
      return null;
    }
  }

  _loadScript(src, mediapipeKey = 'holistic') {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('document unavailable'));
        return;
      }
      const selector = `script[data-cs-mediapipe="${mediapipeKey}"]`;
      const existing = document.querySelector(selector);
      if (existing) {
        if (existing.dataset.loaded === '1') resolve();
        else {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('script error')), { once: true });
        }
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.dataset.csMediapipe = mediapipeKey;
      s.addEventListener('load', () => {
        s.dataset.loaded = '1';
        resolve();
      }, { once: true });
      s.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.appendChild(s);
    });
  }

  stop() {
    if (!this._active) return;
    this._active = false;
    this.setBodyFrameHook?.(null);
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._processing = false;
    this._disposeHolistic();
    this._Kalidokit = null;
    this._bodyRig = { pose: null, leftHand: null, rightHand: null, head: null };
    resetWebcamFaceNeutralBaseline();
    this._stopMedia();
    this._resetVRMs();
    this.onStateChange?.(false);
  }

  _disposeHolistic() {
    if (!this._holistic) return;
    try {
      this._holistic.onResults?.(() => {});
      this._holistic.close?.();
    } catch (_) {
      /* ignore */
    }
    this._holistic = null;
  }

  _stopMedia() {
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._video) {
      this._video.srcObject = null;
      this._video = null;
    }
  }

  _runDetectionLoop() {
    if (!this._active || !this._holistic || !this._video) return;
    if (this.isWebXRActive()) {
      this.stop();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._runDetectionLoop());

    if (this._processing) return;
    if (this._video.readyState < 2) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastSendAt < MIN_SEND_INTERVAL_MS) return;

    this._processing = true;
    this._lastSendAt = now;
    try {
      this._holistic.send({ image: this._video });
    } catch (_) {
      this._processing = false;
    }
  }

  _logBodyDebugOnce(pose2D, pose3D, leftHand, rightHand) {
    if (this._debugBodyLogged || typeof window === 'undefined') return;
    try {
      if (!/\bwebcamDebug=1\b/.test(window.location.search || '')) return;
    } catch {
      return;
    }
    this._debugBodyLogged = true;
    console.info('[WebcamAvatarDriver] body tracking', {
      pose2D: pose2D?.length ?? 0,
      pose3D: pose3D?.length ?? 0,
      leftHand: leftHand?.length ?? 0,
      rightHand: rightHand?.length ?? 0,
      hasPoseSolve: !!this._Kalidokit?.Pose?.solve,
    });
  }

  _onHolisticResults(results) {
    this._processing = false;
    if (!this._active || !this._Kalidokit || this.isWebXRActive()) return;

    const video = this._video;
    const imageSize = video
      ? { width: video.videoWidth, height: video.videoHeight }
      : { width: 640, height: 480 };

    const rawFace = results?.faceLandmarks ?? null;
    if (rawFace?.length) {
      const faceLmForExpr = cloneLandmarks(rawFace);
      const faceLmForSolve = cloneLandmarks(rawFace);

      let faceRig;
      try {
        faceRig = this._Kalidokit.Face.solve(faceLmForSolve, {
          runtime: 'mediapipe',
          video,
          imageSize,
          smoothBlink: true,
          blinkSettings: [0.25, 0.75],
        });
      } catch (_) {
        faceRig = null;
      }

      if (faceRig) {
        this._bodyRig.head = faceRig.head ?? null;
        const weightRecord = inferMediaPipeFaceWeightRecord(faceLmForExpr, faceRig, imageSize);
        const vrms = this.getVRMs();
        if (weightRecord && Object.keys(weightRecord).length && vrms.length) {
          applyExpressionWeightRecordToVRMS(vrms, weightRecord, {
            lerpFactor: FACE_EXPR_LERP,
            skipNeutralPreprocess: true,
          });
        } else if (!vrms.length && !this._warnedNoVrm) {
          this._warnedNoVrm = true;
          console.warn('[WebcamAvatarDriver] No VRM loaded — load a VRM model first.');
        }
      }
    }

    const pose2D = results?.poseLandmarks ?? null;
    let pose3D = results?.poseWorldLandmarks ?? results?.ea ?? null;
    if (!pose3D?.length && pose2D?.length) {
      pose3D = pose3dFrom2d(pose2D);
    }

    const leftHandLm = results?.rightHandLandmarks ?? null;
    const rightHandLm = results?.leftHandLandmarks ?? null;
    this._logBodyDebugOnce(pose2D, pose3D, leftHandLm, rightHandLm);

    if (pose3D?.length && pose2D?.length && this._Kalidokit.Pose?.solve) {
      try {
        const riggedPose = this._Kalidokit.Pose.solve(pose3D, pose2D, {
          runtime: 'mediapipe',
          video,
          imageSize,
          enableLegs: false,
        });
        if (riggedPose) this._bodyRig.pose = riggedPose;
      } catch (e) {
        if (!this._debugBodyLogged && typeof window !== 'undefined' && /\bwebcamDebug=1\b/.test(window.location.search || '')) {
          console.warn('[WebcamAvatarDriver] Pose.solve failed:', e?.message || e);
        }
      }
    }

    if (this._Kalidokit.Hand?.solve) {
      try {
        this._bodyRig.rightHand = rightHandLm?.length
          ? this._Kalidokit.Hand.solve(rightHandLm, 'Right')
          : null;
      } catch (_) {
        this._bodyRig.rightHand = null;
      }
      try {
        this._bodyRig.leftHand = leftHandLm?.length
          ? this._Kalidokit.Hand.solve(leftHandLm, 'Left')
          : null;
      } catch (_) {
        this._bodyRig.leftHand = null;
      }
    }

    this._applyBodyRigToVRMs();
  }

  _ensureVrmBodyState(vrm) {
    if (this._vrmBodyState.has(vrm)) return this._vrmBodyState.get(vrm);
    const humanoid = vrm?.humanoid;
    const state = {
      rest: new Map(),
      autoUpdate: humanoid?.autoUpdateHumanBones !== false,
    };
    if (humanoid) {
      humanoid.autoUpdateHumanBones = false;
      for (const boneName of DRIVEN_BONE_NAMES) {
        const bone = this._getRawBone(vrm, boneName);
        if (bone) state.rest.set(boneName, bone.quaternion.clone());
      }
    }
    this._vrmBodyState.set(vrm, state);
    return state;
  }

  _getRawBone(vrm, boneName) {
    const humanoid = vrm?.humanoid;
    if (!humanoid) return null;
    return (
      humanoid.getRawBoneNode?.(boneName) ||
      humanoid.humanBones?.[boneName]?.node ||
      null
    );
  }

  /**
   * Kalidokit-style: slerp raw bone from captured rest toward target euler (per frame).
   */
  _rigRotation(vrm, boneName, rotation, dampener = 1, lerpAmount = BONE_LERP) {
    if (!rotation || !boneName) return false;
    const bone = this._getRawBone(vrm, boneName);
    if (!bone) return false;

    const state = this._ensureVrmBodyState(vrm);
    let rest = state.rest.get(boneName);
    if (!rest) {
      rest = bone.quaternion.clone();
      state.rest.set(boneName, rest);
    }

    _euler.set(
      (rotation.x ?? 0) * dampener,
      (rotation.y ?? 0) * dampener,
      (rotation.z ?? 0) * dampener,
    );
    _quatTarget.setFromEuler(_euler);
    bone.quaternion.copy(rest).slerp(_quatTarget, lerpAmount);
    return true;
  }

  _applyBodyRigToVRMs() {
    const vrms = this.getVRMs();
    if (!vrms.length) return;

    const { pose, leftHand, rightHand, head } = this._bodyRig;
    const hasPose = !!(pose || leftHand || rightHand || head);
    if (!hasPose) return;

    if (head && (head.x !== 0 || head.y !== 0 || head.z !== 0)) {
      this._smoothHead.x += (head.x - this._smoothHead.x) * HEAD_LERP;
      this._smoothHead.y += (head.y - this._smoothHead.y) * HEAD_LERP;
      this._smoothHead.z += (head.z - this._smoothHead.z) * HEAD_LERP;
    }

    for (const vrm of vrms) {
      if (!vrm?.humanoid) continue;
      this._ensureVrmBodyState(vrm);

      let driven = 0;
      if (pose) {
        if (pose.Hips?.rotation && this._rigRotation(vrm, 'hips', pose.Hips.rotation, 0.7)) driven += 1;
        if (pose.Spine && this._rigRotation(vrm, 'spine', pose.Spine, 0.45)) driven += 1;
        if (this._getRawBone(vrm, 'chest') && pose.Spine) {
          this._rigRotation(vrm, 'chest', pose.Spine, 0.25);
        }
        if (pose.LeftUpperArm && this._rigRotation(vrm, 'leftUpperArm', pose.LeftUpperArm)) driven += 1;
        if (pose.LeftLowerArm && this._rigRotation(vrm, 'leftLowerArm', pose.LeftLowerArm)) driven += 1;
        if (pose.RightUpperArm && this._rigRotation(vrm, 'rightUpperArm', pose.RightUpperArm)) driven += 1;
        if (pose.RightLowerArm && this._rigRotation(vrm, 'rightLowerArm', pose.RightLowerArm)) driven += 1;
        if (pose.LeftHand && this._rigRotation(vrm, 'leftHand', pose.LeftHand)) driven += 1;
        if (pose.RightHand && this._rigRotation(vrm, 'rightHand', pose.RightHand)) driven += 1;
      }

      if (leftHand) {
        for (const [key, rot] of Object.entries(leftHand)) {
          const name = kalidokitBoneToVrm(key);
          if (name && this._rigRotation(vrm, name, rot, 1, HAND_LERP)) driven += 1;
        }
      }
      if (rightHand) {
        for (const [key, rot] of Object.entries(rightHand)) {
          const name = kalidokitBoneToVrm(key);
          if (name && this._rigRotation(vrm, name, rot, 1, HAND_LERP)) driven += 1;
        }
      }

      if (head) {
        if (this._rigRotation(vrm, 'neck', this._smoothHead, 0.65)) driven += 1;
        if (this._rigRotation(vrm, 'head', this._smoothHead, 0.5)) driven += 1;
      }

      if (
        !this._debugBodyLogged &&
        typeof window !== 'undefined' &&
        /\bwebcamDebug=1\b/.test(window.location.search || '')
      ) {
        console.info('[WebcamAvatarDriver] raw bones driven', { driven, hasPose: !!pose });
      }
    }
  }

  _resetVRMs() {
    const vrms = this.getVRMs();
    for (const vrm of vrms) {
      const state = this._vrmBodyState.get(vrm);
      if (state?.rest) {
        for (const [boneName, restQuat] of state.rest) {
          const bone = this._getRawBone(vrm, boneName);
          if (bone) bone.quaternion.copy(restQuat);
        }
      }
      const humanoid = vrm?.humanoid;
      if (humanoid) {
        if (state) humanoid.autoUpdateHumanBones = state.autoUpdate;
        try {
          humanoid.resetRawPose?.();
          humanoid.resetNormalizedPose?.();
          if (state?.autoUpdate !== false) humanoid.update?.();
        } catch (_) {
          /* ignore */
        }
      }
      this._vrmBodyState.delete(vrm);
    }
    this._smoothHead = { x: 0, y: 0, z: 0 };
  }
}
