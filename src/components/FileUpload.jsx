import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

const FileUpload = ({ onFileLoad }) => {
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      onFileLoad(acceptedFiles[0]);
    }
  }, [onFileLoad]);

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

  return (
    <div className="file-upload">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">File Upload</h3>
        </div>
        
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''}`}
          style={{
            border: '2px dashed #555',
            borderRadius: '8px',
            padding: '2rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: isDragActive ? '#3a3a3a' : 'transparent'
          }}
        >
          <input {...getInputProps()} />
          
          <div className="upload-content">
            <div className="upload-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              📁
            </div>
            
            {isDragActive ? (
              <p>Drop the file here...</p>
            ) : (
              <div>
                <p>Drag & drop a file here, or click to select</p>
                <p className="text-sm text-gray-400 mt-2">
                  Supports: GLB, GLTF, OBJ, FBX, VRM, JPG, PNG
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="upload-info mt-3">
          <h4 className="text-sm font-semibold mb-2">Supported Formats:</h4>
          <div className="format-list">
            <div className="format-item">
              <strong>3D Models:</strong> GLB, GLTF, OBJ, FBX, VRM, DAE, STL
            </div>
            <div className="format-item">
              <strong>Images:</strong> JPG, PNG, BMP, TGA
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
