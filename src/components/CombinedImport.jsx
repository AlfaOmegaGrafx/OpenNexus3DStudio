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
        // Notify parent component with the file (not the processed VRM object)
        if (onFileLoad) {
          onFileLoad(file);
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
            borderRadius: '8px',
            padding: '1.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: isDragActive ? '#3a3a3a' : 'transparent'
          }}
        >
          <input {...getInputProps()} />
          
          <div className="upload-content">
            <div className="upload-icon" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
              📁
            </div>
            
            {isDragActive ? (
              <p>Drop the file here...</p>
            ) : (
              <div>
                <p>Drag & drop a file here, or click to select</p>
                <p className="text-sm text-gray-400 mt-1">
                  Supports: GLB, GLTF, OBJ, FBX, VRM, JPG, PNG
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="upload-info mt-2">
          <h4 className="text-sm font-semibold mb-1">Supported Formats:</h4>
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
          <div className="vrm-metadata mt-2">
            <h4 className="text-sm font-semibold mb-1">VRM Metadata:</h4>
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
            </div>
          </div>
        )}

        {validationResult && (
          <div className="validation-result mt-2">
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
          </div>
        )}
      </div>
    </div>
  );
};

export default CombinedImport;
