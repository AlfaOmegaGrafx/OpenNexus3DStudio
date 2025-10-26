import React, { useState, useEffect } from 'react';
import './WebGLErrorHandler.css';
import WebGLTroubleshootingGuide from './WebGLTroubleshootingGuide';

/**
 * WebGLErrorHandler - Provides user-friendly error handling and guidance for WebGL issues
 */
const WebGLErrorHandler = ({ error, onRetry, onDismiss }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showTroubleshootingGuide, setShowTroubleshootingGuide] = useState(false);
  const [browserInfo, setBrowserInfo] = useState({});

  useEffect(() => {
    // Gather browser and system information
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      webglSupport: checkWebGLSupport()
    };
    setBrowserInfo(info);
  }, []);

  const checkWebGLSupport = () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return {
      supported: !!gl,
      context: gl ? 'webgl' : null
    };
  };

  const getBrowserName = () => {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  };

  const getSpecificRecommendations = () => {
    const browser = getBrowserName();
    const recommendations = [];

    // General recommendations
    recommendations.push('Update your browser to the latest version');
    recommendations.push('Update your graphics drivers');
    recommendations.push('Enable hardware acceleration in browser settings');

    // Browser-specific recommendations
    switch (browser) {
      case 'Chrome':
        recommendations.push('Try Chrome with --enable-webgl flag');
        recommendations.push('Disable hardware acceleration in Chrome settings if enabled');
        recommendations.push('Clear Chrome cache and cookies');
        break;
      case 'Firefox':
        recommendations.push('Enable WebGL in Firefox: about:config -> webgl.force-enabled = true');
        recommendations.push('Disable hardware acceleration in Firefox settings');
        break;
      case 'Safari':
        recommendations.push('Enable WebGL in Safari: Develop menu -> Enable WebGL');
        recommendations.push('Update macOS if using Safari');
        break;
      case 'Edge':
        recommendations.push('Try Edge with --enable-webgl flag');
        recommendations.push('Disable hardware acceleration in Edge settings');
        break;
    }

    // System-specific recommendations
    if (navigator.platform.includes('Win')) {
      recommendations.push('Update Windows graphics drivers');
      recommendations.push('Check Windows Update for graphics driver updates');
    } else if (navigator.platform.includes('Mac')) {
      recommendations.push('Update macOS and graphics drivers');
      recommendations.push('Check System Preferences > Security & Privacy for blocked graphics');
    } else if (navigator.platform.includes('Linux')) {
      recommendations.push('Update Linux graphics drivers (Mesa, NVIDIA, AMD)');
      recommendations.push('Check if WebGL is enabled in your Linux distribution');
    }

    return recommendations;
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      // Default retry behavior - reload the page
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  const copySystemInfo = () => {
    const systemInfo = `
Browser: ${getBrowserName()}
User Agent: ${browserInfo.userAgent}
Platform: ${browserInfo.platform}
WebGL Support: ${browserInfo.webglSupport?.supported ? 'Yes' : 'No'}
Hardware Concurrency: ${browserInfo.hardwareConcurrency}
Device Memory: ${browserInfo.deviceMemory}GB
Online: ${browserInfo.onLine ? 'Yes' : 'No'}
Error: ${error?.message || 'Unknown WebGL error'}
    `.trim();

    navigator.clipboard.writeText(systemInfo).then(() => {
      alert('System information copied to clipboard');
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = systemInfo;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('System information copied to clipboard');
    });
  };

  if (!error) return null;

  return (
    <div className="webgl-error-overlay">
      <div className="webgl-error-dialog">
        <div className="webgl-error-header">
          <h2>🚫 WebGL Not Supported</h2>
          <button 
            className="webgl-error-close" 
            onClick={handleDismiss}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        
        <div className="webgl-error-content">
          <div className="webgl-error-message">
            <p>
              <strong>Failed to initialize 3D viewer.</strong> WebGL is not supported on this system.
            </p>
            <p>
              This application requires WebGL for 3D rendering. Please try the following solutions:
            </p>
          </div>

          <div className="webgl-error-solutions">
            <h3>🔧 Quick Fixes</h3>
            <ul>
              {getSpecificRecommendations().slice(0, 4).map((recommendation, index) => (
                <li key={index}>{recommendation}</li>
              ))}
            </ul>
          </div>

          <div className="webgl-error-actions">
            <button 
              className="webgl-error-retry" 
              onClick={handleRetry}
            >
              🔄 Try Again
            </button>
            <button 
              className="webgl-error-details" 
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
            <button 
              className="webgl-error-troubleshooting" 
              onClick={() => setShowTroubleshootingGuide(true)}
            >
              🛠️ Troubleshooting Guide
            </button>
          </div>

          {showDetails && (
            <div className="webgl-error-details-content">
              <h4>🔍 Technical Details</h4>
              <div className="webgl-error-tech-info">
                <p><strong>Error:</strong> {error.message}</p>
                <p><strong>Browser:</strong> {getBrowserName()}</p>
                <p><strong>Platform:</strong> {browserInfo.platform}</p>
                <p><strong>WebGL Support:</strong> {browserInfo.webglSupport?.supported ? 'Yes' : 'No'}</p>
                <p><strong>Hardware Concurrency:</strong> {browserInfo.hardwareConcurrency} cores</p>
                {browserInfo.deviceMemory && (
                  <p><strong>Device Memory:</strong> {browserInfo.deviceMemory}GB</p>
                )}
              </div>
              
              <div className="webgl-error-advanced-solutions">
                <h4>🛠️ Advanced Solutions</h4>
                <ul>
                  {getSpecificRecommendations().slice(4).map((recommendation, index) => (
                    <li key={index}>{recommendation}</li>
                  ))}
                </ul>
              </div>

              <div className="webgl-error-system-info">
                <button 
                  className="webgl-error-copy-info" 
                  onClick={copySystemInfo}
                >
                  📋 Copy System Info
                </button>
                <p className="webgl-error-help-text">
                  Copy this information to share with support or for troubleshooting.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Troubleshooting Guide Modal */}
      {showTroubleshootingGuide && (
        <WebGLTroubleshootingGuide 
          onClose={() => setShowTroubleshootingGuide(false)}
        />
      )}
    </div>
  );
};

export default WebGLErrorHandler;
