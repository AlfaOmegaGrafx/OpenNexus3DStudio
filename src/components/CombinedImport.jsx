import React, { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { VRMLoader } from '../library/vrmLoader';

const CombinedImport = ({ onFileLoad }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [vrmMetadata, setVrmMetadata] = useState(null);
  const [loader] = useState(() => new VRMLoader());
  const fileInputRef = useRef(null);

  const handleVRMFile = async (file) => {
    try {
      setIsLoading(true);
      setValidationResult(null);
      setVrmMetadata(null);

      // Load and process the VRM file with fallback support
      const vrm = await loader.loadVRM(file, {
        normalize: true,
        addDefaultMaterials: true,
        processBlendShapes: true,
        setupBones: true,
        allowMissingHumanoidBones: true
      });

      // Get VRM metadata
      const metadata = loader.getVRMMetadata(vrm);
      setVrmMetadata(metadata);

      // Validate the VRM model
      const validation = loader.validateVRM(vrm);
      setValidationResult(validation);

      if (validation.valid) {
        // Notify parent component with the file (not the processed VRM object)
        if (onFileLoad) {
          onFileLoad(file);
        }
        
        if (validation.isFallbackVRM) {
          alert('VRM model imported successfully in fallback mode (no humanoid bones)!');
        } else {
          alert('VRM model imported successfully!');
        }
      } else {
        console.warn('VRM validation issues:', validation.issues);
        if (validation.isFallbackVRM) {
          alert(`VRM imported in fallback mode with issues: ${validation.issues.join(', ')}`);
        } else {
          alert(`VRM imported with issues: ${validation.issues.join(', ')}`);
        }
      }
    } catch (error) {
      console.error('VRM import failed:', error);
      alert(`VRM import failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (file) => {
    if (!file) return;

    // Check if it's a VRM file
    if (file.name.toLowerCase().endsWith('.vrm')) {
      await handleVRMFile(file);
    } else {
      // Handle other file types
      if (onFileLoad) {
        onFileLoad(file);
      }
    }
  };

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      handleFileSelect(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'model/gltf-binary': ['.glb'],
      'model/gltf+json': ['.gltf'],
      'model/obj': ['.obj'],
      'model/fbx': ['.fbx'],
      'model/vrm': ['.vrm'],
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.tga']
    },
    multiple: false
  });

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="combined-import">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Import Files</h3>
        </div>
        
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''}`}
          style={{
            border: '2px dashed #555',
            borderRadius: '6px',
            padding: '0.75rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: isDragActive ? '#3a3a3a' : 'transparent'
          }}
        >
          <input {...getInputProps()} />
          
          <div className="upload-content">
            <div className="upload-icon" style={{ fontSize: '1.8rem', marginBottom: '0.3rem' }}>
              📁
            </div>
            
            {isDragActive ? (
              <p style={{ fontSize: '0.8rem', margin: '0.2rem 0' }}>Drop the file here...</p>
            ) : (
              <div>
                <p style={{ fontSize: '0.8rem', margin: '0.2rem 0' }}>Drag & drop a file here, or click to select</p>
                <p className="text-sm text-gray-400" style={{ fontSize: '0.75rem', margin: '0.15rem 0' }}>
                  Supports: GLB, GLTF, OBJ, FBX, VRM, JPG, PNG
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="upload-info" style={{ marginTop: '0.5rem', padding: '0 0.75rem' }}>
          <h4 className="text-sm font-semibold" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Supported Formats:</h4>
          <div className="format-list">
            <div className="format-item">
              <strong>3D Models:</strong> GLB, GLTF, OBJ, FBX, VRM, DAE, STL
            </div>
            <div className="format-item">
              <strong>Images:</strong> JPG, PNG, BMP, TGA
            </div>
          </div>
        </div>

        {vrmMetadata && (
          <div className="vrm-metadata" style={{ marginTop: '0.5rem', padding: '0 0.75rem' }}>
            <h4 className="text-sm font-semibold" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>VRM Metadata:</h4>
            <div className="metadata-grid" style={{ fontSize: '0.7rem' }}>
              <div className="metadata-item" style={{ marginBottom: '0.2rem' }}>
                <span className="metadata-label">Title:</span>
                <span className="metadata-value">{vrmMetadata.title}</span>
              </div>
              <div className="metadata-item" style={{ marginBottom: '0.2rem' }}>
                <span className="metadata-label">Author:</span>
                <span className="metadata-value">{vrmMetadata.author}</span>
              </div>
              <div className="metadata-item" style={{ marginBottom: '0.2rem' }}>
                <span className="metadata-label">Version:</span>
                <span className="metadata-value">{vrmMetadata.version}</span>
              </div>
            </div>
          </div>
        )}

        {validationResult && (
          <div className="validation-result" style={{ marginTop: '0.5rem', padding: '0 0.75rem' }}>
            <div className={`validation-status ${validationResult.valid ? 'valid' : 'invalid'}`} style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>
              <span className="status-icon">
                {validationResult.valid ? '✓' : '⚠'}
              </span>
              <span className="status-text">
                {validationResult.valid ? 'VRM is valid' : 'VRM has issues'}
                {validationResult.isFallbackVRM && ' (Fallback Mode)'}
              </span>
            </div>
            
            {validationResult.isFallbackVRM && (
              <div className="fallback-info" style={{ marginBottom: '0.3rem' }}>
                <h4 className="text-sm font-semibold text-yellow-400" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>⚠️ Fallback Mode:</h4>
                <p className="text-xs text-yellow-300" style={{ fontSize: '0.7rem' }}>
                  This VRM model lacks humanoid bones and is loaded in fallback mode. 
                  Some features may be limited, but the model can still be viewed and exported.
                </p>
              </div>
            )}
            
            {validationResult.issues.length > 0 && (
              <div className="validation-issues" style={{ marginBottom: '0.3rem' }}>
                <h4 className="text-sm font-semibold" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Issues:</h4>
                <ul className="text-xs text-red-400" style={{ fontSize: '0.7rem' }}>
                  {validationResult.issues.map((issue, index) => (
                    <li key={index} style={{ marginBottom: '0.1rem' }}>• {issue}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {validationResult.warnings.length > 0 && (
              <div className="validation-warnings">
                <h4 className="text-sm font-semibold" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Warnings:</h4>
                <ul className="text-xs text-yellow-400" style={{ fontSize: '0.7rem' }}>
                  {validationResult.warnings.map((warning, index) => (
                    <li key={index} style={{ marginBottom: '0.1rem' }}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CombinedImport;
