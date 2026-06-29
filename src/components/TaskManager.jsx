import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTask } from '../context/TaskContext';
import { useScene } from '../context/SceneContext';
import avatarSdkService from '../services/avatarSdkService.js';
import { ensureAbsoluteUrl, get3daigcAuthHeaders } from '../library/taskManager';
import {
  ALL_MODELS,
  TASK_TYPE_TO_FEATURE,
  getDefaultAutoRigOutputFormat,
  getDefaultModelForFeature,
  getDefaultRigModeForTaskType,
  getModelLabel,
  getModelsForTaskType as getCatalogModelsForTaskType,
  getPropMeshModelsForWorld,
  PREFERRED_PIPELINES,
  resolveAutoRigModelForTask,
  resolveMeshModelForAvatarFromImage,
  resolveSplatModelForPhotos,
} from '../library/aiModelsCatalog.js';
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
} from '../library/taskModelUrl.js';
import {
  getWorldManifestUrlFromTaskResult,
  isFullWorldPackageTaskResult,
  isSplatEnvironmentTaskResult,
  isWorldLayerTaskResult,
} from '../library/worldPackage.js';
import { formatTaskDurationMs, getTaskElapsedMs, resolveTaskJobId } from '../library/taskPersistence.js';
import { useSpatialFabric } from '../hooks/useSpatialFabric.js';
import { canPublishTaskToSpatialFabric, getSyncSceneAssemblerUrl, preopenSpatialFabricTab } from '../library/spatialFabricAdapter.js';
import {
  normalizeObjectName,
  objectNameFromFilename,
  slugifyObjectName,
} from '../library/objectNameUtils.js';
import {
  AI_BACKEND_UNAVAILABLE_MSG,
  canBrowseAiTaskCatalog,
  OPEN_TASK_CATALOG_EVENT,
} from '../library/runtimeUi.js';
import {
  AUTO_RIG_MODES,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  TEMPLATE_RIG_MODEL_ID,
} from '../library/avatarPipelineCatalog.js';
import {
  DEFAULT_CREATURE_TEMPLATE_ID,
} from '../library/creaturePipelineCatalog.js';
import {
  MAX_TOTAL_IMAGES,
  multiImageUploadHint,
  splitPrimaryAndReferenceFiles,
  supportsMultiImageInput,
} from '../library/multiImageInput.js';
import TaskAdvancedOptions from './TaskAdvancedOptions.jsx';
import './TaskManager.css';

export { ALL_MODELS, TASK_TYPE_TO_FEATURE };

/** Authenticated thumbnail for completed text-to-image jobs. */
function TaskImageThumbnail({ url, apiEndpoint }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!url) {
      setSrc(null);
      return undefined;
    }
    const abs = resolveTaskModelUrl(url, apiEndpoint);
    let cancelled = false;
    let objectUrl = null;
    fetch(abs, { headers: get3daigcAuthHeaders() })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, apiEndpoint]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt="Generated"
      style={{
        display: 'block',
        maxWidth: '100%',
        maxHeight: '120px',
        marginTop: '0.35rem',
        borderRadius: '4px',
        border: '1px solid #444',
      }}
    />
  );
}

const TaskManager = ({ tasks, onAITask, isApiConnected }) => {
  console.log('TaskManager: Component rendered with props:', { 
    tasksLength: tasks?.length, 
    onAITask: !!onAITask, 
    isApiConnected 
  });
  
  const [viewportLoadingJobId, setViewportLoadingJobId] = useState(null);
  const [viewportActiveJobId, setViewportActiveJobId] = useState(null);
  const [viewportFailedJobId, setViewportFailedJobId] = useState(null);
  const [viewportFailedMessage, setViewportFailedMessage] = useState(null);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskType, setNewTaskType] = useState('text-to-3d');
  const [newObjectName, setNewObjectName] = useState('');
  const [newTaskPrompt, setNewTaskPrompt] = useState('');
  const [newTaskImage, setNewTaskImage] = useState(null);
  const [newTaskImages, setNewTaskImages] = useState([]);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [newTaskModel, setNewTaskModel] = useState(() => getDefaultModelForFeature('text-to-3d'));
  const [taskOptions, setTaskOptions] = useState({
    texture_resolution: 1024,
    output_format: 'glb',
    mesh_simplify: 0.95,
    rig_mode: AUTO_RIG_MODES.FULL,
    humanoid_template_id: DEFAULT_HUMANOID_TEMPLATE_ID,
    creature_template_id: DEFAULT_CREATURE_TEMPLATE_ID,
    include_splat_preview: false,
    use_multiview_mesh: true,
    prop_regions_json: '',
    world_name: '',
    prop_mesh_model_preference: 'trellis2_image_to_textured_mesh',
    image_width: 1024,
    image_height: 1024,
    num_parts: 8,
    source_prompt: '',
    target_prompt: '',
    mask_bbox_center: '0, 1, 0',
    mask_bbox_dimensions: '0.5, 0.5, 0.5',
    model_parameters: {},
  });
  const [meshEditSourceImage, setMeshEditSourceImage] = useState(null);
  const [meshEditMaskImage, setMeshEditMaskImage] = useState(null);
  const [isCheckingAvatarSdk, setIsCheckingAvatarSdk] = useState(false);
  const [avatarSdkCheckResult, setAvatarSdkCheckResult] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [isSyncingTasks, setIsSyncingTasks] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [publishingJobId, setPublishingJobId] = useState(null);
  const [availableModels, setAvailableModels] = useState(ALL_MODELS);
  const [isExpanded, setIsExpanded] = useState(false);
  const cardHeaderRef = useRef(null);
  const { currentModel } = useScene();
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
  const avatarSdkReady = Boolean(
    import.meta.env.VITE_AVATARSDK_CLIENT_ID && import.meta.env.VITE_AVATARSDK_CLIENT_SECRET
  );
  const canStartAnyTask = isApiConnected || avatarSdkReady;
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
    return { activeTasks: active, completedTasks: completed };
  }, [tasks]);

  useEffect(() => {
    const onBrowse = (event) => {
      const taskType = event?.detail?.taskType || 'text-to-3d';
      setNewTaskType(taskType);
      setShowNewTask(true);
      setIsExpanded(true);
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
      ['image-to-3d', 'image-to-raw-mesh', 'image-to-splat', 'image-to-world', 'avatar-from-image', 'mesh-painting', 'mesh-editing-image', 'avatar-from-photo'].includes(newTaskType);
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
  }, [newTaskType, taskOptions.rig_mode, newTaskModel]);
  
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
      taskType === 'avatar-from-photo' ||
      taskType === 'avatar-from-image' ||
      taskType === 'image-to-world'
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

  const handleSubmitTask = (e) => {
    e.preventDefault();
    if (!canStartAnyTask) {
      alert(canBrowseCatalog ? AI_BACKEND_UNAVAILABLE_MSG : 'Configure DGX API or AvatarSDK before starting tasks.');
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
    if (newTaskType === 'avatar-from-image' && !newTaskImage) {
      alert('⚠️ Avatar from Image requires a photo (mesh + template.vrm rig).');
      return;
    }
    if (newTaskType === 'avatar-from-photo' && !avatarSdkReady) {
      alert('⚠️ AvatarSDK is not configured. Set VITE_AVATARSDK_CLIENT_ID and VITE_AVATARSDK_CLIENT_SECRET in .env.');
      return;
    }
    if (newTaskType === 'avatar-from-photo' && !newTaskImage) {
      alert('⚠️ Please upload a face photo for AvatarSDK.');
      return;
    }
    if (newTaskType !== 'avatar-from-photo' && newTaskType !== 'avatar-from-image' && !isApiConnected) {
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
    const prompt =
      newTaskPrompt.trim() ||
      (newTaskType === 'avatar-from-photo'
        ? 'Generate avatar from uploaded photo'
        : newTaskType === 'avatar-from-image'
          ? 'Generate avatar from photo (mesh + template VRM rig)'
          : newTaskType === 'image-to-world'
            ? objectName
            : `${newTaskType.replace('-', ' ')} on current model`);

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
      if (rigMode === AUTO_RIG_MODES.TEMPLATE) {
        options.humanoid_template_id =
          taskOptions.humanoid_template_id ?? DEFAULT_HUMANOID_TEMPLATE_ID;
        options.output_format = 'glb';
      }
      if (rigMode === AUTO_RIG_MODES.CREATURE_TEMPLATE) {
        options.creature_template_id =
          taskOptions.creature_template_id ?? DEFAULT_CREATURE_TEMPLATE_ID;
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
    if (newTaskType === 'text-to-image') {
      options.width = Number(taskOptions.image_width) || 1024;
      options.height = Number(taskOptions.image_height) || 1024;
      options.output_format = taskOptions.output_format === 'webp' ? 'webp' : 'png';
    }
    const modelsForTask = getModelsForTaskType(newTaskType);
    if (modelsForTask.length > 0 && newTaskModel) {
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
    setNewObjectName('');
    setNewTaskPrompt('');
    setObjectNamePlaceholder('e.g. Dragon Knight, Desk Lamp, Childhood Bedroom');
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
    const suggested = objectNameFromFilename(selected[0].name);
    if (suggested) {
      setObjectNamePlaceholder(suggested);
    }
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

  const handleCheckAvatarSdk = async () => {
    setIsCheckingAvatarSdk(true);
    setAvatarSdkCheckResult(null);
    try {
      const result = await avatarSdkService.checkMetaPersonAvailability();
      setAvatarSdkCheckResult(result);
    } catch (error) {
      setAvatarSdkCheckResult({
        ok: false,
        message: error?.message || 'MetaPerson 2.0 access check failed.'
      });
    } finally {
      setIsCheckingAvatarSdk(false);
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

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleTimeString();
  };

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

  const handleUseImageForImageTo3d = async (task, event) => {
    event?.stopPropagation?.();
    const loadPayload = normalizeTaskLoadPayload(task);
    const imageUrl = getTaskResultImageUrl(loadPayload);
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
        'generated-image',
      );
      const file = new File([blob], `${baseName}.${ext}`, {
        type: blob.type || (ext === 'webp' ? 'image/webp' : 'image/png'),
      });
      setNewTaskType('image-to-3d');
      setNewTaskPrompt(task.prompt || '');
      setNewObjectName(task.options?.object_name || task.name || '');
      setNewTaskModel(getDefaultModelForFeature('image-to-3d'));
      setNewTaskImage(file);
      setNewTaskImages([]);
      setShowNewTask(true);
    } catch (error) {
      alert(error?.message || 'Failed to fetch generated image for Image to 3D.');
    }
  };

  const handleDownloadTaskImage = async (task, event) => {
    event?.stopPropagation?.();
    const loadPayload = normalizeTaskLoadPayload(task);
    const imageUrl = getTaskResultImageUrl(loadPayload);
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
      setSyncMessage(`Synced ${synced.length} task(s) from DGX Spark`);
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
                        ? 'Click to load animation on the VRM'
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
                            ? '● Playing on VRM'
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
                        title="Load studio_motion.json and play on the viewport VRM"
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
                      modelUrl && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            dispatchLoadTask(task, 'loadModelButton');
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
                          Load Model
                        </button>
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
                  getTaskResultImageUrl(loadPayload) && (
                    <TaskImageThumbnail
                      url={getTaskResultImageUrl(loadPayload)}
                      apiEndpoint={apiEndpoint}
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
                  setShowNewTask(!showNewTask);
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
              >
                Clear
              </button>
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
                  Configure either DGX API (<code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>VITE_API_ENDPOINT</code>) or AvatarSDK credentials (<code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>VITE_AVATARSDK_CLIENT_ID</code> / <code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>VITE_AVATARSDK_CLIENT_SECRET</code>).
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
              Configure either DGX API (<code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>VITE_API_ENDPOINT</code>) or AvatarSDK credentials (<code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>VITE_AVATARSDK_CLIENT_ID</code> / <code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>VITE_AVATARSDK_CLIENT_SECRET</code>).
            </div>
          </div>
        )}

        {showNewTask && (
          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #444' }}>
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
              <strong>UniRig</strong> for <em>Avatar from Image → template VRM</em> (not SkinTokens).
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
                  <option value="text-to-image">Text to Image (Krea 2)</option>
                  <option value="image-to-3d">Image to 3D (textured mesh)</option>
                  <option value="image-to-raw-mesh">Image to Raw Mesh</option>
                  <option value="image-to-splat">Image to Gaussian Splat</option>
                  <option value="image-to-world">Image to World (splat + props)</option>
                  <option value="avatar-from-image">Avatar from Image (TRELLIS.2 + template VRM)</option>
                  <option value="mesh-painting-text">Mesh painting (text)</option>
                  <option value="mesh-painting">Mesh painting (image)</option>
                  <option value="mesh-segmentation">Mesh Segmentation</option>
                  <option value="mesh-retopology">Mesh Retopology</option>
                  <option value="mesh-uv-unwrapping">Mesh UV Unwrapping</option>
                  <option value="mesh-editing-text">Mesh editing (text)</option>
                  <option value="mesh-editing-image">Mesh editing (image)</option>
                  <option value="auto-rigging">Auto Rigging</option>
                  <option value="avatar-from-photo">Avatar From Photo (AvatarSDK)</option>
                </select>
              </div>

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
                  onChange={(e) => setNewObjectName(e.target.value)}
                  placeholder={objectNamePlaceholder}
                  required
                  maxLength={64}
                  data-testid="task-object-name-input"
                  style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  autoComplete="off"
                />
                <p style={{ fontSize: '0.55rem', color: '#888', margin: '0.25rem 0 0' }}>
                  Required before starting. Shown in the task list and used when publishing to RP1 / Scene Assembler.
                </p>
              </div>

              {isApiConnected && newTaskType !== 'avatar-from-photo' && newTaskType !== 'avatar-from-image' && (
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
                  <label style={{ fontSize: '0.65rem', marginBottom: '0.25rem', display: 'block', color: '#ccc' }}>
                    {newTaskType === 'avatar-from-image' ? 'Mesh model (image → 3D):' : 'Model:'}
                  </label>
                  <select
                    value={newTaskModel}
                    onChange={(e) => setNewTaskModel(e.target.value)}
                    className="input w-full"
                    style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  >
                    {(newTaskType === 'avatar-from-image'
                      ? getModelsForTaskType('image-to-3d')
                      : getModelsForTaskType(newTaskType)
                    ).map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
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
                    Pipeline: photo → TRELLIS mesh → template.vrm rig (GLB). Optional splat loads
                    in parallel when ready.
                  </p>
                </div>
              )}

              {/* Prompt input - optional for model-based tasks */}
              {!requiresModel(newTaskType) &&
                newTaskType !== 'avatar-from-photo' &&
                newTaskType !== 'avatar-from-image' &&
                newTaskType !== 'image-to-world' && (
                <div className="mb-1.5">
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
                newTaskType === 'avatar-from-image' ||
                newTaskType === 'mesh-painting' ||
                newTaskType === 'mesh-editing-image' ||
                newTaskType === 'avatar-from-photo') && (
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
                        : newTaskType === 'avatar-from-image'
                          ? 'Upload Photo (avatar pipeline):'
                          : newTaskType === 'mesh-painting' || newTaskType === 'mesh-editing-image'
                        ? 'Upload Reference Image:'
                        : 'Upload Face Photo:'}
                  </label>
                  <input
                    ref={fileInputRef}
                    id="task-image-file-input"
                    type="file"
                    accept="image/*"
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
                  {newTaskType === 'avatar-from-photo' && !newTaskImage && (
                    <div style={{ fontSize: '0.6rem', color: '#d9a441', marginTop: '0.25rem' }}>
                      A face photo is required for AvatarSDK.
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
                  {newTaskType === 'avatar-from-photo' && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleCheckAvatarSdk}
                        disabled={isCheckingAvatarSdk}
                        style={{ width: '100%', fontSize: '0.65rem', padding: '0.3rem' }}
                      >
                        {isCheckingAvatarSdk ? 'Checking MetaPerson 2.0 Access...' : 'Check MetaPerson 2.0 Access'}
                      </button>
                      {avatarSdkCheckResult && (
                        <div
                          style={{
                            marginTop: '0.35rem',
                            fontSize: '0.6rem',
                            color: avatarSdkCheckResult.ok ? '#7ed957' : '#ff8a8a',
                            lineHeight: '1.35'
                          }}
                        >
                          {avatarSdkCheckResult.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-1 mt-1.5">
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="task-start-btn"
                  disabled={!canSubmitNewTask || !canStartAnyTask}
                  title={
                    !canStartAnyTask
                      ? canBrowseCatalog
                        ? AI_BACKEND_UNAVAILABLE_MSG
                        : 'Connect API or AvatarSDK to start'
                      : canSubmitNewTask
                        ? 'Start generation'
                        : 'Enter an object name first'
                  }
                  onClick={() => console.log('TaskManager: Submit button clicked')}
                  style={{ flex: 1 }}
                >
                  Start
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
                  Completed
                  <span className="task-completed-count">({completedTasks.length})</span>
                </div>
                <div className="task-completed-scroll">
                  {completedTasks.length === 0 ? (
                    <p className="task-list-empty task-list-empty--inset">No completed tasks</p>
                  ) : (
                    completedTasks.map((task) => renderTaskItem(task))
                  )}
                </div>
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
