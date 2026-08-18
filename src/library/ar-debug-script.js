/**
 * AR Debugging Script for Galaxy XR
 * 
 * Run this script in the Chrome DevTools console when inspecting the device via chrome://inspect
 * 
 * Usage:
 * 1. Open chrome://inspect/#devices on your PC
 * 2. Find your Galaxy XR device (OpenNexus3DStudio: SPACE-TIME EDITION)
 * 3. Click "inspect" next to https://10.0.0.32:3002/
 * 4. Open the Console tab
 * 5. Paste this entire script and press Enter
 * 6. Click the AR button and watch the console output
 */

(function() {
  console.log('🔍 AR Debugging Script Started');
  console.log('================================');
  
  // Store original console methods
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  // Enhanced logging
  const log = (...args) => {
    originalLog('%c🔍 AR Debug:', 'color: blue; font-weight: bold', ...args);
  };
  
  const warn = (...args) => {
    originalWarn('%c⚠️ AR Warning:', 'color: orange; font-weight: bold', ...args);
  };
  
  const error = (...args) => {
    originalError('%c❌ AR Error:', 'color: red; font-weight: bold', ...args);
  };
  
  // Check environment
  log('Checking environment...');
  const envCheck = {
    hasWindow: typeof window !== 'undefined',
    hasNavigator: typeof navigator !== 'undefined',
    hasDocument: typeof document !== 'undefined',
    userAgent: navigator?.userAgent || 'N/A',
    location: window?.location?.href || 'N/A',
    isSecureContext: window?.isSecureContext || false,
    hostname: window?.location?.hostname || 'N/A'
  };
  console.table(envCheck);
  
  // Check WebXR API
  log('Checking WebXR API...');
  const webxrCheck = {
    hasNavigatorXR: !!(navigator && navigator.xr),
    xrType: typeof navigator?.xr,
    xrKeys: navigator?.xr ? Object.keys(navigator.xr).slice(0, 10) : [],
    hasRequestSession: typeof navigator?.xr?.requestSession === 'function',
    hasIsSessionSupported: typeof navigator?.xr?.isSessionSupported === 'function'
  };
  console.table(webxrCheck);
  
  if (!navigator.xr) {
    error('navigator.xr is not available!');
    error('WebXR is not supported in this browser.');
    return;
  }
  
  // Check AR session support
  log('Checking AR session support...');
  navigator.xr.isSessionSupported('immersive-ar')
    .then(supported => {
      log('AR session support:', supported);
      if (!supported) {
        warn('AR is not supported on this device');
        // Check VR support
        return navigator.xr.isSessionSupported('immersive-vr');
      }
      return Promise.resolve(true);
    })
    .then(vrSupported => {
      if (vrSupported !== true) {
        log('VR session support:', vrSupported);
      }
    })
    .catch(err => {
      error('Error checking session support:', err);
    });
  
  // Check for SceneManager
  log('Checking for SceneManager...');
  const sceneManagerCheck = {
    hasWindowSceneManager: !!(window.sceneManager),
    hasGlobalSceneManager: typeof sceneManager !== 'undefined',
    sceneManagerType: typeof window.sceneManager || typeof sceneManager,
    hasEnableAR: !!(window.sceneManager?.enableAR || (typeof sceneManager !== 'undefined' && sceneManager?.enableAR)),
    sceneManagerKeys: window.sceneManager ? Object.keys(window.sceneManager).slice(0, 20) : []
  };
  console.table(sceneManagerCheck);
  
  // Find SceneManager instance
  let sceneManager = null;
  if (window.sceneManager) {
    sceneManager = window.sceneManager;
    log('Found sceneManager on window.sceneManager');
  } else if (typeof sceneManager !== 'undefined') {
    sceneManager = sceneManager;
    log('Found sceneManager as global variable');
  } else {
    // Try to find it in React context or other places
    warn('SceneManager not found on window or as global. Trying to find it...');
    
    // Check React DevTools
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      log('React DevTools found, SceneManager might be in React context');
    }
  }
  
  // Check renderer
  if (sceneManager) {
    log('Checking renderer...');
    const rendererCheck = {
      hasRenderer: !!sceneManager.renderer,
      rendererType: sceneManager.rendererType,
      hasRendererXR: !!(sceneManager.renderer?.xr),
      hasXRRenderer: !!sceneManager.xrRenderer,
      rendererXRKeys: sceneManager.renderer?.xr ? Object.keys(sceneManager.renderer.xr).slice(0, 10) : [],
      hasSetSession: typeof sceneManager.renderer?.xr?.setSession === 'function'
    };
    console.table(rendererCheck);
  }
  
  // Monitor AR button clicks
  log('Setting up AR button click monitoring...');
  const arButtons = document.querySelectorAll('button[title*="AR"], button[title*="ar"], button:has-text("📱")');
  log(`Found ${arButtons.length} potential AR buttons`);
  
  arButtons.forEach((btn, index) => {
    log(`AR Button ${index}:`, {
      text: btn.textContent,
      title: btn.title,
      className: btn.className,
      onclick: btn.onclick ? 'has onclick' : 'no onclick'
    });
    
    // Wrap the click handler
    const originalClick = btn.onclick;
    btn.addEventListener('click', function(e) {
      log('AR Button clicked!', {
        button: this,
        event: e,
        timestamp: new Date().toISOString()
      });
      
      // Check if SceneManager is available at click time
      setTimeout(() => {
        log('Post-click SceneManager check:', {
          hasSceneManager: !!(window.sceneManager || (typeof sceneManager !== 'undefined' && sceneManager)),
          hasEnableAR: !!(window.sceneManager?.enableAR || (typeof sceneManager !== 'undefined' && sceneManager?.enableAR))
        });
      }, 100);
    }, true);
  });
  
  // Test AR session request directly
  log('Setting up test AR session request function...');
  window.testARSession = async function() {
    log('🧪 Testing AR session request...');
    
    try {
      if (!navigator.xr) {
        error('navigator.xr is not available');
        return;
      }
      
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      log('AR supported:', supported);
      
      if (!supported) {
        warn('AR is not supported on this device');
        return;
      }
      
      log('Requesting AR session...');
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: [],
        optionalFeatures: []
      });
      
      log('✅ AR session created:', session);
      log('Session details:', {
        inputSources: session.inputSources?.length || 0,
        environmentBlendMode: session.environmentBlendMode,
        interactionMode: session.interactionMode
      });
      
      // End session immediately for testing
      await session.end();
      log('✅ Test session ended');
      
    } catch (err) {
      error('❌ Test AR session failed:', err);
      error('Error details:', {
        message: err.message,
        name: err.name,
        stack: err.stack
      });
    }
  };
  
  log('✅ AR Debugging Script Loaded');
  log('================================');
  log('Available commands:');
  log('  - testARSession() - Test AR session request directly');
  log('  - Click the AR button and watch the console for detailed logs');
  log('================================');
  
  return {
    testARSession: window.testARSession,
    envCheck,
    webxrCheck,
    sceneManagerCheck
  };
})();








