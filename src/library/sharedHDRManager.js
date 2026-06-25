/**
 * SharedHDRManager - Manages HDR environment across multiple scenes
 * Ensures consistent lighting and environment across main scene and OpenNexus3DStudio avatar viewport
 */
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

class SharedHDRManager {
  constructor() {
    this.hdrTexture = null;
    this.hdrPath = './hdr/studio_small_09_2k.hdr';
    this.intensity = 0.5;
    this.isLoaded = false;
    this.scenes = new Set(); // Track scenes using this HDR
    this.loader = new HDRLoader();
  }

  /**
   * Load HDR environment and apply to all registered scenes
   */
  loadHDR() {
    if (this.isLoaded) {
      this.applyToAllScenes();
      return;
    }

    this.loader.load(this.hdrPath, (hdrTexture) => {
      // Configure the HDR texture
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
      hdrTexture.colorSpace = THREE.LinearSRGBColorSpace;
      
      this.hdrTexture = hdrTexture;
      this.isLoaded = true;
      
      // Apply to all registered scenes
      this.applyToAllScenes();
      
      console.log('🌅 Shared HDR environment loaded and applied to all scenes');
    }, undefined, (error) => {
      console.error('❌ Failed to load shared HDR environment:', error);
    });
  }

  /**
   * Apply HDR environment to all registered scenes
   */
  applyToAllScenes() {
    if (!this.hdrTexture) return;

    this.scenes.forEach(scene => {
      if (scene && scene.environment !== undefined) {
        scene.environment = this.hdrTexture;
        scene.environmentIntensity = this.intensity;
        // Also set as background for blue sky effect
        scene.background = this.hdrTexture;
      }
    });
  }

  /**
   * Register a scene to use this HDR environment
   */
  registerScene(scene) {
    this.scenes.add(scene);
    if (this.isLoaded) {
      scene.environment = this.hdrTexture;
      scene.environmentIntensity = this.intensity;
      // Also set as background for blue sky effect
      scene.background = this.hdrTexture;
    }
  }

  /**
   * Unregister a scene
   */
  unregisterScene(scene) {
    this.scenes.delete(scene);
  }

  /**
   * Clear HDR environment from all scenes
   */
  clearFromAllScenes() {
    this.scenes.forEach(scene => {
      if (scene && scene.environment !== undefined) {
        scene.environment = null;
      }
    });
  }

  /**
   * Clear HDR environment from a specific scene
   * @param {THREE.Scene} targetScene - The scene to clear HDR from
   */
  clearFromScene(targetScene) {
    if (targetScene && targetScene.environment !== undefined) {
      targetScene.environment = null;
    }
  }

  /**
   * Apply HDR environment to a specific scene
   * @param {THREE.Scene} targetScene - The scene to apply HDR to
   */
  applyToScene(targetScene) {
    if (!this.hdrTexture || !targetScene) return;
    if (targetScene.environment !== undefined) {
      targetScene.environment = this.hdrTexture;
      targetScene.environmentIntensity = this.intensity;
      // Also set as background for blue sky effect
      targetScene.background = this.hdrTexture;
    }
  }

  /**
   * Set HDR intensity for all scenes
   */
  setIntensity(intensity) {
    this.intensity = intensity;
    this.scenes.forEach(scene => {
      if (scene && scene.environmentIntensity !== undefined) {
        scene.environmentIntensity = intensity;
      }
    });
  }

  /**
   * Get current HDR texture
   */
  getHDRTexture() {
    return this.hdrTexture;
  }

  /**
   * Check if HDR is loaded
   */
  isHDRLoaded() {
    return this.isLoaded;
  }
}

// Export singleton instance
export const sharedHDRManager = new SharedHDRManager();
