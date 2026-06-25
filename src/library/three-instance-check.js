/**
 * Three.js Instance Checker
 * Detects and warns about multiple Three.js instances
 * This helps ensure all modules use the same Three.js instance
 */

let threeInstance = null;
let instanceCount = 0;

/**
 * Check if we have multiple Three.js instances
 * Call this during app initialization
 */
export function checkThreeInstances() {
  if (typeof window === 'undefined') return; // Skip in SSR
  
  // Try to detect multiple instances by checking the global THREE
  const globalThree = window.THREE;
  
  if (globalThree) {
    if (!threeInstance) {
      threeInstance = globalThree;
      instanceCount = 1;
    } else if (globalThree !== threeInstance) {
      instanceCount++;
      console.warn(
        `⚠️ Multiple Three.js instances detected (${instanceCount}). ` +
        `This can cause issues with plugins like @pixiv/three-vrm. ` +
        `Ensure all imports use the centralized Three.js module from './library/three.js'`
      );
    }
  }
  
  // Check for the warning that Three.js itself emits
  // Only intercept if not already set up
  if (!window.__THREE_INSTANCE_CHECK_SETUP__) {
    const originalWarn = console.warn;
    console.warn = function(...args) {
      // Only intercept Three.js multiple instances warnings
      if (args[0] && typeof args[0] === 'string' && args[0].includes('Multiple instances') && args[0].includes('Three.js')) {
        originalWarn(
          '⚠️ Three.js Multiple Instances Warning Detected\n' +
          'To fix this:\n' +
          '1. Import from the centralized module: import * as THREE from "./library/three.js"\n' +
          '2. Check that @pixiv/three-vrm is using the same instance\n' +
          '3. Clear node_modules/.vite cache and restart dev server'
        );
        return; // Don't call original warn for this specific case
      }
      // Pass through all other warnings normally
      originalWarn.apply(console, args);
    };
    window.__THREE_INSTANCE_CHECK_SETUP__ = true;
  }
}

/**
 * Get the current Three.js instance count
 */
export function getInstanceCount() {
  return instanceCount;
}

/**
 * Reset the instance checker (useful for testing)
 */
export function resetInstanceCheck() {
  threeInstance = null;
  instanceCount = 0;
}

