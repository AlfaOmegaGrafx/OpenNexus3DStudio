import { create } from 'zustand';

export const useTaskStore = create((set, get) => ({
  tasks: [],
  
  addTask: (task) => set((state) => ({
    tasks: [...state.tasks, { ...task, createdAt: new Date() }]
  })),
  
  updateTask: (taskId, updates) => set((state) => ({
    tasks: state.tasks.map(task => 
      task.id === taskId ? { ...task, ...updates, updatedAt: new Date() } : task
    )
  })),
  
  removeTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter(task => task.id !== taskId)
  })),
  
  clearCompletedTasks: () => set((state) => ({
    tasks: state.tasks.filter(task => task.status !== 'completed')
  })),
  
  getTaskById: (taskId) => {
    const state = get();
    return state.tasks.find(task => task.id === taskId);
  },
  
  getTasksByType: (type) => {
    const state = get();
    return state.tasks.filter(task => task.type === type);
  },
  
  getRunningTasks: () => {
    const state = get();
    return state.tasks.filter(task => task.status === 'running');
  }
}));



