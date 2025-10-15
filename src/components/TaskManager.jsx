import React, { useState } from 'react';
import { useTask } from '../context/TaskContext';

const TaskManager = ({ tasks, onAITask, isApiConnected }) => {
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskType, setNewTaskType] = useState('text-to-3d');
  const [newTaskPrompt, setNewTaskPrompt] = useState('');
  const [newTaskImage, setNewTaskImage] = useState(null);

  const { removeTask, clearCompletedTasks } = useTask();

  const handleSubmitTask = (e) => {
    e.preventDefault();
    if (!newTaskPrompt.trim()) return;

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
    return new Date(date).toLocaleString();
  };

  return (
    <div className="task-manager">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Task Manager</h3>
          <div className="flex gap-2">
            <button 
              className="btn btn-primary"
              onClick={() => setShowNewTask(!showNewTask)}
              disabled={!isApiConnected}
            >
              New Task
            </button>
            <button 
              className="btn btn-secondary"
              onClick={clearCompletedTasks}
            >
              Clear Completed
            </button>
          </div>
        </div>

        {!isApiConnected && (
          <div className="mb-3 p-2" style={{ background: '#f8d7da', color: '#721c24', borderRadius: '4px' }}>
            ⚠️ API not connected. Please check your API endpoint.
          </div>
        )}

        {showNewTask && (
          <form onSubmit={handleSubmitTask} className="mb-3">
            <div className="mb-2">
              <label className="block mb-1">Task Type:</label>
              <select 
                value={newTaskType} 
                onChange={(e) => setNewTaskType(e.target.value)}
                className="input w-full"
              >
                <option value="text-to-3d">Text to 3D</option>
                <option value="image-to-3d">Image to 3D</option>
                <option value="mesh-painting">Mesh Painting</option>
                <option value="mesh-segmentation">Mesh Segmentation</option>
                <option value="part-completion">Part Completion</option>
                <option value="auto-rigging">Auto Rigging</option>
              </select>
            </div>

            <div className="mb-2">
              <label className="block mb-1">Prompt:</label>
              <textarea
                value={newTaskPrompt}
                onChange={(e) => setNewTaskPrompt(e.target.value)}
                className="input w-full"
                rows="3"
                placeholder="Describe what you want to generate..."
                required
              />
            </div>

            {(newTaskType === 'image-to-3d' || newTaskType === 'mesh-painting') && (
              <div className="mb-2">
                <label className="block mb-1">Image (optional):</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="input w-full"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                Start Task
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
        )}

        <div className="task-list">
          {tasks.length === 0 ? (
            <p className="text-center text-gray-400">No tasks yet</p>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="task-item card mb-2">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-semibold">{task.name}</h4>
                    <p className="text-sm text-gray-400">
                      {task.type} • {formatDate(task.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`status ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                    <button
                      onClick={() => removeTask(task.id)}
                      className="btn btn-danger"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {task.status === 'running' && (
                  <div className="progress mb-2">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${task.progress || 0}%` }}
                    />
                  </div>
                )}

                {task.prompt && (
                  <p className="text-sm text-gray-300 mb-2">
                    "{task.prompt}"
                  </p>
                )}

                {task.error && (
                  <div className="text-sm text-red-400 mb-2">
                    Error: {task.error}
                  </div>
                )}

                {task.result && (
                  <div className="text-sm text-green-400">
                    ✓ Task completed successfully
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
