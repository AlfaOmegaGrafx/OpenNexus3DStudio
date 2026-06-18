/**
 * AR Floor Anchoring Fix Script for Galaxy XR
 * 
 * Run this script in the Chrome DevTools console when inspecting the device via chrome://inspect
 * 
 * This script will:
 * 1. Check the current AR setup and model positioning
 * 2. Calculate the model's bounding box
 * 3. Adjust the AR scene offset to properly anchor the model to the floor
 * 
 * Usage:
 * 1. Open chrome://inspect/#devices on your PC
 * 2. Find your Galaxy XR device (OpenNexus3DStudio: SPACE-TIME EDITION)
 * 3. Click "inspect" next to https://10.0.0.32:3000/
 * 4. Open the Console tab
 * 5. Paste this entire script and press Enter
 * 6. Run: fixARFloorAnchoring()
 */

(function() {
  console.log('🔧 AR Floor Anchoring Fix Script Loaded');
  console.log('==========================================');
  
  /**
   * Find SceneManager instance
   */
  function findSceneManager() {
    if (window.sceneManager) {
      return window.sceneManager;
    }
    
    // Try to find it in React context
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      const reactInstances = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers;
      if (reactInstances && reactInstances.size > 0) {
        const renderer = Array.from(reactInstances.values())[0];
        // Try to find SceneManager in React tree
        console.log('🔍 React DevTools found, but SceneManager search in React tree is complex');
      }
    }
    
    // Try global variable
    if (typeof sceneManager !== 'undefined') {
      return sceneManager;
    }
    
    return null;
  }
  
  /**
   * Calculate model bounding box and adjust AR scene offset
   */
  function calculateModelFloorPosition(sceneManager) {
    if (!sceneManager || !sceneManager.scene) {
      console.error('❌ SceneManager or scene not available');
      return null;
    }
    
    const scene = sceneManager.scene;
    const arSceneOffset = sceneManager.arSceneOffset;
    
    if (!arSceneOffset) {
      console.warn('⚠️ AR scene offset not found - AR mode may not be active');
      return null;
    }
    
    // Find all models in the AR scene offset
    const models = [];
    arSceneOffset.traverse((child) => {
      if (child.isMesh || child.isGroup) {
        // Skip helpers and lights
        if (!child.name.includes('Helper') && 
            !(child instanceof THREE.Light) &&
            !(child instanceof THREE.GridHelper) &&
            !(child instanceof THREE.AxesHelper)) {
          models.push(child);
        }
      }
    });
    
    if (models.length === 0) {
      console.warn('⚠️ No models found in AR scene offset');
      return null;
    }
    
    console.log(`📦 Found ${models.length} model(s) in AR scene offset`);
    
    // Calculate bounding box of all models
    const boundingBox = new THREE.Box3();
    let hasValidBox = false;
    
    models.forEach((model, index) => {
      const modelBox = new THREE.Box3().setFromObject(model);
      if (!modelBox.isEmpty() && 
          isFinite(modelBox.min.y) && 
          isFinite(modelBox.max.y)) {
        boundingBox.union(modelBox);
        hasValidBox = true;
        console.log(`📦 Model ${index + 1} bounding box:`, {
          min: modelBox.min,
          max: modelBox.max,
          size: modelBox.getSize(new THREE.Vector3())
        });
      }
    });
    
    if (!hasValidBox) {
      console.error('❌ Could not calculate valid bounding box');
      return null;
    }
    
    const boxSize = boundingBox.getSize(new THREE.Vector3());
    const boxCenter = boundingBox.getCenter(new THREE.Vector3());
    const boxMin = boundingBox.min;
    const boxMax = boundingBox.max;
    
    console.log('📐 Combined bounding box:', {
      min: boxMin,
      max: boxMax,
      center: boxCenter,
      size: boxSize
    });
    
    // The model's bottom is at boxMin.y (in local space of arSceneOffset)
    // We want the model's bottom to be at Y=0 in the reference space (physical floor)
    // So we need to adjust arSceneOffset.position.y by -boxMin.y
    const currentOffsetY = arSceneOffset.position.y;
    const modelBottomY = boxMin.y;
    const adjustmentY = -modelBottomY;
    const newOffsetY = currentOffsetY + adjustmentY;
    
    console.log('📐 Floor anchoring calculation:', {
      currentOffsetY: currentOffsetY,
      modelBottomY: modelBottomY,
      adjustmentY: adjustmentY,
      newOffsetY: newOffsetY
    });
    
    return {
      boundingBox,
      boxSize,
      boxCenter,
      boxMin,
      boxMax,
      modelBottomY,
      currentOffsetY,
      adjustmentY,
      newOffsetY
    };
  }
  
  /**
   * Fix AR floor anchoring
   */
  window.fixARFloorAnchoring = async function() {
    console.log('🔧 Starting AR floor anchoring fix...');
    
    const sceneManager = findSceneManager();
    if (!sceneManager) {
      console.error('❌ SceneManager not found!');
      console.log('💡 Make sure the app is loaded and SceneManager is initialized');
      return false;
    }
    
    console.log('✅ SceneManager found');
    
    // Check if AR is active
    const isARActive = sceneManager.renderer?.xr?.isPresenting || 
                       sceneManager.xrRenderer?.xr?.isPresenting;
    
    if (!isARActive) {
      console.warn('⚠️ AR mode is not active');
      console.log('💡 Please enter AR mode first by clicking the AR button');
      return false;
    }
    
    console.log('✅ AR mode is active');
    
    // Check reference space
    const referenceSpace = sceneManager.xrReferenceSpace;
    const referenceSpaceType = sceneManager.arReferenceSpaceType;
    const hasFloorAlignment = sceneManager.arHasFloorAlignment;
    
    console.log('📐 Reference space info:', {
      hasReferenceSpace: !!referenceSpace,
      referenceSpaceType: referenceSpaceType,
      hasFloorAlignment: hasFloorAlignment
    });
    
    if (!hasFloorAlignment) {
      console.warn('⚠️ Not using floor-aligned reference space');
      console.log('💡 Floor anchoring works best with "local-floor" or "bounded-floor" reference space');
    }
    
    // Calculate model position
    const positionInfo = calculateModelFloorPosition(sceneManager);
    if (!positionInfo) {
      console.error('❌ Could not calculate model position');
      return false;
    }
    
    // Apply the fix
    const arSceneOffset = sceneManager.arSceneOffset;
    if (!arSceneOffset) {
      console.error('❌ AR scene offset not found');
      return false;
    }
    
    // Store original position
    const originalPosition = arSceneOffset.position.clone();
    console.log('📐 Original AR scene offset position:', originalPosition);
    
    // Update position to anchor model to floor
    const newPosition = new THREE.Vector3(
      arSceneOffset.position.x,
      positionInfo.newOffsetY,
      arSceneOffset.position.z
    );
    
    arSceneOffset.position.copy(newPosition);
    
    // Update fixed position in userData
    if (arSceneOffset.userData.fixedPosition) {
      arSceneOffset.userData.fixedPosition.y = newPosition.y;
    } else {
      arSceneOffset.userData.fixedPosition = { 
        x: newPosition.x, 
        y: newPosition.y, 
        z: newPosition.z 
      };
    }
    
    console.log('✅ AR scene offset position updated:', {
      from: originalPosition,
      to: newPosition,
      adjustment: positionInfo.adjustmentY
    });
    
    console.log('✅ Floor anchoring fix applied!');
    console.log('💡 The model should now be properly anchored to the physical floor');
    
    return true;
  };
  
  /**
   * Check current AR setup and model position
   */
  window.checkARFloorAnchoring = function() {
    console.log('🔍 Checking AR floor anchoring setup...');
    
    const sceneManager = findSceneManager();
    if (!sceneManager) {
      console.error('❌ SceneManager not found!');
      return null;
    }
    
    const info = {
      isARActive: !!(sceneManager.renderer?.xr?.isPresenting || 
                     sceneManager.xrRenderer?.xr?.isPresenting),
      hasARSceneOffset: !!sceneManager.arSceneOffset,
      referenceSpaceType: sceneManager.arReferenceSpaceType,
      hasFloorAlignment: sceneManager.arHasFloorAlignment,
      arSceneOffsetPosition: sceneManager.arSceneOffset?.position?.clone() || null,
      fixedPosition: sceneManager.arSceneOffset?.userData?.fixedPosition || null
    };
    
    console.table(info);
    
    if (info.hasARSceneOffset) {
      const positionInfo = calculateModelFloorPosition(sceneManager);
      if (positionInfo) {
        console.log('📐 Model position analysis:', {
          modelBottomY: positionInfo.modelBottomY,
          currentOffsetY: positionInfo.currentOffsetY,
          shouldBeAtFloor: positionInfo.modelBottomY + positionInfo.currentOffsetY,
          needsAdjustment: Math.abs(positionInfo.adjustmentY) > 0.01
        });
        
        if (Math.abs(positionInfo.adjustmentY) > 0.01) {
          console.warn('⚠️ Model may not be properly anchored to floor');
          console.log('💡 Run fixARFloorAnchoring() to fix this');
        } else {
          console.log('✅ Model appears to be properly anchored to floor');
        }
      }
    }
    
    return info;
  };
  
  /**
   * Manually adjust AR scene offset position
   */
  window.adjustARPosition = function(x, y, z) {
    const sceneManager = findSceneManager();
    if (!sceneManager || !sceneManager.arSceneOffset) {
      console.error('❌ AR scene offset not found');
      return false;
    }
    
    const originalPosition = sceneManager.arSceneOffset.position.clone();
    sceneManager.arSceneOffset.position.set(x, y, z);
    
    // Update fixed position
    if (sceneManager.arSceneOffset.userData.fixedPosition) {
      sceneManager.arSceneOffset.userData.fixedPosition = { x, y, z };
    }
    
    console.log('✅ AR position adjusted:', {
      from: originalPosition,
      to: { x, y, z }
    });
    
    return true;
  };
  
  console.log('✅ AR Floor Anchoring Fix Script Ready');
  console.log('==========================================');
  console.log('Available commands:');
  console.log('  - checkARFloorAnchoring() - Check current AR setup');
  console.log('  - fixARFloorAnchoring() - Fix floor anchoring automatically');
  console.log('  - adjustARPosition(x, y, z) - Manually adjust AR position');
  console.log('==========================================');
  
  // Auto-run check if AR is active
  setTimeout(() => {
    const sceneManager = findSceneManager();
    if (sceneManager && (sceneManager.renderer?.xr?.isPresenting || 
                         sceneManager.xrRenderer?.xr?.isPresenting)) {
      console.log('🔍 AR mode detected, running automatic check...');
      checkARFloorAnchoring();
    }
  }, 1000);
  
  return {
    checkARFloorAnchoring: window.checkARFloorAnchoring,
    fixARFloorAnchoring: window.fixARFloorAnchoring,
    adjustARPosition: window.adjustARPosition
  };
})();
