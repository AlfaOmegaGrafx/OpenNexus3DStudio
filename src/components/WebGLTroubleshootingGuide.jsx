import React, { useState } from 'react';
import './WebGLTroubleshootingGuide.css';

/**
 * WebGLTroubleshootingGuide - Comprehensive guide for WebGL issues
 */
const WebGLTroubleshootingGuide = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    {
      id: 'overview',
      title: 'Overview',
      icon: '🔍'
    },
    {
      id: 'browser',
      title: 'Browser Issues',
      icon: '🌐'
    },
    {
      id: 'drivers',
      title: 'Graphics Drivers',
      icon: '🎮'
    },
    {
      id: 'system',
      title: 'System Settings',
      icon: '⚙️'
    },
    {
      id: 'advanced',
      title: 'Advanced',
      icon: '🔧'
    }
  ];

  const browserSpecificSteps = {
    Chrome: [
      'Open Chrome Settings (chrome://settings/)',
      'Click "Advanced" → "System"',
      'Toggle "Use hardware acceleration when available"',
      'Restart Chrome',
      'Try Chrome with --enable-webgl flag'
    ],
    Firefox: [
      'Type "about:config" in address bar',
      'Search for "webgl.force-enabled"',
      'Set to "true"',
      'Search for "webgl.disabled"',
      'Set to "false"',
      'Restart Firefox'
    ],
    Safari: [
      'Open Safari → Preferences',
      'Go to "Advanced" tab',
      'Check "Show Develop menu in menu bar"',
      'Go to Develop → Enable WebGL',
      'Restart Safari'
    ],
    Edge: [
      'Open Edge Settings',
      'Go to "System and performance"',
      'Toggle "Use hardware acceleration"',
      'Restart Edge',
      'Try Edge with --enable-webgl flag'
    ]
  };

  const getBrowserName = () => {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  };

  const renderOverview = () => (
    <div className="troubleshooting-section">
      <h3>🔍 WebGL Troubleshooting Overview</h3>
      <p>
        WebGL (Web Graphics Library) is required for 3D rendering in web browsers. 
        If you're experiencing WebGL issues, follow this comprehensive guide to resolve them.
      </p>
      
      <div className="quick-diagnostics">
        <h4>Quick Diagnostics</h4>
        <div className="diagnostic-item">
          <span className="diagnostic-label">Browser:</span>
          <span className="diagnostic-value">{getBrowserName()}</span>
        </div>
        <div className="diagnostic-item">
          <span className="diagnostic-label">Platform:</span>
          <span className="diagnostic-value">{navigator.platform}</span>
        </div>
        <div className="diagnostic-item">
          <span className="diagnostic-label">WebGL Support:</span>
          <span className="diagnostic-value">
            {(() => {
              const canvas = document.createElement('canvas');
              const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
              return gl ? '✅ Supported' : '❌ Not Supported';
            })()}
          </span>
        </div>
      </div>

      <div className="common-solutions">
        <h4>Most Common Solutions</h4>
        <ol>
          <li>Update your browser to the latest version</li>
          <li>Update your graphics drivers</li>
          <li>Enable hardware acceleration in browser settings</li>
          <li>Try a different browser</li>
          <li>Disable browser extensions temporarily</li>
        </ol>
      </div>
    </div>
  );

  const renderBrowserIssues = () => (
    <div className="troubleshooting-section">
      <h3>🌐 Browser-Specific Solutions</h3>
      
      <div className="browser-tabs">
        {Object.keys(browserSpecificSteps).map(browser => (
          <button
            key={browser}
            className={`browser-tab ${getBrowserName() === browser ? 'active' : ''}`}
            onClick={() => setActiveSection(`browser-${browser.toLowerCase()}`)}
          >
            {browser}
          </button>
        ))}
      </div>

      <div className="browser-steps">
        <h4>{getBrowserName()} Steps:</h4>
        <ol>
          {browserSpecificSteps[getBrowserName()]?.map((step, index) => (
            <li key={index}>{step}</li>
          )) || <li>No specific steps available for this browser</li>}
        </ol>
      </div>

      <div className="general-browser-tips">
        <h4>General Browser Tips</h4>
        <ul>
          <li>Clear browser cache and cookies</li>
          <li>Disable browser extensions one by one</li>
          <li>Try incognito/private browsing mode</li>
          <li>Reset browser settings to default</li>
          <li>Check for browser updates</li>
        </ul>
      </div>
    </div>
  );

  const renderDrivers = () => (
    <div className="troubleshooting-section">
      <h3>🎮 Graphics Driver Solutions</h3>
      
      <div className="driver-sections">
        <div className="driver-section">
          <h4>NVIDIA Graphics</h4>
          <ol>
            <li>Download latest drivers from NVIDIA website</li>
            <li>Use NVIDIA GeForce Experience for automatic updates</li>
            <li>Enable "Prefer maximum performance" in NVIDIA Control Panel</li>
            <li>Set "Power management mode" to "Prefer maximum performance"</li>
            <li>Restart your computer after driver installation</li>
          </ol>
        </div>

        <div className="driver-section">
          <h4>AMD Graphics</h4>
          <ol>
            <li>Download AMD Radeon Software from AMD website</li>
            <li>Use AMD Radeon Software for automatic updates</li>
            <li>Enable "GPU Scaling" in AMD Radeon Settings</li>
            <li>Set "Power Tuning" to "Manual" with higher power limit</li>
            <li>Restart your computer after driver installation</li>
          </ol>
        </div>

        <div className="driver-section">
          <h4>Intel Graphics</h4>
          <ol>
            <li>Download Intel Graphics Driver from Intel website</li>
            <li>Use Intel Driver & Support Assistant for updates</li>
            <li>Enable "Hardware Acceleration" in Intel Graphics Settings</li>
            <li>Set "Power" to "Maximum Performance"</li>
            <li>Restart your computer after driver installation</li>
          </ol>
        </div>
      </div>
    </div>
  );

  const renderSystemSettings = () => (
    <div className="troubleshooting-section">
      <h3>⚙️ System Settings</h3>
      
      <div className="system-sections">
        <div className="system-section">
          <h4>Windows</h4>
          <ol>
            <li>Open Windows Settings → System → Display</li>
            <li>Click "Graphics settings"</li>
            <li>Add your browser and set to "High performance"</li>
            <li>Open Device Manager → Display adapters</li>
            <li>Right-click graphics card → Update driver</li>
            <li>Check Windows Update for graphics driver updates</li>
          </ol>
        </div>

        <div className="system-section">
          <h4>macOS</h4>
          <ol>
            <li>Go to System Preferences → Energy Saver</li>
            <li>Uncheck "Automatic graphics switching"</li>
            <li>Go to System Preferences → Security & Privacy</li>
            <li>Check if graphics drivers are blocked</li>
            <li>Update macOS to latest version</li>
            <li>Check App Store for graphics driver updates</li>
          </ol>
        </div>

        <div className="system-section">
          <h4>Linux</h4>
          <ol>
            <li>Update Mesa drivers: <code>sudo apt update && sudo apt upgrade</code></li>
            <li>For NVIDIA: Install nvidia-driver package</li>
            <li>For AMD: Install mesa-vulkan-drivers</li>
            <li>Check WebGL support: <code>glxinfo | grep "direct rendering"</code></li>
            <li>Enable hardware acceleration in browser</li>
            <li>Check if WebGL is enabled in your distribution</li>
          </ol>
        </div>
      </div>
    </div>
  );

  const renderAdvanced = () => (
    <div className="troubleshooting-section">
      <h3>🔧 Advanced Troubleshooting</h3>
      
      <div className="advanced-sections">
        <div className="advanced-section">
          <h4>Command Line Flags</h4>
          <p>Try launching your browser with these flags:</p>
          <div className="command-examples">
            <div className="command-example">
              <strong>Chrome/Edge:</strong>
              <code>--enable-webgl --ignore-gpu-blacklist --disable-gpu-sandbox</code>
            </div>
            <div className="command-example">
              <strong>Firefox:</strong>
              <code>--enable-webgl --enable-accelerated-2d-canvas</code>
            </div>
          </div>
        </div>

        <div className="advanced-section">
          <h4>Registry/Config Edits</h4>
          <p><strong>Windows Registry (Advanced users only):</strong></p>
          <ol>
            <li>Open Registry Editor (regedit)</li>
            <li>Navigate to: HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Internet Settings</li>
            <li>Create DWORD: "EnableWebGL" = 1</li>
            <li>Restart browser</li>
          </ol>
        </div>

        <div className="advanced-section">
          <h4>Virtual Machine Issues</h4>
          <ul>
            <li>Enable 3D acceleration in VM settings</li>
            <li>Install VM-specific graphics drivers</li>
            <li>Allocate more video memory to VM</li>
            <li>Try different VM software (VirtualBox, VMware, etc.)</li>
          </ul>
        </div>

        <div className="advanced-section">
          <h4>Corporate/Enterprise</h4>
          <ul>
            <li>Contact IT department for WebGL policy</li>
            <li>Request WebGL to be enabled in group policies</li>
            <li>Use portable browser versions if allowed</li>
            <li>Check if WebGL is blocked by security software</li>
          </ul>
        </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'overview': return renderOverview();
      case 'browser': return renderBrowserIssues();
      case 'drivers': return renderDrivers();
      case 'system': return renderSystemSettings();
      case 'advanced': return renderAdvanced();
      default: return renderOverview();
    }
  };

  return (
    <div className="troubleshooting-guide-overlay">
      <div className="troubleshooting-guide-dialog">
        <div className="troubleshooting-guide-header">
          <h2>🛠️ WebGL Troubleshooting Guide</h2>
          <button className="troubleshooting-guide-close" onClick={onClose}>
            ×
          </button>
        </div>
        
        <div className="troubleshooting-guide-content">
          <div className="troubleshooting-guide-sidebar">
            {sections.map(section => (
              <button
                key={section.id}
                className={`troubleshooting-guide-nav ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="nav-icon">{section.icon}</span>
                <span className="nav-title">{section.title}</span>
              </button>
            ))}
          </div>
          
          <div className="troubleshooting-guide-main">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebGLTroubleshootingGuide;
