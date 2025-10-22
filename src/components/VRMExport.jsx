import React, { useState, useEffect } from 'react';
import { useScene } from '../context/SceneContext';
import { VRMExporter } from '../library/VRMExporter';

const VRMExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isImagesExpanded, setIsImagesExpanded] = useState(false);
  const [vrmMetadata, setVrmMetadata] = useState(null);
  const [exportOptions, setExportOptions] = useState({
    filename: 'open3dstudio_export.vrm',
    vrmVersion: '0.0',
    title: 'Open3DStudio Export',
    author: 'Open3DStudio',
    version: '1.0.0',
    allowedUserName: 'Everyone',
    commercialUssageName: 'Allow',
    optimize: true,
    includeExpressions: true,
    includeHumanoidBones: true
  });

  const { currentModel, sceneManager, characterManager } = useScene();
  const [vrmExporter] = useState(() => new VRMExporter());

  // Extract VRM metadata when a VRM model is loaded
  useEffect(() => {
    console.log('🔍 VRMExport useEffect triggered - START');
    console.log('🔍 useEffect dependencies:', { sceneManager, currentVRM: sceneManager?.currentVRM });
    console.log('🔍 sceneManager:', sceneManager);
    console.log('🔍 sceneManager.currentVRM:', sceneManager?.currentVRM);
    console.log('🔍 sceneManager.currentVRM.meta:', sceneManager?.currentVRM?.meta);
    console.log('🔍 sceneManager.currentVRM.userData:', sceneManager?.currentVRM?.userData);
    console.log('🔍 sceneManager.currentVRM.userData.gltf:', sceneManager?.currentVRM?.userData?.gltf);
    
    if (sceneManager && sceneManager.currentVRM && sceneManager.currentVRM.meta) {
      // Create an async function to handle the metadata extraction
      const extractMetadataAsync = async () => {
        const vrmMeta = sceneManager.currentVRM.meta;
      console.log('📋 VRM Metadata found:', vrmMeta);
      console.log('🔍 VRM Object structure:', sceneManager.currentVRM);
      console.log('🔍 VRM Scene:', sceneManager.currentVRM.scene);
      console.log('🔍 VRM Thumbnail field:', vrmMeta.thumbnail);
      console.log('🔍 All VRM Meta fields:', Object.keys(vrmMeta));
      console.log('🔍 VRM Meta values:', Object.values(vrmMeta));
      console.log('🔍 VRM Meta entries:', Object.entries(vrmMeta));
      console.log('🔍 VRM userData:', sceneManager.currentVRM.userData);
      console.log('🔍 VRM scene userData:', sceneManager.currentVRM.scene?.userData);
      console.log('🔍 VRM scene children:', sceneManager.currentVRM.scene?.children?.length);
      console.log('🔍 VRM scene traverse check for images...');
      
      // Extract VRM metadata
      const extractedMetadata = {
        title: vrmMeta.title || 'Untitled',
        version: vrmMeta.version || '1.0.0',
        author: vrmMeta.author || 'Unknown',
        contactInformation: vrmMeta.contactInformation || '',
        reference: vrmMeta.reference || '',
        texture: vrmMeta.texture || -1,
        allowedUserName: vrmMeta.allowedUserName || 'Everyone',
        violentUssageName: vrmMeta.violentUssageName || 'Disallow',
        sexualUssageName: vrmMeta.sexualUssageName || 'Disallow',
        commercialUssageName: vrmMeta.commercialUssageName || 'Allow',
        otherPermissionUrl: vrmMeta.otherPermissionUrl || '',
        licenseUrl: vrmMeta.licenseUrl || '',
        otherLicenseUrl: vrmMeta.otherLicenseUrl || '',
        metaVersion: vrmMeta.metaVersion || '0',
        thumbnail: null // Will be set below if found
      };

      // Debug VRM metadata
      console.log(`🔍 Full VRM metadata:`, vrmMeta);
      console.log(`🔍 VRM metadata keys:`, Object.keys(vrmMeta));
      console.log(`🔍 VRM texture index: ${vrmMeta.texture}`);
      console.log(`🔍 VRM texture type: ${typeof vrmMeta.texture}`);
      console.log(`🔍 VRM texture value: ${vrmMeta.texture}`);
      
      // Check if VRM metadata has any image-related properties
      for (const key of Object.keys(vrmMeta)) {
        if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
          console.log(`🔍 VRM metadata ${key}:`, vrmMeta[key]);
        }
      }
      
      if (vrmMeta.texture !== undefined && vrmMeta.texture !== -1) {
        console.log(`🔍 VRM has texture index: ${vrmMeta.texture}`);
        
        // Get the GLTF data from the VRM - try multiple ways
        let gltf = sceneManager.currentVRM.userData?.gltf;
        if (!gltf) {
          gltf = sceneManager.currentVRM.gltf;
        }
        if (!gltf) {
          gltf = sceneManager.currentVRM.scene?.userData?.gltf;
        }
        
        console.log(`🔍 GLTF data:`, gltf);
        console.log(`🔍 GLTF structure:`, Object.keys(gltf || {}));
        console.log(`🔍 GLTF images:`, gltf?.images);
        console.log(`🔍 GLTF images length:`, gltf?.images?.length);
        console.log(`🔍 GLTF textures:`, gltf?.textures);
        console.log(`🔍 GLTF textures length:`, gltf?.textures?.length);
        console.log(`🔍 VRM userData structure:`, sceneManager.currentVRM.userData);
        console.log(`🔍 VRM userData keys:`, Object.keys(sceneManager.currentVRM.userData || {}));
        console.log(`🔍 VRM userData.gltf type:`, typeof sceneManager.currentVRM.userData?.gltf);
        console.log(`🔍 VRM userData.gltf exists:`, !!sceneManager.currentVRM.userData?.gltf);
        console.log(`🔍 VRM.gltf exists:`, !!sceneManager.currentVRM.gltf);
        console.log(`🔍 VRM scene userData.gltf exists:`, !!sceneManager.currentVRM.scene?.userData?.gltf);
        
        // Try different ways to access the thumbnail image
        let thumbnailImage = null;
        
        // Method 1: Direct access via gltf.images
        if (gltf && gltf.images && gltf.images[vrmMeta.texture]) {
          thumbnailImage = gltf.images[vrmMeta.texture];
          console.log(`🔍 Method 1 - Found thumbnail image at index ${vrmMeta.texture}:`, thumbnailImage);
        }
        
        // Method 2: Access via textures array
        if (!thumbnailImage && gltf && gltf.textures && gltf.textures[vrmMeta.texture]) {
          const texture = gltf.textures[vrmMeta.texture];
          console.log(`🔍 Method 2 - Found texture at index ${vrmMeta.texture}:`, texture);
          if (texture.source !== undefined && gltf.images && gltf.images[texture.source]) {
            thumbnailImage = gltf.images[texture.source];
            console.log(`🔍 Method 2 - Found image via texture.source:`, thumbnailImage);
          }
        }
        
        // Method 3: Check if images are stored differently
        if (!thumbnailImage && gltf) {
          console.log(`🔍 Method 3 - Exploring GLTF structure for images...`);
          console.log(`🔍 GLTF keys:`, Object.keys(gltf));
          
          // Check for different possible image storage locations
          const possibleImageKeys = ['images', 'Images', 'image', 'Image', 'textures', 'Textures'];
          for (const key of possibleImageKeys) {
            if (gltf[key]) {
              console.log(`🔍 Found ${key} in GLTF:`, gltf[key]);
              if (Array.isArray(gltf[key]) && gltf[key][vrmMeta.texture]) {
                thumbnailImage = gltf[key][vrmMeta.texture];
                console.log(`🔍 Method 3 - Found thumbnail via ${key}[${vrmMeta.texture}]:`, thumbnailImage);
                break;
              }
            }
          }
        }
        
        // Method 4: Check if the VRM object itself has the image data
        if (!thumbnailImage && sceneManager.currentVRM) {
          console.log(`🔍 Method 4 - Checking VRM object for image data...`);
          console.log(`🔍 VRM object:`, sceneManager.currentVRM);
          console.log(`🔍 VRM object keys:`, Object.keys(sceneManager.currentVRM));
          console.log(`🔍 VRM userData:`, sceneManager.currentVRM.userData);
          console.log(`🔍 VRM userData keys:`, Object.keys(sceneManager.currentVRM.userData || {}));
          
          // Check if VRM has any image-related properties
          for (const key of Object.keys(sceneManager.currentVRM.userData || {})) {
            if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
              console.log(`🔍 VRM userData ${key}:`, sceneManager.currentVRM.userData[key]);
            }
          }
        }
        
        // Method 5: Check if the VRM metadata itself contains the image
        if (!thumbnailImage && vrmMeta) {
          console.log(`🔍 Method 5 - Checking VRM metadata for image data...`);
          console.log(`🔍 VRM metadata full structure:`, vrmMeta);
          
          // Check if VRM metadata has any image-related properties
          for (const key of Object.keys(vrmMeta)) {
            if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
              console.log(`🔍 VRM metadata ${key}:`, vrmMeta[key]);
              if (vrmMeta[key] && typeof vrmMeta[key] === 'object') {
                console.log(`🔍 VRM metadata ${key} structure:`, Object.keys(vrmMeta[key]));
              }
            }
          }
        }
        
        // Method 6: Check if the VRM object has any image data in its properties
        if (!thumbnailImage && sceneManager.currentVRM) {
          console.log(`🔍 Method 6 - Checking VRM object properties for image data...`);
          
          // Check if VRM has any image-related properties
          for (const key of Object.keys(sceneManager.currentVRM)) {
            if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
              console.log(`🔍 VRM object ${key}:`, sceneManager.currentVRM[key]);
              if (sceneManager.currentVRM[key] && typeof sceneManager.currentVRM[key] === 'object') {
                console.log(`🔍 VRM object ${key} structure:`, Object.keys(sceneManager.currentVRM[key]));
              }
            }
          }
        }
        
        // Method 7: Check if the VRM object has any image data in its scene or children
        if (!thumbnailImage && sceneManager.currentVRM && sceneManager.currentVRM.scene) {
          console.log(`🔍 Method 7 - Checking VRM scene for image data...`);
          console.log(`🔍 VRM scene:`, sceneManager.currentVRM.scene);
          console.log(`🔍 VRM scene children:`, sceneManager.currentVRM.scene.children);
          
          // Check if VRM scene has any image-related properties
          for (const key of Object.keys(sceneManager.currentVRM.scene)) {
            if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
              console.log(`🔍 VRM scene ${key}:`, sceneManager.currentVRM.scene[key]);
              if (sceneManager.currentVRM.scene[key] && typeof sceneManager.currentVRM.scene[key] === 'object') {
                console.log(`🔍 VRM scene ${key} structure:`, Object.keys(sceneManager.currentVRM.scene[key]));
              }
            }
          }
        }
        
          // Method 8: Check if the VRM object has any image data in its materials
          if (!thumbnailImage && sceneManager.currentVRM && sceneManager.currentVRM.scene) {
            console.log(`🔍 Method 8 - Checking VRM materials for image data...`);
            
            // Traverse the scene to find materials
            sceneManager.currentVRM.scene.traverse((child) => {
              if (child.material) {
                console.log(`🔍 Found material:`, child.material);
                console.log(`🔍 Material keys:`, Object.keys(child.material));
                
                // Check if material has any image-related properties
                for (const key of Object.keys(child.material)) {
                  if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
                    console.log(`🔍 Material ${key}:`, child.material[key]);
                    if (child.material[key] && typeof child.material[key] === 'object') {
                      console.log(`🔍 Material ${key} structure:`, Object.keys(child.material[key]));
                    }
                  }
                }
              }
            });
          }
          
          // Method 9: Try to extract thumbnail from VRM metadata directly
          if (!thumbnailImage && vrmMeta && vrmMeta.texture !== undefined && vrmMeta.texture !== -1) {
            console.log(`🔍 Method 9 - Trying to extract thumbnail from VRM metadata directly...`);
            console.log(`🔍 VRM metadata texture index: ${vrmMeta.texture}`);
            
            // Check if VRM has any image data in its properties
            if (sceneManager.currentVRM) {
              console.log(`🔍 VRM object keys:`, Object.keys(sceneManager.currentVRM));
              
              // Check if VRM has any image-related properties
              for (const key of Object.keys(sceneManager.currentVRM)) {
                if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
                  console.log(`🔍 VRM ${key}:`, sceneManager.currentVRM[key]);
                  if (sceneManager.currentVRM[key] && typeof sceneManager.currentVRM[key] === 'object') {
                    console.log(`🔍 VRM ${key} structure:`, Object.keys(sceneManager.currentVRM[key]));
                    
                    // Check if this property contains an array of images
                    if (Array.isArray(sceneManager.currentVRM[key]) && sceneManager.currentVRM[key][vrmMeta.texture]) {
                      thumbnailImage = sceneManager.currentVRM[key][vrmMeta.texture];
                      console.log(`🔍 Method 9 - Found thumbnail via VRM ${key}[${vrmMeta.texture}]:`, thumbnailImage);
                      break;
                    }
                  }
                }
              }
            }
          }
          
          // Method 10: Check if the VRM has any embedded image data
          if (!thumbnailImage && sceneManager.currentVRM) {
            console.log(`🔍 Method 10 - Checking for embedded image data in VRM...`);
            
            // Check if VRM has any buffer or data properties that might contain images
            for (const key of Object.keys(sceneManager.currentVRM)) {
              if (key.toLowerCase().includes('buffer') || key.toLowerCase().includes('data') || key.toLowerCase().includes('binary')) {
                console.log(`🔍 VRM ${key}:`, sceneManager.currentVRM[key]);
                if (sceneManager.currentVRM[key] && typeof sceneManager.currentVRM[key] === 'object') {
                  console.log(`🔍 VRM ${key} structure:`, Object.keys(sceneManager.currentVRM[key]));
                }
              }
            }
          }
          
          // Method 11: Try to extract thumbnail from VRM metadata directly using the texture index
          if (!thumbnailImage && vrmMeta && vrmMeta.texture !== undefined && vrmMeta.texture !== -1) {
            console.log(`🔍 Method 11 - Trying to extract thumbnail from VRM metadata using texture index...`);
            console.log(`🔍 VRM metadata texture index: ${vrmMeta.texture}`);
            
            // Check if VRM has any image data in its properties
            if (sceneManager.currentVRM) {
              console.log(`🔍 VRM object keys:`, Object.keys(sceneManager.currentVRM));
              
              // Check if VRM has any image-related properties
              for (const key of Object.keys(sceneManager.currentVRM)) {
                if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
                  console.log(`🔍 VRM ${key}:`, sceneManager.currentVRM[key]);
                  if (sceneManager.currentVRM[key] && typeof sceneManager.currentVRM[key] === 'object') {
                    console.log(`🔍 VRM ${key} structure:`, Object.keys(sceneManager.currentVRM[key]));
                    
                    // Check if this property contains an array of images
                    if (Array.isArray(sceneManager.currentVRM[key]) && sceneManager.currentVRM[key][vrmMeta.texture]) {
                      thumbnailImage = sceneManager.currentVRM[key][vrmMeta.texture];
                      console.log(`🔍 Method 11 - Found thumbnail via VRM ${key}[${vrmMeta.texture}]:`, thumbnailImage);
                      break;
                    }
                  }
                }
              }
            }
          }
          
          // Method 12: Try to extract thumbnail from VRM scene materials
          if (!thumbnailImage && sceneManager.currentVRM && sceneManager.currentVRM.scene) {
            console.log(`🔍 Method 12 - Checking VRM scene materials for thumbnail...`);
            
            // Look for materials that might contain the thumbnail
            sceneManager.currentVRM.scene.traverse((child) => {
              if (child.isMesh && child.material) {
                console.log(`🔍 Found material:`, child.material);
                console.log(`🔍 Material keys:`, Object.keys(child.material));
                
                // Check if material has any image-related properties
                for (const key of Object.keys(child.material)) {
                  if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
                    console.log(`🔍 Material ${key}:`, child.material[key]);
                    if (child.material[key] && typeof child.material[key] === 'object') {
                      console.log(`🔍 Material ${key} structure:`, Object.keys(child.material[key]));
                      
                      // Check if this might be the thumbnail
                      if (child.material[key].image && child.material[key].image instanceof ImageBitmap) {
                        thumbnailImage = child.material[key];
                        console.log(`🔍 Method 12 - Found thumbnail in material ${key}:`, thumbnailImage);
                        return;
                      }
                    }
                  }
                }
              }
            });
          }
        
        if (thumbnailImage) {
          console.log(`🔍 Thumbnail image structure:`, Object.keys(thumbnailImage));
          console.log(`🔍 Thumbnail image.image:`, thumbnailImage.image);
          console.log(`🔍 Thumbnail image.uri:`, thumbnailImage.uri);
          
          // Handle different image types
          if (thumbnailImage.image) {
            console.log(`🔍 Thumbnail image type:`, typeof thumbnailImage.image);
            console.log(`🔍 Thumbnail image instanceof ImageBitmap:`, thumbnailImage.image instanceof ImageBitmap);
            console.log(`🔍 Thumbnail image instanceof Image:`, thumbnailImage.image instanceof Image);
            console.log(`🔍 Thumbnail image.src:`, thumbnailImage.image.src);
            
            if (thumbnailImage.image instanceof ImageBitmap) {
              // ImageBitmap - convert to data URL
              try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = thumbnailImage.image.width;
                canvas.height = thumbnailImage.image.height;
                ctx.drawImage(thumbnailImage.image, 0, 0);
                extractedMetadata.thumbnail = canvas.toDataURL();
                console.log(`🔍 Converted VRM thumbnail ImageBitmap to data URL`);
              } catch (error) {
                console.log(`❌ Failed to convert VRM thumbnail ImageBitmap:`, error);
              }
            } else if (thumbnailImage.image.src) {
              // Regular Image object
              extractedMetadata.thumbnail = thumbnailImage.image.src;
              console.log(`🔍 Set VRM thumbnail from image src:`, thumbnailImage.image.src);
            } else if (thumbnailImage.image instanceof Image) {
              // Image object
              extractedMetadata.thumbnail = thumbnailImage.image.src;
              console.log(`🔍 Set VRM thumbnail from Image object:`, thumbnailImage.image.src);
            }
          } else if (thumbnailImage.uri) {
            // URI-based image
            extractedMetadata.thumbnail = thumbnailImage.uri;
            console.log(`🔍 Set VRM thumbnail from URI:`, thumbnailImage.uri);
          }
        } else {
          console.log(`❌ No GLTF data or image at index ${vrmMeta.texture}`);
          console.log(`❌ GLTF exists:`, !!gltf);
          console.log(`❌ GLTF images exists:`, !!gltf?.images);
          console.log(`❌ Image at index exists:`, !!gltf?.images?.[vrmMeta.texture]);
        }
      } else {
        console.log(`🔍 VRM texture index is undefined or -1, trying other methods...`);
      }

      // Try to extract VRM thumbnail from metadata fields as fallback
      if (!extractedMetadata.thumbnail) {
        console.log(`🔍 Method 13 - Checking VRM metadata fields for thumbnail...`);
        const thumbnailFields = ['thumbnail', 'preview', 'image', 'screenshot', 'thumbnailImage'];
        for (const field of thumbnailFields) {
          if (vrmMeta[field]) {
            console.log(`🔍 Found VRM thumbnail in field '${field}':`, vrmMeta[field]);
            console.log(`🔍 Thumbnail type:`, typeof vrmMeta[field]);
            console.log(`🔍 Thumbnail length:`, vrmMeta[field]?.length);
            
            // Handle different thumbnail types
            if (typeof vrmMeta[field] === 'string') {
              // String URL or data URL
              extractedMetadata.thumbnail = vrmMeta[field];
              console.log(`🔍 Set thumbnail from string field '${field}':`, vrmMeta[field]);
              break;
            } else if (vrmMeta[field] instanceof ImageBitmap) {
              // ImageBitmap - convert to data URL
              try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = vrmMeta[field].width;
                canvas.height = vrmMeta[field].height;
                ctx.drawImage(vrmMeta[field], 0, 0);
                extractedMetadata.thumbnail = canvas.toDataURL();
                console.log(`🔍 Converted ImageBitmap thumbnail from field '${field}' to data URL`);
                break;
              } catch (error) {
                console.log(`❌ Failed to convert ImageBitmap thumbnail from field '${field}':`, error);
              }
            } else if (vrmMeta[field] instanceof Image) {
              // Image object
              extractedMetadata.thumbnail = vrmMeta[field].src;
              console.log(`🔍 Set thumbnail from Image field '${field}':`, vrmMeta[field].src);
              break;
            }
          }
        }
      }
      
      // Method 14: Check if VRM has any embedded image data in its properties
      if (!extractedMetadata.thumbnail && sceneManager.currentVRM) {
        console.log(`🔍 Method 14 - Checking VRM object for embedded image data...`);
        console.log(`🔍 VRM object keys:`, Object.keys(sceneManager.currentVRM));
        
        // Check if VRM has any image-related properties
        for (const key of Object.keys(sceneManager.currentVRM)) {
          if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail') || key.toLowerCase().includes('preview')) {
            console.log(`🔍 VRM ${key}:`, sceneManager.currentVRM[key]);
            if (sceneManager.currentVRM[key] && typeof sceneManager.currentVRM[key] === 'object') {
              console.log(`🔍 VRM ${key} structure:`, Object.keys(sceneManager.currentVRM[key]));
              
              // Check if this property contains an image
              if (sceneManager.currentVRM[key].image && sceneManager.currentVRM[key].image instanceof ImageBitmap) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = sceneManager.currentVRM[key].image.width;
                  canvas.height = sceneManager.currentVRM[key].image.height;
                  ctx.drawImage(sceneManager.currentVRM[key].image, 0, 0);
                  extractedMetadata.thumbnail = canvas.toDataURL();
                  console.log(`🔍 Method 14 - Found thumbnail in VRM ${key} and converted to data URL`);
                  break;
                } catch (error) {
                  console.log(`❌ Failed to convert thumbnail from VRM ${key}:`, error);
                }
              }
            }
          }
        }
      }
      
      // Method 15: Check if VRM has any image data in its userData
      if (!extractedMetadata.thumbnail && sceneManager.currentVRM && sceneManager.currentVRM.userData) {
        console.log(`🔍 Method 15 - Checking VRM userData for image data...`);
        console.log(`🔍 VRM userData keys:`, Object.keys(sceneManager.currentVRM.userData));
        
        // Check if VRM userData has any image-related properties
        for (const key of Object.keys(sceneManager.currentVRM.userData)) {
          if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail') || key.toLowerCase().includes('preview')) {
            console.log(`🔍 VRM userData ${key}:`, sceneManager.currentVRM.userData[key]);
            if (sceneManager.currentVRM.userData[key] && typeof sceneManager.currentVRM.userData[key] === 'object') {
              console.log(`🔍 VRM userData ${key} structure:`, Object.keys(sceneManager.currentVRM.userData[key]));
              
              // Check if this property contains an image
              if (sceneManager.currentVRM.userData[key].image && sceneManager.currentVRM.userData[key].image instanceof ImageBitmap) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = sceneManager.currentVRM.userData[key].image.width;
                  canvas.height = sceneManager.currentVRM.userData[key].image.height;
                  ctx.drawImage(sceneManager.currentVRM.userData[key].image, 0, 0);
                  extractedMetadata.thumbnail = canvas.toDataURL();
                  console.log(`🔍 Method 15 - Found thumbnail in VRM userData ${key} and converted to data URL`);
                  break;
                } catch (error) {
                  console.log(`❌ Failed to convert thumbnail from VRM userData ${key}:`, error);
                }
              }
            }
          }
        }
      }
      
      // Method 16: Check if VRM has any image data in its scene userData
      if (!extractedMetadata.thumbnail && sceneManager.currentVRM && sceneManager.currentVRM.scene && sceneManager.currentVRM.scene.userData) {
        console.log(`🔍 Method 16 - Checking VRM scene userData for image data...`);
        console.log(`🔍 VRM scene userData keys:`, Object.keys(sceneManager.currentVRM.scene.userData));
        
        // Check if VRM scene userData has any image-related properties
        for (const key of Object.keys(sceneManager.currentVRM.scene.userData)) {
          if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail') || key.toLowerCase().includes('preview')) {
            console.log(`🔍 VRM scene userData ${key}:`, sceneManager.currentVRM.scene.userData[key]);
            if (sceneManager.currentVRM.scene.userData[key] && typeof sceneManager.currentVRM.scene.userData[key] === 'object') {
              console.log(`🔍 VRM scene userData ${key} structure:`, Object.keys(sceneManager.currentVRM.scene.userData[key]));
              
              // Check if this property contains an image
              if (sceneManager.currentVRM.scene.userData[key].image && sceneManager.currentVRM.scene.userData[key].image instanceof ImageBitmap) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = sceneManager.currentVRM.scene.userData[key].image.width;
                  canvas.height = sceneManager.currentVRM.scene.userData[key].image.height;
                  ctx.drawImage(sceneManager.currentVRM.scene.userData[key].image, 0, 0);
                  extractedMetadata.thumbnail = canvas.toDataURL();
                  console.log(`🔍 Method 16 - Found thumbnail in VRM scene userData ${key} and converted to data URL`);
                  break;
                } catch (error) {
                  console.log(`❌ Failed to convert thumbnail from VRM scene userData ${key}:`, error);
                }
              }
            }
          }
        }
      }
      
      // Method 17: Check if GLTF has any image data in its parser or other properties
      if (!extractedMetadata.thumbnail && sceneManager.currentVRM && sceneManager.currentVRM.userData && sceneManager.currentVRM.userData.gltf) {
        const gltf = sceneManager.currentVRM.userData.gltf;
        console.log(`🔍 Method 17 - Checking GLTF parser and other properties for image data...`);
        console.log(`🔍 GLTF parser:`, gltf.parser);
        console.log(`🔍 GLTF parser keys:`, Object.keys(gltf.parser || {}));
        
        // Check if GLTF parser has any image-related properties
        if (gltf.parser) {
          for (const key of Object.keys(gltf.parser)) {
            if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail') || key.toLowerCase().includes('preview')) {
              console.log(`🔍 GLTF parser ${key}:`, gltf.parser[key]);
              if (gltf.parser[key] && typeof gltf.parser[key] === 'object') {
                console.log(`🔍 GLTF parser ${key} structure:`, Object.keys(gltf.parser[key]));
                
                // Check if this property contains an image
                if (gltf.parser[key].image && gltf.parser[key].image instanceof ImageBitmap) {
                  try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = gltf.parser[key].image.width;
                    canvas.height = gltf.parser[key].image.height;
                    ctx.drawImage(gltf.parser[key].image, 0, 0);
                    extractedMetadata.thumbnail = canvas.toDataURL();
                    console.log(`🔍 Method 17 - Found thumbnail in GLTF parser ${key} and converted to data URL`);
                    break;
                  } catch (error) {
                    console.log(`❌ Failed to convert thumbnail from GLTF parser ${key}:`, error);
                  }
                }
              }
            }
          }
        }
        
        // Check if GLTF has any other image-related properties
        for (const key of Object.keys(gltf)) {
          if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail') || key.toLowerCase().includes('preview')) {
            console.log(`🔍 GLTF ${key}:`, gltf[key]);
            if (gltf[key] && typeof gltf[key] === 'object') {
              console.log(`🔍 GLTF ${key} structure:`, Object.keys(gltf[key]));
              
              // Check if this property contains an image
              if (gltf[key].image && gltf[key].image instanceof ImageBitmap) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = gltf[key].image.width;
                  canvas.height = gltf[key].image.height;
                  ctx.drawImage(gltf[key].image, 0, 0);
                  extractedMetadata.thumbnail = canvas.toDataURL();
                  console.log(`🔍 Method 17 - Found thumbnail in GLTF ${key} and converted to data URL`);
                  break;
                } catch (error) {
                  console.log(`❌ Failed to convert thumbnail from GLTF ${key}:`, error);
                }
              }
            }
          }
        }
      }
      
      // Method 18: Check for base64-encoded image data in VRM metadata
      if (!extractedMetadata.thumbnail && vrmMeta) {
        console.log(`🔍 Method 18 - Checking for base64-encoded image data in VRM metadata...`);
        
        // Check all metadata fields for potential base64 image data
        for (const [key, value] of Object.entries(vrmMeta)) {
          if (value && typeof value === 'string') {
            // Check if this looks like base64 image data
            if (value.startsWith('data:image/') || value.startsWith('iVBORw0KGgo') || value.startsWith('/9j/')) {
              console.log(`🔍 Method 18 - Found potential base64 image in field '${key}':`, value.substring(0, 100) + '...');
              extractedMetadata.thumbnail = value;
              console.log(`🔍 Method 18 - Set thumbnail from base64 field '${key}'`);
              break;
            }
          }
        }
      }
      
      // Method 19: Check for any hidden or nested image data in VRM structure
      if (!extractedMetadata.thumbnail && sceneManager.currentVRM) {
        console.log(`🔍 Method 19 - Deep search for any image data in VRM structure...`);
        
        // Recursively search through the VRM object for any image data
        function searchForImages(obj, path = '') {
          if (!obj || typeof obj !== 'object') return;
          
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            // Check if this is an image-related property
            if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail') || key.toLowerCase().includes('preview') || key.toLowerCase().includes('screenshot')) {
              console.log(`🔍 Method 19 - Found image-related property at ${currentPath}:`, value);
              
              if (value instanceof ImageBitmap) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = value.width;
                  canvas.height = value.height;
                  ctx.drawImage(value, 0, 0);
                  extractedMetadata.thumbnail = canvas.toDataURL();
                  console.log(`🔍 Method 19 - Found ImageBitmap at ${currentPath} and converted to data URL`);
                  return true;
                } catch (error) {
                  console.log(`❌ Failed to convert ImageBitmap at ${currentPath}:`, error);
                }
              } else if (value instanceof Image) {
                extractedMetadata.thumbnail = value.src;
                console.log(`🔍 Method 19 - Found Image at ${currentPath}:`, value.src);
                return true;
              } else if (typeof value === 'string' && (value.startsWith('data:image/') || value.startsWith('iVBORw0KGgo') || value.startsWith('/9j/'))) {
                extractedMetadata.thumbnail = value;
                console.log(`🔍 Method 19 - Found base64 image at ${currentPath}`);
                return true;
              }
            }
            
            // Recursively search nested objects (but avoid infinite loops)
            if (typeof value === 'object' && value !== null && !Array.isArray(value) && currentPath.split('.').length < 5) {
              if (searchForImages(value, currentPath)) {
                return true;
              }
            }
          }
          return false;
        }
        
        searchForImages(sceneManager.currentVRM);
      }
      
      // Method 20: Try to access image data from GLTF parser JSON structure
      if (!extractedMetadata.thumbnail && sceneManager.currentVRM && sceneManager.currentVRM.userData && sceneManager.currentVRM.userData.gltf) {
        const gltf = sceneManager.currentVRM.userData.gltf;
        console.log(`🔍 Method 20 - Trying to access image data from GLTF parser JSON structure...`);
        console.log(`🔍 GLTF parser exists:`, !!gltf.parser);
        console.log(`🔍 GLTF parser.json exists:`, !!gltf.parser?.json);
        console.log(`🔍 GLTF parser.json.images exists:`, !!gltf.parser?.json?.images);
        console.log(`🔍 GLTF parser.json.images length:`, gltf.parser?.json?.images?.length);
        console.log(`🔍 GLTF parser.json.textures exists:`, !!gltf.parser?.json?.textures);
        console.log(`🔍 GLTF parser.json.textures length:`, gltf.parser?.json?.textures?.length);
        
        if (gltf.parser && gltf.parser.json && gltf.parser.json.images && Array.isArray(gltf.parser.json.images)) {
          console.log(`🔍 Method 20 - Found GLTF parser JSON images array with ${gltf.parser.json.images.length} images`);
          
          // Check if VRM metadata has a texture index
          if (vrmMeta.texture !== undefined && vrmMeta.texture !== -1 && vrmMeta.texture < gltf.parser.json.images.length) {
            console.log(`🔍 Method 20 - VRM texture index ${vrmMeta.texture} is valid for images array`);
            const imageRef = gltf.parser.json.images[vrmMeta.texture];
            console.log(`🔍 Method 20 - Image reference at index ${vrmMeta.texture}:`, imageRef);
            
            // Check if the image reference has a URI or bufferView
            if (imageRef.uri) {
              console.log(`🔍 Method 20 - Found image URI:`, imageRef.uri);
              // Check if it's a data URL
              if (imageRef.uri.startsWith('data:image/')) {
                extractedMetadata.thumbnail = imageRef.uri;
                console.log(`🔍 Method 20 - Set thumbnail from data URL URI`);
              } else {
                // Try to resolve the URI to a data URL
                try {
                  // For now, just use the URI as is
                  extractedMetadata.thumbnail = imageRef.uri;
                  console.log(`🔍 Method 20 - Set thumbnail from URI:`, imageRef.uri);
                } catch (error) {
                  console.log(`❌ Failed to resolve image URI:`, error);
                }
              }
            } else if (imageRef.bufferView !== undefined) {
              console.log(`🔍 Method 20 - Found image bufferView:`, imageRef.bufferView);
              // Try to access the buffer data
              if (gltf.parser.json.bufferViews && gltf.parser.json.bufferViews[imageRef.bufferView]) {
                const bufferView = gltf.parser.json.bufferViews[imageRef.bufferView];
                console.log(`🔍 Method 20 - Buffer view:`, bufferView);
                
                // Try to access the buffer data
                if (gltf.parser.json.buffers && gltf.parser.json.buffers[bufferView.buffer]) {
                  const buffer = gltf.parser.json.buffers[bufferView.buffer];
                  console.log(`🔍 Method 20 - Buffer:`, buffer);
                  
                  // Check if buffer has URI
                  if (buffer.uri) {
                    console.log(`🔍 Method 20 - Buffer URI:`, buffer.uri);
                    if (buffer.uri.startsWith('data:image/')) {
                      extractedMetadata.thumbnail = buffer.uri;
                      console.log(`🔍 Method 20 - Set thumbnail from buffer data URL`);
                    }
                  }
                }
              }
            }
          } else {
            console.log(`🔍 Method 20 - VRM texture index ${vrmMeta.texture} is invalid or undefined`);
            console.log(`🔍 Method 20 - Trying to find any image in the images array...`);
            
            // Try to find any image that might be a thumbnail
            for (let i = 0; i < gltf.parser.json.images.length; i++) {
              const imageRef = gltf.parser.json.images[i];
              console.log(`🔍 Method 20 - Checking image ${i}:`, imageRef);
              
              if (imageRef.uri && imageRef.uri.startsWith('data:image/')) {
                extractedMetadata.thumbnail = imageRef.uri;
                console.log(`🔍 Method 20 - Found data URL image at index ${i}`);
                break;
              }
            }
          }
        }
      }
      
      // Method 21: Try to use GLTF parser methods to resolve image data
      if (!extractedMetadata.thumbnail && sceneManager.currentVRM && sceneManager.currentVRM.userData && sceneManager.currentVRM.userData.gltf) {
        const gltf = sceneManager.currentVRM.userData.gltf;
        console.log(`🔍 Method 21 - Trying to use GLTF parser methods to resolve image data...`);
        console.log(`🔍 GLTF parser methods:`, Object.keys(gltf.parser || {}));
        
        if (gltf.parser) {
          // Check if parser has methods to resolve images
          const parserMethods = Object.keys(gltf.parser);
          console.log(`🔍 Available parser methods:`, parserMethods);
          
          // Look for image-related methods
          for (const method of parserMethods) {
            if (method.toLowerCase().includes('image') || method.toLowerCase().includes('texture') || method.toLowerCase().includes('resolve') || method.toLowerCase().includes('load')) {
              console.log(`🔍 Found potential image method: ${method}`);
              try {
                const result = gltf.parser[method];
                console.log(`🔍 Method ${method} result:`, result);
                
                // Check if the result is a function we can call
                if (typeof result === 'function') {
                  console.log(`🔍 Method ${method} is a function, trying to call it...`);
                  try {
                    const callResult = result();
                    console.log(`🔍 Method ${method} call result:`, callResult);
                  } catch (error) {
                    console.log(`❌ Failed to call method ${method}:`, error);
                  }
                }
              } catch (error) {
                console.log(`❌ Failed to access method ${method}:`, error);
              }
            }
          }
          
          // Try to access parser's image data directly
          if (gltf.parser.images && Array.isArray(gltf.parser.images)) {
            console.log(`🔍 Method 21 - Found parser.images array with ${gltf.parser.images.length} images`);
            
            // Check if VRM metadata has a texture index
            if (vrmMeta.texture !== undefined && vrmMeta.texture !== -1 && vrmMeta.texture < gltf.parser.images.length) {
              const imageData = gltf.parser.images[vrmMeta.texture];
              console.log(`🔍 Method 21 - Image data at index ${vrmMeta.texture}:`, imageData);
              
              if (imageData instanceof ImageBitmap) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = imageData.width;
                  canvas.height = imageData.height;
                  ctx.drawImage(imageData, 0, 0);
                  extractedMetadata.thumbnail = canvas.toDataURL();
                  console.log(`🔍 Method 21 - Converted ImageBitmap to data URL`);
                } catch (error) {
                  console.log(`❌ Failed to convert ImageBitmap:`, error);
                }
              } else if (imageData instanceof Image) {
                extractedMetadata.thumbnail = imageData.src;
                console.log(`🔍 Method 21 - Set thumbnail from Image src:`, imageData.src);
              } else if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
                extractedMetadata.thumbnail = imageData;
                console.log(`🔍 Method 21 - Set thumbnail from data URL string`);
              }
            } else {
              console.log(`🔍 Method 21 - VRM texture index ${vrmMeta.texture} is invalid, trying to find any image...`);
              
              // Try to find any image that might be a thumbnail
              for (let i = 0; i < gltf.parser.images.length; i++) {
                const imageData = gltf.parser.images[i];
                console.log(`🔍 Method 21 - Checking parser image ${i}:`, imageData);
                
                if (imageData instanceof ImageBitmap) {
                  try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = imageData.width;
                    canvas.height = imageData.height;
                    ctx.drawImage(imageData, 0, 0);
                    extractedMetadata.thumbnail = canvas.toDataURL();
                    console.log(`🔍 Method 21 - Found and converted ImageBitmap at index ${i}`);
                    break;
                  } catch (error) {
                    console.log(`❌ Failed to convert ImageBitmap at index ${i}:`, error);
                  }
                } else if (imageData instanceof Image) {
                  extractedMetadata.thumbnail = imageData.src;
                  console.log(`🔍 Method 21 - Found Image at index ${i}:`, imageData.src);
                  break;
                } else if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
                  extractedMetadata.thumbnail = imageData;
                  console.log(`🔍 Method 21 - Found data URL at index ${i}`);
                  break;
                }
              }
            }
          }
        }
      }
      
      // Method 22: Try to decode bufferView data from GLTF parser JSON structure
      if (!extractedMetadata.thumbnail && sceneManager.currentVRM && sceneManager.currentVRM.userData && sceneManager.currentVRM.userData.gltf) {
        try {
          const gltf = sceneManager.currentVRM.userData.gltf;
          console.log(`🔍 Method 22 - Trying to decode bufferView data from GLTF parser JSON structure...`);
        
        if (gltf.parser && gltf.parser.json && gltf.parser.json.images && Array.isArray(gltf.parser.json.images)) {
          console.log(`🔍 Method 22 - Found GLTF parser JSON images array with ${gltf.parser.json.images.length} images`);
          
          // Try to find the thumbnail image (look for one with a name that suggests it's a thumbnail)
          let thumbnailImageRef = null;
          let thumbnailIndex = -1;
          
          // First, try to find an image with a name that suggests it's a thumbnail
          // Prioritize specific thumbnail names over generic "avatar" names
          for (let i = 0; i < gltf.parser.json.images.length; i++) {
            const imageRef = gltf.parser.json.images[i];
            console.log(`🔍 Method 22 - Checking image ${i}:`, imageRef);
            
            if (imageRef.name && (
              imageRef.name.toLowerCase().includes('thumbnail') || 
              imageRef.name.toLowerCase().includes('preview') || 
              imageRef.name.toLowerCase().includes('screenshot') ||
              imageRef.name.toLowerCase().includes('icon') ||
              imageRef.name.toLowerCase().includes('sifr') ||
              imageRef.name.toLowerCase().includes('v2e')
            )) {
              console.log(`🔍 Method 22 - Found potential thumbnail image at index ${i} with name: ${imageRef.name}`);
              thumbnailImageRef = imageRef;
              thumbnailIndex = i;
              break;
            }
          }
          
          // If no specific thumbnail found, try generic avatar names (but only if no specific thumbnail was found)
          if (!thumbnailImageRef) {
            for (let i = 0; i < gltf.parser.json.images.length; i++) {
              const imageRef = gltf.parser.json.images[i];
              console.log(`🔍 Method 22 - Checking image ${i} for generic avatar:`, imageRef);
              
              if (imageRef.name && imageRef.name.toLowerCase().includes('avatar')) {
                console.log(`🔍 Method 22 - Found generic avatar image at index ${i} with name: ${imageRef.name}`);
                thumbnailImageRef = imageRef;
                thumbnailIndex = i;
                break;
              }
            }
          }
          
          // If no specific thumbnail found, try to use the VRM texture index
          if (!thumbnailImageRef && vrmMeta.texture !== undefined && vrmMeta.texture !== -1 && vrmMeta.texture < gltf.parser.json.images.length) {
            console.log(`🔍 Method 22 - Using VRM texture index ${vrmMeta.texture}`);
            thumbnailImageRef = gltf.parser.json.images[vrmMeta.texture];
            thumbnailIndex = vrmMeta.texture;
          }
          
          // If still no thumbnail found, try the last image (often the thumbnail)
          if (!thumbnailImageRef && gltf.parser.json.images.length > 0) {
            console.log(`🔍 Method 22 - Trying last image as thumbnail`);
            thumbnailIndex = gltf.parser.json.images.length - 1;
            thumbnailImageRef = gltf.parser.json.images[thumbnailIndex];
          }
          
          if (thumbnailImageRef) {
            console.log(`🔍 Method 22 - Found thumbnail image reference at index ${thumbnailIndex}:`, thumbnailImageRef);
            
            // Try to resolve the image data
            if (thumbnailImageRef.uri) {
              console.log(`🔍 Method 22 - Found image URI:`, thumbnailImageRef.uri);
              if (thumbnailImageRef.uri.startsWith('data:image/')) {
                extractedMetadata.thumbnail = thumbnailImageRef.uri;
                console.log(`🔍 Method 22 - Set thumbnail from data URL URI`);
              } else {
                // Try to resolve the URI to a data URL
                try {
                  extractedMetadata.thumbnail = thumbnailImageRef.uri;
                  console.log(`🔍 Method 22 - Set thumbnail from URI:`, thumbnailImageRef.uri);
                } catch (error) {
                  console.log(`❌ Failed to resolve image URI:`, error);
                }
              }
            } else if (thumbnailImageRef.bufferView !== undefined) {
              console.log(`🔍 Method 22 - Processing bufferView ${thumbnailImageRef.bufferView} for image:`, thumbnailImageRef);
              console.log(`🔍 Method 22 - Found image bufferView:`, thumbnailImageRef.bufferView);
              
              // Try to decode the bufferView data
              try {
                console.log(`🔍 Method 22 - Checking bufferViews array:`, gltf.parser.json.bufferViews);
                console.log(`🔍 Method 22 - BufferView index ${thumbnailImageRef.bufferView} exists:`, !!gltf.parser.json.bufferViews[thumbnailImageRef.bufferView]);
                
                if (gltf.parser.json.bufferViews && gltf.parser.json.bufferViews[thumbnailImageRef.bufferView]) {
                  const bufferView = gltf.parser.json.bufferViews[thumbnailImageRef.bufferView];
                  console.log(`🔍 Method 22 - Buffer view:`, bufferView);
                  
                  console.log(`🔍 Method 22 - Checking buffers array:`, gltf.parser.json.buffers);
                  console.log(`🔍 Method 22 - Buffer index ${bufferView.buffer} exists:`, !!gltf.parser.json.buffers[bufferView.buffer]);
                  
                  if (gltf.parser.json.buffers && gltf.parser.json.buffers[bufferView.buffer]) {
                    const buffer = gltf.parser.json.buffers[bufferView.buffer];
                    console.log(`🔍 Method 22 - Buffer:`, buffer);
                    
                    // Check if buffer has URI (data URL)
                    if (buffer.uri) {
                      console.log(`🔍 Method 22 - Buffer URI:`, buffer.uri);
                      if (buffer.uri.startsWith('data:image/')) {
                        extractedMetadata.thumbnail = buffer.uri;
                        console.log(`🔍 Method 22 - Set thumbnail from buffer data URL`);
                      } else if (buffer.uri.startsWith('data:application/octet-stream')) {
                        // Try to decode base64 buffer data
                        try {
                          console.log(`🔍 Method 22 - Starting base64 buffer decoding...`);
                          const base64Data = buffer.uri.split(',')[1];
                          console.log(`🔍 Method 22 - Base64 data length:`, base64Data?.length);
                          const binaryString = atob(base64Data);
                          const bytes = new Uint8Array(binaryString.length);
                          for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                          }
                          console.log(`🔍 Method 22 - Created Uint8Array with ${bytes.length} bytes`);
                          
                          // Try to create a blob and convert to data URL
                          const blob = new Blob([bytes], { type: thumbnailImageRef.mimeType || 'image/jpeg' });
                          console.log(`🔍 Method 22 - Created blob with size:`, blob.size);
                          const reader = new FileReader();
                          
                          // Use Promise to handle async FileReader
                          console.log(`🔍 Method 22 - Starting FileReader operation...`);
                          console.log(`🔍 Method 22 - Blob size before FileReader:`, blob.size);
                          console.log(`🔍 Method 22 - Blob type before FileReader:`, blob.type);
                          
                          // Try to create data URL directly from base64 data first (more reliable)
                          try {
                            console.log(`🔍 Method 22 - Creating data URL directly from base64 data`);
                            console.log(`🔍 Method 22 - Base64 data length:`, base64Data?.length);
                            console.log(`🔍 Method 22 - Base64 data starts with:`, base64Data?.substring(0, 50));
                            
                            // Validate base64 data
                            if (!base64Data || base64Data.length === 0) {
                              throw new Error('Base64 data is empty or invalid');
                            }
                            
                            // Check if base64 data looks valid (basic validation)
                            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
                            if (!base64Regex.test(base64Data)) {
                              console.log(`⚠️ Method 22 - Base64 data may be invalid, but proceeding anyway`);
                            }
                            
                            const mimeType = thumbnailImageRef.mimeType || 'image/jpeg';
                            const directDataUrl = `data:${mimeType};base64,${base64Data}`;
                            
                            // Test if the data URL is valid by creating an image (synchronous validation)
                            const testImg = new Image();
                            const validationPromise = new Promise((resolve, reject) => {
                              testImg.onload = function() {
                                console.log(`✅ Method 22 - Data URL validation successful, image loaded`);
                                console.log(`✅ Method 22 - Image dimensions: ${testImg.naturalWidth} x ${testImg.naturalHeight}`);
                                resolve(directDataUrl);
                              };
                              testImg.onerror = function() {
                                console.log(`❌ Method 22 - Data URL validation failed, image failed to load`);
                                reject(new Error('Data URL validation failed'));
                              };
                              testImg.src = directDataUrl;
                            });
                            
                            // Wait for validation to complete
                            const validatedDataUrl = await validationPromise;
                            extractedMetadata.thumbnail = validatedDataUrl;
                            console.log(`🔍 Method 22 - Direct data URL creation successful, length:`, validatedDataUrl?.length);
                            console.log(`🔍 Method 22 - extractedMetadata.thumbnail after direct creation:`, extractedMetadata.thumbnail);
                          } catch (directError) {
                            console.log(`❌ Method 22 - Direct data URL creation failed:`, directError);
                            
                            // Fallback to FileReader if direct creation fails
                            try {
                              const reader = new FileReader();
                              const dataUrl = await Promise.race([
                                new Promise((resolve, reject) => {
                                  let resolved = false;
                                  
                                  reader.onload = function() {
                                    if (resolved) return;
                                    resolved = true;
                                    console.log(`🔍 Method 22 - FileReader onload triggered, result length:`, reader.result?.length);
                                    console.log(`🔍 Method 22 - FileReader result type:`, typeof reader.result);
                                    console.log(`🔍 Method 22 - FileReader result starts with:`, reader.result?.substring(0, 50));
                                    console.log(`🔍 Method 22 - FileReader result is valid:`, !!reader.result);
                                    console.log(`🔍 Method 22 - FileReader result is data URL:`, reader.result?.startsWith('data:'));
                                    resolve(reader.result);
                                  };
                                  
                                  reader.onerror = function() {
                                    if (resolved) return;
                                    resolved = true;
                                    console.log(`❌ Method 22 - FileReader onerror triggered`);
                                    console.log(`❌ Method 22 - FileReader error:`, reader.error);
                                    reject(new Error('Failed to read blob'));
                                  };
                                  
                                  reader.onabort = function() {
                                    if (resolved) return;
                                    resolved = true;
                                    console.log(`❌ Method 22 - FileReader onabort triggered`);
                                    reject(new Error('FileReader aborted'));
                                  };
                                  
                                  try {
                                    console.log(`🔍 Method 22 - Calling reader.readAsDataURL(blob)...`);
                                    console.log(`🔍 Method 22 - Blob size: ${blob.size}, type: ${blob.type}`);
                                    reader.readAsDataURL(blob);
                                    console.log(`🔍 Method 22 - reader.readAsDataURL(blob) called successfully`);
                                  } catch (error) {
                                    if (resolved) return;
                                    resolved = true;
                                    console.log(`❌ Method 22 - Error calling reader.readAsDataURL(blob):`, error);
                                    reject(error);
                                  }
                                }),
                                new Promise((_, reject) => {
                                  setTimeout(() => {
                                    console.log(`❌ Method 22 - FileReader timeout after 5 seconds`);
                                    reject(new Error('FileReader timeout'));
                                  }, 5000);
                                })
                              ]);
                              
                              if (dataUrl && dataUrl.startsWith('data:')) {
                                extractedMetadata.thumbnail = dataUrl;
                                console.log(`🔍 Method 22 - Set thumbnail from FileReader, length:`, dataUrl?.length);
                                console.log(`🔍 Method 22 - extractedMetadata.thumbnail after FileReader:`, extractedMetadata.thumbnail);
                              } else {
                                console.log(`❌ Method 22 - FileReader returned invalid result:`, dataUrl);
                                console.log(`❌ Method 22 - Result type:`, typeof dataUrl);
                                console.log(`❌ Method 22 - Result starts with data::`, dataUrl?.startsWith('data:'));
                              }
                            } catch (fileReaderError) {
                              console.log(`❌ Method 22 - FileReader fallback also failed:`, fileReaderError);
                            }
                          }
                        } catch (error) {
                          console.log(`❌ Failed to decode buffer data:`, error);
                        }
                      }
                    } else if (buffer.byteLength) {
                      // Try to access the buffer data directly
                      console.log(`🔍 Method 22 - Buffer has byteLength:`, buffer.byteLength);
                      
                      // Check if we can access the buffer data through the parser
                      // Try to use the parser's getDependency method to get the actual buffer data
                      try {
                        const bufferData = await gltf.parser.getDependency('buffer', bufferView.buffer);
                        console.log(`🔍 Method 22 - Buffer data from getDependency:`, bufferData);
                        console.log(`🔍 Method 22 - Buffer data type:`, bufferData?.constructor?.name);
                        console.log(`🔍 Method 22 - Buffer data byteLength:`, bufferData?.byteLength);
                        
                        if (bufferData instanceof ArrayBuffer) {
                          try {
                            console.log(`🔍 Method 22 - Found ArrayBuffer with size:`, bufferData.byteLength);
                            
                            // Extract the correct slice of the buffer using byteOffset and byteLength
                            const imageData = bufferData.slice(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength);
                            console.log(`🔍 Method 22 - Extracted image data slice with size:`, imageData.byteLength);
                            
                            const blob = new Blob([imageData], { type: thumbnailImageRef.mimeType || 'image/jpeg' });
                            console.log(`🔍 Method 22 - Created blob from ArrayBuffer with size:`, blob.size);
                            const reader = new FileReader();
                            
                            // Use Promise to handle async FileReader
                            console.log(`🔍 Method 22 - Starting FileReader operation for ArrayBuffer...`);
                            console.log(`🔍 Method 22 - ArrayBuffer blob size before FileReader:`, blob.size);
                            console.log(`🔍 Method 22 - ArrayBuffer blob type before FileReader:`, blob.type);
                            
                            // Try to create data URL directly from ArrayBuffer first (more reliable)
                            try {
                              console.log(`🔍 Method 22 - Creating data URL directly from ArrayBuffer`);
                              console.log(`🔍 Method 22 - Image data size:`, imageData.byteLength);
                              console.log(`🔍 Method 22 - Image data type:`, imageData.constructor.name);
                              
                              // Validate ArrayBuffer
                              if (!imageData || imageData.byteLength === 0) {
                                throw new Error('Image data is empty or invalid');
                              }
                              
                              const mimeType = thumbnailImageRef.mimeType || 'image/jpeg';
                              const base64String = btoa(String.fromCharCode(...new Uint8Array(imageData)));
                              console.log(`🔍 Method 22 - Base64 string length:`, base64String?.length);
                              console.log(`🔍 Method 22 - Base64 string starts with:`, base64String?.substring(0, 50));
                              
                              const directDataUrl = `data:${mimeType};base64,${base64String}`;
                              
                              // Test if the data URL is valid by creating an image (synchronous validation)
                              const testImg = new Image();
                              const validationPromise = new Promise((resolve, reject) => {
                                testImg.onload = function() {
                                  console.log(`✅ Method 22 - ArrayBuffer data URL validation successful, image loaded`);
                                  console.log(`✅ Method 22 - Image dimensions: ${testImg.naturalWidth} x ${testImg.naturalHeight}`);
                                  resolve(directDataUrl);
                                };
                                testImg.onerror = function() {
                                  console.log(`❌ Method 22 - ArrayBuffer data URL validation failed, image failed to load`);
                                  reject(new Error('ArrayBuffer data URL validation failed'));
                                };
                                testImg.src = directDataUrl;
                              });
                              
                              // Wait for validation to complete
                              const validatedDataUrl = await validationPromise;
                              extractedMetadata.thumbnail = validatedDataUrl;
                              console.log(`🔍 Method 22 - Direct ArrayBuffer data URL creation successful, length:`, validatedDataUrl?.length);
                              console.log(`🔍 Method 22 - extractedMetadata.thumbnail after direct ArrayBuffer creation:`, extractedMetadata.thumbnail);
                            } catch (directError) {
                              console.log(`❌ Method 22 - Direct ArrayBuffer data URL creation failed:`, directError);
                              
                              // Fallback to FileReader if direct creation fails
                              try {
                                const reader = new FileReader();
                                const dataUrl = await Promise.race([
                                  new Promise((resolve, reject) => {
                                    let resolved = false;
                                    
                                    reader.onload = function() {
                                      if (resolved) return;
                                      resolved = true;
                                      console.log(`🔍 Method 22 - FileReader onload triggered for ArrayBuffer, result length:`, reader.result?.length);
                                      console.log(`🔍 Method 22 - FileReader result type for ArrayBuffer:`, typeof reader.result);
                                      console.log(`🔍 Method 22 - FileReader result starts with for ArrayBuffer:`, reader.result?.substring(0, 50));
                                      console.log(`🔍 Method 22 - FileReader result is valid for ArrayBuffer:`, !!reader.result);
                                      console.log(`🔍 Method 22 - FileReader result is data URL:`, reader.result?.startsWith('data:'));
                                      resolve(reader.result);
                                    };
                                    
                                    reader.onerror = function() {
                                      if (resolved) return;
                                      resolved = true;
                                      console.log(`❌ Method 22 - FileReader onerror triggered for ArrayBuffer`);
                                      console.log(`❌ Method 22 - FileReader error for ArrayBuffer:`, reader.error);
                                      reject(new Error('Failed to read ArrayBuffer'));
                                    };
                                    
                                    reader.onabort = function() {
                                      if (resolved) return;
                                      resolved = true;
                                      console.log(`❌ Method 22 - FileReader onabort triggered for ArrayBuffer`);
                                      reject(new Error('FileReader aborted for ArrayBuffer'));
                                    };
                                    
                                    try {
                                      console.log(`🔍 Method 22 - Calling reader.readAsDataURL(blob) for ArrayBuffer...`);
                                      console.log(`🔍 Method 22 - Blob size: ${blob.size}, type: ${blob.type}`);
                                      reader.readAsDataURL(blob);
                                      console.log(`🔍 Method 22 - reader.readAsDataURL(blob) called successfully for ArrayBuffer`);
                                    } catch (error) {
                                      if (resolved) return;
                                      resolved = true;
                                      console.log(`❌ Method 22 - Error calling reader.readAsDataURL(blob) for ArrayBuffer:`, error);
                                      reject(error);
                                    }
                                  }),
                                  new Promise((_, reject) => {
                                    setTimeout(() => {
                                      console.log(`❌ Method 22 - FileReader timeout for ArrayBuffer after 5 seconds`);
                                      reject(new Error('FileReader timeout for ArrayBuffer'));
                                    }, 5000);
                                  })
                                ]);
                                
                                if (dataUrl && dataUrl.startsWith('data:')) {
                                  extractedMetadata.thumbnail = dataUrl;
                                  console.log(`🔍 Method 22 - Set thumbnail from ArrayBuffer FileReader, length:`, dataUrl?.length);
                                  console.log(`🔍 Method 22 - extractedMetadata.thumbnail after ArrayBuffer FileReader:`, extractedMetadata.thumbnail);
                                } else {
                                  console.log(`❌ Method 22 - FileReader returned invalid result for ArrayBuffer:`, dataUrl);
                                  console.log(`❌ Method 22 - Result type for ArrayBuffer:`, typeof dataUrl);
                                  console.log(`❌ Method 22 - Result starts with data: for ArrayBuffer:`, dataUrl?.startsWith('data:'));
                                }
                              } catch (fileReaderError) {
                                console.log(`❌ Method 22 - ArrayBuffer FileReader fallback also failed:`, fileReaderError);
                              }
                            }
                          } catch (error) {
                            console.log(`❌ Failed to convert ArrayBuffer to data URL:`, error);
                          }
                        }
                      } catch (getDependencyError) {
                        console.log(`❌ Method 22 - Failed to get buffer from getDependency:`, getDependencyError);
                      }
                    }
                  }
                }
              } catch (error) {
                console.log(`❌ Failed to decode bufferView data:`, error);
              }
              
              // Check if thumbnail was set after bufferView processing
              console.log(`🔍 Method 22 - extractedMetadata.thumbnail after bufferView processing:`, extractedMetadata.thumbnail);
            }
          } else {
            console.log(`🔍 Method 22 - No thumbnail image reference found`);
          }
        }
        } catch (error) {
          console.log(`❌ Method 22 - Error in bufferView decoding:`, error);
        }
      }
      
      // Final check after all async operations
      console.log('🔍 Final check - extractedMetadata.thumbnail after all methods:', extractedMetadata.thumbnail);
      console.log('🔍 Final check - thumbnail type:', typeof extractedMetadata.thumbnail);
      console.log('🔍 Final check - thumbnail length:', extractedMetadata.thumbnail?.length);
      console.log('🔍 Final check - thumbnail starts with data::', extractedMetadata.thumbnail?.startsWith('data:'));
      console.log('🔍 Final check - thumbnail is truthy:', !!extractedMetadata.thumbnail);
      
      // Additional validation for thumbnail
      if (extractedMetadata.thumbnail && extractedMetadata.thumbnail.startsWith('data:')) {
        console.log('✅ Final check - Thumbnail appears to be valid data URL');
        
        // Test if the thumbnail can be loaded
        const testImg = new Image();
        testImg.onload = function() {
          console.log('✅ Final check - Thumbnail validation successful, image loaded');
          console.log('✅ Final check - Thumbnail dimensions:', testImg.naturalWidth, 'x', testImg.naturalHeight);
        };
        testImg.onerror = function() {
          console.log('❌ Final check - Thumbnail validation failed, image failed to load');
          console.log('❌ Final check - Invalid thumbnail URL:', extractedMetadata.thumbnail);
        };
        testImg.src = extractedMetadata.thumbnail;
      } else if (extractedMetadata.thumbnail) {
        console.log('⚠️ Final check - Thumbnail exists but is not a data URL:', extractedMetadata.thumbnail);
      } else {
        console.log('❌ Final check - No thumbnail found after all methods');
      }
      
      // Try to extract VRM thumbnail from VRM object properties as final fallback
      if (!extractedMetadata.thumbnail && sceneManager.currentVRM) {
        console.log(`🔍 Final fallback - Checking VRM object properties for thumbnail...`);
        
        // Check if VRM has any image-related properties
        for (const key of Object.keys(sceneManager.currentVRM)) {
          if (key.toLowerCase().includes('image') || key.toLowerCase().includes('texture') || key.toLowerCase().includes('thumbnail')) {
            console.log(`🔍 VRM ${key}:`, sceneManager.currentVRM[key]);
            if (sceneManager.currentVRM[key] && typeof sceneManager.currentVRM[key] === 'object') {
              console.log(`🔍 VRM ${key} structure:`, Object.keys(sceneManager.currentVRM[key]));
              
              // Check if this property contains an image
              if (sceneManager.currentVRM[key].image && sceneManager.currentVRM[key].image instanceof ImageBitmap) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = sceneManager.currentVRM[key].image.width;
                  canvas.height = sceneManager.currentVRM[key].image.height;
                  ctx.drawImage(sceneManager.currentVRM[key].image, 0, 0);
                  extractedMetadata.thumbnail = canvas.toDataURL();
                  console.log(`🔍 Found thumbnail in VRM ${key} and converted to data URL`);
                  break;
                } catch (error) {
                  console.log(`❌ Failed to convert thumbnail from VRM ${key}:`, error);
                }
              }
            }
          }
        }
      }

      // Try to extract VRM image/thumbnail if available
      if (sceneManager.currentVRM && sceneManager.currentVRM.scene) {
        // Look for textures in the VRM scene
        const textures = [];
        console.log('🔍 Starting texture extraction from VRM scene...');
        
        // Look for potential thumbnail textures first
        let thumbnailTexture = null;
        sceneManager.currentVRM.scene.traverse((child) => {
          if (child.isMesh && child.material) {
            // Check if this might be a thumbnail texture
            if (child.name && (child.name.toLowerCase().includes('thumbnail') || 
                               child.name.toLowerCase().includes('preview') || 
                               child.name.toLowerCase().includes('screenshot'))) {
              console.log('🔍 Found potential thumbnail mesh:', child.name);
              if (child.material.map) {
                thumbnailTexture = child.material.map;
                console.log('🔍 Found thumbnail texture:', thumbnailTexture);
              }
            }
          }
        });
        
        // If we found a thumbnail texture, convert it
        if (thumbnailTexture) {
          let thumbnailUrl = null;
          if (thumbnailTexture.image?.src) {
            thumbnailUrl = thumbnailTexture.image.src;
          } else if (thumbnailTexture.image instanceof ImageBitmap) {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = thumbnailTexture.image.width;
              canvas.height = thumbnailTexture.image.height;
              ctx.drawImage(thumbnailTexture.image, 0, 0);
              thumbnailUrl = canvas.toDataURL();
              console.log('🔍 Converted thumbnail ImageBitmap to data URL');
            } catch (error) {
              console.log('❌ Failed to convert thumbnail ImageBitmap:', error);
            }
          }
          if (thumbnailUrl) {
            extractedMetadata.thumbnail = thumbnailUrl;
            console.log('🔍 Set thumbnail from texture:', thumbnailUrl);
          }
        }
        
        sceneManager.currentVRM.scene.traverse((child) => {
          if (child.isMesh && child.material) {
            console.log('🔍 Found mesh with material:', child.name, child.material.name);
            // Handle single material
            if (child.material.map) {
              const texture = child.material.map;
              console.log('🔍 Found main texture:', texture);
              console.log('🔍 Texture image:', texture.image);
              console.log('🔍 Texture source:', texture.source);
              
              // Handle different texture types
              let imageUrl = null;
              if (texture.image?.src) {
                // Regular Image object
                imageUrl = texture.image.src;
              } else if (texture.image instanceof ImageBitmap) {
                // ImageBitmap - convert to data URL
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = texture.image.width;
                  canvas.height = texture.image.height;
                  ctx.drawImage(texture.image, 0, 0);
                  imageUrl = canvas.toDataURL();
                  console.log('🔍 Converted ImageBitmap to data URL');
                } catch (error) {
                  console.log('❌ Failed to convert ImageBitmap:', error);
                }
              } else if (texture.source?.data?.image?.src) {
                // Alternative source path
                imageUrl = texture.source.data.image.src;
              }
              
              console.log('🔍 Extracted imageUrl:', imageUrl);
              if (imageUrl) {
                textures.push({
                  name: child.material.name || 'Unknown Material',
                  texture: texture,
                  imageUrl: imageUrl,
                  type: 'Main Texture'
                });
                console.log('✅ Added main texture:', child.material.name);
              }
            }
            if (child.material.normalMap) {
              const texture = child.material.normalMap;
              let imageUrl = null;
              if (texture.image?.src) {
                imageUrl = texture.image.src;
              } else if (texture.image instanceof ImageBitmap) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = texture.image.width;
                  canvas.height = texture.image.height;
                  ctx.drawImage(texture.image, 0, 0);
                  imageUrl = canvas.toDataURL();
                } catch (error) {
                  console.log('❌ Failed to convert normal map ImageBitmap:', error);
                }
              } else if (texture.source?.data?.image?.src) {
                imageUrl = texture.source.data.image.src;
              }
              
              if (imageUrl) {
                textures.push({
                  name: (child.material.name || 'Unknown Material') + ' Normal',
                  texture: texture,
                  imageUrl: imageUrl,
                  type: 'Normal Map'
                });
              }
            }
            if (child.material.roughnessMap) {
              const texture = child.material.roughnessMap;
              let imageUrl = null;
              if (texture.image?.src) {
                imageUrl = texture.image.src;
              } else if (texture.image instanceof ImageBitmap) {
                try {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  canvas.width = texture.image.width;
                  canvas.height = texture.image.height;
                  ctx.drawImage(texture.image, 0, 0);
                  imageUrl = canvas.toDataURL();
                } catch (error) {
                  console.log('❌ Failed to convert roughness map ImageBitmap:', error);
                }
              } else if (texture.source?.data?.image?.src) {
                imageUrl = texture.source.data.image.src;
              }
              
              if (imageUrl) {
                textures.push({
                  name: (child.material.name || 'Unknown Material') + ' Roughness',
                  texture: texture,
                  imageUrl: imageUrl,
                  type: 'Roughness Map'
                });
              }
            }
          }
        });
        
        extractedMetadata.textures = textures;
        console.log('🖼️ Found VRM textures:', textures.length, textures);
      }
      
      console.log('🔍 Extracted thumbnail value:', extractedMetadata.thumbnail);
      console.log('🔍 Thumbnail type:', typeof extractedMetadata.thumbnail);
      console.log('🔍 Thumbnail length:', extractedMetadata.thumbnail?.length);
      console.log('🔍 Final extractedMetadata:', extractedMetadata);
      
      setVrmMetadata(extractedMetadata);
      
      // Update export options with VRM metadata
      setExportOptions(prev => ({
        ...prev,
        title: extractedMetadata.title,
        author: extractedMetadata.author,
        version: extractedMetadata.version,
        allowedUserName: extractedMetadata.allowedUserName,
        commercialUssageName: extractedMetadata.commercialUssageName,
        vrmVersion: extractedMetadata.metaVersion
      }));
    }; // End of extractMetadataAsync
    
    // Call the async function
    extractMetadataAsync().catch(error => {
      console.error('❌ Error extracting VRM metadata:', error);
      setVrmMetadata(null);
    });
    } else {
      console.log('🔍 VRM metadata extraction skipped - conditions not met');
      console.log('🔍 sceneManager exists:', !!sceneManager);
      console.log('🔍 currentVRM exists:', !!sceneManager?.currentVRM);
      console.log('🔍 currentVRM.meta exists:', !!sceneManager?.currentVRM?.meta);
      setVrmMetadata(null);
    }
  }, [sceneManager?.currentVRM]);

  const handleExport = async () => {
    if (!currentModel) {
      alert('No model to export');
      return;
    }

    try {
      setIsExporting(true);

      // Use CharacterManager's robust VRM exporter (VRM 0.0 pipeline)
      const baseName = exportOptions.filename.endsWith('.vrm')
        ? exportOptions.filename.slice(0, -4)
        : exportOptions.filename;

      await characterManager.downloadVRM(baseName, null);

      alert(`VRM model exported successfully as ${baseName}.vrm`);
    } catch (error) {
      console.error('VRM export failed:', error);
      alert(`VRM export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOptionChange = (option, value) => {
    setExportOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };

  const handleFilenameChange = (e) => {
    const input = e.target;
    const cursorPosition = input.selectionStart;
    const filename = e.target.value;
    
    // Find the position of the last period
    const lastPeriodIndex = filename.lastIndexOf('.');
    
    // If there's a period and cursor is after it, prevent the change
    if (lastPeriodIndex !== -1 && cursorPosition > lastPeriodIndex) {
      // Reset to previous value to prevent editing past the period
      input.value = exportOptions.filename;
      input.setSelectionRange(cursorPosition, cursorPosition);
      return;
    }
    
    // Ensure filename ends with .vrm
    let newFilename = filename;
    if (!filename.endsWith('.vrm')) {
      newFilename = filename + '.vrm';
    }
    
    setExportOptions(prev => ({
      ...prev,
      filename: newFilename
    }));
  };

  const handleFilenameKeyDown = (e) => {
    const input = e.target;
    const cursorPosition = input.selectionStart;
    const filename = input.value;
    const lastPeriodIndex = filename.lastIndexOf('.');
    
    // Prevent cursor movement past the period
    if (lastPeriodIndex !== -1 && cursorPosition > lastPeriodIndex) {
      if (e.key === 'ArrowRight' || e.key === 'End') {
        e.preventDefault();
        input.setSelectionRange(lastPeriodIndex, lastPeriodIndex);
      }
    }
  };

  console.log('🔍 VRMExport component rendering');
  console.log('🔍 sceneManager in render:', sceneManager);
  console.log('🔍 currentModel in render:', currentModel);
  console.log('🔍 sceneManager.currentVRM in render:', sceneManager?.currentVRM);
  console.log('🔍 sceneManager.currentVRM.meta in render:', sceneManager?.currentVRM?.meta);
  console.log('🔍 vrmMetadata state:', vrmMetadata);
  
  return (
    <div className="vrm-export">
      <div className="card">
        <div className="card-header">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="expand-icon-button"
            title={isExpanded ? "Collapse VRM Export" : "Expand VRM Export"}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <h3 className="card-title">VRM Export</h3>
        </div>
        
        {isExpanded && (
          <div className="export-content">
          {!currentModel ? (
            <div className="no-model">
              <p>No model loaded</p>
              <p className="text-sm text-gray-400">
                Load a model first to export it as VRM
              </p>
            </div>
          ) : (
            <div className="export-options">
              <div className="option-group">
                <label className="block mb-1">Filename:</label>
                <input
                  type="text"
                  value={exportOptions.filename}
                  onChange={handleFilenameChange}
                  onKeyDown={handleFilenameKeyDown}
                  className="input w-full"
                  placeholder="export.vrm"
                />
              </div>

              <div className="option-group">
                <label className="block mb-1">VRM Version:</label>
                <select
                  value={exportOptions.vrmVersion}
                  onChange={(e) => handleOptionChange('vrmVersion', e.target.value)}
                  className="input w-full"
                >
                  <option value="0.0">VRM 0.0</option>
                  <option value="1.0">VRM 1.0</option>
                </select>
              </div>

              <div className="option-group">
                <label className="block mb-1">Title:</label>
                <input
                  type="text"
                  value={exportOptions.title}
                  onChange={(e) => handleOptionChange('title', e.target.value)}
                  className="input w-full"
                  placeholder="Model Title"
                />
              </div>

              <div className="option-group">
                <label className="block mb-1">Author:</label>
                <input
                  type="text"
                  value={exportOptions.author}
                  onChange={(e) => handleOptionChange('author', e.target.value)}
                  className="input w-full"
                  placeholder="Author Name"
                />
              </div>

              <div className="option-group">
                <label className="block mb-1">Usage Rights:</label>
                <select
                  value={exportOptions.allowedUserName}
                  onChange={(e) => handleOptionChange('allowedUserName', e.target.value)}
                  className="input w-full"
                >
                  <option value="Everyone">Everyone</option>
                  <option value="ExplicitlyLicensedPerson">Explicitly Licensed Person</option>
                  <option value="OnlyAuthor">Only Author</option>
                </select>
              </div>

              <div className="option-group">
                <label className="block mb-1">Commercial Usage:</label>
                <select
                  value={exportOptions.commercialUssageName}
                  onChange={(e) => handleOptionChange('commercialUssageName', e.target.value)}
                  className="input w-full"
                >
                  <option value="Allow">Allow</option>
                  <option value="Disallow">Disallow</option>
                </select>
              </div>

              <div className="option-group">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportOptions.optimize}
                    onChange={(e) => handleOptionChange('optimize', e.target.checked)}
                  />
                  <span>Optimize model</span>
                </label>
                <p className="text-xs text-gray-400 mt-1">
                  Merge geometries and optimize materials
                </p>
              </div>

              <div className="option-group">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeHumanoidBones}
                    onChange={(e) => handleOptionChange('includeHumanoidBones', e.target.checked)}
                  />
                  <span>Include humanoid bones</span>
                </label>
                <p className="text-xs text-gray-400 mt-1">
                  Add standard VRM humanoid bone structure
                </p>
              </div>

              <div className="option-group">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeExpressions}
                    onChange={(e) => handleOptionChange('includeExpressions', e.target.checked)}
                  />
                  <span>Include expressions</span>
                </label>
                <p className="text-xs text-gray-400 mt-1">
                  Add basic VRM expression blend shapes
                </p>
              </div>

              {/* VRM Metadata Display */}
              {vrmMetadata && (
                <div className="vrm-metadata-section">
                  {console.log('🔍 VRM Metadata Debug:', vrmMetadata)}
                  {console.log('🔍 VRM Textures Debug:', vrmMetadata.textures)}
                  <h4 className="text-lg font-semibold mb-3 text-blue-600">📋 VRM Metadata (from imported VRM)</h4>
                  <div className="metadata-grid">
                    <div className="metadata-item">
                      <label className="metadata-label">Title:</label>
                      <span className="metadata-value">{vrmMetadata.title}</span>
                    </div>
                    <div className="metadata-item">
                      <label className="metadata-label">Author:</label>
                      <span className="metadata-value">{vrmMetadata.author}</span>
                    </div>
                    <div className="metadata-item">
                      <label className="metadata-label">Version:</label>
                      <span className="metadata-value">{vrmMetadata.version}</span>
                    </div>
                    <div className="metadata-item">
                      <label className="metadata-label">VRM Version:</label>
                      <span className="metadata-value">{vrmMetadata.metaVersion}</span>
                    </div>
                    {vrmMetadata.contactInformation && (
                      <div className="metadata-item">
                        <label className="metadata-label">Contact:</label>
                        <span className="metadata-value">{vrmMetadata.contactInformation}</span>
                      </div>
                    )}
                    {vrmMetadata.reference && (
                      <div className="metadata-item">
                        <label className="metadata-label">Reference:</label>
                        <span className="metadata-value">{vrmMetadata.reference}</span>
                      </div>
                    )}
                    <div className="metadata-item">
                      <label className="metadata-label">Allowed User:</label>
                      <span className="metadata-value">{vrmMetadata.allowedUserName}</span>
                    </div>
                    <div className="metadata-item">
                      <label className="metadata-label">Commercial Usage:</label>
                      <span className="metadata-value">{vrmMetadata.commercialUssageName}</span>
                    </div>
                    <div className="metadata-item">
                      <label className="metadata-label">Violent Usage:</label>
                      <span className="metadata-value">{vrmMetadata.violentUssageName}</span>
                    </div>
                    <div className="metadata-item">
                      <label className="metadata-label">Sexual Usage:</label>
                      <span className="metadata-value">{vrmMetadata.sexualUssageName}</span>
                    </div>
                    {vrmMetadata.licenseUrl && (
                      <div className="metadata-item">
                        <label className="metadata-label">License URL:</label>
                        <span className="metadata-value">
                          <a href={vrmMetadata.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            {vrmMetadata.licenseUrl}
                          </a>
                        </span>
                      </div>
                    )}
                    {vrmMetadata.otherPermissionUrl && (
                      <div className="metadata-item">
                        <label className="metadata-label">Other Permission URL:</label>
                        <span className="metadata-value">
                          <a href={vrmMetadata.otherPermissionUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            {vrmMetadata.otherPermissionUrl}
                          </a>
                        </span>
                      </div>
                    )}
                    {vrmMetadata.otherLicenseUrl && (
                      <div className="metadata-item">
                        <label className="metadata-label">Other License URL:</label>
                        <span className="metadata-value">
                          <a href={vrmMetadata.otherLicenseUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            {vrmMetadata.otherLicenseUrl}
                          </a>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* VRM Thumbnail/Preview Image Display */}
                  {console.log('🔍 Checking thumbnail display - vrmMetadata.thumbnail:', vrmMetadata.thumbnail)}
                  {console.log('🔍 Thumbnail exists:', !!vrmMetadata.thumbnail)}
                  {console.log('🔍 Thumbnail type:', typeof vrmMetadata.thumbnail)}
                  {vrmMetadata.thumbnail && (
                    <div style={{ marginTop: '20px', padding: '16px', background: '#2a2a2a', borderRadius: '8px', border: '1px solid #444', borderRadius: '8px' }}>
                      <h5 className="text-md font-semibold mb-2 text-purple-600">🖼️ VRM Thumbnail/Preview</h5>
                      <div style={{ position: 'relative', width: '100%', maxWidth: '300px', margin: '0 auto' }}>
                        <img 
                          src={vrmMetadata.thumbnail} 
                          alt="VRM Thumbnail"
                          style={{ width: '100%', height: 'auto', borderRadius: '8px', border: '2px solid #555', objectFit: 'cover' }}
                          onError={(e) => {
                            console.log('❌ Failed to load VRM thumbnail:', vrmMetadata.thumbnail);
                            console.log('❌ Thumbnail URL:', vrmMetadata.thumbnail);
                            console.log('❌ Thumbnail URL length:', vrmMetadata.thumbnail?.length);
                            console.log('❌ Thumbnail URL type:', typeof vrmMetadata.thumbnail);
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'block';
                          }}
                          onLoad={(e) => {
                            console.log('✅ Successfully loaded VRM thumbnail');
                            console.log('✅ Thumbnail URL:', vrmMetadata.thumbnail);
                            console.log('✅ Thumbnail dimensions:', e.target.naturalWidth, 'x', e.target.naturalHeight);
                          }}
                        />
                        <div style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '200px', background: '#2a2a2a', border: '2px dashed #555', borderRadius: '8px' }}>
                          <div style={{ fontSize: '48px', marginBottom: '16px', color: '#888' }}>🖼️</div>
                          <div style={{ fontSize: '14px', color: '#888', textAlign: 'center' }}>VRM Thumbnail</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {!vrmMetadata.thumbnail && (
                    <div style={{ marginTop: '20px', padding: '16px', background: '#2a2a2a', borderRadius: '8px', border: '1px solid #444' }}>
                      <h5 className="text-md font-semibold mb-2 text-gray-400">🖼️ No VRM Thumbnail Found</h5>
                      <p style={{ color: '#888', fontSize: '14px' }}>No thumbnail image was found in the VRM metadata.</p>
                    </div>
                  )}

                  {/* VRM Image/Texture Display */}
                  {vrmMetadata.textures && vrmMetadata.textures.length > 0 && (
                    <div className="vrm-images-section">
                      <div className="flex items-center mb-2">
                        <button 
                          onClick={() => setIsImagesExpanded(!isImagesExpanded)}
                          className="expand-icon-button mr-2"
                          title={isImagesExpanded ? "Collapse Images" : "Expand Images"}
                        >
                          {isImagesExpanded ? '▼' : '▶'}
                        </button>
                        <h5 className="text-md font-semibold text-green-600">🖼️ VRM Images & Textures ({vrmMetadata.textures.length} found)</h5>
                      </div>
                      {isImagesExpanded && (
                        <div className="images-grid">
                        {vrmMetadata.textures.map((textureInfo, index) => (
                          <div key={index} className="texture-item">
                            <div className="texture-preview">
                              <img 
                                src={textureInfo.imageUrl} 
                                alt={textureInfo.name}
                                className="texture-image"
                                onError={(e) => {
                                  console.log('❌ Failed to load texture image:', textureInfo.name);
                                  console.log('❌ Image URL:', textureInfo.imageUrl);
                                  console.log('❌ Image URL length:', textureInfo.imageUrl?.length);
                                  console.log('❌ Image URL type:', typeof textureInfo.imageUrl);
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'block';
                                }}
                                onLoad={(e) => {
                                  console.log('✅ Successfully loaded texture image:', textureInfo.name);
                                  console.log('✅ Image URL:', textureInfo.imageUrl);
                                  console.log('✅ Image dimensions:', e.target.naturalWidth, 'x', e.target.naturalHeight);
                                }}
                              />
                              <div className="texture-placeholder" style={{ display: 'none' }}>
                                <div className="texture-icon">🖼️</div>
                                <div className="texture-name">{textureInfo.name}</div>
                              </div>
                            </div>
                            <div className="texture-info">
                              <div className="texture-name">{textureInfo.name}</div>
                              <div className="texture-type">{textureInfo.type}</div>
                            </div>
                          </div>
                        ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* VRM Texture Index Info */}
                  {vrmMetadata.texture !== -1 && (
                    <div className="texture-index-info">
                      <div className="metadata-item">
                        <label className="metadata-label">VRM Texture Index:</label>
                        <span className="metadata-value">{vrmMetadata.texture}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="export-actions">
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="btn btn-primary w-full"
                >
                  {isExporting ? (
                    <>
                      <div className="spinner mr-2"></div>
                      Exporting VRM...
                    </>
                  ) : (
                    'Export VRM'
                  )}
                </button>
              </div>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VRMExport;
