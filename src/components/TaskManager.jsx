import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTask } from '../context/TaskContext';
import { useScene } from '../context/SceneContext';
import { ensureAbsoluteUrl, get3daigcAuthHeaders } from '../library/taskManager';
import {
  ALL_MODELS,
  TASK_TYPE_TO_FEATURE,
  autoRigSelectionForPipelineKind,
  getAutoRigModelsForRigMode,
  getDefaultAutoRigOutputFormat,
  getDefaultModelForFeature,
  getDefaultRigModeForTaskType,
  getModelLabel,
  getModelsForTaskType as getCatalogModelsForTaskType,
  getPropMeshModelsForWorld,
  implyRigModeFromAutoRigModel,
  inferAutoRigPipelineKind,
  PREFERRED_PIPELINES,
  recommendedRigPipelinesForTask,
  resolveAutoRigModelForTask,
  resolveMeshModelForAvatarFromImage,
  resolveSplatModelForPhotos,
  API_MAX_MESH_VERTICES,
  PIPELINE_MESH_DECIMATION_TARGET,
  PIPELINE_MESH_DECIMATION_MAX,
  PIPELINE_MESH_SIMPLIFY_DEFAULT,
  getPipelineSafeMeshGenerationDefaults,
} from '../library/aiModelsCatalog.js';
import {
  AUTO_RIG_MODES,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  TEMPLATE_RIG_MODEL_ID,
  ARC2AVATAR_TASK_TYPE,
  ARC2AVATAR_API_READY,
  BODY_CLOTH_STUDIO_TASK_TYPE,
  HEAD_TRACK,
  HEAD_TRACK_OPTIONS,
  buildBodyClothStudioPath,
  normalizeHeadTrack,
  isArc2AvatarTaskType,
  isBodyClothStudioTaskType,
  fetchArc2AvatarStatus,
} from '../library/avatarPipelineCatalog.js';
import {
  CREATURE_TEMPLATE_OPTIONS,
  DEFAULT_CREATURE_TEMPLATE_ID,
} from '../library/creaturePipelineCatalog.js';
import {
  getTaskResultModelUrl,
  getTaskResultMeshUrl,
  getTaskResultMotionUrl,
  getTaskResultImageUrl,
  getTaskResultFileExtension,
  isTextToImageTaskResult,
  isTextToMotionTaskResult,
  normalizeTaskLoadPayload,
  resolveTaskModelUrl,
  resolveTextToImageDownloadUrl,
} from '../library/taskModelUrl.js';
import {
  getWorldManifestUrlFromTaskResult,
  isFullWorldPackageTaskResult,
  isSplatEnvironmentTaskResult,
  isWorldLayerTaskResult,
} from '../library/worldPackage.js';
import { formatTaskDurationMs, formatTaskTimestamp, getTaskElapsedMs, resolveTaskJobId, sortCompletedTasksByRecency } from '../library/taskPersistence.js';
import { useSpatialFabric } from '../hooks/useSpatialFabric.js';
import { canPublishTaskToSpatialFabric, getSyncSceneAssemblerUrl, preopenSpatialFabricTab } from '../library/spatialFabricAdapter.js';
import {
  normalizeObjectName,
  objectNameFromFilename,
  resolveCarriedObjectName,
  slugifyObjectName,
} from '../library/objectNameUtils.js';
import {
  AI_BACKEND_UNAVAILABLE_MSG,
  canBrowseAiTaskCatalog,
  OPEN_TASK_CATALOG_EVENT,
} from '../library/runtimeUi.js';
import {
  MAX_TOTAL_IMAGES,
  multiImageUploadHint,
  splitPrimaryAndReferenceFiles,
  supportsMultiImageInput,
} from '../library/multiImageInput.js';
import TaskAdvancedOptions from './TaskAdvancedOptions.jsx';
import TextToImagePromptOptions from './TextToImagePromptOptions.jsx';
import ImagePanelPreview from './ImagePanelPreview.jsx';
import TaskMeshPreview from './TaskMeshPreview.jsx';
import {
  buildTextToImagePrompt,
  DEFAULT_TEXT_TO_IMAGE_PROMPT_OPTIONS,
} from '../library/textToImagePromptOptions.js';
import './TaskManager.css';
import './TaskMeshPreview.css';

export { ALL_MODELS, TASK_TYPE_TO_FEATURE };

/** Authenticated thumbnail for completed text-to-image jobs. */
function TaskImagePreview({ url, apiEndpoint }) {
  const [src, setSrc] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!url) {
      setSrc(null);
      setStatus('idle');
      return undefined;
    }
    const abs = resolveTaskModelUrl(url, apiEndpoint);
    let cancelled = false;
    let objectUrl = null;
    setStatus('loading');
    setSrc(null);
    fetch(abs, { headers: get3daigcAuthHeaders() })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, apiEndpoint]);

  if (status === 'loading') {
    return (
      <div className="text-xs text-gray-400 mt-0.5" style={{ fontSize: '0.6rem' }}>
        Loading preview…
      </div>
    );
  }
  if (status === 'error' || !src) {
    return (
      <div className="text-xs text-gray-500 mt-0.5" style={{ fontSize: '0.6rem' }}>
        Preview unavailable
      </div>
    );
  }
  return <ImagePanelPreview src={src} alt="Generated" />;
}

const TaskManager = ({ tasks, onAITask, isApiConnected }) => {
  console.log('TaskManager: Component rendered with props:', { 
    tasksLength: tasks?.length, 
    onAITask: !!onAITask, 
    isApiConnected 
  });

  const navigate = useNavigate();
  
  const [viewportLoadingJobId, setViewportLoadingJobId] = useState(null);
  const [viewportActiveJobId, setViewportActiveJobId] = useState(null);
  const [viewportFailedJobId, setViewportFailedJobId] = useState(null);
  const [viewportFailedMessage, setViewportFailedMessage] = useState(null);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskType, setNewTaskType] = useState('text-to-3d');
  const [newObjectName, setNewObjectName] = useState('');
  /** True after the user edits the object-name field; blocks overwrite from filename/chain. */
  const objectNameTouchedRef = useRef(false);
  /** Last name used on a started job — restored for the next task so chaining does not retype. */
  const lastObjectNameRef = useRef('');
  const [newTaskPrompt, setNewTaskPrompt] = useState('');
  const [newTaskImage, setNewTaskImage] = useState(null);
  const [newTaskImages, setNewTaskImages] = useState([]);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [newTaskModel, setNewTaskModel] = useState(() => getDefaultModelForFeature('text-to-3d'));
  const [taskOptions, setTaskOptions] = useState(() => {
    const pipeline = getPipelineSafeMeshGenerationDefaults();
    return {
    texture_resolution: 1024,
    output_format: 'glb',
    mesh_simplify: pipeline.mesh_simplify,
    rig_mode: AUTO_RIG_MODES.FULL,
    humanoid_template_id: DEFAULT_HUMANOID_TEMPLATE_ID,
    creature_template_id: DEFAULT_CREATURE_TEMPLATE_ID,
    include_splat_preview: false,
    /** Body+Cloth Studio discovery — GNM+MeshMonk / Arc2Avatar / Both */
    head_track: HEAD_TRACK.MESHMONK,
    use_multiview_mesh: true,
    prop_regions_json: '',
    world_name: '',
    prop_mesh_model_preference: 'trellis2_image_to_textured_mesh',
    metric_mode: 'reference_length',
    metric_true_meters: '0.762',
    metric_recon_length: '0.47',
    metric_axis: 'horizontal',
    refine_to_3dgs: true,
    train_3dgs: true,
    train_3dgs_steps: 10100,
    bake_env_mesh: true,
    image_width: 1024,
    image_height: 1024,
    text_to_image_prompt_options: { ...DEFAULT_TEXT_TO_IMAGE_PROMPT_OPTIONS },
    num_parts: 8,
    source_prompt: '',
    target_prompt: '',
    mask_bbox_center: '0, 1, 0',
    mask_bbox_dimensions: '0.5, 0.5, 0.5',
    model_parameters: { ...pipeline.model_parameters },
  };
  });
  const [meshEditSourceImage, setMeshEditSourceImage] = useState(null);
  const [meshEditMaskImage, setMeshEditMaskImage] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [isSyncingTasks, setIsSyncingTasks] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [publishingJobId, setPublishingJobId] = useState(null);
  /** Completed mesh task id with expanded Rig panel (filtered pipelines). */
  const [rigPanelTaskId, setRigPanelTaskId] = useState(null);
  const [rigPanelPipeline, setRigPanelPipeline] = useState('skintokens');
  const [availableModels, setAvailableModels] = useState(ALL_MODELS);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(true);
  const cardHeaderRef = useRef(null);
  const newTaskFormRef = useRef(null);
  const { currentModel, clearModel } = useScene();
  const { deleteTask, syncTasksFromApi, clearCompletedTasks, getApiEndpoint } = useTask();
  const apiEndpoint = getApiEndpoint();
  const {
    openSceneAssembler,
    openOmbGuidelines,
    publishJob,
    config: spatialConfig,
    sceneAssemblerReady,
  } = useSpatialFabric(apiEndpoint);
  const fileInputRef = useRef(null);
  const objectNameInputRef = useRef(null);
  const [objectNamePlaceholder, setObjectNamePlaceholder] = useState(
    'e.g. Dragon Knight, Desk Lamp, Childhood Bedroom',
  );

  /**
   * Fill object name from upload/chain unless the user has typed their own.
   * @param {string|null|undefined} suggested
   * @param {{ force?: boolean }} [opts]
   */
  const applyCarriedObjectName = (suggested, opts = {}) => {
    const name = normalizeObjectName(suggested);
    if (!name) return;
    setObjectNamePlaceholder(name);
    if (opts.force || !objectNameTouchedRef.current || !normalizeObjectName(newObjectName)) {
      setNewObjectName(name);
      if (opts.force) objectNameTouchedRef.current = false;
    }
  };

  const openNewTaskForm = (taskType, carriedName) => {
    if (taskType) setNewTaskType(taskType);
    setShowNewTask(true);
    setIsExpanded(true);
    const carried =
      normalizeObjectName(carriedName) ||
      normalizeObjectName(newObjectName) ||
      lastObjectNameRef.current;
    if (carried && (!objectNameTouchedRef.current || !normalizeObjectName(newObjectName))) {
      setNewObjectName(carried);
      setObjectNamePlaceholder(carried);
      objectNameTouchedRef.current = false;
    }
  };

  /** When true, skip the auto-rigging default useEffect (Rig panel already set model/mode). */
  const skipAutoRigDefaultsRef = useRef(false);

  const canStartAnyTask = isApiConnected;
  const canBrowseCatalog = canBrowseAiTaskCatalog();
  const normalizedNewObjectName = normalizeObjectName(newObjectName);
  const canSubmitNewTask = Boolean(normalizedNewObjectName);
  const canOpenNewTaskForm = canStartAnyTask || canBrowseCatalog;

  const { activeTasks, completedTasks } = useMemo(() => {
    const active = [];
    const completed = [];
    for (const task of tasks) {
      if (task.status === 'completed' || task.status === 'failed') {
        completed.push(task);
      } else {
        active.push(task);
      }
    }
    return {
      activeTasks: active,
      completedTasks: sortCompletedTasksByRecency(completed),
    };
  }, [tasks]);

  useEffect(() => {
    const onBrowse = (event) => {
      const taskType = event?.detail?.taskType || 'text-to-3d';
      openNewTaskForm(taskType, lastObjectNameRef.current);
      if (cardHeaderRef.current) {
        setTimeout(() => {
          cardHeaderRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest',
          });
        }, 0);
      }
    };
    window.addEventListener(OPEN_TASK_CATALOG_EVENT, onBrowse);
    return () => window.removeEventListener(OPEN_TASK_CATALOG_EVENT, onBrowse);
  }, []);

  useEffect(() => {
    if (!showNewTask) return undefined;
    const timer = window.setTimeout(() => objectNameInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [showNewTask]);

  // Log only when the file input is expected (new task open + image-related type) but missing.
  useEffect(() => {
    if (fileInputRef.current) return;
    const needsImageInput =
      showNewTask &&
      ['image-to-3d', 'image-to-raw-mesh', 'image-to-splat', 'image-to-world', 'environment-scan', 'avatar-from-image', ARC2AVATAR_TASK_TYPE, 'mesh-painting', 'mesh-editing-image'].includes(newTaskType);
    if (needsImageInput) {
      console.warn('TaskManager: file input ref missing while task needs image upload');
    }
  }, [newTaskType, showNewTask]);
  
  // Get models filtered by task type (full catalog when offline; API subset when connected).
  const getModelsForTaskType = (taskType) => {
    if (!isApiConnected) {
      return getCatalogModelsForTaskType(taskType);
    }
    const feature = TASK_TYPE_TO_FEATURE[taskType];
    if (!feature) return [];
    return availableModels.filter((model) => model.feature === feature);
  };
  
  // Get default model for task type
  const getDefaultModelForTaskType = (taskType) => {
    const preferred = getDefaultModelForFeature(taskType);
    if (preferred) return preferred;
    const models = getModelsForTaskType(taskType);
    return models.length > 0 ? models[0].value : '';
  };
  
  // Update model + output_format when task type changes (mesh-gen = glb, auto-rig = fbx)
  useEffect(() => {
    // Rig panel sets model + rig_mode explicitly — don't wipe them on open.
    if (newTaskType === 'auto-rigging' && skipAutoRigDefaultsRef.current) {
      skipAutoRigDefaultsRef.current = false;
      return;
    }
    const defaultModel = getDefaultModelForTaskType(newTaskType);
    if (defaultModel) {
      setNewTaskModel(defaultModel);
    }
    if (newTaskType === 'auto-rigging') {
      const rigMode = getDefaultRigModeForTaskType('auto-rigging');
      const rigModel = resolveAutoRigModelForTask(rigMode, defaultModel);
      setTaskOptions((prev) => ({
        ...prev,
        rig_mode: rigMode,
        output_format: getDefaultAutoRigOutputFormat(rigModel, rigMode),
        humanoid_template_id: prev.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID,
      }));
      setNewTaskModel(rigModel);
    } else if (newTaskType === 'avatar-from-image') {
      setTaskOptions((prev) => ({
        ...prev,
        output_format: 'glb',
        rig_mode: AUTO_RIG_MODES.TEMPLATE,
        humanoid_template_id: DEFAULT_HUMANOID_TEMPLATE_ID,
        include_splat_preview: prev.include_splat_preview ?? false,
      }));
      setNewTaskModel(resolveMeshModelForAvatarFromImage(defaultModel));
    } else if (newTaskType === 'mesh-retopology') {
      setTaskOptions((prev) => ({
        ...prev,
        output_format: 'glb',
        target_face_count: prev.target_face_count ?? PIPELINE_MESH_DECIMATION_TARGET,
        model_parameters: {
          ...(prev.model_parameters || {}),
          target_face_count:
            prev.model_parameters?.target_face_count ??
            prev.model_parameters?.decimation_target ??
            PIPELINE_MESH_DECIMATION_TARGET,
        },
      }));
    } else if (newTaskType === 'image-to-splat') {
      setTaskOptions((prev) => ({ ...prev, output_format: 'ply' }));
    } else if (newTaskType === 'image-to-raw-mesh') {
      setTaskOptions((prev) => ({ ...prev, output_format: 'glb' }));
    } else if (newTaskType === 'image-to-world') {
      setTaskOptions((prev) => ({
        ...prev,
        prop_regions_json: prev.prop_regions_json ?? '',
        world_name: prev.world_name ?? '',
      }));
      if (defaultModel) setNewTaskModel(defaultModel);
    } else if (newTaskType === 'environment-scan') {
      setTaskOptions((prev) => ({
        ...prev,
        world_name: prev.world_name ?? '',
        metric_mode: prev.metric_mode || 'reference_length',
        metric_true_meters: prev.metric_true_meters ?? '0.762',
        metric_recon_length: prev.metric_recon_length ?? '0.47',
        metric_axis: prev.metric_axis || 'horizontal',
      }));
      if (defaultModel) setNewTaskModel(defaultModel);
    } else if (newTaskType === 'text-to-image') {
      setTaskOptions((prev) => ({
        ...prev,
        output_format: 'png',
        image_width: prev.image_width ?? 1024,
        image_height: prev.image_height ?? 1024,
      }));
    } else {
      setTaskOptions((prev) => ({ ...prev, output_format: 'glb' }));
    }
  }, [newTaskType]);

  useEffect(() => {
    if (newTaskType !== 'auto-rigging') return;
    const rigMode = taskOptions.rig_mode ?? getDefaultRigModeForTaskType('auto-rigging');
    const resolved = resolveAutoRigModelForTask(rigMode, newTaskModel);
    if (resolved !== newTaskModel) {
      setNewTaskModel(resolved);
    }
    setTaskOptions((prev) => ({
      ...prev,
      output_format: getDefaultAutoRigOutputFormat(resolved, rigMode),
    }));
  }, [newTaskType, taskOptions.rig_mode]);

  /** When user picks a backend model, sync compatible rig_mode (fixes UniRig/creature snap-back). */
  const handleAutoRigModelChange = (modelId) => {
    const rigMode = taskOptions.rig_mode ?? getDefaultRigModeForTaskType('auto-rigging');
    const nextMode = implyRigModeFromAutoRigModel(modelId, rigMode);
    setNewTaskModel(modelId);
    setTaskOptions((prev) => ({
      ...prev,
      rig_mode: nextMode,
      output_format: getDefaultAutoRigOutputFormat(modelId, nextMode),
      humanoid_template_id:
        nextMode === AUTO_RIG_MODES.TEMPLATE || nextMode === AUTO_RIG_MODES.TEMPLATE_WRAP
          ? prev.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID
          : prev.humanoid_template_id,
      creature_template_id:
        nextMode === AUTO_RIG_MODES.CREATURE_TEMPLATE
          ? prev.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID
          : prev.creature_template_id,
    }));
  };

  /** Visible pipeline picker — sets model + rig_mode together. */
  const handleAutoRigPipelineKind = (kind) => {
    const { modelPreference, rigMode, appearance_slot } = autoRigSelectionForPipelineKind(
      kind,
      { objectName: newObjectName },
    );
    setNewTaskModel(modelPreference);
    setTaskOptions((prev) => ({
      ...prev,
      rig_mode: rigMode,
      output_format: getDefaultAutoRigOutputFormat(modelPreference, rigMode),
      appearance_slot:
        rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT
          ? appearance_slot || prev.appearance_slot || 'Legs'
          : prev.appearance_slot,
      humanoid_template_id:
        rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP
          ? prev.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID
          : prev.humanoid_template_id,
      creature_template_id:
        rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE
          ? prev.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID
          : prev.creature_template_id,
    }));
  };

  /** Auto-pick creature/UniRig/SkinTokens/Appearance clothing from object name. */
  useEffect(() => {
    if (newTaskType !== 'auto-rigging') return;
    const kind = inferAutoRigPipelineKind({ objectName: newObjectName });
    const { modelPreference, rigMode, appearance_slot } = autoRigSelectionForPipelineKind(
      kind,
      { objectName: newObjectName },
    );
    const currentMode = taskOptions.rig_mode;
    // Only auto-switch when name strongly implies creature/template/clothing, or when still on defaults.
    const onDefaultSkinTokens =
      (!currentMode || currentMode === AUTO_RIG_MODES.FULL) &&
      (newTaskModel === 'skintokens_auto_rig' || !newTaskModel);
    if (
      kind === 'creature' ||
      kind === 'template' ||
      kind === 'appearance' ||
      onDefaultSkinTokens
    ) {
      if (newTaskModel !== modelPreference || currentMode !== rigMode) {
        if (kind === 'skintokens' && !onDefaultSkinTokens) return;
        setNewTaskModel(modelPreference);
        setTaskOptions((prev) => ({
          ...prev,
          rig_mode: rigMode,
          output_format: getDefaultAutoRigOutputFormat(modelPreference, rigMode),
          appearance_slot:
            rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT
              ? appearance_slot || prev.appearance_slot || 'Legs'
              : prev.appearance_slot,
          creature_template_id:
            rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE
              ? prev.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID
              : prev.creature_template_id,
          humanoid_template_id:
            rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP
              ? prev.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID
              : prev.humanoid_template_id,
        }));
      }
    }
  }, [newTaskType, newObjectName]);
  
  // Optionally fetch models from API on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const apiEndpoint = ensureAbsoluteUrl(getApiEndpoint() || '');
        if (!apiEndpoint) return;
        const response = await fetch(`${apiEndpoint}/api/v1/system/models`, {
          headers: { Accept: 'application/json', ...get3daigcAuthHeaders() }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.available_models) {
            // Transform API response to our model format
            const apiModels = [];
            Object.entries(data.available_models).forEach(([feature, models]) => {
              models.forEach(modelId => {
                const existingModel = ALL_MODELS.find(m => m.value === modelId);
                if (existingModel) {
                  apiModels.push(existingModel);
                } else {
                  // Add model from API if not in our list
                  apiModels.push({
                    value: modelId,
                    label: getModelLabel(modelId),
                    feature: feature
                  });
                }
              });
            });
            if (apiModels.length > 0) {
              setAvailableModels(apiModels);
            }
          }
        }
      } catch (error) {
        console.log('Could not fetch models from API, using default list:', error);
        // Use default models if API fetch fails
      }
    };
    
    if (isApiConnected) {
      fetchModels();
    }
  }, [isApiConnected, getApiEndpoint]);

  // Check if task type requires a loaded model
  const requiresModel = (taskType) => {
    return [
      'mesh-segmentation',
      'auto-rigging',
      'mesh-painting',
      'mesh-painting-text',
      'mesh-retopology',
      'mesh-uv-unwrapping',
      'mesh-editing-text',
      'mesh-editing-image'
    ].includes(taskType);
  };

  const requiresPrompt = (taskType) => {
    if (
      taskType === 'avatar-from-image' ||
      isArc2AvatarTaskType(taskType) ||
      isBodyClothStudioTaskType(taskType) ||
      taskType === 'image-to-world' ||
      taskType === 'environment-scan'
    ) {
      return false;
    }
    return !requiresModel(taskType);
  };

  const parseVec3 = (value, fallback = [0, 1, 0]) => {
    if (!value || typeof value !== 'string') return fallback;
    const parts = value.split(',').map((n) => Number(n.trim())).filter((n) => !Number.isNaN(n));
    if (parts.length < 3) return fallback;
    return [parts[0], parts[1], parts[2]];
  };

  const handleSubmitTask = async (e) => {
    e.preventDefault();
    // Discovery entry — open Studio Body+Cloth with chosen head track (thin wrapper, not a Task API job).
    if (isBodyClothStudioTaskType(newTaskType)) {
      navigate(buildBodyClothStudioPath(taskOptions.head_track));
      setShowNewTask(false);
      return;
    }
    if (!canStartAnyTask) {
      alert(canBrowseCatalog ? AI_BACKEND_UNAVAILABLE_MSG : 'Configure DGX API (VITE_API_ENDPOINT) before starting tasks.');
      return;
    }
    console.log('TaskManager: handleSubmitTask called');
    console.log('TaskManager: newTaskPrompt:', newTaskPrompt);
    console.log('TaskManager: newTaskType:', newTaskType);
    console.log('TaskManager: newTaskImage:', newTaskImage);

    const objectName = normalizeObjectName(newObjectName);
    if (!objectName) {
      alert('⚠️ Enter a name for this 3D object before starting.');
      objectNameInputRef.current?.focus();
      objectNameInputRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    if (newTaskType === 'image-to-3d' && !newTaskImage) {
      alert('⚠️ Image to 3D requires an input image. Use “Use for Image to 3D” on a completed text-to-image task or upload a photo.');
      return;
    }
    if (newTaskType === 'mesh-painting' && !newTaskImage) {
      alert('⚠️ Mesh painting (image) requires a reference image.');
      return;
    }
    if (newTaskType === 'mesh-editing-image' && !newTaskImage) {
      alert('⚠️ Mesh editing (image) requires a target reference image.');
      return;
    }
    if (newTaskType === 'mesh-editing-image' && !meshEditMaskImage) {
      alert('⚠️ Mesh editing (image) requires a 2D mask image.');
      return;
    }
    if (newTaskType === 'mesh-editing-text' && !taskOptions.source_prompt?.trim() && !newTaskPrompt.trim()) {
      alert('⚠️ Text mesh editing requires source and target prompts (or a general prompt).');
      return;
    }
    if (newTaskType === 'image-to-splat' && !newTaskImage) {
      alert('⚠️ Image to Gaussian Splat requires an input image.');
      return;
    }
    if (newTaskType === 'image-to-raw-mesh' && !newTaskImage) {
      alert('⚠️ Image to Raw Mesh requires an input image.');
      return;
    }
    if (newTaskType === 'image-to-world' && !newTaskImage) {
      alert('⚠️ Image to World requires a reference photo.');
      return;
    }
    if (newTaskType === 'environment-scan') {
      const isVideo =
        newTaskImage &&
        (/\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(newTaskImage.name || '') ||
          String(newTaskImage.type || '').startsWith('video/'));
      const frameCount =
        (supportsMultiImageInput(newTaskType) && newTaskImages.length > 0
          ? newTaskImages.length
          : newTaskImage
            ? 1
            : 0);
      if (!isVideo && frameCount < 3) {
        alert(
          '⚠️ Environment scan needs a walk video or ≥3 ordered frames (Galaxy XR outward cameras while walking).',
        );
        return;
      }
      const metricMode = taskOptions.metric_mode || 'reference_length';
      const trueMeters = Number(taskOptions.metric_true_meters);
      if (!Number.isFinite(trueMeters) || trueMeters <= 0) {
        alert(
          '⚠️ Enter a real-world length in meters for 1:1 scale (Office door lock: 0.762 m with recon 0.47).',
        );
        return;
      }
      if (metricMode === 'auto_bbox' && trueMeters < 1.5) {
        alert(
          '⚠️ Auto bbox expects the real room span (diagonal / longest wall), typically ≥1.5–4+ m.\n\n' +
            '0.762 m (30 in) is a door width — use Reference length mode (horizontal) for doors.\n\n' +
            'Wrong value shrinks/stretches the whole Office splat into a mess.',
        );
        return;
      }
      if (
        metricMode === 'reference_length' &&
        !(Number(taskOptions.metric_recon_length) > 0)
      ) {
        alert(
          '⚠️ reference_length mode needs recon_length (Office door ≈ 0.47), or switch mode to auto_bbox.',
        );
        return;
      }
    }
    if (newTaskType === 'avatar-from-image' && !newTaskImage) {
      alert('⚠️ Avatar from Image requires a photo (mesh + template avatar rig).');
      return;
    }
    if (isArc2AvatarTaskType(newTaskType)) {
      if (!newTaskImage) {
        alert('⚠️ Avatar head (Arc2Avatar) requires a face photo.');
        return;
      }
      try {
        const status = await fetchArc2AvatarStatus(getApiEndpoint());
        if (!status?.integrated) {
          const reasons = (status?.blocking_reasons || []).join('\n• ') || 'not installed';
          alert(
            '⚠️ Arc2Avatar API not ready on DGX.\n\n• ' +
              reasons +
              '\n\nInstall thirdparty/Arc2Avatar env + weights (docs/ARC2AVATAR_TRACK.md), then retry.\n' +
              'Meanwhile use Avatar from Image / template_wrap.',
          );
          return;
        }
      } catch (err) {
        alert(
          `⚠️ Could not reach Arc2Avatar status: ${err?.message || err}\n\n` +
            (ARC2AVATAR_API_READY
              ? ''
              : 'API may need restart after adapter deploy.'),
        );
        return;
      }
    }
    if (newTaskType !== 'avatar-from-image' && !isApiConnected) {
      alert('⚠️ DGX API is not connected. Connect API Status first for this task type.');
      return;
    }
    
    // Check if model is required but not loaded
    if (requiresModel(newTaskType) && !currentModel) {
      alert(`⚠️ Please load a 3D model first. ${newTaskType.replace('-', ' ')} requires a model to be loaded in the viewport.`);
      return;
    }

    // For tasks that don't require prompts, use a default description
    if (!newTaskPrompt.trim() && requiresPrompt(newTaskType)) {
      console.log('TaskManager: No prompt provided, returning');
      return;
    }

    // For model-based tasks, use a descriptive prompt if none provided
    let prompt =
      newTaskPrompt.trim() ||
      (newTaskType === 'avatar-from-image'
        ? 'Generate avatar from image (mesh + ICT template rig)'
          : newTaskType === 'image-to-world'
            ? objectName
            : newTaskType === 'environment-scan'
              ? objectName
            : `${newTaskType.replace('-', ' ')} on current model`);

    if (newTaskType === 'text-to-image') {
      prompt = buildTextToImagePrompt(
        newTaskPrompt.trim(),
        taskOptions.text_to_image_prompt_options,
      );
    }

    const options = {
      object_name: objectName,
      texture_resolution: taskOptions.texture_resolution,
      output_format:
        taskOptions.output_format ??
        (newTaskType === 'auto-rigging'
          ? getDefaultAutoRigOutputFormat(newTaskModel, taskOptions.rig_mode ?? 'skeleton')
          : newTaskType === 'avatar-from-image'
            ? 'glb'
            : 'glb'),
      mesh_simplify: taskOptions.mesh_simplify,
      model_parameters: taskOptions.model_parameters,
    };
    if (newTaskType === 'auto-rigging') {
      const rigMode = taskOptions.rig_mode ?? getDefaultRigModeForTaskType('auto-rigging');
      options.rig_mode = rigMode;
      options.model_preference = resolveAutoRigModelForTask(rigMode, newTaskModel);
      if (rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP) {
        options.humanoid_template_id =
          taskOptions.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID;
        options.output_format = 'glb';
      }
      if (rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE) {
        options.creature_template_id =
          taskOptions.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID;
        options.output_format = 'glb';
      }
      if (rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT) {
        options.appearance_slot =
          taskOptions.appearance_slot ||
          taskOptions.model_parameters?.appearance_slot ||
          'Legs';
        options.output_format = 'glb';
      }
    }
    if (newTaskType === 'avatar-from-image') {
      options.humanoid_template_id =
        taskOptions.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID;
      options.include_splat_preview = Boolean(taskOptions.include_splat_preview);
    }
    if (newTaskType === 'mesh-segmentation' && taskOptions.num_parts) {
      options.num_parts = Number(taskOptions.num_parts) || 8;
    }
    if (newTaskType === 'mesh-retopology') {
      options.output_format = taskOptions.output_format || 'glb';
      const faceTarget =
        Number(taskOptions.target_face_count) ||
        Number(taskOptions.model_parameters?.target_face_count) ||
        Number(taskOptions.model_parameters?.decimation_target) ||
        PIPELINE_MESH_DECIMATION_TARGET;
      options.target_face_count = faceTarget;
      if (newTaskModel === 'instant_meshes_retopology') {
        const ok = window.confirm(
          'Instant Meshes rebuilds topology and often leaves holes on AIGC characters (capes, fingers, wings). Textures are also lost.\n\n' +
            'Prefer “Mesh Decimate” to reduce triangles while keeping a complete model.\n\nContinue with Instant Meshes anyway?',
        );
        if (!ok) return;
      }
      if (
        newTaskModel === 'autoremesher_retopology' &&
        !window.confirm(
          'AutoRemesher remeshes the surface — original textures/UVs will not transfer.\n\nPrefer Mesh Decimate if you need textures. Continue?',
        )
      ) {
        return;
      }
    }
    if (newTaskType === 'mesh-editing-text' || newTaskType === 'mesh-editing-image') {
      options.source_prompt = taskOptions.source_prompt?.trim() || newTaskPrompt.trim();
      options.target_prompt = taskOptions.target_prompt?.trim() || newTaskPrompt.trim();
      options.mask_bbox = {
        center: parseVec3(taskOptions.mask_bbox_center, [0, 1, 0]),
        dimensions: parseVec3(taskOptions.mask_bbox_dimensions, [0.5, 0.5, 0.5]),
      };
    }
    if (newTaskType === 'mesh-editing-image') {
      options.source_image_file = meshEditSourceImage || newTaskImage;
      options.target_image_file = newTaskImage;
      options.mask_image_file = meshEditMaskImage;
    }
    if (newTaskType === 'image-to-world') {
      options.model_preference = newTaskModel || 'opennexus_image_to_world';
      options.prop_mesh_model_preference =
        taskOptions.prop_mesh_model_preference || 'trellis2_image_to_textured_mesh';
      options.world_name = objectName;
      if (taskOptions.prop_regions_json?.trim()) {
        try {
          const parsed = JSON.parse(taskOptions.prop_regions_json);
          options.prop_regions = Array.isArray(parsed) ? parsed : [];
        } catch {
          alert('⚠️ Prop regions JSON is invalid. Use an array of { id, bbox: [x,y,w,h] }.');
          return;
        }
      } else {
        options.prop_regions = [];
      }
    }
    if (newTaskType === 'environment-scan') {
      options.model_preference = newTaskModel || 'lingbot_map_environment_scan';
      options.world_name = objectName;
      options.refine_to_3dgs = Boolean(taskOptions.refine_to_3dgs);
      options.train_3dgs = Boolean(taskOptions.train_3dgs);
      options.train_3dgs_steps = Number(taskOptions.train_3dgs_steps) || 7000;
      options.bake_env_mesh = Boolean(taskOptions.bake_env_mesh);
      const trueMeters = Number(taskOptions.metric_true_meters);
      const mode = taskOptions.metric_mode || 'reference_length';
      const metric = {
        mode,
        true_meters: trueMeters,
      };
      // Locked Office door path: reference_length defaults to horizontal (never stretch Y).
      if (mode === 'reference_length' || mode === 'two_points') {
        metric.axis = taskOptions.metric_axis || 'horizontal';
      } else if (taskOptions.metric_axis) {
        metric.axis = taskOptions.metric_axis;
      }
      const recon = Number(taskOptions.metric_recon_length);
      if (Number.isFinite(recon) && recon > 0) {
        if (mode === 'player_height') {
          metric.recon_height = recon;
        } else {
          metric.recon_length = recon;
        }
      }
      options.metric_calibration = metric;
    }
    if (newTaskType === 'text-to-image') {
      options.width = Number(taskOptions.image_width) || 1024;
      options.height = Number(taskOptions.image_height) || 1024;
      options.output_format = taskOptions.output_format === 'webp' ? 'webp' : 'png';
    }
    const modelsForTask = getModelsForTaskType(newTaskType);
    // Auto-rigging already resolved model_preference above — don't clobber UniRig/template.
    if (newTaskType !== 'auto-rigging' && modelsForTask.length > 0 && newTaskModel) {
      options.model_preference = newTaskModel;
    }

    console.log('TaskManager: Calling onAITask with options:', options);
    const multiImage = supportsMultiImageInput(newTaskType) && newTaskImages.length > 0;
    const { primary, references } = multiImage
      ? splitPrimaryAndReferenceFiles(newTaskImages, primaryImageIndex)
      : { primary: newTaskImage, references: [] };
    const imageFile = primary || newTaskImage;
    if (references.length > 0) {
      options.reference_image_files = references;
      options.use_multiview_mesh = Boolean(taskOptions.use_multiview_mesh);
    }
    if (newTaskType === 'image-to-splat' && references.length >= 1) {
      options.model_preference = resolveSplatModelForPhotos(1, references.length);
    }
    if (newTaskType === 'avatar-from-image') {
      options.mesh_model_preference = resolveMeshModelForAvatarFromImage(newTaskModel, {
        referenceCount: references.length,
        useMultiview: taskOptions.use_multiview_mesh,
      });
    }
    onAITask(newTaskType, prompt, imageFile, options);
    lastObjectNameRef.current = objectName;
    objectNameTouchedRef.current = false;
    // Keep object name for the next step (e.g. Image to 3D → Auto Rigging).
    setNewObjectName(objectName);
    setObjectNamePlaceholder(objectName);
    setNewTaskPrompt('');
    setNewTaskImage(null);
    setNewTaskImages([]);
    setPrimaryImageIndex(0);
    setMeshEditSourceImage(null);
    setMeshEditMaskImage(null);
    // Reset to default model for the task type
    setNewTaskModel(getDefaultModelForTaskType(newTaskType));
    setShowNewTask(false);
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    const multi = supportsMultiImageInput(newTaskType);
    const selected = multi ? files.slice(0, MAX_TOTAL_IMAGES) : files.slice(0, 1);
    console.log('TaskManager: handleImageChange called, files:', selected.map((f) => f.name));
    if (selected.length === 0) {
      console.warn('TaskManager: No file selected');
      return;
    }
    if (multi) {
      setNewTaskImages(selected);
      setPrimaryImageIndex(0);
      setNewTaskImage(selected[0]);
    } else {
      setNewTaskImages([]);
      setPrimaryImageIndex(0);
      setNewTaskImage(selected[0]);
    }
    applyCarriedObjectName(objectNameFromFilename(selected[0].name));
  };

  const handleSetPrimaryImage = (index) => {
    setPrimaryImageIndex(index);
    if (newTaskImages[index]) {
      setNewTaskImage(newTaskImages[index]);
    }
  };

  const handleFileButtonClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('TaskManager: handleFileButtonClick called');
    console.log('TaskManager: fileInputRef.current:', fileInputRef.current);
    if (fileInputRef.current) {
      try {
        fileInputRef.current.click();
        console.log('TaskManager: File input click triggered');
      } catch (error) {
        console.error('TaskManager: Error clicking file input:', error);
      }
    } else {
      console.error('TaskManager: fileInputRef.current is null - file input not found');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'status-running';
      case 'completed': return 'status-completed';
      case 'failed': return 'status-failed';
      case 'pending': return 'status-pending';
      default: return 'status-pending';
    }
  };

  const formatDate = (date) => formatTaskTimestamp(date);

  const renderTaskTiming = (task) => {
    const started = task.startedAt || task.createdAt;
    const completed = task.completedAt;
    const elapsedMs = getTaskElapsedMs(task);

    if (task.status === 'completed' || task.status === 'failed') {
      return (
        <>
          {' • Started '}
          {formatDate(started)}
          {completed ? (
            <>
              {' • Completed '}
              {formatDate(completed)}
            </>
          ) : null}
          {elapsedMs != null ? (
            <>
              {' • '}
              {formatTaskDurationMs(elapsedMs)} elapsed
            </>
          ) : null}
        </>
      );
    }

    return (
      <>
        {' • Started '}
        {formatDate(started)}
      </>
    );
  };

  useEffect(() => {
    const onStart = (event) => {
      setViewportFailedJobId(null);
      setViewportFailedMessage(null);
      setViewportLoadingJobId(event.detail?.jobId || null);
    };
    const onComplete = (event) => {
      setViewportLoadingJobId(null);
      setViewportFailedJobId(null);
      setViewportFailedMessage(null);
      setViewportActiveJobId(event.detail?.jobId || null);
    };
    const onFailed = (event) => {
      setViewportLoadingJobId(null);
      setViewportActiveJobId(null);
      setViewportFailedJobId(event.detail?.jobId || null);
      setViewportFailedMessage(event.detail?.error || 'Failed to load into viewport');
    };
    window.addEventListener('viewportLoadStart', onStart);
    window.addEventListener('viewportLoadComplete', onComplete);
    window.addEventListener('viewportLoadFailed', onFailed);
    return () => {
      window.removeEventListener('viewportLoadStart', onStart);
      window.removeEventListener('viewportLoadComplete', onComplete);
      window.removeEventListener('viewportLoadFailed', onFailed);
    };
  }, []);

  const resolveChainImageDownloadUrl = (task) => resolveTextToImageDownloadUrl(task);

  const handleUseImageForImageTo3d = async (task, event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    const loadPayload = normalizeTaskLoadPayload(task);
    const imageUrl = resolveChainImageDownloadUrl(task);
    if (!imageUrl) {
      alert('No generated image URL on this task.');
      return;
    }
    setIsExpanded(true);
    try {
      const abs = resolveTaskModelUrl(imageUrl, apiEndpoint);
      const response = await fetch(abs, { headers: get3daigcAuthHeaders() });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = getTaskResultFileExtension(loadPayload) || 'png';
      const carried = resolveCarriedObjectName(task) || lastObjectNameRef.current;
      const baseName = slugifyObjectName(carried, 'generated-image');
      const file = new File([blob], `${baseName}.${ext}`, {
        type: blob.type || (ext === 'webp' ? 'image/webp' : 'image/png'),
      });
      setNewTaskType('image-to-3d');
      setNewTaskPrompt(task.prompt || '');
      applyCarriedObjectName(carried, { force: true });
      if (carried) lastObjectNameRef.current = carried;
      setNewTaskModel(getDefaultModelForFeature('image-to-3d'));
      setNewTaskImage(file);
      setNewTaskImages([]);
      setPrimaryImageIndex(0);
      setTaskOptions((prev) => ({ ...prev, use_multiview_mesh: false }));
      setShowNewTask(true);
      window.setTimeout(() => {
        newTaskFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        objectNameInputRef.current?.focus();
      }, 0);
    } catch (error) {
      alert(error?.message || 'Failed to fetch generated image for Image to 3D.');
    }
  };

  /** Prefill Auto Rigging from a completed mesh task (name carries; load mesh into viewport). */
  const handleUseMeshForAutoRigging = (task, event, pipelineKind) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    const carried = resolveCarriedObjectName(task) || lastObjectNameRef.current;
    if (carried) lastObjectNameRef.current = carried;
    const pipelines = recommendedRigPipelinesForTask(task);
    const kind =
      pipelineKind && pipelines.includes(pipelineKind) ? pipelineKind : pipelines[0] || 'skintokens';
    const { modelPreference, rigMode, appearance_slot } = autoRigSelectionForPipelineKind(
      kind,
      { objectName: carried },
    );
    skipAutoRigDefaultsRef.current = true;
    dispatchLoadTask(task, 'useForAutoRig');
    openNewTaskForm('auto-rigging', carried);
    applyCarriedObjectName(carried, { force: true });
    setNewTaskModel(modelPreference);
    setTaskOptions((prev) => ({
      ...prev,
      rig_mode: rigMode,
      output_format: getDefaultAutoRigOutputFormat(modelPreference, rigMode),
      appearance_slot:
        rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT
          ? appearance_slot || 'Legs'
          : prev.appearance_slot,
      humanoid_template_id:
        rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP
          ? prev.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID
          : prev.humanoid_template_id,
      creature_template_id:
        rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE
          ? prev.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID
          : prev.creature_template_id,
    }));
    setRigPanelTaskId(null);
    window.setTimeout(() => {
      newTaskFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      objectNameInputRef.current?.focus();
    }, 0);
  };

  /**
   * One-click auto-rig from a completed mesh task — downloads the result GLB
   * (no viewport race) and starts SkinTokens / UniRig immediately.
   */
  const handleStartAutoRigFromCompletedTask = async (task, event, pipelineKind) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (!isApiConnected) {
      alert('⚠️ DGX API is not connected.');
      return;
    }
    const carried = resolveCarriedObjectName(task) || lastObjectNameRef.current;
    if (!normalizeObjectName(carried)) {
      alert('⚠️ Enter / carry an object name before auto-rigging.');
      return;
    }
    const pipelines = recommendedRigPipelinesForTask(task);
    const kind =
      pipelineKind && pipelines.includes(pipelineKind) ? pipelineKind : pipelines[0] || 'skintokens';
    const { modelPreference, rigMode, appearance_slot } = autoRigSelectionForPipelineKind(
      kind,
      { objectName: carried },
    );
    const loadPayload = normalizeTaskLoadPayload(task);
    const meshUrl = getTaskResultMeshUrl(loadPayload) || getTaskResultModelUrl(loadPayload);
    if (!meshUrl) {
      alert('⚠️ No mesh URL on this completed task.');
      return;
    }
    setRigPanelTaskId(null);
    try {
      const abs = resolveTaskModelUrl(meshUrl, apiEndpoint);
      const response = await fetch(abs, { headers: get3daigcAuthHeaders() });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const sourceMeshFile = new File([blob], `${slugifyObjectName(carried, 'mesh')}.glb`, {
        type: blob.type || 'model/gltf-binary',
      });

      if (kind === 'skintokens') {
        try {
          const { prepareGlbForApiUpload } = await import('../library/glbCompress.js');
          await prepareGlbForApiUpload(await sourceMeshFile.arrayBuffer(), {
            maxVertices: API_MAX_MESH_VERTICES,
            maxFaces: API_MAX_MESH_VERTICES,
            preserveTextures: true,
            allowPositionOnlyFallback: false,
          });
        } catch (prepError) {
          const detail = prepError?.message || String(prepError);
          alert(
            `⚠️ This mesh is too dense to auto-rig with textures.\n\n${detail}\n\n` +
              'Re-run Image-to-3D with decimation target ≤210,000 faces (the API upload cap). ' +
              'Do not use Instant Meshes for characters — it often leaves holes. Prefer Mesh Decimate.',
          );
          return;
        }
      }

      dispatchLoadTask(task, 'startAutoRig');
      const options = {
        object_name: carried,
        model_preference: resolveAutoRigModelForTask(rigMode, modelPreference),
        rig_mode: rigMode,
        output_format: getDefaultAutoRigOutputFormat(modelPreference, rigMode),
        sourceMeshFile,
      };
      if (rigMode === AUTO_RIG_MODES.TEMPLATE || rigMode === AUTO_RIG_MODES.TEMPLATE_WRAP) {
        options.humanoid_template_id =
          taskOptions.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID;
      }
      if (rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE) {
        options.creature_template_id =
          taskOptions.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID;
      }
      if (rigMode === AUTO_RIG_MODES.APPEARANCE_COMPONENT) {
        options.appearance_slot = appearance_slot || 'Legs';
      }
      lastObjectNameRef.current = carried;
      await onAITask('auto-rigging', `Auto-rig ${carried}`, null, options);
    } catch (error) {
      console.error('TaskManager: start auto-rig from completed task failed', error);
      alert(`Auto-rigging request failed: ${error?.message || error}`);
    }
  };

  const openCompletedRigPanel = (task, event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    const pipelines = recommendedRigPipelinesForTask(task);
    setRigPanelTaskId(task.id);
    setRigPanelPipeline(pipelines[0] || 'skintokens');
  };

  const PIPELINE_LABELS = {
    skintokens: 'SkinTokens — biped / character',
    creature: 'Creature template — fox / quadruped',
    template: 'UniRig → template avatar fit (Blender; not UniRig ML)',
    appearance: 'Appearance fit — clothing / wearable',
  };

  const handleDownloadTaskImage = async (task, event) => {
    event?.stopPropagation?.();
    const loadPayload = normalizeTaskLoadPayload(task);
    const imageUrl = resolveChainImageDownloadUrl(task);
    if (!imageUrl) {
      alert('No generated image URL on this task.');
      return;
    }
    try {
      const abs = resolveTaskModelUrl(imageUrl, apiEndpoint);
      const response = await fetch(abs, { headers: get3daigcAuthHeaders() });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = getTaskResultFileExtension(loadPayload) || 'png';
      const baseName = slugifyObjectName(
        task.options?.object_name || task.name,
        resolveTaskJobId(task) || 'image',
      );
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${baseName}.${ext}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      alert(error?.message || 'Failed to download image.');
    }
  };

  const handleDeleteTask = async (task) => {
    setDeleteError(null);
    setDeletingTaskId(task.id);
    try {
      await deleteTask(task.id);
    } catch (error) {
      setDeleteError(error?.message || 'Failed to delete task');
    } finally {
      setDeletingTaskId(null);
    }
  };

  const dispatchLoadTask = (task, source = 'taskRow') => {
    if (task.status !== 'completed' || !task.result) return;
    const jobId = resolveTaskJobId(task);
    if (viewportLoadingJobId && viewportLoadingJobId === jobId) {
      return;
    }
    const loadPayload = normalizeTaskLoadPayload(task);
    if (!loadPayload) return;
    const isImage = task.type === 'text-to-image' || isTextToImageTaskResult(loadPayload);
    if (isImage) return;
    const isMotion = task.type === 'text-to-motion' || isTextToMotionTaskResult(loadPayload);
    if (isMotion) {
      if (!getTaskResultMotionUrl(loadPayload) && !jobId) {
        console.warn('TaskManager: No motion URL for task', task.id);
        return;
      }
      console.log(`TaskManager: Loading motion in viewport (${source})`, {
        jobId: resolveTaskJobId(task),
        type: task.type,
      });
      window.dispatchEvent(
        new CustomEvent('loadModelFromUrl', {
          detail: { result: loadPayload, taskId: task.id, task },
        }),
      );
      return;
    }
    const isWorld = isWorldLayerTaskResult(loadPayload);
    const modelUrl = isWorld ? getTaskResultModelUrl(loadPayload) : getTaskResultMeshUrl(loadPayload);
    if (!isWorld && !modelUrl) {
      console.warn('TaskManager: No loadable result for task', task.id);
      return;
    }
    console.log(`TaskManager: Opening in viewport (${source})`, {
      jobId: resolveTaskJobId(task),
      type: task.type,
      isWorld,
      url: modelUrl,
      manifest: isWorld ? getWorldManifestUrlFromTaskResult(loadPayload) : null,
    });
    window.dispatchEvent(
      new CustomEvent('loadModelFromUrl', {
        detail: { result: loadPayload, taskId: task.id, task },
      }),
    );
  };

  const handleTaskRowClick = (task, event) => {
    if (event.target.closest('button')) return;
    dispatchLoadTask(task, 'taskRowClick');
  };

  const handleSyncFromDgx = async () => {
    setSyncMessage(null);
    setIsSyncingTasks(true);
    try {
      const synced = await syncTasksFromApi();
      setIsCompletedExpanded(true);
      const imageJobs = (synced || []).filter(
        (t) =>
          t?.status === 'completed' &&
          (t.type === 'text-to-image' || isTextToImageTaskResult(normalizeTaskLoadPayload(t))),
      );
      const meshJobs = (synced || []).filter((t) => {
        if (t?.status !== 'completed') return false;
        if (t.type === 'text-to-image' || t.type === 'text-to-motion') return false;
        return Boolean(resolveTaskJobId(t));
      });
      const parts = [`Synced ${synced.length} task(s) from DGX`];
      if (imageJobs.length) {
        parts.push(
          `${imageJobs.length} image(s) — open Completed → Download Image`,
        );
      }
      if (meshJobs.length) {
        parts.push(`${meshJobs.length} mesh(es) — Load Model`);
      }
      setSyncMessage(parts.join(' · '));
    } catch (error) {
      setSyncMessage(error?.message || 'Failed to sync from DGX Spark');
    } finally {
      setIsSyncingTasks(false);
    }
  };

  const handleOpenMetaverseBrowser = async (event) => {
    event?.stopPropagation?.();
    const preopenedTab = preopenSpatialFabricTab(getSyncSceneAssemblerUrl());
    try {
      if (sceneAssemblerReady) {
        console.log('[SpatialFabric] Opening Scene Assembler');
        await openSceneAssembler({ preopenedTab });
      } else {
        console.log('[SpatialFabric] Opening OMB guidelines (MSF not linked)');
        await openOmbGuidelines({ preopenedTab });
      }
    } catch (err) {
      console.error('[SpatialFabric] Open Scene Assembler failed', err);
      alert(err?.message || String(err));
    }
  };

  const handlePublishRp1 = async (task, event) => {
    event.stopPropagation();
    const preopenedTab = preopenSpatialFabricTab(getSyncSceneAssemblerUrl());
    const jobId = resolveTaskJobId(task);
    if (!jobId) {
      alert('No DGX job id on this task — sync from DGX or wait for completion.');
      return;
    }
    setPublishingJobId(jobId);
    try {
      const assetName = slugifyObjectName(
        task.options?.object_name || task.name,
        jobId ? `job-${jobId}` : 'opennexus-mesh',
      );
      await publishJob(jobId, assetName, { preopenedTab });
    } catch (err) {
      console.error('[SpatialFabric] TaskManager publish failed', err);
      alert(err?.message || String(err));
    } finally {
      setPublishingJobId(null);
    }
  };

  const renderTaskItem = (task) => {
    const taskJobId = resolveTaskJobId(task);
    const loadPayload =
      task.status === 'completed' ? normalizeTaskLoadPayload(task) : null;
    const isImageTask =
      task.type === 'text-to-image' ||
      (loadPayload && isTextToImageTaskResult(loadPayload));
    const isViewportLoading = viewportLoadingJobId && taskJobId === viewportLoadingJobId;
    const isViewportActive = viewportActiveJobId && taskJobId === viewportActiveJobId;
    const isViewportFailed = viewportFailedJobId && taskJobId === viewportFailedJobId;
    const canOpenInViewport =
      task.status === 'completed' && task.result && !isImageTask;
    return (
      <div
                key={task.id}
                className="task-item"
                role={canOpenInViewport ? 'button' : undefined}
                tabIndex={canOpenInViewport ? 0 : undefined}
                onClick={(event) => handleTaskRowClick(task, event)}
                onKeyDown={(event) => {
                  if (!canOpenInViewport) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    dispatchLoadTask(task, 'taskRowKey');
                  }
                }}
                title={
                  canOpenInViewport
                    ? isViewportLoading
                      ? 'Loading into viewport…'
                      : task.type === 'text-to-motion' || isTextToMotionTaskResult(task.result)
                        ? 'Click to load animation on the avatar'
                        : 'Click to open in viewport'
                    : isImageTask && task.status === 'completed'
                      ? 'Generated image — use Download or Image to 3D below'
                      : undefined
                }
                style={{
                padding: '0.375rem',
                border: isViewportFailed
                  ? '1px solid #dc3545'
                  : isViewportActive
                    ? '1px solid #28a745'
                    : '1px solid #444',
                borderRadius: '4px',
                backgroundColor: isViewportLoading
                  ? '#333a35'
                  : isViewportFailed
                    ? '#3a2a2a'
                    : isViewportActive
                      ? '#2a332a'
                      : '#2a2a2a',
                cursor: canOpenInViewport ? 'pointer' : 'default',
                opacity: viewportLoadingJobId && !isViewportLoading ? 0.75 : 1,
              }}>
                <div className="flex justify-between items-center mb-0.5">
                  <div style={{ flex: 1 }}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold" style={{ fontSize: '0.75rem' }}>{task.name}</span>
                      <span className={`status ${getStatusColor(task.status)}`} style={{ 
                        fontSize: '0.6rem', 
                        padding: '0.1rem 0.3rem',
                        borderRadius: '3px'
                      }}>
                        {task.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400" style={{ fontSize: '0.6rem' }}>
                      {task.type}
                      {task.options?.model_preference
                        ? ` • ${getModelLabel(task.options.model_preference)}`
                        : ''}
                      {renderTaskTiming(task)}
                      {resolveTaskJobId(task) ? (
                        <span style={{ color: '#666' }}>
                          {' '}
                          • job {resolveTaskJobId(task).slice(0, 8)}…
                          {task.handoffSource === 'galaxy-xr' ? ' • XR' : ''}
                          {task.syncedFromApi ? ' • DGX' : ''}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteTask(task);
                    }}
                    className="btn btn-danger"
                    disabled={deletingTaskId === task.id}
                    title={
                      resolveTaskJobId(task)
                        ? 'Delete from this browser and DGX Spark'
                        : 'Delete from this browser'
                    }
                    style={{ 
                      padding: '0.1rem 0.35rem', 
                      fontSize: '0.6rem',
                      minWidth: 'auto'
                    }}
                  >
                    {deletingTaskId === task.id ? '…' : 'Delete'}
                  </button>
                </div>

                {task.status === 'running' && (
                  <div className="mb-0.5">
                    <div
                      className={`progress${task.progressIndeterminate ? ' progress-indeterminate' : ''}`}
                      style={{ height: '3px' }}
                    >
                      <div
                        className="progress-bar"
                        style={
                          task.progressIndeterminate || task.progress == null || task.progress <= 0
                            ? undefined
                            : { width: `${Math.min(100, task.progress)}%` }
                        }
                      />
                    </div>
                    <div
                      className="text-xs text-gray-400"
                      style={{ fontSize: '0.55rem', marginTop: '2px' }}
                    >
                      {task.progressIndeterminate || task.progress == null || task.progress <= 0
                        ? 'Working…'
                        : `${Math.round(task.progress)}%`}
                      {task.statusMessage ? ` · ${task.statusMessage}` : ''}
                    </div>
                  </div>
                )}

                {task.prompt && (
                  <p className="text-xs text-gray-300 mb-0.5" style={{ fontSize: '0.65rem' }}>
                    "{task.prompt.length > 60 ? task.prompt.substring(0, 60) + '...' : task.prompt}"
                  </p>
                )}

                {task.error && (
                  <div className="text-xs text-red-400 mb-0.5" style={{ fontSize: '0.6rem' }}>
                    Error: {task.error}
                  </div>
                )}

                {(task.result || (task.status === 'completed' && resolveTaskJobId(task))) && (() => {
                  const rowPayload = loadPayload || normalizeTaskLoadPayload(task);
                  const isMotion =
                    task.type === 'text-to-motion' || isTextToMotionTaskResult(rowPayload);
                  const isImage =
                    task.type === 'text-to-image' || isTextToImageTaskResult(rowPayload);
                  const isFullWorld = isFullWorldPackageTaskResult(rowPayload);
                  const isSplatEnv = isSplatEnvironmentTaskResult(rowPayload);
                  const isWorld = isFullWorld || isSplatEnv;
                  const modelUrl = getTaskResultModelUrl(rowPayload);
                  const meshUrl = getTaskResultMeshUrl(rowPayload);
                  const taskJobId = resolveTaskJobId(task);
                  const motionUrl = isMotion ? getTaskResultMotionUrl(rowPayload) : null;
                  const imageUrl = isImage ? getTaskResultImageUrl(rowPayload) : null;
                  const canLoadMotion = isMotion && Boolean(motionUrl || taskJobId);
                  const canUseImage = isImage && Boolean(imageUrl || taskJobId);
                  const canPublishRp1 = canPublishTaskToSpatialFabric(task, rowPayload, {
                    isSplatOnly: isSplatEnv && !meshUrl,
                    hasMesh: Boolean(meshUrl),
                    meshUrl,
                    isFullWorld,
                  });
                  const isPublishing = publishingJobId && taskJobId === publishingJobId;
                  return (
                  <div className="text-xs text-green-400 mb-0.5" style={{ fontSize: '0.6rem' }}>
                    {isViewportLoading
                      ? isMotion
                        ? '⏳ Loading animation…'
                        : '⏳ Loading in viewport…'
                      : isViewportFailed
                        ? isMotion
                          ? '✗ Animation load failed'
                          : '✗ Viewport load failed'
                        : isViewportActive
                          ? isMotion
                            ? '● Playing on avatar'
                            : '● In viewport'
                          : '✓ Completed'}
                    {isWorld ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          dispatchLoadTask(task, 'loadWorldButton');
                        }}
                        style={{
                          marginLeft: '0.5rem',
                          padding: '0.1rem 0.3rem',
                          fontSize: '0.6rem',
                          background: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                        }}
                      >
                        {isFullWorld ? 'Load World' : 'Load Splat'}
                      </button>
                    ) : canLoadMotion ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          dispatchLoadTask(task, 'loadAnimationButton');
                        }}
                        style={{
                          marginLeft: '0.5rem',
                          padding: '0.1rem 0.3rem',
                          fontSize: '0.6rem',
                          background: isViewportFailed ? '#e0a020' : '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                        }}
                        title="Load studio_motion.json and play on the viewport avatar"
                      >
                        Load Animation
                      </button>
                    ) : canUseImage ? (
                      <>
                        <button
                          onClick={(event) => void handleDownloadTaskImage(task, event)}
                          style={{
                            marginLeft: '0.5rem',
                            padding: '0.1rem 0.3rem',
                            fontSize: '0.6rem',
                            background: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                          title="Download generated PNG/WebP"
                        >
                          Download Image
                        </button>
                        <button
                          type="button"
                          onClick={(event) => void handleUseImageForImageTo3d(task, event)}
                          style={{
                            marginLeft: '0.35rem',
                            padding: '0.1rem 0.3rem',
                            fontSize: '0.6rem',
                            background: '#0d6efd',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                          title="Start Image to 3D with this generated image"
                        >
                          Use for Image to 3D
                        </button>
                      </>
                    ) : (
                      (meshUrl || modelUrl || taskJobId) && (
                        <>
                          {(meshUrl || modelUrl) && (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                dispatchLoadTask(task, 'loadModelButton');
                              }}
                              style={{
                                marginLeft: '0.5rem',
                                padding: '0.15rem 0.4rem',
                                fontSize: '0.65rem',
                                background: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                              }}
                            >
                              Load Model
                            </button>
                          )}
                          {(task.type === 'image-to-3d' ||
                            task.type === 'image-to-raw-mesh' ||
                            task.type === 'text-to-3d' ||
                            task.type === 'avatar-from-image') && (
                            <button
                              type="button"
                              onClick={(event) => openCompletedRigPanel(task, event)}
                              style={{
                                marginLeft: '0.35rem',
                                padding: '0.15rem 0.45rem',
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                background: '#0d6efd',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                              }}
                              title="Rig this mesh — only pipelines that fit the model type"
                            >
                              Rig…
                            </button>
                          )}
                        </>
                      )
                    )}
                    {canPublishRp1 && sceneAssemblerReady && (
                      <button
                        onClick={(event) => void handlePublishRp1(task, event)}
                        disabled={!isApiConnected || isPublishing}
                        style={{
                          marginLeft: '0.35rem',
                          padding: '0.1rem 0.3rem',
                          fontSize: '0.6rem',
                          background: '#6f42c1',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: isApiConnected && !isPublishing ? 'pointer' : 'not-allowed',
                          opacity: isApiConnected ? 1 : 0.55,
                        }}
                        title="Publish completed mesh GLB to MSF / RP1 object library and open Scene Assembler"
                      >
                        {isPublishing ? '…' : 'Publish RP1'}
                      </button>
                    )}
                    {!isWorld && !isMotion && !isImage && sceneAssemblerReady && (canPublishRp1 || taskJobId) && (
                      <button
                        onClick={(event) => void handleOpenMetaverseBrowser(event)}
                        style={{
                          marginLeft: '0.35rem',
                          padding: '0.1rem 0.3rem',
                          fontSize: '0.6rem',
                          background: '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                        }}
                        title={`Open Scene Assembler at ${spatialConfig?.msfPublicUrl || 'MSF'}`}
                      >
                        Assembler
                      </button>
                    )}
                  </div>
                  );
                })()}

                {loadPayload &&
                  (task.type === 'text-to-image' || isTextToImageTaskResult(loadPayload)) &&
                  resolveTextToImageDownloadUrl(task) && (
                    <TaskImagePreview
                      url={resolveTextToImageDownloadUrl(task)}
                      apiEndpoint={apiEndpoint}
                    />
                  )}

                {rigPanelTaskId === task.id &&
                  task.status === 'completed' &&
                  (task.type === 'image-to-3d' ||
                    task.type === 'image-to-raw-mesh' ||
                    task.type === 'text-to-3d' ||
                    task.type === 'avatar-from-image') && (
                    <div
                      className="task-completed-rig-panel"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <p className="hint">
                        Pipelines for{' '}
                        <strong>{resolveCarriedObjectName(task) || task.name || 'this mesh'}</strong>
                        — others hidden for this model type.
                      </p>
                      <label htmlFor={`rig-pipeline-${task.id}`}>Rig pipeline</label>
                      <select
                        id={`rig-pipeline-${task.id}`}
                        value={rigPanelPipeline}
                        onChange={(e) => setRigPanelPipeline(e.target.value)}
                      >
                        {recommendedRigPipelinesForTask(task).map((kind) => (
                          <option key={kind} value={kind}>
                            {PIPELINE_LABELS[kind] || kind}
                          </option>
                        ))}
                      </select>
                      {rigPanelPipeline === 'creature' ? (
                        <select
                          value={taskOptions.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID}
                          onChange={(e) =>
                            setTaskOptions((prev) => ({
                              ...prev,
                              creature_template_id: e.target.value,
                            }))
                          }
                          aria-label="Creature template"
                        >
                          {CREATURE_TEMPLATE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <div className="task-completed-rig-actions">
                        <button
                          type="button"
                          className="primary"
                          onClick={(event) =>
                            void handleStartAutoRigFromCompletedTask(task, event, rigPanelPipeline)
                          }
                        >
                          Start Auto Rigging
                        </button>
                        <button
                          type="button"
                          onClick={(event) =>
                            handleUseMeshForAutoRigging(task, event, rigPanelPipeline)
                          }
                          style={{
                            padding: '0.3rem 0.45rem',
                            fontSize: '0.65rem',
                            background: '#1e3a5f',
                            color: '#eee',
                            border: '1px solid #3a4660',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                          title="Load mesh into viewport and open the Auto Rigging form"
                        >
                          Open form…
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setRigPanelTaskId(null);
                          }}
                          style={{
                            padding: '0.3rem 0.45rem',
                            fontSize: '0.65rem',
                            background: '#444',
                            color: '#eee',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                {task.status === 'completed' &&
                  loadPayload &&
                  !isTextToImageTaskResult(loadPayload) &&
                  !isTextToMotionTaskResult(loadPayload) &&
                  !isWorldLayerTaskResult(loadPayload) &&
                  (task.type === 'image-to-3d' ||
                    task.type === 'image-to-raw-mesh' ||
                    task.type === 'text-to-3d' ||
                    task.type === 'avatar-from-image' ||
                    task.type === 'auto-rigging' ||
                    getTaskResultMeshUrl(loadPayload) ||
                    getTaskResultModelUrl(loadPayload)) && (
                    <TaskMeshPreview
                      meshUrl={
                        getTaskResultMeshUrl(loadPayload) || getTaskResultModelUrl(loadPayload)
                      }
                      apiEndpoint={apiEndpoint}
                      autoLoad3d
                    />
                  )}

                {isViewportFailed && viewportFailedMessage ? (
                  <div
                    className="text-xs mt-0.5"
                    style={{ fontSize: '0.6rem', color: '#f88' }}
                    title={viewportFailedMessage}
                  >
                    {viewportFailedMessage}
                  </div>
                ) : null}

                {/* Show task-specific result information */}
                {task.result && task.type === 'mesh-segmentation' && task.result.segments && (
                  <div className="text-xs text-gray-300 mt-0.5" style={{ fontSize: '0.6rem' }}>
                    Segments: {task.result.segments.length} parts detected
                  </div>
                )}

                {task.result && task.type === 'auto-rigging' && task.result.metadata && (
                  <div className="text-xs text-gray-300 mt-0.5" style={{ fontSize: '0.6rem' }}>
                    Bones: {task.result.metadata.boneCount || 'N/A'} | 
                    Animations: {task.result.metadata.animationCount || 'N/A'}
                  </div>
                )}
      </div>
    );
  };

  return (
    <div className="task-manager">
      <div className="card">
        <div className="card-header task-manager-header" ref={cardHeaderRef}>
          <button
            type="button"
            className="expand-icon-button"
            onClick={() => {
              const next = !isExpanded;
              setIsExpanded(next);
              if (next && cardHeaderRef.current) {
                setTimeout(() => {
                  cardHeaderRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'nearest',
                  });
                }, 0);
              }
            }}
            title={isExpanded ? 'Collapse Tasks' : 'Expand Tasks'}
            aria-expanded={isExpanded}
            data-testid="task-manager-expand-btn"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <h3 className="card-title task-manager-title">
            Tasks
            {tasks.length > 0 && (
              <span className="task-manager-count">({tasks.length})</span>
            )}
          </h3>
        </div>

        {isExpanded && (
        <div className="task-manager-body">
            <div className="task-manager-toolbar">
              <button 
                className="btn btn-primary"
                data-testid="task-manager-new-btn"
                onClick={() => {
                  console.log('TaskManager: New Task button clicked');
                  console.log('TaskManager: isApiConnected:', isApiConnected);
                  if (showNewTask) {
                    setShowNewTask(false);
                  } else {
                    openNewTaskForm(newTaskType, lastObjectNameRef.current);
                  }
                }}
                disabled={!canOpenNewTaskForm}
              >
                + New
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleSyncFromDgx}
                disabled={!isApiConnected || isSyncingTasks}
                title="Load recent jobs from DGX Spark and merge with local tasks"
              >
                {isSyncingTasks ? 'Sync…' : 'Sync DGX'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={clearCompletedTasks}
                title="Remove completed tasks from this list"
              >
                Clear done
              </button>
              {currentModel ? (
                <button
                  className="btn btn-secondary"
                  data-testid="task-manager-clear-model-btn"
                  onClick={() => {
                    clearModel();
                    setViewportActiveJobId(null);
                    setViewportLoadingJobId(null);
                    setViewportFailedJobId(null);
                    setViewportFailedMessage(null);
                  }}
                  title="Remove the loaded model from the viewport"
                >
                  Clear
                </button>
              ) : null}
              <button
                className="btn btn-secondary"
                onClick={(event) => void handleOpenMetaverseBrowser(event)}
                title={
                  sceneAssemblerReady
                    ? `Open Scene Assembler at ${spatialConfig?.msfPublicUrl || 'MSF'}`
                    : 'OMB spatial fabric model guidelines (link MSF to open Scene Assembler)'
                }
              >
                {sceneAssemblerReady ? 'Assembler' : 'OMB guide'}
              </button>
            </div>

        {spatialConfig?.msfPublicUrl ? (
          <p style={{ fontSize: '0.55rem', color: '#888', padding: '0 0.75rem 0.35rem', margin: 0 }}>
            Scene Assembler: {spatialConfig.msfPublicUrl}
          </p>
        ) : !sceneAssemblerReady ? (
          <p style={{ fontSize: '0.55rem', color: '#888', padding: '0 0.75rem 0.35rem', margin: 0 }}>
            Scene Assembler: link MSF via API or VITE_MSF_PUBLIC_URL · OMB guide opens model guidelines
          </p>
        ) : null}

        {syncMessage && (
          <div
            style={{
              fontSize: '0.6rem',
              color: syncMessage.includes('Failed') ? '#ff8a8a' : '#8f8',
              padding: '0 0.75rem 0.35rem',
            }}
          >
            {syncMessage}
          </div>
        )}

        {deleteError && (
          <div
            style={{
              fontSize: '0.6rem',
              color: '#ff8a8a',
              padding: '0 0.75rem 0.35rem',
            }}
          >
            {deleteError}
          </div>
        )}

        {!canStartAnyTask && !showNewTask && (
          <div style={{ 
            background: canBrowseCatalog ? '#1a2a3a' : '#fff3cd', 
            color: canBrowseCatalog ? '#9cd' : '#856404', 
            borderRadius: '4px', 
            fontSize: '0.65rem', 
            padding: '0.5rem 0.75rem', 
            margin: '0 0.75rem 0.5rem',
            border: canBrowseCatalog ? '1px solid #345' : '1px solid #ffc107'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
              {canBrowseCatalog ? 'AI catalog preview' : '⚠️ No AI Provider Available'}
            </div>
            <div style={{ fontSize: '0.6rem', lineHeight: '1.4' }}>
              {canBrowseCatalog ? (
                <>
                  Press <strong>+ New</strong> or use <strong>Text-3D</strong> / <strong>Image-3D</strong> to
                  browse supported models. {AI_BACKEND_UNAVAILABLE_MSG}
                </>
              ) : (
                <>
                  Configure DGX API (<code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>VITE_API_ENDPOINT</code>).
                </>
              )}
            </div>
          </div>
        )}

        {showNewTask && !canStartAnyTask && canBrowseCatalog && (
          <div
            style={{
              background: '#1a2a3a',
              color: '#9cd',
              borderRadius: '4px',
              fontSize: '0.6rem',
              padding: '0.45rem 0.75rem',
              margin: '0 0.75rem 0.5rem',
              border: '1px solid #345',
              lineHeight: 1.4,
            }}
          >
            Catalog preview — model list matches a connected DGX deployment. Start is disabled until
            you self-host and connect 3DAIGC-API.
          </div>
        )}

        {!canStartAnyTask && !canBrowseCatalog && !showNewTask && (
          <div style={{ 
            background: '#fff3cd', 
            color: '#856404', 
            borderRadius: '4px', 
            fontSize: '0.65rem', 
            padding: '0.5rem 0.75rem', 
            margin: '0 0.75rem 0.5rem',
            border: '1px solid #ffc107'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
              ⚠️ No AI Provider Available
            </div>
            <div style={{ fontSize: '0.6rem', lineHeight: '1.4' }}>
              Configure DGX API (<code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>VITE_API_ENDPOINT</code>).
            </div>
          </div>
        )}

        {showNewTask && (
          <div
            ref={newTaskFormRef}
            style={{ padding: '0.5rem 1rem', borderTop: '1px solid #444' }}
          >
            <p
              style={{
                fontSize: '0.58rem',
                color: '#888',
                lineHeight: 1.35,
                margin: '0 0 0.5rem 0'
              }}
            >
              Workflows mirror{' '}
              <a
                href="https://github.com/AlfaOmegaGrafx/Open3DStudio"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#6ab7ff' }}
              >
                Open3DStudio
              </a>{' '}
              Workflows use DGX-verified defaults: TRELLIS.2 for image→3D;{' '}
              <strong>SkinTokens</strong> for <em>Auto Rigging → full rig</em>;{' '}
              <strong>UniRig</strong> for <em>Avatar from Image → template avatar</em> (not SkinTokens).
              {isApiConnected
                ? ' Models list updates from the API when connected.'
                : canBrowseCatalog
                  ? ' Showing full supported-model catalog (preview — connect 3DAIGC-API to run).'
                  : ''}
            </p>
            {(newTaskType === 'image-to-3d' || newTaskType === 'auto-rigging') && (
              <p style={{ fontSize: '0.55rem', color: '#8f8', margin: '0 0 0.5rem', lineHeight: 1.35 }}>
                Recommended: {PREFERRED_PIPELINES.avatarCharacter.steps.join(' → ')}
              </p>
            )}
            {isBodyClothStudioTaskType(newTaskType) && (
              <p
                style={{
                  fontSize: '0.6rem',
                  color: '#8f8',
                  margin: '0 0 0.5rem',
                  lineHeight: 1.35,
                }}
              >
                Thin wrapper: pick head track below, then <strong>Open Studio</strong> — Body+Cloth
                with Face selfie, likeness, and body skin tone. Not a separate API pipeline. Steps:{' '}
                {PREFERRED_PIPELINES.bodyClothStudio.steps.join(' → ')}.
              </p>
            )}
            {isArc2AvatarTaskType(newTaskType) && (
              <p
                style={{
                  fontSize: '0.6rem',
                  color: '#c9a227',
                  margin: '0 0 0.5rem',
                  lineHeight: 1.35,
                }}
              >
                Same humanoid <strong>head track</strong> as Body+Cloth / GNM+MeshMonk — Arc2Avatar
                engine only (selfie → FLAME 3DGS <code>.ply</code>). Prefer{' '}
                <em>Head track · Body+Cloth (Studio)</em> for the full path. Status:{' '}
                <code>/api/v1/arc2avatar/status</code>. Pipeline:{' '}
                {PREFERRED_PIPELINES.arc2AvatarHead.steps.join(' → ')}.
              </p>
            )}
            {newTaskType === 'avatar-from-image' && (
              <p style={{ fontSize: '0.55rem', color: '#8f8', margin: '0 0 0.5rem', lineHeight: 1.35 }}>
                Pipeline: {PREFERRED_PIPELINES.avatarFromImage.steps.join(' → ')}
              </p>
            )}
            {newTaskType === 'image-to-world' && (
              <p style={{ fontSize: '0.55rem', color: '#8f8', margin: '0 0 0.5rem', lineHeight: 1.35 }}>
                Pipeline: {PREFERRED_PIPELINES.explorableWorld.steps.join(' → ')}
              </p>
            )}
            {newTaskType === 'environment-scan' && (
              <p style={{ fontSize: '0.55rem', color: '#8f8', margin: '0 0 0.5rem', lineHeight: 1.35 }}>
                Pipeline: {PREFERRED_PIPELINES.physicalReplicaScan.steps.join(' → ')} (1:1 meters)
              </p>
            )}
            {newTaskType === 'text-to-image' && (
              <p style={{ fontSize: '0.55rem', color: '#8f8', margin: '0 0 0.5rem', lineHeight: 1.35 }}>
                Pipeline: {PREFERRED_PIPELINES.textToImageTo3d.steps.join(' → ')} (local Krea 2 Turbo, ~6–8 min on GB10)
              </p>
            )}
            <form onSubmit={handleSubmitTask}>
              <div className="mb-1.5">
                <select 
                  value={newTaskType} 
                  onChange={(e) => setNewTaskType(e.target.value)}
                  className="input w-full"
                  style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                >
                  <option value="text-to-3d">Text to 3D</option>
                  <option value="text-to-image">Text to Image</option>
                  <option value="image-to-3d">Image to 3D (textured mesh)</option>
                  <option value="image-to-raw-mesh">Image to Raw Mesh</option>
                  <option value="image-to-splat">Image to Gaussian Splat</option>
                  <option value="image-to-world">Image to World (splat + props)</option>
                  <option value="environment-scan">Environment scan (walk → 1:1 twin)</option>
                  <option value="avatar-from-image">Avatar from Image</option>
                  <option value={BODY_CLOTH_STUDIO_TASK_TYPE}>
                    Head track · Body+Cloth (Studio)
                  </option>
                  <option value={ARC2AVATAR_TASK_TYPE}>
                    Head track · Arc2Avatar (Body+Cloth)
                  </option>
                  <option value="mesh-painting-text">Mesh painting (text)</option>
                  <option value="mesh-painting">Mesh painting (image)</option>
                  <option value="mesh-segmentation">Mesh Segmentation</option>
                  <option value="mesh-retopology">Mesh Retopology</option>
                  <option value="mesh-uv-unwrapping">Mesh UV Unwrapping</option>
                  <option value="mesh-editing-text">Mesh editing (text)</option>
                  <option value="mesh-editing-image">Mesh editing (image)</option>
                  <option value="auto-rigging">Auto Rigging</option>
                </select>
              </div>

              {isBodyClothStudioTaskType(newTaskType) && (
                <div className="mb-1.5">
                  <label
                    style={{
                      fontSize: '0.65rem',
                      marginBottom: '0.25rem',
                      display: 'block',
                      color: '#ccc',
                    }}
                  >
                    Head track engine:
                  </label>
                  <select
                    value={normalizeHeadTrack(taskOptions.head_track)}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({
                        ...prev,
                        head_track: normalizeHeadTrack(e.target.value),
                      }))
                    }
                    className="input w-full"
                    data-testid="body-cloth-head-track-select"
                    style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  >
                    {HEAD_TRACK_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id} title={opt.title}>
                        {opt.label}
                        {opt.id === HEAD_TRACK.MESHMONK
                          ? ' — morph head + XR blendshapes'
                          : opt.id === HEAD_TRACK.ARC2AVATAR
                            ? ' — photoreal splat (needs selfie)'
                            : ' — morph head + Arc2Avatar overlay'}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.55rem', color: '#888', margin: '0.25rem 0 0' }}>
                    Same engines as Studio Image options → Head track. Open Studio applies this
                    choice and continues the Body+Cloth flow there.
                  </p>
                </div>
              )}

              <div className="mb-1.5">
                <label
                  htmlFor="task-object-name-input"
                  style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}
                >
                  Object name <span style={{ color: '#f88' }}>*</span>
                </label>
                <input
                  ref={objectNameInputRef}
                  id="task-object-name-input"
                  type="text"
                  className="input w-full"
                  value={newObjectName}
                  onChange={(e) => {
                    objectNameTouchedRef.current = true;
                    setNewObjectName(e.target.value);
                  }}
                  placeholder={objectNamePlaceholder}
                  required
                  maxLength={64}
                  data-testid="task-object-name-input"
                  style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  autoComplete="off"
                />
                <p style={{ fontSize: '0.55rem', color: '#888', margin: '0.25rem 0 0' }}>
                  Required before starting. Auto-fills from the uploaded image filename and
                  carries across chained tasks (Use for Image to 3D / Auto Rigging). Edit anytime
                  to override.
                </p>
              </div>

              {isApiConnected &&
                newTaskType !== 'avatar-from-image' &&
                !isBodyClothStudioTaskType(newTaskType) && (
                <TaskAdvancedOptions
                  apiEndpoint={apiEndpoint}
                  modelId={newTaskModel}
                  taskType={newTaskType}
                  value={taskOptions}
                  onChange={setTaskOptions}
                />
              )}

              {/* Show model requirement warning */}
              {requiresModel(newTaskType) && !currentModel && (
                <div className="mb-1.5" style={{ 
                  background: '#fff3cd', 
                  color: '#856404', 
                  borderRadius: '4px', 
                  padding: '0.5rem', 
                  fontSize: '0.65rem' 
                }}>
                  ⚠️ A 3D model must be loaded in the viewport to use this feature.
                </div>
              )}

              {/* Show model loaded confirmation */}
              {requiresModel(newTaskType) && currentModel && (
                <div className="mb-1.5" style={{ 
                  background: '#d4edda', 
                  color: '#155724', 
                  borderRadius: '4px', 
                  padding: '0.5rem', 
                  fontSize: '0.65rem' 
                }}>
                  ✓ Model loaded. Ready to process.
                </div>
              )}

              {(getModelsForTaskType(newTaskType).length > 0 ||
                newTaskType === 'avatar-from-image') && (
                <div className="mb-1.5">
                  {newTaskType === 'auto-rigging' && (
                    <div className="mb-1.5">
                      <label
                        style={{
                          fontSize: '0.65rem',
                          marginBottom: '0.25rem',
                          display: 'block',
                          color: '#ccc',
                        }}
                      >
                        Rig pipeline:
                      </label>
                      <select
                        value={
                          taskOptions.rig_mode === AUTO_RIG_MODES.CREATURE_TEMPLATE
                            ? 'creature'
                            : taskOptions.rig_mode === AUTO_RIG_MODES.APPEARANCE_COMPONENT
                              ? 'appearance'
                              : taskOptions.rig_mode === AUTO_RIG_MODES.TEMPLATE ||
                                  taskOptions.rig_mode === AUTO_RIG_MODES.TEMPLATE_WRAP
                                ? 'template'
                                : 'skintokens'
                        }
                        onChange={(e) => handleAutoRigPipelineKind(e.target.value)}
                        className="input w-full"
                        data-testid="auto-rig-pipeline-select"
                        style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                      >
                        <option value="skintokens">
                          SkinTokens — biped / character (Eagle Knight, humans)
                        </option>
                        <option value="appearance">
                          Appearance clothing — fit to avatar slot (Joggers, Shirt, Boots…)
                        </option>
                        <option value="creature">
                          Creature template — fox / quadruped (Mesh2Motion)
                        </option>
                        <option value="template">
                          UniRig template avatar fit — Blender humanoid (not UniRig ML / full)
                        </option>
                      </select>
                      <p style={{ fontSize: '0.55rem', color: '#8f8', margin: '0.25rem 0 0' }}>
                        {inferAutoRigPipelineKind({ objectName: newObjectName }) === 'appearance'
                          ? 'Detected clothing name → Appearance slot fit (not SkinTokens).'
                          : inferAutoRigPipelineKind({ objectName: newObjectName }) === 'creature'
                            ? 'Detected creature-like name → fox pipeline selected.'
                            : inferAutoRigPipelineKind({ objectName: newObjectName }) === 'template'
                              ? 'Detected template/UniRig hint → UniRig pipeline selected.'
                              : 'Tip: name the object “Joggers” or “Fox” to auto-select the right pipeline.'}
                      </p>
                      {(taskOptions.rig_mode === AUTO_RIG_MODES.TEMPLATE ||
                        taskOptions.rig_mode === AUTO_RIG_MODES.TEMPLATE_WRAP) && (
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.35rem',
                            marginTop: '0.4rem',
                            fontSize: '0.6rem',
                            color: '#ccc',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={taskOptions.rig_mode === AUTO_RIG_MODES.TEMPLATE_WRAP}
                            data-testid="auto-rig-template-wrap-checkbox"
                            onChange={(e) => {
                              const next = e.target.checked
                                ? AUTO_RIG_MODES.TEMPLATE_WRAP
                                : AUTO_RIG_MODES.TEMPLATE;
                              setTaskOptions((prev) => ({
                                ...prev,
                                rig_mode: next,
                                humanoid_template_id:
                                  prev.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID,
                                output_format: 'glb',
                              }));
                              setNewTaskModel(TEMPLATE_RIG_MODEL_ID);
                            }}
                          />
                          <span>
                            XR face morphs (Phase 5 head stitch) — keep{' '}
                            template avatar head blend shapes + AIGC body. Humanoid only;
                            not for creatures/SkinTokens.
                          </span>
                        </label>
                      )}
                      {taskOptions.rig_mode === AUTO_RIG_MODES.CREATURE_TEMPLATE && (
                        <div style={{ marginTop: '0.35rem' }}>
                          <label
                            style={{
                              fontSize: '0.6rem',
                              color: '#aaa',
                              display: 'block',
                              marginBottom: '0.15rem',
                            }}
                          >
                            Creature template
                          </label>
                          <select
                            className="input w-full"
                            value={taskOptions.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID}
                            onChange={(e) =>
                              setTaskOptions((prev) => ({
                                ...prev,
                                creature_template_id: e.target.value,
                              }))
                            }
                            style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                          >
                            {CREATURE_TEMPLATE_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                  <label style={{ fontSize: '0.65rem', marginBottom: '0.25rem', display: 'block', color: '#ccc' }}>
                    {newTaskType === 'avatar-from-image' ? 'Mesh model (image → 3D):' : 'Model:'}
                  </label>
                  <select
                    value={newTaskModel}
                    onChange={(e) => {
                      if (newTaskType === 'auto-rigging') {
                        handleAutoRigModelChange(e.target.value);
                      } else {
                        setNewTaskModel(e.target.value);
                      }
                    }}
                    className="input w-full"
                    style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  >
                    {(newTaskType === 'avatar-from-image'
                      ? getModelsForTaskType('image-to-3d')
                      : newTaskType === 'auto-rigging'
                        ? getAutoRigModelsForRigMode(
                            taskOptions.rig_mode ?? getDefaultRigModeForTaskType('auto-rigging'),
                          )
                        : getModelsForTaskType(newTaskType)
                    ).map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newTaskType === 'mesh-retopology' && (
                <div className="mb-1.5">
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem', color: '#ccc' }}>
                    Target triangles (decimate / face budget)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    max={PIPELINE_MESH_DECIMATION_MAX}
                    step={1000}
                    value={
                      taskOptions.target_face_count ??
                      taskOptions.model_parameters?.target_face_count ??
                      PIPELINE_MESH_DECIMATION_TARGET
                    }
                    onChange={(e) => {
                      const n = Number(e.target.value) || PIPELINE_MESH_DECIMATION_TARGET;
                      setTaskOptions((prev) => ({
                        ...prev,
                        target_face_count: n,
                        output_format: prev.output_format || 'glb',
                        model_parameters: {
                          ...(prev.model_parameters || {}),
                          target_face_count: n,
                        },
                      }));
                    }}
                    className="input w-full"
                    style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  />
                  <p style={{ fontSize: '0.55rem', color: '#888', margin: '0.25rem 0 0' }}>
                    Default {PIPELINE_MESH_DECIMATION_TARGET.toLocaleString()} triangles (API cap).
                    Use <strong>Mesh Decimate</strong> for characters — Instant Meshes leaves holes and
                    strips textures.
                  </p>
                </div>
              )}

              {newTaskType === 'mesh-segmentation' && (
                <div className="mb-1.5">
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem', color: '#ccc' }}>
                    Target part count
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={32}
                    className="input w-full"
                    value={taskOptions.num_parts}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({ ...prev, num_parts: Number(e.target.value) || 8 }))
                    }
                    style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  />
                </div>
              )}

              {(newTaskType === 'mesh-editing-text' || newTaskType === 'mesh-editing-image') && (
                <div className="mb-1.5" style={{ fontSize: '0.6rem', color: '#aaa' }}>
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                    Source prompt (original region)
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    value={taskOptions.source_prompt}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({ ...prev, source_prompt: e.target.value }))
                    }
                    placeholder="wooden chair leg"
                    style={{ padding: '0.375rem', fontSize: '0.65rem', marginBottom: '0.5rem' }}
                  />
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                    Target prompt (desired edit)
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    value={taskOptions.target_prompt}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({ ...prev, target_prompt: e.target.value }))
                    }
                    placeholder="metal chair leg"
                    style={{ padding: '0.375rem', fontSize: '0.65rem', marginBottom: '0.5rem' }}
                  />
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                    3D mask bbox center (x, y, z)
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    value={taskOptions.mask_bbox_center}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({ ...prev, mask_bbox_center: e.target.value }))
                    }
                    style={{ padding: '0.375rem', fontSize: '0.65rem', marginBottom: '0.5rem', fontFamily: 'monospace' }}
                  />
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                    3D mask bbox dimensions (w, h, d)
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    value={taskOptions.mask_bbox_dimensions}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({ ...prev, mask_bbox_dimensions: e.target.value }))
                    }
                    style={{ padding: '0.375rem', fontSize: '0.65rem', fontFamily: 'monospace' }}
                  />
                </div>
              )}

              {newTaskType === 'image-to-world' && (
                <div className="mb-1.5" style={{ fontSize: '0.6rem', color: '#aaa' }}>
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                    Prop mesh model (TRELLIS.2 for interactable props)
                  </label>
                  <select
                    className="input w-full"
                    value={taskOptions.prop_mesh_model_preference}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({
                        ...prev,
                        prop_mesh_model_preference: e.target.value,
                      }))
                    }
                    style={{ padding: '0.375rem', fontSize: '0.65rem', marginBottom: '0.5rem' }}
                  >
                    {getPropMeshModelsForWorld().map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                    Prop regions JSON (optional)
                  </label>
                  <textarea
                    className="input w-full"
                    rows={3}
                    value={taskOptions.prop_regions_json}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({ ...prev, prop_regions_json: e.target.value }))
                    }
                    placeholder={'[{"id":"lamp","bbox":[0.1,0.2,0.25,0.35]}]'}
                    style={{ padding: '0.375rem', fontSize: '0.6rem', fontFamily: 'monospace' }}
                  />
                  <p style={{ fontSize: '0.55rem', color: '#888', margin: '0.25rem 0 0' }}>
                    Pipeline: photo → TripoSplat env (.ply) → optional TRELLIS.2 props. Avatar stays
                    loaded; world goes on a separate layer.
                  </p>
                </div>
              )}

              {newTaskType === 'environment-scan' && (
                <div className="mb-1.5" style={{ fontSize: '0.6rem', color: '#aaa' }}>
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                    1:1 metric calibration
                  </label>
                  <select
                    className="input w-full"
                    value={taskOptions.metric_mode || 'reference_length'}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({
                        ...prev,
                        metric_mode: e.target.value,
                        // Office door lock: reference_length → horizontal axis.
                        metric_axis:
                          e.target.value === 'reference_length'
                            ? 'horizontal'
                            : e.target.value === 'player_height'
                              ? 'uniform'
                              : prev.metric_axis || 'horizontal',
                        metric_true_meters:
                          e.target.value === 'reference_length' && !prev.metric_true_meters
                            ? '0.762'
                            : prev.metric_true_meters,
                        metric_recon_length:
                          e.target.value === 'reference_length' && !prev.metric_recon_length
                            ? '0.47'
                            : prev.metric_recon_length,
                      }))
                    }
                    style={{ padding: '0.375rem', fontSize: '0.65rem', marginBottom: '0.5rem' }}
                    data-testid="environment-scan-metric-mode"
                  >
                    <option value="reference_length">
                      Reference length — Office door lock (0.762 m / 0.47 recon, horizontal)
                    </option>
                    <option value="auto_bbox">
                      Auto bbox — true_meters = real room span (diagonal / longest wall)
                    </option>
                    <option value="player_height">
                      Player height — true_meters ≈ avatar height, recon_length = height in recon
                    </option>
                  </select>
                  {(taskOptions.metric_mode || 'reference_length') === 'reference_length' ? (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        marginBottom: '0.5rem',
                        fontSize: '0.6rem',
                      }}
                    >
                      <span>Scale axis</span>
                      <select
                        className="input"
                        value={taskOptions.metric_axis || 'horizontal'}
                        onChange={(e) =>
                          setTaskOptions((prev) => ({ ...prev, metric_axis: e.target.value }))
                        }
                        style={{ padding: '0.25rem', fontSize: '0.6rem', flex: 1 }}
                        title="Door width must stay horizontal — do not stretch room height"
                      >
                        <option value="horizontal">horizontal (XZ only — locked Office door)</option>
                        <option value="uniform">uniform (XYZ — only if measuring full height span)</option>
                      </select>
                    </label>
                  ) : null}
                  <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                    True length (meters) <span style={{ color: '#f88' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    inputMode="decimal"
                    className="input w-full"
                    value={taskOptions.metric_true_meters}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({ ...prev, metric_true_meters: e.target.value }))
                    }
                    placeholder={
                      taskOptions.metric_mode === 'auto_bbox'
                        ? 'e.g. 4.2 (room diagonal / longest wall in meters)'
                        : taskOptions.metric_mode === 'player_height'
                          ? 'e.g. 1.6 (avatar / eye height in meters)'
                          : 'e.g. 0.762 (30 in door) or 0.9 (wall segment)'
                    }
                    title={
                      taskOptions.metric_mode === 'auto_bbox'
                        ? 'Auto bbox: enter the REAL room span (meters), not a door width'
                        : 'Millimeter precision OK — 30 in door = 0.762 m (use reference_length)'
                    }
                    data-testid="environment-scan-true-meters"
                    style={{ padding: '0.375rem', fontSize: '0.65rem', marginBottom: '0.5rem' }}
                  />
                  {(taskOptions.metric_mode === 'reference_length' ||
                    taskOptions.metric_mode === 'player_height') && (
                    <>
                      <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                        Same length in reconstruction units
                      </label>
                      <input
                        type="number"
                        min={0.0001}
                        step="any"
                        inputMode="decimal"
                        className="input w-full"
                        value={taskOptions.metric_recon_length}
                        onChange={(e) =>
                          setTaskOptions((prev) => ({
                            ...prev,
                            metric_recon_length: e.target.value,
                          }))
                        }
                        placeholder="Same feature in recon units (Office door ≈ 0.47)"
                        title="Use reference_length mode for door width; not player_height"
                        style={{ padding: '0.375rem', fontSize: '0.65rem', marginBottom: '0.5rem' }}
                      />
                    </>
                  )}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      marginTop: '0.5rem',
                      fontSize: '0.65rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(taskOptions.refine_to_3dgs)}
                      onChange={(e) =>
                        setTaskOptions((prev) => ({
                          ...prev,
                          refine_to_3dgs: e.target.checked,
                        }))
                      }
                      data-testid="environment-scan-refine-3dgs"
                    />
                    Refine to 3DGS (Phase A — Spark Gaussians from points)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(taskOptions.train_3dgs)}
                      onChange={(e) =>
                        setTaskOptions((prev) => ({
                          ...prev,
                          train_3dgs: e.target.checked,
                          refine_to_3dgs: e.target.checked ? true : prev.refine_to_3dgs,
                        }))
                      }
                      data-testid="environment-scan-train-3dgs"
                    />
                    Train 3DGS (Phase B — gsplat, sharper; long job)
                  </label>
                  {Boolean(taskOptions.train_3dgs) && (
                    <label style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.55rem', color: '#aaa' }}>
                      Steps
                      <input
                        type="number"
                        min={100}
                        max={50000}
                        step={500}
                        value={Number(taskOptions.train_3dgs_steps) || 7000}
                        onChange={(e) =>
                          setTaskOptions((prev) => ({
                            ...prev,
                            train_3dgs_steps: Number(e.target.value) || 7000,
                          }))
                        }
                        data-testid="environment-scan-train-3dgs-steps"
                        style={{ marginLeft: '0.35rem', width: '5rem', fontSize: '0.55rem' }}
                      />
                    </label>
                  )}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      marginTop: '0.35rem',
                      fontSize: '0.65rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(taskOptions.bake_env_mesh)}
                      onChange={(e) =>
                        setTaskOptions((prev) => ({
                          ...prev,
                          bake_env_mesh: e.target.checked,
                          refine_to_3dgs: e.target.checked ? true : prev.refine_to_3dgs,
                        }))
                      }
                      data-testid="environment-scan-bake-env-mesh"
                    />
                    Bake env mesh GLB for OMB/RP1 (after Phase A/B)
                  </label>
                  <p style={{ fontSize: '0.55rem', color: '#888', margin: '0.25rem 0 0' }}>
                    Best 1:1: tape a door/wall, use reference_length with recon points. auto_bbox is
                    approximate. Phase A is fast isotropic Gaussians; Phase B gsplat train is
                    photometric (sharper) and can take a long time on a full walk. Bake writes
                    environment_mesh.glb for Scene Assembler (Spark splat stays viewport-only).
                    Image-to-World RP1 still uses TRELLIS props only — TripoSplat has no cameras
                    for TSDF bake. Docs: LINGBOT_MAP_ENVIRONMENT_SCAN.md.
                  </p>
                </div>
              )}

              {newTaskType === 'avatar-from-image' && (
                <div className="mb-1.5" style={{ fontSize: '0.6rem', color: '#aaa' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(taskOptions.include_splat_preview)}
                      onChange={(e) =>
                        setTaskOptions((prev) => ({
                          ...prev,
                          include_splat_preview: e.target.checked,
                        }))
                      }
                    />
                    Also generate Gaussian splat preview (TripoSplat → Spark.js)
                  </label>
                  <p style={{ fontSize: '0.55rem', color: '#888', margin: '0.25rem 0 0' }}>
                    Pipeline: photo → TRELLIS mesh → template avatar wrap. Optional splat loads
                    in parallel when ready.
                  </p>
                </div>
              )}

              {/* Prompt input - optional for model-based tasks */}
              {!requiresModel(newTaskType) &&
                newTaskType !== 'avatar-from-image' &&
                !isBodyClothStudioTaskType(newTaskType) &&
                newTaskType !== 'image-to-world' &&
                newTaskType !== 'environment-scan' && (
                <div className="mb-1.5">
                  {newTaskType === 'text-to-image' && (
                    <TextToImagePromptOptions
                      value={taskOptions.text_to_image_prompt_options}
                      basePrompt={newTaskPrompt}
                      onChange={(next) =>
                        setTaskOptions((prev) => ({
                          ...prev,
                          text_to_image_prompt_options: next,
                        }))
                      }
                    />
                  )}
                  <textarea
                    value={newTaskPrompt}
                    onChange={(e) => setNewTaskPrompt(e.target.value)}
                    className="input w-full"
                    rows="2"
                    placeholder="Describe what you want to generate..."
                    required={requiresPrompt(newTaskType)}
                    data-testid="task-prompt-input"
                    style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  />
                </div>
              )}

              {/* Optional prompt for model-based tasks */}
              {requiresModel(newTaskType) && (
                <div className="mb-1.5">
                  <textarea
                    value={newTaskPrompt}
                    onChange={(e) => setNewTaskPrompt(e.target.value)}
                    className="input w-full"
                    rows="2"
                    placeholder="Optional: Add description or instructions..."
                    style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  />
                </div>
              )}

              {(newTaskType === 'image-to-3d' ||
                newTaskType === 'image-to-raw-mesh' ||
                newTaskType === 'image-to-splat' ||
                newTaskType === 'image-to-world' ||
                newTaskType === 'environment-scan' ||
                newTaskType === 'avatar-from-image' ||
                isArc2AvatarTaskType(newTaskType) ||
                newTaskType === 'mesh-painting' ||
                newTaskType === 'mesh-editing-image') && (
                <div className="mb-1.5">
                  <label style={{ fontSize: '0.65rem', marginBottom: '0.25rem', display: 'block' }}>
                    {newTaskType === 'image-to-3d'
                      ? 'Upload Image:'
                      : newTaskType === 'image-to-raw-mesh'
                        ? 'Upload Image (raw mesh):'
                      : newTaskType === 'image-to-splat'
                        ? 'Upload photo(s) (1 → TripoSplat, 2+ → WorldMirror):'
                        : newTaskType === 'image-to-world'
                          ? 'Upload Reference Image:'
                        : newTaskType === 'environment-scan'
                          ? 'Upload walk video or ≥3 frames:'
                        : newTaskType === 'avatar-from-image'
                          ? 'Upload Photo (avatar pipeline):'
                          : isArc2AvatarTaskType(newTaskType)
                            ? 'Upload face selfie (Arc2Avatar head — not a full-body shot):'
                          : newTaskType === 'mesh-painting' || newTaskType === 'mesh-editing-image'
                        ? 'Upload Reference Image:'
                        : 'Upload Face Photo:'}
                  </label>
                  <input
                    ref={fileInputRef}
                    id="task-image-file-input"
                    type="file"
                    accept={
                      newTaskType === 'environment-scan'
                        ? 'video/*,image/*,.mp4,.webm,.mov,.mkv,.avi,.m4v'
                        : 'image/*'
                    }
                    multiple={supportsMultiImageInput(newTaskType)}
                    data-testid="task-image-file-input"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={handleFileButtonClick}
                    className="btn btn-secondary"
                    style={{ 
                      width: '100%', 
                      padding: '0.375rem', 
                      fontSize: '0.65rem',
                      marginBottom: '0.25rem'
                    }}
                  >
                    {newTaskImage
                      ? supportsMultiImageInput(newTaskType) && newTaskImages.length > 1
                        ? `${newTaskImages.length} photos selected`
                        : `Change File (${newTaskImage.name})`
                      : supportsMultiImageInput(newTaskType)
                        ? 'Choose photo(s)'
                        : 'Choose File'}
                  </button>
                  {supportsMultiImageInput(newTaskType) && (
                    <div style={{ fontSize: '0.58rem', color: '#9ab', marginTop: '0.25rem' }}>
                      {multiImageUploadHint(newTaskType)}
                    </div>
                  )}
                  {supportsMultiImageInput(newTaskType) && newTaskImages.length > 1 && (
                    <>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontSize: '0.58rem',
                          color: '#9ab',
                          marginTop: '0.35rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={taskOptions.use_multiview_mesh !== false}
                          onChange={(e) =>
                            setTaskOptions((prev) => ({
                              ...prev,
                              use_multiview_mesh: e.target.checked,
                            }))
                          }
                        />
                        Use all photos for mesh (TRELLIS multiview)
                      </label>
                      <div
                        style={{
                          marginTop: '0.35rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.2rem',
                        }}
                      >
                        {newTaskImages.map((file, index) => (
                          <button
                            key={`${file.name}-${index}`}
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleSetPrimaryImage(index)}
                            style={{
                              fontSize: '0.58rem',
                              padding: '0.2rem 0.35rem',
                              textAlign: 'left',
                              borderColor: index === primaryImageIndex ? '#6af' : undefined,
                            }}
                          >
                            {index === primaryImageIndex ? '★ Primary: ' : 'Set primary: '}
                            {file.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {newTaskImage && (!supportsMultiImageInput(newTaskType) || newTaskImages.length <= 1) && (
                    <div style={{ fontSize: '0.6rem', color: '#888', marginTop: '0.25rem' }}>
                      Selected: {newTaskImage.name}
                    </div>
                  )}
                  {newTaskType === 'mesh-editing-image' && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <label style={{ fontSize: '0.65rem', display: 'block', marginBottom: '0.25rem' }}>
                        Source image (optional — defaults to target)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setMeshEditSourceImage(e.target.files?.[0] || null)}
                        style={{ fontSize: '0.6rem', width: '100%' }}
                      />
                      <label style={{ fontSize: '0.65rem', display: 'block', margin: '0.5rem 0 0.25rem' }}>
                        2D mask image (required)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setMeshEditMaskImage(e.target.files?.[0] || null)}
                        style={{ fontSize: '0.6rem', width: '100%' }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-1 mt-1.5">
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="task-start-btn"
                  disabled={
                    isBodyClothStudioTaskType(newTaskType)
                      ? false
                      : !canSubmitNewTask || !canStartAnyTask
                  }
                  title={
                    isBodyClothStudioTaskType(newTaskType)
                      ? `Open Studio Body+Cloth (head track: ${normalizeHeadTrack(taskOptions.head_track)})`
                      : !canStartAnyTask
                        ? canBrowseCatalog
                          ? AI_BACKEND_UNAVAILABLE_MSG
                          : 'Connect DGX API to start'
                        : canSubmitNewTask
                          ? 'Start generation'
                          : 'Enter an object name first'
                  }
                  onClick={() => console.log('TaskManager: Submit button clicked')}
                  style={{ flex: 1 }}
                >
                  {isBodyClothStudioTaskType(newTaskType) ? 'Open Studio' : 'Start'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewTask(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="task-manager-lists">
          {tasks.length === 0 ? (
            <p className="task-list-empty">No tasks yet</p>
          ) : (
            <>
              {activeTasks.length > 0 ? (
                <div className="task-list task-list--active">
                  {activeTasks.map((task) => renderTaskItem(task))}
                </div>
              ) : null}
              <div className="task-completed-panel">
                <div className="task-completed-header">
                  <button
                    type="button"
                    className="expand-icon-button"
                    onClick={() => setIsCompletedExpanded((prev) => !prev)}
                    title={isCompletedExpanded ? 'Collapse completed tasks' : 'Expand completed tasks'}
                    aria-expanded={isCompletedExpanded}
                    data-testid="task-completed-expand-btn"
                  >
                    {isCompletedExpanded ? '▼' : '▶'}
                  </button>
                  <span className="task-completed-title">Completed</span>
                  <span className="task-completed-count">({completedTasks.length})</span>
                </div>
                {isCompletedExpanded ? (
                  <div className="task-completed-scroll">
                    {completedTasks.length === 0 ? (
                      <p className="task-list-empty task-list-empty--inset">No completed tasks</p>
                    ) : (
                      completedTasks.map((task) => renderTaskItem(task))
                    )}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default TaskManager;
