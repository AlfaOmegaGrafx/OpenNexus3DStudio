import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TaskProvider, useTask } from '../context/TaskContext';
import {
  parseClothingAccessoryLines,
  randomizeStudioClothingText,
} from '../library/appearanceClothing.js';
import StudioClothingAccessoriesEditor from '../components/studio/StudioClothingAccessoriesEditor.jsx';
import {
  createStudioProject,
  applyStudioTemplate,
  createStudioWorkspace,
  clearClothingGarmentResult,
  DEFAULT_STUDIO_TEMPLATE_ID,
  getActiveWorkspace,
  getClothingText,
  getHeadJobId,
  getPromptText,
  getEditPrompt,
  getStudioTemplate,
  getTextToImagePromptOptions,
  hydrateStudioProjectFromTasks,
  healStudioWorkspaceChain,
  loadWorkspaceStore,
  reconcileStudioChainArtifacts,
  saveWorkspaceStore,
  setClothingText,
  setFaceSelfieMeta,
  setHeadJobId,
  setHeadSplatUrl,
  setPromptText,
  setEditPrompt,
  setTextToImagePromptOptions,
  STUDIO_TEMPLATES,
  updateNode,
  updateWorkspaceProject,
} from '../library/studioGraph.js';
import { previewTextToImagePrompt } from '../library/textToImagePromptOptions.js';
import { sampleFaceSkinSwatch } from '../library/sampleFaceSkinSwatch.js';
import {
  BODY_CLOTH_STUDIO_TEMPLATE_ID,
  normalizeHeadTrack,
} from '../library/avatarPipelineCatalog.js';
import { runStudioPipeline } from '../library/studioGraphExecutor.js';
import { resolveTextToImageDownloadUrl } from '../library/taskModelUrl.js';
import TextToImagePromptOptions from '../components/TextToImagePromptOptions.jsx';
import StudioGraphView from '../components/studio/StudioGraphView.jsx';
import StudioKanbanView from '../components/studio/StudioKanbanView.jsx';
import StudioAuthenticatedThumb from '../components/studio/StudioAuthenticatedThumb.jsx';
import StudioStagePreviews from '../components/studio/StudioStagePreviews.jsx';
import './StudioPage.css';

function StudioImagePreview({ imageUrl, views, apiEndpoint }) {
  const list =
    Array.isArray(views) && views.length > 0
      ? views
      : imageUrl
        ? [{ viewId: 'front', imageUrl }]
        : [];
  if (!list.length) return null;
  return (
    <div className="studio-image-preview studio-image-preview-gallery">
      <div className="studio-image-preview-label">
        {list.length > 1
          ? `Turnaround (${list.length} views) — review before mesh`
          : 'Generated image (review before mesh)'}
      </div>
      <div className="studio-view-grid">
        {list.map((view) => (
          <StudioAuthenticatedThumb
            key={view.viewId || view.imageUrl}
            imageUrl={view.imageUrl}
            apiEndpoint={apiEndpoint}
            label={view.viewId}
          />
        ))}
      </div>
    </div>
  );
}

function StudioPageInner() {
  const {
    createAndStartTask,
    getTask,
    getAllTasks,
    isConnected,
    getApiEndpoint,
    syncTasksFromApi,
    cancelActiveTasks,
    taskManager,
  } = useTask();
  const [viewMode, setViewMode] = useState('graph');
  const [store, setStore] = useState(() => loadWorkspaceStore());
  const [faceSelfieFile, setFaceSelfieFile] = useState(null);
  /** @type {[{ hex: string, phrase: string }|null, function]} */
  const [faceSkinSwatch, setFaceSkinSwatch] = useState(null);
  const [runningById, setRunningById] = useState({});
  const [statusById, setStatusById] = useState({});
  const [errorById, setErrorById] = useState({});
  const [stoppingById, setStoppingById] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const storeRef = useRef(store);
  const activeIdRef = useRef(store.activeId);
  /** When true, in-flight createAndStartTask polls should abort for this workspace. */
  const pipelineCancelRef = useRef({ aborted: false });
  const deepLinkTemplateAppliedRef = useRef(false);

  const activeWorkspace = getActiveWorkspace(store) || store.workspaces[0];
  const activeId = activeWorkspace?.id;
  const project = activeWorkspace?.project;
  const running = Boolean(runningById[activeId]);
  const stopping = Boolean(stoppingById[activeId]);
  const statusLine = statusById[activeId] || '';
  const error = errorById[activeId] || null;

  useEffect(() => {
    storeRef.current = store;
    activeIdRef.current = store.activeId;
  }, [store]);

  useEffect(() => {
    saveWorkspaceStore(store);
  }, [store]);

  const setProject = useCallback((projectOrUpdater) => {
    const wsId = activeIdRef.current;
    setStore((prev) => {
      const next = updateWorkspaceProject(prev, wsId, projectOrUpdater);
      storeRef.current = next;
      return next;
    });
  }, []);

  const setStatusLine = useCallback((msg) => {
    const wsId = activeIdRef.current;
    setStatusById((prev) => ({ ...prev, [wsId]: typeof msg === 'function' ? msg(prev[wsId]) : msg }));
  }, []);

  const setError = useCallback((err) => {
    const wsId = activeIdRef.current;
    setErrorById((prev) => ({ ...prev, [wsId]: err }));
  }, []);

  const patchWorkspaceProject = useCallback((wsId, projectOrUpdater) => {
    setStore((prev) => {
      const next = updateWorkspaceProject(prev, wsId, projectOrUpdater);
      storeRef.current = next;
      return next;
    });
  }, []);

  // Task Manager "Head track · Body+Cloth (Studio)" → /studio?template=&head_track=
  useEffect(() => {
    if (deepLinkTemplateAppliedRef.current) return;
    const requested = String(searchParams.get('template') || '').trim();
    if (!requested) return;
    const tpl = getStudioTemplate(requested);
    if (!tpl || tpl.id !== requested) return;
    deepLinkTemplateAppliedRef.current = true;
    const headTrack = normalizeHeadTrack(searchParams.get('head_track'));
    const promptOpts = {
      ...getTextToImagePromptOptions(project),
      head_track: headTrack,
    };
    if (project?.templateId !== tpl.id) {
      setProject((prev) =>
        setTextToImagePromptOptions(
          applyStudioTemplate(prev, tpl.id, {
            promptOptions: { head_track: headTrack },
          }),
          promptOpts,
        ),
      );
    } else {
      setProject((prev) => setTextToImagePromptOptions(prev, promptOpts));
    }
    const next = new URLSearchParams(searchParams);
    next.delete('template');
    next.delete('head_track');
    setSearchParams(next, { replace: true });
    const trackLabel =
      headTrack === 'arc2avatar'
        ? '3DGSavatar'
        : headTrack === 'both'
          ? 'Both (Likeness + 3DGSavatar)'
          : headTrack === 'none'
            ? 'None (keep mesh head)'
            : 'Ethnicity + Likeness';
    setStatusLine(
      tpl.id === BODY_CLOTH_STUDIO_TEMPLATE_ID
        ? headTrack === 'none'
          ? 'Body+Cloth — head track: None (voxel / generated mesh head). No selfie needed.'
          : `Body+Cloth — head track: ${trackLabel}. Upload Face selfie when needed.`
        : `Template: ${tpl.shortLabel || tpl.label}`,
    );
  }, [searchParams, project, setProject, setSearchParams, setStatusLine]);

  // Heal every workspace chain: recover interrupted nodes and fill empty
  // stages from this tab's Task Manager jobs. Never drop produced cards.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer = null;

    const fingerprint = (proj) =>
      JSON.stringify(
        (proj?.nodes || []).map((n) => [
          n.id,
          n.status,
          n.data?.imageUrl || null,
          n.data?.meshUrl || null,
          n.data?.jobId || null,
          n.data?.inputMeshJobId || null,
          n.data?.statusMessage || null,
          n.data?.startedAt || null,
          n.data?.completedAt || null,
          Array.isArray(n.data?.results)
            ? n.data.results.map((r) => [
                r?.objectName || null,
                r?.appearance_slot || null,
                r?.jobId || null,
                r?.traitUrl || null,
                r?.meshUrl || null,
                r?.startedAt || null,
                r?.completedAt || null,
              ])
            : [],
        ]),
      );

    const healAll = async () => {
      attempt += 1;
      try {
        if (isConnected && typeof syncTasksFromApi === 'function') {
          await syncTasksFromApi();
        }
      } catch {
        /* optional */
      }
      if (cancelled) return;

      const taskList = (typeof getAllTasks === 'function' ? getAllTasks() : null) || [];
      const workspaces = storeRef.current.workspaces || [];
      for (const ws of workspaces) {
        if (runningById[ws.id]) continue; // don't fight an in-flight pipeline
        let wrapCleared = false;
        let imageReady = false;
        let rigReady = false;
        let changed = false;
        patchWorkspaceProject(ws.id, (proj) => {
          const next = healStudioWorkspaceChain(proj, taskList, {
            workspaceId: ws.id,
            resolveImageUrl: resolveTextToImageDownloadUrl,
          });
          if (fingerprint(proj) === fingerprint(next)) return proj;
          changed = true;
          const img = next.nodes.find((n) => n.kind === 'text_to_image');
          imageReady = img?.status === 'completed' && Boolean(img?.data?.imageUrl);
          const rig = next.nodes.find((n) => n.kind === 'auto_rigging');
          wrapCleared =
            Boolean(rig?.data?.statusMessage) &&
            /stale wrap|unrelated|previous mesh|other workspace|wrong rig mode/i.test(
              String(rig.data.statusMessage),
            );
          rigReady = rig?.status === 'completed' && Boolean(rig?.data?.meshUrl);
          return next;
        });
        if (!changed || ws.id !== activeIdRef.current) continue;
        if (wrapCleared) {
          setStatusById((prev) => ({
            ...prev,
            [ws.id]: 'Cleared stale wrap — run Auto-rig on this workspace mesh',
          }));
        } else if (rigReady) {
          setStatusById((prev) => ({
            ...prev,
            [ws.id]: 'Auto-rig ready — bound completed Task Manager job to this chain',
          }));
          setErrorById((prev) => ({ ...prev, [ws.id]: null }));
        } else if (imageReady) {
          setStatusById((prev) => ({
            ...prev,
            [ws.id]: prev[ws.id] || 'Image ready — review preview, then Generate mesh',
          }));
          setErrorById((prev) => ({ ...prev, [ws.id]: null }));
        }
      }

      if (!cancelled && attempt < 6) {
        timer = setTimeout(() => {
          void healAll();
        }, attempt < 3 ? 1500 : 3000);
      }
    };

    void healAll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    isConnected,
    activeId,
    runningById,
    syncTasksFromApi,
    getAllTasks,
    patchWorkspaceProject,
  ]);

  // Recover hung generate-image on whichever workspace is marked running.
  useEffect(() => {
    const runningIds = Object.entries(runningById)
      .filter(([, v]) => v)
      .map(([id]) => id);
    if (!runningIds.length) return undefined;

    const timer = setInterval(() => {
      void (async () => {
        try {
          if (typeof syncTasksFromApi === 'function') await syncTasksFromApi();
        } catch {
          /* optional */
        }
        const taskList = (typeof getAllTasks === 'function' ? getAllTasks() : null) || [];
        for (const wsId of runningIds) {
          const ws = storeRef.current.workspaces.find((w) => w.id === wsId);
          if (!ws?.project) continue;
          const imageNode = ws.project.nodes.find((n) => n.kind === 'text_to_image');
          if (!imageNode || imageNode.status !== 'running') continue;
          // Reconcile only while running — full rebind waits for idle heal.
          const reconciled = reconcileStudioChainArtifacts(ws.project, taskList);
          const hydrated = hydrateStudioProjectFromTasks(reconciled, taskList, {
            resolveImageUrl: resolveTextToImageDownloadUrl,
          });
          const img = hydrated.nodes.find((n) => n.kind === 'text_to_image');
          if (img?.status === 'completed' && img?.data?.imageUrl) {
            patchWorkspaceProject(wsId, hydrated);
            const meshNode = hydrated.nodes.find((n) => n.kind === 'image_to_3d');
            const meshStillPending =
              meshNode &&
              meshNode.status !== 'completed' &&
              meshNode.status !== 'failed';
            setStatusById((prev) => ({
              ...prev,
              [wsId]: meshStillPending
                ? 'Image ready — mesh step next (or click Generate mesh if stalled)'
                : 'Image ready — review preview, then Generate mesh',
            }));
            setErrorById((prev) => ({ ...prev, [wsId]: null }));
          }
        }
      })();
    }, 4000);
    return () => clearInterval(timer);
  }, [runningById, getAllTasks, syncTasksFromApi, patchWorkspaceProject]);

  const clothingText = project ? getClothingText(project) : '';
  const clothingAccessories = useMemo(() => {
    if (!project) return [];
    const fromNode = project.nodes.find((n) => n.kind === 'appearance_clothing')?.data
      ?.accessories;
    if (Array.isArray(fromNode) && fromNode.length) return fromNode;
    return parseClothingAccessoryLines(clothingText);
  }, [project, clothingText]);

  const prompt = project ? getPromptText(project) : '';
  const editPrompt = project ? getEditPrompt(project) : '';
  const promptOptions = project ? getTextToImagePromptOptions(project) : {};
  const composedPreview = useMemo(
    () => (project ? previewTextToImagePrompt(prompt, promptOptions) : ''),
    [project, prompt, promptOptions],
  );

  if (!project) {
    return <div className="studio-page">No workspace</div>;
  }

  const template = getStudioTemplate(project.templateId);
  const isMultiview = project.templateId === 'krea_trellis_multiview';
  const isComposableBody = project.templateId === 'krea_composable_avatar_body';
  const isMageEdit = Boolean(template?.includeImageEdit);
  /** Disabled <button> ignores title — wrap so hover still explains the gate. */
  const promptGatedTitle = (readyLabel) => {
    if (running) return 'Pipeline already running in this workspace';
    if (!isConnected) return 'Connect the API (API Status) first';
    if (!prompt.trim()) {
      return isComposableBody
        ? 'Type a Subject prompt first (clothing alone is not enough)'
        : 'Type a Subject prompt first';
    }
    return readyLabel;
  };
  const headJobId = getHeadJobId(project);
  const imageNode = project.nodes.find((n) => n.kind === 'text_to_image');
  const meshNode = project.nodes.find((n) => n.kind === 'image_to_3d');
  const rigNode = project.nodes.find((n) => n.kind === 'auto_rigging');
  const exportNode = project.nodes.find((n) => n.kind === 'export_asset');
  const imageUrl = imageNode?.data?.imageUrl || null;
  const imageViews = imageNode?.data?.views || null;
  const meshUrl =
    exportNode?.data?.meshUrl || rigNode?.data?.meshUrl || meshNode?.data?.meshUrl;
  const apiEndpoint = getApiEndpoint?.() || '/__dev_dgx_proxy';
  const imageReady = Boolean(imageUrl) && imageNode?.status === 'completed';
  const meshReady = Boolean(meshNode?.data?.meshUrl) && meshNode?.status === 'completed';
  const runningNode = project.nodes.find((n) => n.status === 'running');

  const handlePromptChange = (event) => {
    setProject((prev) => setPromptText(prev, event.target.value));
  };

  const handleEditPromptChange = (event) => {
    setProject((prev) => setEditPrompt(prev, event.target.value));
  };

  const handleRandomizeClothing = () => {
    const next = randomizeStudioClothingText({
      stylePrompt: getPromptText(project),
      slots: ['Chest', 'Legs', 'Shoes', 'Waist', 'Neck', 'Hands', 'Head'],
    });
    setProject((prev) => setClothingText(prev, next));
  };

  const handleHeadJobChange = (event) => {
    setProject((prev) => setHeadJobId(prev, event.target.value));
  };

  const handleFaceSelfieChange = (event) => {
    const file = event.target.files?.[0] || null;
    setFaceSelfieFile(file);
    setFaceSkinSwatch(null);
    setProject((prev) => setFaceSelfieMeta(prev, file));
    if (!file) return;
    sampleFaceSkinSwatch(file)
      .then((swatch) => {
        setFaceSkinSwatch({ hex: swatch.hex, phrase: swatch.phrase });
      })
      .catch((err) => {
        console.warn('Face skin swatch failed', err);
        setFaceSkinSwatch(null);
      });
  };

  useEffect(() => {
    const onHeadReady = (event) => {
      const url = event?.detail?.url;
      const jobId = event?.detail?.jobId;
      if (!url) return;
      setProject((prev) => {
        let next = setHeadSplatUrl(prev, url);
        if (jobId) next = setHeadJobId(next, jobId);
        return next;
      });
    };
    window.addEventListener('studioHeadSplatReady', onHeadReady);
    return () => window.removeEventListener('studioHeadSplatReady', onHeadReady);
  }, []);

  const handlePromptOptionsChange = (nextOptions) => {
    setProject((prev) => setTextToImagePromptOptions(prev, nextOptions));
  };

  const handleProjectNameChange = (event) => {
    const name = event.target.value;
    setProject((prev) => {
      let next = { ...prev, name };
      const mesh = prev.nodes.find((n) => n.kind === 'image_to_3d');
      if (mesh) {
        next = updateNode(next, mesh.id, { data: { objectName: name || 'studio_asset' } });
      }
      return next;
    });
  };

  const handleSelectTemplate = (templateId) => {
    if (running || templateId === project.templateId) return;
    setError(null);
    setStatusLine('');
    setProject((prev) => applyStudioTemplate(prev, templateId));
  };

  const handleReset = () => {
    setError(null);
    setStatusLine('');
    const tid = project.templateId || DEFAULT_STUDIO_TEMPLATE_ID;
    setProject(
      createStudioProject(tid, {
        prompt: '',
        headJobId: '',
        projectName: template.defaultName,
      }),
    );
  };

  const handleSelectWorkspace = (wsId) => {
    if (wsId === activeId) return;
    setStore((prev) => ({ ...prev, activeId: wsId }));
  };

  const handleAddWorkspace = () => {
    const ws = createStudioWorkspace(null, {
      name: `Job ${store.workspaces.length + 1}`,
    });
    setStore((prev) => ({
      activeId: ws.id,
      workspaces: [...prev.workspaces, ws],
    }));
    setStatusById((prev) => ({ ...prev, [ws.id]: '' }));
    setErrorById((prev) => ({ ...prev, [ws.id]: null }));
  };

  const handleCloseWorkspace = (wsId, event) => {
    event?.stopPropagation?.();
    if (store.workspaces.length <= 1) return;
    if (runningById[wsId]) return; // don't close while that job runs
    setStore((prev) => {
      const workspaces = prev.workspaces.filter((w) => w.id !== wsId);
      const activeIdNext =
        prev.activeId === wsId ? workspaces[workspaces.length - 1].id : prev.activeId;
      return { activeId: activeIdNext, workspaces };
    });
  };

  const handleStopPipeline = useCallback(async () => {
    const wsId = activeIdRef.current;
    pipelineCancelRef.current.aborted = true;
    setStoppingById((prev) => ({ ...prev, [wsId]: true }));
    setStatusById((prev) => ({ ...prev, [wsId]: 'Stopping job…' }));
    try {
      await cancelActiveTasks();
      patchWorkspaceProject(wsId, (proj) => {
        let next = proj;
        for (const node of proj.nodes || []) {
          if (node.status === 'running') {
            next = updateNode(next, node.id, {
              status: 'failed',
              data: {
                ...(node.data || {}),
                statusMessage: 'Stopped by user',
                error: 'Stopped by user',
              },
            });
          }
        }
        return next;
      });
      setErrorById((prev) => ({ ...prev, [wsId]: null }));
      setStatusById((prev) => ({ ...prev, [wsId]: 'Stopped by user' }));
    } catch (err) {
      console.error('Studio stop failed', err);
      setErrorById((prev) => ({
        ...prev,
        [wsId]: err?.message || 'Failed to stop job',
      }));
    } finally {
      setRunningById((prev) => ({ ...prev, [wsId]: false }));
      setStoppingById((prev) => ({ ...prev, [wsId]: false }));
    }
  }, [cancelActiveTasks, patchWorkspaceProject]);

  const runPipeline = useCallback(
    async (mode) => {
      const wsId = activeIdRef.current;
      pipelineCancelRef.current.aborted = false;
      const currentProject =
        storeRef.current.workspaces.find((w) => w.id === wsId)?.project || project;
      const tpl = getStudioTemplate(currentProject.templateId);
      const multi = currentProject.templateId === 'krea_trellis_multiview';
      const composable = currentProject.templateId === 'krea_composable_avatar_body';

      setErrorById((prev) => ({ ...prev, [wsId]: null }));
      setRunningById((prev) => ({ ...prev, [wsId]: true }));
      const meshLabel = multi ? 'Multiview Image to 3D Mesh' : 'Standard Image to Textured 3D Mesh';
      const label =
        mode === 'image'
          ? multi
            ? 'Running 6-view turnaround…'
            : composable
              ? 'Running neck-open body…'
              : 'Running text-to-image…'
          : mode === 'mesh'
            ? `Running ${meshLabel}…`
            : mode === 'rig'
              ? composable
                ? 'Running template wrap + clothing…'
                : 'Running full auto-rig…'
              : `Running ${tpl.label} pipeline (image → mesh → rig)…`;
      setStatusById((prev) => ({ ...prev, [wsId]: label }));

      try {
        const endpoint = getApiEndpoint?.() || '/__dev_dgx_proxy';
        const deps = {
          createAndStartTask,
          getTask,
          listTasks: getAllTasks,
          taskManager,
          apiEndpoint: endpoint,
          onProjectChange: (next) => {
            patchWorkspaceProject(wsId, next);
          },
          onStatus: (msg) => {
            setStatusById((prev) => ({ ...prev, [wsId]: msg }));
            patchWorkspaceProject(wsId, (proj) => {
              const node = proj.nodes.find((n) => n.status === 'running');
              if (!node) return proj;
              return updateNode(proj, node.id, { data: { statusMessage: msg } });
            });
          },
        };

        const pipelineOpts = {
          faceSelfieFile: composable ? faceSelfieFile : null,
          skinToneSwatch: composable ? faceSkinSwatch : null,
        };

        let next = currentProject;
        if (mode === 'mesh') {
          next = await runStudioPipeline(next, deps, {
            skipKinds: ['text_to_image'],
            until: 'image_to_3d',
            skipArc2AvatarHead: true,
          });
          setStatusById((prev) => ({
            ...prev,
            [wsId]: 'Mesh ready — review, then Auto-rig mesh (or Run full pipeline)',
          }));
        } else if (mode === 'rig') {
          next = await runStudioPipeline(next, deps, {
            skipKinds: ['text_to_image', 'image_to_3d'],
            skipArc2AvatarHead: true,
            faceSelfieFile: composable ? faceSelfieFile : null,
          });
          setStatusById((prev) => ({
            ...prev,
            [wsId]: composable ? 'Body wrap + clothing complete' : 'Auto-rig complete',
          }));
        } else if (mode === 'image') {
          next = await runStudioPipeline(next, deps, {
            until: 'text_to_image',
            skipArc2AvatarHead: true,
            ...pipelineOpts,
          });
          setStatusById((prev) => ({
            ...prev,
            [wsId]: 'Image ready — review preview, then Generate mesh',
          }));
        } else {
          next = await runStudioPipeline(next, deps, pipelineOpts);
          const meshNodeAfter = next.nodes.find((n) => n.kind === 'image_to_3d');
          const imageNodeAfter = next.nodes.find((n) => n.kind === 'text_to_image');
          if (
            imageNodeAfter?.status === 'completed' &&
            imageNodeAfter?.data?.imageUrl &&
            meshNodeAfter?.status !== 'completed'
          ) {
            setStatusById((prev) => ({
              ...prev,
              [wsId]: `Image ready — starting ${meshLabel}…`,
            }));
            next = await runStudioPipeline(next, deps, {
              skipKinds: ['text_to_image'],
              skipArc2AvatarHead: true,
            });
          }
          setStatusById((prev) => ({
            ...prev,
            [wsId]: composable
              ? 'Body+Cloth complete — open in viewport; 3DGSavatar head attaches when SDS finishes'
              : 'Pipeline complete',
          }));
        }

        patchWorkspaceProject(wsId, next);
        if (mode === 'full') {
          setStatusById((prev) => ({ ...prev, [wsId]: 'Pipeline complete' }));
        }
      } catch (err) {
        if (
          pipelineCancelRef.current.aborted ||
          err?.cancelled ||
          err?.code === 'JOB_CANCELLED' ||
          /stopped by user/i.test(err?.message || '')
        ) {
          setErrorById((prev) => ({ ...prev, [wsId]: null }));
          setStatusById((prev) => ({ ...prev, [wsId]: 'Stopped by user' }));
        } else {
          console.error('Studio pipeline failed', err);
          setErrorById((prev) => ({ ...prev, [wsId]: err?.message || String(err) }));
          setStatusById((prev) => ({ ...prev, [wsId]: 'Pipeline failed' }));
        }
      } finally {
        setRunningById((prev) => ({ ...prev, [wsId]: false }));
      }
    },
    [
      createAndStartTask,
      getTask,
      getAllTasks,
      getApiEndpoint,
      taskManager,
      faceSelfieFile,
      faceSkinSwatch,
      project,
      patchWorkspaceProject,
    ],
  );

  const rerunClothingGarment = useCallback(
    async (accessoryIndex) => {
      const index = Number(accessoryIndex);
      if (!Number.isFinite(index) || index < 0) return;
      const wsId = activeIdRef.current;
      const currentProject =
        storeRef.current.workspaces.find((w) => w.id === wsId)?.project || project;
      const clothingNode = currentProject.nodes.find((n) => n.kind === 'appearance_clothing');
      const acc = clothingNode?.data?.accessories?.[index];
      if (!acc) return;

      setErrorById((prev) => ({ ...prev, [wsId]: null }));
      setRunningById((prev) => ({ ...prev, [wsId]: true }));
      setStatusById((prev) => ({
        ...prev,
        [wsId]: `Re-running clothing: ${acc.label}…`,
      }));

      try {
        const endpoint = getApiEndpoint?.() || '/__dev_dgx_proxy';
        let next = clearClothingGarmentResult(currentProject, index);
        patchWorkspaceProject(wsId, next);
        next = await runStudioPipeline(
          next,
          {
            createAndStartTask,
            getTask,
            listTasks: getAllTasks,
            apiEndpoint: endpoint,
            onProjectChange: (proj) => patchWorkspaceProject(wsId, proj),
            onStatus: (msg) => setStatusById((prev) => ({ ...prev, [wsId]: msg })),
          },
          {
            skipKinds: ['text_to_image', 'image_to_3d', 'auto_rigging'],
            clothingIndexes: [index],
            forceClothingIndexes: [index],
          },
        );
        patchWorkspaceProject(wsId, next);
        setStatusById((prev) => ({
          ...prev,
          [wsId]: `Re-run complete: ${acc.label}`,
        }));
      } catch (err) {
        console.error('Clothing re-run failed', err);
        setErrorById((prev) => ({ ...prev, [wsId]: err?.message || String(err) }));
        setStatusById((prev) => ({ ...prev, [wsId]: 'Clothing re-run failed' }));
      } finally {
        setRunningById((prev) => ({ ...prev, [wsId]: false }));
      }
    },
    [
      createAndStartTask,
      getTask,
      getAllTasks,
      getApiEndpoint,
      project,
      patchWorkspaceProject,
    ],
  );

  return (
    <div className="studio-page">
      <header className="studio-page-header">
        <div className="studio-page-brand">
          <Link to="/" className="studio-page-back">
            ← Viewport
          </Link>
          <h1>OpenNexus Studio</h1>
          <span className="studio-page-sub">
            Prompt · Canvas · Asset — local DGX via 3DAIGC-API
          </span>
        </div>
        <nav className="studio-page-nav" aria-label="Labs">
          <Link to="/xr">XR Lab</Link>
          <Link to="/companion">Companion</Link>
        </nav>
        <div className="studio-page-actions">
          <span
            className={`studio-api-pill ${isConnected ? 'ok' : 'down'}`}
            title="3DAIGC-API connection"
          >
            {isConnected ? 'API connected' : 'API offline'}
          </span>
          <div className="studio-view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={viewMode === 'graph' ? 'active' : ''}
              onClick={() => setViewMode('graph')}
            >
              Graph
            </button>
            <button
              type="button"
              className={viewMode === 'kanban' ? 'active' : ''}
              onClick={() => setViewMode('kanban')}
            >
              Kanban
            </button>
          </div>
          <button type="button" className="studio-btn ghost" onClick={handleReset} disabled={running}>
            Reset template
          </button>
          <span className="studio-btn-wrap" title={promptGatedTitle('Generate image')}>
            <button
              type="button"
              className="studio-btn"
              onClick={() => void runPipeline('image')}
              disabled={running || !isConnected || !prompt.trim()}
            >
              {running ? 'Running…' : 'Generate image'}
            </button>
          </span>
          <span
            className="studio-btn-wrap"
            title={
              running
                ? 'Pipeline already running in this workspace'
                : !isConnected
                  ? 'Connect the API (API Status) first'
                  : imageReady
                    ? isMultiview
                      ? 'Send turnaround views to Multiview Image to 3D Mesh'
                      : 'Send reviewed image to Image to 3D Mesh'
                    : 'Generate and review an image first'
            }
          >
            <button
              type="button"
              className="studio-btn"
              onClick={() => void runPipeline('mesh')}
              disabled={running || !isConnected || !imageReady}
            >
              Generate mesh
            </button>
          </span>
          <span
            className="studio-btn-wrap"
            title={
              running
                ? 'Pipeline already running in this workspace'
                : !isConnected
                  ? 'Connect the API (API Status) first'
                  : meshReady
                    ? isComposableBody
                      ? 'Auto-rig body (template wrap), then clothing fan-out'
                      : 'Auto-rig the completed mesh'
                    : 'Generate a mesh first'
            }
          >
            <button
              type="button"
              className="studio-btn"
              onClick={() => void runPipeline('rig')}
              disabled={running || !isConnected || !meshReady}
            >
              Auto-rig mesh
            </button>
          </span>
          <span className="studio-btn-wrap" title={promptGatedTitle('Run full pipeline')}>
            <button
              type="button"
              className="studio-btn primary"
              onClick={() => void runPipeline('full')}
              disabled={running || !isConnected || !prompt.trim()}
            >
              {running ? 'Running…' : 'Run full pipeline'}
            </button>
          </span>
        </div>
      </header>

      <nav className="studio-workspace-tabs" aria-label="Studio workspaces">
        {store.workspaces.map((ws) => {
          const isActive = ws.id === activeId;
          const isWsRunning = Boolean(runningById[ws.id]);
          return (
            <button
              key={ws.id}
              type="button"
              className={`studio-workspace-tab ${isActive ? 'active' : ''} ${isWsRunning ? 'is-running' : ''}`}
              onClick={() => handleSelectWorkspace(ws.id)}
              title={ws.name}
            >
              {isWsRunning ? <span className="studio-running-dot" aria-hidden /> : null}
              <span className="studio-workspace-tab-name">{ws.name || 'Workspace'}</span>
              {isWsRunning ? <span className="studio-workspace-tab-badge">Running</span> : null}
              {store.workspaces.length > 1 && !isWsRunning ? (
                <span
                  className="studio-workspace-tab-close"
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${ws.name}`}
                  onClick={(e) => handleCloseWorkspace(ws.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleCloseWorkspace(ws.id, e);
                  }}
                >
                  ×
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          className="studio-workspace-tab studio-workspace-tab-add"
          onClick={handleAddWorkspace}
          title="New workspace / job"
        >
          +
        </button>
      </nav>

      <section className={`studio-page-controls ${isComposableBody ? 'is-body-cloth' : ''}`}>
        {isComposableBody ? (
          <div className="studio-controls-left">
            <label className="studio-field studio-controls-project">
              <span>Project name</span>
              <input
                type="text"
                value={project.name}
                onChange={handleProjectNameChange}
                disabled={running}
              />
            </label>
            <label className="studio-field studio-field-wide studio-controls-face">
              <span>Face selfie (one photo → head + body tone)</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFaceSelfieChange}
                disabled={running}
              />
              <span className="studio-field-hint">
                One close-up selfie for Likeness, optional 3DGSavatar on the Head bone,
                and body skin tone for the neck-open mannequin. Choose engines in Image options →
                Head track. The body image is a bare mannequin — outfit rows become Appearance slots.
              </span>
              {faceSelfieFile ? (
                <span className="studio-field-hint">Selfie: {faceSelfieFile.name}</span>
              ) : null}
              {faceSkinSwatch?.hex ? (
                <span className="studio-skin-swatch" title={faceSkinSwatch.phrase}>
                  <span
                    className="studio-skin-swatch-chip"
                    style={{ backgroundColor: faceSkinSwatch.hex }}
                    aria-hidden
                  />
                  <span className="studio-field-hint">
                    Body skin tone from selfie: {faceSkinSwatch.hex}
                  </span>
                </span>
              ) : null}
            </label>
          </div>
        ) : (
          <label className="studio-field studio-controls-project">
            <span>Project name</span>
            <input
              type="text"
              value={project.name}
              onChange={handleProjectNameChange}
              disabled={running}
            />
          </label>
        )}
        <div className="studio-prompt-stack studio-controls-prompt">
          <label className="studio-field studio-field-wide">
            <span>Subject prompt</span>
            <textarea
              rows={2}
              value={prompt}
              onChange={handlePromptChange}
              placeholder={
                isComposableBody
                  ? 'e.g. athletic woman, streetwear mannequin silhouette, headless…'
                  : 'e.g. dragon knight, humanoid in plate armor, T-pose…'
              }
              disabled={running}
              title={
                isComposableBody
                  ? 'Describe the body / silhouette. Clothing goes in Clothing / accessories to the right.'
                  : 'Describe the character or creature you want as a 3D mesh.'
              }
            />
            <p className="studio-mesh-hint">
              {isComposableBody ? (
                <>
                  Examples: <em>athletic woman, slim techwear body, headless mannequin</em> ·{' '}
                  <em>muscular male, cyberpunk streetwear silhouette</em> ·{' '}
                  <em>petite fantasy ranger body, soft lighting</em>. Put garments in Clothing /
                  accessories — not here.
                </>
              ) : (
                <>
                  Examples: <em>dragon knight, humanoid in ornate plate armor</em> ·{' '}
                  <em>cute stylized fox creature, bipedal</em> ·{' '}
                  <em>sci-fi android, clean white chassis, T-pose</em>.
                </>
              )}
            </p>
          </label>
          <div className="studio-template-picker" role="group" aria-label="Pipeline template">
            {STUDIO_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`studio-template-chip ${project.templateId === t.id ? 'active' : ''}`}
                title={t.description}
                disabled={running}
                onClick={() => handleSelectTemplate(t.id)}
              >
                {t.shortLabel}
              </button>
            ))}
          </div>
        </div>
        {isMageEdit ? (
          <label className="studio-field studio-field-wide studio-controls-mage">
            <span>Edit instruction (Mage-Flow-Edit)</span>
            <textarea
              rows={2}
              value={editPrompt}
              onChange={handleEditPromptChange}
              placeholder="e.g. change clothes and accessories"
              disabled={running}
            />
          </label>
        ) : null}
        {isComposableBody ? (
          <>
            <StudioClothingAccessoriesEditor
              accessories={clothingAccessories}
              disabled={running}
              onChangeText={(text) => setProject((prev) => setClothingText(prev, text))}
              onRandomize={handleRandomizeClothing}
            />
            <label className="studio-field studio-controls-head">
              <span>Head job id (optional override)</span>
              <input
                type="text"
                value={headJobId}
                onChange={handleHeadJobChange}
                placeholder="Existing 3DGSavatar / head job id"
                disabled={running}
              />
            </label>
          </>
        ) : null}
      </section>

      <section className={`studio-page-krea-options ${running ? 'is-locked' : ''}`}>
        <TextToImagePromptOptions
          value={promptOptions}
          onChange={running ? undefined : handlePromptOptionsChange}
          basePrompt={prompt}
        />
        <p className="studio-mesh-hint">
          {isComposableBody ? (
            <>
              <strong>Body+Cloth head track:</strong> Image options → Head track chooses{' '}
              <em>Ethnicity + Likeness</em>, <em>3DGSavatar</em>, <em>Both</em>, or <em>None</em>{' '}
              (keep generated mesh head — e.g. voxel) on the same{' '}
              <code>template_wrap</code> path. Body from text prompt; selfie only for 3DGSavatar.
              Clothing → Appearance slots.
            </>
          ) : isMultiview ? (
            <>
              <strong>Multiview pipeline:</strong> generates front / back / left / right / top /
              bottom with one shared seed, then Multiview Image to 3D Mesh. Keep Full body, T-pose, and
              Remove background. Expect ~6× single-image time.
            </>
          ) : (
            <>
              <strong>Textured mesh pipeline:</strong> one mesh-ready image (Full body, T-pose, Remove
              background, Front view recommended). Switch to <strong>6-View</strong> for a
              six-angle turnaround, or <strong>Body+Cloth</strong> for composable VRM.
            </>
          )}
        </p>
        {composedPreview ? (
          <p className="studio-composed-prompt">Will send: {composedPreview}</p>
        ) : null}
      </section>

      {(error || statusLine || running) && (
        <div className={`studio-status-banner ${error ? 'error' : ''} ${running ? 'is-running' : ''}`}>
          {running ? (
            <div className="studio-status-running-row">
              <span className="studio-running-dot" aria-hidden />
              <div className="studio-status-running-copy">
                <strong>Job running</strong>
                <span>
                  {statusLine ||
                    (runningNode
                      ? `${runningNode.label} in progress…`
                      : 'Pipeline in progress…')}
                </span>
              </div>
              <div className="studio-status-progress" aria-hidden>
                <div className="studio-status-progress-bar" />
              </div>
              <button
                type="button"
                className="studio-btn studio-btn-stop"
                onClick={() => void handleStopPipeline()}
                disabled={stopping}
                title="Cancel the current job where it is — do not proceed further"
                data-testid="studio-stop-job-btn"
              >
                {stopping ? 'Stopping…' : 'Stop job'}
              </button>
              <button
                type="button"
                className="studio-btn ghost"
                onClick={handleAddWorkspace}
                title="Open a new workspace while this job runs"
              >
                + New workspace
              </button>
            </div>
          ) : (
            error || statusLine
          )}
        </div>
      )}

      <StudioImagePreview
        imageUrl={imageUrl}
        views={imageViews}
        apiEndpoint={apiEndpoint}
      />

      <StudioStagePreviews
        project={project}
        apiEndpoint={apiEndpoint}
        running={running}
        onRerunStage={(mode) => void runPipeline(mode)}
        onRerunClothing={(index) => void rerunClothingGarment(index)}
      />

      <main className="studio-page-main">
        {viewMode === 'graph' ? (
          <StudioGraphView
            project={project}
            apiEndpoint={apiEndpoint}
            running={running}
            onRerunClothing={(index) => void rerunClothingGarment(index)}
          />
        ) : (
          <StudioKanbanView project={project} apiEndpoint={apiEndpoint} />
        )}
      </main>

      <footer className="studio-page-footer">
        {meshUrl ? (
          <a className="studio-btn primary" href={`/?loadMesh=${encodeURIComponent(meshUrl)}`}>
            Open mesh in viewport
          </a>
        ) : imageReady ? (
          <span className="studio-footer-hint">
            Image ready below — click <strong>Generate mesh</strong> when you are satisfied, or{' '}
            <strong>Run full pipeline</strong> to continue automatically.
          </span>
        ) : (
          <span className="studio-footer-hint">
            Generate a mesh-ready image, review it, then Generate mesh (or Run full pipeline).
          </span>
        )}
      </footer>
    </div>
  );
}

export default function StudioPage() {
  return (
    <TaskProvider>
      <StudioPageInner />
    </TaskProvider>
  );
}
