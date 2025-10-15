# Model Format Specification

This document defines the shared model format between Open3DStudio and CharacterStudio to ensure seamless model transfer and compatibility.

## Overview

The bridge between Open3DStudio and CharacterStudio uses GLB (GL Transmission Format Binary) as the primary exchange format, with specific optimizations and metadata for CharacterStudio compatibility.

## Format Requirements

### Base Format
- **Primary Format**: GLB (GL Transmission Format Binary)
- **Version**: GLTF 2.0
- **Encoding**: Binary
- **Compression**: Optional KHR_draco_mesh_compression

### Required Extensions
- **VRM**: For CharacterStudio compatibility
- **KHR_materials_pbrSpecularGlossiness**: For material compatibility
- **KHR_texture_transform**: For texture transformations

## Open3DStudio Export Specifications

### Export Options
```javascript
{
  filename: 'model.glb',
  forCharacterStudio: true,
  optimize: true,
  includeTextures: true,
  includeAnimations: true,
  metadata: {
    source: 'Open3DStudio',
    target: 'CharacterStudio',
    compatibility: 'VRM',
    exportDate: '2024-01-01T00:00:00.000Z'
  }
}
```

### Model Processing
1. **Geometry Optimization**
   - Merge vertices
   - Compute normals
   - Optimize triangle order
   - Remove duplicate vertices

2. **Material Processing**
   - Ensure PBR materials
   - Optimize texture usage
   - Set proper color spaces
   - Add VRM material properties

3. **VRM Compatibility**
   - Add VRM metadata
   - Create bone structure
   - Add blend shapes
   - Set up humanoid rigging

### Export Metadata
```javascript
{
  extensions: {
    VRM: {
      version: '0.0',
      meta: {
        title: 'Open3DStudio Export',
        version: '1.0.0',
        author: 'Open3DStudio',
        contactInformation: '',
        reference: '',
        texture: -1,
        allowedUserName: 'Everyone',
        violentUssageName: 'Disallow',
        sexualUssageName: 'Disallow',
        commercialUssageName: 'Allow',
        otherPermissionUrl: '',
        licenseUrl: '',
        otherLicenseUrl: ''
      }
    }
  },
  userData: {
    vrmCompatible: true,
    exportSource: 'Open3DStudio',
    exportDate: '2024-01-01T00:00:00.000Z'
  }
}
```

## CharacterStudio Import Specifications

### Import Processing
1. **VRM Structure Addition**
   - Add VRM metadata
   - Create humanoid bone structure
   - Add blend shape definitions
   - Set up material properties

2. **CharacterStudio Optimization**
   - Merge geometries
   - Optimize materials
   - Add CharacterStudio properties
   - Set up animation system

3. **Validation**
   - Check VRM compatibility
   - Validate bone structure
   - Verify material setup
   - Test animation support

### Import Metadata
```javascript
{
  userData: {
    characterStudio: {
      imported: true,
      source: 'Open3DStudio',
      importDate: '2024-01-01T00:00:00.000Z',
      version: '1.0.0',
      compatible: true
    },
    vrm: {
      // VRM structure as defined above
    }
  }
}
```

## File Structure

### GLB File Organization
```
model.glb
├── Binary Data
│   ├── Scene Graph
│   ├── Meshes
│   ├── Materials
│   ├── Textures
│   ├── Animations
│   └── Extensions
└── JSON Metadata
    ├── scenes
    ├── nodes
    ├── meshes
    ├── materials
    ├── textures
    ├── images
    ├── animations
    └── extensions
```

### Required Nodes
- **Scene Root**: Main scene container
- **Mesh Nodes**: Individual mesh objects
- **Bone Nodes**: Skeleton structure (for VRM)
- **Material Nodes**: Material assignments

### Required Materials
- **PBR Materials**: Standard PBR workflow
- **VRM Materials**: VRM-specific properties
- **Texture Support**: Diffuse, normal, metallic, roughness

## Validation Rules

### Open3DStudio Export Validation
1. Model must have at least one mesh
2. All meshes must have materials
3. Materials must be PBR-compatible
4. VRM metadata must be present
5. Bone structure must be valid (if applicable)

### CharacterStudio Import Validation
1. GLB file must be valid
2. VRM extensions must be present
3. Model must be compatible with CharacterStudio
4. Materials must be importable
5. Bone structure must be valid for VRM

## Error Handling

### Common Issues
1. **Missing VRM Structure**: Automatically added during import
2. **Invalid Materials**: Converted to PBR workflow
3. **Missing Textures**: Default materials applied
4. **Invalid Bone Structure**: Standard VRM bones added
5. **Geometry Issues**: Automatic optimization applied

### Error Recovery
- Automatic VRM structure addition
- Material conversion and optimization
- Default texture application
- Bone structure reconstruction
- Geometry cleanup and optimization

## Performance Considerations

### Export Optimization
- Geometry merging for reduced draw calls
- Texture atlas generation
- Material optimization
- Animation compression

### Import Optimization
- Lazy loading of resources
- Progressive model loading
- Memory management
- Caching strategies

## Testing

### Test Cases
1. **Basic Model Export**: Simple mesh with material
2. **Complex Model Export**: Multiple meshes with textures
3. **Animated Model Export**: Model with animations
4. **VRM Model Export**: Model with VRM structure
5. **Import Validation**: CharacterStudio compatibility

### Test Data
- Various model complexities
- Different material types
- Animation sequences
- Texture formats
- Bone structures

## Future Enhancements

### Planned Features
1. **Advanced VRM Support**: Full VRM 1.0 compatibility
2. **Animation Transfer**: Preserve animations between apps
3. **Material Libraries**: Shared material systems
4. **Batch Processing**: Multiple model handling
5. **Cloud Integration**: Remote model processing

### Compatibility Updates
- Regular format validation
- Extension support updates
- Performance optimizations
- Bug fixes and improvements

## Implementation Notes

### Open3DStudio Implementation
- Use GLBExporter class for export functionality
- Implement VRM compatibility layer
- Add CharacterStudio-specific optimizations
- Provide export validation

### CharacterStudio Implementation
- Use CharacterStudioBridge class for import functionality
- Implement VRM structure addition
- Add import validation
- Provide compatibility checking

### Shared Components
- Common validation functions
- Shared metadata structures
- Compatible material systems
- Unified error handling

This specification ensures seamless model transfer between Open3DStudio and CharacterStudio while maintaining compatibility and performance.


