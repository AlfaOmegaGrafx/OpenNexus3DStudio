import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SceneManager } from '../library/sceneManager';

// Mock Three.js
vi.mock('three', () => ({
  Scene: vi.fn(() => ({
    add: vi.fn(),
    remove: vi.fn(),
    getObjectByName: vi.fn()
  })),
  PerspectiveCamera: vi.fn(() => ({
    position: { set: vi.fn() },
    aspect: 1,
    updateProjectionMatrix: vi.fn()
  })),
  WebGLRenderer: vi.fn(() => ({
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    shadowMap: { enabled: false, type: null },
    toneMapping: null,
    toneMappingExposure: 1.0,
    domElement: document.createElement('canvas'),
    render: vi.fn(),
    dispose: vi.fn()
  })),
  Color: vi.fn(),
  AmbientLight: vi.fn(() => ({ castShadow: false })),
  DirectionalLight: vi.fn(() => ({
    position: { set: vi.fn() },
    castShadow: true,
    shadow: {
      mapSize: { width: 2048, height: 2048 },
      camera: { near: 0.5, far: 50 }
    }
  })),
  GridHelper: vi.fn(),
  AxesHelper: vi.fn(),
  Box3: vi.fn(() => ({
    setFromObject: vi.fn(() => ({
      getCenter: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
      getSize: vi.fn(() => ({ x: 1, y: 1, z: 1 }))
    }))
  })),
  Vector3: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
  RepeatWrapping: 1000,
  LinearFilter: 1006,
  PCFSoftShadowMap: 2,
  ACESFilmicToneMapping: 1
}));

// Mock Three.js loaders
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn(() => ({
    load: vi.fn()
  }))
}));

vi.mock('three/examples/jsm/loaders/OBJLoader.js', () => ({
  OBJLoader: vi.fn(() => ({
    load: vi.fn()
  }))
}));

vi.mock('three/examples/jsm/loaders/FBXLoader.js', () => ({
  FBXLoader: vi.fn(() => ({
    load: vi.fn()
  }))
}));

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn(() => ({
    enableDamping: true,
    dampingFactor: 0.05,
    update: vi.fn(),
    dispose: vi.fn()
  }))
}));

describe('SceneManager', () => {
  let sceneManager;
  let mockContainer;

  beforeEach(() => {
    sceneManager = new SceneManager();
    mockContainer = document.createElement('div');
    mockContainer.clientWidth = 800;
    mockContainer.clientHeight = 600;
    mockContainer.appendChild = vi.fn();
  });

  afterEach(() => {
    if (sceneManager) {
      sceneManager.dispose();
    }
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      expect(sceneManager.scene).toBeNull();
      expect(sceneManager.camera).toBeNull();
      expect(sceneManager.renderer).toBeNull();
      expect(sceneManager.controls).toBeNull();
      expect(sceneManager.currentModel).toBeNull();
      expect(sceneManager.renderMode).toBe('solid');
      expect(sceneManager.isInitialized).toBe(false);
    });

    it('should initialize scene successfully', async () => {
      const result = await sceneManager.initialize(mockContainer);
      
      expect(result).toHaveProperty('scene');
      expect(result).toHaveProperty('camera');
      expect(result).toHaveProperty('renderer');
      expect(result).toHaveProperty('controls');
      expect(sceneManager.isInitialized).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const invalidContainer = null;
      
      await expect(sceneManager.initialize(invalidContainer)).rejects.toThrow();
    });
  });

  describe('file operations', () => {
    it('should get file extension correctly', () => {
      const file = new File([''], 'test.glb', { type: 'model/gltf-binary' });
      const extension = sceneManager.getFileExtension(file.name);
      expect(extension).toBe('glb');
    });

    it('should handle different file extensions', () => {
      expect(sceneManager.getFileExtension('model.obj')).toBe('obj');
      expect(sceneManager.getFileExtension('model.fbx')).toBe('fbx');
      expect(sceneManager.getFileExtension('model.gltf')).toBe('gltf');
    });
  });

  describe('render modes', () => {
    it('should set render mode correctly', () => {
      sceneManager.setRenderMode('wireframe');
      expect(sceneManager.renderMode).toBe('wireframe');
    });

    it('should handle all supported render modes', () => {
      const modes = ['solid', 'rendered', 'wireframe', 'skeleton', 'partColorize'];
      
      modes.forEach(mode => {
        sceneManager.setRenderMode(mode);
        expect(sceneManager.renderMode).toBe(mode);
      });
    });
  });

  describe('event system', () => {
    it('should emit events correctly', () => {
      const callback = vi.fn();
      sceneManager.on('testEvent', callback);
      sceneManager.emit('testEvent', { data: 'test' });
      
      expect(callback).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should remove event listeners', () => {
      const callback = vi.fn();
      sceneManager.on('testEvent', callback);
      sceneManager.off('testEvent', callback);
      sceneManager.emit('testEvent', { data: 'test' });
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should dispose resources correctly', () => {
      sceneManager.dispose();
      expect(sceneManager.isInitialized).toBe(false);
    });
  });
});

