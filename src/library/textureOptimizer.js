/**
 * Shared texture optimization utilities for all exporters
 * Ported from CharacterStudioRedux optimizations
 * 
 * Key optimizations:
 * - maxTextureSize: 1024 (vs 4096) = 16x size reduction per texture
 * - forcePowerOfTwoTextures: false (allows exact sizes, avoids upscaling)
 * - Default atlas sizes: 2048px (opaque), 1024px (transparent)
 */

/**
 * Default texture optimization options
 * These match CharacterStudioRedux's optimized settings
 */
export const DEFAULT_TEXTURE_OPTIONS = {
  maxTextureSize: 1024,              // Changed from 4096 - 16x size reduction
  forcePowerOfTwoTextures: false,      // Changed from true - avoids upscaling
  truncateDrawRange: true,             // Optimize draw ranges
};

/**
 * Default atlas size options
 * These match CharacterStudioRedux's optimized defaults
 */
export const DEFAULT_ATLAS_OPTIONS = {
  mToonAtlasSize: 2048,                // Opaque MToon materials
  mToonAtlasSizeTransp: 1024,          // Transparent MToon materials
  stdAtlasSize: 2048,                  // Opaque standard materials
  stdAtlasSizeTransp: 1024,            // Transparent standard materials
};

/**
 * Get optimized texture options for GLTFExporter
 * Merges user options with optimized defaults
 * 
 * @param {Object} userOptions - User-provided options (optional)
 * @returns {Object} Optimized texture options
 */
export function getOptimizedTextureOptions(userOptions = {}) {
  return {
    ...DEFAULT_TEXTURE_OPTIONS,
    ...userOptions,
    // Ensure maxTextureSize doesn't exceed 1024 unless explicitly overridden
    maxTextureSize: userOptions.maxTextureSize !== undefined 
      ? userOptions.maxTextureSize 
      : DEFAULT_TEXTURE_OPTIONS.maxTextureSize,
  };
}

/**
 * Get optimized atlas size options
 * Merges user options with optimized defaults
 * 
 * @param {Object} userOptions - User-provided options (optional)
 * @returns {Object} Optimized atlas size options
 */
export function getOptimizedAtlasOptions(userOptions = {}) {
  return {
    ...DEFAULT_ATLAS_OPTIONS,
    ...userOptions,
  };
}

/**
 * Compress texture to PNG format using canvas
 * Ported from CharacterStudioRedux/src/library/VRMExporter.js:514-528
 * 
 * This function converts an ImageBitmap to PNG format for better compression
 * 
 * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement} image - Image to compress
 * @returns {ArrayBuffer} PNG data as ArrayBuffer
 */
export function compressTextureToPNG(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  
  // Convert canvas to PNG data URL
  const pngUrl = canvas.toDataURL('image/png');
  
  // Extract base64 data and convert to ArrayBuffer
  const base64Data = pngUrl.split(',')[1];
  const binaryString = atob(base64Data);
  const arrayBuffer = new ArrayBuffer(binaryString.length);
  const view = new DataView(arrayBuffer);
  
  for (let i = 0; i < binaryString.length; i++) {
    view.setUint8(i, binaryString.charCodeAt(i));
  }
  
  return arrayBuffer;
}

/**
 * Calculate texture size in bytes
 * Helper function for size estimation
 * 
 * @param {number} width - Texture width
 * @param {number} height - Texture height
 * @param {number} channels - Number of color channels (default: 4 for RGBA)
 * @returns {number} Size in bytes
 */
export function calculateTextureSize(width, height, channels = 4) {
  return width * height * channels;
}

/**
 * Estimate size reduction from optimization
 * 
 * @param {number} originalSize - Original texture size (e.g., 4096)
 * @param {number} optimizedSize - Optimized texture size (e.g., 1024)
 * @returns {Object} Size reduction metrics
 */
export function estimateSizeReduction(originalSize, optimizedSize) {
  const originalBytes = calculateTextureSize(originalSize, originalSize);
  const optimizedBytes = calculateTextureSize(optimizedSize, optimizedSize);
  const reduction = originalBytes - optimizedBytes;
  const reductionPercent = (reduction / originalBytes) * 100;
  const ratio = originalBytes / optimizedBytes;
  
  return {
    originalBytes,
    optimizedBytes,
    reduction,
    reductionPercent: reductionPercent.toFixed(2),
    ratio: ratio.toFixed(2),
    originalSizeMB: (originalBytes / (1024 * 1024)).toFixed(2),
    optimizedSizeMB: (optimizedBytes / (1024 * 1024)).toFixed(2),
  };
}

/**
 * Log optimization metrics
 * Useful for debugging and verification
 * 
 * @param {Object} metrics - Size reduction metrics from estimateSizeReduction
 */
export function logOptimizationMetrics(metrics) {
  console.log('📊 Texture Optimization Metrics:', {
    'Original Size': `${metrics.originalSizeMB} MB`,
    'Optimized Size': `${metrics.optimizedSizeMB} MB`,
    'Reduction': `${metrics.reductionPercent}%`,
    'Size Ratio': `${metrics.ratio}x smaller`,
  });
}




