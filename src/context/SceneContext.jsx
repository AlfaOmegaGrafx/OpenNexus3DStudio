import React, { createContext, useContext, useRef, useEffect, useState, useCallback } from 'react';
import { SceneManager } from '../library/sceneManager';
import { CharacterManager } from '../library/characterManager';
import { WebcamAvatarDriver } from '../library/webcamAvatarDriver';
import { loadStudioDefaultAnimations, loadStudioAnimationAtIndex } from '../library/studioAnimations';
import {
  bootstrapLootCharacter,
  resolveMainManifestUrl,
} from '../library/lootAssetsConfig';
import {
  pickPrimaryExpressionVrm,
  collectViewportRenderRoots,
  syncAnimationPrimaryTarget,
  VIEWPORT_VRM_CHANGED_EVENT,
} from '../library/viewportExpressionVrm';
import { getMixamoAnimation, getMixamoAnimationForRig } from '../library/loadMixamoAnimation';
import { countModelBones } from '../library/rigBoneUtils';

export const SceneContext = createContext();

export const useScene = () => {
  const context = useContext(SceneContext);
  if (!context) {
    throw new Error('useScene must be used within a SceneProvider');
  }
  return context;
};

export const SceneProvider = ({ children }) => {
  const sceneManagerRef = useRef(null);
  const characterManagerRef = useRef(null);
  const containerRef = useRef(null);
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [currentModel, setCurrentModel] = React.useState(null);
  const [renderMode, setRenderMode] = React.useState('solid');
  const [isLoading, setIsLoading] = React.useState(false);
  const [webcamAvatarActive, setWebcamAvatarActive] = useState(false);
  const [webcamError, setWebcamError] = useState(null);
  const webcamDriverRef = useRef(null);
  /** When Cam turns off, resume studio animations only if we paused them. */
  const webcamAnimPausedByCamRef = useRef(false);
  const [lookAtSetupDone, setLookAtSetupDone] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [lootBootstrapDone, setLootBootstrapDone] = useState(false);
  const [expressionVrmRevision, setExpressionVrmRevision] = useState(0);
  const [managersReady, setManagersReady] = useState(false);
  const [activeWorldId, setActiveWorldId] = useState(null);
  const [rendererType, setRendererType] = useState('webgl');

  const syncAnimationTargets = useCallback(() => {
    const sm = sceneManagerRef.current;
    const cm = characterManagerRef.current;
    if (!sm || !cm) return null;
    const primary = syncAnimationPrimaryTarget(sm, cm);
    if (primary && cm.animationManager?.mainControl && !cm.animationManager.isPaused()) {
      cm.animationManager.update(true);
    }
    return primary;
  }, []);

  // Initialize scene manager and character manager
  useEffect(() => {
    if (!sceneManagerRef.current) {
      sceneManagerRef.current = new SceneManager();
    }
    if (!characterManagerRef.current) {
      characterManagerRef.current = new CharacterManager({
        parentModel: null,
        renderCamera: null,
        manifestURL: null,
        manifestIdentifier: null
      });
    }
    setManagersReady(true);
  }, []);

  // Setup event listeners after scene is initialized
  useEffect(() => {
    if (sceneManagerRef.current && isInitialized) {
      const handleModelLoaded = (data) => {
        requestAnimationFrame(() => {
          setCurrentModel(data.model);
          setExpressionVrmRevision((n) => n + 1);
          syncAnimationTargets();
        });
      };

      const handleModelCleared = () => {
        requestAnimationFrame(() => {
          setCurrentModel(null);
          setExpressionVrmRevision((n) => n + 1);
          syncAnimationTargets();
        });
      };

      const handleRenderModeChanged = (data) => {
        // Use requestAnimationFrame to defer state update to next frame
        requestAnimationFrame(() => setRenderMode(data.mode));
      };

      const handleBoneSelected = (data) => {
        console.log('Bone selected:', data.boneName);
        // You can add additional handling here if needed
      };

      const handleBoneDeselected = (data) => {
        console.log('Bone deselected:', data.boneName);
        // You can add additional handling here if needed
      };

      sceneManagerRef.current.on('modelLoaded', handleModelLoaded);
      sceneManagerRef.current.on('modelCleared', handleModelCleared);
      sceneManagerRef.current.on('renderModeChanged', handleRenderModeChanged);
      sceneManagerRef.current.on('boneSelected', handleBoneSelected);
      sceneManagerRef.current.on('boneDeselected', handleBoneDeselected);

      const handleWorldLoaded = (data) => {
        requestAnimationFrame(() => {
          setActiveWorldId(data?.manifest?.id ?? null);
        });
      };
      const handleWorldCleared = () => {
        requestAnimationFrame(() => setActiveWorldId(null));
      };

      sceneManagerRef.current.on('worldLoaded', handleWorldLoaded);
      sceneManagerRef.current.on('worldCleared', handleWorldCleared);

      // Cleanup function
      return () => {
        if (sceneManagerRef.current) {
          sceneManagerRef.current.off('modelLoaded', handleModelLoaded);
          sceneManagerRef.current.off('modelCleared', handleModelCleared);
          sceneManagerRef.current.off('renderModeChanged', handleRenderModeChanged);
          sceneManagerRef.current.off('boneSelected', handleBoneSelected);
          sceneManagerRef.current.off('boneDeselected', handleBoneDeselected);
          sceneManagerRef.current.off('worldLoaded', handleWorldLoaded);
          sceneManagerRef.current.off('worldCleared', handleWorldCleared);
        }
      };
    }
  }, [isInitialized, syncAnimationTargets]);

  // Set up look-at mouse (and animation manager) so BottomDisplayMenu has lookAtManager
  useEffect(() => {
    if (!isInitialized || lookAtSetupDone) return;
    const sm = sceneManagerRef.current;
    const cm = characterManagerRef.current;
    if (!sm?.renderer?.domElement || !sm?.camera || !cm || cm.lookAtManager) return;
    const canvas = sm.renderer.domElement;
    if (!canvas.id) canvas.id = 'scene-canvas';
    cm.addLookAtMouse(80, canvas.id, sm.camera, true);
    setLookAtSetupDone(true);
  }, [isInitialized, lookAtSetupDone]);

  // Main character index manifest (`public/loot-assets/manifest.json` or VITE_ASSET_PATH)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(resolveMainManifestUrl(), { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setManifest(data);
      } catch (err) {
        console.warn('[LootAssets] Could not load main manifest:', err?.message || err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Animation bar defaults + loot trait bootstrap + scene attach
  useEffect(() => {
    if (!isInitialized || !lookAtSetupDone || lootBootstrapDone) return;
    const sm = sceneManagerRef.current;
    const cm = characterManagerRef.current;
    if (!sm?.scene || !cm) return;

    cm.animationManager?.registerViewportResync?.(() => {
      syncAnimationTargets();
    });

    if (!cm.parentModel) {
      cm.setParentModel(sm.scene);
    }
    if (sm.camera) {
      cm.setRenderCamera(sm.camera);
    }

    let cancelled = false;
    (async () => {
      try {
        await loadStudioDefaultAnimations(cm.animationManager);
        await bootstrapLootCharacter(cm, { manifestOnly: true });
      } catch (err) {
        console.warn('[LootAssets] Scene bootstrap failed:', err?.message || err);
      } finally {
        if (!cancelled) {
          setLootBootstrapDone(true);
          setExpressionVrmRevision((n) => n + 1);
          syncAnimationTargets();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isInitialized, lookAtSetupDone, lootBootstrapDone, syncAnimationTargets]);

  // Expose animation smoke-test hooks when ?animSmoke=1 (Playwright / manual QA).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('animSmoke')) return undefined;

    window.__csAnimSmoke = {
      getDiag: () => characterManagerRef.current?.animationManager?.getPlaybackDiagnostics?.() ?? null,
      sampleHipsRotation: () => {
        const sm = sceneManagerRef.current;
        const am = characterManagerRef.current?.animationManager;
        const vrm =
          sm?.currentVRM ??
          am?.animationControls?.find((c) => c.vrm)?.vrm;
        const hips = vrm?.humanoid?.getNormalizedBoneNode?.('hips');
        if (!hips) return null;
        const rot = hips.rotation.toArray();
        return rot.length === 4 ? rot.slice(0, 3) : rot;
      },
      loadSampleVrm: async () => {
        const sm = sceneManagerRef.current;
        if (!sm?.loadModel) return false;
        const candidates = [
          '/loot-assets/0N1/0N1_1.vrm',
          '/loot-assets/models/Body/orion.vrm',
        ];
        for (const url of candidates) {
          try {
            const head = await fetch(url, { method: 'HEAD' });
            if (!head.ok) continue;
            await sm.loadModel(url);
            return !!sm.currentVRM;
          } catch {
            /* try next */
          }
        }
        return false;
      },
      loadWalking: async () => {
        const am = characterManagerRef.current?.animationManager;
        if (!am?._studioAnimationEntries?.length) return false;
        const idx = am._studioAnimationEntries.findIndex((e) => /walk/i.test(e.name));
        if (idx < 0) return false;
        await loadStudioAnimationAtIndex(am, idx);
        am.play();
        am.update(true);
        return true;
      },
    };

    return () => {
      delete window.__csAnimSmoke;
    };
  }, []);

  // Expose appearance smoke-test hooks when ?appearanceSmoke=1 (Playwright / manual QA).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('appearanceSmoke')) return undefined;

    window.__csAppearanceSmoke = {
      getDiag: () => {
        const cm = characterManagerRef.current;
        const avatar = cm?.avatar ?? {};
        return {
          managersReady,
          lootBootstrapDone,
          traitGroupCount: cm?.getGroupTraits?.()?.length ?? 0,
          loadedTraitGroups: Object.keys(avatar),
          meshCount: cm?.rootModel?.children?.length ?? 0,
          characterVisible: cm?.isCharacterVisible?.() ?? true,
        };
      },
      loadDefaultLootPack: async () => {
        const cm = characterManagerRef.current;
        if (!cm) return false;
        await bootstrapLootCharacter(cm, { force: true });
        return Object.keys(cm.avatar || {}).length > 0;
      },
    };

    return () => {
      delete window.__csAppearanceSmoke;
    };
  }, [managersReady, lootBootstrapDone]);

  // Initialize scene when container is ready
  const initializeScene = async (container, options = {}) => {
    if (!sceneManagerRef.current || !container) return;

    const sm = sceneManagerRef.current;
    const existingCanvas = sm.renderer?.domElement;
    if (isInitialized && existingCanvas?.parentElement === container) {
      return {
        scene: sm.scene,
        camera: sm.camera,
        renderer: sm.renderer,
        controls: sm.controls,
        rendererType: sm.rendererType,
      };
    }
    if (isInitialized && existingCanvas && existingCanvas.parentElement !== container) {
      console.warn(
        'SceneContext: Canvas moved to a new container; re-initializing viewport',
      );
      sm.dispose();
      setIsInitialized(false);
    }

    try {
      setIsLoading(true);
      const sceneData = await sceneManagerRef.current.initialize(container, options);
      setRendererType(sceneManagerRef.current.rendererType || sceneData?.rendererType || 'webgl');
      setIsInitialized(true);
      return sceneData;
    } catch (error) {
      console.error('Failed to initialize scene:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Load model
  const loadModel = async (source, options = {}) => {
    const sm = sceneManagerRef.current;
    if (!sm || !isInitialized || !sm.renderer?.domElement || !sm.scene) {
      if (sm && isInitialized && !sm.renderer?.domElement) {
        console.warn('SceneContext: Renderer lost — resetting initialized state');
        setIsInitialized(false);
      }
      console.warn('SceneContext: Cannot load model — scene not initialized');
      throw new Error('Scene not initialized');
    }

    try {
      setIsLoading(true);
      return await sm.loadModel(source, options);
    } catch (error) {
      console.error('Failed to load model:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loadWorldPackage = async (manifest, manifestUrl, options = {}) => {
    if (!sceneManagerRef.current) return;
    try {
      setIsLoading(true);
      return await sceneManagerRef.current.loadWorldPackage(manifest, manifestUrl, options);
    } catch (error) {
      console.error('Failed to load world package:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loadWorldFromManifestUrl = async (manifestUrl, options = {}) => {
    if (!sceneManagerRef.current) return;
    try {
      setIsLoading(true);
      return await sceneManagerRef.current.loadWorldFromManifestUrl(manifestUrl, options);
    } catch (error) {
      console.error('Failed to load world manifest:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loadWorldFromTaskResult = async (taskResult, options = {}) => {
    if (!sceneManagerRef.current) {
      console.warn('SceneContext: Cannot load world — scene not initialized');
      throw new Error('Scene not initialized');
    }
    try {
      setIsLoading(true);
      return await sceneManagerRef.current.loadWorldFromTaskResult(taskResult, options.apiEndpoint);
    } catch (error) {
      console.error('Failed to load world from task result:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loadWorldEnvironment = async (url, options = {}) => {
    if (!sceneManagerRef.current) return;
    try {
      setIsLoading(true);
      return await sceneManagerRef.current.loadWorldEnvironment(url, options);
    } catch (error) {
      console.error('Failed to load world environment:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const clearWorld = () => {
    sceneManagerRef.current?.clearWorld();
    setActiveWorldId(null);
  };

  // Set render mode
  const updateRenderMode = (mode) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setRenderMode(mode);
    }
  };

  // Clear current model
  const clearModel = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.clearModel();
    }
  };

  // Export model
  const exportModel = async (format = 'glb', options = {}) => {
    const sm = sceneManagerRef.current;
    if (!sm) return undefined;

    const model = sm.currentModel;
    const am = characterManagerRef.current?.animationManager;
    let animationClips = options.animationClips;

    if (format === 'glb' && animationClips == null && am?.mixamoAnimations && am?.mixamoModel && model) {
      const vrm = model.userData?.vrm ?? sm.currentVRM;
      const viewportControl =
        (vrm && am.animationControls.find((c) => c.vrm === vrm)) ??
        am.animationControls.find((c) => c.rigRoot === model && !c.vrm);

      if (viewportControl?.animations?.length) {
        animationClips = viewportControl.animations.map((clip) => clip.clone());
      } else {
        const mixamoRef = am.mixamoModel.clone();
        mixamoRef.updateMatrixWorld(true);
        const clip = vrm
          ? getMixamoAnimation(am.mixamoAnimations, mixamoRef, vrm)
          : countModelBones(model) > 0
            ? getMixamoAnimationForRig(am.mixamoAnimations, mixamoRef, model)
            : null;
        if (clip) animationClips = [clip];
      }
    }

    if (format === 'vrm') {
      const cm = characterManagerRef.current;
      const name = (options.filename || 'opennexus3dstudio_export').replace(/\.vrm$/i, '');
      if (cm && Object.keys(cm.avatar || {}).length > 0) {
        return cm.downloadVRM(name, options);
      }
      const { downloadVRMWithAvatar } = await import('../library/download-utils');
      const vrmModel = sm.currentVRM?.scene || model;
      const vrm = model?.userData?.vrm ?? sm.currentVRM;
      const avatarToUse = vrm
        ? { CUSTOM: { vrm, model: vrmModel } }
        : {
            CUSTOM: {
              vrm: { meta: options.vrmMeta || {}, humanoid: {}, materials: [], scene: vrmModel },
              model: vrmModel,
            },
          };
      return downloadVRMWithAvatar(vrmModel, avatarToUse, name, options);
    }

    return await sm.exportModel(format, { ...options, animationClips });
  };

  // Start render loop
  const startRenderLoop = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.startRenderLoop();
    }
  };

  // Stop render loop
  const stopRenderLoop = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.stopRenderLoop();
    }
  };

  // Get scene data
  const getSceneData = () => {
    if (sceneManagerRef.current) {
      return {
        scene: sceneManagerRef.current.scene,
        camera: sceneManagerRef.current.camera,
        renderer: sceneManagerRef.current.renderer,
        controls: sceneManagerRef.current.controls
      };
    }
    return null;
  };

  // Scene control methods
  const setLighting = (preset) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setLighting(preset);
    }
  };

  const setLightIntensity = (intensity) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setLightIntensity(intensity);
    }
  };

  const setCameraMode = (mode) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setCameraMode(mode);
    }
  };

  const resetCamera = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.resetCamera();
    }
  };

  const focusOnFace = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.focusOnFace();
    }
  };

  const setView = (view) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setView(view);
    }
  };

  const toggleStats = (show) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.toggleStats(show);
    }
  };

  const toggleAutoRotate = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.toggleAutoRotate();
    }
  };

  const takeScreenshot = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.takeScreenshot();
    }
  };

  const toggleFullscreen = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.toggleFullscreen();
    }
  };

  const setAutoTone = (enabled) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setAutoTone(enabled);
    }
  };

  const setToneMapping = (mapping) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setToneMapping(mapping);
    }
  };

  const setExposure = (exposure) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setExposure(exposure);
    }
  };

  // Load HDR environment
  const loadHDREnvironment = (hdrPath, intensity = 0.5) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.loadHDREnvironment(hdrPath, intensity);
    }
  };

  // Enable AR mode - returns ARButton element
  const enableAR = (container = null) => {
    if (sceneManagerRef.current) {
      return sceneManagerRef.current.enableAR(container);
    }
    return null;
  };

  // Enable VR mode - returns VRButton element
  const enableVR = (container = null) => {
    if (sceneManagerRef.current) {
      return sceneManagerRef.current.enableVR(container);
    }
    return null;
  };

  // Webcam Avatar Control (Kalidokit + MediaPipe). Does not run when WebXR is presenting.
  // Same resolver drives WebXR Expression Tracking (mouth/blink) when the UA enables it.
  const getVRMsForWebcam = useCallback(() => {
    const primary = pickPrimaryExpressionVrm(
      sceneManagerRef.current,
      characterManagerRef.current,
    );
    return primary ? [primary] : [];
  }, []);

  const getViewportRenderRoots = useCallback(
    () =>
      collectViewportRenderRoots(
        sceneManagerRef.current,
        characterManagerRef.current,
      ),
    [],
  );

  useEffect(() => {
    const onViewportVrmChanged = () => {
      setExpressionVrmRevision((n) => n + 1);
      const sm = sceneManagerRef.current;
      if (sm?.renderMode) {
        sm.updateRenderMode(sm.renderMode);
      }
    };
    window.addEventListener(VIEWPORT_VRM_CHANGED_EVENT, onViewportVrmChanged);
    return () => window.removeEventListener(VIEWPORT_VRM_CHANGED_EVENT, onViewportVrmChanged);
  }, []);

  useEffect(() => {
    const sm = sceneManagerRef.current;
    if (!sm || !isInitialized) return;
    sm.setXRExpressionVRMProvider(getVRMsForWebcam);
    sm.setViewportRenderRootsProvider(getViewportRenderRoots);
    return () => {
      sm.setXRExpressionVRMProvider(null);
      sm.setViewportRenderRootsProvider(null);
    };
  }, [isInitialized, getVRMsForWebcam, getViewportRenderRoots]);

  const setMicLipSyncSuspended = useCallback((suspended) => {
    characterManagerRef.current?.setLipSyncSuspended(suspended);
    sceneManagerRef.current?.setSceneLipSyncSuspended(suspended);
  }, []);

  useEffect(() => {
    const onPlayback = (evt) => {
      const playing = !!evt?.detail?.playing;
      setMicLipSyncSuspended(playing);
    };
    const onRecordingAudio = (evt) => {
      const recording = !!evt?.detail?.recording;
      if (recording) {
        setMicLipSyncSuspended(true);
      }
    };
    window.addEventListener('characterstudio-native-face-playback', onPlayback);
    window.addEventListener('characterstudio-face-recording-audio', onRecordingAudio);
    return () => {
      window.removeEventListener('characterstudio-native-face-playback', onPlayback);
      window.removeEventListener('characterstudio-face-recording-audio', onRecordingAudio);
    };
  }, [setMicLipSyncSuspended]);

  const startWebcamControl = async () => {
    if (webcamDriverRef.current?.active) return true;
    setWebcamError(null);
    const sm = sceneManagerRef.current;
    if (!sm?.renderer) {
      setWebcamError('3D scene is not ready yet. Wait for the viewport to load, then try again.');
      return false;
    }
    if (!webcamDriverRef.current) {
      webcamDriverRef.current = new WebcamAvatarDriver({
        getVRMs: getVRMsForWebcam,
        getRenderer: () => ({ renderer: sceneManagerRef.current?.renderer ?? null }),
        setBodyFrameHook: (hook) => {
          sceneManagerRef.current?.setWebcamBodyFrameHook?.(hook);
        },
        onStateChange: (active) => {
          setWebcamAvatarActive(active);
          setMicLipSyncSuspended(active);
          const am = characterManagerRef.current?.animationManager;
          if (am) {
            if (active) {
              webcamAnimPausedByCamRef.current = !am.isPaused();
              if (webcamAnimPausedByCamRef.current) am.pause();
            } else if (webcamAnimPausedByCamRef.current) {
              am.play();
              webcamAnimPausedByCamRef.current = false;
            }
          }
        },
        onError: (msg) => setWebcamError(msg)
      });
    }
    const ok = await webcamDriverRef.current.start();
    if (!ok) {
      setWebcamAvatarActive(false);
      setMicLipSyncSuspended(false);
    } else {
      setMicLipSyncSuspended(true);
    }
    return ok;
  };

  const stopWebcamControl = () => {
    setWebcamError(null);
    if (webcamDriverRef.current) {
      webcamDriverRef.current.stop();
      setWebcamAvatarActive(false);
    }
    setMicLipSyncSuspended(false);
    const am = characterManagerRef.current?.animationManager;
    if (am && webcamAnimPausedByCamRef.current) {
      am.play();
      webcamAnimPausedByCamRef.current = false;
    }
  };

  const isWebcamControlActive = () => webcamDriverRef.current?.active ?? false;

  // Cleanup: stop webcam driver before disposing scene
  useEffect(() => {
    return () => {
      if (webcamDriverRef.current) {
        webcamDriverRef.current.stop();
        webcamDriverRef.current = null;
      }
      if (sceneManagerRef.current) {
        sceneManagerRef.current.dispose();
      }
    };
  }, []);

  const value = {
    // State
    isInitialized,
    currentModel,
    activeWorldId,
    renderMode,
    rendererType,
    isLoading,
    
    // Actions
    initializeScene,
    loadModel,
    loadWorldPackage,
    loadWorldFromManifestUrl,
    loadWorldFromTaskResult,
    loadWorldEnvironment,
    clearWorld,
    updateRenderMode,
    clearModel,
    exportModel,
    startRenderLoop,
    stopRenderLoop,
    getSceneData,
    loadHDREnvironment,
    
    // Scene Controls
    setLighting,
    setLightIntensity,
    setCameraMode,
    resetCamera,
    focusOnFace,
    setView,
    toggleStats,
    toggleAutoRotate,
    takeScreenshot,
    toggleFullscreen,
    setAutoTone,
    setToneMapping,
    setExposure,
    
    // XR Controls
    enableAR,
    enableVR,

    // Webcam Avatar Control (disabled automatically when WebXR is active)
    webcamAvatarActive,
    webcamError,
    startWebcamControl,
    stopWebcamControl,
    isWebcamControlActive,

    // Character manifests (Create / Claim / Wallet)
    manifest,
    managersReady,
    lootBootstrapDone,
    expressionVrmRevision,

    // Refs (and derived for BottomDisplayMenu)
    containerRef,
    sceneManager: sceneManagerRef.current,
    characterManager: characterManagerRef.current,
    lookAtManager: managersReady
      ? characterManagerRef.current?.lookAtManager ?? null
      : null,
    animationManager: managersReady
      ? characterManagerRef.current?.animationManager ?? null
      : null,
  };

  return (
    <SceneContext.Provider value={value}>
      {children}
    </SceneContext.Provider>
  );
};