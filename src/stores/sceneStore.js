import { create } from 'zustand';
import * as THREE from 'three';

export const useSceneStore = create((set, get) => ({
  // Scene state
  scene: null,
  camera: null,
  controls: null,
  renderer: null,
  
  // Current model
  currentModel: null,
  
  // Rendering mode
  renderMode: 'solid', // solid, rendered, wireframe, skeleton, partColorize
  
  // Camera settings
  cameraPosition: new THREE.Vector3(0, 0, 5),
  cameraTarget: new THREE.Vector3(0, 0, 0),
  
  // Lighting
  ambientLight: null,
  directionalLight: null,
  
  // Actions
  setScene: (scene) => set({ scene }),
  setCamera: (camera) => set({ camera }),
  setControls: (controls) => set({ controls }),
  setRenderer: (renderer) => set({ renderer }),
  
  setCurrentModel: (model) => set({ currentModel: model }),
  setRenderMode: (mode) => set({ renderMode: mode }),
  
  setCameraPosition: (position) => set({ cameraPosition: position }),
  setCameraTarget: (target) => set({ cameraTarget: target }),
  
  setAmbientLight: (light) => set({ ambientLight: light }),
  setDirectionalLight: (light) => set({ directionalLight: light }),
  
  // Reset scene
  resetScene: () => set({
    currentModel: null,
    renderMode: 'solid',
    cameraPosition: new THREE.Vector3(0, 0, 5),
    cameraTarget: new THREE.Vector3(0, 0, 0)
  }),
  
  // Update model material based on render mode
  updateModelMaterial: () => {
    const { currentModel, renderMode } = get();
    if (!currentModel) return;
    
    currentModel.traverse((child) => {
      if (child.isMesh) {
        switch (renderMode) {
          case 'solid':
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            break;
          case 'wireframe':
            child.material.wireframe = true;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            break;
          case 'skeleton':
            child.material.wireframe = true;
            child.material.transparent = true;
            child.material.opacity = 0.3;
            break;
          case 'partColorize':
            // Apply different colors to different parts
            const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
            const colorIndex = Math.floor(Math.random() * colors.length);
            child.material.color.setHex(colors[colorIndex]);
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            break;
          case 'rendered':
            child.material.wireframe = false;
            child.material.transparent = false;
            child.material.opacity = 1.0;
            // Apply realistic materials
            if (child.material.map) {
              child.material.needsUpdate = true;
            }
            break;
        }
      }
    });
  }
}));

