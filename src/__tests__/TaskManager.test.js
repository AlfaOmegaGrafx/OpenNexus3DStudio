import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskManager, ensureAbsoluteUrl } from '../library/taskManager';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

describe('ensureAbsoluteUrl', () => {
  it('resolves path-only base against window.location.origin', () => {
    vi.stubGlobal('window', { location: { origin: 'https://10.0.0.32:3000' } })
    expect(ensureAbsoluteUrl('/__dev_dgx_proxy')).toBe('https://10.0.0.32:3000/__dev_dgx_proxy')
    vi.unstubAllGlobals()
  })
})

describe('TaskManager', () => {
  let taskManager;

  beforeEach(() => {
    taskManager = new TaskManager('http://api.example.com');
  });

  afterEach(() => {
    if (taskManager) {
      taskManager.dispose();
    }
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      expect(taskManager.apiEndpoint).toBe('http://api.example.com');
      expect(taskManager.tasks.size).toBe(0);
      expect(taskManager.isConnected).toBe(false);
      expect(taskManager.supportedTypes).toContain('text-to-3d');
      expect(taskManager.supportedTypes).toContain('image-to-3d');
    });

    it('should set API endpoint correctly', () => {
      const newEndpoint = 'http://new-endpoint:9000';
      taskManager.setApiEndpoint(newEndpoint);
      expect(taskManager.apiEndpoint).toBe(newEndpoint);
    });
  });

  describe('task creation', () => {
    it('should create a task successfully', () => {
      const taskData = {
        type: 'text-to-3d',
        prompt: 'A red car',
        options: { object_name: 'Red Car' },
      };

      const task = taskManager.createTask(taskData);
      
      expect(task).toHaveProperty('id');
      expect(task.type).toBe('text-to-3d');
      expect(task.prompt).toBe('A red car');
      expect(task.name).toBe('Red Car');
      expect(task.options.object_name).toBe('Red Car');
      expect(task.status).toBe('pending');
      expect(task.progress).toBe(0);
      expect(taskManager.tasks.has(task.id)).toBe(true);
    });

    it('should reject unsupported task types', () => {
      const taskData = {
        type: 'unsupported-type',
        prompt: 'Test prompt'
      };

      expect(() => taskManager.createTask(taskData)).toThrow('Unsupported task type: unsupported-type');
    });

    it('should reject tasks without object_name', () => {
      expect(() =>
        taskManager.createTask({
          type: 'text-to-3d',
          prompt: 'A red car',
        }),
      ).toThrow(/Object name is required/);
    });
  });

  describe('task management', () => {
    let testTask;

    beforeEach(() => {
      testTask = taskManager.createTask({
        type: 'text-to-3d',
        prompt: 'Test prompt',
        options: { object_name: 'Test Object' },
      });
    });

    it('should get task by ID', () => {
      const retrievedTask = taskManager.getTask(testTask.id);
      expect(retrievedTask).toEqual(testTask);
    });

    it('should get all tasks', () => {
      const allTasks = taskManager.getAllTasks();
      expect(allTasks).toHaveLength(1);
      expect(allTasks[0]).toEqual(testTask);
    });

    it('should get tasks by status', () => {
      const pendingTasks = taskManager.getTasksByStatus('pending');
      expect(pendingTasks).toHaveLength(1);
      expect(pendingTasks[0]).toEqual(testTask);
    });

    it('should get tasks by type', () => {
      const textTo3DTasks = taskManager.getTasksByType('text-to-3d');
      expect(textTo3DTasks).toHaveLength(1);
      expect(textTo3DTasks[0]).toEqual(testTask);
    });

    it('should remove task', () => {
      taskManager.removeTask(testTask.id);
      expect(taskManager.tasks.has(testTask.id)).toBe(false);
    });

    it('should get task statistics', () => {
      const stats = taskManager.getTaskStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('event system', () => {
    it('should emit events correctly', () => {
      const callback = vi.fn();
      taskManager.on('testEvent', callback);
      taskManager.emit('testEvent', { data: 'test' });
      
      expect(callback).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should remove event listeners', () => {
      const callback = vi.fn();
      taskManager.on('testEvent', callback);
      taskManager.off('testEvent', callback);
      taskManager.emit('testEvent', { data: 'test' });
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should dispose resources correctly', () => {
      taskManager.createTask({
        type: 'text-to-3d',
        prompt: 'Test',
        options: { object_name: 'Test' },
      });
      
      expect(taskManager.tasks.size).toBe(1);
      
      taskManager.dispose();
      
      expect(taskManager.tasks.size).toBe(0);
    });
  });
});




