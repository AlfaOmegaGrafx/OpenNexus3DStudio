/**
 * Core3D Model Utilities
 * Shared functions for working with Core3D API model data
 */

/**
 * Extracts a loadable model URL from a Core3D model object.
 * This function checks multiple possible locations where the model file URL might be stored.
 * 
 * @param {Object} model - The Core3D model object
 * @returns {string|null} - The model file URL, or null if not found
 */
export function extractModelUrl(model) {
  if (!model || typeof model !== 'object') {
    return null;
  }

  // Direct URL properties (most common)
  let url = model.model_url || 
            model.download_url || 
            model.file_url || 
            model.url ||
            model.glb_url ||
            model.usdz_url ||
            model.gltf_url ||
            (model.uri && model.uri.startsWith('http') ? model.uri : null) ||
            (model.id && typeof model.id === 'string' && model.id.startsWith('http') ? model.id : null);
  
  // Check files array
  if (!url && model.files && Array.isArray(model.files) && model.files.length > 0) {
    const file = model.files.find(f => f.url || f.download_url || f.file_url) || model.files[0];
    url = file?.url || file?.download_url || file?.file_url;
  }
  
  // Check assets object
  if (!url && model.assets) {
    if (typeof model.assets === 'object') {
      // Check for default asset
      if (model.assets.default && (model.assets.default.url || model.assets.default.download_url)) {
        url = model.assets.default.url || model.assets.default.download_url;
      }
      // Check for glb asset
      else if (model.assets.glb && (model.assets.glb.url || model.assets.glb.download_url)) {
        url = model.assets.glb.url || model.assets.glb.download_url;
      }
      // Check for any asset with url
      else {
        const assetKeys = Object.keys(model.assets);
        for (const key of assetKeys) {
          const asset = model.assets[key];
          if (asset && (asset.url || asset.download_url)) {
            url = asset.url || asset.download_url;
            break;
          }
        }
      }
    }
  }
  
  // Check exports array
  if (!url && model.exports && Array.isArray(model.exports) && model.exports.length > 0) {
    const exportItem = model.exports.find(e => e.url || e.download_url || e.file_url) || model.exports[0];
    url = exportItem?.url || exportItem?.download_url || exportItem?.file_url;
  }
  
  // Check upload object (common in Core3D API)
  // IMPORTANT: This is where the model URL is typically found in Core3D API responses.
  // The upload object contains the actual file URL that can be used to load the model.
  // This was discovered during debugging when models weren't loading - the URL was in
  // model.upload.url, not in the direct URL properties.
  if (!url && model.upload) {
    if (typeof model.upload === 'object') {
      url = model.upload.url || model.upload.download_url || model.upload.file_url;
      // Check if upload has files array
      if (!url && model.upload.files && Array.isArray(model.upload.files) && model.upload.files.length > 0) {
        const file = model.upload.files.find(f => f.url || f.download_url) || model.upload.files[0];
        url = file?.url || file?.download_url;
      }
    }
  }
  
  // Check images object (might contain model file URLs)
  if (!url && model.images) {
    if (typeof model.images === 'object') {
      // Check for glb or model file in images
      if (model.images.glb && (model.images.glb.url || model.images.glb.download_url)) {
        url = model.images.glb.url || model.images.glb.download_url;
      }
      // Check default image
      else if (model.images.default && (model.images.default.url || model.images.default.download_url)) {
        url = model.images.default.url || model.images.default.download_url;
      }
      // Check any image with url
      else {
        const imageKeys = Object.keys(model.images);
        for (const key of imageKeys) {
          const image = model.images[key];
          if (image && (image.url || image.download_url)) {
            url = image.url || image.download_url;
            break;
          }
        }
      }
    }
  }
  
  return url || null;
}

/**
 * Fetches model details from Core3D API and extracts the model URL.
 * This is a fallback when the model object doesn't have a direct URL.
 * 
 * @param {string} modelId - The model ID or URI
 * @returns {Promise<string|null>} - The model file URL, or null if not found
 */
export async function fetchModelUrl(modelId) {
  if (!modelId) {
    return null;
  }

  try {
    const core3dServiceModule = await import('../services/core3dService');
    const core3dService = core3dServiceModule.default;
    
    if (!core3dService || !core3dService.isInitialized) {
      console.warn('⚠️ Core3D service not initialized');
      return null;
    }

    const modelDetails = await core3dService.getModel(modelId);
    if (modelDetails) {
      return extractModelUrl(modelDetails);
    }
  } catch (error) {
    console.warn('⚠️ Failed to fetch model details from API:', error);
  }

  return null;
}

/**
 * Gets the model URL from a Core3D model object, with automatic fallback to API fetch.
 * This is the main function to use when you need a model URL.
 * 
 * @param {Object} model - The Core3D model object
 * @returns {Promise<string|null>} - The model file URL, or null if not found
 */
export async function getModelUrl(model) {
  if (!model) {
    return null;
  }

  // First, try to extract URL from the model object directly
  let url = extractModelUrl(model);

  // If no URL found and we have a model ID/URI, try fetching from API
  if (!url && (model.uri || model.id)) {
    const modelId = model.uri || model.id;
    url = await fetchModelUrl(modelId);
  }

  return url;
}
