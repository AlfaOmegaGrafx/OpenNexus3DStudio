import React, { useState } from 'react';
import { useScene } from '../context/SceneContext';
import { VRMExporter } from '../library/VRMExporter';

const VRMExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
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

  const { currentModel, sceneManager } = useScene();
  const [vrmExporter] = useState(() => new VRMExporter());

  const handleExport = async () => {
    if (!currentModel) {
      alert('No model to export');
      return;
    }

    try {
      setIsExporting(true);
      
      // Create VRM metadata
      const metadata = {
        title: exportOptions.title,
        author: exportOptions.author,
        version: exportOptions.version,
        allowedUserName: exportOptions.allowedUserName,
        commercialUssageName: exportOptions.commercialUssageName
      };

      // Create humanoid bones if needed
      const humanoidBones = exportOptions.includeHumanoidBones 
        ? vrmExporter.createDefaultHumanoidBones(currentModel)
        : {};

      // Create expressions if needed
      const expressions = exportOptions.includeExpressions
        ? vrmExporter.createDefaultExpressions()
        : {};

      const result = await vrmExporter.exportToVRM(currentModel, {
        filename: exportOptions.filename,
        vrmVersion: exportOptions.vrmVersion,
        metadata,
        humanoidBones,
        expressions,
        optimize: exportOptions.optimize
      });
      
      // Show success message
      alert(`VRM model exported successfully as ${result.filename}`);
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
