/**
 * SceneManager - Central orchestrator for 3D scene management
 * Similar to CharacterManager in OpenNexus3DStudio, but focused on 3D AIGC workflows
 */
import * as THREE from './three.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { GLBExporter } from './glbExporter.js';
import { VRMLoader } from './vrmLoader.js';
import { VRMExporter } from './VRMExporter.js';
import { LipSync } from './lipsync.js';
import { VRMExpressionPresetName } from '@pixiv/three-vrm';
import {
  applyExpressionWeightRecordToVRMS,
  applyXRFrameExpressionsToVRMS,
  maybeProbeXRFrame,
  XR_EXPRESSION_TRACKING_FEATURE
} from './xrExpressionTrackingDriver.js';
import {
  getLastNativeFaceSource,
  getNativeFaceWeightsIfFresh,
  getNativeFaceWeightsMaxAgeMs,
} from './nativeFaceBridge.js';
import {
  resumeNativeFacePlaybackScheduling,
  tickNativeFacePlaybackOnXrFrame,
} from './nativeFacePlayback.js';
import {
  unlockFaceRecordingAudioPlayback,
  resetFaceRecordingAudioXrUnlock,
} from './nativeFaceRecordingAudio.js';
import { sharedHDRManager } from './sharedHDRManager.js';
import { inferModelFileExtensionFromSource } from './taskModelUrl.js';
import { get3daigcAuthHeaders } from './taskManager.js';
import {
  disposeSplatMesh,
  disposeSparkRenderer,
  ensureSparkRenderer,
  isGaussianSplatExtension,
  loadSplatMesh,
} from './sparkSplatManager.js';
import {
  clearWorld as clearWorldLayers,
  computeXrFloorAlignmentY,
  ensureSceneRoots,
  loadWorldEnvironmentSplat,
  loadWorldPackage as loadWorldPackageIntoScene,
} from './worldSceneLoader.js';
import { createSceneManagerXrInteraction } from './sceneManagerXrInteraction.js';
import { ensureXrLocomotionRig } from './sceneManagerXrLocomotion.js';
import { createDepthVisualizationMaterial, createViewNormalMaterial, createUVMaterial } from './diagnosticMaterials.js';
import {
  collectModelBones,
  collectRigBonesFromGltf,
  countModelBones,
  alignSkinnedMeshToRig,
  anchorModelFeetToFloor,
  findPrimarySkinnedMesh,
  getBoneDisplayWorldPosition,
  getBoneWorldBounds,
  getMeshLayoutBounds,
  getSkeletonJointSphereRadius,
  getViewportFloorAnchorBounds,
  getViewportLayoutBounds,
  getPrimarySkeletonBones,
  logRigAlignmentDiagnostics,
  mergeModelBones,
  modelHasSkinnedMesh,
  normalizeRiggedModelTransforms,
  rebindSkinnedMeshes,
} from './rigBoneUtils.js';
import { validateAigcRigContract } from './aigcRigContract.js';
import {
  isBlenderExportedGltf,
  isDgxApiExportedGltf,
  isPreservedOrientationGltf,
  isViewportExportedGltf,
  shouldPreserveExportedOrientation,
} from './modelOrientationUtils.js';
import { createViewportRenderer } from './rendererBootstrap.js';
import { getHumanoidBoneNames, getHumanoidRigBone } from './utils.js';

const SKY_BACKGROUND_URL = '/assets/backgrounds/background4.jpg';
/** Horizon tone of background4.jpg — shown only until the JPG decode finishes */
const SKY_FALLBACK_COLOR = 0x8eb6d4;

let skyBackgroundTexturePromise = null;

/** @returns {Promise<THREE.Texture>} */
export function loadSkyBackgroundTexture() {
  if (!skyBackgroundTexturePromise) {
    skyBackgroundTexturePromise = new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        SKY_BACKGROUND_URL,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.flipY = false;
          texture.needsUpdate = true;
          resolve(texture);
        },
        undefined,
        (err) => {
          skyBackgroundTexturePromise = null;
          reject(err);
        },
      );
    });
  }
  return skyBackgroundTexturePromise;
}

export class SceneManager {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.currentModel = null;
    this.currentSplat = null;
    this.playerRoot = null;
    this.worldRoot = null;
    this.propsRoot = null;
    this.worldEnvironmentSplat = null;
    this.worldColliderMesh = null;
    this.worldPropMeshes = [];
    this.activeWorldId = null;
    this.activeWorldManifest = null;
    this.sparkRenderer = null;
    this.renderMode = 'solid';
    this.rendererType = 'webgl';
    this.webgpuSupport = null;
    this.isInitialized = false;
    this._initGeneration = 0;
    this.selectedBoneName = null;
    this.animationId = null;
    this.isRendering = false;
    
    // Multi-selection support
    this.selectedBones = new Set();
    this.boundingBoxSelection = {
      isActive: false,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      boxElement: null
    };
    
    // Store camera state for XR mode restoration
    this.preXRCameraPosition = null;
    this.preXRCameraRotation = null;
    this.preXRCameraTarget = null;
    this.preXRCameraQuaternion = null;
    this.preXRCameraUp = null;
    this.preXRCameraZoom = null;
    
    // Loaders
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setRequestHeader(get3daigcAuthHeaders());
    
    // Configure DRACOLoader for compressed GLTF/GLB models
    this.dracoLoader = new DRACOLoader();
    // Use CDN for Draco decoder (supports both wasm and js decoders)
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    // Alternative: Use jsdelivr CDN (uncomment if gstatic doesn't work)
    // this.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    
    this.objLoader = new OBJLoader();
    this.fbxLoader = new FBXLoader();
    
    // Event listeners
    this.eventListeners = new Map();

    /** Bumped on each viewport load so superseded async loads are discarded. */
    this._viewportLoadGeneration = 0;
    
    // GLB Exporter
    this.glbExporter = new GLBExporter();
    
    // VRM Loader and Exporter
    this.vrmLoader = new VRMLoader();
    this.vrmExporter = new VRMExporter();

    /** Mic-driven lip sync for the loaded studio VRM (see {@link _attachSceneLipSyncMicrophone}). */
    this.sceneLipSync = null;
    this._sceneLipSyncStream = null;
    
    // XR-related properties
    this.vrSceneWrapper = null; // Wrapper group for VR/AR scene offset
    this.xrLocomotionRig = null; // Locomotion translation inside vrSceneWrapper (Phase 5)
    this.xrInteraction = null; // Input + grab + locomotion subsystem (Phases 3–5)
    this.xrReferenceSpace = null; // WebXR reference space
    this.xrBaseReferenceSpace = null; // Reference space from session.requestReferenceSpace(...)
    this.xrRenderReferenceSpace = null; // Reference space actually used for rendering (may be offset for recenter)
    this.xrSession = null; // Current XR session
    this.xrMode = null; // 'ar' | 'vr' | 'xr' (derived from session start; used to avoid race conditions)
    this.xrRenderer = null; // XR-specific renderer (if different from main renderer)
    this.originalXRSetSession = null; // Original setSession function for restoration
    this.originalSceneBackground = undefined; // Original scene background for AR pass-through restoration
    this.preXRBackgroundSnapshot = null; // Full snapshot of background state before XR (for exact restoration)
    this.originalClearColor = undefined; // Original renderer clear color for AR pass-through restoration
    this.originalClearAlpha = undefined; // Original renderer clear alpha for AR pass-through restoration
    
    // VR skybox mesh (for WebXR immersive VR where scene.background may not render)
    this.vrSkybox = null;

    // XR recenter support (software offset reference space)
    // Key hold state by stable XRSpace (targetRaySpace) instead of XRInputSource object refs,
    // because session.inputSources may yield different object instances than event.inputSource
    this.xrRecenterHoldState = new WeakMap(); // WeakMap<XRSpace, Map<number, { downAt:number, triggered:boolean }>>
    this.xrRecenterCooldownUntil = 0;
    this.xrRecenterSelectHoldState = new WeakMap(); // WeakMap<XRSpace, { downAt:number, triggered:boolean }>

    // XR auto-centering (on session start): shifts reference space so the viewer starts at X=0
    // relative to the app's world/grid. This fixes "camera starts 2 squares to the right" issues.
    this.xrAutoCentered = false;
    // Initial viewer pose (position + orientation) when XR session started, used for recentering
    this.xrInitialViewerPosition = null; // { x, y, z }
    this.xrInitialViewerOrientation = null; // { x, y, z, w }

    // XR platform recenter (e.g. headset Home button) can reset the reference-space origin.
    // When it happens, we re-run auto-centering so the user returns to X=0 relative to the grid.
    this.xrOnReferenceSpaceReset = null;

    // XR input diagnostics (dev-gated, low-noise logging)
    this.xrDebugInputs = false; // Set to true via ?xrDebugInputs=1 query param
    this.xrLastDiagnosticLog = 0; // Timestamp of last diagnostic log (throttle to 1/second)
    this.xrLastRecenterCheckLog = 0; // Timestamp of last recenter check log (throttle to 2/second)
    this.xrRecenterCheckFirstLog = false; // Flag to log first call to maybeHandleXRRecenter
    this.xrRecenterCooldownLogged = false; // Flag to prevent spam during cooldown

    // XR exit: Menu / B / system on rising edge (IWSDK-style); grip long-press still recenters.
    this._xrExitPrevPressed = new Map(); // Map<padKey, Map<buttonIndex, boolean>>
    this._xrExitInFlight = false;
    this._xrExitCooldownUntil = 0;
    this._xrNoWebXrInputSources = false;
    // In-app Menu/B exit is opt-in — Galaxy XR maps many buttons to index 5; default off restores pre-feature behavior.
    this.xrMenuExitEnabled = false; // ?xrMenuExit=1
    this.xrGazeExitEnabled = false; // ?xrGazeExit=1 — off by default (accidental gaze looked like "kicked out")
    this.vrExitHud = null;
    this._xrGazeExitDwellStart = 0;
    this._xrGazeExitHintLogged = false;
    this._xrGazeExitVec = new THREE.Vector3();
    this._xrGazeExitCamDir = new THREE.Vector3();

    /** @type {(() => unknown[]) | null} Returns VRM instances to drive via WebXR Expression Tracking */
    this.xrExpressionVRMProvider = null;
    /** @type {(() => import('three').Object3D[]) | null} */
    this.viewportRenderRootsProvider = null;
    /** @type {(() => void) | null} Re-applies webcam Holistic pose/hands each frame (after animation). */
    this._webcamBodyFrameHook = null;
    this.xrExpressionFeatureLogged = false;
    /** Log once per immersive session: enabledFeatures vs XRFrame.expressions (for ?remoteLog=1 / DevTools) */
    this._xrExprFirstFrameDiagLogged = false;

    /** Throttle for _maybeLogNativeFaceRemoteDiag (?remoteLog=1 → Vite remote-log file) */
    this._nativeFaceRemoteDiagAt = 0;
  }

  /**
   * When ?remoteLog=1, emit a throttled console line so the dev server can append it to logs/remote-log.txt.
   * @param {unknown[]} vrms
   * @param {Record<string, number>|null|undefined} nativeRec
   */
  _maybeLogNativeFaceRemoteDiag(vrms, nativeRec) {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return;
    let enabled = false;
    try {
      enabled = new URLSearchParams(window.location.search).get('remoteLog') === '1';
    } catch {
      return;
    }
    if (!enabled) return;

    const t = performance.now();
    if (t - this._nativeFaceRemoteDiagAt < 4000) return;
    this._nativeFaceRemoteDiagAt = t;

    const list = Array.isArray(vrms) ? vrms.filter(Boolean) : [];
    const nk = nativeRec && typeof nativeRec === 'object' ? Object.keys(nativeRec).length : 0;
    const exprN = list.filter((v) => v?.expressionManager).length;
    const presenting = !!(this.renderer?.xr?.isPresenting);
    let relay = 'off';
    try {
      const fn = window.__CS_NATIVE_FACE_RELAY_STATUS;
      if (typeof fn === 'function') {
        const st = fn();
        const relayStaleMs = presenting ? 30_000 : 5000;
        const pushAge =
          st?.lastPushAgeMs != null && st.lastPushAgeMs < relayStaleMs
            ? `${st.lastPushAgeMs}ms`
            : 'stale';
        relay = `${st?.mode || '?'}/${pushAge}`;
      } else if (new URLSearchParams(window.location.search).get('nativeFaceRelay') === '1') {
        relay = 'enabled-not-running';
      }
    } catch {
      /* ignore */
    }
    const faceSrc = getLastNativeFaceSource();
    console.info(
      '[CS-NATIVE-FACE-DIAG]',
      `nativeKeys=${nk} faceSrc=${faceSrc} relay=${relay} vrms=${list.length} exprMgr=${exprN} curVRM=${!!this.currentVRM} xrPresenting=${presenting}`,
    );
  }

  /**
   * Registers a callback returning VRM(s) that should mirror the wearer via WebXR
   * "expression-tracking" (draft) when enabled on the XR session (e.g. Android XR).
   * @param {(() => unknown[]) | null} fn - e.g. same list as webcam avatar provider
   */
  setXRExpressionVRMProvider(fn) {
    this.xrExpressionVRMProvider = typeof fn === 'function' ? fn : null;
  }

  /** Trait avatar meshes + file import (for skeleton / render modes). */
  setViewportRenderRootsProvider(fn) {
    this.viewportRenderRootsProvider = typeof fn === 'function' ? fn : null;
  }

  _getViewportRenderRoots() {
    if (typeof this.viewportRenderRootsProvider === 'function') {
      const roots = this.viewportRenderRootsProvider();
      if (Array.isArray(roots) && roots.length > 0) {
        return roots.filter(Boolean);
      }
    }
    const vrm = this._resolveExpressionVRM();
    if (this.currentModel) {
      return [this.currentModel];
    }
    if (vrm?.scene) {
      return [vrm.scene];
    }
    return [];
  }

  /** Register per-frame webcam body rig callback (pose + hands); cleared when Cam stops. */
  setWebcamBodyFrameHook(fn) {
    this._webcamBodyFrameHook = typeof fn === 'function' ? fn : null;
  }

  /**
   * Apply a reference space to the Three.js WebXRManager.
   * Different Three.js versions expose different APIs; support both.
   */
  applyXRReferenceSpace(referenceSpace) {
    if (!this.renderer?.xr || !referenceSpace) {
      console.warn('[REORIENT_FIX] ⚠️ APPLY_REF_SPACE: Cannot apply - renderer.xr or referenceSpace missing');
      return;
    }
    
    // Store the reference space we want to use
    this.xrRenderReferenceSpace = referenceSpace;
    
    try {
      // Method 1: Use setReferenceSpace if available (Three.js r150+)
      if (typeof this.renderer.xr.setReferenceSpace === 'function') {
        this.renderer.xr.setReferenceSpace(referenceSpace);
        console.log('[REORIENT_FIX] ✅ APPLY_REF_SPACE: Applied via setReferenceSpace()');
      } else {
        // Fallback (older Three.js): directly assign
        this.renderer.xr.referenceSpace = referenceSpace;
        console.log('[REORIENT_FIX] ✅ APPLY_REF_SPACE: Applied via direct assignment (fallback)');
      }
      
      // Method 2: Don't override getReferenceSpace() - let Three.js use the reference space naturally
      // Overriding it can interfere with Three.js's internal camera handling
      // The reference space is already set via setReferenceSpace() or direct assignment above
      
      // Method 3: Ensure direct property is set as fallback
      // Some Three.js versions use the property directly, so we set it here too
      try {
        if (!this.renderer.xr.referenceSpace || this.renderer.xr.referenceSpace !== referenceSpace) {
          this.renderer.xr.referenceSpace = referenceSpace;
          console.log('[REORIENT_FIX] ✅ APPLY_REF_SPACE: Set referenceSpace property directly as fallback');
        }
      } catch (e) {
        // Property assignment failed, that's okay - we have other methods
        console.log('[REORIENT_FIX] ℹ️ APPLY_REF_SPACE: Direct property assignment not possible (non-critical)');
      }
      
    } catch (e) {
      console.warn('[REORIENT_FIX] ⚠️ APPLY_REF_SPACE: Failed to apply:', e?.message || e);
      // Last resort: direct assignment
      try {
        this.renderer.xr.referenceSpace = referenceSpace;
        console.log('[REORIENT_FIX] ⚠️ APPLY_REF_SPACE: Applied via direct assignment (last resort)');
      } catch {
        // ignore
      }
    }
    
    // Verify it was applied (check both direct property and getReferenceSpace if available)
    let actualReferenceSpace = null;
    let verificationMethod = 'none';
    if (this.renderer.xr.referenceSpace) {
      actualReferenceSpace = this.renderer.xr.referenceSpace;
      verificationMethod = 'direct property';
    } else if (typeof this.renderer.xr.getReferenceSpace === 'function') {
      actualReferenceSpace = this.renderer.xr.getReferenceSpace();
      verificationMethod = 'getReferenceSpace()';
    }
    
    if (actualReferenceSpace !== referenceSpace) {
      console.warn('[REORIENT_FIX] ❌ APPLY_REF_SPACE: Verification FAILED - renderer.xr.referenceSpace is not the expected referenceSpace after application.', {
        expected: referenceSpace,
        actual: actualReferenceSpace,
        stored: this.xrRenderReferenceSpace,
        verificationMethod: verificationMethod,
        hasSetReferenceSpace: typeof this.renderer.xr.setReferenceSpace === 'function',
        hasGetReferenceSpace: typeof this.renderer.xr.getReferenceSpace === 'function',
        xrIsPresenting: this.renderer.xr.isPresenting
      });
      // Even if verification fails, we've stored it in xrRenderReferenceSpace which we'll use in the render loop
      console.log('[REORIENT_FIX] ℹ️ APPLY_REF_SPACE: Will use stored xrRenderReferenceSpace in render loop. Three.js may be using a different reference space internally, but we will use ours for pose calculations.');
    } else {
      console.log('[REORIENT_FIX] ✅ APPLY_REF_SPACE: Verification SUCCESS - renderer.xr.referenceSpace is correctly set.', {
        verificationMethod: verificationMethod
      });
    }
  }

  /**
   * Verify that the XR reference space was correctly applied to the renderer.
   */
  verifyReferenceSpaceApplied(expectedSpace) {
    if (!this.renderer?.xr || !expectedSpace) {
      console.warn('[REORIENT_FIX] ⚠️ VERIFY_REF_SPACE: Cannot verify - renderer.xr or expectedSpace missing');
      return;
    }
    if (this.renderer.xr.referenceSpace !== expectedSpace) {
      console.warn('[REORIENT_FIX] ❌ VERIFY_REF_SPACE: Verification FAILED - renderer.xr.referenceSpace does not match the expected space.');
    } else {
      console.log('[REORIENT_FIX] ✅ VERIFY_REF_SPACE: Verification SUCCESS - renderer.xr.referenceSpace is correctly set.');
    }
  }

  /**
   * Software recenter by creating an offset reference space. This is a fallback when
   * platform-level recenter (home/touchpad hold) doesn't affect the app.
   *
   * Strategy:
   * - Keep floor alignment by zeroing Y translation.
   * - Recenter X/Z position + yaw so the current view becomes "forward" at origin.
   */
  recenterXR(frame) {
    console.log('[REORIENT_FIX] 🎯 RECENTER_XR: Starting reorientation to initial start position...');
    try {
      if (!this.xrSession || !frame) {
        console.warn('[REORIENT_FIX] ❌ RECENTER_XR: FAILED - No XR session or frame');
        return false;
      }
      if (!this.xrBaseReferenceSpace) {
        console.warn('[REORIENT_FIX] ❌ RECENTER_XR: FAILED - No base reference space');
        return false;
      }
      if (!this.xrRenderReferenceSpace) {
        console.warn('[REORIENT_FIX] ❌ RECENTER_XR: FAILED - No render reference space');
        return false;
      }
      if (typeof this.xrRenderReferenceSpace.getOffsetReferenceSpace !== 'function') {
        console.warn('[REORIENT_FIX] ❌ RECENTER_XR: FAILED - getOffsetReferenceSpace not available');
        return false;
      }
      if (typeof XRRigidTransform !== 'function') {
        console.warn('[REORIENT_FIX] ❌ RECENTER_XR: FAILED - XRRigidTransform not available');
        return false;
      }

      // Get current viewer pose in the *current render* reference space
      // (which might already be an offset space from a previous recenter or auto-center)
      const currentRenderPose = frame.getViewerPose(this.xrRenderReferenceSpace);
      if (!currentRenderPose) {
        console.warn('[REORIENT_FIX] ❌ RECENTER_XR: FAILED - Could not get viewer pose');
        return false;
      }

      const currentPosInRenderSpace = currentRenderPose.transform.position;
      const currentOriInRenderSpace = currentRenderPose.transform.orientation;
      if (!currentPosInRenderSpace || !currentOriInRenderSpace) {
        console.warn('[REORIENT_FIX] ❌ RECENTER_XR: FAILED - Invalid pose position or orientation');
        return false;
      }
      
      console.log('[REORIENT_FIX] ✅ RECENTER_XR: Prerequisites validated, computing transform...');

      let offsetPos, offsetOri;
      if (this.xrInitialViewerPosition && this.xrInitialViewerOrientation) {
        // We want to recenter to the initial start position and orientation.
        // The initial position is { x: 0, y: 0, z: initialZ } in the app's world (after auto-centering).
        // However, we want to preserve the user's current Z depth to avoid sudden jumps forward/backward.
        // So we recenter to { x: 0, y: 0, z: currentZ } but restore the initial orientation.
        //
        // The transform we pass to `getOffsetReferenceSpace` represents the pose of the
        // *new reference space origin* in the *current render reference space*.
        //
        // If the viewer is currently at `currentPosInRenderSpace` in the current render space,
        // and we want them to appear at `(0, 0, currentZ)` in the new space,
        // then the new space's origin should be at `(currentPos.x, currentPos.y, 0)` in the current space.
        //
        // For orientation: we want the viewer's orientation in the new space to be `initialOrientation`.
        // If the viewer's current orientation in the render space is `currentOri`,
        // and we want it to be `initialOri` in the new space,
        // then: currentOri * offsetOri.inverse() = initialOri
        // So: offsetOri = initialOri.inverse() * currentOri
        offsetPos = {
          x: currentPosInRenderSpace.x, // Shift X to make viewer's X=0
          y: currentPosInRenderSpace.y, // Shift Y to make viewer's Y=0 (align to floor)
          z: 0, // Don't shift Z - preserve current depth
        };

        // Orientation component: rotate so the viewer's orientation matches the initial orientation
        const currentQ = new THREE.Quaternion(currentOriInRenderSpace.x, currentOriInRenderSpace.y, currentOriInRenderSpace.z, currentOriInRenderSpace.w);
        const initialQ = new THREE.Quaternion(this.xrInitialViewerOrientation.x, this.xrInitialViewerOrientation.y, this.xrInitialViewerOrientation.z, this.xrInitialViewerOrientation.w);

        // We want: currentOri * offsetOri.inverse() = initialOri
        // So: offsetOri = initialOri.inverse() * currentOri
        const offsetQ = initialQ.clone().invert().multiply(currentQ);
        offsetOri = { x: offsetQ.x, y: offsetQ.y, z: offsetQ.z, w: offsetQ.w };

        console.log('[REORIENT_FIX] 🎯 RECENTER_XR: Computing transform to initial start position (app world X=0, Y=0, preserve Z):', {
          initialPosInAppWorld: this.xrInitialViewerPosition,
          initialOriInAppWorld: this.xrInitialViewerOrientation,
          currentPosInRenderSpace: { x: currentPosInRenderSpace.x, y: currentPosInRenderSpace.y, z: currentPosInRenderSpace.z },
          currentOriInRenderSpace: { x: currentOriInRenderSpace.x, y: currentOriInRenderSpace.y, z: currentOriInRenderSpace.z, w: currentOriInRenderSpace.w },
          calculatedOffsetPos: offsetPos,
          calculatedOffsetOri: offsetOri,
          desiredPosInNewSpace: { x: 0, y: 0, z: currentPosInRenderSpace.z },
        });
      } else {
        // Fallback: use current pose (shouldn't happen if autoCenterXROnce ran)
        offsetPos = { x: currentPosInRenderSpace.x, y: 0, z: 0 }; // X-only auto-center (same as autoCenterXROnce)
        offsetOri = { x: 0, y: 0, z: 0, w: 1 }; // Identity quaternion for orientation
        console.warn('[REORIENT_FIX] ⚠️ RECENTER_XR: No initial pose saved, falling back to X-only auto-center for recenter');
      }

      // Create a new offset reference space from the *current render reference space*
      console.log('[REORIENT_FIX] 🔧 RECENTER_XR: Creating offset reference space transform...', {
        offsetPos,
        offsetOri,
        currentRenderReferenceSpace: this.xrRenderReferenceSpace,
        baseReferenceSpace: this.xrBaseReferenceSpace
      });
      const transform = new XRRigidTransform(offsetPos, offsetOri);
      console.log('[REORIENT_FIX] 🔧 RECENTER_XR: XRRigidTransform created:', {
        position: transform.position,
        orientation: transform.orientation,
        matrix: transform.matrix
      });
      const offsetSpace = this.xrRenderReferenceSpace.getOffsetReferenceSpace(transform);
      console.log('[REORIENT_FIX] 🔧 RECENTER_XR: Offset reference space created:', {
        offsetSpace,
        isSameAsBase: offsetSpace === this.xrBaseReferenceSpace,
        isSameAsCurrent: offsetSpace === this.xrRenderReferenceSpace
      });

      this.xrRenderReferenceSpace = offsetSpace;
      this.xrReferenceSpace = offsetSpace; // keep legacy field consistent
      this.applyXRReferenceSpace(offsetSpace);
      console.log('[REORIENT_FIX] ✅ RECENTER_XR: Offset reference space created and applied');

      // Force a renderer update to ensure the new reference space is used in the next frame
      if (this.renderer && typeof this.renderer.setNeedsUpdate === 'function') {
        this.renderer.setNeedsUpdate(true);
        console.log('[REORIENT_FIX] ✅ RECENTER_XR: Renderer update forced after recenter');
      }

      // Verify the recenter worked by checking the viewer pose in the new reference space
      const verifyPose = frame.getViewerPose(offsetSpace);
      const verifyPos = verifyPose?.transform?.position;
      const verifyOri = verifyPose?.transform?.orientation;

      // Also check the viewer pose in the base space to see the actual physical position
      const basePose = frame.getViewerPose(this.xrBaseReferenceSpace);
      const basePos = basePose?.transform?.position;

      // Calculate orientation difference to verify recenter worked
      let orientationMatch = false;
      if (verifyOri && this.xrInitialViewerOrientation) {
        const verifyQ = new THREE.Quaternion(verifyOri.x, verifyOri.y, verifyOri.z, verifyOri.w);
        const initialQ = new THREE.Quaternion(this.xrInitialViewerOrientation.x, this.xrInitialViewerOrientation.y, this.xrInitialViewerOrientation.z, this.xrInitialViewerOrientation.w);
        const diffQ = verifyQ.clone().multiply(initialQ.clone().invert());
        const angleDiff = Math.abs(diffQ.angle());
        orientationMatch = angleDiff < 0.1; // Within ~6 degrees
      }

      const positionMatch = verifyPos ? (Math.abs(verifyPos.x) < 0.01 && Math.abs(verifyPos.y) < 0.01) : false;
      const reorientSuccess = positionMatch && orientationMatch;

      console.log('[REORIENT_FIX] 🎯 RECENTER_XR: Verification results:', {
        mode: this.xrMode,
        offsetPos,
        offsetOri,
        currentPosInRenderSpace: { x: currentPosInRenderSpace.x, y: currentPosInRenderSpace.y, z: currentPosInRenderSpace.z },
        currentOriInRenderSpace: { x: currentOriInRenderSpace.x, y: currentOriInRenderSpace.y, z: currentOriInRenderSpace.z, w: currentOriInRenderSpace.w },
        initialPosInAppWorld: this.xrInitialViewerPosition,
        initialOriInAppWorld: this.xrInitialViewerOrientation,
        verifyPosInOffsetSpace: verifyPos ? { x: verifyPos.x, y: verifyPos.y, z: verifyPos.z } : null,
        verifyOriInOffsetSpace: verifyOri ? { x: verifyOri.x, y: verifyOri.y, z: verifyOri.z, w: verifyOri.w } : null,
        expectedPosInOffsetSpace: { x: 0, y: 0, z: currentPosInRenderSpace.z }, // X=0, Y=0, preserve current Z
        expectedOriInOffsetSpace: this.xrInitialViewerOrientation,
        positionMatch: positionMatch,
        orientationMatch: orientationMatch,
        basePosAfterRecenter: basePos ? { x: basePos.x, y: basePos.y, z: basePos.z } : null,
      });

      if (reorientSuccess) {
        console.log('[REORIENT_FIX] ✅✅✅ RECENTER_XR: SUCCESS - Reorientation verified! Position and orientation match expected values.');
      } else {
        console.warn('[REORIENT_FIX] ⚠️ RECENTER_XR: PARTIAL - Reorientation applied but verification shows:', {
          positionMatch: positionMatch,
          orientationMatch: orientationMatch,
          verifyPos: verifyPos ? { x: verifyPos.x, y: verifyPos.y, z: verifyPos.z } : null,
          expectedPos: { x: 0, y: 0, z: currentPosInRenderSpace.z },
        });
      }

      this.verifyReferenceSpaceApplied(offsetSpace);

      console.log('[REORIENT_FIX] ✅ RECENTER_XR: Completed successfully');
      return true;
    } catch (e) {
      console.error('[REORIENT_FIX] ❌❌❌ RECENTER_XR: FAILED with error:', e?.message || e, e);
      return false;
    }
  }

  /**
   * Auto-center the XR reference space so the current viewer pose becomes centered on X.
   * This runs once per XR session on the first XR frame.
   *
   * Why: some runtimes start the user offset from the app's world origin (e.g. +2m on X),
   * which makes the user appear off-center relative to the floor grid.
   *
   * We preserve floor alignment by forcing Y=0, and we only correct X (not yaw, not Z).
   * 
   * Also saves the initial viewer position and orientation for later recentering.
   */
  autoCenterXROnce(frame) {
    // DISABLED: Auto-center functionality is disabled to preserve camera translation.
    // The base reference space is already set up correctly in enableVR/enableAR.
    // No offset reference space is created, allowing free camera movement.
    return false;
  }

  /**
   * Decide which gamepad buttons should trigger recenter on a long-press.
   * Galaxy XR varies by device/profile; this is intentionally permissive but avoids
   * common "trigger/select" buttons to reduce accidental recenter.
   */
  getXRRecenterButtonIndices(inputSource, gamepad) {
    const count = gamepad?.buttons?.length || 0;
    if (count <= 0) return [];

    const profiles = Array.isArray(inputSource?.profiles) ? inputSource.profiles : [];
    const profilesStr = profiles.join(' ').toLowerCase();
    const isHeadsetInput = inputSource?.handedness === 'none';
    const looksLikeTouchpad =
      profilesStr.includes('touchpad') ||
      profilesStr.includes('cardboard') ||
      profilesStr.includes('daydream') ||
      profilesStr.includes('gear') ||
      profilesStr.includes('oculus-go');

    // Heuristic: if there's only one button (common for headset touchpad), allow it.
    if (count === 1) return [0];

    // Grip long-press only — Menu / B / face buttons exit on press (see isXRSessionExitButton).
    const candidates = [];
    if (isHeadsetInput || looksLikeTouchpad) {
      if (count >= 1) candidates.push(0);
    } else if (count > 1) {
      candidates.push(1);
    }

    return Array.from(new Set(candidates)).filter((i) => i >= 0 && i < count);
  }

  _getActiveXRSession() {
    try {
      return this.renderer?.xr?.getSession?.() || this.xrSession || null;
    } catch {
      return this.xrSession || null;
    }
  }

  /** Galaxy XR / some runtimes expose inputSources without Array.prototype.map */
  _getXRInputSources(session = null) {
    const sess = session || this._getActiveXRSession() || this.xrSession;
    if (!sess?.inputSources) return [];
    try {
      return Array.from(sess.inputSources);
    } catch {
      return [];
    }
  }

  /** Galaxy XR hand tracking: pinch/select is button 4 on a 5-button gamepad — not Menu/B. */
  _isXRHandTrackingInputSource(inputSource) {
    if (!inputSource) return false;
    const profiles = Array.isArray(inputSource.profiles) ? inputSource.profiles : [];
    const p = profiles.join(' ').toLowerCase();
    return (
      p.includes('generic-hand') ||
      p.includes('hand-select') ||
      p.includes('generic-fixed-hand') ||
      p.includes('hand-tracking')
    );
  }

  /** Headset touchpad / system only — never hand-tracking profiles. */
  _isXRHeadsetSystemInputSource(inputSource) {
    if (!inputSource) return false;
    if (this._isXRHandTrackingInputSource(inputSource)) return false;
    if (inputSource.handedness === 'none') return true;
    const profiles = Array.isArray(inputSource.profiles) ? inputSource.profiles : [];
    const profilesStr = profiles.join(' ').toLowerCase();
    return (
      profilesStr.includes('touchpad') ||
      profilesStr.includes('cardboard') ||
      profilesStr.includes('daydream') ||
      profilesStr.includes('gear') ||
      profilesStr.includes('oculus-go')
    );
  }

  /**
   * Physical Menu / B (Quest-style indices 5–7). Not hand pinch (index 4 on 5-btn pads).
   */
  isXRSessionExitButton(inputSource, buttonIndex, button, buttonCount) {
    if (!button) return false;
    // Ignore touched/ghost axes — Galaxy XR reports touched on buttons 4–5 without a firm press.
    const active = !!(
      button.pressed ||
      (typeof button.value === 'number' && button.value > 0.85)
    );
    if (!active) return false;

    if (inputSource && this._isXRHandTrackingInputSource(inputSource)) {
      return false;
    }

    const handedness = inputSource?.handedness;
    const isHeadsetInput = handedness === 'none';

    const isQuestMenuOrB =
      buttonIndex === 5 ||
      buttonIndex === 6 ||
      buttonIndex === 7 ||
      (buttonCount >= 8 && buttonIndex === buttonCount - 1);

    if (!inputSource) {
      if (buttonIndex === 0 || buttonIndex === 1) return false;
      if (this._xrNoWebXrInputSources) {
        return buttonIndex === 5 || buttonIndex === 6 || buttonIndex === 7;
      }
      return isQuestMenuOrB;
    }

    if (handedness === 'left' || handedness === 'right') {
      if (buttonIndex === 0 || buttonIndex === 1) return false;
      return isQuestMenuOrB;
    }
    if (isHeadsetInput || this._isXRHeadsetSystemInputSource(inputSource)) return true;
    return false;
  }

  isXRSystemExitInputSource(inputSource) {
    return this._isXRHeadsetSystemInputSource(inputSource);
  }

  _xrExitPadKey(gamepad, inputSource) {
    const idx = typeof gamepad?.index === 'number' ? gamepad.index : 'na';
    const hand = inputSource?.handedness ?? 'nav';
    return `${idx}:${hand}`;
  }

  _pollGamepadForExitPress(gamepad, inputSource, time) {
    if (!gamepad?.buttons?.length) return false;
    const padKey = this._xrExitPadKey(gamepad, inputSource);
    let prevMap = this._xrExitPrevPressed.get(padKey);
    if (!prevMap) {
      prevMap = new Map();
      this._xrExitPrevPressed.set(padKey, prevMap);
    }

    for (let i = 0; i < gamepad.buttons.length; i += 1) {
      const btn = gamepad.buttons[i];
      const active = !!(
        btn.pressed ||
        (typeof btn.value === 'number' && btn.value > 0.85)
      );
      const wasActive = prevMap.get(i) || false;
      prevMap.set(i, active);
      if (active && !wasActive) {
        const isExit = this.isXRSessionExitButton(
          inputSource,
          i,
          btn,
          gamepad.buttons.length,
        );
        if (this.xrDebugInputs) {
          console.info('[XR] Gamepad button down:', {
            buttonIndex: i,
            gamepadIndex: gamepad.index,
            handedness: inputSource?.handedness,
            countsAsExit: isExit,
            noWebXrInputSources: this._xrNoWebXrInputSources,
          });
        }
        if (!isExit) continue;
        this.requestXRSessionExit('gamepad-press', {
          handedness: inputSource?.handedness,
          buttonIndex: i,
          gamepadIndex: gamepad.index,
          profiles: inputSource?.profiles,
        });
        return true;
      }
    }
    return false;
  }

  requestXRSessionExit(reason, meta = {}) {
    const session = this._getActiveXRSession();
    if (!session || this._xrExitInFlight) return;
    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    if (now < (this._xrExitCooldownUntil || 0)) return;

    this._xrExitInFlight = true;
    this._xrExitCooldownUntil = now + 800;
    console.info('[XR] Ending session:', reason, meta);
    Promise.resolve(session.end())
      .catch((e) => {
        console.warn('[XR] session.end() failed:', e?.message || e);
      })
      .finally(() => {
        this._xrExitInFlight = false;
      });
  }

  _logNavigatorGamepadsDiagnostic(time) {
    if (!this.xrDebugInputs || time - (this._xrNavGamepadDiagAt || 0) < 1000) return;
    this._xrNavGamepadDiagAt = time;
    const pads =
      typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
        ? navigator.getGamepads()
        : [];
    const summary = [];
    for (let i = 0; i < pads.length; i += 1) {
      const gp = pads[i];
      if (!gp) continue;
      const pressed = [];
      if (gp.buttons?.length) {
        for (let b = 0; b < gp.buttons.length; b += 1) {
          const btn = gp.buttons[b];
          if (btn?.pressed || btn?.touched || (btn?.value ?? 0) > 0.1) {
            pressed.push({ i: b, v: btn.value, p: !!btn.pressed, t: !!btn.touched });
          }
        }
      }
      summary.push({
        slot: i,
        connected: !!gp.connected,
        id: gp.id || '',
        buttons: gp.buttons?.length || 0,
        pressed,
      });
    }
    console.log('🔍 XR navigator.getGamepads() (1/sec):', summary);
  }

  /**
   * Head-locked exit panel when controllers are not exposed via WebXR (common on Galaxy XR).
   * Look at the red panel lower-right and hold gaze ~2s to exit.
   */
  createVRExitHud() {
    this.removeVRExitHud();
    if (!this.xrGazeExitEnabled || !this.camera) return;

    const geo = new THREE.PlaneGeometry(0.24, 0.09);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8b2020,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'VRExitHud';
    mesh.position.set(0.32, -0.2, -0.5);
    mesh.renderOrder = 10000;
    this.camera.add(mesh);
    this.vrExitHud = mesh;
    this._xrGazeExitDwellStart = 0;
    this._xrGazeExitHintLogged = false;
    console.info('[XR] Exit HUD: look at the red panel (lower-right) for 2s to leave VR');
  }

  removeVRExitHud() {
    if (this.vrExitHud && this.camera) {
      this.camera.remove(this.vrExitHud);
      this.vrExitHud.geometry?.dispose();
      this.vrExitHud.material?.dispose();
    }
    this.vrExitHud = null;
    this._xrGazeExitDwellStart = 0;
    this._xrGazeExitHintLogged = false;
  }

  maybeHandleXRGazeExit(time) {
    if (!this.vrExitHud || !this.camera) return;

    this.camera.getWorldDirection(this._xrGazeExitCamDir);
    this.vrExitHud.getWorldPosition(this._xrGazeExitVec);
    this._xrGazeExitVec.sub(this.camera.position).normalize();
    const dot = this._xrGazeExitCamDir.dot(this._xrGazeExitVec);
    const GAZE_THRESHOLD = 0.9;
    const DWELL_MS = 2000;

    if (dot >= GAZE_THRESHOLD) {
      if (!this._xrGazeExitDwellStart) {
        this._xrGazeExitDwellStart = time;
        if (!this._xrGazeExitHintLogged) {
          this._xrGazeExitHintLogged = true;
          console.info('[XR] Gaze on Exit panel — hold 2s to leave VR');
        }
      } else if (time - this._xrGazeExitDwellStart >= DWELL_MS) {
        this.requestXRSessionExit('gaze-dwell-exit', { dot: Number(dot.toFixed(3)) });
      }
    } else {
      this._xrGazeExitDwellStart = 0;
    }
  }

  /** Exit on Menu / B press (rising edge); opt-in via ?xrMenuExit=1 only. */
  maybeHandleXRControllerExit(time) {
    if (!this.xrMenuExitEnabled || !this._getActiveXRSession()) return;

    this._logNavigatorGamepadsDiagnostic(time);

    const session = this._getActiveXRSession();
    const sources = this._getXRInputSources(session);
    for (const src of sources) {
      if (src?.gamepad && this._pollGamepadForExitPress(src.gamepad, src, time)) return;
    }

    const pads =
      typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
        ? navigator.getGamepads()
        : [];
    for (const gp of pads) {
      if (gp?.connected && this._pollGamepadForExitPress(gp, null, time)) return;
    }
  }

  /**
   * Poll XR input sources for long-press recenter gestures.
   */
  maybeHandleXRRecenter(time, frame) {
    // Always log entry (first time only, then throttled) to verify function is being called
    if (!this.xrRecenterCheckFirstLog) {
      this.xrRecenterCheckFirstLog = true;
      console.log('[REORIENT_FIX] 🔍 RECENTER_CHECK: Function called (first time)');
    }
    
    if (!this.xrSession || !frame) {
      if (!this.xrSession) console.warn('[REORIENT_FIX] ⚠️ RECENTER_CHECK: No XR session');
      if (!frame) console.warn('[REORIENT_FIX] ⚠️ RECENTER_CHECK: No frame');
      return;
    }
    if (time < (this.xrRecenterCooldownUntil || 0)) {
      const remaining = ((this.xrRecenterCooldownUntil || 0) - time).toFixed(0);
      // Only log cooldown once per cooldown period to avoid spam
      if (!this.xrRecenterCooldownLogged) {
        this.xrRecenterCooldownLogged = true;
        console.log(`[REORIENT_FIX] ⏭️ RECENTER_CHECK: On cooldown (${remaining}ms remaining)`);
        setTimeout(() => { this.xrRecenterCooldownLogged = false; }, 100);
      }
      return;
    } else {
      this.xrRecenterCooldownLogged = false;
    }

    const holdMs = 900; // long-press threshold
    const sources = this._getXRInputSources(this.xrSession);
    
    // Log when function is called (throttled to avoid spam, but always log when there's activity)
    const shouldLogCheck = time - this.xrLastRecenterCheckLog >= 500; // Log every 500ms max
    if (shouldLogCheck && sources.length > 0) {
      this.xrLastRecenterCheckLog = time;
      // Check if there are active holds by checking each input source
      // (We can't iterate WeakMaps, so we check sources directly)
      let hasActiveHolds = false;
      for (const src of sources) {
        const stableKey = src?.targetRaySpace || src;
        if (this.xrRecenterSelectHoldState.has(stableKey)) {
          hasActiveHolds = true;
          break;
        }
        const byButton = this.xrRecenterHoldState.get(stableKey);
        if (byButton && byButton.size > 0) {
          hasActiveHolds = true;
          break;
        }
      }
      if (hasActiveHolds) {
        console.log(`[REORIENT_FIX] 🔍 RECENTER_CHECK: Checking ${sources.length} input source(s) for long-press...`);
      }
    }

    // Low-noise diagnostic logging (throttled to once per second, dev-gated)
    if (this.xrDebugInputs && time - this.xrLastDiagnosticLog >= 1000) {
      this.xrLastDiagnosticLog = time;
      this._logNavigatorGamepadsDiagnostic(time);
      const diagnostic = sources.map((src, idx) => {
        const gp = src?.gamepad;
        const buttonStates = gp?.buttons ? Array.from(gp.buttons).map((btn, i) => ({
          idx: i,
          pressed: !!btn?.pressed,
          touched: typeof btn?.touched === 'boolean' ? !!btn.touched : null,
          value: typeof btn?.value === 'number' ? btn.value : null
        })) : [];
        return {
          index: idx,
          handedness: src?.handedness || 'unknown',
          profiles: Array.isArray(src?.profiles) ? src.profiles : [],
          hasGamepad: !!gp,
          buttonCount: gp?.buttons?.length || 0,
          buttons: buttonStates.filter(b => b.pressed || b.touched || b.value > 0)
        };
      });
      console.log('🔍 XR Input Diagnostics (throttled 1/sec):', diagnostic);
    }

    for (const src of sources) {
      // Use stable XRSpace (targetRaySpace) as key instead of XRInputSource object ref
      // This ensures tracking persists even if session.inputSources yields different object instances
      const stableKey = src?.targetRaySpace || src;

      // Some runtimes don't expose a gamepad for headset touchpads / system inputs, but they do emit
      // selectstart/selectend events. We track those holds in `xrRecenterSelectHoldState` and trigger
      // a software recenter from the render loop where we have access to `frame`.
      const selectHold = this.xrRecenterSelectHoldState.get(stableKey);
      if (selectHold) {
        const holdDuration = time - selectHold.downAt;
        const isLongPress = holdDuration >= holdMs;
        if (!selectHold.triggered) {
          if (isLongPress) {
            selectHold.triggered = true;
            console.log('[REORIENT_FIX] 🕹️ XR recenter long-press detected (select):', {
              handedness: src?.handedness,
              profiles: src?.profiles,
              holdDuration: holdDuration.toFixed(0) + 'ms',
              threshold: holdMs + 'ms'
            });
            console.log('[REORIENT_FIX] 🎯 TRIGGER: Calling recenterXR() from select long-press...');
            const ok = this.recenterXR(frame);
            this.xrRecenterCooldownUntil = time + 1500;
            if (ok) {
              console.log('[REORIENT_FIX] ✅ TRIGGER: recenterXR() returned success');
              return;
            } else {
              console.warn('[REORIENT_FIX] ❌ TRIGGER: recenterXR() returned failure');
            }
          } else {
            // Log progress towards long-press threshold (throttled)
            if (holdDuration % 200 < 16) { // Log roughly every 200ms
              console.log(`[REORIENT_FIX] ⏳ SELECT_HOLD: ${holdDuration.toFixed(0)}ms / ${holdMs}ms (${((holdDuration / holdMs) * 100).toFixed(0)}%)`);
            }
          }
        }
      }

      const gp = src?.gamepad;
      if (!gp || !gp.buttons) continue;

      const indices = this.getXRRecenterButtonIndices(src, gp);
      if (indices.length === 0) continue;

      const profiles = Array.isArray(src?.profiles) ? src.profiles : [];
      const profilesStr = profiles.join(' ').toLowerCase();
      const isHeadsetInput = src?.handedness === 'none';
      const allowTouchedGesture =
        isHeadsetInput ||
        profilesStr.includes('touchpad') ||
        profilesStr.includes('cardboard') ||
        profilesStr.includes('daydream') ||
        profilesStr.includes('gear') ||
        profilesStr.includes('oculus-go');

      let byButton = this.xrRecenterHoldState.get(stableKey);
      if (!byButton) {
        byButton = new Map();
        this.xrRecenterHoldState.set(stableKey, byButton);
      }

      for (const idx of indices) {
        const btn = gp.buttons[idx];
        if (!btn) continue;

        // Some runtimes expose "touch-and-hold" via GamepadButton.touched even when pressed is never true.
        const pressed = !!btn.pressed;
        const touched = allowTouchedGesture && typeof btn.touched === 'boolean' ? !!btn.touched : false;
        const active = pressed || touched;
        const existing = byButton.get(idx);

        if (!active) {
          if (existing) byButton.delete(idx);
          continue;
        }

        if (!existing) {
          byButton.set(idx, { downAt: time, triggered: false });
          continue;
        }

        const holdDuration = time - existing.downAt;
        const isLongPress = holdDuration >= holdMs;
        if (!existing.triggered) {
          if (isLongPress) {
            existing.triggered = true;

            console.log('[REORIENT_FIX] 🕹️ XR recenter long-press detected:', {
              handedness: src.handedness,
              profiles: src.profiles,
              buttonIndex: idx,
              holdDuration: holdDuration.toFixed(0) + 'ms',
              threshold: holdMs + 'ms'
            });
            console.log('[REORIENT_FIX] 🎯 TRIGGER: Calling recenterXR() from gamepad button long-press...');

            const ok = this.recenterXR(frame);
            // Cooldown to prevent repeated triggers while holding
            this.xrRecenterCooldownUntil = time + 1500;
            if (ok) {
              console.log('[REORIENT_FIX] ✅ TRIGGER: recenterXR() returned success');
              return;
            } else {
              console.warn('[REORIENT_FIX] ❌ TRIGGER: recenterXR() returned failure');
            }
          } else {
            // Log progress towards long-press threshold (throttled)
            if (holdDuration % 200 < 16) { // Log roughly every 200ms
              console.log(`[REORIENT_FIX] ⏳ BUTTON_HOLD: Button ${idx} - ${holdDuration.toFixed(0)}ms / ${holdMs}ms (${((holdDuration / holdMs) * 100).toFixed(0)}%)`);
            }
          }
        }
      }
    }
  }

  /**
   * Check WebGL support and capabilities
   */
  checkWebGLSupport() {
    const canvas = document.createElement('canvas');
    let gl = null;
    let contextType = null;
    
    // Try different WebGL context types
    const contextTypes = [
      { name: 'webgl2', getContext: () => canvas.getContext('webgl2') },
      { name: 'webgl', getContext: () => canvas.getContext('webgl') },
      { name: 'experimental-webgl', getContext: () => canvas.getContext('experimental-webgl') }
    ];
    
    for (const context of contextTypes) {
      try {
        gl = context.getContext();
        if (gl) {
          contextType = context.name;
          break;
        }
      } catch (e) {
        console.warn(`Failed to get ${context.name} context:`, e);
      }
    }
    
    if (!gl) {
      return {
        supported: false,
        reason: 'WebGL not supported',
        fallback: 'Software rendering',
        recommendations: [
          'Update your browser to the latest version',
          'Update your graphics drivers',
          'Enable hardware acceleration in browser settings',
          'Try a different browser (Chrome, Firefox, Edge)',
          'Check if WebGL is disabled in browser settings'
        ]
      };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';

    // Check for specific problematic configurations
    const isSandboxed = vendor.includes('Disabled') || renderer.includes('Disabled');
    const isVirtualMachine = vendor.includes('VMware') || vendor.includes('VirtualBox');
    const isSoftwareRenderer = renderer.includes('Software') || renderer.includes('Mesa');
    
    // Test basic WebGL functionality
    let functionalityTest = 'unknown';
    try {
      const testProgram = gl.createProgram();
      gl.deleteProgram(testProgram);
      functionalityTest = 'basic';
    } catch (e) {
      functionalityTest = 'limited';
    }
    
    return {
      supported: true,
      contextType,
      vendor,
      renderer,
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
      isSandboxed,
      isVirtualMachine,
      isSoftwareRenderer,
      functionalityTest,
      recommendations: isSandboxed ? [
        'WebGL is disabled in your browser',
        'Enable hardware acceleration',
        'Disable browser security restrictions',
        'Try running in a different browser profile'
      ] : isVirtualMachine ? [
        'Running in virtual machine may limit WebGL performance',
        'Enable 3D acceleration in VM settings',
        'Update VM graphics drivers'
      ] : []
    };
  }

  /**
   * Initialize the 3D scene
   * @param {HTMLElement} container - Container element for the scene
   * @param {Object} options - Scene configuration options
   */
  async initialize(container, options = {}) {
    const initId = ++this._initGeneration;
    const stale = () => initId !== this._initGeneration;

    try {
      this.sceneHostElement = container;

      const {
        width = container.clientWidth,
        height = container.clientHeight,
        backgroundColor = SKY_FALLBACK_COLOR,
        enableShadows = true,
        enableAntialias = true
      } = options;

      // Create scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(backgroundColor);
      ensureSceneRoots(this);

      // Create camera
      this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      this.camera.position.set(0, 2.5, 2.5); // Position camera back and up for better view

      // Check WebGL support
      const webglSupport = this.checkWebGLSupport();
      console.log('🔍 WebGL Support Check:', webglSupport);

      // WebGPU is opt-in: GridHelper and legacy GLTF materials use ShaderMaterial paths
      // that break the viewport on WebGPURenderer (see remote-log NodeMaterial errors).
      const preferWebGPU =
        options.preferWebGPU ??
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PREFER_WEBGPU === '1');

      // Create renderer — try WebGPU first, then WebGL fallbacks
      let renderer;
      let webgpuBootstrap = null;
      if (preferWebGPU) {
        webgpuBootstrap = await createViewportRenderer({
          width,
          height,
          enableAntialias,
          enableShadows,
        });
      }
      if (webgpuBootstrap?.renderer) {
        renderer = webgpuBootstrap.renderer;
        this.rendererType = webgpuBootstrap.type;
        this.webgpuSupport = webgpuBootstrap.webgpuSupport;
        console.log(`✅ Using ${this.rendererType} viewport renderer`);
      }

      if (stale()) return;

      const rendererConfigs = [
        // High-performance configuration
        {
          name: 'High Performance',
          config: {
            antialias: enableAntialias,
            alpha: true,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: true
          }
        },
        // Balanced configuration
        {
          name: 'Balanced',
          config: {
            antialias: false,
            alpha: true,
            powerPreference: "default",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: true
          }
        },
        // Low-power configuration
        {
          name: 'Low Power',
          config: {
            antialias: false,
            alpha: true,
            powerPreference: "low-power",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: true
          }
        },
        // Minimal configuration
        {
          name: 'Minimal',
          config: {
            antialias: false,
            // Keep alpha enabled so AR pass-through can be transparent even on fallback configs.
            // If alpha is disabled at renderer creation time, AR cannot be transparent later.
            alpha: true,
            powerPreference: "low-power",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: false,
            depth: true,
            stencil: false
          }
        },
        // Ultra-minimal configuration
        {
          name: 'Ultra Minimal',
          config: {
            antialias: false,
            // Keep alpha enabled for AR pass-through (see note above).
            alpha: true,
            powerPreference: "low-power",
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: false,
            depth: false,
            stencil: false
          }
        }
      ];

      let lastError = null;
      if (!renderer) {
        for (const rendererConfig of rendererConfigs) {
          try {
            console.log(`🔄 Trying ${rendererConfig.name} WebGL configuration...`);
            renderer = new THREE.WebGLRenderer(rendererConfig.config);
            this.rendererType = 'webgl';
            console.log(`✅ ${rendererConfig.name} WebGL renderer created successfully`);
            break;
          } catch (error) {
            console.warn(`⚠️ ${rendererConfig.name} WebGL failed:`, error.message);
            lastError = error;
            continue;
          }
        }
      }

      if (!renderer) {
        console.error('❌ All WebGL configurations failed, trying software renderer...');
        
        // Try software rendering as last resort
        if (isSoftwareRenderingSupported()) {
          try {
            console.log('🔄 Attempting software rendering fallback...');
            renderer = createSoftwareRenderer(container, {
              backgroundColor: '#1a1a1a',
              showGrid: true,
              showAxes: true
            });
            console.log('✅ Software renderer created as fallback');
            this.isSoftwareRenderer = true;
            this.rendererType = 'software';
          } catch (softwareError) {
            console.error('❌ Even software rendering failed:', softwareError);
            throw new Error(`WebGL is not supported on this system. Last error: ${lastError?.message}. Please try: 1) Updating your browser, 2) Updating graphics drivers, 3) Enabling hardware acceleration, 4) Using a different browser.`);
          }
        } else {
          throw new Error(`WebGL is not supported on this system. Last error: ${lastError?.message}. Please try: 1) Updating your browser, 2) Updating graphics drivers, 3) Enabling hardware acceleration, 4) Using a different browser.`);
        }
      }
      
      this.renderer = renderer;
      if (typeof window !== 'undefined') {
        window.__characterStudioWebXrRenderer = renderer;
      }
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
      
      // Match sky fallback until the equirectangular JPG is ready (avoids black/dark flash)
      this.renderer.setClearColor(SKY_FALLBACK_COLOR, 1.0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      
      // Enable WebXR support
      if (this.renderer.xr) {
        this.renderer.xr.enabled = true;
        // Store original clear color for AR pass-through restoration
        this.originalClearColor = new THREE.Color();
        this.renderer.getClearColor(this.originalClearColor);
        this.originalClearAlpha = this.renderer.getClearAlpha();
        console.log('✅ WebXR enabled on renderer');
        console.log('✅ Renderer clear color initialized:', {
          color: this.originalClearColor.getHexString(),
          alpha: this.originalClearAlpha
        });
      }
      
      if (enableShadows) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      if (stale()) return;
      if (!this.camera) {
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 2.5, 2.5);
      }

      // Create enhanced controls with better UX
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.enableZoom = true;
      this.controls.enableRotate = true;
      this.controls.enablePan = true;
      this.controls.autoRotate = false;
      this.controls.autoRotateSpeed = 2.0;
      this.controls.minDistance = 0.5;
      this.controls.maxDistance = 50;
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = Math.PI;
      this.controls.target.set(0, 1, 0); // Look at human height

      // Setup lighting (soft preset is the app default)
      this.lights = { ambient: [], directional: [], point: [], hemisphere: [] };
      this.setLighting('soft');

      // Setup sky background before first frame (no dark → bright flash)
      await this.setupHDREnvironment();
      if (stale()) return;

      // Ground plane removed - user doesn't want it

      // Add helpers
      this.addHelpers();

      // Mount renderer
      try {
        container.appendChild(this.renderer.domElement);
        console.log('✅ SceneManager: Renderer DOM element added to container');
      } catch (error) {
        console.error('❌ SceneManager: Failed to add renderer to container:', error);
        throw new Error(`Failed to add renderer to container: ${error.message}`);
      }

      // Setup WebGL context loss recovery
      this.setupWebGLContextRecovery();

      // Setup resize handler
      this.setupResizeHandler();

      this.setupWebViewSurvivalHooks();

      this.isInitialized = true;
      try {
        ensureSparkRenderer(this);
        console.log('✅ SparkRenderer attached for Gaussian splat support');
      } catch (sparkError) {
        console.warn('SparkRenderer init skipped:', sparkError?.message || sparkError);
      }
      console.log('✅ SceneManager: Scene initialized successfully');
      console.log('✅ SceneManager: Scene details:', {
        scene: !!this.scene,
        camera: !!this.camera,
        renderer: !!this.renderer,
        controls: !!this.controls,
        container: container.tagName,
        dimensions: { width, height }
      });
      
      this.emit('initialized', { scene: this.scene, camera: this.camera, renderer: this.renderer });

      // WebView / mobile: layout may report 0×0 on first paint; refit on the next frames after mount.
      if (typeof window !== 'undefined') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              this.forceRendererRefit();
            } catch (_) {
              /* ignore */
            }
          });
        });
      }

      return {
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
        controls: this.controls,
        rendererType: this.rendererType,
      };
    } catch (error) {
      console.error('❌ SceneManager: Failed to initialize scene:', error);
      console.error('❌ SceneManager: Error details:', {
        message: error.message,
        stack: error.stack,
        container: container,
        options: options
      });
      throw error;
    }
  }

  /**
   * Setup scene lighting with enhanced professional lighting setup
   */
  setupLighting() {
    // Store lights for dynamic control
    this.lights = {
      ambient: [],
      directional: [],
      point: [],
      hemisphere: []
    };

    // Enhanced Ambient light - much brighter overall illumination
    const ambientLight = new THREE.AmbientLight(0x606060, 1.2);
    ambientLight.name = 'mainAmbient';
    this.scene.add(ambientLight);
    this.lights.ambient.push(ambientLight);

    // Additional soft ambient light for extra brightness
    const softAmbientLight = new THREE.AmbientLight(0x808080, 0.6);
    softAmbientLight.name = 'softAmbient';
    this.scene.add(softAmbientLight);
    this.lights.ambient.push(softAmbientLight);

    // Professional 3-Point Lighting Setup with enhanced shadows
    
    // 1. Key Light (Main light) - Front and slightly to the right
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.name = 'keyLight';
    keyLight.position.set(5, 8, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 4096; // Increased shadow resolution
    keyLight.shadow.mapSize.height = 4096;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0001; // Reduce shadow acne
    this.scene.add(keyLight);
    this.lights.directional.push(keyLight);

    // 2. Fill Light (Softer light) - Front and slightly to the left
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.name = 'fillLight';
    fillLight.position.set(-3, 5, 2);
    this.scene.add(fillLight);
    this.lights.directional.push(fillLight);

    // 3. Rim Light (Back light) - Behind the model
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
    rimLight.name = 'rimLight';
    rimLight.position.set(-2, 3, -5);
    this.scene.add(rimLight);
    this.lights.directional.push(rimLight);

    // Additional accent light for better illumination
    const accentLight = new THREE.PointLight(0xffffff, 0.7, 20);
    accentLight.name = 'accentLight';
    accentLight.position.set(0, 10, 0);
    accentLight.castShadow = true;
    accentLight.shadow.mapSize.width = 2048;
    accentLight.shadow.mapSize.height = 2048;
    this.scene.add(accentLight);
    this.lights.point.push(accentLight);

    // Soft hemisphere light for natural ambient lighting
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x362d1d, 0.8);
    hemisphereLight.name = 'hemisphereLight';
    hemisphereLight.position.set(0, 10, 0);
    this.scene.add(hemisphereLight);
    this.lights.hemisphere.push(hemisphereLight);

    // Add subtle rim lighting for better model definition
    const rimLight2 = new THREE.DirectionalLight(0x4a90e2, 0.6);
    rimLight2.name = 'rimLight2';
    rimLight2.position.set(2, 2, -3);
    this.scene.add(rimLight2);
    this.lights.directional.push(rimLight2);
  }

  /**
   * Load and apply the sky background (await during scene init so first frame is correct).
   */
  async setupHDREnvironment() {
    if (!this.scene) return;

    console.log(`📸 Loading sky background texture from ${SKY_BACKGROUND_URL}`);
    try {
      const texture = await loadSkyBackgroundTexture();
      this.applySkyBackgroundTexture(texture);
    } catch (error) {
      console.error('❌ Failed to load sky background image:', error);
      console.log('⚠️ Keeping sky fallback color background due to texture load failure');
    }
  }

  /**
   * Apply a configured equirectangular sky texture to the scene (respects AR pass-through).
   * @param {THREE.Texture} texture
   */
  applySkyBackgroundTexture(texture) {
    if (!this.scene || !texture) return;

    this.configureSceneBackgroundTexture(texture);
    this.originalSceneBackground = this.originalSceneBackground ?? texture;

    const isPresenting = !!this.renderer?.xr?.isPresenting;
    const blendMode = this.xrSession?.environmentBlendMode;
    const isARByBlend =
      blendMode === 'alpha-blend' || blendMode === 'additive' || this.xrSession?.mode === 'immersive-ar';
    const isARByModeFlag = this.xrMode === 'ar';
    const isTransparentClear =
      typeof this.renderer?.getClearAlpha === 'function' ? this.renderer.getClearAlpha() === 0 : false;
    const shouldSuppressBackground = isPresenting && (isARByBlend || isARByModeFlag || isTransparentClear);

    if (shouldSuppressBackground) {
      this.scene.background = null;
      this.scene.environment = texture;
      console.log('📱 AR active: sky texture loaded, background suppressed (pass-through).');
    } else {
      this.scene.background = texture;
    }

    console.log('✅ Sky background texture loaded and set:', texture);
  }

  /**
   * Normalize the sky texture settings for use as `scene.background` in the normal 3D viewer.
   * Some XR paths use a separate UV-mapped skybox mesh; that must not leak into the viewer background.
   */
  configureSceneBackgroundTexture(texture) {
    if (!texture || !(texture instanceof THREE.Texture)) return;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
  }

  /**
   * Load a custom HDR environment map
   * @param {string} hdrPath - Path to the HDR file
   * @param {number} intensity - Environment intensity (default: 0.5)
   */
  loadHDREnvironment(hdrPath, intensity = 0.5) {
    if (!this.scene) {
      console.error('Scene not initialized. Call initialize() first.');
      return;
    }

    const hdrLoader = new HDRLoader();

    hdrLoader.load(hdrPath, (hdrTexture) => {
      // Configure the HDR texture
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
      hdrTexture.colorSpace = THREE.LinearSRGBColorSpace;
      
      // Set as scene environment
      this.scene.environment = hdrTexture;
      this.scene.environmentIntensity = intensity;
      
      console.log(`HDR environment map loaded: ${hdrPath}`);
      this.emit('environmentChanged', { path: hdrPath, intensity });
    }, undefined, (error) => {
      console.error(`Failed to load HDR environment map: ${hdrPath}`, error);
    });
  }

  /**
   * Add scene helpers (grid, axes)
   */
  addGroundPlane() {
    // Remove the ground plane - user doesn't want it
    // The existing grid helper is sufficient
  }

  addHelpers() {
    if (this.rendererType === 'webgpu') {
      console.log(
        '[Viewport] Skipping grid/axes helpers on WebGPU (ShaderMaterial is not compatible)',
      );
      return;
    }

    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x444444);
    gridHelper.name = 'viewportGridHelper';
    this.scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(2);
    axesHelper.name = 'viewportAxesHelper';
    this.scene.add(axesHelper);
  }

  /**
   * Stop mic capture and tear down {@link sceneLipSync} (safe to call when idle).
   */
  async _disposeSceneLipSync() {
    if (this._sceneLipSyncStream) {
      this._sceneLipSyncStream.getTracks().forEach((t) => t.stop());
      this._sceneLipSyncStream = null;
    }
    if (this.sceneLipSync) {
      try {
        await this.sceneLipSync.destroy();
      } catch (_) {
        /* noop */
      }
      this.sceneLipSync = null;
    }
  }

  /** Suspend mic lip-sync on the loaded studio VRM (webcam face tracking takes over). */
  setSceneLipSyncSuspended(suspended) {
    this.sceneLipSync?.setSuspended(suspended);
  }

  /**
   * Request microphone access and drive the current VRM mouth visemes from audio (FFT path in {@link LipSync}).
   */
  async _attachSceneLipSyncMicrophone() {
    if (!this.currentVRM?.expressionManager) return;
    await this._disposeSceneLipSync();
    this.sceneLipSync = new LipSync(this.currentVRM);
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        console.warn('[SceneManager] getUserMedia not available; lip sync disabled.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      this._sceneLipSyncStream = stream;
      this.sceneLipSync.start(stream);
    } catch (e) {
      console.warn('[SceneManager] Microphone unavailable for lip sync:', e?.message || e);
      await this._disposeSceneLipSync();
    }
  }

  /**
   * Load a 3D model
   * @param {File|string} source - File object or URL
   * @param {Object} options - Loading options
   */
  async loadWorldPackage(manifest, manifestUrl, options = {}) {
    const loaded = await loadWorldPackageIntoScene(this, manifest, manifestUrl, options);
    this._ensureXrInteraction().syncGrabbablesFromScene();
    this._applyXrFloorAlignmentIfActive();
    return loaded;
  }

  /** Re-anchor VR/AR wrapper when world content loads mid-session. */
  _applyXrFloorAlignmentIfActive() {
    if (!this.xrSession || !this.vrSceneWrapper) return;
    const floorAlignmentY = computeXrFloorAlignmentY(this);
    this.vrSceneWrapper.position.y = floorAlignmentY;
    if (this.vrSceneWrapper.userData?.anchorPosition) {
      this.vrSceneWrapper.userData.anchorPosition.y = floorAlignmentY;
    }
    this.vrSceneWrapper.updateMatrixWorld(true);
    console.log('[XR] Re-applied floor alignment after world load:', floorAlignmentY);
    if (this.renderMode === 'skeleton') {
      this.createBoneVisualization();
    }
  }

  async loadWorldFromManifestUrl(manifestUrl, options = {}) {
    const { fetchWorldPackage } = await import('./worldPackage.js');
    const apiEndpoint = options.apiEndpoint || '';
    const manifest = await fetchWorldPackage(manifestUrl, apiEndpoint);
    return this.loadWorldPackage(manifest, manifestUrl, options);
  }

  async loadWorldFromTaskResult(taskResult, apiEndpoint = '') {
    const loadToken = this._beginViewportLoad();
    const { fetchWorldPackage, getWorldManifestUrlFromTaskResult } = await import(
      './worldPackage.js'
    );
    const { resolveTaskModelUrl } = await import('./taskModelUrl.js');
    const manifestPath = getWorldManifestUrlFromTaskResult(taskResult);
    if (!manifestPath) {
      throw new Error('Task result has no world manifest URL');
    }
    const manifestUrl = resolveTaskModelUrl(manifestPath, apiEndpoint);
    const worldBaseUrl =
      taskResult.world_base_url || taskResult.result?.world_base_url || null;
    console.log('[World] Loading from task result:', {
      jobId: taskResult.job_id || taskResult.jobId,
      manifestUrl,
      worldBaseUrl,
    });
    const manifest = await fetchWorldPackage(manifestUrl, apiEndpoint);
    if (this._isViewportLoadStale(loadToken)) {
      console.log('SceneManager: Discarding superseded world load (newer request started)');
      return null;
    }
    const loaded = await this.loadWorldPackage(manifest, manifestUrl, {
      apiEndpoint,
      worldBaseUrl: worldBaseUrl
        ? resolveTaskModelUrl(worldBaseUrl, apiEndpoint)
        : undefined,
      loadToken,
    });
    if (this._isViewportLoadStale(loadToken)) {
      console.log('SceneManager: Discarding superseded world package (newer request started)');
      return null;
    }
    console.log('[World] Loaded into viewport:', loaded?.id);
    return loaded;
  }

  async loadWorldEnvironment(url, options = {}) {
    if (options.replaceWorld !== false) {
      clearWorldLayers(this);
    }
    const splat = await loadWorldEnvironmentSplat(this, url, options);
    this._ensureXrInteraction().syncGrabbablesFromScene();
    this._applyXrFloorAlignmentIfActive();
    return splat;
  }

  _ensureXrInteraction() {
    if (!this.xrInteraction) {
      this.xrInteraction = createSceneManagerXrInteraction(this);
    }
    return this.xrInteraction;
  }

  clearWorld() {
    clearWorldLayers(this);
  }

  _getPlayerParent() {
    ensureSceneRoots(this);
    return this.playerRoot || this.scene;
  }

  _beginViewportLoad() {
    this._viewportLoadGeneration += 1;
    return this._viewportLoadGeneration;
  }

  _isViewportLoadStale(loadToken) {
    return loadToken != null && loadToken !== this._viewportLoadGeneration;
  }

  _logViewportCommit(label = 'model') {
    if (!this.currentModel) {
      console.warn(`[Viewport] Commit skipped — no currentModel (${label})`);
      return;
    }
    ensureSceneRoots(this);
    let meshCount = 0;
    let visibleMeshes = 0;
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      meshCount += 1;
      if (child.visible) visibleMeshes += 1;
    });
    const box =
      modelHasSkinnedMesh(this.currentModel) || countModelBones(this.currentModel) > 0
        ? getMeshLayoutBounds(this.currentModel)
        : new THREE.Box3().setFromObject(this.currentModel);
    const rendererSize = this.renderer?.getSize?.(new THREE.Vector2()) || null;
    const playerInScene = this.playerRoot?.parent === this.scene;
    console.log(`[Viewport] Committed ${label}`, {
      meshCount,
      visibleMeshes,
      playerChildren: this.playerRoot?.children?.length ?? 0,
      playerRootInScene: playerInScene,
      boundingBox: box.isEmpty()
        ? 'empty'
        : {
            min: { x: box.min.x, y: box.min.y, z: box.min.z },
            max: { x: box.max.x, y: box.max.y, z: box.max.z },
          },
      rendererSize: rendererSize ? { w: rendererSize.x, h: rendererSize.y } : null,
      camera: this.camera?.position?.toArray?.(),
    });
    if (!playerInScene) {
      console.error(
        '[Viewport] playerRoot is not attached to the scene — model will be invisible; re-parenting',
      );
      ensureSceneRoots(this);
    }
    if (meshCount === 0) {
      console.warn('[Viewport] Model committed but contains no meshes — viewport may look empty');
    }
    if (modelHasSkinnedMesh(this.currentModel)) {
      logRigAlignmentDiagnostics(this.currentModel, label);
    }
    if (rendererSize && (rendererSize.x < 2 || rendererSize.y < 2)) {
      console.warn('[Viewport] Renderer size is near zero — canvas may not be visible');
    }
    try {
      this.forceRendererUpdate?.();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (renderError) {
      console.error('[Viewport] Render failed after commit:', renderError?.message || renderError);
    }
  }

  async loadModel(source, options = {}) {
    const managedViewport = Boolean(options.fromAigc || options.viewportManaged);
    const loadToken = managedViewport ? this._beginViewportLoad() : null;
    const isStale = () => this._isViewportLoadStale(loadToken);
    try {
      this.emit('modelLoadingStart', { source });
      console.log('Loading model:', source);

      let model;
      const fileExtension =
        (options.fileExtension && String(options.fileExtension).toLowerCase()) ||
        this.getFileExtension(source);
      console.log('File extension detected:', fileExtension);

      const targetLayer = options.layer || options.targetLayer || 'player';
      const isSplatFile = ['ply', 'splat', 'spz', 'ksplat', 'sog'].includes(fileExtension)
        || isGaussianSplatExtension(fileExtension);
      if (isSplatFile && (targetLayer === 'world' || options.worldLayer)) {
        return this.loadWorldEnvironment(source, options);
      }

      switch (fileExtension) {
        case 'ply':
        case 'splat':
        case 'spz':
        case 'ksplat':
        case 'sog':
          model = await loadSplatMesh(this, source, options);
          break;
        case 'glb':
        case 'gltf':
          model = await this.loadGLTF(source);
          break;
        case 'obj':
          model = await this.loadOBJ(source);
          break;
        case 'fbx':
          model = await this.loadFBX(source);
          break;
        case 'vrm':
          model = await this.loadVRM(source);
          break;
        default:
          if (isGaussianSplatExtension(fileExtension)) {
            model = await loadSplatMesh(this, source, options);
            break;
          }
          const supportedFormats = ['glb', 'gltf', 'obj', 'fbx', 'vrm', 'ply', 'splat', 'spz'];
          const fileInfo = source instanceof File ? 
            `File: ${source.name} (Type: ${source.type})` : 
            `Source: ${source}`;
          throw new Error(`Unsupported file format: ${fileExtension || 'unknown'}. ${fileInfo}. Supported formats: ${supportedFormats.join(', ')}`);
      }

      if (isStale()) {
        console.log('SceneManager: Discarding superseded model load (newer request started)');
        return null;
      }

      // Remove existing model / splat
      if (this.currentModel) {
        await this._disposeSceneLipSync();
        if (this.currentModel.userData?.isGaussianSplat || this.currentSplat) {
          disposeSplatMesh(this.currentSplat || this.currentModel);
          this.currentSplat = null;
        }
        const parent = this.currentModel.parent || this.scene;
        parent.remove(this.currentModel);
        this.currentModel = null;
        this.currentVRM = null; // Clear VRM reference
      }

      const isSplat =
        Boolean(model?.userData?.isGaussianSplat) || isGaussianSplatExtension(fileExtension);
      if (isSplat && targetLayer !== 'player') {
        return this.loadWorldEnvironment(source, options);
      }
      const isVrm = !isSplat && Boolean(model?.userData?.vrm);
      const fromAigc = Boolean(options.fromAigc);

      if (options.autoRigMeta) {
        model.userData.autoRigMeta = options.autoRigMeta;
      }
      if (this._shouldPreserveExportedOrientation(model, options)) {
        model.userData.preserveExportedOrientation = true;
      }

      // Attach FBX armature before layout so scale/center applies to mesh + rig together.
      if (options.attachRigFbxUrl && countModelBones(model) === 0) {
        try {
          const attached = await this.attachRigArmatureFromFbx(options.attachRigFbxUrl, model);
          if (isStale()) {
            console.log('SceneManager: Discarding superseded model load after FBX rig attach');
            return null;
          }
          if (attached > 0) {
            console.log(`🦴 Auto-rig: attached ${attached} bones from FBX fallback`);
          } else {
            console.warn(
              '🦴 Auto-rig: GLB has no bones and FBX fallback had no armature (skeleton may be mesh-only)',
            );
          }
        } catch (attachError) {
          console.warn('🦴 Auto-rig: FBX armature attach failed:', attachError);
        }
      }

      if (fromAigc) {
        model.userData.fromAigc = true;
      }
      if (options.avatarFromImage) {
        model.userData.avatarFromImage = true;
      }
      if (options.autoRigMeta) {
        model.userData.autoRigMeta = options.autoRigMeta;
      }

      if (fromAigc && countModelBones(model) > 0) {
        validateAigcRigContract(model, {
          jobId: options.autoRigMeta?.job_id,
          rigInfo: options.autoRigMeta?.rig_info,
          label: 'pre-process',
        });
      }

      // Process and add new model
      console.log('Processing model with options:', options);
      if (isSplat) {
        this.currentSplat = model;
        this.currentModel = model;
      } else if (isVrm) {
        this.currentModel = model;
      } else {
        this.currentModel = this.processModel(model, options);
      }
      if (isStale()) {
        console.log('SceneManager: Discarding superseded model load before scene add');
        return null;
      }

      console.log('Model processed, adding to player layer...');
      this._getPlayerParent().add(this.currentModel);

      if (isStale()) {
        console.log('SceneManager: Discarding superseded model load before finalize');
        return null;
      }

      // Restore VRM reference if this is a VRM model
      if (model && model.userData && model.userData.vrm) {
        this.currentVRM = model.userData.vrm;
        console.log('🔍 VRM reference restored after processing:', !!this.currentVRM);

        void this._attachSceneLipSyncMicrophone();

        if (!model.userData.vrmBindPassthrough) {
          this.forceVRMMaterialRestoration();
          setTimeout(() => {
            this.debugVRMTextures();
            this.validateVRMTextures();
            this.recreateVRMMaterials();
            this.forceVRMTextureBinding();
            this.forceVRMMaterialRestoration();
            this.forceRendererUpdate();
            this.updateRenderMode('solid');
          }, 100);
          setTimeout(() => {
            this.recreateVRMMaterials();
            this.forceVRMTextureBinding();
            this.forceVRMMaterialRestoration();
            this.forceRendererUpdate();
            this.updateRenderMode('solid');
            if (this.renderer && this.scene && this.camera) {
              this.renderer.render(this.scene, this.camera);
            }
          }, 500);
          setTimeout(() => {
            console.log('🚀 Ultimate VRM fix attempt...');
            this.currentModel.traverse((child) => {
              if (child.isMesh && child.material) {
                console.log(`🚀 Ultimate fix for: ${child.name}`);
                child.material.wireframe = false;
                child.material.transparent = false;
                child.material.opacity = 1.0;
                child.material.needsUpdate = true;
                if (child.material.map) {
                  child.material.map.needsUpdate = true;
                  child.material.map.flipY = false;
                }
              }
            });
            this.updateRenderMode('solid');
            if (this.renderer && this.scene && this.camera) {
              this.renderer.render(this.scene, this.camera);
            }
            console.log('🚀 Ultimate VRM fix completed');
          }, 1000);
        } else {
          console.log('[VRM] Passthrough upload — skipping material/layout mutation');
        }
      }

      // Store original materials for render mode restoration
      this.storeOriginalMaterials();

      // Update materials based on render mode
      this.updateRenderMode(this.renderMode);

      if (isVrm && !this.currentModel?.userData?.vrmBindPassthrough) {
        this.forceMaterialRestoration();
      } else if (!isVrm && !isSplat) {
        this.prepareGltfMaterialsForDisplay(this.currentModel);
      }

      // Ensure model is properly positioned
      this.ensureModelOnGround();

      if (fromAigc && this.currentModel && countModelBones(this.currentModel) > 0) {
        validateAigcRigContract(this.currentModel, {
          jobId: options.autoRigMeta?.job_id,
          rigInfo: options.autoRigMeta?.rig_info,
          label: 'post-viewport-layout',
        });
      }

      // Debug: Log model position and camera position
      console.log('Model position:', this.currentModel.position);
      const boundingBox =
        modelHasSkinnedMesh(this.currentModel) || countModelBones(this.currentModel) > 0
          ? getMeshLayoutBounds(this.currentModel)
          : new THREE.Box3().setFromObject(this.currentModel);
      console.log('Model bounding box:', boundingBox);
      console.log('Camera position:', this.camera.position);
      console.log('Camera target:', this.controls.target);

      // Auto-focus camera on the model
      this.focusOnModel();

      if (isStale()) {
        console.log('SceneManager: Discarding superseded model load before modelLoaded emit');
        return null;
      }

      this._logViewportCommit(managedViewport ? 'aigc-model' : 'model');
      this.emit('modelLoaded', { model: this.currentModel });
      return this.currentModel;
    } catch (error) {
      console.error('Failed to load model:', error);
      this.emit('modelLoadError', { error });
      throw error;
    }
  }

  /**
   * Load GLTF/GLB model
   */
  async loadGLTF(source) {
    return new Promise((resolve, reject) => {
      console.log('🔄 Starting GLTF/GLB model loading...');
      console.log('📁 Source:', source instanceof File ? `File: ${source.name} (${source.size} bytes, ${source.type})` : `URL: ${source}`);
      
      // Convert File object to URL if needed
      let url = source;
      let objectUrl = null;
      if (source instanceof File) {
        objectUrl = URL.createObjectURL(source);
        url = objectUrl;
        console.log('📎 Created object URL for File:', url);
      }
      
      const startTime = Date.now();
      
      this.gltfLoader.load(
        url,
        (gltf) => {
          const loadTime = Date.now() - startTime;
          console.log(`✅ GLTF/GLB loaded successfully in ${loadTime}ms`);
          console.log('📊 GLTF Structure:', {
            scene: !!gltf.scene,
            scenes: gltf.scenes?.length || 0,
            animations: gltf.animations?.length || 0,
            cameras: gltf.cameras?.length || 0,
            asset: gltf.asset,
            userData: gltf.userData
          });
          
          // Debug geometry detection
          if (gltf.scene) {
            let geometryCount = 0;
            let materialCount = 0;
            let textureCount = 0;
            let meshCount = 0;
            
            gltf.scene.traverse((child) => {
              if (child.isMesh) {
                this.ensureMeshVertexNormals(child);
                meshCount++;
                console.log(`🔍 Mesh found: ${child.name}`, {
                  geometry: child.geometry?.type,
                  material: child.material?.type,
                  position: child.position,
                  visible: child.visible
                });
                
                if (child.geometry) {
                  geometryCount++;
                  console.log(`📐 Geometry details:`, {
                    type: child.geometry.type,
                    vertices: child.geometry.attributes?.position?.count || 0,
                    faces: child.geometry.index ? child.geometry.index.count / 3 : 0,
                    hasNormals: !!child.geometry.attributes?.normal,
                    hasUVs: !!child.geometry.attributes?.uv,
                    hasColors: !!child.geometry.attributes?.color
                  });
                }
                
                if (child.material) {
                  materialCount++;
                  console.log(`🎨 Material details:`, {
                    type: child.material.type,
                    color: child.material.color,
                    map: !!child.material.map,
                    normalMap: !!child.material.normalMap,
                    roughnessMap: !!child.material.roughnessMap,
                    metalnessMap: !!child.material.metalnessMap,
                    emissiveMap: !!child.material.emissiveMap
                  });
                  
                  // Count textures
                  if (child.material.map) textureCount++;
                  if (child.material.normalMap) textureCount++;
                  if (child.material.roughnessMap) textureCount++;
                  if (child.material.metalnessMap) textureCount++;
                  if (child.material.emissiveMap) textureCount++;
                }
              }
            });
            
            console.log(`📈 GLTF/GLB Summary:`, {
              meshes: meshCount,
              geometries: geometryCount,
              materials: materialCount,
              textures: textureCount,
              loadTime: `${loadTime}ms`
            });
            
            if (meshCount === 0) {
              console.warn('⚠️ No meshes found in GLTF/GLB model!');
            }
            if (geometryCount === 0) {
              console.warn('⚠️ No geometries found in GLTF/GLB model!');
            }
          }
          
          const rigBones = collectRigBonesFromGltf(gltf.scene, gltf.scenes || []);
          if (gltf.scene) {
            gltf.scene.userData.collectedRigBones = rigBones;
            if (rigBones.length > 0) {
              console.log(`🦴 Rig bones in GLTF: ${rigBones.length}`, rigBones.map((b) => b.name));
            }
            const riggedExport =
              rigBones.length > 0 || modelHasSkinnedMesh(gltf.scene);
            if (
              riggedExport &&
              (isPreservedOrientationGltf(gltf.asset) || isBlenderExportedGltf(gltf.asset))
            ) {
              gltf.scene.userData.preserveExportedOrientation = true;
              const source = isBlenderExportedGltf(gltf.asset) ? 'DGX Blender' : 'viewport';
              console.log(
                `[Rig] preserveExportedOrientation=ON (${source} GLB — skip autoScale/yaw repair)`,
              );
            } else if (isViewportExportedGltf(gltf.asset)) {
              gltf.scene.userData.preserveExportedOrientation = true;
              console.log(
                'Skipping auto forward-facing correction (viewport GLB export — orientation already baked)',
              );
            }
          }

          // Clean up object URL after successful load
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            console.log('🧹 Cleaned up object URL');
          }
          resolve(gltf.scene);
        },
        (progress) => {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log(`📊 GLTF/GLB loading progress: ${percentComplete.toFixed(1)}% (${progress.loaded}/${progress.total} bytes)`);
          this.emit('modelLoadingProgress', { progress: percentComplete });
        },
        (error) => {
          // Clean up object URL on error
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            console.log('🧹 Cleaned up object URL after error');
          }
          const loadTime = Date.now() - startTime;
          console.error(`❌ GLTF/GLB loading failed after ${loadTime}ms:`, {
            message: error.message,
            source: source instanceof File ? source.name : source,
            loadTime: `${loadTime}ms`
          });
          reject(error);
        }
      );
    });
  }

  /**
   * Load OBJ model
   */
  async loadOBJ(source) {
    return new Promise((resolve, reject) => {
      // Convert File object to URL if needed
      let url = source;
      let objectUrl = null;
      if (source instanceof File) {
        objectUrl = URL.createObjectURL(source);
        url = objectUrl;
        console.log('📎 Created object URL for File:', url);
      }
      
      this.objLoader.load(
        url,
        (obj) => {
          // Clean up object URL after successful load
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            console.log('🧹 Cleaned up object URL');
          }
          resolve(obj);
        },
        (progress) => this.emit('modelLoadingProgress', { progress }),
        (error) => {
          // Clean up object URL on error
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            console.log('🧹 Cleaned up object URL after error');
          }
          reject(error);
        }
      );
    });
  }

  /**
   * Load FBX model
   */
  async loadFBX(source) {
    return new Promise((resolve, reject) => {
      console.log('🔄 Starting FBX model loading...');
      console.log('📁 Source:', source instanceof File ? `File: ${source.name} (${source.size} bytes, ${source.type})` : `URL: ${source}`);
      
      // Convert File object to URL if needed
      let url = source;
      let objectUrl = null;
      if (source instanceof File) {
        objectUrl = URL.createObjectURL(source);
        url = objectUrl;
        console.log('📎 Created object URL for File:', url);
      }
      
      const startTime = Date.now();
      
      this.fbxLoader.load(
        url,
        (fbx) => {
          const loadTime = Date.now() - startTime;
          console.log(`✅ FBX loaded successfully in ${loadTime}ms`);
          console.log('📊 FBX Structure:', {
            type: fbx.type,
            name: fbx.name,
            children: fbx.children.length,
            animations: fbx.animations?.length || 0,
            userData: fbx.userData
          });
          
          // Debug geometry detection
          let geometryCount = 0;
          let materialCount = 0;
          let textureCount = 0;
          let meshCount = 0;
          let hasGeometry = false;
          
          fbx.traverse((child) => {
            if (child.isMesh) {
              meshCount++;
              console.log(`🔍 FBX Mesh found: ${child.name}`, {
                geometry: child.geometry?.type,
                material: child.material?.type,
                position: child.position,
                visible: child.visible
              });
              
              if (child.geometry) {
                hasGeometry = true;
                geometryCount++;
                console.log(`📐 FBX Geometry details:`, {
                  type: child.geometry.type,
                  vertices: child.geometry.attributes?.position?.count || 0,
                  faces: child.geometry.index ? child.geometry.index.count / 3 : 0,
                  hasNormals: !!child.geometry.attributes?.normal,
                  hasUVs: !!child.geometry.attributes?.uv,
                  hasColors: !!child.geometry.attributes?.color
                });
              }
              
              if (child.material) {
                materialCount++;
                console.log(`🎨 FBX Material details:`, {
                  type: child.material.type,
                  color: child.material.color,
                  map: !!child.material.map,
                  normalMap: !!child.material.normalMap,
                  roughnessMap: !!child.material.roughnessMap,
                  metalnessMap: !!child.material.metalnessMap,
                  emissiveMap: !!child.material.emissiveMap
                });
                
                // Count textures
                if (child.material.map) textureCount++;
                if (child.material.normalMap) textureCount++;
                if (child.material.roughnessMap) textureCount++;
                if (child.material.metalnessMap) textureCount++;
                if (child.material.emissiveMap) textureCount++;
              }
            }
          });
          
          console.log(`📈 FBX Summary:`, {
            meshes: meshCount,
            geometries: geometryCount,
            materials: materialCount,
            textures: textureCount,
            loadTime: `${loadTime}ms`
          });
          
          if (!hasGeometry) {
            console.warn('⚠️ FBX model has no geometry! Creating fallback geometry...');
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const cube = new THREE.Mesh(geometry, material);
            cube.name = 'FallbackGeometry';
            fbx.add(cube);
            console.log('✅ Fallback geometry added to FBX model');
          } else {
            console.log('✅ FBX model has valid geometry, preserving original materials');
          }
          
          if (meshCount === 0) {
            console.warn('⚠️ No meshes found in FBX model!');
          }
          if (geometryCount === 0) {
            console.warn('⚠️ No geometries found in FBX model!');
          }
          
          // Clean up object URL after successful load
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            console.log('🧹 Cleaned up object URL');
          }
          resolve(fbx);
        },
        (progress) => {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log(`📊 FBX loading progress: ${percentComplete.toFixed(1)}% (${progress.loaded}/${progress.total} bytes)`);
          this.emit('modelLoadingProgress', { progress: percentComplete });
        },
        (error) => {
          // Clean up object URL on error
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            console.log('🧹 Cleaned up object URL after error');
          }
          const loadTime = Date.now() - startTime;
          console.error(`❌ FBX loading failed after ${loadTime}ms:`, {
            message: error.message,
            source: source instanceof File ? source.name : source,
            loadTime: `${loadTime}ms`
          });
          reject(error);
        }
      );
    });
  }

  /**
   * Attach armature from a rig FBX onto the current model (keeps textured GLB mesh).
   * @param {string|File} source
   * @returns {Promise<number>} Number of bones attached
   */
  async attachRigArmatureFromFbx(source, targetModel = this.currentModel) {
    if (!targetModel) return 0;

    const fbxRoot = await this.loadFBX(source);
    const fbxBones = collectModelBones(fbxRoot);
    if (fbxBones.length === 0) {
      return 0;
    }

    const prior = targetModel.getObjectByName('__attachedRigArmature__');
    if (prior) {
      targetModel.remove(prior);
      prior.traverse((child) => {
        if (child.geometry) child.geometry.dispose?.();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m?.dispose?.());
        }
      });
    }

    const armatureGroup = new THREE.Group();
    armatureGroup.name = '__attachedRigArmature__';

    const roots = fbxBones.filter((bone) => !(bone.parent?.isBone));
    const toAttach = roots.length > 0 ? roots : fbxBones.slice(0, 1);

    for (const rootBone of toAttach) {
      const clone = rootBone.clone(true);
      clone.traverse((child) => {
        if (child.isMesh) {
          child.visible = false;
        }
      });
      armatureGroup.add(clone);
    }

    targetModel.add(armatureGroup);
    armatureGroup.updateMatrixWorld(true);

    const meshBox = getMeshLayoutBounds(targetModel);
    const rigBox = new THREE.Box3().setFromObject(armatureGroup);
    if (!meshBox.isEmpty() && !rigBox.isEmpty()) {
      const meshCenter = meshBox.getCenter(new THREE.Vector3());
      const rigCenter = rigBox.getCenter(new THREE.Vector3());
      armatureGroup.position.add(meshCenter.sub(rigCenter));
      armatureGroup.updateMatrixWorld(true);
    }

    const sceneBones = collectModelBones(targetModel);
    targetModel.userData.collectedRigBones = sceneBones;
    targetModel.userData.rigArmatureFromFbx = true;

    return sceneBones.length;
  }

  /**
   * Load VRM model
   */
  async loadVRM(source) {
    // Convert File object to URL if needed (declare outside try for cleanup in catch)
    let url = source;
    let objectUrl = null;
    if (source instanceof File) {
      objectUrl = URL.createObjectURL(source);
      url = objectUrl;
      console.log('📎 Created object URL for File:', url);
    }
    
    try {
      console.log('🔄 Starting VRM model loading...');
      console.log('📁 Source:', source instanceof File ? `File: ${source.name} (${source.size} bytes, ${source.type})` : `URL: ${source}`);
      
      const startTime = Date.now();
      
      const vrm = await this.vrmLoader.loadVRM(url, {
        passthrough: true,
        normalize: false,
        addDefaultMaterials: false,
        processBlendShapes: false,
        setupBones: false,
      });
      
      const loadTime = Date.now() - startTime;
      console.log(`✅ VRM loaded successfully in ${loadTime}ms`);
      
      // Clean up object URL after successful load
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        console.log('🧹 Cleaned up object URL');
      }
      
      // Store the VRM object for blend shape access
      this.currentVRM = vrm;
      
      // Debug: Log VRM object structure and userData
      console.log('🔍 VRM object stored in sceneManager:', vrm);
      console.log('🔍 VRM userData:', vrm.userData);
      console.log('🔍 VRM userData.gltf:', vrm.userData?.gltf);
      console.log('🔍 VRM userData.gltf.images:', vrm.userData?.gltf?.images);
      console.log('🔍 VRM userData.gltf.images length:', vrm.userData?.gltf?.images?.length);
      
      // Enhanced VRM debugging and texture/shader processing
      if (vrm.scene) {
        console.log('📊 VRM Structure:', {
          type: vrm.scene.type,
          name: vrm.scene.name,
          children: vrm.scene.children.length,
          userData: vrm.scene.userData
        });
        
        // Debug VRM materials and textures
        let geometryCount = 0;
        let materialCount = 0;
        let textureCount = 0;
        let meshCount = 0;
        let vrmMaterialCount = 0;
        
        vrm.scene.traverse((child) => {
          if (child.isMesh) {
            meshCount++;
            console.log(`🔍 VRM Mesh found: ${child.name}`, {
              geometry: child.geometry?.type,
              material: child.material?.type,
              position: child.position,
              visible: child.visible
            });
            
            if (child.geometry) {
              geometryCount++;
              console.log(`📐 VRM Geometry details:`, {
                type: child.geometry.type,
                vertices: child.geometry.attributes?.position?.count || 0,
                faces: child.geometry.index ? child.geometry.index.count / 3 : 0,
                hasNormals: !!child.geometry.attributes?.normal,
                hasUVs: !!child.geometry.attributes?.uv,
                hasColors: !!child.geometry.attributes?.color
              });
            }
            
            if (child.material) {
              materialCount++;
              
              // Check if it's a VRM material
              const isVRMMaterial = child.material.userData?.vrmMaterial || 
                                   child.material.userData?.isVRMMaterial ||
                                   child.material.type === 'VRMMaterial';
              
              if (isVRMMaterial) {
                vrmMaterialCount++;
                console.log(`🎨 VRM Material found: ${child.name}`, {
                  type: child.material.type,
                  color: child.material.color,
                  map: !!child.material.map,
                  normalMap: !!child.material.normalMap,
                  roughnessMap: !!child.material.roughnessMap,
                  metalnessMap: !!child.material.metalnessMap,
                  emissiveMap: !!child.material.emissiveMap,
                  isVRMMaterial: true
                });
                
                // Ensure VRM materials are properly configured
                this.ensureVRMMaterialProperties(child.material);
              } else {
                console.log(`🎨 Standard Material: ${child.name}`, {
                  type: child.material.type,
                  color: child.material.color,
                  map: !!child.material.map,
                  normalMap: !!child.material.normalMap,
                  roughnessMap: !!child.material.roughnessMap,
                  metalnessMap: !!child.material.metalnessMap,
                  emissiveMap: !!child.material.emissiveMap
                });
              }
              
              // Count textures
              if (child.material.map) textureCount++;
              if (child.material.normalMap) textureCount++;
              if (child.material.roughnessMap) textureCount++;
              if (child.material.metalnessMap) textureCount++;
              if (child.material.emissiveMap) textureCount++;
            }
          }
        });
        
        console.log(`📈 VRM Summary:`, {
          meshes: meshCount,
          geometries: geometryCount,
          materials: materialCount,
          vrmMaterials: vrmMaterialCount,
          textures: textureCount,
          loadTime: `${loadTime}ms`
        });
        
        if (vrmMaterialCount === 0) {
          console.warn('⚠️ No VRM materials found! This may cause texture/shader issues.');
        }
        if (textureCount === 0) {
          console.warn('⚠️ No textures found in VRM model!');
        }
      }
      
      // Return the VRM scene with VRM object attached
      const scene = vrm.scene;
      scene.userData.vrm = vrm;
      return scene;
    } catch (error) {
      // Clean up object URL on error
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        console.log('🧹 Cleaned up object URL after error');
      }
      const loadTime = Date.now() - startTime;
      console.error(`❌ VRM loading failed after ${loadTime}ms:`, {
        message: error.message,
        source: source instanceof File ? source.name : source,
        loadTime: `${loadTime}ms`
      });
      throw error;
    }
  }
  
  /**
   * Ensure VRM material properties are properly configured
   */
  ensureVRMMaterialProperties(material) {
    if (!material) return;
    
    // Ensure material has proper VRM properties
    if (!material.userData) {
      material.userData = {};
    }
    
    // Mark as VRM material
    material.userData.vrmMaterial = true;
    material.userData.isVRMMaterial = true;
    
    // Ensure material is properly configured for rendering
    if (material.map) {
      material.map.needsUpdate = true;
      material.map.flipY = false; // VRM textures should not be flipped
    }
    if (material.normalMap) {
      material.normalMap.needsUpdate = true;
      material.normalMap.flipY = false;
    }
    if (material.roughnessMap) {
      material.roughnessMap.needsUpdate = true;
      material.roughnessMap.flipY = false;
    }
    if (material.metalnessMap) {
      material.metalnessMap.needsUpdate = true;
      material.metalnessMap.flipY = false;
    }
    if (material.emissiveMap) {
      material.emissiveMap.needsUpdate = true;
      material.emissiveMap.flipY = false;
    }
    
    // Ensure proper material properties for solid rendering
    material.wireframe = false;
    material.transparent = false;
    material.opacity = 1.0;
    
    // Ensure material needs update
    material.needsUpdate = true;
    
    console.log(`🔧 VRM Material properties ensured for: ${material.type}`);
  }
  
  /**
   * Force material restoration for all meshes to ensure textures are properly displayed
   */
  forceMaterialRestoration() {
    if (!this.currentModel) return;
    
    console.log('🔧 Forcing material restoration...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        console.log(`🔍 Processing mesh: ${child.name}`);
        
        // Force material update
        child.material.needsUpdate = true;
        
        // Ensure all textures are properly updated
        const isVRMMaterial = this.isVrmMaterial(child.material);
        const flipTextures = isVRMMaterial;

        if (child.material.map) {
          child.material.map.needsUpdate = true;
          child.material.map.flipY = flipTextures ? false : true;
          console.log(`📷 Updated texture map for: ${child.name}`);
        }
        if (child.material.normalMap) {
          child.material.normalMap.needsUpdate = true;
          if (flipTextures) child.material.normalMap.flipY = false;
        }
        if (child.material.roughnessMap) {
          child.material.roughnessMap.needsUpdate = true;
          if (flipTextures) child.material.roughnessMap.flipY = false;
        }
        if (child.material.metalnessMap) {
          child.material.metalnessMap.needsUpdate = true;
          if (flipTextures) child.material.metalnessMap.flipY = false;
        }
        if (child.material.emissiveMap) {
          child.material.emissiveMap.needsUpdate = true;
          if (flipTextures) child.material.emissiveMap.flipY = false;
        }

        if (isVRMMaterial) {
          console.log(`🎨 Found VRM material on: ${child.name}`);
          this.ensureVRMMaterialProperties(child.material);
        }
        
        // Ensure proper material properties for solid rendering
        child.material.wireframe = false;
        child.material.transparent = false;
        child.material.opacity = 1.0;
        
        // Force texture coordinate update
        if (child.geometry && child.geometry.attributes && child.geometry.attributes.uv) {
          child.geometry.attributes.uv.needsUpdate = true;
        }
        
        console.log(`✅ Material restoration completed for: ${child.name}`);
      }
    });
    
    console.log('✅ Material restoration completed');
  }

  /**
   * Force VRM material restoration with aggressive texture binding
   */
  forceVRMMaterialRestoration() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        // Force material recreation for VRM materials
        if (child.material.userData?.vrmMaterial || child.material.userData?.isVRMMaterial) {
          // Force texture binding
          if (child.material.map) {
            child.material.map.needsUpdate = true;
            child.material.map.flipY = false;
            child.material.map.generateMipmaps = true;
            child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
            child.material.map.magFilter = THREE.LinearFilter;
            child.material.map.wrapS = THREE.RepeatWrapping;
            child.material.map.wrapT = THREE.RepeatWrapping;
          }
          
          // Force all texture maps
          [child.material.normalMap, child.material.roughnessMap, child.material.metalnessMap, child.material.emissiveMap].forEach((texture, index) => {
            if (texture) {
              texture.needsUpdate = true;
              texture.flipY = false;
              texture.generateMipmaps = true;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
            }
          });
          
          // Force material properties
          child.material.needsUpdate = true;
          child.material.wireframe = false;
          child.material.transparent = false;
          child.material.opacity = 1.0;
          
          // Force geometry UV update
          if (child.geometry && child.geometry.attributes && child.geometry.attributes.uv) {
            child.geometry.attributes.uv.needsUpdate = true;
          }
          
          // Force material recreation if texture is not working
          if (child.material.map && !child.material.map.image) {
            console.log(`⚠️ Texture has no image, forcing recreation for: ${child.name}`);
            // Try to force texture recreation
            child.material.map.dispose();
            child.material.map = null;
            child.material.needsUpdate = true;
          }
          
          // Force material recreation if it's still not working
          if (child.material.map && child.material.map.image && child.material.map.image.width === 0) {
            console.log(`⚠️ Texture image not loaded, forcing material recreation for: ${child.name}`);
            // Force material recreation
            const oldMaterial = child.material;
            child.material = oldMaterial.clone();
            child.material.needsUpdate = true;
            oldMaterial.dispose();
          }
          
        }
      }
    });
  }

  /**
   * Debug VRM textures to see what's happening
   */
  debugVRMTextures() {
    if (!this.currentModel) return;
    
    console.log('🔍 Debugging VRM textures...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        console.log(`🔍 Mesh: ${child.name}`);
        console.log(`  Material type: ${child.material.type}`);
        console.log(`  Material needsUpdate: ${child.material.needsUpdate}`);
        console.log(`  Material wireframe: ${child.material.wireframe}`);
        console.log(`  Material transparent: ${child.material.transparent}`);
        console.log(`  Material opacity: ${child.material.opacity}`);
        
        if (child.material.map) {
          console.log(`  Map texture: ${child.material.map.image?.src || 'embedded'}`);
          console.log(`  Map needsUpdate: ${child.material.map.needsUpdate}`);
          console.log(`  Map flipY: ${child.material.map.flipY}`);
          console.log(`  Map format: ${child.material.map.format}`);
          console.log(`  Map type: ${child.material.map.type}`);
        } else {
          console.log(`  No map texture found`);
        }
        
        if (child.material.color) {
          console.log(`  Material color: ${child.material.color.getHexString()}`);
        }
        
        console.log(`  Material userData:`, child.material.userData);
        console.log('---');
      }
    });
  }

  /**
   * Force renderer update to refresh materials
   */
  forceRendererUpdate() {
    if (!this.renderer) return;

    // Force renderer to update
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    
    // Force material updates
    if (this.currentModel) {
      this.currentModel.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.needsUpdate = true;
          if (child.material.map) {
            child.material.map.needsUpdate = true;
          }
        }
      });
    }
    
    // Force render
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Validate and fix VRM textures
   */
  validateVRMTextures() {
    if (!this.currentModel) return;
    
    console.log('🔍 Validating VRM textures...');
    let fixedCount = 0;
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        if (child.material.map) {
          const texture = child.material.map;
          if (!texture.image || texture.image.width === 0) {
            console.log(`⚠️ Invalid texture found for: ${child.name}`);
            // Try to force texture recreation
            texture.needsUpdate = true;
            texture.flipY = false;
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            fixedCount++;
          }
        }
      }
    });
    
    console.log(`✅ VRM texture validation completed. Fixed ${fixedCount} textures.`);
  }

  /**
   * Force VRM texture binding - more aggressive approach
   */
  forceVRMTextureBinding() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        // Force all texture maps to be properly bound
        const textureMaps = [
          'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'
        ];
        
        textureMaps.forEach(mapType => {
          if (child.material[mapType]) {
            const texture = child.material[mapType];

            // Force texture properties
            texture.needsUpdate = true;
            texture.flipY = false;
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            
            // Force texture to be bound to GPU
            if (this.renderer) {
              this.renderer.initTexture(texture);
            }
          }
        });
        
        // Force material update
        child.material.needsUpdate = true;
        child.material.wireframe = false;
        child.material.transparent = false;
        child.material.opacity = 1.0;
        
        // Force geometry UV update
        if (child.geometry && child.geometry.attributes && child.geometry.attributes.uv) {
          child.geometry.attributes.uv.needsUpdate = true;
        }
      }
    });
  }

  /**
   * Completely recreate VRM materials to fix texture issues
   */
  recreateVRMMaterials() {
    if (!this.currentModel) return;
    
    console.log('🔧 Recreating VRM materials...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        console.log(`🔄 Recreating material for: ${child.name}`);
        
        // Store original material properties
        const originalMaterial = child.material;
        const materialType = originalMaterial.type;
        
        // Create new material with same properties
        let newMaterial;
        if (materialType === 'MeshStandardMaterial') {
          newMaterial = new THREE.MeshStandardMaterial({
            map: originalMaterial.map,
            normalMap: originalMaterial.normalMap,
            roughnessMap: originalMaterial.roughnessMap,
            metalnessMap: originalMaterial.metalnessMap,
            emissiveMap: originalMaterial.emissiveMap,
            color: originalMaterial.color,
            roughness: originalMaterial.roughness,
            metalness: originalMaterial.metalness,
            emissive: originalMaterial.emissive,
            transparent: false,
            opacity: 1.0,
            wireframe: false
          });
        } else {
          newMaterial = new THREE.MeshBasicMaterial({
            map: originalMaterial.map,
            color: originalMaterial.color,
            transparent: false,
            opacity: 1.0,
            wireframe: false
          });
        }
        
        // Copy userData
        newMaterial.userData = { ...originalMaterial.userData };
        
        // Force texture updates
        if (newMaterial.map) {
          newMaterial.map.needsUpdate = true;
          newMaterial.map.flipY = false;
        }
        if (newMaterial.normalMap) {
          newMaterial.normalMap.needsUpdate = true;
          newMaterial.normalMap.flipY = false;
        }
        if (newMaterial.roughnessMap) {
          newMaterial.roughnessMap.needsUpdate = true;
          newMaterial.roughnessMap.flipY = false;
        }
        if (newMaterial.metalnessMap) {
          newMaterial.metalnessMap.needsUpdate = true;
          newMaterial.metalnessMap.flipY = false;
        }
        if (newMaterial.emissiveMap) {
          newMaterial.emissiveMap.needsUpdate = true;
          newMaterial.emissiveMap.flipY = false;
        }
        
        // Replace material
        child.material = newMaterial;
        child.material.needsUpdate = true;
        
        // Dispose old material
        originalMaterial.dispose();
        
        console.log(`✅ Material recreated for: ${child.name}`);
        console.log(`✅ New material wireframe: ${newMaterial.wireframe}, transparent: ${newMaterial.transparent}`);
        if (newMaterial.map) {
          console.log(`✅ New material texture: needsUpdate=${newMaterial.map.needsUpdate}, flipY=${newMaterial.map.flipY}`);
        }
      }
    });
    
    console.log('✅ VRM materials recreation completed');
  }

  /**
   * VRM used for facial expressions: provider callback (OpenNexus3DStudio trait body) or imported model.
   * @returns {import('@pixiv/three-vrm').VRM | null}
   */
  _resolveExpressionVRM() {
    if (typeof this.xrExpressionVRMProvider === 'function') {
      const list = this.xrExpressionVRMProvider();
      if (Array.isArray(list) && list.length > 0 && list[0]) {
        return list[0];
      }
    }
    return this.currentVRM ?? null;
  }

  /**
   * Get VRM blend shapes
   */
  getVRMBlendShapes() {
    const vrm = this._resolveExpressionVRM();
    if (!vrm) {
      return [];
    }

    const blendShapes = [];
    
    // VRM standard blend shape name mapping based on VRMExpressionPresetName
    const blendShapeNameMap = {
      // Numeric blend shape mappings (common in some VRM models)
      '0': 'Neutral',
      '1': 'Happy',
      '2': 'Angry',
      '3': 'Sad',
      '4': 'Surprised',
      '5': 'Blink',
      '6': 'A (Mouth Open)',
      '7': 'I (Smile)',
      '8': 'U (Pucker)',
      '9': 'E (Grin)',
      '10': 'O (Round)',
      '11': 'Joy',
      '12': 'Fun',
      '13': 'Sorrow',
      '14': 'Left Blink',
      '15': 'Right Blink',
      '16': 'Look Up',
      '17': 'Look Down',
      '18': 'Look Left',
      '19': 'Look Right',
      
      // Facial expressions (VRM 1.0 standard)
      'happy': 'Happy',
      'angry': 'Angry', 
      'sorrow': 'Sorrow',
      'fun': 'Fun',
      'surprised': 'Surprised',
      'neutral': 'Neutral',
      'relaxed': 'Relaxed',
      'excited': 'Excited',
      'sleepy': 'Sleepy',
      'confused': 'Confused',
      'disgusted': 'Disgusted',
      'fearful': 'Fearful',
      'sad': 'Sad',
      
      // Lip sync visemes (phonemes)
      'aa': 'A (Mouth Open)',
      'ih': 'I (Smile)', 
      'ou': 'U (Pucker)',
      'ee': 'E (Grin)',
      'oh': 'O (Round)',
      
      // Eye movements
      'blink': 'Blink',
      'blink_l': 'Left Blink',
      'blink_r': 'Right Blink',
      'lookup': 'Look Up',
      'lookdown': 'Look Down', 
      'lookleft': 'Look Left',
      'lookright': 'Look Right',
      
      // Additional VRM expressions
      'joy': 'Joy',
      'a': 'A (Mouth Open)',
      'i': 'I (Smile)',
      'u': 'U (Pucker)',
      'e': 'E (Grin)',
      'o': 'O (Round)',
      
      // Legacy VRM 0.x mappings
      'Ah': 'A (Mouth Open)',
      'Ih': 'I (Smile)',
      'Ou': 'U (Pucker)', 
      'Ee': 'E (Grin)',
      'Oh': 'O (Round)',
      'Blink': 'Blink',
      'Blink_L': 'Left Blink',
      'Blink_R': 'Right Blink',
      'LookUp': 'Look Up',
      'LookDown': 'Look Down',
      'LookLeft': 'Look Left', 
      'LookRight': 'Look Right'
    };
    
    const getDisplayName = (technicalName) => {
      // First check our custom mapping
      if (blendShapeNameMap[technicalName]) {
        return blendShapeNameMap[technicalName];
      }
      
      // Then check if it's a VRMExpressionPresetName value
      const presetEntries = Object.entries(VRMExpressionPresetName);
      for (const [key, value] of presetEntries) {
        if (value === technicalName) {
          // Convert key to human-readable format
          return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
        }
      }
      
      // Fallback to original name
      return technicalName;
    };
    
    // Extract ALL blend shapes from the VRM model - both expressions and morph targets
    console.log('Extracting blend shapes from VRM model...');
    
    // First, try to get VRM expressions (these are the high-level expressions)
    let vrmExpressions = [];
    if (vrm.blendShapeProxy) {
      console.log('VRM has blendShapeProxy');
      const expressions = vrm.blendShapeProxy.getExpressionManager();
      if (expressions) {
        const expressionNames = expressions.getExpressionNames();
        console.log('Found VRM expressions:', expressionNames.length);
        vrmExpressions = expressionNames;
      }
    } else if (vrm.expressionManager) {
      console.log('VRM has direct expressionManager');
      const expressions = vrm.expressionManager.expressions;
      if (expressions) {
        const expressionNames = Object.keys(expressions);
        console.log('Found VRM expressions:', expressionNames.length);
        vrmExpressions = expressionNames;
      }
    }
    
    // Extract morph targets from all meshes in the scene
    if (vrm.scene) {
      console.log('Checking VRM scene for morph targets...');
      vrm.scene.traverse((child) => {
        if (child.isMesh && child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
          console.log('Found morph targets on mesh:', child.name, child.morphTargetInfluences.length);
          if (child.morphTargetDictionary) {
            const morphTargetNames = Object.keys(child.morphTargetDictionary);
            console.log('Morph target dictionary:', morphTargetNames.length, 'targets');
            console.log('Morph target names:', morphTargetNames.slice(0, 10), '...'); // Show first 10 names
            
            morphTargetNames.forEach(name => {
              // Only add if not already in VRM expressions and not already added
              if (!vrmExpressions.includes(name) && !blendShapes.find(bs => bs.technicalName === name)) {
                blendShapes.push({
                  name: name, // Use the actual morph target name
                  technicalName: name,
                  value: 0
                });
              }
            });
          }
        }
      });
    }
    
    // Add VRM expressions (these are usually the main facial expressions)
    vrmExpressions.forEach(name => {
      if (!blendShapes.find(bs => bs.technicalName === name)) {
        blendShapes.push({
          name: getDisplayName(name),
          technicalName: name,
          value: 0
        });
      }
    });
    
    // Check for blend shapes in VRM metadata
    if (vrm.meta && vrm.meta.blendShapeGroups) {
      console.log('Found blend shape groups in VRM meta:', vrm.meta.blendShapeGroups.length);
      vrm.meta.blendShapeGroups.forEach(group => {
        if (group.binds) {
          group.binds.forEach(bind => {
            const name = bind.name || `BlendShape_${bind.index}`;
            // Only add if not already added
            if (!blendShapes.find(bs => bs.technicalName === name)) {
              blendShapes.push({
                name: name,
                technicalName: name,
                value: 0
              });
            }
          });
        }
      });
    }
    
    console.log('Total blend shapes extracted:', blendShapes.length);
    console.log('Blend shape names (first 10):', blendShapes.slice(0, 10).map(bs => bs.name));
    console.log('All blend shape technical names:', blendShapes.map(bs => bs.technicalName));
    return blendShapes;
  }

  /**
   * Set VRM blend shape value
   */
  setVRMBlendShape(name, value) {
    const vrm = this._resolveExpressionVRM();
    if (!vrm) return;

    // Try blendShapeProxy first (for VRM expressions)
    if (vrm.blendShapeProxy) {
      const expressions = vrm.blendShapeProxy.getExpressionManager();
      if (expressions) {
        expressions.setValue(name, value);
        return;
      }
    }

    // Try direct expressionManager
    if (vrm.expressionManager && vrm.expressionManager.expressions) {
      const expressions = vrm.expressionManager.expressions;
      if (expressions[name] && typeof expressions[name].setValue === 'function') {
        expressions[name].setValue(value);
        return;
      }
    }

    // Try blendShapeManager
    if (vrm.blendShapeManager && vrm.blendShapeManager.expressions) {
      const expressions = vrm.blendShapeManager.expressions;
      if (expressions[name] && typeof expressions[name].setValue === 'function') {
        expressions[name].setValue(value);
        return;
      }
    }

    // Try to set morph target directly on meshes
    if (vrm.scene) {
      vrm.scene.traverse((child) => {
        if (child.isMesh && child.morphTargetInfluences && child.morphTargetDictionary) {
          const morphIndex = child.morphTargetDictionary[name];
          if (morphIndex !== undefined) {
            child.morphTargetInfluences[morphIndex] = value;
            return;
          }
        }
      });
    }

    console.warn('Could not set blend shape value for:', name);
  }

  _shouldPreserveExportedOrientation(model, options = {}, asset) {
    return shouldPreserveExportedOrientation(options, model, asset);
  }

  /**
   * Process loaded model (center, scale, etc.)
   */
  processModel(model, options = {}) {
    if (model?.userData?.vrmNormalized || model?.userData?.vrmBindPassthrough) {
      return model;
    }

    let {
      autoCenter = true,
      autoScale = true,
      scale = 1,
      ensureForwardFacing = true,
      orientationMode = 'auto',
    } = options;

    const isUploadedVrm = Boolean(model?.userData?.vrm);
    let preserveOrientation =
      isUploadedVrm || this._shouldPreserveExportedOrientation(model, options);
    if (preserveOrientation || options.autoScale === false) {
      if (preserveOrientation) {
        model.userData.preserveExportedOrientation = true;
        ensureForwardFacing = false;
        orientationMode = 'none';
        autoCenter = false;
      }
      // DGX Blender / template rig GLBs are already ~1 m — autoScale breaks skin bind.
      autoScale = false;
    }

    console.log('processModel called with options:', {
      autoCenter,
      autoScale,
      scale,
      ensureForwardFacing,
      orientationMode,
      preserveExportedOrientation: preserveOrientation,
    });

    const applyOrientation = () => {
      if (orientationMode === 'none') {
        return;
      }
      if (orientationMode === 'core3d') {
        model.rotation.y += Math.PI;
        model.updateMatrixWorld(true);
        console.log('🎯 Applied Core3D orientation correction');
      } else if (ensureForwardFacing && orientationMode === 'auto') {
        this.ensureModelOrientation(model);
      }
    };

    const useMeshOnlyBounds =
      modelHasSkinnedMesh(model) ||
      Boolean(model?.userData?.autoRigMeta) ||
      countModelBones(model) > 0;
    const useViewportFloorBounds =
      !isUploadedVrm &&
      (Boolean(model?.userData?.fromAigc) ||
        Boolean(model?.userData?.preserveExportedOrientation)) &&
      (modelHasSkinnedMesh(model) || countModelBones(model) > 0);

    const layoutBoundsFor = (target) => {
      if (useViewportFloorBounds) {
        const floorBox = getViewportFloorAnchorBounds(target);
        if (!floorBox.isEmpty()) return floorBox;
      }
      if (useMeshOnlyBounds) return getViewportLayoutBounds(target);
      return new THREE.Box3().setFromObject(target);
    };

    if (autoCenter || autoScale) {
      const box = layoutBoundsFor(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      // Check if model has valid dimensions
      if (maxDim === 0 || !isFinite(maxDim)) {
        console.warn('Model has invalid or zero dimensions, using default scale');
        model.scale.setScalar(scale);
      } else {
        const targetScale = autoScale ? (2 / maxDim) * scale : scale;
        console.log('Initial model bounds:', {
          min: box.min,
          max: box.max,
          center,
          size,
          maxDim,
          targetScale,
          meshOnlyBounds: useMeshOnlyBounds,
        });
        model.scale.setScalar(targetScale);
      }
      applyOrientation();
      model.updateMatrixWorld(true);
      if (modelHasSkinnedMesh(model)) {
        rebindSkinnedMeshes(model);
      }

              if (autoCenter) {
                // Recalculate bounding box after rotation and scaling
                const rotatedBox = layoutBoundsFor(model);
                
                // Check if rotated box is valid
                if (rotatedBox.isEmpty() || !isFinite(rotatedBox.min.y) || !isFinite(rotatedBox.max.y)) {
                  console.warn('Model has invalid bounding box after processing, using default positioning');
                  model.position.set(0, 0, 0);
                } else {
                  // Position model so feet are at the ground plane (y = 0)
                  const modelBottom = rotatedBox.min.y;
                  
                  // Move the model down so its bottom is at y = 0
                  model.position.y = -modelBottom;
                  model.position.x = 0;
                  model.position.z = 0;
                }
                
                // Update controls target to look at the model center
                if (this.controls) {
                  this.controls.target.set(0, 1, 0); // Look at center height of a typical human
                }
                
                console.log('Model positioning:', {
                  originalBox: { min: box.min, max: box.max },
                  rotatedBox: { min: rotatedBox.min, max: rotatedBox.max },
                  modelBottom: rotatedBox.min.y,
                  finalPosition: model.position,
                  scale: model.scale,
                  controlsTarget: this.controls ? this.controls.target : 'no controls'
                });

                if (modelHasSkinnedMesh(model)) {
                  model.updateMatrixWorld(true);
                  rebindSkinnedMeshes(model);
                }
              }
    } else {
      applyOrientation();
    }

    if (useMeshOnlyBounds || modelHasSkinnedMesh(model) || countModelBones(model) > 0) {
      normalizeRiggedModelTransforms(model, {
        label: 'processModel',
        preserveExportedOrientation: preserveOrientation,
      });
    }

    return model;
  }

  /**
   * Ensure model is positioned with feet on the ground
   */
  ensureModelOnGround() {
    if (!this.currentModel) return;

    if (this.currentModel.userData?.vrmNormalized) {
      return;
    }

    if (this.currentModel.userData?.preserveExportedOrientation) {
      if (modelHasSkinnedMesh(this.currentModel)) {
        alignSkinnedMeshToRig(this.currentModel);
        this.currentModel.updateMatrixWorld(true);
        rebindSkinnedMeshes(this.currentModel);
        const shiftY = anchorModelFeetToFloor(this.currentModel);
        if (Math.abs(shiftY) > 0.001) {
          console.log('[Rig] Floor-anchored preserved-orientation avatar', { shiftY });
        }
      }
      return;
    }

    const useLayoutBounds =
      modelHasSkinnedMesh(this.currentModel) ||
      countModelBones(this.currentModel) > 0;
    const box = useLayoutBounds
      ? getViewportFloorAnchorBounds(this.currentModel, { meshFeetOnly: true })
      : new THREE.Box3().setFromObject(this.currentModel);
    
    // Check if bounding box is valid
    if (box.isEmpty() || !isFinite(box.min.y) || !isFinite(box.max.y)) {
      console.warn('Model has invalid bounding box, skipping ground positioning');
      return;
    }
    
    const modelBottom = box.min.y;
    
    if (Math.abs(modelBottom) > 0.001) {
      this.currentModel.position.y -= modelBottom;
      console.log('Model moved to ground level:', {
        originalBottom: modelBottom,
        newPosition: this.currentModel.position
      });
    }

    if (modelHasSkinnedMesh(this.currentModel)) {
      this.currentModel.updateMatrixWorld(true);
      rebindSkinnedMeshes(this.currentModel);
    }
    
    if (
      !this.currentModel?.userData?.fromAigc &&
      !this.currentModel?.userData?.preserveExportedOrientation
    ) {
      this.ensureModelOrientation();
    }
  }

  /**
   * Fix GLTF/GLB materials after 3DAIGC-API download (VRM uses different texture rules).
   */
  prepareGltfMaterialsForDisplay(root = this.currentModel) {
    if (!root) return;

    root.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      this.ensureMeshVertexNormals(child);
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (root.userData?.fromAigc) {
          mat.side = THREE.DoubleSide;
        }
        const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
        for (const key of maps) {
          const tex = mat[key];
          if (!tex) continue;
          tex.colorSpace =
            key === 'map' || key === 'emissiveMap' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
          tex.flipY = true;
          tex.needsUpdate = true;
        }
        mat.wireframe = false;
        mat.transparent = false;
        mat.opacity = 1.0;
        mat.needsUpdate = true;
      }
    });

    if (this.scene && this.originalSceneBackground && !this.renderer?.xr?.isPresenting) {
      if (!this.scene.environment && this.originalSceneBackground instanceof THREE.Texture) {
        this.scene.environment = this.originalSceneBackground;
      }
    }
  }

  isVrmMaterial(material) {
    return Boolean(
      material?.userData?.vrmMaterial ||
        material?.userData?.isVRMMaterial ||
        material?.type === 'VRMMaterial',
    );
  }

  /**
   * Ensure model is properly oriented (facing forward)
   */
  ensureModelOrientation(targetModel = this.currentModel) {
    if (!targetModel) return;
    
    try {
      targetModel.updateMatrixWorld(true);
      const modelForward = new THREE.Vector3();
      targetModel.getWorldDirection(modelForward);
      
      // getWorldDirection returns the direction of the negative Z axis in world space
      // Camera is typically at +Z looking toward origin (at 0,0,0)
      // We want models to face toward -Z (toward the camera)
      // If modelForward.z > 0, model is facing away (toward +Z) - needs rotation
      // If modelForward.z < 0, model is facing toward camera (toward -Z) - correct
      
      console.log('🔍 Orientation check - model forward direction:', modelForward);
      console.log('🔍 Model rotation before check:', targetModel.rotation);
      
      if (modelForward.z > 0.1) { // Use small threshold to avoid floating point issues
        console.log('🔄 Model forward vector points away from camera (z > 0), rotating 180 degrees');
        targetModel.rotation.y += Math.PI;
        targetModel.updateMatrixWorld(true);
        
        // Verify after rotation
        const newForward = new THREE.Vector3();
        targetModel.getWorldDirection(newForward);
        console.log('🔄 After rotation - forward:', newForward, 'rotation:', targetModel.rotation);
        
        if (newForward.z > 0.1) {
          console.warn('⚠️ Model still facing wrong direction after rotation, applying additional 180° rotation');
          targetModel.rotation.y += Math.PI;
          targetModel.updateMatrixWorld(true);
        } else {
          console.log('✅ Model now facing camera correctly');
        }
      } else if (modelForward.z < -0.1) {
        console.log('✅ Model orientation already faces the camera (z < 0)');
      } else {
        // modelForward.z is close to 0, model might be facing sideways
        console.log('⚠️ Model forward vector is close to zero (sideways?), checking X component');
        if (Math.abs(modelForward.x) > Math.abs(modelForward.z)) {
          // Model is facing more in X direction than Z
          if (modelForward.x > 0) {
            console.log('🔄 Model facing +X, rotating -90 degrees');
            targetModel.rotation.y -= Math.PI / 2;
          } else {
            console.log('🔄 Model facing -X, rotating +90 degrees');
            targetModel.rotation.y += Math.PI / 2;
          }
          targetModel.updateMatrixWorld(true);
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to evaluate model orientation, applying fallback rotation:', error);
      targetModel.rotation.y += Math.PI;
      targetModel.updateMatrixWorld(true);
    }
  }

  /**
   * Skeleton gizmos draw on top so joints inside the head (eyes) stay visible at all angles.
   * @param {THREE.Object3D} obj
   * @param {number} [renderOrder]
   */
  _applySkeletonOverlayRenderState(obj, renderOrder = 9998) {
    obj.renderOrder = renderOrder;
    obj.frustumCulled = false;
    const mat = obj.material;
    if (!mat) return;
    mat.depthTest = false;
    mat.depthWrite = false;
    mat.transparent = true;
  }

  _ensureSkeletonOverlayGroup(modelRoot) {
    if (!modelRoot) return null;
    let overlay = modelRoot.userData?.skeletonOverlayGroup;
    if (overlay?.parent === modelRoot) return overlay;
    overlay = new THREE.Group();
    overlay.name = 'SkeletonOverlay';
    modelRoot.add(overlay);
    modelRoot.userData.skeletonOverlayGroup = overlay;
    return overlay;
  }

  _worldToModelLocal(modelRoot, worldPos, target = new THREE.Vector3()) {
    target.copy(worldPos);
    if (modelRoot) modelRoot.worldToLocal(target);
    return target;
  }

  /**
   * @param {THREE.Bone} bone
   * @param {number} color
   * @returns {THREE.Mesh|null}
   */
  _createBoneHelperMesh(bone, color = 0xff6600, sphereSize) {
    const boneName = bone.name || 'bone';
    const modelRoot = this.currentModel ?? this._resolveExpressionVRM()?.scene;
    const radius = sphereSize ?? getSkeletonJointSphereRadius();
    const geometry = new THREE.SphereGeometry(radius, 12, 10);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
    });
    const boneHelper = new THREE.Mesh(geometry, material);
    this._applySkeletonOverlayRenderState(boneHelper, 9998);
    const worldPos = new THREE.Vector3();
    getBoneDisplayWorldPosition(bone, modelRoot, worldPos);
    this._worldToModelLocal(modelRoot, worldPos, boneHelper.position);
    boneHelper.userData.boneName = boneName;
    boneHelper.userData.isBoneHelper = true;
    boneHelper.userData.originalBone = bone;
    boneHelper.userData.sphereRadius = radius;
    return boneHelper;
  }

  /**
   * Create bone visualization for skeleton mode
   */
  createBoneVisualization() {
    try {
      console.log('Creating bone visualization...');
      const expressionVrm = this._resolveExpressionVRM();
      const modelRoot = this.currentModel ?? expressionVrm?.scene;
      if (!modelRoot) {
        console.log('No viewport model root for bone visualization');
        return;
      }

      modelRoot.updateMatrixWorld(true);
      const skinned = findPrimarySkinnedMesh(modelRoot);
      if (skinned?.skeleton) {
        skinned.skeleton.update();
      }
      if (
        modelRoot.userData?.avatarFromImage ||
        modelRoot.userData?.preserveExportedOrientation
      ) {
        alignSkinnedMeshToRig(modelRoot);
        rebindSkinnedMeshes(modelRoot);
        modelRoot.updateMatrixWorld(true);
      }

      // Remove existing bone visualization
      this.clearBoneVisualization();

      const boneHelpers = [];
      const boneConnections = [];
      
      // Initialize skeleton selection state
      this.selectedBone = null;
      this.boneHelpers = [];

      const jointRadius = getSkeletonJointSphereRadius();

      // VRM humanoid nodes are often Normalized_* helpers — skinned meshes bind to
      // their own skeleton.bones (Hips, Spine, …). Visualize that rig, not humanoid.
      if (expressionVrm?.humanoid || modelRoot.userData?.vrm) {
        const rigBones = getPrimarySkeletonBones(modelRoot);
        const skinned = findPrimarySkinnedMesh(modelRoot);
        console.log(
          'Creating VRM bone visualization from skinned mesh',
          skinned?.name ?? '(unknown)',
          'bones:',
          rigBones.length,
          rigBones.slice(0, 6).map((b) => b.name),
        );
        this._addBoneHelpersFromRigBones(
          rigBones,
          boneHelpers,
          boneConnections,
          0xff0000,
          jointRadius,
        );
      } else {
        console.log('Creating non-VRM bone visualization');
        const rigBones = getPrimarySkeletonBones(modelRoot);
        console.log('Rig bones collected:', rigBones.length, rigBones.map((b) => b.name));
        if (
          rigBones.length === 0 &&
          modelRoot.userData?.autoRigMeta?.bone_count > 0
        ) {
          console.warn(
            '🦴 Auto-rig job reported',
            modelRoot.userData.autoRigMeta.bone_count,
            'bones but the loaded GLB has no armature. Restart dev server after API update, or re-run auto-rig to refresh FBX fallback.',
          );
        }
        this._addBoneHelpersFromRigBones(
          rigBones,
          boneHelpers,
          boneConnections,
          0xff6600,
          jointRadius,
        );
      }

      // Store bone helpers and connections for cleanup
      this.boneHelpers = boneHelpers;
      this.boneConnections = boneConnections;
      console.log('Created bone visualization with', boneHelpers.length, 'bones and', boneConnections.length, 'connections');
      
      // Setup mouse interaction for skeleton selection
      this.setupSkeletonMouseInteraction();
      
      // If no bones were found, create a simple fallback visualization
      if (boneHelpers.length === 0) {
        console.log('No bones found, creating fallback visualization');
        this.createFallbackBoneVisualization();
      } else {
        console.log('Bones found, skipping fallback visualization');
      }
    } catch (error) {
      console.error('Error in createBoneVisualization:', error);
      // Clear any partial bone visualization on error
      this.clearBoneVisualization();
    }
  }

  /**
   * Create fallback bone visualization when no bones are found
   */
  createFallbackBoneVisualization() {
    try {
      console.log('Creating fallback bone visualization');
      
      const modelRoot = this.currentModel ?? this._resolveExpressionVRM()?.scene;
      // Create a simple wireframe box to represent the model's bounding box
      if (modelRoot && this.scene) {
        const box = new THREE.Box3().setFromObject(modelRoot);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        const geometry = new THREE.BoxGeometry(size.x * 0.8, size.y * 0.8, size.z * 0.8);
        const material = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00,
          wireframe: true,
          transparent: true,
          opacity: 0.3
        });
        const wireframeBox = new THREE.Mesh(geometry, material);
        wireframeBox.position.copy(center);
        wireframeBox.userData.isFallbackBone = true;
        
        this.scene.add(wireframeBox);
        this.boneHelpers = [wireframeBox];
        this.boneConnections = [];
        
        console.log('Created fallback wireframe box');
      }
    } catch (error) {
      console.warn('Error creating fallback bone visualization:', error);
    }
  }

  /**
   * Create bone connections for VRM models
   */
  createBoneConnections(humanoid, boneConnections) {
    try {
      const bonePositions = new Map();
      const humanoidBoneNames = getHumanoidBoneNames(humanoid);

      if (humanoidBoneNames.length > 0) {
        humanoidBoneNames.forEach((boneName) => {
          try {
            const bone = getHumanoidRigBone(humanoid, boneName);
            if (bone) {
              const worldPosition = new THREE.Vector3();
              bone.getWorldPosition(worldPosition);
              bonePositions.set(boneName, worldPosition);
            }
          } catch (error) {
            console.warn('Error getting bone position for', boneName, error);
          }
        });

        humanoidBoneNames.forEach((boneName) => {
          try {
            const bone = getHumanoidRigBone(humanoid, boneName);
            if (bone && bone.parent && bone.parent.isBone) {
              const parentPosition = bonePositions.get(bone.parent.name);
              if (parentPosition) {
                const boneWorldPosition = new THREE.Vector3();
                bone.getWorldPosition(boneWorldPosition);
                const geometry = new THREE.BufferGeometry().setFromPoints([
                  parentPosition,
                  boneWorldPosition
                ]);
                const material = new THREE.LineBasicMaterial({
                  color: 0xff6600,
                  transparent: true,
                  opacity: 1.0,
                  depthTest: false,
                  depthWrite: false,
                });
                const connection = new THREE.Line(geometry, material);
                this._applySkeletonOverlayRenderState(connection, 9997);
                connection.userData.isBoneConnection = true;
                if (this.scene) {
                  this.scene.add(connection);
                  boneConnections.push(connection);
                  console.log('Added bone connection from', bone.parent.name, 'to', boneName);
                } else {
                  console.warn('No scene available to add bone connection');
                }
              }
            }
          } catch (error) {
            console.warn('Error creating bone connection for', boneName, error);
          }
        });
      }
    } catch (error) {
      console.warn('Error in createBoneConnections:', error);
    }
  }

  /**
   * @param {THREE.Bone[]} bones
   * @param {THREE.Mesh[]} boneHelpers
   * @param {THREE.Line[]} boneConnections
   * @param {number} color
   */
  _addBoneHelpersFromRigBones(bones, boneHelpers, boneConnections, color, jointRadius) {
    const modelRoot = this.currentModel ?? this._resolveExpressionVRM()?.scene;
    const overlay = this._ensureSkeletonOverlayGroup(modelRoot);
    const parent = overlay || this.scene;
    bones.forEach((bone) => {
      try {
        const boneHelper = this._createBoneHelperMesh(bone, color, jointRadius);
        if (boneHelper && parent) {
          parent.add(boneHelper);
          boneHelpers.push(boneHelper);
        }
      } catch (error) {
        console.warn('Error creating bone helper for', bone.name, error);
      }
    });
    try {
      this.createBoneConnectionsFromBones(bones, boneConnections, parent, modelRoot);
    } catch (error) {
      console.warn('Error creating bone connections:', error);
    }
  }

  /**
   * Create bone connections for rig bones (scene graph or SkinnedMesh skeleton).
   */
  createBoneConnectionsFromBones(bones, boneConnections, parent = this.scene, modelRoot = null) {
    try {
      const root = modelRoot ?? this.currentModel ?? this._resolveExpressionVRM()?.scene;
      const attachParent = parent || this.scene;
      const bonePositions = new Map();
      const worldPos = new THREE.Vector3();
      const localPos = new THREE.Vector3();

      bones.forEach((bone) => {
        try {
          getBoneDisplayWorldPosition(bone, root, worldPos);
          bonePositions.set(bone.name, this._worldToModelLocal(root, worldPos, localPos.clone()));
        } catch (error) {
          console.warn('Error getting bone position for', bone.name, error);
        }
      });

      bones.forEach((bone) => {
        try {
          const parentBone = bone.parent;
          if (parentBone?.isBone) {
            const parentPosition = bonePositions.get(parentBone.name);
            if (parentPosition) {
              const childLocal = bonePositions.get(bone.name);
              if (!childLocal) return;
              const geometry = new THREE.BufferGeometry().setFromPoints([
                parentPosition,
                childLocal,
              ]);
              const material = new THREE.LineBasicMaterial({
                color: 0xff6600,
                transparent: true,
                opacity: 1.0,
                depthTest: false,
                depthWrite: false,
              });
              const connection = new THREE.Line(geometry, material);
              this._applySkeletonOverlayRenderState(connection, 9997);
              connection.userData.isBoneConnection = true;
              if (attachParent) {
                attachParent.add(connection);
                boneConnections.push(connection);
              }
            }
          }
        } catch (error) {
          console.warn('Error creating bone connection for', bone.name, error);
        }
      });
    } catch (error) {
      console.warn('Error in createBoneConnectionsFromBones:', error);
    }
  }

  /**
   * Create bone connections for non-VRM models
   */
  createBoneConnectionsForModel(model, boneConnections) {
    this.createBoneConnectionsFromBones(collectModelBones(model), boneConnections);
  }

  /**
   * Clear bone visualization
   */
  clearBoneVisualization() {
    try {
      const modelRoot = this.currentModel ?? this._resolveExpressionVRM()?.scene;
      const overlay = modelRoot?.userData?.skeletonOverlayGroup;
      if (overlay) {
        while (overlay.children.length > 0) {
          overlay.remove(overlay.children[0]);
        }
      }

      const removeFrom = (parent, items) => {
        if (!items || !parent) return;
        items.forEach((helper) => {
          try {
            parent.remove(helper);
          } catch (error) {
            console.warn('Error removing bone overlay:', error);
          }
        });
      };

      if (this.boneHelpers?.length) {
        removeFrom(overlay || this.scene, this.boneHelpers);
        this.boneHelpers = [];
      }

      if (this.boneConnections?.length) {
        removeFrom(overlay || this.scene, this.boneConnections);
        this.boneConnections = [];
      }
      
        // Clear selection state
        this.selectedBone = null;
        this.selectedBones.clear();
        
        // Clean up mouse interaction
        this.cleanupSkeletonMouseInteraction();
      } catch (error) {
        console.warn('Error in clearBoneVisualization:', error);
      }
    }

    /**
     * Clean up mouse interaction for skeleton selection
     */
    cleanupSkeletonMouseInteraction() {
      if (!this.container) return;
      
      // Remove event listeners
      if (this.skeletonClickHandler) {
        this.container.removeEventListener('click', this.skeletonClickHandler);
        this.skeletonClickHandler = null;
      }
      if (this.skeletonDoubleClickHandler) {
        this.container.removeEventListener('dblclick', this.skeletonDoubleClickHandler);
        this.skeletonDoubleClickHandler = null;
      }
      if (this.skeletonMouseDownHandler) {
        this.container.removeEventListener('mousedown', this.skeletonMouseDownHandler);
        this.skeletonMouseDownHandler = null;
      }
      if (this.skeletonMouseMoveHandler) {
        this.container.removeEventListener('mousemove', this.skeletonMouseMoveHandler);
        this.skeletonMouseMoveHandler = null;
      }
      if (this.skeletonMouseUpHandler) {
        this.container.removeEventListener('mouseup', this.skeletonMouseUpHandler);
        this.skeletonMouseUpHandler = null;
      }
      
      // Clean up bounding box selection
      this.boundingBoxSelection.isActive = false;
      this.removeBoundingBoxElement();
      
      console.log('Skeleton mouse interaction cleanup complete');
    }

  /**
   * Setup mouse interaction for skeleton selection
   */
  setupSkeletonMouseInteraction() {
    if (!this.container || !this.raycaster) return;
    
    // Remove existing listeners if any
    if (this.skeletonClickHandler) {
      this.container.removeEventListener('click', this.skeletonClickHandler);
    }
    if (this.skeletonDoubleClickHandler) {
      this.container.removeEventListener('dblclick', this.skeletonDoubleClickHandler);
    }
    if (this.skeletonMouseDownHandler) {
      this.container.removeEventListener('mousedown', this.skeletonMouseDownHandler);
    }
    if (this.skeletonMouseMoveHandler) {
      this.container.removeEventListener('mousemove', this.skeletonMouseMoveHandler);
    }
    if (this.skeletonMouseUpHandler) {
      this.container.removeEventListener('mouseup', this.skeletonMouseUpHandler);
    }
    
    // Create event handlers
    this.skeletonClickHandler = (event) => {
      this.handleSkeletonClick(event);
    };
    
    this.skeletonDoubleClickHandler = (event) => {
      this.handleSkeletonDoubleClick(event);
    };
    
    this.skeletonMouseDownHandler = (event) => {
      this.handleSkeletonMouseDown(event);
    };
    
    this.skeletonMouseMoveHandler = (event) => {
      this.handleSkeletonMouseMove(event);
    };
    
    this.skeletonMouseUpHandler = (event) => {
      this.handleSkeletonMouseUp(event);
    };
    
    // Add event listeners
    this.container.addEventListener('click', this.skeletonClickHandler);
    this.container.addEventListener('dblclick', this.skeletonDoubleClickHandler);
    this.container.addEventListener('mousedown', this.skeletonMouseDownHandler);
    this.container.addEventListener('mousemove', this.skeletonMouseMoveHandler);
    this.container.addEventListener('mouseup', this.skeletonMouseUpHandler);
    
    console.log('Skeleton mouse interaction setup complete');
  }

  /**
   * Handle mouse click for skeleton selection
   */
  handleSkeletonClick(event) {
    if (!this.boneHelpers || this.boneHelpers.length === 0) {
      console.log('No bone helpers available for selection');
      return;
    }
    
    // Only handle clicks in skeleton mode
    if (this.renderMode !== 'skeleton') {
      console.log('Not in skeleton mode, ignoring click');
      return;
    }
    
    const rect = this.container.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update raycaster
    this.raycaster.setFromCamera(mouse, this.camera);
    
    // Intersect with bone helpers
    const intersects = this.raycaster.intersectObjects(this.boneHelpers);
    
    console.log('Skeleton click - intersects:', intersects.length);
    
    if (intersects.length > 0) {
      const selectedHelper = intersects[0].object;
      const boneName = selectedHelper.userData.boneName;
      
      console.log('Selected bone:', boneName);
      
      // Toggle selection
      if (this.selectedBones.has(boneName)) {
        this.removeBoneFromSelection(boneName);
      } else {
        this.addBoneToSelection(boneName);
      }
    } else {
      // Click outside model: deselect all
      this.deselectAllBones();
    }
  }

  /**
   * Handle double-click for bounding box selection
   */
  handleSkeletonDoubleClick(event) {
    if (this.renderMode !== 'skeleton') return;
    
    // Start bounding box selection on double-click
    this.startBoundingBoxSelection(event);
  }

  /**
   * Handle mouse down for bounding box selection
   */
  handleSkeletonMouseDown(event) {
    if (this.renderMode !== 'skeleton') return;
    
    // Start bounding box selection on double-click drag
    if (event.button === 0 && this.boundingBoxSelection.isActive) {
      // Continue with existing bounding box
    }
  }

  /**
   * Handle mouse move for bounding box selection
   */
  handleSkeletonMouseMove(event) {
    if (this.renderMode !== 'skeleton') return;
    
    if (this.boundingBoxSelection.isActive) {
      this.updateBoundingBoxSelection(event);
    }
  }

  /**
   * Handle mouse up for bounding box selection
   */
  handleSkeletonMouseUp(event) {
    if (this.renderMode !== 'skeleton') return;
    
    if (this.boundingBoxSelection.isActive && event.button === 0) {
      this.finishBoundingBoxSelection(event);
    }
  }

  /**
   * Start bounding box selection
   */
  startBoundingBoxSelection(event) {
    const rect = this.container.getBoundingClientRect();
    
    this.boundingBoxSelection.isActive = true;
    this.boundingBoxSelection.startX = event.clientX - rect.left;
    this.boundingBoxSelection.startY = event.clientY - rect.top;
    this.boundingBoxSelection.endX = this.boundingBoxSelection.startX;
    this.boundingBoxSelection.endY = this.boundingBoxSelection.startY;
    
    // Create visual bounding box element
    this.createBoundingBoxElement();
    
    console.log('Started bounding box selection');
  }

  /**
   * Update bounding box selection
   */
  updateBoundingBoxSelection(event) {
    if (!this.boundingBoxSelection.isActive) return;
    
    const rect = this.container.getBoundingClientRect();
    this.boundingBoxSelection.endX = event.clientX - rect.left;
    this.boundingBoxSelection.endY = event.clientY - rect.top;
    
    this.updateBoundingBoxElement();
  }

  /**
   * Finish bounding box selection
   */
  finishBoundingBoxSelection(event) {
    if (!this.boundingBoxSelection.isActive) return;
    
    const rect = this.container.getBoundingClientRect();
    this.boundingBoxSelection.endX = event.clientX - rect.left;
    this.boundingBoxSelection.endY = event.clientY - rect.top;
    
    // Select bones within bounding box
    this.selectBonesInBoundingBox();
    
    // Clean up
    this.boundingBoxSelection.isActive = false;
    this.removeBoundingBoxElement();
    
    console.log('Finished bounding box selection');
  }

  /**
   * Create visual bounding box element
   */
  createBoundingBoxElement() {
    if (this.boundingBoxSelection.boxElement) {
      this.removeBoundingBoxElement();
    }
    
    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.border = '2px dashed #00ff00';
    box.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
    box.style.pointerEvents = 'none';
    box.style.zIndex = '1000';
    box.style.left = this.boundingBoxSelection.startX + 'px';
    box.style.top = this.boundingBoxSelection.startY + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
    
    this.container.appendChild(box);
    this.boundingBoxSelection.boxElement = box;
  }

  /**
   * Update visual bounding box element
   */
  updateBoundingBoxElement() {
    if (!this.boundingBoxSelection.boxElement) return;
    
    const startX = Math.min(this.boundingBoxSelection.startX, this.boundingBoxSelection.endX);
    const startY = Math.min(this.boundingBoxSelection.startY, this.boundingBoxSelection.endY);
    const width = Math.abs(this.boundingBoxSelection.endX - this.boundingBoxSelection.startX);
    const height = Math.abs(this.boundingBoxSelection.endY - this.boundingBoxSelection.startY);
    
    this.boundingBoxSelection.boxElement.style.left = startX + 'px';
    this.boundingBoxSelection.boxElement.style.top = startY + 'px';
    this.boundingBoxSelection.boxElement.style.width = width + 'px';
    this.boundingBoxSelection.boxElement.style.height = height + 'px';
  }

  /**
   * Remove visual bounding box element
   */
  removeBoundingBoxElement() {
    if (this.boundingBoxSelection.boxElement) {
      this.container.removeChild(this.boundingBoxSelection.boxElement);
      this.boundingBoxSelection.boxElement = null;
    }
  }

  /**
   * Select bones within bounding box
   */
  selectBonesInBoundingBox() {
    if (!this.boneHelpers || this.boneHelpers.length === 0) return;
    
    const rect = this.container.getBoundingClientRect();
    const startX = Math.min(this.boundingBoxSelection.startX, this.boundingBoxSelection.endX);
    const startY = Math.min(this.boundingBoxSelection.startY, this.boundingBoxSelection.endY);
    const endX = Math.max(this.boundingBoxSelection.startX, this.boundingBoxSelection.endX);
    const endY = Math.max(this.boundingBoxSelection.startY, this.boundingBoxSelection.endY);
    
    let selectedCount = 0;
    
    this.boneHelpers.forEach(helper => {
      // Convert 3D position to screen coordinates
      const screenPosition = new THREE.Vector3();
      helper.getWorldPosition(screenPosition);
      screenPosition.project(this.camera);
      
      // Convert to screen pixel coordinates
      const screenX = (screenPosition.x * 0.5 + 0.5) * rect.width;
      const screenY = (screenPosition.y * -0.5 + 0.5) * rect.height;
      
      // Check if within bounding box
      if (screenX >= startX && screenX <= endX && screenY >= startY && screenY <= endY) {
        const boneName = helper.userData.boneName;
        this.addBoneToSelection(boneName);
        selectedCount++;
      }
    });
    
    console.log(`Selected ${selectedCount} bones within bounding box`);
  }

  /**
   * Add bone to selection
   */
  addBoneToSelection(boneName) {
    if (!this.boneHelpers) return;
    
    const helper = this.boneHelpers.find(h => h.userData.boneName === boneName);
    if (helper) {
      this.selectedBones.add(boneName);
      helper.material.color.setHex(0x00ff00); // Green for selected
      
      console.log('Added bone to selection:', boneName);
      this.emit('boneSelected', { boneName, helper, action: 'add' });
    }
  }

  /**
   * Remove bone from selection
   */
  removeBoneFromSelection(boneName) {
    if (!this.boneHelpers) return;
    
    const helper = this.boneHelpers.find(h => h.userData.boneName === boneName);
    if (helper) {
      this.selectedBones.delete(boneName);
      helper.material.color.setHex(0xff0000); // Red for unselected
      
      console.log('Removed bone from selection:', boneName);
      this.emit('boneDeselected', { boneName, helper, action: 'remove' });
    }
  }

  /**
   * Deselect all bones
   */
  deselectAllBones() {
    if (!this.boneHelpers) return;
    
    this.selectedBones.forEach(boneName => {
      const helper = this.boneHelpers.find(h => h.userData.boneName === boneName);
      if (helper) {
        helper.material.color.setHex(0xff0000); // Red for unselected
      }
    });
    
    this.selectedBones.clear();
    console.log('Deselected all bones');
    this.emit('allBonesDeselected');
  }

  /**
   * Select a bone by name (legacy method for compatibility)
   */
  selectBone(boneName) {
    console.log('Attempting to select bone:', boneName);
    
    // Clear previous single selection
    if (this.selectedBone) {
      this.deselectBone();
    }
    
    // Add to multi-selection
    this.addBoneToSelection(boneName);
    this.selectedBone = boneName;
    
    console.log('Bone selected successfully:', boneName);
  }

  /**
   * Deselect current bone
   */
  deselectBone() {
    if (this.selectedBone) {
      const helper = this.boneHelpers.find(h => h.userData.boneName === this.selectedBone);
      if (helper) {
        // Restore original color
        helper.material.color.setHex(0xff0000); // Red for unselected
        console.log('Bone deselected:', this.selectedBone);
        
        // Emit deselection event
        this.emit('boneDeselected', { boneName: this.selectedBone, helper });
      } else {
        console.warn('Bone helper not found for deselection:', this.selectedBone);
      }
      
      this.selectedBone = null;
    }
  }

  /**
   * Highlight bone by name (called from bone hierarchy panel)
   */
  highlightBone(boneName) {
    console.log('Highlighting bone:', boneName);
    
    if (!boneName) {
      this.deselectBone();
      return;
    }
    
    // Ensure we're in skeleton mode
    if (this.renderMode !== 'skeleton') {
      console.log('Switching to skeleton mode for bone highlighting');
      this.setRenderMode('skeleton');
    }
    
    // Find the bone helper
    const helper = this.boneHelpers.find(h => h.userData.boneName === boneName);
    if (helper) {
      console.log('Found bone helper, zooming and selecting');
      // Zoom to the bone
      this.zoomToBone(helper);
      
      // Select the bone
      this.selectBone(boneName);
    } else {
      console.warn('Bone helper not found for highlighting:', boneName);
    }
  }

  /**
   * Zoom camera to a specific bone with smooth animation
   */
  zoomToBone(boneHelper) {
    if (!this.camera || !this.controls || !boneHelper) return;
    
    const bonePosition = boneHelper.position.clone();
    
    // Calculate distance for good viewing angle
    const distance = 0.5; // Adjust this value for closer/farther zoom
    
    // Set camera position relative to bone
    const cameraOffset = new THREE.Vector3(0, 0.2, distance);
    const targetCameraPosition = bonePosition.clone().add(cameraOffset);
    const targetLookAt = bonePosition.clone();
    
    // Store starting positions for animation
    const startCameraPosition = this.camera.position.clone();
    const startLookAt = this.controls.target ? this.controls.target.clone() : new THREE.Vector3();
    
    // Animation parameters
    const duration = 1000; // 1 second animation
    const startTime = performance.now();
    
    // Animation function
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Smooth easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate camera position
      this.camera.position.lerpVectors(startCameraPosition, targetCameraPosition, easeOut);
      
      // Interpolate look-at target
      if (this.controls.target) {
        this.controls.target.lerpVectors(startLookAt, targetLookAt, easeOut);
      }
      
      // Update controls
      this.controls.update();
      
      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log('Animated zoom to bone:', boneHelper.userData.boneName);
      }
    };
    
    // Start animation
    requestAnimationFrame(animate);
  }

  /**
   * Set camera mode
   * @param {string} mode - Camera mode (orbit, first-person, fixed)
   */
  setCameraMode(mode) {
    if (!this.controls) return;
    
    console.log(`📷 Setting camera mode: ${mode}`);
    
    switch (mode) {
      case 'orbit':
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
        this.controls.enableRotate = true;
        break;
      case 'first-person':
        this.controls.enableDamping = false;
        this.controls.enableZoom = false;
        this.controls.enablePan = false;
        this.controls.enableRotate = true;
        break;
      case 'fixed':
        this.controls.enableDamping = false;
        this.controls.enableZoom = false;
        this.controls.enablePan = false;
        this.controls.enableRotate = false;
        break;
    }
  }

  /**
   * Reset camera to default position
   */
  resetCamera() {
    if (!this.camera || !this.controls) return;
    
    console.log('🔄 Resetting camera to default position');
    
    // Reset camera position
    this.camera.position.set(0, 2.5, 2.5);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /**
   * Set camera view with smooth animation
   * @param {string} view - View preset (Front, Back, Left, Right, Top, Bottom, Isometric)
   */
  setView(view) {
    if (!this.camera || !this.controls) return;
    
    console.log(`👁️ Setting camera view: ${view}`);
    
    // Store current position and target
    const currentPosition = this.camera.position.clone();
    const currentTarget = this.controls.target.clone();
    
    // Calculate current distance from target
    const currentDistance = currentPosition.distanceTo(currentTarget);
    console.log(`📏 Current distance from target: ${currentDistance.toFixed(2)}`);
    
    // Calculate target position and target
    let targetPosition, targetLookAt;
    
    // Use the current distance to maintain consistent zoom level
    const distance = currentDistance;
    
    // Use the current target as the focus point for all views
    const focusPoint = currentTarget.clone();
    
    switch (view) {
      case 'Front':
        targetPosition = new THREE.Vector3(focusPoint.x, focusPoint.y, focusPoint.z + distance);
        targetLookAt = focusPoint.clone();
        break;
      case 'Back':
        targetPosition = new THREE.Vector3(focusPoint.x, focusPoint.y, focusPoint.z - distance);
        targetLookAt = focusPoint.clone();
        break;
      case 'Left':
        targetPosition = new THREE.Vector3(focusPoint.x - distance, focusPoint.y, focusPoint.z);
        targetLookAt = focusPoint.clone();
        break;
      case 'Right':
        targetPosition = new THREE.Vector3(focusPoint.x + distance, focusPoint.y, focusPoint.z);
        targetLookAt = focusPoint.clone();
        break;
      case 'Top':
        // Position directly above the model center, always at origin X/Z regardless of previous view
        // Get actual model center if available, otherwise use focus point Y
        let topY = focusPoint.y;
        let topLookAtY = focusPoint.y;
        if (this.currentModel) {
          const box = new THREE.Box3().setFromObject(this.currentModel);
          if (!box.isEmpty()) {
            const modelCenter = box.getCenter(new THREE.Vector3());
            topY = modelCenter.y;
            topLookAtY = modelCenter.y;
          }
        }
        targetPosition = new THREE.Vector3(0, topY + distance, 0);
        targetLookAt = new THREE.Vector3(0, topLookAtY, 0);
        break;
      case 'Bottom':
        // Position directly below the model center, always at origin X/Z regardless of previous view
        // Get actual model center if available, otherwise use focus point Y
        let bottomY = focusPoint.y;
        let bottomLookAtY = focusPoint.y;
        if (this.currentModel) {
          const box = new THREE.Box3().setFromObject(this.currentModel);
          if (!box.isEmpty()) {
            const modelCenter = box.getCenter(new THREE.Vector3());
            bottomY = modelCenter.y;
            bottomLookAtY = modelCenter.y;
          }
        }
        targetPosition = new THREE.Vector3(0, bottomY - distance, 0);
        targetLookAt = new THREE.Vector3(0, bottomLookAtY, 0);
        break;
      case 'Isometric':
        // Calculate isometric distance to maintain same zoom level
        const isoDistance = distance / Math.sqrt(3); // Divide by sqrt(3) to compensate for 3D diagonal
        targetPosition = new THREE.Vector3(
          focusPoint.x + isoDistance, 
          focusPoint.y + isoDistance, 
          focusPoint.z + isoDistance
        );
        targetLookAt = focusPoint.clone();
        break;
    }
    
    console.log(`🎯 Target position:`, targetPosition);
    console.log(`👁️ Target look-at:`, targetLookAt);
    
    // Animate camera transition
    this.animateCameraToPosition(currentPosition, targetPosition, currentTarget, targetLookAt);
  }

  /**
   * Animate camera to target position with smooth transition
   * @param {THREE.Vector3} startPos - Starting position
   * @param {THREE.Vector3} endPos - Ending position
   * @param {THREE.Vector3} startTarget - Starting target
   * @param {THREE.Vector3} endTarget - Ending target
   */
  animateCameraToPosition(startPos, endPos, startTarget, endTarget) {
    const duration = 1000; // 1 second animation
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use easing function for smooth animation
      const easeProgress = this.easeInOutCubic(progress);
      
      // Interpolate position
      this.camera.position.lerpVectors(startPos, endPos, easeProgress);
      
      // Interpolate target
      this.controls.target.lerpVectors(startTarget, endTarget, easeProgress);
      
      // Update controls
      this.controls.update();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  /**
   * Easing function for smooth animation
   * @param {number} t - Progress (0 to 1)
   * @returns {number} Eased progress
   */
  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Toggle performance stats display
   * @param {boolean} show - Whether to show stats
   */
  toggleStats(show) {
    console.log(`📊 Toggling stats: ${show}`);
    
    this.showStats = show;
    
    // Dispatch custom event to notify components
    const event = new CustomEvent('statsToggle', { 
      detail: { showStats: show } 
    });
    window.dispatchEvent(event);
    
    console.log(`Performance stats ${show ? 'enabled' : 'disabled'}`);
  }

  /**
   * Toggle auto-rotate for camera
   */
  toggleAutoRotate() {
    if (!this.controls) return;
    
    this.controls.autoRotate = !this.controls.autoRotate;
    console.log(`🔄 Auto-rotate: ${this.controls.autoRotate ? 'enabled' : 'disabled'}`);
  }

  /**
   * Take screenshot of current scene
   */
  takeScreenshot() {
    if (!this.renderer) return;
    
    console.log('📸 Taking screenshot');
    
    try {
      // Get canvas data URL
      const canvas = this.renderer.domElement;
      const dataURL = canvas.toDataURL('image/png');
      
      // Create download link
      const link = document.createElement('a');
      link.download = `screenshot_${new Date().getTime()}.png`;
      link.href = dataURL;
      link.click();
      
      console.log('Screenshot saved');
    } catch (error) {
      console.error('Failed to take screenshot:', error);
    }
  }

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen() {
    console.log('🖥️ Toggling fullscreen');
    
    if (!document.fullscreenElement) {
      // Enter fullscreen
      if (this.renderer && this.renderer.domElement.requestFullscreen) {
        this.renderer.domElement.requestFullscreen();
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  /**
   * Set lighting preset
   * @param {string} preset - Lighting preset (studio, outdoor, indoor, dramatic, soft, harsh)
   */
  setLighting(preset) {
    if (!this.scene) return;
    
    console.log(`💡 Setting lighting preset: ${preset}`);
    
    // Remove existing lights
    if (Array.isArray(this.scene.children)) {
      const existingLights = this.scene.children.filter((child) => child.isLight);
      existingLights.forEach((light) => this.scene.remove(light));
    }
    
    // Create new lighting based on preset
    switch (preset) {
      case 'studio':
        this._createStudioLighting();
        break;
      case 'outdoor':
        this._createOutdoorLighting();
        break;
      case 'indoor':
        this._createIndoorLighting();
        break;
      case 'dramatic':
        this._createDramaticLighting();
        break;
      case 'soft':
        this._createSoftLighting();
        break;
      case 'harsh':
        this._createHarshLighting();
        break;
      default:
        this._createSoftLighting();
    }
  }

  /**
   * Set light intensity
   * @param {number} intensity - Light intensity (0-2)
   */
  setLightIntensity(intensity) {
    if (!this.scene) return;
    
    console.log(`💡 Setting light intensity: ${intensity}`);
    
    this.scene.traverse((child) => {
      if (child.isLight) {
        if (child.isAmbientLight) {
          child.intensity = intensity * 0.3;
        } else if (child.isDirectionalLight) {
          child.intensity = intensity;
        } else if (child.isPointLight) {
          child.intensity = intensity * 2;
        }
      }
    });
  }

  /**
   * Create studio lighting setup
   * @private
   */
  _createStudioLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);
    
    // Key light (main light)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(5, 5, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    this.scene.add(keyLight);
    
    // Fill light (softer)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-3, 2, 3);
    this.scene.add(fillLight);
    
    // Rim light
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, 5, -5);
    this.scene.add(rimLight);
  }

  /**
   * Create outdoor lighting setup
   * @private
   */
  _createOutdoorLighting() {
    // Bright ambient light
    const ambientLight = new THREE.AmbientLight(0x87CEEB, 0.6);
    this.scene.add(ambientLight);
    
    // Sun light
    const sunLight = new THREE.DirectionalLight(0xFFE4B5, 1.2);
    sunLight.position.set(10, 10, 5);
    sunLight.castShadow = true;
    this.scene.add(sunLight);
  }

  /**
   * Create indoor lighting setup
   * @private
   */
  _createIndoorLighting() {
    // Warm ambient light
    const ambientLight = new THREE.AmbientLight(0xFFF8DC, 0.4);
    this.scene.add(ambientLight);
    
    // Ceiling light
    const ceilingLight = new THREE.DirectionalLight(0xFFFFFF, 0.8);
    ceilingLight.position.set(0, 10, 0);
    this.scene.add(ceilingLight);
    
    // Table lamp
    const tableLight = new THREE.PointLight(0xFFE4B5, 0.5);
    tableLight.position.set(3, 2, 3);
    this.scene.add(tableLight);
  }

  /**
   * Create dramatic lighting setup
   * @private
   */
  _createDramaticLighting() {
    // Low ambient light
    const ambientLight = new THREE.AmbientLight(0x2F2F2F, 0.2);
    this.scene.add(ambientLight);
    
    // Strong directional light
    const mainLight = new THREE.DirectionalLight(0xFFFFFF, 1.5);
    mainLight.position.set(5, 10, 5);
    mainLight.castShadow = true;
    this.scene.add(mainLight);
    
    // Accent light
    const accentLight = new THREE.SpotLight(0xFF6B6B, 0.8);
    accentLight.position.set(-5, 5, 5);
    accentLight.angle = Math.PI / 6;
    this.scene.add(accentLight);
  }

  /**
   * Create soft lighting setup
   * @private
   */
  _createSoftLighting() {
    // High ambient light
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.8);
    this.scene.add(ambientLight);
    
    // Soft directional light
    const softLight = new THREE.DirectionalLight(0xFFFFFF, 0.4);
    softLight.position.set(3, 3, 3);
    this.scene.add(softLight);
  }

  /**
   * Create harsh lighting setup
   * @private
   */
  _createHarshLighting() {
    // Low ambient light
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.1);
    this.scene.add(ambientLight);
    
    // Very bright directional light
    const harshLight = new THREE.DirectionalLight(0xFFFFFF, 2.0);
    harshLight.position.set(0, 10, 0);
    harshLight.castShadow = true;
    this.scene.add(harshLight);
  }

  /**
   * Set auto tone mapping
   * @param {boolean} enabled - Whether auto tone mapping is enabled
   */
  setAutoTone(enabled) {
    if (!this.renderer) return;
    
    console.log(`🎨 Auto tone mapping: ${enabled ? 'enabled' : 'disabled'}`);
    
    this.renderer.toneMappingExposure = enabled ? 1.0 : 1.0;
    this.autoTone = enabled;
  }

  /**
   * Set tone mapping algorithm
   * @param {string} mapping - Tone mapping algorithm (ACES, Reinhard, Linear, Filmic)
   */
  setToneMapping(mapping) {
    if (!this.renderer) return;
    
    console.log(`🎨 Setting tone mapping: ${mapping}`);
    
    switch (mapping) {
      case 'ACES':
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        break;
      case 'Reinhard':
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        break;
      case 'Linear':
        this.renderer.toneMapping = THREE.LinearToneMapping;
        break;
      case 'Filmic':
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        break;
      default:
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
  }

  /**
   * Set exposure value
   * @param {number} exposure - Exposure value (0-3)
   */
  setExposure(exposure) {
    if (!this.renderer) return;
    
    console.log(`📸 Setting exposure: ${exposure}`);
    
    this.renderer.toneMappingExposure = exposure;
  }

  /**
   * Focus camera on the current model
   */
  focusOnModel() {
    if (!this.currentModel || !this.camera || !this.controls) return;

    console.log('Focusing camera on model...');

    const useLayoutBounds =
      modelHasSkinnedMesh(this.currentModel) ||
      countModelBones(this.currentModel) > 0;
    const box = useLayoutBounds
      ? getMeshLayoutBounds(this.currentModel)
      : new THREE.Box3().setFromObject(this.currentModel);
    
    // Check if bounding box is valid
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
      console.warn('Model has invalid bounding box, using default camera position');
      // Use default camera position
      this.camera.position.set(0, 1.5, 1.5);
      this.controls.target.set(0, 1, 0);
      this.controls.update();
      return;
    }
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    console.log('Model center:', center);
    console.log('Model size:', size);
    console.log('Max dimension:', maxDim);

    // Use closer distance for consistent zoom level
    const distance = maxDim > 0 ? maxDim * 1.2 : 1.5;
    const cameraPosition = center.clone();
    cameraPosition.y += distance * 0.2; // Slightly above the model
    cameraPosition.z += distance; // Behind the model

    // Set camera position and target
    this.camera.position.copy(cameraPosition);
    this.controls.target.copy(center);
    this.controls.update();

    console.log('Camera focused on model at:', cameraPosition);
    console.log('Camera looking at:', center);
  }

  /**
   * Focus camera on the face/head of the current model
   * Detects VRM head bone or estimates face position from model geometry
   */
  focusOnFace() {
    if (!this.currentModel || !this.camera || !this.controls) {
      console.warn('Cannot focus on face: missing model, camera, or controls');
      return;
    }

    console.log('🎯 Focusing camera on face...');
    
    let facePosition = null;
    let hasFace = false;

    // Try to find head bone in VRM model
    if (this.currentVRM && this.currentVRM.humanoid) {
      const humanBones = this.currentVRM.humanoid.humanBones;
      
      // Look for head bone
      if (humanBones && humanBones.head && humanBones.head.node) {
        const headBone = humanBones.head.node;
        facePosition = new THREE.Vector3();
        headBone.getWorldPosition(facePosition);
        hasFace = true;
        console.log('✅ Found VRM head bone at:', facePosition);
      }
    }

    // Fallback: Try to find head bone by name in the model
    if (!hasFace && this.currentModel) {
      this.currentModel.traverse((child) => {
        if (child.isBone && (child.name.toLowerCase() === 'head' || 
                             child.name.toLowerCase().includes('head'))) {
          facePosition = new THREE.Vector3();
          child.getWorldPosition(facePosition);
          hasFace = true;
          console.log('✅ Found head bone by name at:', facePosition);
          return; // Stop traversal
        }
      });
    }

    // Fallback: Estimate face position from model bounding box
    if (!hasFace) {
      const box = new THREE.Box3().setFromObject(this.currentModel);
      
      if (!box.isEmpty() && isFinite(box.min.x)) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // Estimate face position: upper portion of the model, slightly forward
        facePosition = center.clone();
        facePosition.y += size.y * 0.3; // Upper portion (head area)
        facePosition.z += size.z * 0.1; // Slightly forward (face forward)
        hasFace = true;
        console.log('📍 Estimated face position from bounding box:', facePosition);
      }
    }

    if (!hasFace || !facePosition) {
      console.warn('⚠️ Could not determine face position, focusing on model center');
      this.focusOnModel();
      return;
    }

    // Calculate camera position for face close-up
    // Position camera in front of face for head-and-shoulders portrait view
    const faceDistance = 0.12; // Very close-up distance for portrait view (head and shoulders)
    const cameraOffset = new THREE.Vector3(0, 0, faceDistance); // Directly in front of face, eye level
    
    // Get model's forward direction (usually -Z in VRM)
    const modelForward = new THREE.Vector3(0, 0, -1);
    if (this.currentModel) {
      // Apply model's rotation to forward vector
      modelForward.applyQuaternion(this.currentModel.quaternion);
    }
    
    // Calculate camera position relative to face
    const targetCameraPosition = facePosition.clone();
    targetCameraPosition.add(cameraOffset);
    
    // Store starting positions for smooth animation
    const startCameraPosition = this.camera.position.clone();
    const startLookAt = this.controls.target ? this.controls.target.clone() : new THREE.Vector3();
    
    // Animation parameters
    const duration = 1000; // 1 second animation
    const startTime = performance.now();
    
    // Animation function
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Smooth easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate camera position
      this.camera.position.lerpVectors(startCameraPosition, targetCameraPosition, easeOut);
      
      // Interpolate look-at target (face position)
      if (this.controls.target) {
        this.controls.target.lerpVectors(startLookAt, facePosition, easeOut);
      }
      
      // Update controls
      this.controls.update();
      
      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log('✅ Camera focused on face at:', facePosition);
      }
    };
    
    // Start animation
    requestAnimationFrame(animate);
  }


  /**
   * Set render mode with auto-focus
   * @param {string} mode - Render mode (solid, wireframe, skeleton, partColorize, rendered)
   */
  setRenderMode(mode) {
    this.renderMode = mode;
    this.updateRenderMode(mode);
    
    // Auto-focus on model when changing render modes for better viewing
    if (this.currentModel) {
      setTimeout(() => {
        this.focusOnModel();
      }, 100); // Small delay to ensure render mode is applied first
    }
    
    this.emit('renderModeChanged', { mode });
  }

  /**
   * Store original materials when model is loaded
   */
  storeOriginalMaterials() {
    const roots = this._getViewportRenderRoots();
    if (!roots.length) return;

    console.log('🔧 Storing original materials...');

    roots.forEach((root) => this._storeOriginalMaterialsOnRoot(root));
  }

  _storeOriginalMaterialsOnRoot(root) {
    if (!root) return;

    root.traverse((child) => {
      if (child.isMesh && child.material) {
        // Only store if not already stored
        if (!child.userData.originalMaterial) {
          // Store original material (support single or multi-material)
          if (Array.isArray(child.material)) {
            child.userData.originalMaterial = child.material.map((m) => (m && typeof m.clone === 'function' ? m.clone() : m));
            // For array materials, store color from first material if available
            const firstMaterial = child.material[0];
            if (firstMaterial && firstMaterial.color) {
              if (typeof firstMaterial.color.clone === 'function') {
                child.userData.originalColor = firstMaterial.color.clone();
              } else {
                child.userData.originalColor = new THREE.Color(firstMaterial.color);
              }
            }
          } else {
            child.userData.originalMaterial = child.material && typeof child.material.clone === 'function' ? child.material.clone() : child.material;
            // Store color if material has a color property
            if (child.material && child.material.color) {
              if (typeof child.material.color.clone === 'function') {
                child.userData.originalColor = child.material.color.clone();
              } else {
                // Fallback: create a new Color from the existing one
                child.userData.originalColor = new THREE.Color(child.material.color);
              }
            }
          }
          
          // Enhanced material preservation for all material types
          const materialType = Array.isArray(child.material) 
            ? `Array[${child.material.length}]` 
            : (child.material?.type || 'unknown');
          console.log(`🎨 Storing material for: ${child.name} (${materialType})`);
          
          // Store material properties (only for single material, not arrays)
          if (!Array.isArray(child.material) && child.material) {
            child.userData.originalMaterialType = child.material.type;
            child.userData.originalOpacity = child.material.opacity;
            child.userData.originalTransparent = child.material.transparent;
            child.userData.originalSide = child.material.side;
          }
          
          // Store textures if they exist
          if (child.material.map) {
            child.userData.originalMap = child.material.map;
            console.log(`📷 Stored texture map for: ${child.name}`);
          }
          if (child.material.normalMap) {
            child.userData.originalNormalMap = child.material.normalMap;
          }
          if (child.material.roughnessMap) {
            child.userData.originalRoughnessMap = child.material.roughnessMap;
          }
          if (child.material.metalnessMap) {
            child.userData.originalMetalnessMap = child.material.metalnessMap;
          }
          if (child.material.emissiveMap) {
            child.userData.originalEmissiveMap = child.material.emissiveMap;
          }
          
          // Store VRM-specific properties
          if (child.material.userData?.vrmMaterial || child.material.userData?.isVRMMaterial) {
            child.userData.isVRMMaterial = true;
            child.userData.originalVRMMaterial = true;
            console.log(`🎨 Preserving VRM material for: ${child.name}`);
          }
        }
      }
    });
    
    console.log('✅ Original materials stored');
  }

  /**
   * Restore original materials
   */
  restoreOriginalMaterials() {
    if (!this.currentModel) return;
    
    console.log('🔧 Restoring original materials...');
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.userData.originalMaterial) {
        // Restore original material properties
        const original = child.userData.originalMaterial;
        child.material.color.copy(child.userData.originalColor);
        child.material.wireframe = original.wireframe;
        child.material.transparent = original.transparent;
        child.material.opacity = original.opacity;
        
        // Restore textures if they were stored
        if (child.userData.originalMap) {
          child.material.map = child.userData.originalMap;
          child.material.map.needsUpdate = true;
          console.log(`📷 Restored texture map for: ${child.name}`);
        }
        if (child.userData.originalNormalMap) {
          child.material.normalMap = child.userData.originalNormalMap;
          child.material.normalMap.needsUpdate = true;
        }
        if (child.userData.originalRoughnessMap) {
          child.material.roughnessMap = child.userData.originalRoughnessMap;
          child.material.roughnessMap.needsUpdate = true;
        }
        if (child.userData.originalMetalnessMap) {
          child.material.metalnessMap = child.userData.originalMetalnessMap;
          child.material.metalnessMap.needsUpdate = true;
        }
        if (child.userData.originalEmissiveMap) {
          child.material.emissiveMap = child.userData.originalEmissiveMap;
          child.material.emissiveMap.needsUpdate = true;
        }
        
        // Enhanced VRM material restoration
        if (child.userData.isVRMMaterial || child.userData.originalVRMMaterial) {
          console.log(`🎨 Restoring VRM material for: ${child.name}`);
          
          // Ensure VRM material properties are maintained
          this.ensureVRMMaterialProperties(child.material);
        }
        
        // Ensure material needs update for proper rendering
        child.material.needsUpdate = true;
        
        console.log(`✅ Material restored for: ${child.name}`);
      }
    });
    
    console.log('✅ Original materials restored');
  }

  /**
   * Dispose diagnostic depth/normal/UV materials and restore mesh material from stored original.
   * @param {THREE.Mesh} child
   */
  exitDiagnosticViewOnMesh(child) {
    if (!child?.isMesh) return;
    if (child.userData.uvGridTexture) {
      try {
        child.userData.uvGridTexture.dispose();
      } catch (_) {
        /* ignore */
      }
      delete child.userData.uvGridTexture;
    }
    if (child.userData.diagnosticMaterial) {
      const dm = child.userData.diagnosticMaterial;
      const list = Array.isArray(dm) ? [...new Set(dm)] : [dm];
      for (const m of list) {
        try {
          m.dispose();
        } catch (_) {
          /* ignore */
        }
      }
      delete child.userData.diagnosticMaterial;
    }
    if (child.userData.originalMaterial) {
      const orig = child.userData.originalMaterial;
      if (Array.isArray(orig)) {
        child.material = orig.map((m) => (typeof m?.clone === 'function' ? m.clone() : m));
      } else if (typeof orig?.clone === 'function') {
        child.material = orig.clone();
      } else {
        child.material = orig || child.material;
      }
    }
  }

  /**
   * @param {THREE.Mesh} child
   */
  ensureMeshVertexNormals(child) {
    const geo = child.geometry;
    if (!geo) return;
    try {
      if (!geo.attributes.normal) {
        geo.computeVertexNormals();
        return;
      }
      const n = geo.attributes.normal.array;
      let valid = false;
      for (let i = 0; i < n.length; i += 3) {
        if (n[i] !== 0 || n[i + 1] !== 0 || n[i + 2] !== 0) {
          valid = true;
          break;
        }
      }
      if (!valid) geo.computeVertexNormals();
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * @param {THREE.Mesh} child
   * @param {'depth'|'normal'|'uv'} viewMode
   */
  applyDiagnosticViewToMesh(child, viewMode) {
    this.exitDiagnosticViewOnMesh(child);
    this.ensureMeshVertexNormals(child);
    const skin = child.isSkinnedMesh === true;
    const n = Array.isArray(child.material) ? child.material.length : 1;
    if (viewMode === 'uv') {
      const tex = this.createUVTexture();
      child.userData.uvGridTexture = tex;
      const sharedMat = createUVMaterial(tex, { skinning: skin });
      child.material = n === 1 ? sharedMat : Array.from({ length: n }, () => sharedMat);
      child.userData.diagnosticMaterial = sharedMat;
      return;
    }
    if (viewMode === 'depth') {
      const sharedMat = createDepthVisualizationMaterial({ skinning: skin });
      child.material = n === 1 ? sharedMat : Array.from({ length: n }, () => sharedMat);
      child.userData.diagnosticMaterial = sharedMat;
      return;
    }
    const sharedMat = createViewNormalMaterial({ skinning: skin });
    child.material = n === 1 ? sharedMat : Array.from({ length: n }, () => sharedMat);
    child.userData.diagnosticMaterial = sharedMat;
  }

  /**
   * Update model materials based on render mode
   */
  updateRenderMode(mode) {
    const roots = this._getViewportRenderRoots();
    if (!roots.length) return;

    // Store original materials if not already stored
    this.storeOriginalMaterials();

    if (mode !== 'skeleton') {
      this.clearBoneVisualization();
    }

    const partColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
    let partColorizeIndex = 0;

    const applyModeToMesh = (child) => {
      if (!child.isMesh) return;

      switch (mode) {
        case 'solid':
        case 'rendered': {
          this.exitDiagnosticViewOnMesh(child);
          if (child.userData.originalMaterial) {
            const orig = child.userData.originalMaterial;
            if (Array.isArray(orig)) {
              child.material = orig.map((m) => (typeof m?.clone === 'function' ? m.clone() : m));
            } else if (typeof orig?.clone === 'function') {
              child.material = orig.clone();
            } else {
              child.material = orig || child.material;
            }
          }
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;
            m.wireframe = false;
            m.transparent = false;
            m.opacity = 1.0;
            if (child.userData.originalColor && m.color) {
              m.color.copy(child.userData.originalColor);
            }
            if (this.isVrmMaterial(m)) {
              this.ensureVRMMaterialProperties(m);
              if (m.map) {
                m.map.needsUpdate = true;
                m.map.flipY = false;
                m.map.generateMipmaps = true;
                m.map.minFilter = THREE.LinearMipmapLinearFilter;
                m.map.magFilter = THREE.LinearFilter;
                m.map.wrapS = THREE.RepeatWrapping;
                m.map.wrapT = THREE.RepeatWrapping;
              }
            } else if (m.map) {
              m.map.colorSpace = THREE.SRGBColorSpace;
              m.map.flipY = true;
            }
            m.needsUpdate = true;
            if (m.map) {
              m.map.needsUpdate = true;
            }
          }
          if (child.geometry?.attributes?.uv) {
            child.geometry.attributes.uv.needsUpdate = true;
          }
          break;
        }
        case 'wireframe': {
          this.exitDiagnosticViewOnMesh(child);
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;
            m.wireframe = true;
            m.transparent = false;
            m.opacity = 1.0;
            if (child.userData.originalColor && m.color) m.color.copy(child.userData.originalColor);
          }
          break;
        }
        case 'skeleton': {
          this.exitDiagnosticViewOnMesh(child);
          try {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
              if (!m) continue;
              m.wireframe = true;
              m.transparent = true;
              m.opacity = 0.1;
              m.color.setHex(0x666666);
            }
          } catch (error) {
            console.error('Error setting skeleton mode for mesh:', child.name, error);
          }
          break;
        }
        case 'partColorize': {
          this.exitDiagnosticViewOnMesh(child);
          const ci = partColorizeIndex % partColors.length;
          partColorizeIndex++;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;
            m.color.setHex(partColors[ci]);
            m.wireframe = false;
            m.transparent = false;
            m.opacity = 1.0;
          }
          break;
        }
        case 'normal':
          this.applyDiagnosticViewToMesh(child, 'normal');
          break;
        case 'uv':
          this.applyDiagnosticViewToMesh(child, 'uv');
          break;
        case 'depth':
          this.applyDiagnosticViewToMesh(child, 'depth');
          break;
        default:
          break;
      }
    };

    roots.forEach((root) => {
      root.traverse((child) => applyModeToMesh(child));
    });

    if (mode === 'skeleton') {
      console.log('Creating bone visualization for skeleton mode');
      this.createBoneVisualization();
    }
  }

  /**
   * Match canvas + camera to the host element. WebView often reports 0×0 briefly; avoid that or WebGL stays blank.
   */
  forceRendererRefit() {
    if (!this.renderer || !this.camera) return;
    const canvas = this.renderer.domElement;
    const el = canvas?.parentElement || this.sceneHostElement;
    if (!el) return;

    let width = 0;
    let height = 0;
    if (typeof el.getBoundingClientRect === 'function') {
      const r = el.getBoundingClientRect();
      width = Math.round(r.width);
      height = Math.round(r.height);
    }
    if (width < 2) width = el.clientWidth || 0;
    if (height < 2) height = el.clientHeight || 0;
    if (width < 2) width = typeof window !== 'undefined' ? window.innerWidth || 2 : 2;
    if (height < 2) height = typeof window !== 'undefined' ? window.innerHeight || 2 : 2;
    width = Math.max(2, width);
    height = Math.max(2, height);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height, false);
    try {
      this.renderer.setViewport(0, 0, width, height);
    } catch (_) {
      /* ignore */
    }
    try {
      if (this.scene && typeof this.renderer.compile === 'function') {
        this.renderer.compile(this.scene, this.camera);
      }
    } catch (e) {
      console.warn('[SceneManager] renderer.compile after refit:', e?.message || e);
    }
  }

  /**
   * After WebGL context restore (common on Android WebView), reset GL state and refit the drawable.
   */
  reinitializeScene() {
    if (!this.renderer || !this.scene || !this.camera) {
      console.warn('[SceneManager] reinitializeScene skipped — missing renderer/scene/camera');
      return;
    }
    console.warn('[SceneManager] WebGL context restored — refitting renderer');
    try {
      if (typeof this.renderer.resetState === 'function') {
        this.renderer.resetState();
      }
    } catch (e) {
      console.warn('[SceneManager] renderer.resetState failed:', e?.message || e);
    }
    this.forceRendererRefit();
    if (!this.isRendering) {
      this.startRenderLoop();
    }
    try {
      this.emit('webglContextRestored', {});
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Setup WebGL context loss recovery
   */
  setupWebGLContextRecovery() {
    if (!this.renderer || !this.renderer.domElement) return;

    const canvas = this.renderer.domElement;
    
    // Handle context loss
    canvas.addEventListener('webglcontextlost', (event) => {
      console.warn('⚠️ WebGL context lost, preventing default behavior');
      event.preventDefault();
      this.isRendering = false;
    });

    // Handle context restoration
    canvas.addEventListener('webglcontextrestored', (event) => {
      console.log('🔄 WebGL context restored, reinitializing...');
      this.reinitializeScene();
    });
  }

  /**
   * Create UV visualization texture
   */
  createUVTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // UV gradient: U → red channel, V → green (readability over flat grid)
    const g = ctx.createLinearGradient(0, 0, 512, 512);
    g.addColorStop(0, '#200008');
    g.addColorStop(0.5, '#082008');
    g.addColorStop(1, '#080820');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    const gu = ctx.createLinearGradient(0, 0, 512, 0);
    gu.addColorStop(0, '#000000');
    gu.addColorStop(1, '#ff3366');
    ctx.fillStyle = gu;
    ctx.fillRect(0, 0, 512, 32);
    const gv = ctx.createLinearGradient(0, 0, 0, 512);
    gv.addColorStop(0, '#000000');
    gv.addColorStop(1, '#33ff66');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, 32, 512);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    
    // Draw UV grid
    for (let i = 0; i <= 8; i++) {
      const x = (i / 8) * 512;
      const y = (i / 8) * 512;
      
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * Set lighting intensity for all lights
   * @param {number} intensity - Lighting intensity multiplier
   */
  setLightingIntensity(intensity) {
    if (!this.lights) return;
    
    // Adjust ambient lights
    this.lights.ambient.forEach(light => {
      if (!light.userData.originalIntensity) {
        light.userData.originalIntensity = light.intensity;
      }
      light.intensity = light.userData.originalIntensity * intensity;
    });
    
    // Adjust directional lights
    this.lights.directional.forEach(light => {
      if (!light.userData.originalIntensity) {
        light.userData.originalIntensity = light.intensity;
      }
      light.intensity = light.userData.originalIntensity * intensity;
    });
    
    // Adjust point lights
    this.lights.point.forEach(light => {
      if (!light.userData.originalIntensity) {
        light.userData.originalIntensity = light.intensity;
      }
      light.intensity = light.userData.originalIntensity * intensity;
    });
    
    // Adjust hemisphere lights
    this.lights.hemisphere.forEach(light => {
      if (!light.userData.originalIntensity) {
        light.userData.originalIntensity = light.intensity;
      }
      light.intensity = light.userData.originalIntensity * intensity;
    });
  }

  /**
   * Toggle specific light types
   * @param {string} lightType - Type of light to toggle ('ambient', 'directional', 'point', 'hemisphere')
   * @param {boolean} enabled - Whether to enable or disable
   */
  toggleLightType(lightType, enabled) {
    if (!this.lights || !this.lights[lightType]) return;
    
    this.lights[lightType].forEach(light => {
      light.visible = enabled;
    });
  }

  /**
   * Set camera to predefined positions with smooth animation and auto-focus
   * @param {string} position - Camera position ('front', 'back', 'left', 'right', 'top', 'bottom')
   * @param {number} duration - Animation duration in milliseconds (default: 1000ms)
   */
  setCameraPosition(position, duration = 1000) {
    if (!this.camera || !this.controls) return;
    
    // First, focus on the model to get proper distance
    this.focusOnModel();
    
    // Get the model's bounding box for proper positioning
    let modelCenter = new THREE.Vector3(0, 1, 0);
    let modelSize = 2; // Default size
    
    if (this.currentModel) {
      const box = new THREE.Box3().setFromObject(this.currentModel);
      if (!box.isEmpty()) {
        modelCenter = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        modelSize = Math.max(size.x, size.y, size.z);
      }
    }
    
    // Calculate distance based on model size for very close-up view
    const distance = Math.max(modelSize * 1.0, 1.0);
    
    const positions = {
      front: { x: modelCenter.x, y: modelCenter.y, z: modelCenter.z + distance },
      back: { x: modelCenter.x, y: modelCenter.y, z: modelCenter.z - distance },
      left: { x: modelCenter.x - distance, y: modelCenter.y, z: modelCenter.z },
      right: { x: modelCenter.x + distance, y: modelCenter.y, z: modelCenter.z },
      top: { x: modelCenter.x, y: modelCenter.y + distance, z: modelCenter.z },
      bottom: { x: modelCenter.x, y: modelCenter.y - distance, z: modelCenter.z }
    };
    
    const targetPos = positions[position];
    if (!targetPos) return;
    
    // Store current position and target
    const startPosition = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const endPosition = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
    const endTarget = modelCenter.clone();
    
    // Animation variables
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Smooth easing function (ease-in-out)
      const easeInOut = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      // Interpolate position
      this.camera.position.lerpVectors(startPosition, endPosition, easeInOut);
      
      // Interpolate target
      this.controls.target.lerpVectors(startTarget, endTarget, easeInOut);
      
      // Update controls
      this.controls.update();
      
      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Ensure final position is exact
        this.camera.position.copy(endPosition);
        this.controls.target.copy(endTarget);
        this.controls.update();
        
        console.log(`🎬 Camera animated to ${position} view with close-up focus`);
      }
    };
    
    // Start animation
    console.log(`🎬 Animating camera to ${position} view with close-up focus...`);
    animate();
  }

  /**
   * Enable/disable auto-rotation
   * @param {boolean} enabled - Whether to enable auto-rotation
   * @param {number} speed - Rotation speed (default: 2.0)
   */
  setAutoRotation(enabled, speed = 2.0) {
    if (this.controls) {
      this.controls.autoRotate = enabled;
      this.controls.autoRotateSpeed = speed;
    }
  }

  /**
   * Set renderer tone mapping and exposure
   * @param {string} toneMapping - Tone mapping type ('ACESFilmic', 'Reinhard', 'Cineon', 'Linear')
   * @param {number} exposure - Exposure value
   */
  setToneMapping(toneMapping, exposure = 1.0) {
    if (!this.renderer) return;
    
    const toneMappingTypes = {
      'ACESFilmic': THREE.ACESFilmicToneMapping,
      'Reinhard': THREE.ReinhardToneMapping,
      'Cineon': THREE.CineonToneMapping,
      'Linear': THREE.LinearToneMapping
    };
    
    this.renderer.toneMapping = toneMappingTypes[toneMapping] || THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
  }

  /**
   * Setup resize handler
   */
  setupResizeHandler() {
    this._windowResizeHandler = () => {
      this.forceRendererRefit();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._windowResizeHandler);
    }
  }

  /**
   * Visibility / BFCache / visualViewport — Android WebView often omits `resize` when the GL surface recovers.
   */
  setupWebViewSurvivalHooks() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    this._onVisibilityForRefit = () => {
      if (document.visibilityState === 'visible') {
        requestAnimationFrame(() => this.forceRendererRefit());
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityForRefit);

    this._onPageshowForRefit = () => {
      requestAnimationFrame(() => this.forceRendererRefit());
    };
    window.addEventListener('pageshow', this._onPageshowForRefit);

    if (window.visualViewport) {
      this._onVisualViewportResize = () => {
        requestAnimationFrame(() => this.forceRendererRefit());
      };
      window.visualViewport.addEventListener('resize', this._onVisualViewportResize);
    }

    this._webViewResumeBridge = () => {
      requestAnimationFrame(() => this.forceRendererRefit());
    };
    window.__characterStudioWebViewResume = this._webViewResumeBridge;
  }

  /**
   * Get file extension from source
   */
  getFileExtension(source) {
    let extension = '';
    
    if (source instanceof File) {
      const fileName = source.name;
      console.log('File name:', fileName);
      console.log('File type:', source.type);
      const parts = fileName.split('.');
      console.log('File name parts:', parts);
      if (parts.length > 1) {
        extension = parts.pop().toLowerCase();
      }
      
      // Fallback: try to detect from MIME type
      if (!extension && source.type) {
        const mimeToExtension = {
          'model/gltf-binary': 'glb',
          'model/gltf+json': 'gltf',
          'model/obj': 'obj',
          'model/fbx': 'fbx',
          'application/octet-stream': 'vrm' // VRM files often have this MIME type
        };
        extension = mimeToExtension[source.type] || '';
      }
    } else if (typeof source === 'string') {
      console.log('String source:', source);
      extension = inferModelFileExtensionFromSource(source);
    }
    
    console.log('File extension detected:', extension);
    return extension;
  }

  /**
   * Export current model
   * @param {string} format - Export format (glb, gltf, obj)
   * @param {Object} options - Export options
   */
  async exportModel(format = 'glb', options = {}) {
    if (options.animationClips?.length) {
      console.log(
        `[GLB export] Embedding ${options.animationClips.length} animation clip(s), ` +
          `${options.animationClips[0]?.tracks?.length ?? 0} tracks`,
      );
    }
    if (!this.currentModel) {
      throw new Error('No model to export');
    }

    try {
      this.emit('modelExportStart', { model: this.currentModel, format, options });

      let result;
      switch (format) {
        case 'glb':
          result = await this.exportToGLB(options);
          break;
        case 'gltf':
          result = await this.exportToGLTF(options);
          break;
        case 'vrm':
          result = await this.exportToVRM(options);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      this.emit('modelExportComplete', { model: this.currentModel, format, result });
      return result;
    } catch (error) {
      console.error('Model export failed:', error);
      this.emit('modelExportError', { error, model: this.currentModel, format });
      throw error;
    }
  }

  /**
   * Export to GLB format
   * @param {Object} options - Export options
   */
  async exportToGLB(options = {}) {
    const {
      filename = 'opennexus3dstudio_export.glb',
      forOpenNexus3DStudio = true,
      animationClips,
      ...exportOptions
    } = options;

    const glbOpts = {
      filename,
      animationClips,
      ...exportOptions,
    };

    if (forOpenNexus3DStudio) {
      return await this.glbExporter.exportForOpenNexus3DStudio(this.currentModel, glbOpts);
    }
    return await this.glbExporter.exportToGLB(this.currentModel, glbOpts);
  }

  /**
   * Export to GLTF format
   * @param {Object} options - Export options
   */
  async exportToGLTF(options = {}) {
    // Placeholder for GLTF export
    // Would implement similar to GLB export but with different format
    throw new Error('GLTF export not yet implemented');
  }

  /**
   * Export to VRM format
   * @param {Object} options - Export options
   */
  async exportToVRM(options = {}) {
    const {
      filename = 'opennexus3dstudio_export.vrm',
      vrmVersion = '0.0',
      metadata = {},
      ...exportOptions
    } = options;

    return await this.vrmExporter.exportToVRM(this.currentModel, {
      filename,
      vrmVersion,
      metadata,
      ...exportOptions
    });
  }

  /**
   * Clear current model
   */
  clearModel() {
    void this._disposeSceneLipSync();
    this.currentVRM = null;
    if (this.currentModel) {
      if (this.currentModel.userData?.isGaussianSplat || this.currentSplat) {
        disposeSplatMesh(this.currentSplat || this.currentModel);
        this.currentSplat = null;
      }
      const parent = this.currentModel.parent || this.scene;
      parent.remove(this.currentModel);
      this.currentModel = null;
      this.emit('modelCleared');
    }
  }

  /**
   * Start render loop
   */
  startRenderLoop() {
    if (this.isRendering) {
      console.warn('Render loop is already running');
      return;
    }
    
    this.isRendering = true;
    
    const animate = () => {
      if (!this.isRendering) {
        return;
      }
      
      // Don't render if XR session is active (XR has its own render loop via setAnimationLoop)
      if (this.renderer && this.renderer.xr && this.renderer.xr.isPresenting) {
        // XR is handling rendering, just continue the loop for controls
        if (this.controls) {
          this.controls.update();
        }
        this.animationId = requestAnimationFrame(animate);
        return;
      }
      
      this.animationId = requestAnimationFrame(animate);
      
      if (this.controls) {
        this.controls.update();
      }

      // Native APK / WebView: Jetpack XR face → nativeFaceBridge (no WebXR session).
      const vrmsFlat =
        typeof this.xrExpressionVRMProvider === 'function'
          ? this.xrExpressionVRMProvider().filter(Boolean)
          : this.currentVRM
            ? [this.currentVRM]
            : [];
      const nativeRecFlat = getNativeFaceWeightsIfFresh();
      if (vrmsFlat.length) {
        if (nativeRecFlat && Object.keys(nativeRecFlat).length > 0) {
          applyExpressionWeightRecordToVRMS(vrmsFlat, nativeRecFlat);
        }
      }
      this._maybeLogNativeFaceRemoteDiag(vrmsFlat, nativeRecFlat);

      if (this._webcamBodyFrameHook) {
        try {
          this._webcamBodyFrameHook();
        } catch (_) {
          /* ignore */
        }
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    
    animate();
    console.log('🎬 Render loop started');
  }

  /**
   * Stop render loop
   */
  stopRenderLoop() {
    if (!this.isRendering) {
      console.warn('Render loop is not running');
      return;
    }
    
    this.isRendering = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    console.log('⏹️ Render loop stopped');
  }

  /**
   * Unlock face-recording playback audio on XR entry button click (AR/VR gesture window).
   * @param {HTMLElement|null} button
   * @param {string} logLabel
   */
  _attachFaceRecordingAudioUnlockToXrButton(button, logLabel) {
    if (!button || button._faceRecordingAudioUnlockAttached) return;
    button._faceRecordingAudioUnlockAttached = true;
    button.addEventListener(
      'click',
      async () => {
        console.log(`${logLabel} — unlocking face recording audio...`);
        resetFaceRecordingAudioXrUnlock();
        await unlockFaceRecordingAudioPlayback();
      },
      { capture: true },
    );
  }

  /**
   * Enable AR mode with floor alignment matching VR mode
   * Returns ARButton element that can be added to the UI
   * @param {HTMLElement} container - Optional container element to add button to
   * @returns {HTMLElement} ARButton element
   */
  enableAR(container = null) {
    if (!this.renderer || !this.scene) {
      console.error('❌ Cannot enable AR: renderer or scene not initialized');
      return null;
    }

    console.log('📱 Setting up AR mode...');

    // IMPORTANT: Do NOT override renderer.xr.setSession here.
    // XR session handling (VR + AR) is unified in enableVR() so VR stays "default" and AR gets special treatment.

    // If button already exists, return it instead of creating a new one
    if (this.arButton) {
      console.log('📱 AR button already exists, reusing...');
      this._attachFaceRecordingAudioUnlockToXrButton(this.arButton, '📱 AR button clicked');
      return this.arButton;
    }

    // Create AR button using Three.js ARButton utility
    // Require bounded-floor for proper physical floor alignment
    const arButton = ARButton.createButton(this.renderer, {
      requiredFeatures: ['bounded-floor'],
      optionalFeatures: [
        'local-floor', 'local', 'viewer',
        XR_EXPRESSION_TRACKING_FEATURE,
      ],
    });

    // Ensure button always has an ID (Three.js only sets it in the "supported" path)
    if (arButton) {
      arButton.id = 'ARButton';
      arButton.innerHTML = '📱';
      arButton.title = 'Enter Augmented Reality';
      arButton.setAttribute('aria-label', 'Enter Augmented Reality');
      arButton.style.fontSize = '1.2rem';
      arButton.style.padding = '4px 8px';
      arButton.style.minWidth = '32px';
      arButton.style.height = '32px';
      arButton.style.textAlign = 'center';
      arButton.style.display = 'inline-flex';
      arButton.style.alignItems = 'center';
      arButton.style.justifyContent = 'center';

      // MutationObserver: keep emoji when Three.js changes button text
      const observer = new MutationObserver(() => {
        if (arButton.textContent !== '📱' && !arButton.textContent.includes('📱')) {
          arButton.innerHTML = '📱';
        }
      });
      observer.observe(arButton, { childList: true, characterData: true, subtree: true });
      arButton._emojiObserver = observer;
      this._attachFaceRecordingAudioUnlockToXrButton(arButton, '📱 AR button clicked');
    }

    // Store button reference
    this.arButton = arButton;

    // Add button to container if provided
    if (container) {
      container.appendChild(arButton);
    }

    console.log('✅ AR button created');
    return arButton;
  }

  /**
   * Enable VR mode with floor alignment
   * Returns VRButton element that can be added to the UI
   * @param {HTMLElement} container - Optional container element to add button to
   * @returns {HTMLElement} VRButton element
   */
  enableVR(container = null) {
    if (!this.renderer || !this.scene) {
      console.error('❌ Cannot enable VR: renderer or scene not initialized');
      return null;
    }

    console.log('🥽 Setting up VR mode...');

    // Store original setSession only if not already stored
    if (!this.originalXRSetSession) {
      this.originalXRSetSession = this.renderer.xr.setSession.bind(this.renderer.xr);
    }
    const originalSetSession = this.originalXRSetSession;
    
    // Always set up the setSession override (even if button exists, we need the handler)
    this.renderer.xr.setSession = async (session) => {
      // NOTE:
      // Some WebXR runtimes (notably some Android XR stacks) do not expose `XRSession.mode`.
      // In that case, reliably infer AR vs VR from `environmentBlendMode`.
      const blendMode = session.environmentBlendMode || 'unknown';
      const sessionMode = session.mode; // may be undefined

      const isAR =
        sessionMode === 'immersive-ar' ||
        blendMode === 'alpha-blend' ||
        blendMode === 'additive';

      // Treat `opaque` as VR. If mode is missing, VR is the safe default for non-AR immersive sessions.
      const isVR =
        sessionMode === 'immersive-vr' ||
        (!isAR && blendMode === 'opaque');

      const isXR = !isAR && !isVR;
      const xrKind = isAR ? 'AR' : isVR ? 'VR' : 'XR';
      const xrEmoji = isAR ? '📱' : isVR ? '🥽' : '🔎';
      // Store mode early to avoid races with async loaders (e.g., sky texture load).
      this.xrMode = isAR ? 'ar' : isVR ? 'vr' : 'xr';
      resetFaceRecordingAudioXrUnlock();
      await unlockFaceRecordingAudioPlayback();

      // Save the current non-XR view so exiting AR/VR returns to the same 3D renderer view.
      // Important: only capture if we don't already have a saved view (so VR->AR switching inside XR
      // doesn't overwrite the original pre-XR view).
      if (
        !this.preXRCameraPosition &&
        this.camera &&
        this.controls &&
        !this.renderer?.xr?.isPresenting
      ) {
        this.preXRCameraPosition = this.camera.position.clone();
        this.preXRCameraRotation = this.camera.rotation.clone();
        this.preXRCameraQuaternion = this.camera.quaternion.clone();
        this.preXRCameraUp = this.camera.up.clone();
        this.preXRCameraZoom = this.camera.zoom;
        this.preXRCameraTarget = this.controls.target.clone();
        console.log('💾 Saved camera state before XR:', {
          position: this.preXRCameraPosition,
          rotation: this.preXRCameraRotation,
          target: this.preXRCameraTarget,
          zoom: this.preXRCameraZoom,
        });
      }

      // Capture full snapshot of background state before entering XR (for exact restoration on exit)
      // This ensures the 3D viewer returns to the exact same sky orientation as before XR
      if (!this.preXRBackgroundSnapshot && this.scene) {
        const bg = this.scene.background;
        if (bg instanceof THREE.Texture) {
          // Store full texture state snapshot
          this.preXRBackgroundSnapshot = {
            type: 'texture',
            textureRef: bg,
            mapping: bg.mapping,
            colorSpace: bg.colorSpace,
            flipY: bg.flipY,
            needsUpdate: bg.needsUpdate
          };
          console.log('💾 Saved background texture snapshot before XR:', {
            mapping: bg.mapping,
            colorSpace: bg.colorSpace,
            flipY: bg.flipY
          });
        } else if (bg instanceof THREE.Color) {
          this.preXRBackgroundSnapshot = {
            type: 'color',
            value: bg.clone()
          };
          console.log('💾 Saved background color snapshot before XR:', bg);
        } else {
          this.preXRBackgroundSnapshot = {
            type: 'null',
            value: null
          };
          console.log('💾 Saved background snapshot before XR: null');
        }
      }

      // Check for XR input diagnostics query param (dev-gated)
      if (typeof window !== 'undefined' && window.location) {
        const params = new URLSearchParams(window.location.search);
        this.xrDebugInputs = params.get('xrDebugInputs') === '1';
        this.xrMenuExitEnabled = params.get('xrMenuExit') === '1';
        this.xrGazeExitEnabled = params.get('xrGazeExit') === '1';
      }

      // ASCII marker for remote log sinks
      console.log('XR_OVERRIDE setSession called. mode=', sessionMode);
      console.log('XR_OVERRIDE envBlendMode=', blendMode);
      console.log(`${xrEmoji} ${xrKind} session starting...`);
      console.log(`${xrEmoji} Session type:`, sessionMode);
      console.log(`${xrEmoji} Session features:`, session.enabledFeatures || 'none');
      
      // Make WebGL context XR compatible
      const gl = this.renderer.getContext();
      if (gl && gl.makeXRCompatible) {
        await gl.makeXRCompatible();
      }

      // Request reference space - prioritize floor-aligned spaces for both AR and VR
      // 'bounded-floor' uses Android XR's boundary floor level settings (aligns Y=0 to physical floor)
      // 'local-floor' also aligns Y=0 to floor but without boundary information
      // Both 'bounded-floor' and 'local-floor' allow camera translation (6DoF)
      // 'viewer' space locks content to head and prevents translation - DO NOT USE for immersive sessions
      let referenceSpace = null;
      let referenceSpaceType = null;
      
      // Both AR and VR MUST use bounded-floor for proper physical floor alignment
      // 'bounded-floor' uses Android XR's boundary floor level settings (aligns Y=0 to physical floor)
      // Try bounded-floor first, fall back to local-floor only if absolutely necessary
      const refSpaceTypes = ['bounded-floor', 'local-floor', 'local', 'viewer'];

      for (const refSpaceType of refSpaceTypes) {
        try {
          console.log(`🔄 Requesting ${refSpaceType} reference space for ${xrKind}...`);
          referenceSpace = await session.requestReferenceSpace(refSpaceType);
          referenceSpaceType = refSpaceType;
          console.log(`✅ Successfully using ${refSpaceType} reference space for ${xrKind}`);
          
          // Log reference space details
          if (refSpaceType === 'bounded-floor') {
            console.log('📐 Using Android XR floor level from boundaries settings');
            // The reference space origin is at the floor level adjusted in Android XR settings
            // Y=0 in this reference space corresponds to the physical floor level set by the user
          } else if (refSpaceType === 'local') {
            console.log('📐 Using local reference space - allows camera translation in AR/VR');
            // 'local' space allows 6DoF camera translation and is preferred for AR per WebXR spec
          } else if (refSpaceType === 'local-floor') {
            console.log('📐 Using local-floor reference space - floor-aligned with camera translation');
            // 'local-floor' is like 'local' but with Y=0 at floor level
          } else if (refSpaceType === 'viewer') {
            console.warn('⚠️ Using viewer reference space - camera translation will be DISABLED');
            // 'viewer' space locks content to head - only use as last resort
          }
          
          // Detach previous reset listener (if any) before switching reference spaces.
          if (this.xrBaseReferenceSpace && this.xrOnReferenceSpaceReset) {
            try {
              this.xrBaseReferenceSpace.removeEventListener('reset', this.xrOnReferenceSpaceReset);
            } catch {
              // ignore
            }
          }

          // Store the base (un-offset) reference space. Rendering may use an offset space for software recenter.
          this.xrBaseReferenceSpace = referenceSpace;
          this.xrRenderReferenceSpace = referenceSpace;
          this.xrReferenceSpace = referenceSpace; // legacy alias

          // Platform recenter (e.g. Home button) can fire a `reset` event on the reference space.
          // When it happens, re-run our one-time auto-centering so the user returns to X=0.
          if (this.xrBaseReferenceSpace && typeof this.xrBaseReferenceSpace.addEventListener === 'function') {
            if (!this.xrOnReferenceSpaceReset) {
              this.xrOnReferenceSpaceReset = () => {
                console.log('[REORIENT_FIX] 🎯 XR reference space reset detected (platform recenter). Re-applying X=0 auto-center...');
                this.xrAutoCentered = false;
              };
            }
            try {
              this.xrBaseReferenceSpace.addEventListener('reset', this.xrOnReferenceSpaceReset);
            } catch {
              // ignore
            }
          }

          // CRITICAL: Set reference space type BEFORE calling originalSetSession
          // This must be done BEFORE Three.js starts presenting, otherwise it will fail with
          // "Cannot change reference space type while presenting"
          if (this.renderer.xr && typeof this.renderer.xr.setReferenceSpaceType === 'function') {
            this.renderer.xr.setReferenceSpaceType(refSpaceType);
            console.log(`✅ Set Three.js reference space type to: ${refSpaceType} (BEFORE setSession)`);
          }
          
          break; // Success, exit loop
        } catch (refSpaceError) {
          console.warn(`⚠️ ${refSpaceType} reference space failed:`, refSpaceError.message);
          // If bounded-floor fails, warn that floor alignment may be incorrect
          if (refSpaceType === 'bounded-floor') {
            console.error('❌ CRITICAL: bounded-floor is not available! Floor alignment will be incorrect.');
            console.error('❌ Models may appear below or above the physical floor.');
          }
        }
      }
      
      // Verify we got a floor-aligned reference space
      if (!referenceSpace) {
        throw new Error(`Failed to get any reference space for ${xrKind}. Cannot proceed.`);
      }
      
      if (referenceSpaceType !== 'bounded-floor') {
        console.error(`❌ WARNING: Using ${referenceSpaceType} instead of bounded-floor. Floor alignment may be incorrect!`);
      }
      
      // Log input sources on session start to help debug which buttons are exposed for long-press recenter.
      try {
        const sources = this._getXRInputSources(session);
        this._xrNoWebXrInputSources = sources.length === 0;
        console.log(`${xrEmoji} InputSources at start: ${sources.length}`);
        if (this._xrNoWebXrInputSources) {
          console.warn(
            `${xrEmoji} No WebXR inputSources — Menu/B may not reach the page; use gaze exit HUD or navigator.getGamepads fallback`,
          );
        }
        sources.forEach((s, i) => {
          console.log(`${xrEmoji} InputSource[${i}]:`, {
            handedness: s.handedness,
            profiles: s.profiles,
            hasGamepad: !!s.gamepad,
            buttons: s.gamepad?.buttons?.length,
            axes: s.gamepad?.axes?.length,
          });
        });
        session.addEventListener('inputsourceschange', (ev) => {
          const added = ev.added ? Array.from(ev.added) : [];
          const removed = ev.removed ? Array.from(ev.removed) : [];
          const nowSources = this._getXRInputSources(session);
          this._xrNoWebXrInputSources = nowSources.length === 0;
          console.log(`${xrEmoji} inputsourceschange:`, {
            added: added.length,
            removed: removed.length,
            total: nowSources.length,
          });
          added.forEach((s, i) => {
            const handTrack = this._isXRHandTrackingInputSource(s);
            console.log(`${xrEmoji} InputSource added[${i}]:`, {
              handedness: s.handedness,
              profiles: s.profiles,
              hasGamepad: !!s.gamepad,
              buttons: s.gamepad?.buttons?.length,
              handTracking: handTrack,
              note: handTrack
                ? 'pinch/select will NOT exit XR (not Menu/B)'
                : undefined,
            });
          });
        });
        if (this.xrMenuExitEnabled) {
          console.info(
            `${xrEmoji} In-app Menu/B exit enabled (?xrMenuExit=1) — firm press only; hand pinch ignored`,
          );
        } else {
          console.info(
            `${xrEmoji} In-app controller exit OFF (use headset Home). Add ?xrMenuExit=1 to exit via Menu/B`,
          );
        }
        if (this.xrGazeExitEnabled) {
          console.info(`${xrEmoji} Gaze exit enabled (?xrGazeExit=1) — look at red panel 2s to leave`);
        }

        // Track selectstart/selectend holds as an additional "recenter" gesture.
        // Some headsets/controllers do not expose their system/touchpad buttons via Gamepad,
        // but do emit select events.
        // Key by stable XRSpace (targetRaySpace) instead of XRInputSource object ref for reliable tracking
        session.addEventListener('selectstart', (ev) => {
          const src = ev?.inputSource;
          if (!src) {
            console.warn('[REORIENT_FIX] ⚠️ SELECT_START: No inputSource in event');
            return;
          }
          // Do not exit on selectstart — hand pinch fires select constantly on Galaxy XR.
          // Use targetRaySpace as stable key (persists across inputSource object changes)
          const key = src.targetRaySpace || src;
          const downAt =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          this.xrRecenterSelectHoldState.set(key, { downAt, triggered: false });
          console.log('[REORIENT_FIX] 🎮 SELECT_START: Long-press tracking started', {
            handedness: src?.handedness,
            profiles: src?.profiles,
            hasGamepad: !!src?.gamepad,
            downAt: downAt,
            keyType: key === src.targetRaySpace ? 'targetRaySpace' : 'inputSource'
          });
        });
        session.addEventListener('selectend', (ev) => {
          const src = ev?.inputSource;
          if (!src) {
            console.warn('[REORIENT_FIX] ⚠️ SELECT_END: No inputSource in event');
            return;
          }
          const key = src.targetRaySpace || src;
          const hold = this.xrRecenterSelectHoldState.get(key);
          const now =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now()
              : Date.now();
          const holdMs = 900;
          if (
            this.xrMenuExitEnabled &&
            hold &&
            !hold.triggered &&
            now - hold.downAt < holdMs &&
            this.isXRSystemExitInputSource(src)
          ) {
            this.requestXRSessionExit('system-select-short-press', {
              handedness: src.handedness,
              durationMs: Math.round(now - hold.downAt),
              profiles: src.profiles,
            });
          }
          const wasTracking = this.xrRecenterSelectHoldState.has(key);
          this.xrRecenterSelectHoldState.delete(key);
          if (wasTracking) {
            console.log('[REORIENT_FIX] 🎮 SELECT_END: Long-press tracking ended (released before threshold)', {
              handedness: src?.handedness,
              profiles: src?.profiles
            });
          }
        });
      } catch {
        // ignore
      }

      // Handle VR and AR modes differently
      if (isVR) {
        // VR mode: Ensure background is set and create skybox
        if (this.scene) {
          try {
            console.log('🥽 VR mode: Setting up background and skybox...');
            
            // VR mode: Ensure background is set (restore if AR cleared it, or ensure texture is loaded)
            if (!this.scene.background) {
              if (this.originalSceneBackground) {
                this.scene.background = this.originalSceneBackground;
                console.log('✅ VR: Restored background from original (was cleared by AR)');
              } else {
                // Background is null and no original stored - load it
                console.log('⚠️ VR: Background is null, loading texture...');
                this.setupHDREnvironment();
              }
            } else if (this.scene.background instanceof THREE.Color) {
            // Background is still a Color (texture hasn't loaded yet) - ensure texture loads
            console.log('⚠️ VR: Background is still a Color, ensuring texture loads...');
            this.setupHDREnvironment();
          } else if (this.scene.background instanceof THREE.Texture) {
            console.log('✅ VR: Background texture is set and ready');
            // Verify texture is fully loaded and properly configured for XR
            if (this.scene.background.image && this.scene.background.image.complete) {
              // Ensure texture is properly configured for XR rendering
              this.scene.background.mapping = THREE.EquirectangularReflectionMapping;
              this.scene.background.colorSpace = THREE.SRGBColorSpace;
              this.scene.background.flipY = false;
              this.scene.background.needsUpdate = true; // Force texture update
              
              console.log('✅ VR: Background texture image is loaded and configured:', {
                width: this.scene.background.image.width,
                height: this.scene.background.image.height,
                colorSpace: this.scene.background.colorSpace,
                flipY: this.scene.background.flipY,
                mapping: this.scene.background.mapping
              });
              
              // Explicitly verify the background is on the scene
              console.log('✅ VR: Scene background verified:', {
                hasBackground: !!this.scene.background,
                backgroundType: this.scene.background.constructor.name,
                isTexture: this.scene.background instanceof THREE.Texture
              });
              
              // Create VR skybox mesh (WebXR immersive VR may not render scene.background correctly)
              // Use a large sphere with the texture mapped to it to ensure background is visible
              this.createVRSkybox(this.scene.background);
            } else {
              console.warn('⚠️ VR: Background texture image not yet loaded, will create skybox when loaded...');
              // Set up a listener to create skybox when texture loads
              if (this.scene.background.image) {
                this.scene.background.image.onload = () => {
                  console.log('📸 VR: Background texture finished loading, creating skybox...');
                  this.createVRSkybox(this.scene.background);
                };
              }
            }
          }
          
          // Ensure renderer clear color is opaque (alpha = 1) for background to be visible
          // AR mode sets it to transparent, which would hide the background
          if (this.renderer) {
            if (this.originalClearColor === undefined) {
              this.originalClearColor = new THREE.Color();
              this.renderer.getClearColor(this.originalClearColor);
              this.originalClearAlpha = this.renderer.getClearAlpha();
            }
            // Force opaque clear color for VR (background needs it)
            this.renderer.setClearColor(this.originalClearColor, 1.0);
            console.log('✅ VR: Renderer clear color set to opaque - background will be visible');
          }
          
          // Ensure any previous wrapper is fully cleaned up
          if (this.vrSceneWrapper) {
            console.warn('⚠️ Previous scene wrapper detected, cleaning up...');
            // Move children back to scene if wrapper still exists
            if (this.scene && this.vrSceneWrapper.parent === this.scene) {
              const oldChildren = [...this.vrSceneWrapper.children];
              oldChildren.forEach(child => {
                // Only move if still in wrapper
                if (child.parent === this.vrSceneWrapper) {
                  this.scene.add(child);
                }
              });
              this.scene.remove(this.vrSceneWrapper);
            }
            // Clear wrapper reference
            this.vrSceneWrapper = null;
          }

          // Create scene wrapper for VR content (only wrap 3D models, not lights/cameras)
          if (!this.vrSceneWrapper) {
            this.vrSceneWrapper = new THREE.Group();
            this.vrSceneWrapper.name = 'VRSceneWrapper';
            
            // Only wrap 3D models and meshes, NOT lights, cameras, or helpers
            const children = [...this.scene.children];
            children.forEach(child => {
              // Skip lights, cameras, helpers, and the wrapper itself
              // Only wrap children that are directly in the scene (not already in a wrapper)
              if (child.parent === this.scene &&
                  child.type !== 'AmbientLight' && 
                  child.type !== 'DirectionalLight' && 
                  child.type !== 'PointLight' && 
                  child.type !== 'SpotLight' &&
                  child.type !== 'HemisphereLight' &&
                  child.type !== 'PerspectiveCamera' &&
                  child.type !== 'OrthographicCamera' &&
                  child.name !== 'VRSkybox' &&
                  child.name !== 'VRSceneWrapper' &&
                  child.name !== 'ARSceneWrapper' &&
                  !child.isHelper) {
                this.vrSceneWrapper.add(child);
              }
            });
            
            // Add wrapper to scene at origin - it will be positioned in world space
            this.scene.add(this.vrSceneWrapper);
            console.log('✅ Created VR scene wrapper');
          }
          
          // With 'bounded-floor', Y=0 in the reference space IS the physical floor level
          // Align avatar + world layers so the lowest content sits on Y=0
          const floorAlignmentY = computeXrFloorAlignmentY(this);
          if (this.currentModel || this.worldRoot?.children?.length) {
            console.log(`📐 VR floor alignment:`, {
              floorAlignmentY,
              hasModel: !!this.currentModel,
              hasWorld: !!(this.worldRoot?.children?.length),
              wrapperWillBeAt: `(0, ${floorAlignmentY}, -0.5)`,
            });
            console.log(`📐 With bounded-floor: Y=0 = physical floor level (Android XR boundaries)`);
          } else {
            console.warn('⚠️ VR: No model/world content for floor alignment, using Y=0');
          }
          
          // Set wrapper position in world space (reference space coordinates)
          // Y=0 in bounded-floor reference space = physical floor level from Android XR boundaries
          // XR requirement: X must stay at 0 (centered) for both AR and VR modes
          this.vrSceneWrapper.position.set(0, floorAlignmentY, -0.5);
          this.vrSceneWrapper.matrixAutoUpdate = true; // Ensure matrix updates
          this.vrSceneWrapper.updateMatrixWorld(true);
          if (this.renderMode === 'skeleton') {
            this.createBoneVisualization();
          }
          
          console.log('✅ VR scene wrapper position set to:', this.vrSceneWrapper.position);
          console.log('📐 VR models anchored to floor plane - position fixed in world space');
          console.log('📐 Models will stay stationary while camera moves');
          } catch (offsetError) {
            console.error('❌ Error anchoring VR models:', offsetError);
          }
        }
      } else if (isAR) {
        // AR mode: Enable pass-through and anchor models to floor
        if (this.scene) {
          try {
            console.log('📱 AR mode: Setting up pass-through and floor anchoring...');

            // AR must not render the VR skybox sphere (it would block pass-through).
            // Remove it eagerly in case we are switching from VR -> AR without a full VR teardown.
            if (this.vrSkybox) {
              console.log('🧹 AR: Removing VR skybox to keep pass-through visible...');
              try {
                if (this.vrSkybox.parent) this.vrSkybox.parent.remove(this.vrSkybox);
                if (this.vrSkybox.geometry) this.vrSkybox.geometry.dispose();
                if (this.vrSkybox.material) this.vrSkybox.material.dispose();
              } catch (e) {
                console.warn('⚠️ AR: Failed to remove VR skybox cleanly:', e?.message || e);
              } finally {
                this.vrSkybox = null;
              }
            }
            
            // Save camera state before entering AR
            if (this.camera && this.controls) {
              this.preXRCameraPosition = this.camera.position.clone();
              this.preXRCameraRotation = this.camera.rotation.clone();
              this.preXRCameraTarget = this.controls.target.clone();
              console.log('💾 Saved camera state before AR:', {
                position: this.preXRCameraPosition,
                rotation: this.preXRCameraRotation,
                target: this.preXRCameraTarget
              });
            }
            
            // Enable AR pass-through by making background transparent
            if (this.renderer) {
              try {
                const attrs =
                  typeof this.renderer.getContext === 'function'
                    ? this.renderer.getContext()?.getContextAttributes?.()
                    : null;
                if (attrs && attrs.alpha === false) {
                  console.warn(
                    '⚠️ AR requested, but WebGL context was created with alpha=false. Pass-through may not be transparent on this device/config.',
                  );
                }
              } catch {
                // ignore
              }
              if (this.originalClearColor === undefined) {
                this.originalClearColor = new THREE.Color();
                this.renderer.getClearColor(this.originalClearColor);
                this.originalClearAlpha = this.renderer.getClearAlpha();
              }
              this.renderer.setClearColor(0x000000, 0); // Transparent background
              if (this.renderer.domElement) {
                this.renderer.domElement.style.background = 'transparent';
              }
              console.log('✅ AR pass-through enabled - background set to transparent');
            }
            
            // Store original background to restore later
            if (!this.originalSceneBackground) {
              this.originalSceneBackground = this.scene.background;
            }
            this.scene.background = null; // Remove scene background for AR pass-through
            
            // Ensure any previous wrapper is fully cleaned up
            if (this.vrSceneWrapper) {
              const oldChildren = [...this.vrSceneWrapper.children];
              oldChildren.forEach(child => {
                if (child.parent === this.vrSceneWrapper) {
                  this.scene.add(child);
                }
              });
              this.scene.remove(this.vrSceneWrapper);
              this.vrSceneWrapper = null;
            }

            // Create scene wrapper for AR content
            if (!this.vrSceneWrapper) {
              this.vrSceneWrapper = new THREE.Group();
              this.vrSceneWrapper.name = 'ARSceneWrapper';
              
              const children = [...this.scene.children];
              children.forEach(child => {
                if (child !== this.vrSceneWrapper &&
                    child.parent === this.scene &&
                    child.type !== 'AmbientLight' && 
                    child.type !== 'DirectionalLight' && 
                    child.type !== 'PointLight' && 
                    child.type !== 'SpotLight' &&
                    child.type !== 'HemisphereLight' &&
                    child.type !== 'PerspectiveCamera' &&
                    child.type !== 'OrthographicCamera' &&
                    child.name !== 'VRSkybox' &&
                    child.name !== 'VRSceneWrapper' &&
                    child.name !== 'ARSceneWrapper' &&
                    !child.isHelper) {
                  this.vrSceneWrapper.add(child);
                }
              });
              
              this.scene.add(this.vrSceneWrapper);
              console.log('✅ Created AR scene wrapper');
              console.log(`📦 Wrapped ${this.vrSceneWrapper.children.length} objects for floor anchoring`);
            }
            
            // With 'bounded-floor', Y=0 in the reference space IS the physical floor level
            const floorAlignmentY = computeXrFloorAlignmentY(this);
            if (this.currentModel || this.worldRoot?.children?.length) {
              console.log(`📐 AR floor alignment:`, {
                floorAlignmentY,
                hasModel: !!this.currentModel,
                hasWorld: !!(this.worldRoot?.children?.length),
                wrapperWillBeAt: `(0, ${floorAlignmentY}, -0.5)`,
              });
              console.log(`📐 With bounded-floor: Y=0 = physical floor level (Android XR boundaries)`);
            } else {
              console.warn('⚠️ AR: No model/world content for floor alignment, using Y=0');
            }
            
            // Set wrapper position in world space (reference space coordinates)
            // Y=0 in bounded-floor reference space = physical floor level from Android XR boundaries
            // XR requirement: X must stay at 0 (centered) for both AR and VR modes
            this.vrSceneWrapper.position.set(0, floorAlignmentY, -0.5);
            this.vrSceneWrapper.matrixAutoUpdate = true;
            this.vrSceneWrapper.userData.isAnchored = true;
            this.vrSceneWrapper.userData.anchorPosition = this.vrSceneWrapper.position.clone();
            // Ensure anchorPosition stays centered on X even if something else modifies it later.
            this.vrSceneWrapper.userData.anchorPosition.x = 0;
            this.vrSceneWrapper.updateMatrixWorld(true);
            if (this.renderMode === 'skeleton') {
              this.createBoneVisualization();
            }
            
            console.log('✅ AR scene wrapper position set to:', this.vrSceneWrapper.position);
            console.log('📐 AR models anchored to floor plane at reference space origin');
            console.log('🔒 Wrapper position locked - will NOT move with head movement');
            console.log('📱 AR pass-through active - physical background visible');
          } catch (offsetError) {
            console.error('❌ Error setting up AR:', offsetError);
          }
        }
      }

      // Store session
      this.xrSession = session;
      this.xrRenderer = this.renderer;

      if (this.renderer?.xr && typeof window !== 'undefined' && !window.__IWER_MCP_MANAGED) {
        this.renderer.xr.multiviewStereo = false;
      }

      ensureXrLocomotionRig(this);
      this._ensureXrInteraction().onSessionStart(session, { isVR, isAR });

      // Ensure renderer is set up for XR rendering
      if (this.renderer && this.renderer.xr) {
        const renderSessionMode = isVR ? 'VR' : (isAR ? 'AR' : 'XR');
        console.log(`🎬 Setting up XR render loop for ${renderSessionMode}...`);
        this.createVRExitHud();

        // Stop regular render loop if running (XR uses its own loop via setAnimationLoop)
        if (this.isRendering) {
          this.stopRenderLoop();
        }
        
        // Capture mode flags for use in render loop
        const renderIsVR = isVR;
        const renderIsAR = isAR;
        
        // Three.js XR automatically sets up setAnimationLoop when session starts
        // But we can explicitly set it up to ensure rendering works
        this.renderer.setAnimationLoop((time, frame) => {
          if (this.renderer && this.scene && this.camera) {
            // Don't interfere with Three.js's reference space handling in the render loop
            // The reference space is set once at session start and Three.js handles it from there

            // Fallback recenter / exit (must not throw — kills XR frames on Galaxy XR)
            try {
              this.maybeHandleXRRecenter(time, frame);
              this.maybeHandleXRControllerExit(time);
              this.maybeHandleXRGazeExit(time);
              this._ensureXrInteraction().update(time, frame);
            } catch (xrInputErr) {
              console.warn('[XR] Input handler error:', xrInputErr?.message || xrInputErr);
            }

            // WebXR Expression Tracking → VRM (Android XR / draft "expression-tracking" feature)
            const xrTf = /** @type {XRFrame|null|undefined} */ (frame ?? this.renderer.xr?.getFrame?.());
            if (xrTf && this.renderer.xr?.isPresenting) {
              /** @type {XRSession|null|undefined} */
              const xrSess =
                xrTf.session || session || this.xrSession;

              if (!this._xrExprFirstFrameDiagLogged) {
                this._xrExprFirstFrameDiagLogged = true;
                let featList = [];
                try {
                  if (
                    xrSess?.enabledFeatures &&
                    typeof xrSess.enabledFeatures[Symbol.iterator] === 'function'
                  ) {
                    featList = [...xrSess.enabledFeatures];
                  }
                } catch (_) {
                  featList = [];
                }
                /** @type {any} */
                const fr = xrTf;
                console.info('[XR][expression] First-frame diagnostics', {
                  enabledFeatures: featList,
                  expressionTrackingGranted: featList.includes(XR_EXPRESSION_TRACKING_FEATURE),
                  frameHasExpressionsProperty: fr && 'expressions' in fr,
                  expressionsNonNull: !!(fr && fr.expressions),
                  hint:
                    !featList.includes(XR_EXPRESSION_TRACKING_FEATURE)
                      ? 'UA did not grant optional feature "expression-tracking" — no extra prompt is normal; face may be bundled in WebXR permission or not shipped in this Chrome build.'
                      : !fr?.expressions
                        ? 'Feature listed but frame.expressions is null — browser may not expose draft WebXR Expression Tracking yet.'
                        : 'expression data present; VRM should receive weights if model has mouth/blink shapes.'
                });
              }

              maybeProbeXRFrame(xrTf, xrSess ?? null);
              if (
                xrSess?.enabledFeatures?.includes?.(XR_EXPRESSION_TRACKING_FEATURE) &&
                !this.xrExpressionFeatureLogged
              ) {
                this.xrExpressionFeatureLogged = true;
                console.log(
                  '😐 WebXR Expression Tracking feature active — mapping XR expressions to VRM mouth/blink'
                );
              }
              tickNativeFacePlaybackOnXrFrame();

              const vrms =
                typeof this.xrExpressionVRMProvider === 'function'
                  ? this.xrExpressionVRMProvider().filter(Boolean)
                  : this.currentVRM
                    ? [this.currentVRM]
                    : [];
              let nativeRecXr = null;
              if (vrms.length) {
                nativeRecXr = getNativeFaceWeightsIfFresh(
                  getNativeFaceWeightsMaxAgeMs(true),
                  true,
                );
                if (nativeRecXr && Object.keys(nativeRecXr).length > 0) {
                  applyExpressionWeightRecordToVRMS(vrms, nativeRecXr);
                } else {
                  applyXRFrameExpressionsToVRMS(vrms, xrTf);
                }
              }
              this._maybeLogNativeFaceRemoteDiag(vrms, nativeRecXr);
            }

            // Update controls if not in XR (shouldn't happen, but safety check)
            if (this.controls && !this.renderer.xr.isPresenting) {
              this.controls.update();
            }
            
            if (renderIsVR) {
              // XR requirement: keep VR wrapper centered (X=0) even if other logic drifts it.
              if (this.vrSceneWrapper && this.vrSceneWrapper.name === 'VRSceneWrapper' && this.vrSceneWrapper.position.x !== 0) {
                this.vrSceneWrapper.position.x = 0;
              }
              // VR mode: Ensure renderer clear color is opaque for background to show
              const currentClearColor = new THREE.Color();
              const currentAlpha = this.renderer.getClearAlpha();
              this.renderer.getClearColor(currentClearColor);
              if (currentAlpha < 1.0) {
                this.renderer.setClearColor(currentClearColor, 1.0);
              }
              
              // Ensure VR skybox exists (WebXR immersive VR may not render scene.background)
              if (!this.vrSkybox || !this.vrSkybox.parent) {
                if (this.scene.background instanceof THREE.Texture) {
                  if (this.scene.background.image && this.scene.background.image.complete) {
                    console.log('🔄 VR render loop: Creating missing skybox...');
                    this.createVRSkybox(this.scene.background);
                  }
                } else if (this.scene.background) {
                  // Background exists but isn't a texture yet - wait
                } else {
                  if (this.originalSceneBackground) {
                    this.scene.background = this.originalSceneBackground;
                    if (this.scene.background instanceof THREE.Texture && 
                        this.scene.background.image && 
                        this.scene.background.image.complete) {
                      console.log('🔄 VR render loop: Restored background, creating skybox...');
                      this.createVRSkybox(this.scene.background);
                    }
                  } else {
                    this.setupHDREnvironment();
                  }
                }
              }
              
              // Ensure background texture is properly configured
              if (this.scene.background instanceof THREE.Texture) {
                if (this.scene.background.image && this.scene.background.image.complete) {
                  if (this.scene.background.mapping !== THREE.EquirectangularReflectionMapping) {
                    this.scene.background.mapping = THREE.EquirectangularReflectionMapping;
                  }
                  if (this.scene.background.colorSpace !== THREE.SRGBColorSpace) {
                    this.scene.background.colorSpace = THREE.SRGBColorSpace;
                  }
                  this.scene.background.needsUpdate = true;
                }
              }
            } else if (renderIsAR) {
              // AR mode: keep pass-through transparent + ensure wrapper stays anchored
              // Safety: ensure VR skybox never renders in AR (it would block pass-through).
              if (this.vrSkybox) {
                try {
                  console.log('🧹 AR render loop: Removing VR skybox...');
                  if (this.vrSkybox.parent) this.vrSkybox.parent.remove(this.vrSkybox);
                  if (this.vrSkybox.geometry) this.vrSkybox.geometry.dispose();
                  if (this.vrSkybox.material) this.vrSkybox.material.dispose();
                } catch (e) {
                  console.warn('⚠️ AR render loop: Failed to remove VR skybox:', e?.message || e);
                } finally {
                  this.vrSkybox = null;
                }
              }
              if (this.scene && this.scene.background !== null) {
                this.scene.background = null;
              }
              if (this.renderer) {
                const a = this.renderer.getClearAlpha();
                if (a !== 0) {
                  this.renderer.setClearColor(0x000000, 0);
                }
                if (this.renderer.domElement) {
                  this.renderer.domElement.style.background = 'transparent';
                }
              }

              if (this.vrSceneWrapper && this.vrSceneWrapper.userData.isAnchored) {
                const anchorPos = this.vrSceneWrapper.userData.anchorPosition;
                // XR requirement: keep wrapper centered (X=0) in AR, always.
                if (this.vrSceneWrapper.position.x !== 0) {
                  this.vrSceneWrapper.position.x = 0;
                }
                if (anchorPos && anchorPos.x !== 0) {
                  anchorPos.x = 0;
                }
                if (anchorPos && !this.vrSceneWrapper.position.equals(anchorPos)) {
                  console.warn('⚠️ AR wrapper position changed, restoring anchor');
                  this.vrSceneWrapper.position.copy(anchorPos);
                }
                this.vrSceneWrapper.updateMatrixWorld(true);
              }
            }
            
            // CRITICAL: Ensure our reference space is applied right before rendering
            // This ensures Three.js uses our offset space when rendering
            if (this.xrRenderReferenceSpace && this.renderer.xr) {
              // Force re-application right before render to ensure it's used
              const currentRefSpace = this.renderer.xr.referenceSpace || 
                                     (typeof this.renderer.xr.getReferenceSpace === 'function' ? this.renderer.xr.getReferenceSpace() : null);
              if (currentRefSpace !== this.xrRenderReferenceSpace) {
                // Silently re-apply (we already logged in the earlier check)
                try {
                  if (typeof this.renderer.xr.setReferenceSpace === 'function') {
                    this.renderer.xr.setReferenceSpace(this.xrRenderReferenceSpace);
                  } else {
                    this.renderer.xr.referenceSpace = this.xrRenderReferenceSpace;
                  }
                } catch (e) {
                  // Ignore errors during render loop
                }
              }
            }
            
            // Three.js XR handles the actual rendering automatically
            this.renderer.render(this.scene, this.camera);
          }
        });
        
        if (this.scene && this.camera) {
          console.log(`✅ ${renderSessionMode} scene and camera ready for XR rendering`);
        }
      }

      // Handle session end
      session.addEventListener('end', () => {
         const endMode = isAR ? 'ar' : isVR ? 'vr' : 'xr';
         console.log(`${endMode === 'ar' ? '📱' : '🥽'} ${endMode.toUpperCase()} session ended`);
         this.xrExpressionFeatureLogged = false;
         this._xrExprFirstFrameDiagLogged = false;
         resetFaceRecordingAudioXrUnlock();

         // Use setTimeout to ensure cleanup happens after session fully ends
         setTimeout(() => {
           // Clear XR animation loop
           if (this.renderer && this.renderer.setAnimationLoop) {
             this.renderer.setAnimationLoop(null);
           }
           
           // Clean up session state
           this.handleXRSessionEnd(endMode);
           
           // DON'T restore original setSession - keep our override active for re-entry
           // The override will handle the next session start correctly
           
           // Restart regular render loop
           if (!this.isRendering) {
             this.startRenderLoop();
           }
           resumeNativeFacePlaybackScheduling();
         }, 0);
       });

      // Call original setSession - this initializes Three.js XR
      // The reference space type is already set above, so Three.js will use it
      await unlockFaceRecordingAudioPlayback();
      const result = await originalSetSession(session);
      await unlockFaceRecordingAudioPlayback();

      // CRITICAL: Now set our reference space object on Three.js
      // The type is already set, so we just need to set the actual reference space object
      if (referenceSpace && this.renderer.xr) {
        // Set the actual reference space object
        if (typeof this.renderer.xr.setReferenceSpace === 'function') {
          this.renderer.xr.setReferenceSpace(referenceSpace);
          console.log(`✅ Set Three.js reference space object via setReferenceSpace() (${referenceSpaceType})`);
        } else {
          // Fallback: direct assignment
          this.renderer.xr.referenceSpace = referenceSpace;
          console.log(`✅ Set Three.js reference space object via direct assignment (${referenceSpaceType})`);
        }
      }
      
      return result;
    };

    // If button already exists, return it instead of creating a new one
    if (this.vrButton) {
      console.log('🥽 VR button already exists, reusing...');
      return this.vrButton;
    }

    // Create VR button using Three.js VRButton utility
    // Note: Some devices may not support 'layers' feature - that's okay, we'll handle it gracefully
    // Use empty requiredFeatures to avoid blocking on unsupported features
    let vrButton;
    try {
      vrButton = VRButton.createButton(this.renderer, {
        requiredFeatures: ['bounded-floor'],
        optionalFeatures: [
          'local-floor', 'local', 'viewer',
        ],
      });
      console.log('✅ VRButton.createButton succeeded');
    } catch (error) {
      console.error('❌ VRButton.createButton failed:', error);
      // Try creating button without feature requirements
      try {
        vrButton = VRButton.createButton(this.renderer);
        console.log('✅ VRButton created with default settings');
      } catch (fallbackError) {
        console.error('❌ VRButton creation failed completely:', fallbackError);
        return null;
      }
    }

    // Ensure button always has an ID (Three.js only sets it in the "supported" path)
    if (vrButton) {
      vrButton.id = 'VRButton';
      vrButton.innerHTML = '🥽';
      vrButton.title = 'Enter Virtual Reality';
      vrButton.setAttribute('aria-label', 'Enter Virtual Reality');
      vrButton.style.fontSize = '1.2rem';
      vrButton.style.padding = '4px 8px';
      vrButton.style.minWidth = '32px';
      vrButton.style.height = '32px';
      vrButton.style.textAlign = 'center';
      vrButton.style.display = 'inline-flex';
      vrButton.style.alignItems = 'center';
      vrButton.style.justifyContent = 'center';

      // MutationObserver: keep emoji when Three.js changes button text
      const observer = new MutationObserver(() => {
        if (vrButton.textContent !== '🥽' && !vrButton.textContent.includes('🥽')) {
          vrButton.innerHTML = '🥽';
        }
      });
      observer.observe(vrButton, { childList: true, characterData: true, subtree: true });
      vrButton._emojiObserver = observer;

      // Override button's click handler to manually request session (bypass Three.js internal "layers" feature request)
      // This fixes the issue where VRButton tries to request "layers" feature which isn't supported on Galaxy XR
      // Three.js VRButton may use addEventListener, so we intercept at capture phase
      const clickHandler = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        console.log('🥽 VR button clicked - manually requesting session...');
        await unlockFaceRecordingAudioPlayback();

        try {
          // Check if VR is supported
          if (!navigator.xr) {
            console.error('❌ WebXR not available');
            return;
          }
          
          const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
          if (!isSupported) {
            console.error('❌ Immersive VR not supported on this device');
            return;
          }
          
          // Manually request VR session WITHOUT "layers" feature
          // This avoids the "Unsupported feature requested: layers" error
          console.log('🔄 Requesting VR session with compatible features...');
          const session = await navigator.xr.requestSession('immersive-vr', {
            requiredFeatures: [],
            optionalFeatures: [
              'bounded-floor',
              'local-floor',
              'local',
              'viewer',
              XR_EXPRESSION_TRACKING_FEATURE,
            ],
          });
          
          console.log('✅ VR session requested successfully');
          console.log('🥽 Session features:', session.enabledFeatures || 'none');

          await unlockFaceRecordingAudioPlayback();

          // Manually call our setSession override (which handles reference space, anchoring, etc.)
          if (this.renderer && this.renderer.xr && this.renderer.xr.setSession) {
            await this.renderer.xr.setSession(session);
          }
          await unlockFaceRecordingAudioPlayback();
        } catch (error) {
          console.error('❌ Failed to start VR session:', error);
          console.error('Error details:', {
            message: error.message,
            name: error.name
          });
        }
      };
      
      // Set both onclick and addEventListener to ensure we catch the click
      vrButton.onclick = clickHandler;
      // Also add event listener in capture phase to intercept before Three.js handler
      vrButton.addEventListener('click', clickHandler, { capture: true, once: false });
    }

    // Store button reference
    this.vrButton = vrButton;

    // Add button to container if provided
    if (container) {
      container.appendChild(vrButton);
    }

    console.log('✅ VR button created with emoji icon and custom click handler');
    return vrButton;
  }

  /**
   * Handle XR session end and restore scene structure
   */
  handleXRSessionEnd(mode = 'xr') {
    console.log(`🧹 Cleaning up ${mode.toUpperCase()} session...`);
    this.xrInteraction?.onSessionEnd();
    this._xrExitInFlight = false;
    this._xrNoWebXrInputSources = false;
    this.removeVRExitHud();

    // Restore camera position and rotation to pre-XR state
    if (this.camera && this.preXRCameraPosition) {
      this.camera.position.copy(this.preXRCameraPosition);
      if (this.preXRCameraQuaternion) {
        this.camera.quaternion.copy(this.preXRCameraQuaternion);
      } else if (this.preXRCameraRotation) {
        this.camera.rotation.copy(this.preXRCameraRotation);
      }
      if (this.preXRCameraUp) {
        this.camera.up.copy(this.preXRCameraUp);
      }
      if (typeof this.preXRCameraZoom === 'number') {
        this.camera.zoom = this.preXRCameraZoom;
      }
      if (typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.updateProjectionMatrix();
      }
      if (this.controls && this.preXRCameraTarget) {
        this.controls.target.copy(this.preXRCameraTarget);
        this.controls.update();
      }
      console.log('✅ Camera view restored to pre-XR state:', {
        position: this.camera.position.clone(),
        rotation: this.camera.rotation.clone(),
        target: this.controls?.target?.clone()
      });
      // Clear saved state
      this.preXRCameraPosition = null;
      this.preXRCameraRotation = null;
      this.preXRCameraTarget = null;
      this.preXRCameraQuaternion = null;
      this.preXRCameraUp = null;
      this.preXRCameraZoom = null;
      // Note: preXRBackgroundSnapshot is cleared after restore in AR mode only
    }

    // Restore scene background for AR (if it was changed for pass-through)
    // VR mode doesn't modify background, so no restoration needed
    if (mode === 'ar' && this.preXRBackgroundSnapshot) {
      if (this.scene) {
        const snapshot = this.preXRBackgroundSnapshot;
        if (snapshot.type === 'texture' && snapshot.textureRef) {
          // Restore exact texture state from snapshot
          this.scene.background = snapshot.textureRef;
          this.scene.background.mapping = snapshot.mapping;
          this.scene.background.colorSpace = snapshot.colorSpace;
          this.scene.background.flipY = snapshot.flipY;
          this.scene.background.needsUpdate = true; // Force update to apply restored state
          console.log('✅ AR background restored to exact pre-XR texture state:', {
            mapping: snapshot.mapping,
            colorSpace: snapshot.colorSpace,
            flipY: snapshot.flipY
          });
        } else if (snapshot.type === 'color') {
          this.scene.background = snapshot.value;
          console.log('✅ AR background restored to pre-XR color:', snapshot.value);
        } else {
          this.scene.background = null;
          console.log('✅ AR background restored to null');
        }
        // Clear snapshot after restore
        this.preXRBackgroundSnapshot = null;
      }
      if (this.renderer && this.originalClearColor !== undefined) {
        const alpha = this.originalClearAlpha !== undefined ? this.originalClearAlpha : 1;
        this.renderer.setClearColor(this.originalClearColor, alpha);
        this.originalClearColor = undefined; // Clear after restore
        this.originalClearAlpha = undefined;
        console.log('✅ Renderer clear color restored for AR');
      }
    }

    // Clear XR session references
    this.xrSession = null;
    this.xrReferenceSpace = null;
    // Detach reference-space reset listener (platform recenter) before dropping the reference space.
    if (this.xrBaseReferenceSpace && this.xrOnReferenceSpaceReset) {
      try {
        this.xrBaseReferenceSpace.removeEventListener('reset', this.xrOnReferenceSpaceReset);
      } catch {
        // ignore
      }
    }
    this.xrBaseReferenceSpace = null;
    this.xrRenderReferenceSpace = null;
    this.xrMode = null;
    this.xrAutoCentered = false;
    this._xrRefSpaceReapplied = false; // Reset flag for next session
    this.xrInitialViewerPosition = null; // Clear initial pose
    this.xrInitialViewerOrientation = null; // Clear initial orientation
    this.xrRecenterSelectHoldState = new WeakMap();

    // Remove VR skybox if it exists.
    // Important: this is VR-only content, but it must also be cleared when switching into AR,
    // otherwise it will block pass-through with an opaque sphere.
    if (this.vrSkybox && this.scene) {
      console.log('🧹 Removing VR skybox...');
      try {
        if (this.vrSkybox.parent) {
          this.vrSkybox.parent.remove(this.vrSkybox);
        }
        if (this.vrSkybox.geometry) {
          this.vrSkybox.geometry.dispose();
        }
        if (this.vrSkybox.material) {
          // Also dispose the cloned skybox texture map to avoid leaking GPU memory.
          const mat = this.vrSkybox.material;
          const map = mat?.map;
          if (map && map instanceof THREE.Texture) {
            map.dispose();
          }
          this.vrSkybox.material.dispose();
        }
      } catch (e) {
        console.warn('⚠️ Failed to remove VR skybox during session end cleanup:', e?.message || e);
      } finally {
        this.vrSkybox = null;
      }
      console.log('✅ VR skybox removed');
    }

    // Restore scene structure if XR wrapper was created (used by both VR and AR)
    if (this.vrSceneWrapper && this.scene) {
      console.log(`🧹 Restoring scene structure from ${mode.toUpperCase()} wrapper...`);

      if (this.xrLocomotionRig?.parent === this.vrSceneWrapper) {
        const rigChildren = [...this.xrLocomotionRig.children];
        for (const child of rigChildren) {
          this.vrSceneWrapper.add(child);
        }
        this.vrSceneWrapper.remove(this.xrLocomotionRig);
        this.xrLocomotionRig = null;
      }
      
      // Move all children back to scene (make a copy to avoid iteration issues)
      const children = [...this.vrSceneWrapper.children];
      children.forEach(child => {
        // Only move if still in wrapper (safety check)
        if (child.parent === this.vrSceneWrapper) {
          this.scene.add(child);
        }
      });
      
      // Clear wrapper userData
      if (this.vrSceneWrapper.userData) {
        this.vrSceneWrapper.userData.isAnchored = false;
        this.vrSceneWrapper.userData.anchorPosition = null;
      }
      
      // Remove wrapper
      if (this.vrSceneWrapper.parent === this.scene) {
        this.scene.remove(this.vrSceneWrapper);
      }
      this.vrSceneWrapper = null;
      
      console.log('✅ Scene structure restored');
    }

    // Clear XR renderer reference
    this.xrRenderer = null;

    console.log(`✅ ${mode.toUpperCase()} session cleanup completed`);
  }

  /**
   * Create VR skybox mesh for WebXR immersive VR
   * In WebXR, scene.background may not render correctly, so we use a mesh-based skybox
   * @param {THREE.Texture} texture - The background texture to use for the skybox
   */
  createVRSkybox(texture) {
    // IMPORTANT: only create the mesh-based skybox for immersive VR.
    // If this runs after XR ends (e.g. delayed image.onload), it can pollute the normal 3D viewer
    // and make the background appear flipped.
    if (this.xrMode !== 'vr') {
      return;
    }
    if (!this.scene || !texture) {
      console.warn('⚠️ Cannot create VR skybox: scene or texture missing');
      return;
    }
    
    // Remove existing skybox if it exists
    if (this.vrSkybox) {
      if (this.vrSkybox.parent === this.scene) {
        this.scene.remove(this.vrSkybox);
      }
      if (this.vrSkybox.geometry) {
        this.vrSkybox.geometry.dispose();
      }
      if (this.vrSkybox.material) {
        this.vrSkybox.material.dispose();
      }
      this.vrSkybox = null;
    }
    
    console.log('🌌 Creating VR skybox mesh...');
    
    // Create a large sphere geometry for the skybox
    // Use a large radius to ensure it's always behind everything
    const skyboxGeometry = new THREE.SphereGeometry(1000, 32, 16);
    
    // Create material with the background texture
    // For equirectangular textures on a sphere, we need to use the texture directly
    // Don't clone - use the original texture but ensure it's configured correctly
    if (!texture.image || !texture.image.complete) {
      console.warn('⚠️ VR skybox: Texture image not ready, waiting...');
      // Wait for texture to load
      if (texture.image) {
        texture.image.onload = () => {
          console.log('📸 VR skybox: Texture loaded, creating skybox...');
          this.createVRSkybox(texture);
        };
      }
      return;
    }
    
    // Ensure texture is properly configured for sphere UV mapping.
    // NOTE: MeshBasicMaterial "map" expects standard UV mapping (NOT EquirectangularReflectionMapping).
    // Using reflection mapping here can result in a black/invalid sample on some devices.
    const skyboxTexture = texture.clone();
    skyboxTexture.mapping = THREE.UVMapping;
    skyboxTexture.colorSpace = THREE.SRGBColorSpace;
    // For UV-mapped sphere skyboxes, the correct orientation is typically the opposite of
    // our equirectangular scene.background setup.
    // We force flipY=true here to avoid the sky appearing upside-down in immersive VR.
    skyboxTexture.flipY = true;
    skyboxTexture.needsUpdate = true;
    
    const skyboxMaterial = new THREE.MeshBasicMaterial({
      map: skyboxTexture,
      side: THREE.BackSide, // Render inside the sphere (camera is inside)
      fog: false, // Disable fog for skybox
      depthWrite: false // Don't write to depth buffer (skybox is always behind)
    });
    // Avoid tone mapping affecting the skybox (keeps colors consistent)
    skyboxMaterial.toneMapped = false;
    
    // Create the skybox mesh
    this.vrSkybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
    this.vrSkybox.name = 'VRSkybox';
    this.vrSkybox.renderOrder = -1000; // Render first (behind everything)
    this.vrSkybox.userData.isVRSkybox = true;
    
    // Position skybox at origin (camera will be inside it)
    this.vrSkybox.position.set(0, 0, 0);
    
    // Ensure skybox is always visible
    this.vrSkybox.visible = true;
    this.vrSkybox.frustumCulled = false; // Don't cull the skybox (it's always in view)
    
    // Add to scene
    this.scene.add(this.vrSkybox);
    
    console.log('✅ VR skybox created and added to scene');
    console.log('🌌 Skybox details:', {
      radius: 1000,
      geometry: skyboxGeometry.type,
      material: skyboxMaterial.type,
      textureSize: texture.image ? `${texture.image.width}x${texture.image.height}` : 'unknown',
      textureMapping: skyboxTexture.mapping,
      visible: this.vrSkybox.visible,
      frustumCulled: this.vrSkybox.frustumCulled,
      renderOrder: this.vrSkybox.renderOrder,
      inScene: this.vrSkybox.parent === this.scene
    });
    
    // Verify skybox is actually in the scene
    if (this.vrSkybox.parent !== this.scene) {
      console.error('❌ VR skybox was not added to scene!');
    }
  }

  /**
   * Cleanup and dispose of resources
   */
  dispose() {
    console.log('🧹 Cleaning up SceneManager...');
    this._initGeneration += 1;
    
    // End XR session if active
    if (this.xrSession) {
      this.xrSession.end();
    }
    
    // Clean up VR skybox if it exists
    if (this.vrSkybox && this.scene) {
      if (this.vrSkybox.parent === this.scene) {
        this.scene.remove(this.vrSkybox);
      }
      if (this.vrSkybox.geometry) {
        this.vrSkybox.geometry.dispose();
      }
      if (this.vrSkybox.material) {
        this.vrSkybox.material.dispose();
      }
      this.vrSkybox = null;
    }
    
    // Restore original setSession when disposing
    if (this.originalXRSetSession && this.renderer && this.renderer.xr) {
      this.renderer.xr.setSession = this.originalXRSetSession;
      this.originalXRSetSession = null;
    }
    
    // Stop render loop
    this.stopRenderLoop();

    if (typeof window !== 'undefined') {
      if (this._windowResizeHandler) {
        window.removeEventListener('resize', this._windowResizeHandler);
        this._windowResizeHandler = null;
      }
      if (this._onVisibilityForRefit && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this._onVisibilityForRefit);
        this._onVisibilityForRefit = null;
      }
      if (this._onPageshowForRefit) {
        window.removeEventListener('pageshow', this._onPageshowForRefit);
        this._onPageshowForRefit = null;
      }
      if (this._onVisualViewportResize && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', this._onVisualViewportResize);
        this._onVisualViewportResize = null;
      }
      if (this._webViewResumeBridge && window.__characterStudioWebViewResume === this._webViewResumeBridge) {
        try {
          delete window.__characterStudioWebViewResume;
        } catch (_) {
          window.__characterStudioWebViewResume = undefined;
        }
        this._webViewResumeBridge = null;
      }
    }
    this.sceneHostElement = null;
    
    void this._disposeSceneLipSync();
    // Clear current model
    this.clearModel();
    disposeSparkRenderer(this);
    
    // Dispose of renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    
    // Dispose of controls
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    
    // Clear scene
    if (this.scene) {
      this.scene.clear();
      this.scene = null;
    }

    this.playerRoot = null;
    this.worldRoot = null;
    this.propsRoot = null;
    this.worldPropMeshes = [];
    this.worldEnvironmentSplat = null;
    this.worldColliderMesh = null;
    this.activeWorldId = null;
    this.activeWorldManifest = null;
    
    // Clear XR-related properties
    this.vrSceneWrapper = null;
    this.xrReferenceSpace = null;
    this.xrSession = null;
    this.xrRenderer = null;
    
    // Reset state
    this.isInitialized = false;
    this.camera = null;
    
    console.log('✅ SceneManager cleanup completed');
  }

  /**
   * Event system
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => callback(data));
    }
  }

}
