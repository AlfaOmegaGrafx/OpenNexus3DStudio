/**
 * TextureExtractor - Component for extracting and displaying textures from 3D models
 * Allows users to view, download, and manage all textures in a loaded model
 */
import React, { useState, useEffect } from 'react';
import { useScene } from '../context/SceneContext';
import './TextureExtractor.css';

const TextureExtractor = () => {
  const { sceneManager } = useScene();
  const [extractedTextures, setExtractedTextures] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedTexture, setSelectedTexture] = useState(null);

  /**
   * Extract all textures from the current model
   */
  const extractTextures = () => {
    try {
      if (!sceneManager || (!sceneManager.currentModel && !sceneManager.currentVRM)) {
        console.warn('No model loaded to extract textures from');
        setExtractedTextures([]);
        return;
      }

      setIsExtracting(true);
      console.log('🎨 Starting texture extraction...');

      const textures = [];
      const processedTextures = new Set();
      const model = sceneManager.currentVRM || sceneManager.currentModel;
      
      if (!model) {
        console.warn('Model is null or undefined');
        setIsExtracting(false);
        return;
      }

    // Texture type configurations
    const textureTypes = [
      { key: 'map', name: 'Diffuse/Albedo', icon: '🎨' },
      { key: 'normalMap', name: 'Normal Map', icon: '🗺️' },
      { key: 'roughnessMap', name: 'Roughness', icon: '✨' },
      { key: 'metalnessMap', name: 'Metalness', icon: '🔩' },
      { key: 'emissiveMap', name: 'Emissive', icon: '💡' },
      { key: 'aoMap', name: 'Ambient Occlusion', icon: '🌑' },
      { key: 'lightMap', name: 'Light Map', icon: '☀️' },
      { key: 'bumpMap', name: 'Bump Map', icon: '⛰️' },
      { key: 'displacementMap', name: 'Displacement', icon: '📐' },
      { key: 'alphaMap', name: 'Alpha/Transparency', icon: '👁️' },
      { key: 'envMap', name: 'Environment', icon: '🌍' }
    ];

    // Traverse model to find all materials and textures
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((material) => {
          textureTypes.forEach(({ key, name, icon }) => {
            const texture = material[key];
            
            if (texture && !processedTextures.has(texture.uuid)) {
              processedTextures.add(texture.uuid);
              
              // Convert texture to data URL
              const textureData = convertTextureToDataURL(texture);
              
              if (textureData) {
                textures.push({
                  uuid: texture.uuid,
                  name: texture.name || `${material.name || 'Material'}_${name}`,
                  type: name,
                  typeIcon: icon,
                  materialName: material.name || 'Unnamed Material',
                  meshName: child.name || 'Unnamed Mesh',
                  dataUrl: textureData.dataUrl,
                  width: textureData.width,
                  height: textureData.height,
                  format: textureData.format,
                  texture: texture,
                  wrapS: texture.wrapS,
                  wrapT: texture.wrapT,
                  magFilter: texture.magFilter,
                  minFilter: texture.minFilter,
                  flipY: texture.flipY,
                  encoding: texture.encoding
                });
                
                console.log(`✅ Extracted: ${icon} ${name} from ${material.name || 'material'}`);
              }
            }
          });
        });
      }
    });

    console.log(`🎨 Total textures extracted: ${textures.length}`);
    setExtractedTextures(textures);
    setIsExtracting(false);
    } catch (error) {
      console.error('❌ Error during texture extraction:', error);
      setExtractedTextures([]);
      setIsExtracting(false);
      // Don't throw - just log the error to prevent white screen
    }
  };

  /**
   * Convert Three.js texture to data URL
   */
  const convertTextureToDataURL = (texture) => {
    try {
      let imageUrl = null;
      let width = 0;
      let height = 0;
      let format = 'unknown';

      // Handle different texture sources
      if (texture.image) {
        if (texture.image.src) {
          // Regular Image object
          imageUrl = texture.image.src;
          width = texture.image.width || 0;
          height = texture.image.height || 0;
          format = 'image';
        } else if (texture.image instanceof ImageBitmap) {
          // ImageBitmap - convert to canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = texture.image.width;
          canvas.height = texture.image.height;
          ctx.drawImage(texture.image, 0, 0);
          imageUrl = canvas.toDataURL('image/png');
          width = texture.image.width;
          height = texture.image.height;
          format = 'ImageBitmap→PNG';
        } else if (texture.image instanceof HTMLCanvasElement) {
          // Canvas element
          imageUrl = texture.image.toDataURL('image/png');
          width = texture.image.width;
          height = texture.image.height;
          format = 'Canvas→PNG';
        } else if (texture.image.data) {
          // Data texture - convert to canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const imageData = new ImageData(
            new Uint8ClampedArray(texture.image.data),
            texture.image.width,
            texture.image.height
          );
          canvas.width = texture.image.width;
          canvas.height = texture.image.height;
          ctx.putImageData(imageData, 0, 0);
          imageUrl = canvas.toDataURL('image/png');
          width = texture.image.width;
          height = texture.image.height;
          format = 'DataTexture→PNG';
        }
      } else if (texture.source?.data) {
        // Alternative source path
        if (texture.source.data.src) {
          imageUrl = texture.source.data.src;
          width = texture.source.data.width || 0;
          height = texture.source.data.height || 0;
          format = 'source';
        }
      }

      if (imageUrl) {
        return { dataUrl: imageUrl, width, height, format };
      }
    } catch (error) {
      console.error('❌ Failed to convert texture:', error);
    }
    
    return null;
  };

  /**
   * Download texture as image file
   */
  const downloadTexture = (texture) => {
    if (!texture.dataUrl) {
      console.warn('No data URL available for texture:', texture.name);
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = texture.dataUrl;
      link.download = `${texture.name.replace(/[^a-z0-9]/gi, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`✅ Downloaded texture: ${texture.name}`);
    } catch (error) {
      console.error('❌ Failed to download texture:', error);
    }
  };

  /**
   * Download all textures as a ZIP (simplified version - downloads individually)
   */
  const downloadAllTextures = () => {
    extractedTextures.forEach((texture, index) => {
      setTimeout(() => {
        downloadTexture(texture);
      }, index * 200); // Stagger downloads to avoid browser blocking
    });
  };

  /**
   * Auto-extract textures when component mounts or model changes
   */
  useEffect(() => {
    if (sceneManager && (sceneManager.currentModel || sceneManager.currentVRM)) {
      // Use a timeout to prevent immediate extraction that could cause white screen
      const timeoutId = setTimeout(() => {
        try {
          extractTextures();
        } catch (error) {
          console.error('❌ Texture extraction error:', error);
          // Don't let texture extraction errors crash the app
        }
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, []); // Empty dependency array - only run on mount
  
  /**
   * Expose extractTextures to be called manually when needed
   */
  useEffect(() => {
    // Store reference for manual extraction
    if (sceneManager) {
      sceneManager.extractTexturesManually = extractTextures;
    }
  }, [sceneManager]);

  return (
    <div className="texture-extractor">
      <div className="texture-extractor-header">
        <h2>🎨 Texture Extractor</h2>
        <div className="texture-extractor-actions">
          <button 
            onClick={extractTextures}
            disabled={isExtracting || !sceneManager?.currentModel}
            className="btn-extract"
          >
            {isExtracting ? '⏳ Extracting...' : '🔄 Refresh Textures'}
          </button>
          
          {extractedTextures.length > 0 && (
            <button 
              onClick={downloadAllTextures}
              className="btn-download-all"
            >
              📦 Download All ({extractedTextures.length})
            </button>
          )}
        </div>
      </div>

      {!sceneManager?.currentModel && !sceneManager?.currentVRM && (
        <div className="texture-extractor-empty">
          <p>No model loaded. Please load a 3D model first.</p>
        </div>
      )}

      {extractedTextures.length === 0 && (sceneManager?.currentModel || sceneManager?.currentVRM) && !isExtracting && (
        <div className="texture-extractor-empty">
          <p>No textures found in the current model.</p>
        </div>
      )}

      {extractedTextures.length > 0 && (
        <div className="texture-grid">
          {extractedTextures.map((texture) => (
            <div 
              key={texture.uuid} 
              className={`texture-card ${selectedTexture?.uuid === texture.uuid ? 'selected' : ''}`}
              onClick={() => setSelectedTexture(texture)}
            >
              <div className="texture-preview">
                <img 
                  src={texture.dataUrl} 
                  alt={texture.name}
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23ddd"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23999">No Preview</text></svg>';
                  }}
                />
                <div className="texture-overlay">
                  <span className="texture-icon">{texture.typeIcon}</span>
                  <span className="texture-type">{texture.type}</span>
                </div>
              </div>
              
              <div className="texture-info">
                <div className="texture-name" title={texture.name}>
                  {texture.name}
                </div>
                <div className="texture-meta">
                  <span className="texture-size">
                    {texture.width} × {texture.height}
                  </span>
                  <span className="texture-format">{texture.format}</span>
                </div>
                <div className="texture-material" title={`Material: ${texture.materialName}`}>
                  📦 {texture.materialName}
                </div>
              </div>
              
              <div className="texture-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadTexture(texture);
                  }}
                  className="btn-download"
                  title="Download texture"
                >
                  ⬇️ Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedTexture && (
        <div className="texture-details-modal" onClick={() => setSelectedTexture(null)}>
          <div className="texture-details-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedTexture(null)}>×</button>
            
            <h3>{selectedTexture.typeIcon} {selectedTexture.name}</h3>
            
            <div className="texture-details-preview">
              <img src={selectedTexture.dataUrl} alt={selectedTexture.name} />
            </div>
            
            <div className="texture-details-info">
              <div className="info-row">
                <span className="info-label">Type:</span>
                <span className="info-value">{selectedTexture.type}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Size:</span>
                <span className="info-value">{selectedTexture.width} × {selectedTexture.height}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Format:</span>
                <span className="info-value">{selectedTexture.format}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Material:</span>
                <span className="info-value">{selectedTexture.materialName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Mesh:</span>
                <span className="info-value">{selectedTexture.meshName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">UUID:</span>
                <span className="info-value mono">{selectedTexture.uuid}</span>
              </div>
            </div>
            
            <div className="texture-details-actions">
              <button onClick={() => downloadTexture(selectedTexture)} className="btn-primary">
                ⬇️ Download Texture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextureExtractor;

