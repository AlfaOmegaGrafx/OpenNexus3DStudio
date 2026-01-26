const fs = require('fs');
const path = require('path');

// Simple VRM file analysis (VRM is a GLB format with VRM extension)
// We'll extract basic file information and attempt to read GLB structure

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function analyzeVRMFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    // Read the file as buffer to check GLB structure
    const buffer = fs.readFileSync(filePath);
    
    // GLB files start with "glTF" magic number at position 0
    const magic = buffer.toString('ascii', 0, 4);
    const version = buffer.readUInt32LE(4);
    const length = buffer.readUInt32LE(8);
    
    let info = {
      path: filePath,
      name: path.basename(filePath),
      size: fileSize,
      sizeFormatted: formatBytes(fileSize),
      isGLB: magic === 'glTF',
      version: version,
      length: length
    };
    
    // Try to find texture/image references in the binary data
    // This is a simplified check - full parsing would require GLB parser
    const bufferString = buffer.toString('binary');
    
    // Count potential texture references (look for common image format signatures)
    const pngSignatures = (bufferString.match(/\x89PNG/g) || []).length;
    const jpgSignatures = (bufferString.match(/\xFF\xD8\xFF/g) || []).length;
    
    info.estimatedTextures = pngSignatures + jpgSignatures;
    
    return info;
  } catch (error) {
    return {
      path: filePath,
      error: error.message
    };
  }
}

// Analyze both files
const exportedFile = 'C:\\Users\\alfao\\Downloads\\opennexus3dstudio_export.vrm';
const originalFile = 'C:\\Users\\alfao\\Downloads\\Sifr V2.vrm';

console.log('🔍 Analyzing VRM Files...\n');
console.log('='.repeat(60));

const exportedInfo = analyzeVRMFile(exportedFile);
const originalInfo = analyzeVRMFile(originalFile);

console.log('\n📦 EXPORTED MODEL (Optimized):');
console.log('  Name:', exportedInfo.name);
console.log('  Size:', exportedInfo.sizeFormatted, `(${exportedInfo.size} bytes)`);
console.log('  GLB Format:', exportedInfo.isGLB ? 'Yes' : 'No');
if (exportedInfo.isGLB) {
  console.log('  GLB Version:', exportedInfo.version);
  console.log('  GLB Length:', exportedInfo.length, 'bytes');
}
console.log('  Estimated Textures:', exportedInfo.estimatedTextures);

console.log('\n📦 ORIGINAL MODEL:');
console.log('  Name:', originalInfo.name);
console.log('  Size:', originalInfo.sizeFormatted, `(${originalInfo.size} bytes)`);
console.log('  GLB Format:', originalInfo.isGLB ? 'Yes' : 'No');
if (originalInfo.isGLB) {
  console.log('  GLB Version:', originalInfo.version);
  console.log('  GLB Length:', originalInfo.length, 'bytes');
}
console.log('  Estimated Textures:', originalInfo.estimatedTextures);

console.log('\n📊 COMPARISON:');
const sizeReduction = ((1 - exportedInfo.size / originalInfo.size) * 100).toFixed(2);
const sizeRatio = (exportedInfo.size / originalInfo.size).toFixed(2);
console.log('  Size Reduction:', `${sizeReduction}%`);
console.log('  Size Ratio:', `${sizeRatio}x (exported is ${sizeRatio} of original)`);
console.log('  File Size Saved:', formatBytes(originalInfo.size - exportedInfo.size));

if (exportedInfo.estimatedTextures && originalInfo.estimatedTextures) {
  const textureReduction = originalInfo.estimatedTextures - exportedInfo.estimatedTextures;
  if (textureReduction > 0) {
    console.log('  Texture Reduction:', `-${textureReduction} textures (optimized)`);
  } else if (textureReduction < 0) {
    console.log('  Texture Increase:', `+${Math.abs(textureReduction)} textures`);
  } else {
    console.log('  Textures:', 'Same count');
  }
}

console.log('\n✅ Optimization Status:');
if (exportedInfo.size < originalInfo.size) {
  console.log('  ✓ File size optimized successfully!');
  console.log(`  ✓ Reduced from ${originalInfo.sizeFormatted} to ${exportedInfo.sizeFormatted}`);
  console.log(`  ✓ Saved ${formatBytes(originalInfo.size - exportedInfo.size)}`);
} else {
  console.log('  ⚠ File size increased (may indicate quality improvement or different optimization)');
}

console.log('\n' + '='.repeat(60));
console.log('\n💡 Note: For detailed model specs (meshes, materials, vertices),');
console.log('   please check the browser console when loading the models in the app.');
