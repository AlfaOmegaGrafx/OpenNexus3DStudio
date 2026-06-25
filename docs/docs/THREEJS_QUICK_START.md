# Three.js WebGPU & WebXR Quick Start

Quick reference for using the new Three.js enhancements in OpenNexus3DStudio.

## 🚀 Quick Examples

### Check Renderer Type
```javascript
const info = sceneManager.getRendererInfo();
console.log('Renderer:', info.type); // 'webgpu', 'webgl', or 'software'
console.log('WebXR:', info.capabilities.webxr);
```

### Enable VR Mode
```javascript
// Add VR button to your UI
const vrButton = sceneManager.enableVR();
// Button automatically appears, click to enter VR
```

### Enable Post-Processing
```javascript
// Enable beautiful visual effects
sceneManager.setupPostProcessing({
  enableSSAO: true,   // Ambient occlusion
  enableBloom: true,   // Glow effects  
  enableFXAA: true     // Anti-aliasing
});
```

### Create Spatial Audio
```javascript
// Audio listener is automatically created
const audio = sceneManager.createPositionalAudio({
  position: new THREE.Vector3(0, 1, 0),
  volume: 0.8
});

// Load and play audio
const loader = new THREE.AudioLoader();
loader.load('/audio/sound.mp3', (buffer) => {
  audio.setBuffer(buffer);
  audio.play();
});
```

## 📊 Feature Matrix

| Feature | Status | Performance Impact | Use Case |
|---------|--------|-------------------|----------|
| WebGPU | ✅ Auto | +30-50% faster | Complex scenes, many avatars |
| WebXR | ✅ Ready | Same as desktop | VR/AR experiences |
| Post-Processing | ✅ Optional | -10-18% | Visual quality |
| Spatial Audio | ✅ Ready | Minimal | Lip-sync, immersive audio |

## 🎯 Integration with Face Tracking

```javascript
// When face tracking data arrives from Galaxy XR
function onFaceTrackingData(faceData) {
  const vrm = sceneManager.currentVRM;
  if (!vrm) return;
  
  // Map face parameters to VRM expressions
  const expressions = vrm.expressionManager.expressions;
  expressions.happy.setValue(faceData.blendshapes[0]);
  expressions.tongueOut.setValue(faceData.blendshapes[65]);
  // ... map all 67+ parameters
}
```

## 🔧 Troubleshooting

**WebGPU not working?** → Normal, falls back to WebGL automatically  
**WebXR not available?** → Requires HTTPS and compatible browser  
**Post-processing slow?** → Disable with `setPostProcessingEnabled(false)`

---

For detailed documentation, see [THREEJS_WEBGPU_WEBXR_MIGRATION.md](./THREEJS_WEBGPU_WEBXR_MIGRATION.md)











