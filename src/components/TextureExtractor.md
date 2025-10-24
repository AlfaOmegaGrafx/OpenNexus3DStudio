# 🎨 Texture Extractor

A comprehensive texture extraction and management component for Open3DStudio.

## Features

### 🔍 Texture Detection
- **Automatic Extraction**: Automatically detects and extracts all textures when a model is loaded
- **Multiple Texture Types**: Supports 11 different texture types:
  - 🎨 Diffuse/Albedo (Main Color)
  - 🗺️ Normal Maps (Surface Details)
  - ✨ Roughness Maps (Surface Smoothness)
  - 🔩 Metalness Maps (Metallic Properties)
  - 💡 Emissive Maps (Self-Illumination)
  - 🌑 Ambient Occlusion (Shadow Details)
  - ☀️ Light Maps (Baked Lighting)
  - ⛰️ Bump Maps (Surface Height)
  - 📐 Displacement Maps (Geometry Modification)
  - 👁️ Alpha Maps (Transparency)
  - 🌍 Environment Maps (Reflections)

### 📦 Texture Information
Each extracted texture includes:
- **Name**: Texture identifier
- **Type**: Texture category (diffuse, normal, etc.)
- **Size**: Resolution (width × height)
- **Format**: Source format (ImageBitmap, Canvas, etc.)
- **Material**: Associated material name
- **Mesh**: Parent mesh name
- **UUID**: Unique identifier

### 💾 Export Capabilities
- **Individual Download**: Download any texture as PNG
- **Batch Download**: Download all textures at once
- **Data URL Conversion**: Automatic conversion to downloadable formats
- **Multiple Sources**: Handles Image, ImageBitmap, Canvas, and DataTexture sources

### 🎯 User Interface

#### Grid View
- **Visual Preview**: Thumbnail of each texture
- **Type Indicator**: Icon and label for texture type
- **Quick Info**: Size and format at a glance
- **Material Context**: Shows which material uses the texture
- **One-Click Download**: Direct download button on each card

#### Detail View
- **Full Preview**: Large preview of selected texture
- **Complete Information**: All texture properties displayed
- **High Quality**: Pixelated rendering for texture inspection
- **Modal Interface**: Click any texture to open detailed view

## Usage

### Basic Usage

The TextureExtractor component is automatically integrated into the main sidebar:

```jsx
import TextureExtractor from './components/TextureExtractor';

function App() {
  return (
    <div>
      <TextureExtractor />
    </div>
  );
}
```

### Features in Action

1. **Load a Model**: Import any 3D model (VRM, GLB, GLTF, FBX, etc.)
2. **Auto-Extract**: Textures are automatically extracted and displayed
3. **Browse**: View all textures in a visual grid
4. **Inspect**: Click any texture to see full details
5. **Download**: Save individual textures or all at once

### API Usage

The underlying `extractTextures` method from `VRMExporter.js` can also be used programmatically:

```javascript
import { VRMExporter } from './library/VRMExporter';

const exporter = new VRMExporter();
const textures = exporter.extractTextures(model);

console.log(`Found ${textures.length} textures`);
textures.forEach(texture => {
  console.log(`${texture.name}: ${texture.width}×${texture.height}`);
});
```

## Texture Conversion

The component handles multiple texture source types:

### Image Objects
```javascript
// Regular Image with src
if (texture.image.src) {
  imageUrl = texture.image.src;
}
```

### ImageBitmap
```javascript
// Convert ImageBitmap to Canvas to Data URL
const canvas = document.createElement('canvas');
canvas.width = texture.image.width;
canvas.height = texture.image.height;
ctx.drawImage(texture.image, 0, 0);
imageUrl = canvas.toDataURL('image/png');
```

### Canvas Elements
```javascript
// Direct canvas to Data URL
imageUrl = texture.image.toDataURL('image/png');
```

### Data Textures
```javascript
// Convert raw data to Canvas
const imageData = new ImageData(
  new Uint8ClampedArray(texture.image.data),
  texture.image.width,
  texture.image.height
);
ctx.putImageData(imageData, 0, 0);
imageUrl = canvas.toDataURL('image/png');
```

## Styling

The component uses a modern, gradient-based design with:
- **Dark Theme**: Matches Open3DStudio's aesthetic
- **Smooth Animations**: Hover effects and transitions
- **Responsive Grid**: Adapts to different screen sizes
- **Modal Overlay**: Blurred backdrop for detail view
- **Icon System**: Visual indicators for texture types

### Color Scheme
- Primary: Purple gradient (`#667eea` → `#764ba2`)
- Secondary: Pink gradient (`#f093fb` → `#f5576c`)
- Accent: Blue gradient (`#4facfe` → `#00f2fe`)
- Background: Dark blue gradient (`#1a1a2e` → `#16213e`)

## Performance

- **Efficient Extraction**: Only processes textures once
- **Deduplication**: Uses UUID tracking to avoid duplicates
- **Lazy Loading**: Modal content loaded on demand
- **Staggered Downloads**: Prevents browser blocking when downloading multiple files

## Browser Compatibility

- Modern browsers with Canvas API support
- ImageBitmap support (Chrome, Firefox, Edge, Safari)
- Data URL support (all modern browsers)
- File download API (all modern browsers)

## Future Enhancements

Potential improvements:
- [ ] ZIP archive export for batch downloads
- [ ] Texture editing capabilities
- [ ] Format conversion options (PNG, JPG, WEBP)
- [ ] Texture compression analysis
- [ ] Memory usage statistics
- [ ] Texture replacement/swapping
- [ ] Texture atlas generation
- [ ] UV map visualization

## Integration

The TextureExtractor is integrated into:
- **Main Sidebar**: Always available when a model is loaded
- **VRMExporter**: Uses the same extraction logic for exports
- **SceneContext**: Accesses current model and VRM data

## Dependencies

- React 19
- Three.js (texture access)
- SceneContext (model access)
- Modern browser APIs (Canvas, Blob, URL)

## Examples

### Example Output
```
🎨 Starting texture extraction...
✅ Extracted: 🎨 Diffuse/Albedo from character_body
✅ Extracted: 🗺️ Normal Map from character_body
✅ Extracted: ✨ Roughness from character_body
✅ Extracted: 🎨 Diffuse/Albedo from character_face
✅ Extracted: 👁️ Alpha/Transparency from character_hair
🎨 Total textures extracted: 5
```

### Typical Use Cases

1. **Asset Inspection**: Examine all textures in a model
2. **Texture Extraction**: Save textures for editing or reuse
3. **Quality Control**: Verify texture resolutions and formats
4. **Asset Management**: Inventory textures in complex models
5. **Backup**: Save original textures before modifications

## Notes

- Textures are converted to PNG format for download
- Original texture properties are preserved in metadata
- Works with VRM models and standard 3D formats
- Integrates seamlessly with the VRM export workflow

