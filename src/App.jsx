import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { SceneProvider, useScene } from './context/SceneContext';
import { TaskProvider, useTask } from './context/TaskContext';
import { AudioProvider } from './context/AudioContext';
import { SoundProvider } from './context/SoundContext';
import { Core3DProvider } from './context/Core3DContext';
import Scene3D from './components/Scene3D';
import TaskManager from './components/TaskManager';
import XrAiPanel from './components/XrAiPanel';
import XrMenuBridge from './components/XrMenuBridge';
import WorldLibrary from './components/WorldLibrary';
import CombinedImport from './components/CombinedImport';
import RenderModeSelector from './components/RenderModeSelector';
import APIStatus from './components/APIStatus';
import GLBExport from './components/GLBExport';
import VRMExport from './components/VRMExport';
import TextureExtractor from './components/TextureExtractor';
import Core3DPanel from './components/Core3DPanel';
import CreatureAnimationPanel from './components/CreatureAnimationPanel';
import ErrorBoundary from './components/ErrorBoundary';
import BlendShapeController from './components/BlendShapeController';
import TaskProgressBar from './components/TaskProgressBar';
import GlobalAudioControl from './components/GlobalAudioControl';
import SceneControlsCompact from './components/SceneControlsCompact';
import { ensureAbsoluteUrl, normalizeApiBaseUrl } from './library/taskManager';
import { getDefaultModelForFeature } from './library/aiModelsCatalog.js';
import { objectNameFromFilename, normalizeObjectName, promptForObjectName } from './library/objectNameUtils.js';
import {
  enrichCompletedJobPayload,
  getTaskResultModelUrl,
  getTaskResultMeshUrl,
  getTaskResultFbxUrl,
  getAutoRigMetaFromResult,
  getTaskResultFileExtension,
  isQuadRetopoTaskResult,
  isTextToImageTaskResult,
  isTextToMotionTaskResult,
  normalizeTaskLoadPayload,
  resolveTaskModelUrl,
} from './library/taskModelUrl';
import { exportAvatarPipelineVrm } from './library/avatarPipelineExport.js';
import { attachSplatPreviewMetadata } from './library/vrmTemplateMetadata.js';
import {
  parseJobHandoffFromLocation,
  parseLoadMeshFromLocation,
  clearLoadMeshFromLocation,
} from './library/jobHandoff.js';
import {
  equipAppearanceComponentTrait,
  inferAppearanceSlot,
} from './library/appearanceClothing.js';
import {
  AI_BACKEND_UNAVAILABLE_MSG,
  canBrowseAiTaskCatalog,
  dispatchOpenTaskCatalog,
  isPublicDemo,
} from './library/runtimeUi.js';

// Import OpenNexus3DStudio avatar panels (Appearance, Save, Mint, Load, Tools)
import AppearanceSimple from './pages/AppearanceSimple';
import SaveSimple from './pages/SaveSimple';
import MintSimple from './pages/MintSimple';
import LoadSimple from './pages/LoadSimple';
import ToolsSimple from './pages/ToolsSimple';
import BottomDisplayMenu from './components/BottomDisplayMenu';
import Mesh2MotionControllerOverlay from './components/Mesh2MotionControllerOverlay';
import NativeFaceRelayHud from './components/NativeFaceRelayHud';
import { useDragToScroll } from './hooks/useDragToScroll';
import { subscribeViewportLayoutSync } from './library/viewportLayoutSync';
import { syncSidebarScrollToElement } from './library/boneStructurePanelScroll';
import { showApiStatusPanel } from './library/runtimeUi';
import {
  showXrAiPanel,
  OPEN_XR_AI_PANEL_EVENT,
  requestXrVoiceExpand,
} from './library/xrHubConfig';
import './App.css';

/** Electron dialog returns a filesystem path; loaders expect a `file:` URL in the renderer. */
function filePathToFileUrl(fp) {
  if (!fp || typeof fp !== 'string') return fp;
  const t = fp.trim();
  if (/^(https?:|file:)/i.test(t)) return t;
  const posix = t.replace(/\\/g, '/');
  return posix.startsWith('/') ? `file://${posix}` : `file:///${posix}`;
}

function AppContent() {
  const [isElectron, setIsElectron] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState(() =>
    normalizeApiBaseUrl(import.meta.env.VITE_API_ENDPOINT ?? ''),
  );
  const [skeletonActive, setSkeletonActive] = useState(false);
  const [currentPanel, setCurrentPanel] = useState('appearance'); // Panel state - default to appearance
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Sidebar collapse state
  const [openNexusSidebarCollapsed, setOpenNexusSidebarCollapsed] = useState(true); // OpenNexus avatar sidebar — default collapsed
  const combinedImportRef = useRef(null);
  const xrAiPanelRef = useRef(null);
  const pendingXrPanelOpenRef = useRef(false);
  const headerRef = useRef(null);
  const sceneControlsRef = useRef(null);
  const appContentRef = useRef(null);

  useLayoutEffect(() => {
    const syncChromeHeights = () => {
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const sceneControlsHeight = sceneControlsRef.current?.offsetHeight ?? 0;
      if (headerHeight > 0) {
        document.documentElement.style.setProperty('--app-header-height', `${headerHeight}px`);
      }
      if (sceneControlsHeight > 0) {
        document.documentElement.style.setProperty('--scene-controls-height', `${sceneControlsHeight}px`);
      }
      const chromeTop = headerHeight + sceneControlsHeight;
      if (chromeTop > 0) {
        document.documentElement.style.setProperty('--app-chrome-top-height', `${chromeTop}px`);
      }
      const progressHeight = document.querySelector('.task-progress-bar')?.offsetHeight ?? 0;
      document.documentElement.style.setProperty('--task-progress-height', `${progressHeight}px`);

      const appContentTop = appContentRef.current?.getBoundingClientRect().top ?? 0;
      if (appContentTop > 0) {
        document.documentElement.style.setProperty('--app-content-top', `${Math.round(appContentTop)}px`);
      } else if (chromeTop > 0) {
        document.documentElement.style.setProperty(
          '--app-content-top',
          `${Math.round(chromeTop + progressHeight)}px`,
        );
      }
    };

    const syncLayout = () => {
      syncChromeHeights();
      requestAnimationFrame(syncChromeHeights);
    };

    const unsubscribeViewport = subscribeViewportLayoutSync(syncLayout);

    syncLayout();
    const observer = new ResizeObserver(syncLayout);
    if (headerRef.current) observer.observe(headerRef.current);
    if (sceneControlsRef.current) observer.observe(sceneControlsRef.current);
    if (appContentRef.current) observer.observe(appContentRef.current);

    const progressBar = document.querySelector('.task-progress-bar');
    if (progressBar) observer.observe(progressBar);

    const barObserver = new ResizeObserver(syncLayout);
    const overlay = document.querySelector('.bottom-menu-overlay');
    if (overlay) barObserver.observe(overlay);

    return () => {
      unsubscribeViewport();
      observer.disconnect();
      barObserver.disconnect();
    };
  }, []);

  const { scrollRef: sidebarScrollRef, scrollHandlers: sidebarScrollHandlers } = useDragToScroll({
    axis: 'y',
    disabled: sidebarCollapsed,
    draggingClassName: 'is-drag-scrolling',
  });

  const { scrollRef: headerScrollRef, scrollHandlers: headerScrollHandlers } = useDragToScroll({
    axis: 'x',
    draggingClassName: 'is-dragging',
  });

  // Debug class changes
  useEffect(() => {
    console.log('🔍 Class Debug:', {
      sidebarCollapsed,
      openNexusSidebarCollapsed,
      hasOpenNexusSidebar: !openNexusSidebarCollapsed,
      mainSidebarCollapsed: sidebarCollapsed
    });
  }, [sidebarCollapsed, openNexusSidebarCollapsed]);
  
  // Synchronized hamburger handlers - when one collapses, the other expands
  const handleLeftHamburgerClick = () => {
    if (sidebarCollapsed) {
      // Left hamburger is expanding - collapse right hamburger
      setSidebarCollapsed(false);
      setOpenNexusSidebarCollapsed(true);
    } else {
      // Left hamburger is collapsing - expand right hamburger
      setSidebarCollapsed(true);
      setOpenNexusSidebarCollapsed(false);
    }
  };

  const handleRightHamburgerClick = () => {
    if (openNexusSidebarCollapsed) {
      // Right hamburger is expanding - collapse left hamburger
      setOpenNexusSidebarCollapsed(false);
      setSidebarCollapsed(true);
    } else {
      // Right hamburger is collapsing - expand left hamburger
      setOpenNexusSidebarCollapsed(true);
      setSidebarCollapsed(false);
    }
  };

  // OpenNexus3DStudio avatar panel menu cycling
  const openNexusMenus = ['appearance', 'save', 'mint', 'load', 'tools'];
  const [currentMenuIndex, setCurrentMenuIndex] = useState(0); // Default to appearance (index 0)
  
  const handleOpenNexusNavigation = (direction) => {
    if (direction === 'next') {
      const nextIndex = (currentMenuIndex + 1) % openNexusMenus.length;
      setCurrentMenuIndex(nextIndex);
      setCurrentPanel(openNexusMenus[nextIndex]);
    } else if (direction === 'back') {
      const prevIndex = currentMenuIndex === 0 ? openNexusMenus.length - 1 : currentMenuIndex - 1;
      setCurrentMenuIndex(prevIndex);
      setCurrentPanel(openNexusMenus[prevIndex]);
    }
  };
  
  // Track render mode states
  const [renderModeStates, setRenderModeStates] = useState({
    solid: true, // Start with solid mode active
    rendered: false,
    wireframe: false,
    skeleton: false,
    partColorize: false,
    depth: false,
    normal: false,
    uv: false
  });
  
  const { 
    isInitialized,
    currentModel,
    renderMode,
    rendererType,
    isLoading: sceneLoading,
    loadModel,
    loadWorldFromManifestUrl,
    loadWorldEnvironment,
    clearWorld,
    updateRenderMode,
    clearModel,
    exportModel,
    startRenderLoop,
    getSceneData,
    sceneManager,
    characterManager,
    expressionVrmRevision,
  } = useScene();

  const isViewportReady = Boolean(
    isInitialized && sceneManager?.renderer?.domElement && sceneManager?.scene,
  );
  
  const {
    isConnected,
    tasks,
    isLoading: taskLoading,
    checkConnection,
    forceConnectionCheck,
    setApiEndpoint: setTaskApiEndpoint,
    createAndStartTask,
    removeTask,
    clearCompletedTasks,
    adoptJobHandoff,
  } = useTask();

  // XR iframe → adopt DGX job into Task Manager (no URL navigation)
  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type !== 'opennexus.xrHandoff') return;
      const payload = event.data.payload || {};
      const jobId = String(payload.job_id || '').trim();
      if (!jobId) return;
      (async () => {
        try {
          if (!isConnected) {
            const ok = await forceConnectionCheck();
            if (!ok) return;
          }
          await adoptJobHandoff(jobId, {
            autoLoad: true,
            prompt: payload.query || null,
            source: 'galaxy-xr',
          });
          setSidebarCollapsed(false);
        } catch (error) {
          console.warn('App: XR iframe handoff failed:', error?.message || error);
        }
      })();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isConnected, adoptJobHandoff, forceConnectionCheck]);

  // xr-ai / companion → world nav goals (label/point from zero-shot vision)
  useEffect(() => {
    const onWorldNav = (event) => {
      const data = event.data;
      if (data?.type !== 'opennexus3d.worldNav') return;
      if (data.action === 'set-goal' && data.payload) {
        import('./library/worldNavContract.js').then(({ saveNavGoal }) => {
          saveNavGoal(data.payload);
          window.dispatchEvent(new CustomEvent('opennexus3d:zeroShotNav', { detail: data.payload }));
        });
      }
    };
    window.addEventListener('message', onWorldNav);
    return () => window.removeEventListener('message', onWorldNav);
  }, []);

  // Check if running in Electron
  useEffect(() => {
    setIsElectron(!!window.electronAPI);
  }, []);

  // Galaxy XR voice → adopt DGX job by URL (?jobId=…&autoLoad=1&tasks=1)
  useEffect(() => {
    const handoff = parseJobHandoffFromLocation();
    if (!handoff?.jobId) return undefined;
    if (handoff.openTasks) {
      setSidebarCollapsed(false);
    }
    let cancelled = false;
    (async () => {
      if (!isConnected) {
        const ok = await forceConnectionCheck();
        if (!ok || cancelled) return;
      }
      try {
        await adoptJobHandoff(handoff.jobId, {
          autoLoad: handoff.autoLoad,
          prompt: handoff.prompt,
          source: 'galaxy-xr',
        });
        console.log('App: adopted XR handoff job', handoff.jobId);
      } catch (error) {
        console.warn('App: XR job handoff failed:', error?.message || error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, adoptJobHandoff, forceConnectionCheck]);

  // Studio canvas → viewport (?loadMesh=<download-url>)
  const studioLoadMeshConsumedRef = useRef(false);
  useEffect(() => {
    if (!isViewportReady || studioLoadMeshConsumedRef.current) return undefined;
    const raw = parseLoadMeshFromLocation();
    if (!raw) return undefined;
    studioLoadMeshConsumedRef.current = true;
    const resolved = resolveTaskModelUrl(raw, apiEndpoint) || raw;
    clearLoadMeshFromLocation();
    console.log('App: Studio loadMesh handoff', resolved);
    window.dispatchEvent(
      new CustomEvent('loadModelFromUrl', {
        detail: { url: resolved, source: 'studio-loadMesh' },
      }),
    );
    return undefined;
  }, [isViewportReady, apiEndpoint]);

  const pendingGeneratedModelRef = useRef(null);

  // Auto-load completed task meshes into the main viewport (when scene is ready)
  useEffect(() => {
    const loadGeneratedWorld = async (taskResult, source = 'taskCompleted') => {
      const {
        getWorldManifestUrlFromTaskResult,
        isFullWorldPackageTaskResult,
        isSplatEnvironmentTaskResult,
      } = await import('./library/worldPackage.js');
      const manifestUrl = getWorldManifestUrlFromTaskResult(taskResult);
      if (manifestUrl) {
        const resolvedManifest = resolveTaskModelUrl(manifestUrl, apiEndpoint);
        const worldBaseUrl = taskResult?.world_base_url || taskResult?.result?.world_base_url;
        console.log(`App: Loading world package (${source}):`, resolvedManifest);
        await loadWorldFromManifestUrl(resolvedManifest, {
          apiEndpoint,
          worldBaseUrl: worldBaseUrl ? resolveTaskModelUrl(worldBaseUrl, apiEndpoint) : undefined,
        });
        return true;
      }

      const splatUrl = getTaskResultModelUrl(taskResult);
      if (splatUrl && isSplatEnvironmentTaskResult(taskResult)) {
        const ext = getTaskResultFileExtension(taskResult);
        const resolved = resolveTaskModelUrl(splatUrl, apiEndpoint);
        attachSplatPreviewMetadata(resolved);
        console.log(`App: Loading world environment splat (${source}):`, resolved);
        await loadWorldEnvironment(resolved, {
          fromAigc: true,
          fileExtension: ext || undefined,
          worldName:
            taskResult?.prompt?.slice?.(0, 48) ||
            taskResult?.name ||
            `Splat ${String(taskResult?.job_id || '').slice(0, 8)}`,
        });
        return true;
      }

      if (isFullWorldPackageTaskResult(taskResult)) {
        console.warn(`App: World task has no manifest URL (${source})`, taskResult);
        return false;
      }
      return false;
    };

    const loadGeneratedModel = async (rawUrl, source = 'task', taskResult = null, task = null) => {
      const resolved = resolveTaskModelUrl(rawUrl, apiEndpoint);
      if (!resolved) return;

      const jobId =
        taskResult?.job_id ||
        taskResult?.jobId ||
        task?.job_id ||
        (typeof task?.id === 'string' && task.id.startsWith('job_') ? task.id.slice(4) : null);

      const emitViewportFailed = (error) => {
        window.dispatchEvent(
          new CustomEvent('viewportLoadFailed', {
            detail: {
              jobId,
              error: error?.message || String(error),
            },
          }),
        );
      };

      window.dispatchEvent(
        new CustomEvent('viewportLoadStart', {
          detail: { jobId, source },
        }),
      );

      const autoRigMeta = getAutoRigMetaFromResult(taskResult);
      const fileExtension = getTaskResultFileExtension(taskResult, { preferMesh: true });
      const fbxRaw = getTaskResultFbxUrl(taskResult, autoRigMeta.job_id);
      const attachRigFbxUrl = fbxRaw ? resolveTaskModelUrl(fbxRaw, apiEndpoint) : null;
      const isAvatarFromImage = task?.type === 'avatar-from-image';
      const isTemplateRig =
        isAvatarFromImage ||
        autoRigMeta.rig_info?.rig_mode === 'template' ||
        autoRigMeta.rig_info?.rig_mode === 'template_wrap' ||
        autoRigMeta.rig_info?.rig_type === 'humanoid_template' ||
        autoRigMeta.rig_info?.generation_method === 'humanoid_vrm_template' ||
        taskResult?.inputs?.rig_mode === 'template' ||
        taskResult?.inputs?.rig_mode === 'template_wrap' ||
        taskResult?.humanoid_template_id != null ||
        taskResult?.inputs?.humanoid_template_id != null ||
        taskResult?.result?.generation_info?.rig_mode === 'template' ||
        taskResult?.result?.generation_info?.rig_mode === 'template_wrap';
      const isCreatureTemplateRig =
        autoRigMeta.rig_info?.rig_mode === 'creature_template' ||
        autoRigMeta.rig_info?.rig_type === 'creature_template' ||
        autoRigMeta.rig_info?.generation_method === 'mesh2motion_creature_template' ||
        taskResult?.inputs?.rig_mode === 'creature_template' ||
        taskResult?.creature_template_id != null ||
        taskResult?.inputs?.creature_template_id != null ||
        taskResult?.result?.generation_info?.rig_mode === 'creature_template';
      const isAppearanceComponentRig =
        autoRigMeta.rig_info?.rig_mode === 'appearance_component' ||
        autoRigMeta.rig_info?.rig_type === 'appearance_component' ||
        autoRigMeta.rig_info?.generation_method === 'appearance_component_vrm_fit' ||
        taskResult?.inputs?.rig_mode === 'appearance_component' ||
        taskResult?.result?.generation_info?.rig_mode === 'appearance_component';
      const appearanceSlot =
        autoRigMeta.rig_info?.equip_slot ||
        autoRigMeta.rig_info?.appearance_slot ||
        taskResult?.inputs?.appearance_slot ||
        taskResult?.result?.rig_info?.appearance_slot ||
        inferAppearanceSlot({
          objectName: task?.options?.object_name || task?.name || taskResult?.inputs?.object_name,
        }) ||
        'Waist';
      const isAutoRig =
        taskResult?.feature === 'auto_rig' ||
        taskResult?.result?.rig_info != null ||
        autoRigMeta.bone_count > 0 ||
        isTemplateRig ||
        isCreatureTemplateRig ||
        isAppearanceComponentRig;
      const preserveExportedOrientation =
        isAvatarFromImage ||
        isTemplateRig ||
        isCreatureTemplateRig ||
        isAppearanceComponentRig ||
        isAutoRig;
      const shouldExportVrm = task?.options?.export_vrm_after === true;
      const resolvedFileExtension =
        fileExtension ||
        (isTemplateRig || isAppearanceComponentRig ? 'vrm' : undefined);
      const quadTopology = isQuadRetopoTaskResult(taskResult, task);

      const runLoad = async () => {
        console.log(`App: Loading model (${source}):`, resolved);
        const model = await loadModel(resolved, {
          fromAigc: true,
          viewportManaged: true,
          avatarFromImage: isAvatarFromImage,
          taskType: task?.type,
          quadTopology,
          ensureForwardFacing: false,
          orientationMode: 'none',
          autoScale: false,
          autoCenter: false,
          layer: 'player',
          fileExtension: resolvedFileExtension,
          autoRigMeta: isAutoRig ? autoRigMeta : null,
          attachRigFbxUrl: isAutoRig ? attachRigFbxUrl : null,
          templateRig: isTemplateRig || isCreatureTemplateRig || isAppearanceComponentRig,
          preserveExportedOrientation,
        });

        window.dispatchEvent(
          new CustomEvent('viewportLoadComplete', {
            detail: { jobId, source },
          }),
        );

        if (isAppearanceComponentRig && characterManager && resolved) {
          try {
            const equip = await equipAppearanceComponentTrait(
              characterManager,
              resolved,
              appearanceSlot,
            );
            if (equip.equipped) {
              console.log(`App: Equipped appearance component into ${equip.slot}`);
              window.dispatchEvent(
                new CustomEvent('appearanceComponentEquipped', {
                  detail: { jobId, slot: equip.slot, url: resolved },
                }),
              );
            } else {
              console.warn('App: Appearance equip skipped:', equip.error);
            }
          } catch (equipErr) {
            console.warn('App: Appearance component equip failed:', equipErr);
          }
        }

        if (shouldExportVrm && model) {
          try {
            const baseName =
              task?.prompt?.slice(0, 40).replace(/[^\w-]+/g, '_') || 'avatar_pipeline';
            await exportAvatarPipelineVrm({
              model,
              apiEndpoint,
              filename: baseName,
              humanoidTemplateId:
                taskResult?.humanoid_template_id ||
                autoRigMeta.rig_info?.humanoid_template_id ||
                'template',
              autoRigMeta,
            });
            console.log('App: VRM download triggered after avatar pipeline');
          } catch (exportErr) {
            console.warn('App: Post-pipeline VRM export failed:', exportErr);
          }
        }
      };

      if (!isViewportReady) {
        pendingGeneratedModelRef.current = { rawUrl, taskResult, task, source };
        console.log('App: Scene not ready; queued model load after init');
        return;
      }
      pendingGeneratedModelRef.current = null;
      runLoad().catch((error) => {
        console.error('App: Failed to load generated model:', error);
        emitViewportFailed(error);
      });
    };

    const playTextToMotionFromTask = async (loadPayload, task, source) => {
      const { playTextToMotionOnViewport } = await import('./library/playViewportMotion.js');
      const jobId =
        loadPayload?.job_id ||
        loadPayload?.jobId ||
        task?.job_id ||
        (typeof task?.id === 'string' && task.id.startsWith('job_') ? task.id.slice(4) : null);
      window.dispatchEvent(
        new CustomEvent('viewportLoadStart', {
          detail: { jobId, source, motion: true },
        }),
      );
      try {
        console.log(`App: Playing text-to-motion (${source}):`, jobId);
        await playTextToMotionOnViewport({
          sceneManager,
          characterManager,
          taskResult: loadPayload,
          apiEndpoint,
          displayName:
            task?.prompt ||
            loadPayload?.text_prompt ||
            loadPayload?.result?.text_prompt ||
            'Kimodo',
        });
        window.dispatchEvent(
          new CustomEvent('viewportLoadComplete', {
            detail: { jobId, source, motion: true },
          }),
        );
        return true;
      } catch (error) {
        console.error('App: Failed to play text-to-motion:', error);
        window.dispatchEvent(
          new CustomEvent('viewportLoadFailed', {
            detail: {
              jobId,
              error: error?.message || String(error),
            },
          }),
        );
        return false;
      }
    };

    const handleTaskCompleted = async (event) => {
      const { result, task, taskId } = event.detail || {};
      const loadPayload =
        normalizeTaskLoadPayload(task) ||
        enrichCompletedJobPayload(
          result,
          result?.job_id || task?.job_id,
          task?.type || result?.pipeline || null,
        ) ||
        result;
      console.log('App: taskCompleted load', {
        taskId,
        taskType: task?.type,
        feature: loadPayload?.feature,
        manifest: loadPayload?.world_manifest_url,
        modelUrl: getTaskResultMeshUrl(loadPayload),
      });
      const { isWorldLayerTaskResult } = await import('./library/worldPackage.js');
      if (isWorldLayerTaskResult(loadPayload)) {
        try {
          const loaded = await loadGeneratedWorld(loadPayload, 'taskCompleted');
          if (loaded) return;
        } catch (error) {
          console.error('App: Failed to load generated world:', error);
        }
        if (loadPayload?.feature === 'image_to_world' || loadPayload?.feature === 'environment_scan' || loadPayload?.pipelineStage === 'world_package') {
          return;
        }
      }
      if (isTextToMotionTaskResult(loadPayload) || task?.type === 'text-to-motion') {
        await playTextToMotionFromTask(loadPayload, task, 'taskCompleted');
        return;
      }
      if (isTextToImageTaskResult(loadPayload) || task?.type === 'text-to-image') {
        return;
      }
      const rawUrl = getTaskResultMeshUrl(loadPayload);
      if (rawUrl) await loadGeneratedModel(rawUrl, 'taskCompleted', loadPayload, task);
    };

    const handleLoadModelFromUrl = async (event) => {
      const task = event.detail?.task || null;
      const loadPayload =
        normalizeTaskLoadPayload(task) ||
        normalizeTaskLoadPayload({
          result: event.detail?.result,
          job_id: event.detail?.result?.job_id,
          type: task?.type,
        }) ||
        event.detail?.result;
      const { isFullWorldPackageTaskResult, isSplatEnvironmentTaskResult } = await import(
        './library/worldPackage.js',
      );
      const isWorld =
        isFullWorldPackageTaskResult(loadPayload) || isSplatEnvironmentTaskResult(loadPayload);
      console.log('App: loadModelFromUrl event', {
        taskId: event.detail?.taskId,
        feature: loadPayload?.feature,
        isWorld,
        modelUrl: getTaskResultMeshUrl(loadPayload),
      });
      if (isWorld) {
        try {
          const loaded = await loadGeneratedWorld(loadPayload, 'loadModelFromUrl');
          if (loaded) return;
        } catch (error) {
          console.error('App: Failed to load world from URL event:', error);
        }
        if (isFullWorldPackageTaskResult(loadPayload)) {
          return;
        }
      }
      if (isTextToMotionTaskResult(loadPayload) || task?.type === 'text-to-motion') {
        await playTextToMotionFromTask(loadPayload, task, 'loadModelFromUrl');
        return;
      }
      if (isTextToImageTaskResult(loadPayload) || task?.type === 'text-to-image') {
        return;
      }
      const rawUrl =
        event.detail?.url || getTaskResultMeshUrl(loadPayload) || getTaskResultModelUrl(loadPayload);
      if (rawUrl) {
        await loadGeneratedModel(rawUrl, 'loadModelFromUrl', loadPayload, task);
      } else {
        console.warn('App: loadModelFromUrl — no model URL in payload', loadPayload);
        window.dispatchEvent(
          new CustomEvent('viewportLoadFailed', {
            detail: {
              jobId: event.detail?.taskId,
              error: 'No model URL in task result',
            },
          }),
        );
      }
    };

    const handleAttachHeadSplat = async (event) => {
      const url = event?.detail?.url;
      if (!url || !sceneManager) return;
      try {
        const { attachHeadSplatToBody } = await import('./library/sparkSplatManager.js');
        const absolute = resolveTaskModelUrl(url, apiEndpoint) || url;
        await attachHeadSplatToBody(sceneManager, absolute, {
          orientationMode: 'none',
          hideMeshHead: true,
        });
        console.log('App: attached Arc2Avatar head splat to Head bone', absolute);
      } catch (error) {
        console.warn('App: attachHeadSplatFromUrl failed:', error?.message || error);
      }
    };

    window.addEventListener('taskCompleted', handleTaskCompleted);
    window.addEventListener('loadModelFromUrl', handleLoadModelFromUrl);
    window.addEventListener('attachHeadSplatFromUrl', handleAttachHeadSplat);

    return () => {
      window.removeEventListener('taskCompleted', handleTaskCompleted);
      window.removeEventListener('loadModelFromUrl', handleLoadModelFromUrl);
      window.removeEventListener('attachHeadSplatFromUrl', handleAttachHeadSplat);
    };
  }, [
    loadModel,
    loadWorldFromManifestUrl,
    loadWorldEnvironment,
    apiEndpoint,
    isViewportReady,
    sceneManager,
    characterManager,
  ]);

  useEffect(() => {
    const flushPending = () => {
      if (!isViewportReady || !pendingGeneratedModelRef.current) return;
      const pending = pendingGeneratedModelRef.current;
      pendingGeneratedModelRef.current = null;
      console.log('App: Scene ready; loading queued model:', pending.rawUrl);
      window.dispatchEvent(
        new CustomEvent('loadModelFromUrl', {
          detail: {
            url: pending.rawUrl,
            result: pending.taskResult,
            task: pending.task,
            taskId: pending.task?.id,
            source: pending.source || 'pendingQueue',
          },
        }),
      );
    };

    flushPending();
    window.addEventListener('sceneViewportReady', flushPending);
    return () => window.removeEventListener('sceneViewportReady', flushPending);
  }, [isViewportReady]);

  // Adjuster Target → Object/Bone syncs header Render mode + bone panel visibility.
  useEffect(() => {
    if (!sceneManager) return undefined;
    const onAdjusterUiRenderMode = (payload) => {
      const mode = payload?.mode;
      if (mode === 'skeleton') {
        setSkeletonActive(true);
        updateRenderMode('skeleton');
        setRenderModeStates((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => {
            next[key] = key === 'skeleton';
          });
          return next;
        });
        if (window.blendShapeControls) {
          window.blendShapeControls.setBlendShapesVisible?.(false);
          window.blendShapeControls.setBonePanelVisible?.(true);
          setTimeout(() => {
            const bonePanel = document.querySelector('.bone-structure-panel');
            bonePanel?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
              inline: 'nearest',
            });
          }, 50);
        }
        return;
      }
      if (mode === 'solid') {
        setSkeletonActive(false);
        updateRenderMode('solid');
        setRenderModeStates((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => {
            next[key] = key === 'solid';
          });
          return next;
        });
        if (window.blendShapeControls) {
          // Leaving skeleton: hide bone panel; do not force-open blend shapes.
          window.blendShapeControls.setBonePanelVisible?.(false);
        }
      }
    };
    sceneManager.on('adjusterUiRenderMode', onAdjusterUiRenderMode);
    return () => sceneManager.off('adjusterUiRenderMode', onAdjusterUiRenderMode);
  }, [sceneManager, updateRenderMode]);

  const handleSkeletonToggle = useCallback((options = {}) => {
    const { expandSidebarIfCollapsed = false } = options;

    const applyToggle = () => {
      const newSkeletonActive = !skeletonActive;
      setSkeletonActive(newSkeletonActive);

      if (newSkeletonActive) {
        updateRenderMode('skeleton');
        setRenderModeStates((prev) => {
          const newStates = { ...prev };
          Object.keys(newStates).forEach((key) => {
            newStates[key] = key === 'skeleton';
          });
          return newStates;
        });
        if (window.blendShapeControls) {
          window.blendShapeControls.setBlendShapesVisible(false);
          window.blendShapeControls.setBonePanelVisible(true);
          setTimeout(() => {
            document.querySelector('.bone-structure-panel')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
              inline: 'nearest',
            });
          }, 100);
        }
        return;
      }

      updateRenderMode('solid');
      setRenderModeStates((prev) => {
        const newStates = { ...prev };
        Object.keys(newStates).forEach((key) => {
          newStates[key] = key === 'solid';
        });
        return newStates;
      });
      if (window.blendShapeControls) {
        window.blendShapeControls.setBlendShapesVisible(true);
        window.blendShapeControls.setBonePanelVisible(false);
        setTimeout(() => {
          document.querySelector('.blend-shape-controller')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest',
          });
        }, 100);
      }
    };

    if (expandSidebarIfCollapsed && sidebarCollapsed) {
      setSidebarCollapsed(false);
      setTimeout(applyToggle, 150);
      return;
    }
    applyToggle();
  }, [skeletonActive, sidebarCollapsed, updateRenderMode]);

  const scrollXrVoicePanelIntoView = useCallback(() => {
    const sidebar = sidebarScrollRef.current;
    const host = xrAiPanelRef.current;
    if (!sidebar || !host) return false;
    const header = host.querySelector('.xr-ai-panel-header');
    if (!(header instanceof HTMLElement)) return false;
    syncSidebarScrollToElement(sidebar, header);
    const sideRect = sidebar.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    return Math.abs(headerRect.top - sideRect.top) <= 2;
  }, []);

  const openXrVoiceFromCollapsedRail = useCallback(() => {
    requestXrVoiceExpand();
    pendingXrPanelOpenRef.current = true;
    setSidebarCollapsed(false);
  }, []);

  useLayoutEffect(() => {
    if (sidebarCollapsed || !pendingXrPanelOpenRef.current) return undefined;
    pendingXrPanelOpenRef.current = false;

    window.dispatchEvent(new CustomEvent(OPEN_XR_AI_PANEL_EVENT));

    const retries = [0, 48, 120, 240, 400];
    retries.forEach((delayMs) => {
      window.setTimeout(() => {
        scrollXrVoicePanelIntoView();
      }, delayMs);
    });

    return undefined;
  }, [sidebarCollapsed, scrollXrVoicePanelIntoView]);

  // Handle render mode changes with state tracking
  const handleRenderModeChange = useCallback((mode) => {
    console.log('Render mode change requested:', mode);
    if (mode !== 'skeleton') {
      setSkeletonActive(false);
    }

    // Update render mode states - toggle the selected mode
    setRenderModeStates(prev => {
      const newStates = { ...prev };
      
      // If clicking the same mode, toggle it off
      if (prev[mode]) {
        newStates[mode] = false;
        // If toggling off, switch to solid mode
        updateRenderMode('solid');
        newStates.solid = true;
      } else {
        // Turn off all other modes and turn on the selected one
        Object.keys(newStates).forEach(key => {
          newStates[key] = key === mode;
        });
        updateRenderMode(mode);
      }
      
      return newStates;
    });
  }, [updateRenderMode]);

  // Sync API endpoint with TaskContext and re-check health (3DAIGC-API /health or /api/v1/system/health)
  useEffect(() => {
    setTaskApiEndpoint(apiEndpoint);
    void forceConnectionCheck();
  }, [apiEndpoint, setTaskApiEndpoint, forceConnectionCheck]);

  // Check API connection (non-blocking: never throw so page always works)
  useEffect(() => {
    const checkApiConnection = async () => {
      try {
        await checkConnection();
      } catch (err) {
        console.warn('App: API check failed (non-blocking):', err?.message || err);
      }
    };

    checkApiConnection();
    const interval = setInterval(checkApiConnection, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [checkConnection]);

  // Handle file loading
  const handleFileLoad = useCallback(async (file) => {
    try {
      if (file?.name?.toLowerCase?.().endsWith('.vrm')) {
        const { rememberSpacetimeWalkerVrm } = await import('./library/spacetimeXrWalker.js');
        rememberSpacetimeWalkerVrm(file);
      }
      await loadModel(file);
      if (typeof file?.path === 'string' && file.path.length > 0 && window.electronAPI?.rememberImportDirectory) {
        const i = Math.max(file.path.lastIndexOf('/'), file.path.lastIndexOf('\\'));
        if (i > 0) {
          await window.electronAPI.rememberImportDirectory(file.path.slice(0, i));
        }
      }
    } catch (error) {
      console.error('Error loading file:', error);
      
      // Show user-friendly error message
      if (error.message.includes('Unsupported file format')) {
        alert(`❌ ${error.message}\n\nPlease try uploading a supported 3D model file (.glb, .gltf, .obj, .fbx, or avatar)`);
      } else {
        alert(`❌ Failed to load file: ${error.message}`);
      }
    }
  }, [loadModel]);

  const beginAiTaskOrBrowseCatalog = useCallback(
    (taskType) => {
      if (isConnected) return true;
      if (canBrowseAiTaskCatalog()) {
        dispatchOpenTaskCatalog(taskType);
        setSidebarCollapsed(false);
        return false;
      }
      alert(AI_BACKEND_UNAVAILABLE_MSG);
      return false;
    },
    [isConnected],
  );

  // Handle AI generation tasks
  const handleAITask = useCallback(async (taskType, prompt, imageFile = null, options = {}) => {
    console.log('App: handleAITask called with:', { taskType, prompt, imageFile, options });
    
    // Check if task requires a model
    const requiresModel = [
      'mesh-segmentation',
      'auto-rigging',
      'mesh-painting',
      'mesh-painting-text',
      'mesh-retopology',
      'mesh-uv-unwrapping',
      'mesh-editing-text',
      'mesh-editing-image'
    ].includes(taskType);
    let modelData = null;
    
    // Export current model to GLB if needed (or use sourceMeshFile from Rig panel one-click).
    if (requiresModel) {
      if (options?.sourceMeshFile instanceof Blob) {
        modelData = options.sourceMeshFile;
      } else if (currentModel && sceneManager) {
        try {
          console.log('App: Exporting current model to GLB for', taskType);
          // Use getGLBBlobData from download-utils
          const { getGLBBlobData } = await import('./library/download-utils.js');
          modelData = await getGLBBlobData(currentModel, { forApiUpload: true });
          console.log('App: Model exported successfully, size:', modelData.size, 'bytes');
        } catch (error) {
          console.error('App: Failed to export model:', error);
          alert(`Failed to export model for ${taskType}: ${error.message}`);
          return;
        }
      } else if (taskType === 'auto-rigging') {
        alert('⚠️ Load a 3D model in the viewport first, or use Start Auto Rigging on a completed mesh task.');
        return;
      }
    }
    
    try {
      let objectName = normalizeObjectName(options?.object_name);
      if (!objectName) {
        const hint = imageFile ? (objectNameFromFilename(imageFile.name) || '') : '';
        objectName = promptForObjectName(hint);
        if (!objectName) {
          alert('⚠️ Enter a name for this 3D object before starting.');
          return;
        }
      }
      const { sourceMeshFile: _dropSourceMesh, ...optionsWithoutMesh } = options || {};
      const resolvedOptions = { ...optionsWithoutMesh, object_name: objectName };

      const result = await createAndStartTask({
        type: taskType,
        prompt,
        imageFile,
        options: resolvedOptions
      }, modelData);
      console.log('App: createAndStartTask result:', result);
    } catch (error) {
      console.error(`Error in ${taskType}:`, error);
      alert(`Error in ${taskType}: ${error.message}`);
    }
  }, [createAndStartTask, currentModel, sceneManager]);

  // Handle menu events from Electron
  useEffect(() => {
    if (isElectron && window.electronAPI) {
      const handleNewProject = () => {
        clearModel();
      };

      const handleOpen = async () => {
        const result = await window.electronAPI.openFileDialog();
        if (!result.canceled && result.filePaths.length > 0) {
          const fp = result.filePaths[0];
          try {
            await loadModel(filePathToFileUrl(fp));
          } catch (err) {
            console.error('Menu Open: failed to load', fp, err);
            alert(`Failed to open file: ${err?.message || err}`);
          }
        }
      };

      const handleSave = () => {
        // Handle save logic here
        console.log('Saving project');
      };

      window.electronAPI.onMenuNewProject(handleNewProject);
      window.electronAPI.onMenuOpen(handleOpen);
      window.electronAPI.onMenuSave(handleSave);

      return () => {
        window.electronAPI.removeAllListeners('menu-new-project');
        window.electronAPI.removeAllListeners('menu-open');
        window.electronAPI.removeAllListeners('menu-save');
      };
    }
  }, [isElectron, clearModel, loadModel]);

  // Note: Sky background is loaded in SceneManager.setupHDREnvironment() before the first frame.

  // Check if there are any running tasks
  const hasRunningTasks = tasks.some(
    (task) => task.status === 'running' || task.status === 'pending',
  );

  useLayoutEffect(() => {
    const syncProgressHeight = () => {
      const progressHeight = document.querySelector('.task-progress-bar')?.offsetHeight ?? 0;
      document.documentElement.style.setProperty('--task-progress-height', `${progressHeight}px`);

      const appContentTop = appContentRef.current?.getBoundingClientRect().top ?? 0;
      if (appContentTop > 0) {
        document.documentElement.style.setProperty('--app-content-top', `${Math.round(appContentTop)}px`);
      }
    };

    syncProgressHeight();
    requestAnimationFrame(syncProgressHeight);

    const bar = document.querySelector('.task-progress-bar');
    if (!bar) return undefined;

    const observer = new ResizeObserver(syncProgressHeight);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [hasRunningTasks, tasks.length]);

  return (
    <div className="app">
      <header ref={headerRef} className="app-header">
        {/* Title bar — horizontal inline row on top */}
        <div className="title-bar">
          <h1 className="main-title">OpenNexus3DStudio:</h1>
          <span className="audiowave-text">
            <span className="space-time-row">SPACE-TIME</span>
            <span className="edition-row">EDITION</span>
          </span>
          <div className="title-api-control">
            <div
              className="api-status-compact"
              onClick={forceConnectionCheck}
              title={isConnected ? 'API Connected' : 'Click to reconnect'}
            >
              <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
              <span className="status-text">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          <a className="title-xr-lab-link" href="/studio" title="Node / Kanban studio (Krea → TRELLIS.2)">
            Studio
          </a>
          <a className="title-xr-lab-link" href="/xr" title="IWSDK immersive mode (WebXR lab)">
            XR Lab
          </a>
          <a
            className="title-xr-lab-link"
            href="/companion"
            title="Talk to your avatar companion (WebXR)"
            onClick={() => {
              try {
                storeCompanionHandoff(captureCompanionHandoffFromScene(sceneManager));
              } catch (error) {
                console.warn('App: companion avatar capture failed:', error?.message || error);
              }
            }}
          >
            Companion
          </a>
        </div>

        {/* Header controls — scrollable row below title */}
        <div
          ref={headerScrollRef}
          className="header-controls-scroll"
          {...headerScrollHandlers}
        >
        <div className="header-controls">
          {/* Audio Controls */}
          <div className="header-section audio-section">
            <div className="header-section-title">Audio</div>
            <div className="header-controls-group">
              <GlobalAudioControl />
            </div>
          </div>

          {/* File Operations */}
          <div className="header-section two-button-section">
            <div className="header-section-title">File</div>
            <div className="header-controls-group">
              <button 
                className="header-btn"
                onClick={() => {
                  console.log('App: Import button clicked');
                  console.log('App: combinedImportRef.current:', combinedImportRef.current);
                  if (combinedImportRef.current) {
                    try {
                      combinedImportRef.current.openFileDialog();
                      console.log('App: File dialog opened via ref');
                    } catch (error) {
                      console.error('App: Error opening file dialog:', error);
                      // Fallback to direct DOM query if ref fails
                      const dropzoneInput = document.querySelector('.combined-import input[type="file"]');
                      if (dropzoneInput) {
                        dropzoneInput.click();
                        console.log('App: File dialog opened via fallback');
                      } else {
                        console.warn('App: Could not find file input to trigger');
                      }
                    }
                  } else {
                    console.warn('App: combinedImportRef.current is null, using fallback');
                    // Fallback to direct DOM query if ref not available
                    const dropzoneInput = document.querySelector('.combined-import input[type="file"]');
                    if (dropzoneInput) {
                      dropzoneInput.click();
                    } else {
                      console.warn('App: Could not find file input to trigger');
                    }
                  }
                }}
                title="Import File"
              >
                📁 Import
              </button>
              <button 
                className="header-btn"
                onClick={() => {
                  if (currentModel) {
                    exportModel('glb', { filename: 'export.glb' });
                  } else {
                    alert('No model to export');
                  }
                }}
                title="Export GLB"
              >
                📤 Export
              </button>
            </div>
          </div>

          {/* AI Tasks */}
          <div className="header-section two-button-section">
            <div className="header-section-title">AI</div>
            <div className="header-controls-group">
              <button 
                className="header-btn"
                onClick={() => {
                  if (!beginAiTaskOrBrowseCatalog('text-to-3d')) return;
                  const objectName = promptForObjectName('');
                  if (!objectName) return;
                  const userPrompt = window.prompt('Enter text-to-3D prompt:');
                  if (userPrompt) {
                    handleAITask('text-to-3d', userPrompt, null, { object_name: objectName });
                  }
                }}
                disabled={!isConnected && !canBrowseAiTaskCatalog()}
                title={isConnected ? 'Text to 3D' : 'Browse Text-to-3D models'}
              >
                ✨ Text-3D
              </button>
              <button 
                className="header-btn"
                onClick={() => {
                  if (!beginAiTaskOrBrowseCatalog('image-to-3d')) return;
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const objectName =
                        promptForObjectName(objectNameFromFilename(file.name) || 'Image mesh');
                      if (!objectName) return;
                      handleAITask('image-to-3d', 'Convert image to 3D', file, {
                        object_name: objectName,
                        model_preference: getDefaultModelForFeature('image-to-3d'),
                      });
                    }
                  };
                  input.click();
                }}
                disabled={!isConnected && !canBrowseAiTaskCatalog()}
                title={isConnected ? 'Image to 3D' : 'Browse Image-to-3D models'}
              >
                🖼️ Image-3D
              </button>
            </div>
          </div>

          {/* Render modes + diagnostic shading (header) */}
          <div className="header-section four-button-section">
            <div className="header-section-title">Render</div>
            <div className="header-controls-group">
              <button 
                className={`header-btn ${renderModeStates.solid ? 'active' : ''}`}
                onClick={() => handleRenderModeChange('solid')}
                title="Solid Mode"
              >
                🔲 Solid
              </button>
              <button 
                className={`header-btn ${renderModeStates.wireframe ? 'active' : ''}`}
                onClick={() => handleRenderModeChange('wireframe')}
                title="Wireframe Mode"
              >
                📐 Wire
              </button>
              <button 
                className={`header-btn ${renderModeStates.skeleton ? 'active' : ''}`}
                onClick={() => handleSkeletonToggle()}
                title="Skeleton Mode"
              >
                🦴 Skeleton
              </button>
              <button 
                className={`header-btn ${renderModeStates.partColorize ? 'active' : ''}`}
                onClick={() => handleRenderModeChange('partColorize')}
                title="Part Colorize Mode"
              >
                🌈 Parts
              </button>
              <button
                className={`header-btn ${renderModeStates.depth ? 'active' : ''}`}
                onClick={() => handleRenderModeChange('depth')}
                title="Depth buffer visualization"
              >
                Depth
              </button>
              <button
                className={`header-btn ${renderModeStates.normal ? 'active' : ''}`}
                onClick={() => handleRenderModeChange('normal')}
                title="View-space normals"
              >
                Normal
              </button>
              <button
                className={`header-btn ${renderModeStates.uv ? 'active' : ''}`}
                onClick={() => handleRenderModeChange('uv')}
                title="UV layout debug"
              >
                UV
              </button>
            </div>
          </div>

          {/* Task Status */}
          <div className="header-section single-button-section">
            <div className="header-section-title">Tasks</div>
            <div className="header-controls-group">
              <div className="task-status-compact">
                <div className="task-count">
                  {tasks.length > 0 && (
                    <span className="task-badge">
                      {tasks.filter(t => t.status === 'running').length} running
                    </span>
                  )}
                </div>
                <button 
                  className="header-btn"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      if (e.target.files[0]) {
                        const objectName = promptForObjectName('Painted mesh');
                        if (!objectName) return;
                        handleAITask('mesh-painting', 'Paint mesh', e.target.files[0], {
                          object_name: objectName,
                        });
                      }
                    };
                    input.click();
                  }}
                  disabled={!isConnected}
                  title="Mesh Painting"
                >
                  🎨 Paint
                </button>
              </div>
            </div>
          </div>

          {/* OpenNexus3DStudio avatar panels */}
          <div className="header-section four-button-section">
            <div className="header-section-title">Studio</div>
            <div className="header-controls-group studio-controls">
              <button 
                className={`header-btn studio-btn ${currentPanel === 'appearance' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPanel('appearance');
                  setCurrentMenuIndex(0);
                  setOpenNexusSidebarCollapsed(false);
                }}
                title="Character Appearance"
              >
                👤
              </button>
              <button 
                className={`header-btn studio-btn ${currentPanel === 'save' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPanel('save');
                  setCurrentMenuIndex(1);
                  setOpenNexusSidebarCollapsed(false);
                }}
                title="Save Character"
              >
                💾
              </button>
              <button 
                className={`header-btn studio-btn ${currentPanel === 'mint' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPanel('mint');
                  setCurrentMenuIndex(2);
                  setOpenNexusSidebarCollapsed(false);
                }}
                title="Mint Character"
              >
                🪙
              </button>
              <button 
                className={`header-btn studio-btn ${currentPanel === 'load' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPanel('load');
                  setCurrentMenuIndex(3);
                  setOpenNexusSidebarCollapsed(false);
                }}
                title="Load Character"
              >
                📁
              </button>
              <button 
                className={`header-btn studio-btn ${currentPanel === 'tools' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPanel('tools');
                  setCurrentMenuIndex(4);
                  setOpenNexusSidebarCollapsed(false);
                }}
                title="3D Tools & Export"
              >
                🛠️
              </button>
            </div>
          </div>

        </div>
        </div>
      </header>

      {/* Scene Manager row — hamburgers flank toolbar for vertical alignment */}
      <div className="scene-controls-row" ref={sceneControlsRef}>
        <button
          type="button"
          className="anchored-left-hamburger scene-controls-hamburger"
          onClick={handleLeftHamburgerClick}
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <div className="hamburger-icon">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
        <div className="scene-controls-container">
          <SceneControlsCompact
            sceneManager={sceneManager}
            onRenderModeChange={handleRenderModeChange}
            onLightingChange={(lighting) => {
              console.log('💡 Lighting changed:', lighting);
            }}
            renderModeStates={renderModeStates}
            skeletonActive={skeletonActive}
            onSkeletonClick={() => handleSkeletonToggle()}
          />
        </div>
        <button
          type="button"
          className="anchored-right-hamburger scene-controls-hamburger"
          onClick={handleRightHamburgerClick}
          title={openNexusSidebarCollapsed ? 'Expand OpenNexus3DStudio' : 'Collapse OpenNexus3DStudio'}
          aria-label={
            openNexusSidebarCollapsed ? 'Expand OpenNexus3DStudio' : 'Collapse OpenNexus3DStudio'
          }
        >
          <div className="hamburger-icon">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </div>

      <TaskProgressBar tasks={tasks} />

      {/* Avatar Creator sidebar — below scene-controls (XR/tools row); title must stay readable */}
      <div className={`opennexus-sidebar ${openNexusSidebarCollapsed ? 'collapsed' : ''}`}>
        <button
          type="button"
          className="opennexus-sticky-hamburger"
          onClick={handleRightHamburgerClick}
          title={openNexusSidebarCollapsed ? 'Expand Avatar Creator' : 'Collapse Avatar Creator'}
        >
          <div className="hamburger-icon">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>

        {openNexusSidebarCollapsed && (
          <div className="collapsed-opennexus-icons">
            <button
              type="button"
              className={`opennexus-sidebar-icon ${currentPanel === 'appearance' ? 'active' : ''}`}
              onClick={() => {
                setOpenNexusSidebarCollapsed(false);
                setCurrentPanel('appearance');
                setCurrentMenuIndex(0);
              }}
              data-tooltip="Character Appearance"
              title="Character Appearance"
            >
              👤
            </button>
            <button
              type="button"
              className={`opennexus-sidebar-icon ${currentPanel === 'save' ? 'active' : ''}`}
              onClick={() => {
                setOpenNexusSidebarCollapsed(false);
                setCurrentPanel('save');
                setCurrentMenuIndex(1);
              }}
              data-tooltip="Save Character"
              title="Save Character"
            >
              💾
            </button>
            <button
              type="button"
              className={`opennexus-sidebar-icon ${currentPanel === 'mint' ? 'active' : ''}`}
              onClick={() => {
                setOpenNexusSidebarCollapsed(false);
                setCurrentPanel('mint');
                setCurrentMenuIndex(2);
              }}
              data-tooltip="Mint Character"
              title="Mint Character"
            >
              🪙
            </button>
            <button
              type="button"
              className={`opennexus-sidebar-icon ${currentPanel === 'load' ? 'active' : ''}`}
              onClick={() => {
                setOpenNexusSidebarCollapsed(false);
                setCurrentPanel('load');
                setCurrentMenuIndex(3);
              }}
              data-tooltip="Load Character"
              title="Load Character"
            >
              📁
            </button>
            <button
              type="button"
              className={`opennexus-sidebar-icon ${currentPanel === 'tools' ? 'active' : ''}`}
              onClick={() => {
                setOpenNexusSidebarCollapsed(false);
                setCurrentPanel('tools');
                setCurrentMenuIndex(4);
              }}
              data-tooltip="3D Tools & Export"
              title="3D Tools & Export"
            >
              🛠️
            </button>
          </div>
        )}

        {!openNexusSidebarCollapsed && (
          <div className="opennexus-content">
            <div className="opennexus-header">
              <h3 className="opennexus-title">Avatar Creator</h3>
            </div>
            <div className="opennexus-panels">
              {currentPanel === 'appearance' && <AppearanceSimple onNavigate={handleOpenNexusNavigation} />}
              {currentPanel === 'save' && <SaveSimple onNavigate={handleOpenNexusNavigation} />}
              {currentPanel === 'mint' && <MintSimple onNavigate={handleOpenNexusNavigation} />}
              {currentPanel === 'load' && <LoadSimple onNavigate={handleOpenNexusNavigation} />}
              {currentPanel === 'tools' && <ToolsSimple onNavigate={handleOpenNexusNavigation} />}
            </div>
          </div>
        )}
      </div>

      <div
        ref={appContentRef}
        className={`app-content ${!openNexusSidebarCollapsed ? 'has-opennexus' : ''} ${sidebarCollapsed ? 'main-sidebar-collapsed' : ''}`}
      >
        <div
          ref={sidebarScrollRef}
          className={`sidebar ${sidebarCollapsed ? 'collapsed' : 'sidebar-scroll-panel'}`}
          style={{ position: 'relative' }}
          title={sidebarCollapsed ? undefined : 'Drag to scroll panel'}
          {...(sidebarCollapsed ? {} : sidebarScrollHandlers)}
        >
          {/* Hamburger Menu Button */}
          <button 
            className="hamburger-menu"
            onClick={handleLeftHamburgerClick}
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <div className="hamburger-icon">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

            {/* Collapsed Sidebar Icons */}
            {sidebarCollapsed && (
              <div className="collapsed-sidebar-icons">
                <button
                  className="sidebar-icon"
                  type="button"
                  onClick={() => {
                    try {
                      combinedImportRef.current?.openFileDialog();
                    } catch (e) {
                      console.error('Import from collapsed sidebar:', e);
                    }
                  }}
                  data-tooltip="Import Files"
                  title="Import Files"
                >
                  📁
                </button>
                <button
                  className="sidebar-icon"
                  type="button"
                  onClick={() => {
                    if (!beginAiTaskOrBrowseCatalog('text-to-3d')) return;
                    const objectName = promptForObjectName('');
                    if (!objectName) return;
                    const userPrompt = window.prompt('Enter text-to-3D prompt:');
                    if (userPrompt) {
                      handleAITask('text-to-3d', userPrompt, null, { object_name: objectName });
                    }
                  }}
                  data-tooltip={isConnected ? 'AI Text-to-3D' : 'Browse Text-to-3D models'}
                  title={isConnected ? 'AI Text-to-3D' : 'Browse Text-to-3D models'}
                >
                  🔤
                </button>
                <button
                  className="sidebar-icon"
                  type="button"
                  onClick={() => {
                    if (!beginAiTaskOrBrowseCatalog('image-to-3d')) return;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const objectName =
                          promptForObjectName(objectNameFromFilename(file.name) || 'Image mesh');
                        if (!objectName) return;
                        handleAITask('image-to-3d', null, file, {
                          object_name: objectName,
                          model_preference: getDefaultModelForFeature('image-to-3d'),
                        });
                      }
                    };
                    input.click();
                  }}
                  data-tooltip={isConnected ? 'AI Image-to-3D' : 'Browse Image-to-3D models'}
                  title={isConnected ? 'AI Image-to-3D' : 'Browse Image-to-3D models'}
                >
                  🖼️
                </button>
                {showXrAiPanel() && (
                <button
                  className="sidebar-icon"
                  type="button"
                  onClick={openXrVoiceFromCollapsedRail}
                  data-tooltip="XR Voice (DGX)"
                  title="XR Voice (DGX)"
                >
                  🎙️
                </button>
                )}
                <button
                  className={`sidebar-icon ${skeletonActive ? 'active' : ''}`}
                  type="button"
                  onClick={() => handleSkeletonToggle({ expandSidebarIfCollapsed: true })}
                  data-tooltip="Toggle Skeleton"
                  title="Toggle Skeleton"
                >
                  🦴
                </button>
                <button
                  className="sidebar-icon"
                  type="button"
                  onClick={() => {
                    if (currentModel) {
                      exportModel('glb', { filename: 'export.glb' });
                    } else {
                      alert('No model to export');
                    }
                  }}
                  data-tooltip="Export GLB"
                  title="Export GLB"
                >
                  📤
                </button>
              </div>
            )}

          <div
            className="combined-import-mount"
            style={
              sidebarCollapsed
                ? {
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clipPath: 'inset(50%)',
                    whiteSpace: 'nowrap',
                    border: 0,
                  }
                : undefined
            }
          >
            <CombinedImport ref={combinedImportRef} onFileLoad={handleFileLoad} />
          </div>

          {!sidebarCollapsed && (
            <>
          <TaskManager 
            tasks={tasks}
            onAITask={handleAITask}
            isApiConnected={isConnected}
          />
          <WorldLibrary apiEndpoint={apiEndpoint} compact />
          {showXrAiPanel() && (
          <div ref={xrAiPanelRef}>
            <XrAiPanel isApiConnected={isConnected} sceneManager={sceneManager} />
          </div>
          )}
          <BlendShapeController 
            sceneManager={sceneManager}
            characterManager={characterManager}
            currentModel={currentModel}
            expressionVrmRevision={expressionVrmRevision}
            isVisible={true}
            onToggle={(controls) => {
              window.blendShapeControls = controls;
            }}
            isActive={skeletonActive}
          />
          <Core3DPanel />
          <CreatureAnimationPanel />
          <ErrorBoundary showDetails={false}>
            <TextureExtractor />
          </ErrorBoundary>
          <VRMExport />
          <GLBExport apiEndpoint={apiEndpoint} />
          {showApiStatusPanel() && (
          <APIStatus 
            endpoint={apiEndpoint}
            isConnected={isConnected}
            rendererType={rendererType}
            onEndpointChange={setApiEndpoint}
            onTestConnection={forceConnectionCheck}
          />
          )}
            </>
          )}
        </div>

        <div className="main-viewport">
          <Scene3D 
            model={currentModel}
            renderMode={renderMode}
          />
          <Mesh2MotionControllerOverlay sceneManager={sceneManager} model={currentModel} />
          {/* Bottom Animations Panel (overlay-anchored so it isn't clipped by the full-height scene) */}
          <div className="bottom-menu-overlay">
            <BottomDisplayMenu />
          </div>
          <NativeFaceRelayHud />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary showDetails={true}>
      <TaskProvider>
        <AudioProvider>
          <SoundProvider>
            <SceneProvider>
              <XrMenuBridge />
              <Core3DProvider>
                <AppContent />
              </Core3DProvider>
            </SceneProvider>
          </SoundProvider>
        </AudioProvider>
      </TaskProvider>
    </ErrorBoundary>
  );
}

export default App;