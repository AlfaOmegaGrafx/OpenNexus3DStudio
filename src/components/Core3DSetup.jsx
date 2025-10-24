import React, { useState } from 'react';
import { useCore3D } from '../context/Core3DContext';

const Core3DSetup = () => {
  const { apiKey, isLoading, error, initializeCore3D, clearError } = useCore3D();
  const [inputKey, setInputKey] = useState(apiKey);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleSaveKey = async () => {
    if (!inputKey.trim()) {
      alert('Please enter a valid API key');
      return;
    }

    try {
      const success = await initializeCore3D(inputKey.trim());
      if (success) {
        setTestResult({ type: 'success', message: 'Core3D API connected successfully!' });
      }
    } catch (err) {
      setTestResult({ type: 'error', message: err.message });
    }
  };

  const handleTestConnection = async () => {
    if (!inputKey.trim()) {
      alert('Please enter an API key first');
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);
      
      // Test the connection by initializing
      const success = await initializeCore3D(inputKey.trim());
      if (success) {
        setTestResult({ type: 'success', message: 'Connection test successful!' });
      }
    } catch (err) {
      setTestResult({ type: 'error', message: `Connection failed: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearKey = () => {
    setInputKey('');
    localStorage.removeItem('core3d_api_key');
    setTestResult(null);
  };

  return (
    <div className="core3d-setup">
      <div className="setup-header">
        <h4>Core3D API Configuration</h4>
        <p className="setup-description">
          Connect to Core3D's powerful 3D design API to access models, materials, and design generation.
        </p>
      </div>

      <div className="setup-form">
        <div className="form-group">
          <label htmlFor="api-key" className="form-label">
            API Key
          </label>
          <div className="input-group">
            <input
              id="api-key"
              type="password"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="Enter your Core3D API key"
              className="form-input"
              disabled={isLoading}
            />
            <button
              onClick={handleClearKey}
              className="input-clear"
              title="Clear API key"
              disabled={isLoading}
            >
              ×
            </button>
          </div>
          <p className="form-help">
            Get your API key from the <a href="https://www.core3d.io/dashboard" target="_blank" rel="noopener noreferrer">Core3D Dashboard</a>
          </p>
        </div>

        {testResult && (
          <div className={`test-result ${testResult.type}`}>
            <span className="result-icon">
              {testResult.type === 'success' ? '✅' : '❌'}
            </span>
            <span className="result-message">{testResult.message}</span>
          </div>
        )}

        <div className="setup-actions">
          <button
            onClick={handleTestConnection}
            disabled={!inputKey.trim() || isLoading || isTesting}
            className="btn btn-secondary"
          >
            {isTesting ? (
              <>
                <div className="spinner mr-2"></div>
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </button>
          
          <button
            onClick={handleSaveKey}
            disabled={!inputKey.trim() || isLoading}
            className="btn btn-primary"
          >
            {isLoading ? (
              <>
                <div className="spinner mr-2"></div>
                Connecting...
              </>
            ) : (
              'Save & Connect'
            )}
          </button>
        </div>
      </div>

      <div className="setup-info">
        <h5>What you'll get with Core3D:</h5>
        <ul className="feature-list">
          <li>🎭 Access to thousands of 3D models</li>
          <li>🎨 Advanced material and texture library</li>
          <li>✨ AI-powered design generation</li>
          <li>📤 High-quality model exports</li>
          <li>🔄 Real-time design preview</li>
        </ul>
      </div>

      {error && (
        <div className="error-details">
          <h5>Connection Error:</h5>
          <p>{error}</p>
          <button onClick={clearError} className="btn btn-sm btn-outline">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};

export default Core3DSetup;
