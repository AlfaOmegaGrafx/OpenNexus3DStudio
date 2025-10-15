import React, { useState } from 'react';
import { useScene } from '../context/SceneContext';

const GLBExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    filename: 'open3dstudio_export.glb',
    forCharacterStudio: true,
    optimize: true,
    includeTextures: true,
    includeAnimations: true
  });

  const { currentModel, exportModel, sceneManager } = useScene();

  const handleExport = async () => {
    if (!currentModel) {
      alert('No model to export');
      return;
    }

    try {
      setIsExporting(true);
      
      const result = await exportModel('glb', exportOptions);
      
      // Show success message
      alert(`Model exported successfully as ${result.filename}`);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message}`);
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
    const filename = e.target.value;
    if (!filename.endsWith('.glb')) {
      setExportOptions(prev => ({
        ...prev,
        filename: filename + '.glb'
      }));
    } else {
      setExportOptions(prev => ({
        ...prev,
        filename
      }));
    }
  };

  return (
    <div className="glb-export">
      <div className="card">
        <div className="card-header">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="expand-icon-button"
            title={isExpanded ? "Collapse GLB Export" : "Expand GLB Export"}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <h3 className="card-title">GLB Export</h3>
        </div>
        
        {isExpanded && (
          <div className="export-content">
          {!currentModel ? (
            <div className="no-model">
              <p>No model loaded</p>
              <p className="text-sm text-gray-400">
                Load a model first to export it
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
                  className="input w-full"
                  placeholder="export.glb"
                />
              </div>

              <div className="option-group">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportOptions.forCharacterStudio}
                    onChange={(e) => handleOptionChange('forCharacterStudio', e.target.checked)}
                  />
                  <span>Optimize for CharacterStudio</span>
                </label>
                <p className="text-xs text-gray-400 mt-1">
                  Adds VRM compatibility and CharacterStudio-specific optimizations
                </p>
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
                    checked={exportOptions.includeTextures}
                    onChange={(e) => handleOptionChange('includeTextures', e.target.checked)}
                  />
                  <span>Include textures</span>
                </label>
              </div>

              <div className="option-group">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeAnimations}
                    onChange={(e) => handleOptionChange('includeAnimations', e.target.checked)}
                  />
                  <span>Include animations</span>
                </label>
              </div>

              <div className="export-actions">
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="btn btn-primary w-full"
                >
                  {isExporting ? (
                    <>
                      <div className="spinner mr-2"></div>
                      Exporting...
                    </>
                  ) : (
                    'Export GLB'
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

export default GLBExport;
