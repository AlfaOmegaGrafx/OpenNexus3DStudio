import React, { useState } from 'react';
import { useCore3D } from '../context/Core3DContext';
import './Core3DTokenManager.css';

const Core3DTokenManager = () => {
  const { createToken, isLoading, error, apiKey } = useCore3D();
  const [tokenName, setTokenName] = useState('');
  const [tokenDescription, setTokenDescription] = useState('');
  const [createdToken, setCreatedToken] = useState(null);
  const [showToken, setShowToken] = useState(false);

  const handleCreateToken = async () => {
    if (!tokenName.trim()) {
      alert('Please enter a token name');
      return;
    }

    try {
      const tokenData = {
        name: tokenName,
        description: tokenDescription || undefined
      };

      const result = await createToken(tokenData);
      setCreatedToken(result);
      setShowToken(true);
      setTokenName('');
      setTokenDescription('');
    } catch (err) {
      console.error('Failed to create token:', err);
      alert(`Failed to create token: ${err.message}`);
    }
  };

  const handleCopyToken = () => {
    if (createdToken?.token || createdToken?.api_key) {
      const tokenValue = createdToken.token || createdToken.api_key;
      navigator.clipboard.writeText(tokenValue);
      alert('Token copied to clipboard!');
    }
  };

  return (
    <div className="core3d-token-manager">
      <div className="token-manager-header">
        <h4>🔑 Token Management</h4>
        <p className="token-manager-description">
          Create and manage API tokens for Core3D integration.
        </p>
      </div>

      <div className="current-token-section">
        <h5>Current Token</h5>
        <div className="token-display">
          <code className="token-value">
            {apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'Not set'}
          </code>
          <span className="token-status">
            {apiKey ? '✅ Active' : '❌ Not configured'}
          </span>
        </div>
      </div>

      <div className="create-token-section">
        <h5>Create New Token</h5>
        <div className="token-form">
          <div className="form-group">
            <label htmlFor="token-name" className="form-label">
              Token Name <span className="required">*</span>
            </label>
            <input
              id="token-name"
              type="text"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="e.g., Production Token, Development Token"
              className="form-input"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="token-description" className="form-label">
              Description (Optional)
            </label>
            <textarea
              id="token-description"
              value={tokenDescription}
              onChange={(e) => setTokenDescription(e.target.value)}
              placeholder="Describe what this token will be used for..."
              className="form-textarea"
              rows="3"
              disabled={isLoading}
            />
          </div>

          <button
            onClick={handleCreateToken}
            disabled={!tokenName.trim() || isLoading}
            className="btn btn-primary btn-create-token"
          >
            {isLoading ? (
              <>
                <div className="spinner mr-2"></div>
                Creating Token...
              </>
            ) : (
              <>
                <span>🔑</span>
                Create Token
              </>
            )}
          </button>
        </div>
      </div>

      {createdToken && (
        <div className="token-result">
          <div className="token-result-header">
            <h5>✅ Token Created Successfully!</h5>
            <button
              onClick={() => setShowToken(!showToken)}
              className="btn-toggle-token"
            >
              {showToken ? '👁️ Hide' : '👁️ Show'} Token
            </button>
          </div>

          {showToken && (
            <div className="token-display-box">
              <div className="token-warning">
                ⚠️ <strong>Important:</strong> Save this token now. You won't be able to see it again!
              </div>
              <div className="token-value-box">
                <code className="full-token-value">
                  {createdToken.token || createdToken.api_key || JSON.stringify(createdToken)}
                </code>
                <button
                  onClick={handleCopyToken}
                  className="btn-copy-token"
                  title="Copy token to clipboard"
                >
                  📋 Copy
                </button>
              </div>
              <div className="token-info">
                <div className="info-row">
                  <span className="info-label">Name:</span>
                  <span className="info-value">{createdToken.name || 'N/A'}</span>
                </div>
                {createdToken.id && (
                  <div className="info-row">
                    <span className="info-label">Token ID:</span>
                    <span className="info-value">{createdToken.id}</span>
                  </div>
                )}
                {createdToken.created_at && (
                  <div className="info-row">
                    <span className="info-label">Created:</span>
                    <span className="info-value">
                      {new Date(createdToken.created_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          <span className="error-icon">❌</span>
          <span>{error}</span>
        </div>
      )}

      <div className="token-info-section">
        <h5>📚 Token Information</h5>
        <ul className="info-list">
          <li>Tokens are used to authenticate API requests to Core3D</li>
          <li>Each token can have different permissions and scopes</li>
          <li>Keep your tokens secure and never share them publicly</li>
          <li>You can create multiple tokens for different purposes</li>
          <li>Revoke tokens if they're compromised or no longer needed</li>
        </ul>
      </div>
    </div>
  );
};

export default Core3DTokenManager;

