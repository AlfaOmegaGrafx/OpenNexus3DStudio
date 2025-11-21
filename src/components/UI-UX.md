# 🎨 Enhanced 3D Scene Controls

## Overview

The enhanced SceneManager now includes advanced 3D scene controls for professional 3D model visualization and manipulation. This includes improved lighting, camera controls, rendering modes, and real-time scene management.

## 🚀 New Features

### **Advanced Rendering Modes**
- **Solid**: Standard rendered view with full materials
- **Wireframe**: Mesh wireframe overlay for topology analysis
- **Skeleton**: Bone structure visualization for rigged models
- **Normal Map**: Surface normal visualization for material analysis
- **UV Map**: Texture coordinate visualization with grid overlay
- **Depth**: Depth buffer visualization for scene analysis
- **Part Colors**: Random part coloring for model segmentation

### **Professional Lighting System**
- **3-Point Lighting**: Key, fill, and rim lights with enhanced shadows
- **Dynamic Intensity**: Real-time lighting intensity adjustment
- **Light Type Control**: Toggle ambient, directional, point, and hemisphere lights
- **Enhanced Shadows**: 4K shadow maps with reduced shadow acne
- **Rim Lighting**: Additional accent lighting for better model definition

### **Enhanced Camera Controls**
- **Predefined Positions**: Front, back, left, right, top, bottom views
- **Auto-Rotation**: Smooth model rotation with adjustable speed
- **Improved Orbit Controls**: Better damping and constraint limits
- **Target Focus**: Automatic focus on human-height models

### **Tone Mapping & Exposure**
- **Multiple Tone Mappings**: ACES Filmic, Reinhard, Cineon, Linear
- **Exposure Control**: Real-time exposure adjustment
- **Color Space**: Proper sRGB color space handling

## 📖 Usage

### **Basic Integration**

```jsx
import { SceneManager } from '../library/sceneManager';
import SceneControls from './SceneControls';

// Initialize enhanced scene manager
const sceneManager = new SceneManager();
await sceneManager.initialize(container, {
  enableShadows: true,
  enableAntialias: true
});

// Add scene controls
<SceneControls
  sceneManager={sceneManager}
  onRenderModeChange={(mode) => console.log('Mode:', mode)}
  onLightingChange={(lighting) => console.log('Lighting:', lighting)}
/>
```

### **Advanced Scene Management**

```javascript
// Set rendering mode
sceneManager.setRenderMode('wireframe');

// Adjust lighting
sceneManager.setLightingIntensity(1.5);
sceneManager.toggleLightType('ambient', false);

// Camera controls
sceneManager.setCameraPosition('front');
sceneManager.setAutoRotation(true, 2.0);

// Tone mapping
sceneManager.setToneMapping('ACESFilmic', 1.2);
```

### **Rendering Modes**

```javascript
// Available modes
const modes = [
  'solid',        // Standard rendering
  'wireframe',    // Wireframe overlay
  'skeleton',     // Bone visualization
  'normal',       // Normal map view
  'uv',           // UV coordinate view
  'depth',        // Depth buffer view
  'partColorize'  // Random part colors
];

modes.forEach(mode => {
  sceneManager.setRenderMode(mode);
});
```

### **Lighting Control**

```javascript
// Adjust overall lighting intensity
sceneManager.setLightingIntensity(2.0);

// Toggle specific light types
sceneManager.toggleLightType('ambient', true);
sceneManager.toggleLightType('directional', false);
sceneManager.toggleLightType('point', true);
sceneManager.toggleLightType('hemisphere', true);
```

### **Camera Management**

```javascript
// Set camera to predefined positions
sceneManager.setCameraPosition('front');
sceneManager.setCameraPosition('back');
sceneManager.setCameraPosition('left');
sceneManager.setCameraPosition('right');
sceneManager.setCameraPosition('top');
sceneManager.setCameraPosition('bottom');

// Auto-rotation
sceneManager.setAutoRotation(true, 1.5); // Enable with speed 1.5x
sceneManager.setAutoRotation(false);     // Disable
```

## 🎯 Performance Optimizations

### **Enhanced Shadow Quality**
- 4K shadow maps for crisp shadows
- Reduced shadow acne with bias adjustment
- Optimized shadow camera bounds

### **Improved Material Handling**
- Better material property management
- Enhanced wireframe material setup
- Optimized texture handling

### **Memory Management**
- Proper light reference storage
- Efficient scene traversal
- Optimized render loop

## 🔧 Integration Examples

### **React Component Integration**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { SceneManager } from '../library/sceneManager';
import SceneControls from './SceneControls';

const My3DViewer = () => {
  const containerRef = useRef(null);
  const [sceneManager, setSceneManager] = useState(null);

  useEffect(() => {
    const initScene = async () => {
      const manager = new SceneManager();
      await manager.initialize(containerRef.current);
      setSceneManager(manager);
    };
    
    initScene();
  }, []);

  return (
    <div className="viewer-container">
      <div ref={containerRef} className="viewport" />
      <SceneControls sceneManager={sceneManager} />
    </div>
  );
};
```

### **Event Handling**

```javascript
// Listen for scene events
sceneManager.on('initialized', (data) => {
  console.log('Scene initialized:', data);
});

sceneManager.on('modelLoaded', (model) => {
  console.log('Model loaded:', model);
});

// Custom render mode handling
const handleRenderModeChange = (mode) => {
  sceneManager.setRenderMode(mode);
  
  // Custom logic based on mode
  switch(mode) {
    case 'skeleton':
      // Enable bone selection
      break;
    case 'wireframe':
      // Show topology info
      break;
    case 'normal':
      // Show material analysis
      break;
  }
};
```

## 🎨 UI Components

### **SceneControls Component**
- **Rendering Modes**: Grid of mode buttons with descriptions
- **Camera Controls**: Predefined position buttons
- **Lighting Controls**: Intensity slider and light type toggles
- **Tone Mapping**: Dropdown and exposure slider
- **Quick Actions**: Reset view, auto-rotate, wireframe toggle

### **SceneControlsDemo Component**
- **Full Demo**: Complete example with viewport and controls
- **File Upload**: Drag & drop 3D model loading
- **Scene Stats**: Real-time triangle, vertex, and material counts
- **Feature Highlights**: Showcase of new capabilities

## 🎛️ SceneControlsCompact UI Setup

### **Current UI Layout (Saved)**

The `SceneControlsCompact` component provides a compact header-based control interface for 3D scene management. The current UI setup includes:

#### **1. Lighting Controls**
- **Lighting Dropdown**: Select lighting preset
  - Options: Studio, Outdoor, Indoor, Dramatic, Soft, Harsh
  - Label: "Lighting"
  - Uses `setLighting()` from SceneContext

- **Light Intensity Slider**: Adjust overall lighting intensity
  - Range: 0.0 to 2.0
  - Step: 0.1
  - Display: Shows current value (e.g., "1.0")
  - Label: "Light:"
  - Uses `setLightIntensity()` from SceneContext

#### **2. View Selector**
- **View Dropdown**: Select camera view position
  - Options: Select View, Front, Back, Left, Right, Top, Bottom, Isometric
  - Label: "View:"
  - Behavior depends on View Look Lock state (see below)

- **Position Lock Button** (🔒/🔓)
  - **Locked (🔒)**: When enabled, all view options (Front, Back, Left, Right, Top, Bottom, Isometric) are available, but each view ensures the **full model is visible** by calculating optimal camera distance based on model bounding box.
  - **Unlocked (🔓)**: When disabled (default), view selection moves the camera around the model using standard `setView()` behavior. All view options are available.
  - Title: "Position Locked - Views show full model" / "Position Unlocked - All view options available"
  - Active state: Button shows as active when locked
  - When locked: Uses custom calculation with model bounding box to ensure full model visibility
  - When unlocked: Uses `setView()` from SceneContext

#### **2.1 Layout & Spacing**
- **Hamburger Anchors**: Left and right hamburger buttons are fixed at `top: 139px` and never move, keeping the control bar perfectly aligned between them.
- **Control Bar Width**: `.scene-controls-compact` width is clamped to `min(calc(100vw - 460px), 880px)` (and smaller at responsive breakpoints) to ensure the "Lighting" label and other text stay readable inside the hamburger boundaries.
- **Compact Spacing**: Reduced gaps (8px desktop, 6px/4px responsive) and smaller padding (6px desktop, 5px/4px responsive) keep the toolbar tight while maintaining click/tap comfort.

#### **3. Camera Controls**
- **Camera Mode Dropdown**: Select camera control mode
  - Options: Orbit, First Person, Fixed
  - Label: "Camera"
  - Uses `setCameraMode()` from SceneContext

- **Focus on Model Button** (🎯)
  - Title: "Focus on Model"
  - Uses `sceneManager.focusOnModel()`

- **Focus on Face Button** (👤)
  - Title: "Focus on Face"
  - Uses `focusOnFace()` from SceneContext

- **Reset Camera Button** (🔄)
  - Title: "Reset Camera"
  - Uses `resetCamera()` from SceneContext

#### **4. Tools Section**
- **Toggle Stats Button** (📊)
  - Title: "Toggle Stats"
  - Active state: Shows when stats are enabled
  - Uses `toggleStats()` from SceneContext

- **Auto Rotate Button** (🔄)
  - Title: "Auto Rotate"
  - Uses `toggleAutoRotate()` from SceneContext

- **Screenshot Button** (📸)
  - Title: "Screenshot"
  - Uses `takeScreenshot()` from SceneContext

- **Fullscreen Button** (🖥️)
  - Title: "Fullscreen"
  - Uses `toggleFullscreen()` from SceneContext

#### **5. Auto Tone Controls**
- **Auto Tone Checkbox**: Enable/disable auto tone mapping
  - Uses `setAutoTone()` from SceneContext
  - When enabled, unlocks tone mapping dropdown

- **Tone Mapping Dropdown**: Select tone mapping algorithm
  - Options: ACES, Reinhard, Linear, Filmic
  - Label: "Auto Tone:"
  - Disabled when auto tone is unchecked
  - Uses `setToneMapping()` from SceneContext

#### **6. Exposure Controls**
- **Exposure Slider**: Adjust scene exposure
  - Range: 0.0 to 3.0
  - Step: 0.1
  - Display: Shows current value (e.g., "1.0")
  - Label: "Exp:"
  - Uses `setExposure()` from SceneContext

### **Component Integration**

```jsx
import SceneControlsCompact from './components/SceneControlsCompact';
import { useScene } from './context/SceneContext';

// In your component
const { updateRenderMode } = useScene();

<SceneControlsCompact
  onRenderModeChange={(mode) => {
    // Custom render mode handling
    updateRenderMode(mode);
  }}
  onLightingChange={(lighting) => {
    // Custom lighting handling
    console.log('Lighting changed:', lighting);
  }}
  renderModeStates={{
    solid: true,
    wireframe: false,
    skeleton: false,
    partColorize: false
  }}
  skeletonActive={false}
  onSkeletonClick={() => {
    // Custom skeleton mode handling
    console.log('Skeleton clicked');
  }}
/>
```

### **Context Integration**

The component uses the `useScene()` hook to access:
- `sceneManager` - Main scene manager instance
- `setLighting()` - Set lighting preset
- `setLightIntensity()` - Adjust light intensity
- `setCameraMode()` - Set camera control mode
- `resetCamera()` - Reset camera to default position
- `focusOnFace()` - Focus camera on character face
- `setView()` - Set camera view position
- `toggleStats()` - Toggle performance stats display
- `toggleAutoRotate()` - Toggle auto-rotation
- `takeScreenshot()` - Capture screenshot
- `toggleFullscreen()` - Toggle fullscreen mode
- `setAutoTone()` - Enable/disable auto tone mapping
- `setToneMapping()` - Set tone mapping algorithm
- `setExposure()` - Adjust scene exposure
- `updateRenderMode()` - Update rendering mode

### **Styling**

The component uses `SceneControlsCompact.css` for styling. Key CSS classes:
- `.scene-controls-compact` - Main container
- `.lighting-controls` - Lighting dropdown section
- `.light-intensity-controls` - Light intensity slider section
- `.view-controls` - View selector section
- `.camera-controls` - Camera controls section
- `.additional-controls` - Tools section
- `.auto-tone-controls` - Auto tone section
- `.exposure-controls` - Exposure slider section
- `.control-label` - Label styling
- `.control-select` - Dropdown styling
- `.control-button` - Button styling
- `.control-slider` - Slider input styling
- `.slider-container` - Slider container with value display
- `.slider-value` - Displayed slider value

### **State Management**

The component maintains local state for:
- `lighting` - Current lighting preset (default: 'studio')
- `cameraMode` - Current camera mode (default: 'orbit')
- `showStats` - Stats visibility (default: false)
- `lightIntensity` - Light intensity value (default: 1.0)
- `selectedView` - Selected view position (default: 'Select View')
- `viewLookLocked` - Position lock state (default: false)
  - When `true`: All view options available, but each view calculates camera position to ensure full model is visible (uses model bounding box)
  - When `false`: All view options available, uses standard `setView()` behavior
- `autoTone` - Auto tone enabled state (default: false)
- `toneMapping` - Tone mapping algorithm (default: 'ACES')
- `exposure` - Exposure value (default: 1.0)

## 🔍 Debugging & Development

### **Console Logging**
All major operations include detailed console logging:
- `🎨 Render mode changed to: wireframe`
- `💡 Lighting intensity: 1.5x`
- `📷 Camera position: front`
- `🎬 Tone mapping: ACESFilmic`

### **Performance Monitoring**
```javascript
// Monitor scene performance
const stats = {
  triangles: 0,
  vertices: 0,
  materials: 0,
  lights: 0
};

sceneManager.scene.traverse((object) => {
  if (object.isMesh) {
    stats.triangles += object.geometry.index.count / 3;
    stats.vertices += object.geometry.attributes.position.count;
  }
  if (object.isLight) stats.lights++;
});
```

## 🚀 Next Steps

1. **Test the new features** with your existing VRM models
2. **Integrate SceneControls** into your main application
3. **Customize lighting** for your specific use cases
4. **Add custom rendering modes** for specialized workflows
5. **Optimize performance** for large models and complex scenes

The enhanced SceneManager provides a solid foundation for professional 3D model visualization and manipulation in your CharacterStudio application!
