import React, { useState, useRef } from 'react';
import { useCore3D } from '../context/Core3DContext';
import Core3DSetup from './Core3DSetup';
import Core3DModels from './Core3DModels';
import Core3DMaterials from './Core3DMaterials';
import Core3DDesigner from './Core3DDesigner';
import Core3DExports from './Core3DExports';
import Core3DTokenManager from './Core3DTokenManager';
import ErrorBoundary from './ErrorBoundary';
import './Core3DPanel.css';

const Core3DPanel = () => {
  const { 
    isInitialized, 
    error, 
    clearError
  } = useCore3D();
  const [activeTab, setActiveTab] = useState('setup');
  const [isExpanded, setIsExpanded] = useState(false);
  const cardHeaderRef = useRef(null);

  const tabs = [
    { id: 'setup', label: 'Setup', icon: '⚙️' },
    { id: 'tokens', label: 'Tokens', icon: '🔑' },
    { id: 'models', label: 'Models', icon: '🎭' },
    { id: 'materials', label: 'Materials', icon: '🎨' },
    { id: 'designer', label: 'Designer', icon: '✨' },
    { id: 'exports', label: 'Exports', icon: '📤' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'setup':
        return <Core3DSetup />;
      case 'tokens':
        return <Core3DTokenManager />;
      case 'models':
        return <Core3DModels onNavigateToDesigner={() => setActiveTab('designer')} />;
      case 'materials':
        return <Core3DMaterials onNavigateToDesigner={() => setActiveTab('designer')} />;
      case 'designer':
        return <Core3DDesigner />;
      case 'exports':
        return <Core3DExports />;
      default:
        return <Core3DSetup />;
    }
  };

  return (
    <div className="core3d-panel">
      <div className="card">
        <div className="card-header" ref={cardHeaderRef}>
          <button 
            onClick={() => {
              const newExpanded = !isExpanded;
              setIsExpanded(newExpanded);
              // Auto-scroll header into view when expanding
              if (newExpanded && cardHeaderRef.current) {
                setTimeout(() => {
                  cardHeaderRef.current?.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start',
                    inline: 'nearest'
                  });
                }, 0);
              }
            }}
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
                  <ErrorBoundary showDetails={false}>
                    {renderTabContent()}
                  </ErrorBoundary>
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
