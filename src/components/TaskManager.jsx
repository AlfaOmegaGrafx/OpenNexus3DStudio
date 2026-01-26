import React, { useState } from 'react';
import { useTask } from '../context/TaskContext';

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

  const { removeTask, clearCompletedTasks } = useTask();

  const handleSubmitTask = (e) => {
    e.preventDefault();
    console.log('TaskManager: handleSubmitTask called');
    console.log('TaskManager: newTaskPrompt:', newTaskPrompt);
    console.log('TaskManager: newTaskType:', newTaskType);
    console.log('TaskManager: newTaskImage:', newTaskImage);
    
    if (!newTaskPrompt.trim()) {
      console.log('TaskManager: No prompt provided, returning');
      return;
    }

    console.log('TaskManager: Calling onAITask');
    onAITask(newTaskType, newTaskPrompt, newTaskImage);
    setNewTaskPrompt('');
    setNewTaskImage(null);
    setShowNewTask(false);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setNewTaskImage(file);
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
                onClick={() => {
                  console.log('TaskManager: New Task button clicked');
                  console.log('TaskManager: isApiConnected:', isApiConnected);
                  setShowNewTask(!showNewTask);
                }}
                disabled={!isApiConnected}
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

        {!isApiConnected && (
          <div style={{ background: '#f8d7da', color: '#721c24', borderRadius: '4px', fontSize: '0.6rem', padding: '0.2rem 0.4rem', margin: '0 0.75rem 0.2rem' }}>
            ⚠️ API not connected. Please check your API endpoint.
          </div>
        )}

        {showNewTask && (
          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #444' }}>
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
                    <option value="mesh-painting">Mesh Painting</option>
                    <option value="mesh-segmentation">Mesh Segmentation</option>
                    <option value="part-completion">Part Completion</option>
                    <option value="auto-rigging">Auto Rigging</option>
                  </select>
                </div>
                <div className="flex gap-1">
                  <button 
                    type="submit" 
                    className="btn btn-primary"
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

              <div className="mb-1.5">
                <textarea
                  value={newTaskPrompt}
                  onChange={(e) => setNewTaskPrompt(e.target.value)}
                  className="input w-full"
                  rows="2"
                  placeholder="Describe what you want to generate..."
                  required
                  style={{ padding: '0.375rem', fontSize: '0.65rem' }}
                />
              </div>

              {(newTaskType === 'image-to-3d' || newTaskType === 'mesh-painting') && (
                <div className="mb-1.5">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="input w-full"
                    style={{ padding: '0.25rem', fontSize: '0.65rem' }}
                  />
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
                  <div className="text-xs text-green-400" style={{ fontSize: '0.6rem' }}>
                    ✓ Completed
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
