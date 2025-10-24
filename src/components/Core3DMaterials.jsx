import React, { useState, useEffect } from 'react';
import { useCore3D } from '../context/Core3DContext';

const Core3DMaterials = () => {
  const { 
    materials, 
    selectedMaterial, 
    setSelectedMaterial, 
    loadMaterials, 
    uploadMaterial, 
    isLoading 
  } = useCore3D();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    if (materials.length === 0) {
      loadMaterials();
    }
  }, [materials.length, loadMaterials]);

  const filteredMaterials = materials.filter(material => {
    const matchesSearch = material.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         material.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || material.type === filterType;
    return matchesSearch && matchesType;
  });

  const materialTypes = ['all', ...new Set(materials.map(material => material.type).filter(Boolean))];

  const handleMaterialSelect = (material) => {
    setSelectedMaterial(material);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['.jpg', '.jpeg', '.png', '.tga', '.hdr', '.exr'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(fileExtension)) {
      alert('Please select a valid texture file (.jpg, .png, .tga, .hdr, .exr)');
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
        description: `Uploaded material: ${file.name}`,
        type: 'custom'
      };

      const result = await uploadMaterial(file, metadata);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      alert(`Material uploaded successfully: ${result.name}`);
      setShowUpload(false);
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="core3d-materials">
      <div className="materials-header">
        <h4>Materials & Textures Library</h4>
        <div className="materials-controls">
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="btn btn-primary btn-sm"
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : 'Upload Material'}
          </button>
        </div>
      </div>

      {showUpload && (
        <div className="upload-section">
          <div className="upload-area">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.tga,.hdr,.exr"
              onChange={handleFileUpload}
              className="file-input"
              disabled={isUploading}
            />
            <div className="upload-content">
              <div className="upload-icon">🎨</div>
              <p>Click to select a texture file</p>
              <p className="upload-formats">Supports: JPG, PNG, TGA, HDR, EXR</p>
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

      <div className="materials-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search materials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input"
          />
        </div>
        
        <div className="filter-select">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="form-select"
          >
            {materialTypes.map(type => (
              <option key={type} value={type}>
                {type === 'all' ? 'All Types' : type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="materials-grid">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading materials...</p>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎨</div>
            <p>No materials found</p>
            <p className="empty-subtitle">Try adjusting your search or upload a new material</p>
          </div>
        ) : (
          filteredMaterials.map(material => (
            <div
              key={material.id}
              className={`material-card ${selectedMaterial?.id === material.id ? 'selected' : ''}`}
              onClick={() => handleMaterialSelect(material)}
            >
              <div className="material-preview">
                {material.thumbnail ? (
                  <img 
                    src={material.thumbnail} 
                    alt={material.name}
                    className="material-thumbnail"
                  />
                ) : (
                  <div className="material-placeholder">
                    <span className="placeholder-icon">🎨</span>
                  </div>
                )}
              </div>
              
              <div className="material-info">
                <h5 className="material-name">{material.name}</h5>
                <p className="material-description">{material.description}</p>
                <div className="material-meta">
                  <span className="material-type">{material.type}</span>
                  {material.resolution && (
                    <span className="material-resolution">{material.resolution}</span>
                  )}
                </div>
              </div>
              
              {selectedMaterial?.id === material.id && (
                <div className="material-selected">
                  <span className="selected-icon">✓</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {selectedMaterial && (
        <div className="selected-material-info">
          <h5>Selected Material: {selectedMaterial.name}</h5>
          <p>{selectedMaterial.description}</p>
          <div className="material-actions">
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

export default Core3DMaterials;
