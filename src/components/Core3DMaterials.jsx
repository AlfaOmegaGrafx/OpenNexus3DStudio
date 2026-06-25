import React, { useState, useEffect } from 'react';
import { useCore3D } from '../context/Core3DContext';

// Demo materials for when API is not available
const DEMO_MATERIALS = [
  {
    id: 'demo-mat-1',
    name: 'Metal Chrome',
    description: 'Highly reflective chrome material with realistic reflections',
    type: 'metal',
    thumbnail: null,
    resolution: '2K'
  },
  {
    id: 'demo-mat-2',
    name: 'Fabric Velvet',
    description: 'Soft velvet texture with realistic fabric properties',
    type: 'fabric',
    thumbnail: null,
    resolution: '2K'
  },
  {
    id: 'demo-mat-3',
    name: 'Wood Oak',
    description: 'Natural oak wood grain texture',
    type: 'wood',
    thumbnail: null,
    resolution: '4K'
  },
  {
    id: 'demo-mat-4',
    name: 'Glass Clear',
    description: 'Transparent glass material with refraction',
    type: 'glass',
    thumbnail: null,
    resolution: '2K'
  },
  {
    id: 'demo-mat-5',
    name: 'Stone Marble',
    description: 'Polished marble with natural veining',
    type: 'stone',
    thumbnail: null,
    resolution: '4K'
  }
];

const Core3DMaterials = ({ onNavigateToDesigner }) => {
  const { 
    materials, 
    selectedMaterial, 
    setSelectedMaterial, 
    loadMaterials, 
    uploadMaterial, 
    isLoading,
    isInitialized
  } = useCore3D();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [useDemoData, setUseDemoData] = useState(false);
  const [hasTriedLoading, setHasTriedLoading] = useState(false);
  
  // Use demo data if API materials are empty
  const displayMaterials = (materials && materials.length > 0) ? materials : (useDemoData ? DEMO_MATERIALS : []);

  useEffect(() => {
    if (isInitialized && !hasTriedLoading) {
      setHasTriedLoading(true);
      loadMaterials().then((result) => {
        // If API returns null or empty array, enable demo data
        if (!result || result.length === 0) {
          setUseDemoData(true);
        }
      }).catch(err => {
        console.warn('Failed to load materials (this is okay if endpoint doesn\'t exist):', err);
        // Enable demo data on error
        setUseDemoData(true);
      });
    }
  }, [isInitialized, hasTriedLoading, loadMaterials]);

  const filteredMaterials = (displayMaterials || []).filter(material => {
    if (!material) return false;
    const matchesSearch = (material.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (material.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || material.type === filterType;
    return matchesSearch && matchesType;
  });

  const materialTypes = ['all', ...new Set((displayMaterials || []).map(material => material?.type).filter(Boolean))];
  
  const handleRefresh = async () => {
    setUseDemoData(false);
    try {
      await loadMaterials();
    } catch (err) {
      console.warn('Failed to load materials:', err);
      // If API fails, offer demo data
      if (materials.length === 0) {
        setUseDemoData(true);
      }
    }
  };
  
  const handleUseInDesigner = () => {
    if (selectedMaterial && onNavigateToDesigner) {
      onNavigateToDesigner();
    }
  };

  const handleMaterialSelect = (material) => {
    setSelectedMaterial(material);
  };

  const handleApplyMaterial = async () => {
    if (!selectedMaterial) {
      console.warn('⚠️ Core3DMaterials: No material selected');
      return;
    }
    
    console.log('🎨 Core3DMaterials: Apply material clicked for:', selectedMaterial);
    // Trigger a re-selection to ensure the useEffect in Scene3D fires
    setSelectedMaterial({...selectedMaterial, _loadTrigger: Date.now()});
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
    <div className="core3d-materials" style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="materials-header">
        <h4>Materials & Textures Library</h4>
        <div className="materials-controls">
          <button
            onClick={handleRefresh}
            className="btn btn-secondary btn-sm"
            disabled={isLoading}
            title="Refresh materials list"
          >
            {isLoading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="btn btn-primary btn-sm"
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : '📤 Upload Material'}
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
          📦 Showing demo materials. Connect to Core3D API to access the full library.
        </div>
      )}

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
            <p className="empty-subtitle">
              {displayMaterials.length === 0 
                ? 'Load materials from API or upload your own material'
                : 'Try adjusting your search or filter'}
            </p>
            {displayMaterials.length === 0 && (
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
                  📦 Use Demo Materials
                </button>
                <button
                  onClick={() => setShowUpload(true)}
                  className="btn btn-primary btn-sm"
                >
                  📤 Upload Material
                </button>
              </div>
            )}
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
            <button 
              className="btn btn-sm btn-primary"
              onClick={handleApplyMaterial}
              disabled={!selectedMaterial}
            >
              🎨 Apply Material
            </button>
            <button 
              className="btn btn-sm btn-primary"
              onClick={handleUseInDesigner}
              disabled={!selectedMaterial}
            >
              ✨ Use in Designer
            </button>
            <button 
              className="btn btn-sm btn-secondary"
              onClick={() => {
                if (selectedMaterial?.texture_url) {
                  window.open(selectedMaterial.texture_url, '_blank');
                } else {
                  alert(`Material: ${selectedMaterial.name}\nType: ${selectedMaterial.type}\nResolution: ${selectedMaterial.resolution || 'N/A'}`);
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

export default Core3DMaterials;
