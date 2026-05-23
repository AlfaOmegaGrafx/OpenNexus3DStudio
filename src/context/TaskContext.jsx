import React, { createContext, useContext, useRef, useEffect, useState, useCallback } from 'react';
import { TaskManager, ensureAbsoluteUrl } from '../library/taskManager';

const TaskContext = createContext();

export const useTask = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTask must be used within a TaskProvider');
  }
  return context;
};

export const TaskProvider = ({ children }) => {
  const taskManagerRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize task manager (wrap in try/catch so app always loads even if API code fails)
  useEffect(() => {
    if (taskManagerRef.current) return;
    try {
      taskManagerRef.current = new TaskManager();
    } catch (err) {
      console.warn('TaskContext: TaskManager init failed (app will work without API):', err?.message || err);
      return;
    }

    const manager = taskManagerRef.current;
    try {
      manager.on('connectionStatusChanged', (data) => {
        setIsConnected(data.connected);
      });

      manager.checkConnection().then((connected) => {
        setIsConnected(connected);
      }).catch(() => {
        setIsConnected(false);
      });

      manager.on('taskCreated', (data) => {
        setTasks(prev => [...prev, data.task]);
      });

      manager.on('taskStarted', (data) => {
        setTasks(prev => prev.map(task =>
          task.id === data.task.id ? data.task : task
        ));
      });

      manager.on('taskUpdated', (data) => {
        setTasks(prev => prev.map(task =>
          task.id === data.task.id ? data.task : task
        ));
      });

      manager.on('taskCompleted', (data) => {
        setTasks(prev => prev.map(task =>
          task.id === data.task.id ? data.task : task
        ));
      });

      manager.on('taskFailed', (data) => {
        setTasks(prev => prev.map(task =>
          task.id === data.task.id ? data.task : task
        ));
      });

      manager.on('taskRemoved', (data) => {
        setTasks(prev => prev.filter(task => task.id !== data.task.id));
      });

      manager.on('tasksCleared', () => {
        setTasks(prev => prev.filter(task => task.status !== 'completed'));
      });

      manager.on('allTasksCleared', () => {
        setTasks([]);
      });
    } catch (err) {
      console.warn('TaskContext: API setup failed (app works without API):', err?.message || err);
    }
  }, []);

  const getApiEndpoint = useCallback(() => {
    return taskManagerRef.current?.getApiEndpoint?.() || ensureAbsoluteUrl(import.meta.env.VITE_API_ENDPOINT ?? '');
  }, []);

  // Periodic connection check with exponential backoff
  useEffect(() => {
    let isChecking = false;
    let consecutiveFailures = 0;
    let timeoutId = null;
    const initialInterval = 10000; // Start with 10 seconds
    const maxBackoff = 60000; // Max 60 seconds between checks when disconnected

    const getNextInterval = () => {
      if (consecutiveFailures === 0) {
        return initialInterval;
      }
      // Exponential backoff: 10s, 20s, 40s, 60s (max)
      return Math.min(initialInterval * Math.pow(2, consecutiveFailures - 1), maxBackoff);
    };

    const performCheck = async () => {
      if (isChecking || !taskManagerRef.current) return;
      
      isChecking = true;
      try {
        const connected = await taskManagerRef.current.checkConnection();
        
        if (connected) {
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
        }
      } catch (error) {
        consecutiveFailures++;
      } finally {
        isChecking = false;
        
        // Schedule next check with updated interval
        const nextInterval = getNextInterval();
        timeoutId = setTimeout(() => {
          performCheck();
        }, nextInterval);
      }
    };

    // Initial check
    performCheck();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Check API connection with debouncing
  const checkConnection = useCallback(async () => {
    if (taskManagerRef.current) {
      const result = await taskManagerRef.current.checkConnection();
      return result;
    }
    return false;
  }, []);

  const forceConnectionCheck = useCallback(async () => {
    if (taskManagerRef.current) {
      try {
        const result = await taskManagerRef.current.checkConnection();
        setIsConnected(result);
        return result;
      } catch (error) {
        setIsConnected(false);
        return false;
      }
    }
    return false;
  }, []);

  // Set API endpoint
  const setApiEndpoint = useCallback((endpoint) => {
    if (taskManagerRef.current) {
      taskManagerRef.current.setApiEndpoint(endpoint);
    }
  }, []);

  const createTask = (taskData) => {
    if (taskManagerRef.current) {
      return taskManagerRef.current.createTask(taskData);
    }
    return null;
  };

  // Start task
  const startTask = async (taskId, modelData = null) => {
    if (taskManagerRef.current) {
      try {
        setIsLoading(true);
        
        // Update task status to running
        setTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, status: 'running', progress: 0 } : task
        ));
        
        const apiResult = await taskManagerRef.current.startTask(taskId, modelData);
        const latest = taskManagerRef.current.getTask(taskId);
        if (latest) {
          setTasks(prev => prev.map(task => (task.id === taskId ? { ...latest } : task)));
        }
        return apiResult;
      } catch (error) {
        // Update task status to failed
        setTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, status: 'failed', error: error.message } : task
        ));
        throw error;
      } finally {
        setIsLoading(false);
      }
    }
  };

  const createAndStartTask = async (taskData, modelData = null) => {
    const task = createTask(taskData);
    if (task) {
      setTasks(prev => [...prev, task]);
      return await startTask(task.id, modelData);
    }
    return null;
  };

  // Get task by ID
  const getTask = (taskId) => {
    if (taskManagerRef.current) {
      return taskManagerRef.current.getTask(taskId);
    }
  };

  // Get all tasks
  const getAllTasks = () => {
    if (taskManagerRef.current) {
      return taskManagerRef.current.getAllTasks();
    }
    return [];
  };

  // Get tasks by status
  const getTasksByStatus = (status) => {
    if (taskManagerRef.current) {
      return taskManagerRef.current.getTasksByStatus(status);
    }
    return [];
  };

  // Get tasks by type
  const getTasksByType = (type) => {
    if (taskManagerRef.current) {
      return taskManagerRef.current.getTasksByType(type);
    }
    return [];
  };

  // Remove task
  const removeTask = (taskId) => {
    if (taskManagerRef.current) {
      taskManagerRef.current.removeTask(taskId);
    }
  };

  const clearCompletedTasks = () => {
    if (taskManagerRef.current) {
      taskManagerRef.current.clearCompletedTasks();
      setTasks(prev => prev.filter(task => task.status !== 'completed'));
    }
  };

  // Clear all tasks
  const clearAllTasks = () => {
    if (taskManagerRef.current) {
      taskManagerRef.current.clearAllTasks();
    }
  };

  // Get task statistics
  const getTaskStats = () => {
    if (taskManagerRef.current) {
      return taskManagerRef.current.getTaskStats();
    }
    return { total: 0, pending: 0, running: 0, completed: 0, failed: 0 };
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (taskManagerRef.current) {
        // Remove all event listeners
        taskManagerRef.current.off('connectionStatusChanged');
        taskManagerRef.current.off('taskCreated');
        taskManagerRef.current.off('taskStarted');
        taskManagerRef.current.off('taskUpdated');
        taskManagerRef.current.off('taskCompleted');
        taskManagerRef.current.off('taskFailed');
        taskManagerRef.current.off('taskRemoved');
        taskManagerRef.current.off('tasksCleared');
        taskManagerRef.current.off('allTasksCleared');
        
        taskManagerRef.current.dispose();
      }
    };
  }, []);

  const value = {
    // State
    isConnected,
    tasks,
    isLoading,
    
    // Actions
    checkConnection,
    forceConnectionCheck,
    setApiEndpoint,
    getApiEndpoint,
    createTask,
    startTask,
    createAndStartTask,
    getTask,
    getAllTasks,
    getTasksByStatus,
    getTasksByType,
    removeTask,
    clearCompletedTasks,
    clearAllTasks,
    getTaskStats,
    
    // Manager reference
    taskManager: taskManagerRef.current
  };

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};
