import React, { useState } from 'react';
import { useCore3D } from '../context/Core3DContext';
import Core3DSetup from './Core3DSetup';
import Core3DModels from './Core3DModels';
import Core3DMaterials from './Core3DMaterials';
import Core3DDesigner from './Core3DDesigner';
import Core3DExports from './Core3DExports';
import Core3DViewer from './Core3DViewer';
import './Core3DPanel.css';

const Core3DPanel = () => {
  const { isInitialized, error, clearError } = useCore3D();
  const [activeTab, setActiveTab] = useState('setup');
  const [isExpanded, setIsExpanded] = useState(false);

  const tabs = [
    { id: 'setup', label: 'Setup', icon: '⚙️' },
    { id: 'models', label: 'Models', icon: '🎭' },
    { id: 'materials', label: 'Materials', icon: '🎨' },
    { id: 'designer', label: 'Designer', icon: '✨' },
    { id: 'viewer', label: '3D Viewer', icon: '👁️' },
    { id: 'exports', label: 'Exports', icon: '📤' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'setup':
        return <Core3DSetup />;
      case 'models':
        return <Core3DModels />;
      case 'materials':
        return <Core3DMaterials />;
      case 'designer':
        return <Core3DDesigner />;
      case 'viewer':
        return (
          <div className="core3d-viewer-tab">
            <Core3DViewer 
              showControls={true}
              showStats={true}
              className="core3d-viewer-full"
            />
          </div>
        );
      case 'exports':
        return <Core3DExports />;
      default:
        return <Core3DSetup />;
    }
  };

  return (
    <div className="core3d-panel">
      <div className="card">
        <div className="card-header">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="expand-icon-button"
            title={isExpanded ? "Collapse Core3D Panel" : "Expand Core3D Panel"}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <h3 className="card-title">
            <span className="core3d-icon">🎨</span>
            Core3D Studio
          </h3>
          {isInitialized && (
            <div className="status-indicator online" title="Core3D Connected">
              ●
            </div>
          )}
        </div>
        
        {isExpanded && (
          <div className="core3d-content">
            {error && (
              <div className="error-banner">
                <span className="error-icon">⚠️</span>
                <span className="error-message">{error}</span>
                <button 
                  onClick={clearError}
                  className="error-close"
                  title="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}

            {!isInitialized ? (
              <div className="setup-required">
                <div className="setup-icon">🔑</div>
                <h4>Core3D Setup Required</h4>
                <p>Please configure your Core3D API key to access advanced 3D design features.</p>
                <Core3DSetup />
              </div>
            ) : (
              <>
                <div className="core3d-tabs">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                      title={tab.label}
                    >
                      <span className="tab-icon">{tab.icon}</span>
                      <span className="tab-label">{tab.label}</span>
                    </button>
                  ))}
                </div>

                <div className="tab-content">
                  {renderTabContent()}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Core3DPanel;
