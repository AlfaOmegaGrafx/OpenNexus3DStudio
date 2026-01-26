import React, { useState, useEffect } from 'react';
import { useCore3D } from '../context/Core3DContext';

const Core3DDesigner = () => {
  const { 
    selectedModel, 
    selectedMaterial, 
    currentDesign,
    isGenerating,
    generationProgress,
    generateDesign,
    models,
    materials,
    setSelectedModel,
    setSelectedMaterial
  } = useCore3D();

  const [designOptions, setDesignOptions] = useState({
    quality: 'high',
    lighting: 'studio',
    background: 'transparent',
    resolution: '1024x1024'
  });
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleGenerateDesign = async () => {
    if (!selectedModel || !selectedMaterial) {
      alert('Please select both a model and a material first');
      return;
    }

    try {
      // Only pass valid API options (team if available)
      // UI options like quality, lighting, etc. are not sent to API
      const apiOptions = {};
      if (designOptions.team) {
        apiOptions.team = designOptions.team;
      }
      
      // Use uri if available, otherwise use id
      const modelId = selectedModel.uri || selectedModel.id;
      const materialId = selectedMaterial.uri || selectedMaterial.id;
      const design = await generateDesign(modelId, materialId, apiOptions);
      console.log('Design generated:', design);
      
      // Set preview URL if available
      if (design.preview_url) {
        setPreviewUrl(design.preview_url);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Failed to generate design:', error);
      // Show more detailed error message with full error data
      let errorMessage = `Design generation failed: ${error.message}`;
      if (error.details) {
        errorMessage += `\n\nDetails: ${error.details}`;
      }
      if (error.data && error.data.details) {
        errorMessage += `\n\nValidation errors:\n${JSON.stringify(error.data.details, null, 2)}`;
      }
      alert(errorMessage);
    }
  };

  const handleOptionChange = (option, value) => {
    setDesignOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };

  const handleModelSelect = (modelId) => {
    const model = models.find(m => m.id === modelId);
    setSelectedModel(model);
  };

  const handleMaterialSelect = (materialId) => {
    const material = materials.find(m => m.id === materialId);
    setSelectedMaterial(material);
  };

  return (
    <div className="core3d-designer">
      <div className="designer-header">
        <h4>AI Design Generator</h4>
        <p className="designer-subtitle">
          Combine models and materials to create stunning 3D designs
        </p>
      </div>

      <div className="designer-content">
        <div className="designer-selection">
          <div className="selection-group">
            <h5>Select Model</h5>
            <div className="model-selector">
              {selectedModel ? (
                <div className="selected-item">
                  <div className="item-preview">
                    {selectedModel.thumbnail ? (
                      <img src={selectedModel.thumbnail} alt={selectedModel.name} />
                    ) : (
                      <div className="preview-placeholder">🎭</div>
                    )}
                  </div>
                  <div className="item-info">
                    <span className="item-name">{selectedModel.name}</span>
                    <button 
                      onClick={() => setSelectedModel(null)}
                      className="item-remove"
                      title="Remove selection"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : (
                <div className="selection-placeholder">
                  <span className="placeholder-icon">🎭</span>
                  <span className="placeholder-text">No model selected</span>
                </div>
              )}
            </div>
          </div>

          <div className="selection-group">
            <h5>Select Material</h5>
            <div className="material-selector">
              {selectedMaterial ? (
                <div className="selected-item">
                  <div className="item-preview">
                    {selectedMaterial.thumbnail ? (
                      <img src={selectedMaterial.thumbnail} alt={selectedMaterial.name} />
                    ) : (
                      <div className="preview-placeholder">🎨</div>
                    )}
                  </div>
                  <div className="item-info">
                    <span className="item-name">{selectedMaterial.name}</span>
                    <button 
                      onClick={() => setSelectedMaterial(null)}
                      className="item-remove"
                      title="Remove selection"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ) : (
                <div className="selection-placeholder">
                  <span className="placeholder-icon">🎨</span>
                  <span className="placeholder-text">No material selected</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="designer-options">
          <h5>Design Options</h5>
          <div className="options-grid">
            <div className="option-group">
              <label className="option-label">Quality</label>
              <select
                value={designOptions.quality}
                onChange={(e) => handleOptionChange('quality', e.target.value)}
                className="form-select"
              >
                <option value="low">Low (Fast)</option>
                <option value="medium">Medium</option>
                <option value="high">High (Slow)</option>
                <option value="ultra">Ultra (Very Slow)</option>
              </select>
            </div>

            <div className="option-group">
              <label className="option-label">Lighting</label>
              <select
                value={designOptions.lighting}
                onChange={(e) => handleOptionChange('lighting', e.target.value)}
                className="form-select"
              >
                <option value="studio">Studio</option>
                <option value="outdoor">Outdoor</option>
                <option value="indoor">Indoor</option>
                <option value="dramatic">Dramatic</option>
              </select>
            </div>

            <div className="option-group">
              <label className="option-label">Background</label>
              <select
                value={designOptions.background}
                onChange={(e) => handleOptionChange('background', e.target.value)}
                className="form-select"
              >
                <option value="transparent">Transparent</option>
                <option value="white">White</option>
                <option value="black">Black</option>
                <option value="gradient">Gradient</option>
              </select>
            </div>

            <div className="option-group">
              <label className="option-label">Resolution</label>
              <select
                value={designOptions.resolution}
                onChange={(e) => handleOptionChange('resolution', e.target.value)}
                className="form-select"
              >
                <option value="512x512">512×512</option>
                <option value="1024x1024">1024×1024</option>
                <option value="2048x2048">2048×2048</option>
                <option value="4096x4096">4096×4096</option>
              </select>
            </div>
          </div>
        </div>

        <div className="designer-actions">
          <button
            onClick={handleGenerateDesign}
            disabled={!selectedModel || !selectedMaterial || isGenerating}
            className="btn btn-primary btn-large"
          >
            {isGenerating ? (
              <>
                <div className="spinner mr-2"></div>
                Generating Design... {generationProgress}%
              </>
            ) : (
              <>
                <span className="action-icon">✨</span>
                Generate Design
              </>
            )}
          </button>
        </div>

        {isGenerating && (
          <div className="generation-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${generationProgress}%` }}
              ></div>
            </div>
            <span className="progress-text">
              Generating your design... {generationProgress}%
            </span>
          </div>
        )}

        {currentDesign && (
          <div className="design-result">
            <h5>Generated Design</h5>
            <div className="design-preview">
              {currentDesign.preview_url ? (
                <img 
                  src={currentDesign.preview_url} 
                  alt="Generated design"
                  className="design-image"
                />
              ) : (
                <div className="design-placeholder">
                  <span className="placeholder-icon">✨</span>
                  <span>Design generated successfully!</span>
                </div>
              )}
            </div>
            <div className="design-actions">
              <button className="btn btn-primary">
                Export Design
              </button>
              <button className="btn btn-secondary">
                Save to Library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Core3DDesigner;
