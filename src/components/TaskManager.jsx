import React, { useState, useEffect, useRef } from 'react';
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
  getPropMeshModelsForWorld,
  PREFERRED_PIPELINES,
  resolveAutoRigModelForTask,
  resolveMeshModelForAvatarFromImage,
} from '../library/aiModelsCatalog.js';
import {
  getTaskResultModelUrl,
  getTaskResultMeshUrl,
  normalizeTaskLoadPayload,
} from '../library/taskModelUrl.js';
import {
  getWorldManifestUrlFromTaskResult,
  isFullWorldPackageTaskResult,
  isSplatEnvironmentTaskResult,
  isWorldLayerTaskResult,
} from '../library/worldPackage.js';
import { formatTaskDurationMs, getTaskElapsedMs, resolveTaskJobId } from '../library/taskPersistence.js';
import {
  AUTO_RIG_MODES,
  DEFAULT_HUMANOID_TEMPLATE_ID,
  TEMPLATE_RIG_MODEL_ID,
} from '../library/avatarPipelineCatalog.js';
import { AI_BACKEND_UNAVAILABLE_MSG, isLocalDev } from '../library/runtimeUi';
import TaskAdvancedOptions from './TaskAdvancedOptions.jsx';

export { ALL_MODELS, TASK_TYPE_TO_FEATURE };

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
  const [newTaskPrompt, setNewTaskPrompt] = useState('');
  const [newTaskImage, setNewTaskImage] = useState(null);
  const [newTaskModel, setNewTaskModel] = useState(() => getDefaultModelForFeature('text-to-3d'));
  const [taskOptions, setTaskOptions] = useState({
    texture_resolution: 1024,
    output_format: 'glb',
    mesh_simplify: 0.95,
    rig_mode: AUTO_RIG_MODES.FULL,
    humanoid_template_id: DEFAULT_HUMANOID_TEMPLATE_ID,
    include_splat_preview: false,
    prop_regions_json: '',
    world_name: '',
    prop_mesh_model_preference: 'trellis2_image_to_textured_mesh',
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
  const [availableModels, setAvailableModels] = useState(ALL_MODELS);
  const { currentModel } = useScene();
  const { deleteTask, syncTasksFromApi, clearCompletedTasks, getApiEndpoint } = useTask();
  const apiEndpoint = getApiEndpoint();
  const fileInputRef = useRef(null);
  const avatarSdkReady = Boolean(
    import.meta.env.VITE_AVATARSDK_CLIENT_ID && import.meta.env.VITE_AVATARSDK_CLIENT_SECRET
  );
  const canStartAnyTask = isApiConnected || avatarSdkReady;

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
  
  // Get models filtered by task type
  const getModelsForTaskType = (taskType) => {
    const feature = TASK_TYPE_TO_FEATURE[taskType];
    if (!feature) return [];
    
    return availableModels.filter(model => model.feature === feature);
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
    console.log('TaskManager: handleSubmitTask called');
    console.log('TaskManager: newTaskPrompt:', newTaskPrompt);
    console.log('TaskManager: newTaskType:', newTaskType);
    console.log('TaskManager: newTaskImage:', newTaskImage);

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
      alert(
        isLocalDev
          ? '⚠️ AvatarSDK is not configured. Set VITE_AVATARSDK_CLIENT_ID and VITE_AVATARSDK_CLIENT_SECRET in .env.'
          : '⚠️ AvatarSDK is not configured on this deployment.',
      );
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
            ? taskOptions.world_name?.trim() || 'Explorable world from photo'
            : `${newTaskType.replace('-', ' ')} on current model`);

    const options = {
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
    }
    if (newTaskType === 'avatar-from-image') {
      options.mesh_model_preference = resolveMeshModelForAvatarFromImage(newTaskModel);
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
      options.world_name = taskOptions.world_name?.trim() || prompt;
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
    const modelsForTask = getModelsForTaskType(newTaskType);
    if (modelsForTask.length > 0 && newTaskModel) {
      options.model_preference = newTaskModel;
    }

    console.log('TaskManager: Calling onAITask with options:', options);
    onAITask(newTaskType, prompt, newTaskImage, options);
    setNewTaskPrompt('');
    setNewTaskImage(null);
    setMeshEditSourceImage(null);
    setMeshEditMaskImage(null);
    // Reset to default model for the task type
    setNewTaskModel(getDefaultModelForTaskType(newTaskType));
    setShowNewTask(false);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    console.log('TaskManager: handleImageChange called, file:', file ? file.name : 'null');
    if (file) {
      setNewTaskImage(file);
      console.log('TaskManager: File set:', file.name, file.size, 'bytes');
    } else {
      console.warn('TaskManager: No file selected');
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
      setSyncMessage(`Synced ${synced.length} task(s) from API`);
    } catch (error) {
      setSyncMessage(error?.message || 'Failed to sync tasks from API');
    } finally {
      setIsSyncingTasks(false);
    }
  };

  return (
    <div className="task-manager">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ margin: 0 }}>
              Tasks {tasks.length > 0 && <span style={{ fontSize: '0.7rem', color: '#888' }}>({tasks.length})</span>}
            </h3>
            <div className="flex gap-1">
              <button 
                className="btn btn-primary"
                data-testid="task-manager-new-btn"
                onClick={() => {
                  console.log('TaskManager: New Task button clicked');
                  console.log('TaskManager: isApiConnected:', isApiConnected);
                  setShowNewTask(!showNewTask);
                }}
                disabled={!canStartAnyTask}
              >
                + New
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleSyncFromDgx}
                disabled={!isApiConnected || isSyncingTasks}
                title={isLocalDev ? 'Load recent jobs from DGX Spark and merge with local tasks' : 'Load recent jobs from the API'}
              >
                {isSyncingTasks ? 'Sync…' : isLocalDev ? 'Sync DGX' : 'Sync jobs'}
              </button>
              <button 
                className="btn btn-secondary"
                onClick={clearCompletedTasks}
              >
                Clear
              </button>
          </div>
        </div>

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

        {!canStartAnyTask && (
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
              {isLocalDev ? (
                <>
                  Configure either DGX API (
                  <code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>
                    VITE_API_ENDPOINT
                  </code>
                  ) or AvatarSDK credentials (
                  <code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>
                    VITE_AVATARSDK_CLIENT_ID
                  </code>{' '}
                  /{' '}
                  <code style={{ background: '#f8f9fa', padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.6rem' }}>
                    VITE_AVATARSDK_CLIENT_SECRET
                  </code>
                  ).
                </>
              ) : (
                AI_BACKEND_UNAVAILABLE_MSG
              )}
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
              Workflows use DGX-verified defaults: TRELLIS.2 for image→3D, SkinTokens for full rig, UniRig for template VRM.
              Models list updates from the API when connected.
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
            <form onSubmit={handleSubmitTask}>
              <div className="flex gap-1.5 mb-1.5">
                <div style={{ flex: 1 }}>
                  <select 
                    value={newTaskType} 
                    onChange={(e) => setNewTaskType(e.target.value)}
                    className="input w-full"
                    style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  >
                    <option value="text-to-3d">Text to 3D</option>
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
                <div className="flex gap-1">
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    data-testid="task-start-btn"
                    onClick={() => console.log('TaskManager: Submit button clicked')}
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
                    World name (optional)
                  </label>
                  <input
                    type="text"
                    className="input w-full"
                    value={taskOptions.world_name}
                    onChange={(e) =>
                      setTaskOptions((prev) => ({ ...prev, world_name: e.target.value }))
                    }
                    placeholder="Childhood bedroom"
                    style={{ padding: '0.375rem', fontSize: '0.65rem', marginBottom: '0.5rem' }}
                  />
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
                        ? 'Upload Image (TripoSplat → Spark.js):'
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
                    {newTaskImage ? `Change File (${newTaskImage.name})` : 'Choose File'}
                  </button>
                  {newTaskImage && (
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
            </form>
          </div>
        )}

        <div className="task-list" style={{ padding: '0 0.75rem 0.3rem' }}>
          {tasks.length === 0 ? (
            <p className="text-center text-gray-400" style={{ fontSize: '0.6rem', padding: '0.15rem 0' }}>No tasks yet</p>
          ) : (
            tasks.map((task) => {
              const taskJobId = resolveTaskJobId(task);
              const isViewportLoading = viewportLoadingJobId && taskJobId === viewportLoadingJobId;
              const isViewportActive = viewportActiveJobId && taskJobId === viewportActiveJobId;
              const isViewportFailed = viewportFailedJobId && taskJobId === viewportFailedJobId;
              return (
              <div
                key={task.id}
                className="task-item"
                role={task.status === 'completed' && task.result ? 'button' : undefined}
                tabIndex={task.status === 'completed' && task.result ? 0 : undefined}
                onClick={(event) => handleTaskRowClick(task, event)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    dispatchLoadTask(task, 'taskRowKey');
                  }
                }}
                title={
                  task.status === 'completed' && task.result
                    ? isViewportLoading
                      ? 'Loading into viewport…'
                      : 'Click to open in viewport'
                    : undefined
                }
                style={{
                padding: '0.375rem',
                marginBottom: '0.375rem',
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
                cursor: task.status === 'completed' && task.result ? 'pointer' : 'default',
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
                        ? isLocalDev
                          ? 'Delete from this browser and DGX Spark'
                          : 'Delete from this browser and API'
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

                {task.result && (() => {
                  const loadPayload = normalizeTaskLoadPayload(task);
                  const isFullWorld = isFullWorldPackageTaskResult(loadPayload);
                  const isSplatEnv = isSplatEnvironmentTaskResult(loadPayload);
                  const isWorld = isFullWorld || isSplatEnv;
                  const modelUrl = getTaskResultModelUrl(loadPayload);
                  return (
                  <div className="text-xs text-green-400 mb-0.5" style={{ fontSize: '0.6rem' }}>
                    {isViewportLoading
                      ? '⏳ Loading in viewport…'
                      : isViewportFailed
                        ? '✗ Viewport load failed'
                        : isViewportActive
                          ? '● In viewport'
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
                  </div>
                  );
                })()}

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
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskManager;
