import React, { useState, useEffect } from 'react';
import { useCore3D } from '../context/Core3DContext';

// Demo models for when API is not available
const DEMO_MODELS = [
  {
    id: 'demo-1',
    name: 'Character Base',
    description: 'A versatile character base model perfect for customization',
    category: 'character',
    thumbnail: null,
    polygons: 5000
  },
  {
    id: 'demo-2',
    name: 'Furniture Set',
    description: 'Modern furniture collection with multiple pieces',
    category: 'furniture',
    thumbnail: null,
    polygons: 12000
  },
  {
    id: 'demo-3',
    name: 'Vehicle Model',
    description: 'High-detail vehicle model with interior',
    category: 'vehicle',
    thumbnail: null,
    polygons: 25000
  },
  {
    id: 'demo-4',
    name: 'Architecture',
    description: 'Building structure with detailed facades',
    category: 'architecture',
    thumbnail: null,
    polygons: 18000
  }
];

const Core3DModels = ({ onNavigateToDesigner }) => {
  const { 
    models, 
    selectedModel, 
    setSelectedModel, 
    loadModels, 
    uploadModel, 
    isLoading,
    isInitialized
  } = useCore3D();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [useDemoData, setUseDemoData] = useState(false);
  const [hasTriedLoading, setHasTriedLoading] = useState(false);
  
  // Use demo data if API models are empty
  const displayModels = (models && models.length > 0) ? models : (useDemoData ? DEMO_MODELS : []);

  useEffect(() => {
    if (isInitialized && !hasTriedLoading) {
      setHasTriedLoading(true);
      loadModels().then((result) => {
        // If API returns null or empty array, enable demo data
        if (!result || result.length === 0) {
          setUseDemoData(true);
        }
      }).catch(err => {
        console.warn('Failed to load models (this is okay if endpoint doesn\'t exist):', err);
        // Enable demo data on error
        setUseDemoData(true);
      });
    }
  }, [isInitialized, hasTriedLoading, loadModels]);

  const filteredModels = (displayModels || []).filter(model => {
    if (!model) return false;
    const matchesSearch = (model.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (model.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || model.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...new Set((displayModels || []).map(model => model?.category).filter(Boolean))];
  
  const handleRefresh = async () => {
    setUseDemoData(false);
    try {
      await loadModels();
    } catch (err) {
      console.warn('Failed to load models:', err);
      // If API fails, offer demo data
      if (models.length === 0) {
        setUseDemoData(true);
      }
    }
  };
  
  const handleUseInDesigner = () => {
    if (selectedModel && onNavigateToDesigner) {
      onNavigateToDesigner();
    }
  };

  const handleModelSelect = (model) => {
    console.log('🎯 Core3DModels: Model selected:', model);
    setSelectedModel(model);
  };

  const handleLoadInViewport = async () => {
    if (!selectedModel) {
      console.warn('⚠️ Core3DModels: No model selected');
      return;
    }
    
    console.log('🎯 Core3DModels: Load in viewport clicked for:', selectedModel);
    // Trigger a re-selection to ensure the useEffect in Scene3D fires
    setSelectedModel({...selectedModel, _loadTrigger: Date.now()});
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
    <div className="core3d-models" style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="models-header">
        <h4>3D Models Library</h4>
        <div className="models-controls">
          <button
            onClick={handleRefresh}
            className="btn btn-secondary btn-sm"
            disabled={isLoading}
            title="Refresh models list"
          >
            {isLoading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="btn btn-primary btn-sm"
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : '📤 Upload Model'}
          </button>
        </div>
      </div>
      
      {useDemoData && (
        <div className="demo-data-notice" style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: 'rgba(79, 172, 254, 0.1)',
          border: '1px solid rgba(79, 172, 254, 0.3)',
          borderRadius: '6px',
          fontSize: '0.85rem',
          color: '#4facfe'
        }}>
          📦 Showing demo models. Connect to Core3D API to access the full library.
        </div>
      )}

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
            <p className="empty-subtitle">
              {displayModels.length === 0 
                ? 'Load models from API or upload your own model'
                : 'Try adjusting your search or filter'}
            </p>
            {displayModels.length === 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                <button
                  onClick={handleRefresh}
                  className="btn btn-primary btn-sm"
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : '🔄 Load from API'}
                </button>
                <button
                  onClick={() => setUseDemoData(true)}
                  className="btn btn-secondary btn-sm"
                >
                  📦 Use Demo Models
                </button>
                <button
                  onClick={() => setShowUpload(true)}
                  className="btn btn-primary btn-sm"
                >
                  📤 Upload Model
                </button>
              </div>
            )}
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
            <button 
              className="btn btn-sm btn-primary"
              onClick={handleLoadInViewport}
              disabled={!selectedModel}
            >
              🎯 Load in Viewport
            </button>
            <button 
              className="btn btn-sm btn-primary"
              onClick={handleUseInDesigner}
              disabled={!selectedModel}
            >
              ✨ Use in Designer
            </button>
            <button 
              className="btn btn-sm btn-secondary"
              onClick={() => {
                if (selectedModel?.model_url) {
                  window.open(selectedModel.model_url, '_blank');
                } else {
                  alert(`Model: ${selectedModel.name}\nCategory: ${selectedModel.category}\nPolygons: ${selectedModel.polygons || 'N/A'}`);
                }
              }}
            >
              ℹ️ View Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Core3DModels;
