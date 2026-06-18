# Core3D Integration for CharacterStudio

This document describes the comprehensive Core3D API integration that has been added to the CharacterStudio project, providing advanced 3D design capabilities through the Core3D platform.

## Overview

The Core3D integration adds powerful 3D design features to CharacterStudio, including:
- Access to thousands of 3D models
- Advanced material and texture library
- AI-powered design generation
- High-quality model exports
- Real-time design preview

## Architecture

### Core Components

1. **Core3D Service** (`src/services/core3dService.js`)
   - Handles all API communications with Core3D
   - Manages authentication and request formatting
   - Provides error handling and event system

2. **Core3D Context** (`src/context/Core3DContext.jsx`)
   - React context for state management
   - Provides hooks for component access
   - Manages loading states and error handling

3. **Core3D Panel** (`src/components/Core3DPanel.jsx`)
   - Main UI component with tabbed interface
   - Coordinates all Core3D functionality
   - Provides status indicators and error handling

### Feature Components

4. **Setup Component** (`src/components/Core3DSetup.jsx`)
   - API key configuration
   - Connection testing
   - Feature overview and help

5. **Models Component** (`src/components/Core3DModels.jsx`)
   - Browse and search 3D models
   - Upload custom models
   - Model selection and preview

6. **Materials Component** (`src/components/Core3DMaterials.jsx`)
   - Browse and search materials/textures
   - Upload custom materials
   - Material selection and preview

7. **Designer Component** (`src/components/Core3DDesigner.jsx`)
   - AI-powered design generation
   - Model and material combination
   - Design options and preview

8. **Exports Component** (`src/components/Core3DExports.jsx`)
   - Export generated designs
   - Multiple format support
   - Quality and customization options

## API Integration

### Authentication
- API key-based authentication
- Secure token storage in localStorage
- Automatic reconnection on app restart

### Endpoints Supported
- `/models` - Get available models
- `/materials` - Get available materials
- `/designs` - Generate and manage designs
- `/user/designs` - User's design library
- `/export` - Export designs in various formats

### File Upload Support
- **Models**: GLB, GLTF, FBX, OBJ formats
- **Materials**: JPG, PNG, TGA, HDR, EXR formats
- Progress tracking and validation
- Metadata management

## UI/UX Features

### Design System
- Consistent with CharacterStudio's dark theme
- Responsive grid layouts
- Smooth animations and transitions
- Loading states and progress indicators

### User Experience
- Intuitive tabbed interface
- Drag-and-drop file uploads
- Real-time search and filtering
- Visual previews and thumbnails
- Error handling with user-friendly messages

### Accessibility
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Focus management

## Integration Points

### Scene Manager Integration
- Core3D models can be loaded into the existing 3D scene
- Seamless integration with current model management
- Support for VRM export of Core3D designs

### Task Management
- Core3D operations are tracked in the task system
- Progress indicators for long-running operations
- Error handling and retry mechanisms

### Export System
- Core3D designs can be exported in multiple formats
- Integration with existing GLB/VRM export functionality
- Quality settings and optimization options

## Usage

### Getting Started
1. **Setup**: Configure your Core3D API key in the Setup tab
2. **Models**: Browse and select 3D models from the library
3. **Materials**: Choose textures and materials for your design
4. **Design**: Use the AI designer to generate combinations
5. **Export**: Export your designs in various formats

### API Key Configuration
1. Get your API key from the [Core3D Dashboard](https://www.core3d.io/dashboard)
2. Enter the key in the Setup tab
3. Test the connection to verify access
4. Start using Core3D features

### Design Generation
1. Select a model from the Models tab
2. Choose a material from the Materials tab
3. Configure design options (quality, lighting, etc.)
4. Generate the design using AI
5. Preview and export the result

## Technical Details

### State Management
- React Context for global state
- Local component state for UI interactions
- Persistent storage for user preferences
- Event-driven updates

### Error Handling
- Comprehensive error catching and reporting
- User-friendly error messages
- Retry mechanisms for failed operations
- Graceful degradation

### Performance
- Lazy loading of components
- Efficient re-rendering with proper dependencies
- Memory management and cleanup
- Optimized API calls

### Security
- Secure API key storage
- Input validation and sanitization
- CORS handling for cross-origin requests
- Safe file upload validation

## Future Enhancements

### Planned Features
- Real-time 3D model preview
- Advanced material editing
- Collaborative design features
- Batch processing capabilities
- Custom model training

### Integration Improvements
- Direct scene integration
- Real-time preview updates
- Advanced export options
- Performance optimizations

## Troubleshooting

### Common Issues
1. **API Key Issues**: Ensure valid key from Core3D dashboard
2. **Connection Problems**: Check network connectivity and API status
3. **Upload Failures**: Verify file format and size limits
4. **Export Issues**: Check format compatibility and quality settings

### Debug Information
- Console logging for development
- Error tracking and reporting
- Performance monitoring
- User action analytics

## Dependencies

### External
- Core3D API (external service)
- React Context API
- Fetch API for HTTP requests
- File API for uploads

### Internal
- CharacterStudio's existing context system
- Scene management integration
- Task management system
- Export functionality

## Support

For issues related to:
- **Core3D API**: Contact Core3D support
- **Integration**: Check CharacterStudio documentation
- **UI/UX**: Review component documentation
- **Performance**: Monitor browser console and network

## License

This integration follows the same license as the CharacterStudio project and respects Core3D's terms of service.
