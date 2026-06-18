import React from 'react';
import './TaskProgressBar.css';

const TaskProgressBar = ({ tasks }) => {
  const runningTasks = tasks.filter(
    (task) => task.status === 'running' || task.status === 'pending',
  );
  const currentTask =
    runningTasks.length > 0
      ? runningTasks.reduce((best, t) =>
          (t.progress ?? 0) >= (best.progress ?? 0) ? t : best,
        runningTasks[0])
      : null;

  if (!currentTask) {
    return null;
  }

  const indeterminate = Boolean(currentTask.progressIndeterminate);
  const hasPercent =
    !indeterminate &&
    currentTask.progress != null &&
    Number(currentTask.progress) > 0;
  const progress = hasPercent
    ? Math.max(0, Math.min(100, Number(currentTask.progress)))
    : 0;
  const fillWidth = hasPercent ? Math.max(progress, 4) : 100;
  const taskName = currentTask.name || currentTask.type || 'AI task';
  const statusMessage = currentTask.statusMessage || currentTask.status || 'running';
  const percentLabel = hasPercent
    ? `${Math.round(progress)}%`
    : indeterminate
      ? 'Working…'
      : 'Starting…';

  return (
    <div className="task-progress-bar">
      <div className="progress-container">
        <div className="progress-info">
          <span className="task-name" title={taskName}>
            {taskName}
            {statusMessage && statusMessage !== 'running' ? (
              <span className="task-status-message"> — {statusMessage}</span>
            ) : null}
          </span>
          <span className="progress-percentage">{percentLabel}</span>
        </div>
        <div
          className={`progress-track${indeterminate || !hasPercent ? ' progress-track-indeterminate' : ''}`}
        >
          <div
            className={`progress-fill${indeterminate || !hasPercent ? ' progress-fill-indeterminate' : ''}`}
            style={hasPercent ? { width: `${fillWidth}%` } : undefined}
          />
        </div>
      </div>
    </div>
  );
};

export default TaskProgressBar;
