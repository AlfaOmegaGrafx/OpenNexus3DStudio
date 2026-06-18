import React, { useState, useEffect } from 'react';
import { useCore3D } from '../context/Core3DContext';

const Core3DExports = () => {
  const { 
    userDesigns, 
    currentDesign,
    exportDesign, 
    loadUserDesigns,
    isLoading 
  } = useCore3D();
  
  const [selectedDesign, setSelectedDesign] = useState(null);
  const [exportOptions, setExportOptions] = useState({
    format: 'glb',
    quality: 'high',
    includeTextures: true,
    includeAnimations: true
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  useEffect(() => {
    loadUserDesigns();
  }, [loadUserDesigns]);

  const handleExport = async (design) => {
    if (!design) {
      alert('Please select a design to export');
      return;
    }

    try {
      setIsExporting(true);
      setExportProgress(0);
      
      // Simulate export progress
      const progressInterval = setInterval(() => {
        setExportProgress(prev => Math.min(prev + 10, 90));
      }, 300);

      const blob = await exportDesign(design.id, exportOptions);
      
      clearInterval(progressInterval);
      setExportProgress(100);
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${design.name || 'design'}.${exportOptions.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('Design exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleOptionChange = (option, value) => {
    setExportOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };

  const formatOptions = [
    { value: 'glb', label: 'GLB (Binary GLTF)', description: 'Best for web and real-time' },
    { value: 'gltf', label: 'GLTF (JSON)', description: 'Human-readable format' },
    { value: 'fbx', label: 'FBX', description: 'Industry standard' },
    { value: 'obj', label: 'OBJ', description: 'Simple mesh format' }
  ];

  const qualityOptions = [
    { value: 'low', label: 'Low (Fast)', description: 'Quick export, smaller file' },
    { value: 'medium', label: 'Medium', description: 'Balanced quality and size' },
    { value: 'high', label: 'High', description: 'Best quality, larger file' },
    { value: 'ultra', label: 'Ultra', description: 'Maximum quality, very large file' }
  ];

  return (
    <div className="core3d-exports">
      <div className="exports-header">
        <h4>Export Designs</h4>
        <p className="exports-subtitle">
          Export your generated designs in various formats
        </p>
      </div>

      <div className="exports-content">
        <div className="designs-section">
          <h5>Your Designs</h5>
          <div className="designs-list">
            {isLoading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading designs...</p>
              </div>
            ) : userDesigns.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📤</div>
                <p>No designs found</p>
                <p className="empty-subtitle">Generate some designs first</p>
              </div>
            ) : (
              userDesigns.map(design => (
                <div
                  key={design.id}
                  className={`design-item ${selectedDesign?.id === design.id ? 'selected' : ''}`}
                  onClick={() => setSelectedDesign(design)}
                >
                  <div className="design-preview">
                    {design.preview_url ? (
                      <img 
                        src={design.preview_url} 
                        alt={design.name}
                        className="design-thumbnail"
                      />
                    ) : (
                      <div className="design-placeholder">
                        <span className="placeholder-icon">✨</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="design-info">
                    <h6 className="design-name">{design.name || 'Untitled Design'}</h6>
                    <p className="design-description">{design.description}</p>
                    <div className="design-meta">
                      <span className="design-date">
                        {new Date(design.created_at).toLocaleDateString()}
                      </span>
                      <span className="design-status">{design.status}</span>
                    </div>
                  </div>
                  
                  {selectedDesign?.id === design.id && (
                    <div className="design-selected">
                      <span className="selected-icon">✓</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {selectedDesign && (
          <div className="export-section">
            <h5>Export Options</h5>
            
            <div className="export-options">
              <div className="option-group">
                <label className="option-label">Format</label>
                <select
                  value={exportOptions.format}
                  onChange={(e) => handleOptionChange('format', e.target.value)}
                  className="form-select"
                >
                  {formatOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="option-description">
                  {formatOptions.find(opt => opt.value === exportOptions.format)?.description}
                </p>
              </div>

              <div className="option-group">
                <label className="option-label">Quality</label>
                <select
                  value={exportOptions.quality}
                  onChange={(e) => handleOptionChange('quality', e.target.value)}
                  className="form-select"
                >
                  {qualityOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="option-description">
                  {qualityOptions.find(opt => opt.value === exportOptions.quality)?.description}
                </p>
              </div>

              <div className="option-group">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeTextures}
                    onChange={(e) => handleOptionChange('includeTextures', e.target.checked)}
                  />
                  <span>Include Textures</span>
                </label>
              </div>

              <div className="option-group">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeAnimations}
                    onChange={(e) => handleOptionChange('includeAnimations', e.target.checked)}
                  />
                  <span>Include Animations</span>
                </label>
              </div>
            </div>

            <div className="export-actions">
              <button
                onClick={() => handleExport(selectedDesign)}
                disabled={isExporting}
                className="btn btn-primary btn-large"
              >
                {isExporting ? (
                  <>
                    <div className="spinner mr-2"></div>
                    Exporting... {exportProgress}%
                  </>
                ) : (
                  <>
                    <span className="action-icon">📤</span>
                    Export Design
                  </>
                )}
              </button>
            </div>

            {isExporting && (
              <div className="export-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${exportProgress}%` }}
                  ></div>
                </div>
                <span className="progress-text">
                  Exporting design... {exportProgress}%
                </span>
              </div>
            )}
          </div>
        )}

        {currentDesign && (
          <div className="current-design-info">
            <h5>Current Design</h5>
            <div className="current-design-preview">
              {currentDesign.preview_url ? (
                <img 
                  src={currentDesign.preview_url} 
                  alt="Current design"
                  className="current-design-image"
                />
              ) : (
                <div className="current-design-placeholder">
                  <span className="placeholder-icon">✨</span>
                  <span>Design ready for export</span>
                </div>
              )}
            </div>
            <div className="current-design-actions">
              <button 
                onClick={() => handleExport(currentDesign)}
                className="btn btn-primary"
                disabled={isExporting}
              >
                Export Current Design
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Core3DExports;
