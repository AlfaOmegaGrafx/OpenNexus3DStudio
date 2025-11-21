import React, { useState, useRef } from 'react';
import { CharacterStudioBridge } from '../library/characterStudioBridge';

const CharacterStudioImport = ({ onModelImported }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [bridge] = useState(() => new CharacterStudioBridge());
  const fileInputRef = useRef(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.glb')) {
      alert('Please select a GLB file');
      return;
    }

    try {
      setIsLoading(true);
      setValidationResult(null);

      // Load and process the GLB file
      const processedModel = await bridge.loadOpenNexus3DStudioGLB(file, {
        convertToVRM: true,
        addVRMStructure: true,
        optimizeForCharacterStudio: true,
        addDefaultMaterials: true
      });

      // Validate the processed model
      const validation = bridge.validateForCharacterStudio(processedModel);
      setValidationResult(validation);

      if (validation.valid) {
        // Notify parent component
        if (onModelImported) {
          onModelImported(processedModel, file);
        }
        
        alert('Model imported successfully for CharacterStudio!');
      } else {
        console.warn('Model validation issues:', validation.issues);
        alert(`Model imported with issues: ${validation.issues.join(', ')}`);
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="character-studio-import">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">CharacterStudio Import</h3>
        </div>
        
        <div className="import-content">
          <div className="import-info mb-3">
            <p className="text-sm text-gray-400 mb-2">
              Import GLB files exported from OpenNexus3DStudio for use in CharacterStudio
            </p>
            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>VRM compatibility conversion</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>CharacterStudio optimization</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>Automatic material setup</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span>Bone structure preparation</span>
              </div>
            </div>
          </div>

          <div className="import-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb"
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
                  Processing...
                </>
              ) : (
                'Import GLB for CharacterStudio'
              )}
            </button>
          </div>

          {validationResult && (
            <div className="validation-result mt-3">
              <div className={`validation-status ${validationResult.valid ? 'valid' : 'invalid'}`}>
                <span className="status-icon">
                  {validationResult.valid ? '✓' : '⚠'}
                </span>
                <span className="status-text">
                  {validationResult.valid ? 'Model is compatible' : 'Model has issues'}
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

export default CharacterStudioImport;




