/**
 * Monitoring Dashboard Component
 * Displays performance metrics and alerts
 */
import React, { useState, useEffect } from 'react';
import { performanceMonitor } from '../library/performanceMonitor.js';

export default function MonitoringDashboard({ visible = false }) {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    if (!visible) return;

    const updateStats = () => {
      setStats(performanceMonitor.getStats());
      setAlerts(performanceMonitor.alerts.slice(-10));
    };

    updateStats();
    const interval = setInterval(updateStats, 1000);

    // Listen for new alerts
    const handleAlert = (event) => {
      setAlerts(prev => [...prev, event.detail].slice(-10));
    };

    window.addEventListener('performance:alert', handleAlert);

    return () => {
      clearInterval(interval);
      window.removeEventListener('performance:alert', handleAlert);
    };
  }, [visible]);

  if (!visible || !stats) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: '#fff',
      padding: '15px',
      borderRadius: '8px',
      fontSize: '12px',
      maxWidth: '400px',
      zIndex: 10000,
      fontFamily: 'monospace'
    }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>📊 Performance Monitor</h3>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>API Calls:</strong>
        <div>Total: {stats.apiCalls.total}</div>
        <div>Avg: {Math.round(stats.apiCalls.averageDuration)}ms</div>
        <div>Errors: {Math.round(stats.apiCalls.errorRate * 100)}%</div>
        <div>Slow: {stats.apiCalls.slowCalls}</div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Rendering:</strong>
        <div>FPS: {stats.rendering.currentFPS}</div>
        <div>Avg Frame: {Math.round(stats.rendering.averageFrameTime)}ms</div>
        <div>Slow Frames: {stats.rendering.slowFrames}</div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Model Loads:</strong>
        <div>Total: {stats.modelLoads.total}</div>
        <div>Avg: {Math.round(stats.modelLoads.averageDuration)}ms</div>
        <div>Slow: {stats.modelLoads.slowLoads}</div>
      </div>

      {alerts.length > 0 && (
        <div style={{ marginTop: '10px', borderTop: '1px solid #444', paddingTop: '10px' }}>
          <strong>Recent Alerts:</strong>
          {alerts.slice(-5).map((alert, i) => (
            <div key={i} style={{ 
              color: alert.type.includes('error') ? '#ff6b6b' : '#ffa500',
              fontSize: '11px',
              marginTop: '5px'
            }}>
              {alert.type}: {JSON.stringify(alert.data)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
