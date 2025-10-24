import React, { useState, useEffect } from 'react';
import { useCore3D } from '../context/Core3DContext';

const Core3DModels = () => {
  const { 
    models, 
    selectedModel, 
    setSelectedModel, 
    loadModels, 
    uploadModel, 
    isLoading 
  } = useCore3D();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    if (models.length === 0) {
      loadModels();
    }
  }, [models.length, loadModels]);

  const filteredModels = models.filter(model => {
    const matchesSearch = model.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         model.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || model.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...new Set(models.map(model => model.category).filter(Boolean))];

  const handleModelSelect = (model) => {
    setSelectedModel(model);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['.glb', '.gltf', '.fbx', '.obj'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(fileExtension)) {
      alert('Please select a valid 3D model file (.glb, .gltf, .fbx, .obj)');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const metadata = {
        name: file.name.split('.')[0],
        description: `Uploaded model: ${file.name}`,
        category: 'custom'
      };

      const result = await uploadModel(file, metadata);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      alert(`Model uploaded successfully: ${result.name}`);
      setShowUpload(false);
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="core3d-models">
      <div className="models-header">
        <h4>3D Models Library</h4>
        <div className="models-controls">
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="btn btn-primary btn-sm"
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : 'Upload Model'}
          </button>
        </div>
      </div>

      {showUpload && (
        <div className="upload-section">
          <div className="upload-area">
            <input
              type="file"
              accept=".glb,.gltf,.fbx,.obj"
              onChange={handleFileUpload}
              className="file-input"
              disabled={isUploading}
            />
            <div className="upload-content">
              <div className="upload-icon">📁</div>
              <p>Click to select a 3D model file</p>
              <p className="upload-formats">Supports: GLB, GLTF, FBX, OBJ</p>
            </div>
          </div>
          
          {isUploading && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <span className="progress-text">{uploadProgress}%</span>
            </div>
          )}
        </div>
      )}

      <div className="models-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input"
          />
        </div>
        
        <div className="filter-select">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="form-select"
          >
            {categories.map(category => (
              <option key={category} value={category}>
                {category === 'all' ? 'All Categories' : category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="models-grid">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading models...</p>
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎭</div>
            <p>No models found</p>
            <p className="empty-subtitle">Try adjusting your search or upload a new model</p>
          </div>
        ) : (
          filteredModels.map(model => (
            <div
              key={model.id}
              className={`model-card ${selectedModel?.id === model.id ? 'selected' : ''}`}
              onClick={() => handleModelSelect(model)}
            >
              <div className="model-preview">
                {model.thumbnail ? (
                  <img 
                    src={model.thumbnail} 
                    alt={model.name}
                    className="model-thumbnail"
                  />
                ) : (
                  <div className="model-placeholder">
                    <span className="placeholder-icon">🎭</span>
                  </div>
                )}
              </div>
              
              <div className="model-info">
                <h5 className="model-name">{model.name}</h5>
                <p className="model-description">{model.description}</p>
                <div className="model-meta">
                  <span className="model-category">{model.category}</span>
                  {model.polygons && (
                    <span className="model-polygons">{model.polygons} polygons</span>
                  )}
                </div>
              </div>
              
              {selectedModel?.id === model.id && (
                <div className="model-selected">
                  <span className="selected-icon">✓</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {selectedModel && (
        <div className="selected-model-info">
          <h5>Selected Model: {selectedModel.name}</h5>
          <p>{selectedModel.description}</p>
          <div className="model-actions">
            <button className="btn btn-sm btn-primary">
              Use in Designer
            </button>
            <button className="btn btn-sm btn-secondary">
              View Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Core3DModels;
