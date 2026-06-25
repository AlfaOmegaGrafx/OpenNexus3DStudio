import React, { useState, useEffect } from 'react';
import { formatApiEndpointForDisplay, isLocalDev } from '../library/runtimeUi';

const APIStatus = ({ endpoint, isConnected, onEndpointChange, onTestConnection }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState(endpoint);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setNewEndpoint(endpoint);
  }, [endpoint]);

  const handleSaveEndpoint = () => {
    onEndpointChange(newEndpoint.trim());
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setNewEndpoint(endpoint);
    setIsEditing(false);
  };

  const handleTestConnection = async () => {
    if (onTestConnection) {
      setIsTesting(true);
      try {
        await onTestConnection();
      } finally {
        setIsTesting(false);
      }
    }
  };

  const endpointLabel = formatApiEndpointForDisplay(endpoint);

  return (
    <div className="api-status">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">API Status</h3>
        </div>

        <div className="status-info">
          {isLocalDev &&
            typeof window !== 'undefined' &&
            window.location?.protocol === 'https:' &&
            typeof endpoint === 'string' &&
            endpoint.startsWith('http:') && (
              <div
                style={{
                  marginBottom: '0.75rem',
                  padding: '0.5rem',
                  background: '#2c1810',
                  color: '#ffb86c',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  lineHeight: 1.45,
                  border: '1px solid #664422',
                }}
              >
                <strong>Mixed content:</strong> This page is HTTPS but the API URL is HTTP. The browser may block some
                requests. Set <code style={{ background: '#1a1a1a', padding: '0.1rem 0.25rem' }}>VITE_API_ENDPOINT=/__dev_dgx_proxy</code> and{' '}
                <code style={{ background: '#1a1a1a', padding: '0.1rem 0.25rem' }}>DEV_API_PROXY_TARGET</code> to your API
                base (HTTP), then restart <code style={{ background: '#1a1a1a', padding: '0.1rem 0.25rem' }}>npm run dev</code>.
              </div>
            )}
          <div className="flex items-center gap-2 mb-2">
            <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
            <span className="status-text">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>

          {isLocalDev && isEditing ? (
            <div className="endpoint-edit">
              <input
                type="text"
                value={newEndpoint}
                onChange={(e) => setNewEndpoint(e.target.value)}
                className="input w-full mb-2"
                placeholder="API Endpoint URL"
              />
              <div className="flex gap-2">
                <button onClick={handleSaveEndpoint} className="btn btn-success">
                  Save
                </button>
                <button onClick={handleCancelEdit} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="endpoint-display">
              <p className="text-sm text-gray-400 mb-2">Endpoint: {endpointLabel}</p>
              <div className="flex gap-2">
                <button onClick={handleTestConnection} className="btn btn-primary" disabled={isTesting}>
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </button>
                {isLocalDev && (
                  <button onClick={() => setIsEditing(true)} className="btn btn-secondary">
                    Change Endpoint
                  </button>
                )}
              </div>
              {!isConnected && isLocalDev && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.5rem',
                    background: '#fff3cd',
                    color: '#856404',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    lineHeight: '1.4',
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>💡 Troubleshooting:</div>
                  <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>
                    <li>
                      Local <strong>3DAIGC-API</strong> default:{' '}
                      <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>
                        http://127.0.0.1:8000
                      </code>{' '}
                      (or your machine/DGX host, e.g.{' '}
                      <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>
                        http://dgx-spark.local:7842
                      </code>
                      )
                    </li>
                    <li>
                      HTTPS app + HTTP API: set{' '}
                      <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>
                        VITE_API_ENDPOINT=/__dev_dgx_proxy
                      </code>{' '}
                      and{' '}
                      <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>
                        DEV_API_PROXY_TARGET=http://127.0.0.1:8000
                      </code>{' '}
                      in <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>.env</code>, then restart{' '}
                      <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>npm run dev</code>
                    </li>
                    <li>
                      Ensure the API server is running; health is checked at{' '}
                      <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>/health</code> or{' '}
                      <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>
                        /api/v1/system/health
                      </code>
                    </li>
                    <li>
                      If the API requires a key, set{' '}
                      <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>VITE_3DAIGC_API_KEY</code> in{' '}
                      <code style={{ background: '#f8f9fa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>.env</code>
                    </li>
                  </ul>
                </div>
              )}
              {!isConnected && !isLocalDev && (
                <p
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.5rem',
                    background: '#2a2a2a',
                    color: '#aaa',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    lineHeight: 1.45,
                    marginBottom: 0,
                  }}
                >
                  This public deployment does not include a private AI backend. OpenNexus3DStudio and asset loading still work.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default APIStatus;
