import React from 'react';
import { logger } from '../library/logger.js';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error with structured logging
    logger.error('React ErrorBoundary caught an error', error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true
    });
    
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div style={{
          padding: '20px',
          background: 'rgba(255, 0, 0, 0.1)',
          border: '2px solid rgba(255, 0, 0, 0.3)',
          borderRadius: '8px',
          color: '#fff',
          margin: '10px 0'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#ff6b6b' }}>
            ⚠️ Component Error
          </h3>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
            This component encountered an error and has been disabled.
          </p>
          {this.props.showDetails && this.state.error && (
            <details style={{ fontSize: '12px', marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', marginBottom: '5px' }}>
                Error Details
              </summary>
              <pre style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '10px',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '200px'
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              background: '#667eea',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

