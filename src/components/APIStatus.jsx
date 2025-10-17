import React, { useState } from 'react';

const APIStatus = ({ endpoint, isConnected, onEndpointChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState(endpoint);

  const handleSaveEndpoint = () => {
    onEndpointChange(newEndpoint);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setNewEndpoint(endpoint);
    setIsEditing(false);
  };

  return (
    <div className="api-status">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">API Status</h3>
        </div>
        
        <div className="status-info">
          <div className="flex items-center gap-2 mb-2">
            <div 
              className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}
            />
            <span className="status-text">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {isEditing ? (
            <div className="endpoint-edit">
              <input
                type="text"
                value={newEndpoint}
                onChange={(e) => setNewEndpoint(e.target.value)}
                className="input w-full mb-2"
                placeholder="API Endpoint URL"
              />
              <div className="flex gap-2">
                <button 
                  onClick={handleSaveEndpoint}
                  className="btn btn-success"
                >
                  Save
                </button>
                <button 
                  onClick={handleCancelEdit}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="endpoint-display">
              <p className="text-sm text-gray-400 mb-2">
                Endpoint: {endpoint}
              </p>
              <button 
                onClick={() => setIsEditing(true)}
                className="btn btn-secondary"
              >
                Change Endpoint
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default APIStatus;




