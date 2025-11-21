/**
 * Centralized Three.js export
 * This ensures all modules use the same Three.js instance
 * Import from this file instead of directly from 'three'
 * 
 * Usage:
 *   import * as THREE from '../library/three.js';
 *   import { GLTFLoader } from '../library/three.js';
 */

// Re-export everything from three
export * from 'three';

// Re-export commonly used loaders and utilities
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
export { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
export { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
export { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
export { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
export { FlyControls } from 'three/examples/jsm/controls/FlyControls.js';
export { FirstPersonControls } from 'three/examples/jsm/controls/FirstPersonControls.js';
export { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
export { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
export { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
export { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
export { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
export { AsciiEffect } from 'three/examples/jsm/effects/AsciiEffect.js';
export { StereoEffect } from 'three/examples/jsm/effects/StereoEffect.js';
export { AnaglyphEffect } from 'three/examples/jsm/effects/AnaglyphEffect.js';
export { PeppersGhostEffect } from 'three/examples/jsm/effects/PeppersGhostEffect.js';
export { ParallaxBarrierEffect } from 'three/examples/jsm/effects/ParallaxBarrierEffect.js';

// Export the default THREE namespace for convenience
import * as THREE from 'three';
export default THREE;

