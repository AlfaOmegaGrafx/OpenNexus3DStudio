import React, { useState, useRef } from 'react';
import { VRMLoader } from '../library/vrmLoader';

const VRMImport = ({ onVRMImported }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [vrmMetadata, setVrmMetadata] = useState(null);
  const [loader] = useState(() => new VRMLoader());
  const fileInputRef = useRef(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.vrm')) {
      alert('Please select a VRM file');
      return;
    }

    try {
      setIsLoading(true);
      setValidationResult(null);
      setVrmMetadata(null);

      // Load and process the VRM file
      const vrm = await loader.loadVRM(file, {
        normalize: true,
        addDefaultMaterials: true,
        processBlendShapes: true,
        setupBones: true
      });

      // Get VRM metadata
      const metadata = loader.getVRMMetadata(vrm);
      setVrmMetadata(metadata);

      // Validate the VRM model
      const validation = loader.validateVRM(vrm);
      setValidationResult(validation);

      if (validation.valid) {
        // Notify parent component
        if (onVRMImported) {
          onVRMImported(vrm, file);
        }
        
        alert('VRM model imported successfully!');
      } else {
        console.warn('VRM validation issues:', validation.issues);
        alert(`VRM imported with issues: ${validation.issues.join(', ')}`);
      }
    } catch (error) {
      console.error('VRM import failed:', error);
      alert(`VRM import failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="vrm-import">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">VRM Import</h3>
        </div>
        
        <div className="import-content">
          <div className="import-info mb-3">
            <p className="text-sm text-gray-400 mb-2">
              Import VRM models for use in OpenNexus3DStudio
            </p>
            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>VRM 0.0 and 1.0 support</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>Humanoid bone structure</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>Blend shapes and expressions</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>VRM material support</span>
              </div>
            </div>
          </div>

          <div className="import-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".vrm"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            <button
              onClick={handleClick}
              disabled={isLoading}
              className="btn btn-primary w-full"
            >
              {isLoading ? (
                <>
                  <div className="spinner mr-2"></div>
                  Loading VRM...
                </>
              ) : (
                'Import VRM Model'
              )}
            </button>
          </div>

          {vrmMetadata && (
            <div className="vrm-metadata mt-3">
              <h4 className="text-sm font-semibold mb-2">VRM Metadata:</h4>
              <div className="metadata-grid">
                <div className="metadata-item">
                  <span className="metadata-label">Title:</span>
                  <span className="metadata-value">{vrmMetadata.title}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Author:</span>
                  <span className="metadata-value">{vrmMetadata.author}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Version:</span>
                  <span className="metadata-value">{vrmMetadata.version}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Usage:</span>
                  <span className="metadata-value">{vrmMetadata.allowedUserName}</span>
                </div>
              </div>
            </div>
          )}

          {validationResult && (
            <div className="validation-result mt-3">
              <div className={`validation-status ${validationResult.valid ? 'valid' : 'invalid'}`}>
                <span className="status-icon">
                  {validationResult.valid ? '✓' : '⚠'}
                </span>
                <span className="status-text">
                  {validationResult.valid ? 'VRM is valid' : 'VRM has issues'}
                </span>
              </div>
              
              {validationResult.issues.length > 0 && (
                <div className="validation-issues">
                  <h4 className="text-sm font-semibold mb-1">Issues:</h4>
                  <ul className="text-xs text-red-400">
                    {validationResult.issues.map((issue, index) => (
                      <li key={index}>• {issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {validationResult.warnings.length > 0 && (
                <div className="validation-warnings">
                  <h4 className="text-sm font-semibold mb-1">Warnings:</h4>
                  <ul className="text-xs text-yellow-400">
                    {validationResult.warnings.map((warning, index) => (
                      <li key={index}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VRMImport;
