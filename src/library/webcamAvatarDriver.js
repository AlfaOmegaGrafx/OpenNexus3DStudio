/**
 * Webcam Avatar Driver – drives VRM face (and optional pose) from webcam using
 * MediaPipe Holistic + Kalidokit. Aligned with Kalidokit/XR Animator–style
 * webcam control. Does not run or apply when WebXR is presenting, so it
 * does not interfere with VR/AR or Galaxy XR.
 *
 * Future: On devices that support it (e.g. Galaxy XR), XR_ANDROID_face_tracking
 * can be used as an alternative input path instead of webcam.
 */

import { VRMExpressionPresetName } from '@pixiv/three-vrm';

const MEDIAPIPE_HOLISTIC_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.4.1633559476';
const LERP_FACTOR = 0.15;

export class WebcamAvatarDriver {
  /**
   * @param {Object} options
   * @param {() => import('@pixiv/three-vrm').VRM[]} options.getVRMs - Returns current VRMs to drive
   * @param {() => { renderer?: { xr?: { isPresenting?: boolean } } } | null} options.getRenderer - For WebXR check
   * @param {(active: boolean) => void} [options.onStateChange] - Called when running state changes
   */
  constructor(options) {
    this.getVRMs = options.getVRMs || (() => []);
    this.getRenderer = options.getRenderer || (() => null);
    this.onStateChange = options.onStateChange || null;

    this._active = false;
    this._video = null;
    this._stream = null;
    this._holistic = null;
    this._Kalidokit = null;
    this._rafId = null;
    this._lastFaceRig = null;
    this._smoothHead = { x: 0, y: 0, z: 0 };
  }

  get active() {
    return this._active;
  }

  /** Returns true if WebXR is currently presenting (VR/AR). Driver should not apply when true. */
  isWebXRActive() {
    const r = this.getRenderer();
    return !!(r?.renderer?.xr?.isPresenting);
  }

  /**
   * Start webcam and face tracking. No-op if WebXR is presenting.
   * @returns {Promise<boolean>} true if started, false if skipped/failed
   */
  async start() {
    if (this._active) return true;
    if (this.isWebXRActive()) {
      console.warn('[WebcamAvatarDriver] Not starting: WebXR is active');
      return false;
    }

    try {
      const [HolisticModule, KalidokitModule] = await Promise.all([
        import('@mediapipe/holistic').catch(() => null),
        import('kalidokit').catch(() => null)
      ]);

      const Holistic = HolisticModule?.default ?? HolisticModule?.Holistic ?? globalThis.Holistic;
      const Kalidokit = KalidokitModule?.default ?? KalidokitModule;

      if (!Holistic || !Kalidokit) {
        console.error('[WebcamAvatarDriver] Missing @mediapipe/holistic or kalidokit');
        return false;
      }

      this._Kalidokit = Kalidokit;

      this._holistic = new Holistic({
        locateFile: (file) => `${MEDIAPIPE_HOLISTIC_CDN}/${file}`
      });
      this._holistic.onResults = (results) => this._onHolisticResults(results);

      this._video = document.createElement('video');
      this._video.playsInline = true;
      this._video.muted = true;
      this._video.setAttribute('playsinline', 'true');

      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
      this._video.srcObject = this._stream;
      await this._video.play();

      this._active = true;
      this.onStateChange?.(true);
      this._runDetectionLoop();
      return true;
    } catch (err) {
      console.error('[WebcamAvatarDriver] start failed:', err);
      this._stopMedia();
      return false;
    }
  }

  /** Stop webcam and tracking */
  stop() {
    if (!this._active) return;
    this._active = false;
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._holistic = null;
    this._Kalidokit = null;
    this._lastFaceRig = null;
    this._stopMedia();
    this._resetVRMs();
    this.onStateChange?.(false);
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
    try {
      if (this._video.readyState >= 2) this._holistic.send({ image: this._video });
    } catch (_) {
      // video not ready or send failed
    }
    this._rafId = requestAnimationFrame(() => this._runDetectionLoop());
  }

  _onHolisticResults(results) {
    if (!this._active || !this._Kalidokit || this.isWebXRActive()) return;

    const faceLandmarks = results.faceLandmarks;
    if (!faceLandmarks || faceLandmarks.length === 0) return;

    const video = this._video;
    const opts = {
      runtime: 'mediapipe',
      video,
      imageSize: video ? { width: video.videoWidth, height: video.videoHeight } : { width: 640, height: 480 },
      smoothBlink: true,
      blinkSettings: [0.25, 0.75]
    };

    let faceRig;
    try {
      faceRig = this._Kalidokit.Face.solve(faceLandmarks, opts);
    } catch (e) {
      return;
    }

    if (!faceRig) return;
    this._lastFaceRig = faceRig;
    this._applyToVRMs(faceRig);
  }

  _applyToVRMs(faceRig) {
    const vrms = this.getVRMs();
    if (!vrms.length) return;

    const eyeL = faceRig.eye?.l ?? 1;
    const eyeR = faceRig.eye?.r ?? 1;
    const blinkValue = 1 - Math.min(eyeL, eyeR);
    const stabilized = this._Kalidokit?.Face?.stabilizeBlink
      ? this._Kalidokit.Face.stabilizeBlink(
          { l: eyeL, r: eyeR },
          faceRig.head?.z ?? 0,
          { noWink: false, maxRot: 0.5 }
        )
      : { l: eyeL, r: eyeR };

    const mouth = faceRig.mouth?.shape ?? {};
    const head = faceRig.head ?? { x: 0, y: 0, z: 0 };

    for (const vrm of vrms) {
      if (!vrm.expressionManager) continue;

      const em = vrm.expressionManager;

      // Blink: use stabilized or single Blink preset
      const blink = 1 - Math.min(stabilized.l, stabilized.r);
      this._setExpression(em, VRMExpressionPresetName.Blink, blink);
      if (em.getExpression?.('blink_l') || em.getExpression?.('Blink_L')) {
        this._setExpression(em, 'Blink_L', 1 - stabilized.l);
      }
      if (em.getExpression?.('blink_r') || em.getExpression?.('Blink_R')) {
        this._setExpression(em, 'Blink_R', 1 - stabilized.r);
      }

      // Mouth: A, E, I, O, U -> Ah, Ee, Oh, Ou (VRM presets)
      this._setExpression(em, VRMExpressionPresetName.Ah, this._clamp(mouth.A ?? 0));
      this._setExpression(em, VRMExpressionPresetName.Ee, this._clamp(mouth.E ?? 0));
      this._setExpression(em, VRMExpressionPresetName.Oh, this._clamp(mouth.O ?? 0));
      this._setExpression(em, VRMExpressionPresetName.Ou, this._clamp(mouth.U ?? 0));

      em.update?.();

      // Head rotation -> neck/head bones (optional, matches LookAt-style control)
      if (vrm.humanoid?.humanBones && (head.x !== 0 || head.y !== 0 || head.z !== 0)) {
        this._smoothHead.x += (head.x - this._smoothHead.x) * LERP_FACTOR;
        this._smoothHead.y += (head.y - this._smoothHead.y) * LERP_FACTOR;
        this._smoothHead.z += (head.z - this._smoothHead.z) * LERP_FACTOR;

        const neck = vrm.humanoid.humanBones.neck?.node;
        const headBone = vrm.humanoid.humanBones.head?.node;
        if (neck) {
          neck.rotation.x = this._smoothHead.x * 0.5;
          neck.rotation.y = this._smoothHead.y * 0.5;
          neck.rotation.z = this._smoothHead.z * 0.5;
        }
        if (headBone) {
          headBone.rotation.x = this._smoothHead.x * 0.5;
          headBone.rotation.y = this._smoothHead.y * 0.5;
          headBone.rotation.z = this._smoothHead.z * 0.5;
        }
      }
    }
  }

  _setExpression(expressionManager, name, value) {
    const v = this._clamp(value);
    try {
      if (expressionManager.getExpression?.(name) || expressionManager.expressions?.[name]) {
        expressionManager.setValue(name, v);
      }
    } catch (_) {
      // ignore missing expression
    }
  }

  _clamp(v) {
    return Math.max(0, Math.min(1, Number(v) || 0));
  }

  _resetVRMs() {
    const vrms = this.getVRMs();
    for (const vrm of vrms) {
      if (!vrm.expressionManager) continue;
      const em = vrm.expressionManager;
      this._setExpression(em, VRMExpressionPresetName.Blink, 0);
      this._setExpression(em, VRMExpressionPresetName.Ah, 0);
      this._setExpression(em, VRMExpressionPresetName.Ee, 0);
      this._setExpression(em, VRMExpressionPresetName.Oh, 0);
      this._setExpression(em, VRMExpressionPresetName.Ou, 0);
      em.update?.();
      const neck = vrm.humanoid?.humanBones?.neck?.node;
      const headBone = vrm.humanoid?.humanBones?.head?.node;
      if (neck) neck.rotation.set(0, 0, 0);
      if (headBone) headBone.rotation.set(0, 0, 0);
    }
    this._smoothHead = { x: 0, y: 0, z: 0 };
  }
}
