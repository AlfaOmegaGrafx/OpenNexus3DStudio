import React, { useState, useEffect, useRef } from 'react';
import { useTask } from '../context/TaskContext';
import { useScene } from '../context/SceneContext';
import avatarSdkService from '../services/avatarSdkService.js';
import { ensureAbsoluteUrl, get3daigcAuthHeaders } from '../library/taskManager';
import { ALL_MODELS, TASK_TYPE_TO_FEATURE } from '../library/aiModelsCatalog.js';

export { ALL_MODELS, TASK_TYPE_TO_FEATURE };

const TaskManager = ({ tasks, onAITask, isApiConnected }) => {
  console.log('TaskManager: Component rendered with props:', { 
    tasksLength: tasks?.length, 
    onAITask: !!onAITask, 
    isApiConnected 
  });
  
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskType, setNewTaskType] = useState('text-to-3d');
  const [newTaskPrompt, setNewTaskPrompt] = useState('');
  const [newTaskImage, setNewTaskImage] = useState(null);
  const [newTaskModel, setNewTaskModel] = useState('trellis_text_to_textured_mesh');
  const [isCheckingAvatarSdk, setIsCheckingAvatarSdk] = useState(false);
  const [avatarSdkCheckResult, setAvatarSdkCheckResult] = useState(null);
  const [availableModels, setAvailableModels] = useState(ALL_MODELS);
  const { currentModel } = useScene();
  const { removeTask, clearCompletedTasks, getApiEndpoint } = useTask();
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
      ['image-to-3d', 'mesh-painting', 'mesh-editing-image', 'avatar-from-photo'].includes(newTaskType);
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
    const models = getModelsForTaskType(taskType);
    return models.length > 0 ? models[0].value : '';
  };
  
  // Update model when task type changes
  useEffect(() => {
    if (showNewTask) {
      const defaultModel = getDefaultModelForTaskType(newTaskType);
      if (defaultModel) {
        setNewTaskModel(defaultModel);
      }
    }
  }, [newTaskType, showNewTask]);
  
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
                    label: modelId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
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
      'part-completion',
      'mesh-retopology',
      'mesh-uv-unwrapping',
      'mesh-editing-text',
      'mesh-editing-image'
    ].includes(taskType);
  };

  const requiresPrompt = (taskType) => {
    if (taskType === 'avatar-from-photo') return false;
    return !requiresModel(taskType);
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
      alert('⚠️ Mesh editing (image) requires a reference image.');
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
    if (newTaskType !== 'avatar-from-photo' && !isApiConnected) {
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
        : `${newTaskType.replace('-', ' ')} on current model`);

    // Prepare options with model preference for all task types that support it
    const options = {};
    const modelsForTask = getModelsForTaskType(newTaskType);
    if (modelsForTask.length > 0 && newTaskModel) {
      options.model_preference = newTaskModel;
    }

    console.log('TaskManager: Calling onAITask with options:', options);
    onAITask(newTaskType, prompt, newTaskImage, options);
    setNewTaskPrompt('');
    setNewTaskImage(null);
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
    return new Date(date).toLocaleTimeString();
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
                onClick={clearCompletedTasks}
              >
                Clear
              </button>
          </div>
        </div>

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
              (mesh gen, painting, segmentation, part completion, rigging, retopology, UV, mesh editing). Models list updates from the API when connected.
            </p>
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
                    <option value="image-to-3d">Image to 3D</option>
                    <option value="mesh-painting-text">Mesh painting (text)</option>
                    <option value="mesh-painting">Mesh painting (image)</option>
                    <option value="mesh-segmentation">Mesh Segmentation</option>
                    <option value="part-completion">Part Completion</option>
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

              {/* Model selection - show for tasks that support model selection */}
              {getModelsForTaskType(newTaskType).length > 0 && (
                <div className="mb-1.5">
                  <label style={{ fontSize: '0.65rem', marginBottom: '0.25rem', display: 'block', color: '#ccc' }}>
                    Model:
                  </label>
                  <select
                    value={newTaskModel}
                    onChange={(e) => setNewTaskModel(e.target.value)}
                    className="input w-full"
                    style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                  >
                    {getModelsForTaskType(newTaskType).map(model => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Prompt input - optional for model-based tasks */}
              {!requiresModel(newTaskType) && newTaskType !== 'avatar-from-photo' && (
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
                newTaskType === 'mesh-painting' ||
                newTaskType === 'mesh-editing-image' ||
                newTaskType === 'avatar-from-photo') && (
                <div className="mb-1.5">
                  <label style={{ fontSize: '0.65rem', marginBottom: '0.25rem', display: 'block' }}>
                    {newTaskType === 'image-to-3d'
                      ? 'Upload Image:'
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
            tasks.map((task) => (
              <div key={task.id} className="task-item" style={{ 
                padding: '0.375rem', 
                marginBottom: '0.375rem', 
                border: '1px solid #444', 
                borderRadius: '4px',
                backgroundColor: '#2a2a2a'
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
                      {task.type} • {formatDate(task.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeTask(task.id)}
                    className="btn btn-danger"
                    style={{ 
                      padding: '0.1rem 0.3rem', 
                      fontSize: '0.6rem',
                      minWidth: 'auto'
                    }}
                  >
                    ×
                  </button>
                </div>

                {task.status === 'running' && (
                  <div className="progress mb-0.5" style={{ height: '3px' }}>
                    <div 
                      className="progress-bar" 
                      style={{ width: `${task.progress || 0}%` }}
                    />
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

                {task.result && (
                  <div className="text-xs text-green-400 mb-0.5" style={{ fontSize: '0.6rem' }}>
                    ✓ Completed
                    {task.result.modelUrl && (
                      <button
                        onClick={() => {
                          // Trigger model load event
                          window.dispatchEvent(new CustomEvent('loadModelFromUrl', { 
                            detail: { url: task.result.modelUrl } 
                          }));
                        }}
                        style={{
                          marginLeft: '0.5rem',
                          padding: '0.1rem 0.3rem',
                          fontSize: '0.6rem',
                          background: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        Load Model
                      </button>
                    )}
                  </div>
                )}

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
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskManager;
