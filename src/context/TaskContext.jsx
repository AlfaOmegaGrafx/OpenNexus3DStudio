import React, { createContext, useContext, useRef, useEffect, useState } from 'react';
import { TaskManager } from '../library/taskManager';

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

  // Initialize task manager
  useEffect(() => {
    if (!taskManagerRef.current) {
      taskManagerRef.current = new TaskManager();
      
      // Setup event listeners
      taskManagerRef.current.on('connectionStatusChanged', (data) => {
        console.log('TaskContext: Connection status changed:', data);
        setIsConnected(data.connected);
      });

      // Initial connection check
      taskManagerRef.current.checkConnection().then((connected) => {
        console.log('TaskContext: Initial connection check result:', connected);
        setIsConnected(connected);
      });

      taskManagerRef.current.on('taskCreated', (data) => {
        setTasks(prev => [...prev, data.task]);
      });

      taskManagerRef.current.on('taskUpdated', (data) => {
        setTasks(prev => prev.map(task => 
          task.id === data.task.id ? data.task : task
        ));
      });

      taskManagerRef.current.on('taskRemoved', (data) => {
        setTasks(prev => prev.filter(task => task.id !== data.task.id));
      });

      taskManagerRef.current.on('tasksCleared', () => {
        setTasks(prev => prev.filter(task => task.status !== 'completed'));
      });

      taskManagerRef.current.on('allTasksCleared', () => {
        setTasks([]);
      });
    }
  }, []);

  // Periodic connection check
  useEffect(() => {
    const interval = setInterval(() => {
      if (taskManagerRef.current) {
        taskManagerRef.current.checkConnection();
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Check API connection
  const checkConnection = async () => {
    if (taskManagerRef.current) {
      const result = await taskManagerRef.current.checkConnection();
      console.log('Manual connection check result:', result);
      return result;
    }
    return false;
  };

  // Force connection check
  const forceConnectionCheck = async () => {
    console.log('Force connection check triggered');
    if (taskManagerRef.current) {
      const result = await taskManagerRef.current.checkConnection();
      console.log('Force connection check result:', result);
      setIsConnected(result);
      return result;
    }
    return false;
  };

  // Set API endpoint
  const setApiEndpoint = (endpoint) => {
    if (taskManagerRef.current) {
      taskManagerRef.current.setApiEndpoint(endpoint);
    }
  };

  // Create task
  const createTask = (taskData) => {
    if (taskManagerRef.current) {
      return taskManagerRef.current.createTask(taskData);
    }
  };

  // Start task
  const startTask = async (taskId) => {
    if (taskManagerRef.current) {
      try {
        setIsLoading(true);
        const result = await taskManagerRef.current.startTask(taskId);
        return result;
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Create and start task in one call
  const createAndStartTask = async (taskData) => {
    const task = createTask(taskData);
    if (task) {
      return await startTask(task.id);
    }
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

  // Clear completed tasks
  const clearCompletedTasks = () => {
    if (taskManagerRef.current) {
      taskManagerRef.current.clearCompletedTasks();
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
