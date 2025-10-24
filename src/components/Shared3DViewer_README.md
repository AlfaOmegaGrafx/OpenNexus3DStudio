# Shared 3D Viewer System

This document explains the shared 3D viewer system that allows both CharacterStudio and Open3DStudio to use the same 3D viewing capabilities.

## Overview

The shared 3D viewer system provides a unified 3D viewing experience across both applications while maintaining their unique features and workflows.

## Architecture

### Core Components

1. **Shared3DViewer** (`src/components/Shared3DViewer.jsx`)
   - Base 3D viewer component with Three.js integration
   - Handles both CharacterStudio and Open3DStudio modes
   - Provides common 3D viewing functionality

2. **Universal3DViewer** (`src/components/Universal3DViewer.jsx`)
   - Smart wrapper that auto-detects application mode
   - Provides mode-specific controls and features
   - Handles context switching between applications

3. **Core3DViewer** (`src/components/Core3DViewer.jsx`)
   - Open3DStudio-specific viewer component
   - Optimized for Core3D design workflows
   - Integrates with Core3D API and designs

4. **Scene3D** (`src/components/Scene3D.jsx`)
   - CharacterStudio-specific viewer component
   - Optimized for VRM and character workflows
   - Integrates with existing scene management

## Features

### Shared Features
- **3D Model Loading**: Support for GLB, GLTF, FBX, OBJ formats
- **Render Modes**: Solid, wireframe, skeleton, textured views
- **Camera Controls**: Orbit, pan, zoom with mouse/touch
- **Performance Stats**: FPS, triangle count, draw calls
- **Responsive Design**: Works on desktop and mobile
- **Error Handling**: Graceful error recovery and user feedback

### CharacterStudio Features
- **VRM Support**: Full VRM model loading and manipulation
- **Blend Shapes**: Facial expression controls
- **Character Animation**: Bone and animation support
- **VRM Export**: Export models in VRM format
- **Character Studio Integration**: Seamless workflow integration

### Open3DStudio Features
- **Core3D Integration**: Direct API integration
- **Design Preview**: Real-time design visualization
- **Material Application**: Dynamic material switching
- **AI Design Generation**: Live preview of generated designs
- **Export Options**: Multiple format support

## Usage

### Basic Usage

```jsx
import Universal3DViewer from './components/Universal3DViewer';

// Auto-detect mode
<Universal3DViewer 
  model={myModel}
  showControls={true}
  showStats={true}
/>

// Explicit mode
<Universal3DViewer 
  mode="characterstudio"
  model={vrmModel}
  enableVRM={true}
/>
```

### CharacterStudio Usage

```jsx
import Scene3D from './components/Scene3D';

<Scene3D 
  model={characterModel}
  renderMode="solid"
  showControls={true}
  showStats={false}
/>
```

### Open3DStudio Usage

```jsx
import Core3DViewer from './components/Core3DViewer';

<Core3DViewer 
  design={core3dDesign}
  showControls={true}
  showStats={true}
  onDesignLoad={handleDesignLoad}
/>
```

## Configuration

### Viewer Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | string | 'auto' | Application mode ('characterstudio' or 'open3dstudio') |
| `model` | object | null | 3D model to display |
| `renderMode` | string | 'solid' | Rendering mode |
| `showControls` | boolean | true | Show control panel |
| `showStats` | boolean | false | Show performance stats |
| `enableVRM` | boolean | true | Enable VRM features |
| `enableCore3D` | boolean | true | Enable Core3D features |
| `enableExport` | boolean | true | Enable export functionality |

### Event Handlers

| Handler | Parameters | Description |
|---------|------------|-------------|
| `onModelLoad` | `(model)` | Called when model loads successfully |
| `onModelError` | `(error)` | Called when model loading fails |
| `onViewerReady` | `(info)` | Called when viewer is ready |

## Integration Points

### Scene Manager Integration
- Uses existing `SceneManager` for 3D scene management
- Integrates with `CharacterManager` for VRM support
- Maintains compatibility with existing scene context

### Core3D Integration
- Connects to Core3D API for design loading
- Supports Core3D design preview and export
- Integrates with Core3D material system

### Context Integration
- Uses `SceneContext` for CharacterStudio features
- Uses `Core3DContext` for Open3DStudio features
- Maintains state consistency across components

## Performance Considerations

### Optimization Features
- **Lazy Loading**: Components load only when needed
- **Memory Management**: Proper cleanup of 3D resources
- **Efficient Rendering**: Optimized render loops
- **Asset Optimization**: Automatic model and texture optimization

### Performance Monitoring
- **FPS Tracking**: Real-time frame rate monitoring
- **Memory Usage**: GPU and CPU memory tracking
- **Draw Call Optimization**: Minimized draw calls
- **Triangle Count**: Geometry complexity monitoring

## Responsive Design

### Desktop Features
- Full control panel with all options
- High-resolution rendering
- Advanced camera controls
- Performance stats overlay

### Mobile Features
- Touch-optimized controls
- Simplified interface
- Gesture-based navigation
- Optimized performance

### Tablet Features
- Hybrid desktop/mobile interface
- Touch and mouse support
- Adaptive layout
- Balanced performance

## Error Handling

### Error Types
- **Model Loading Errors**: Invalid file formats, corrupted data
- **API Errors**: Core3D API failures, network issues
- **Rendering Errors**: GPU issues, memory problems
- **Context Errors**: Missing dependencies, initialization failures

### Error Recovery
- **Automatic Retry**: Failed operations are retried automatically
- **Fallback Modes**: Graceful degradation when features fail
- **User Feedback**: Clear error messages and recovery options
- **Debug Information**: Detailed error logging for development

## Accessibility

### Keyboard Navigation
- Full keyboard support for all controls
- Tab navigation through interface
- Keyboard shortcuts for common actions
- Focus management and indicators

### Screen Reader Support
- ARIA labels and descriptions
- Semantic HTML structure
- Status announcements
- Alternative text for visual elements

### High Contrast Mode
- Enhanced contrast for better visibility
- Customizable color schemes
- Focus indicators
- Readable text and controls

## Browser Compatibility

### Supported Browsers
- **Chrome**: Full support with WebGL 2.0
- **Firefox**: Full support with WebGL 2.0
- **Safari**: Full support with WebGL 2.0
- **Edge**: Full support with WebGL 2.0

### WebGL Requirements
- WebGL 2.0 support required
- Hardware acceleration recommended
- Minimum 2GB RAM for complex models
- Modern GPU with OpenGL ES 3.0 support

## Development

### Adding New Features
1. Extend the base `Shared3DViewer` component
2. Add mode-specific logic in `Universal3DViewer`
3. Update context providers as needed
4. Add appropriate styling and controls

### Testing
- Test with various model formats
- Verify performance on different devices
- Check accessibility compliance
- Validate error handling scenarios

### Debugging
- Enable performance stats for monitoring
- Use browser dev tools for WebGL debugging
- Check console for error messages
- Monitor network requests for API calls

## Future Enhancements

### Planned Features
- **VR Support**: Virtual reality viewing capabilities
- **AR Integration**: Augmented reality features
- **Collaborative Viewing**: Multi-user viewing sessions
- **Advanced Materials**: PBR material support
- **Animation Timeline**: Frame-by-frame animation control

### Performance Improvements
- **WebGPU Support**: Next-generation graphics API
- **Streaming**: Progressive model loading
- **Caching**: Intelligent asset caching
- **Compression**: Advanced texture compression

## Troubleshooting

### Common Issues
1. **Black Screen**: Check WebGL support and GPU drivers
2. **Slow Performance**: Reduce model complexity or enable optimizations
3. **Loading Failures**: Verify file formats and network connectivity
4. **Context Errors**: Ensure all required providers are present

### Debug Steps
1. Check browser console for errors
2. Verify WebGL support with online tools
3. Test with simple models first
4. Check network connectivity for API calls
5. Validate file formats and sizes

## Support

For issues related to:
- **3D Viewer**: Check component documentation
- **CharacterStudio**: Review scene management docs
- **Open3DStudio**: Check Core3D integration docs
- **Performance**: Monitor browser dev tools
- **Compatibility**: Test on different browsers/devices
