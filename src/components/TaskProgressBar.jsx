import React from 'react';
import './TaskProgressBar.css';

const TaskProgressBar = ({ tasks }) => {
  // Find the currently running task with the highest progress
  const runningTasks = tasks.filter(task => task.status === 'running');
  const currentTask = runningTasks.length > 0 ? runningTasks[0] : null;
  
  // Calculate overall progress
  const progress = currentTask ? currentTask.progress : 0;
  const taskName = currentTask ? currentTask.name : '';
  
  // Don't show progress bar if no running tasks
  if (!currentTask || progress === 0) {
    return null;
  }

  return (
    <div className="task-progress-bar">
      <div className="progress-container">
        <div className="progress-info">
          <span className="task-name">{taskName}</span>
          <span className="progress-percentage">{Math.round(progress)}%</span>
        </div>
        <div className="progress-track">
          <div 
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default TaskProgressBar;






