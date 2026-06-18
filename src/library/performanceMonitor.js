/**
 * Performance Monitoring System
 * Tracks performance metrics and provides monitoring capabilities
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      apiCalls: [],
      renderFrames: [],
      modelLoads: [],
      exports: []
    }
    this.thresholds = {
      apiCallSlow: 2000, // 2 seconds
      renderFrameSlow: 33, // 30fps = 33ms per frame
      modelLoadSlow: 5000, // 5 seconds
      exportSlow: 10000 // 10 seconds
    }
    this.alerts = []
  }

  /**
   * Track API call performance
   */
  trackAPICall(endpoint, method, duration, status, error = null) {
    const metric = {
      timestamp: Date.now(),
      endpoint,
      method,
      duration,
      status,
      error: error ? error.message : null
    }

    this.metrics.apiCalls.push(metric)
    
    // Keep only last 1000 calls
    if (this.metrics.apiCalls.length > 1000) {
      this.metrics.apiCalls.shift()
    }

    // Alert on slow calls
    if (duration > this.thresholds.apiCallSlow) {
      this.alert('slow_api_call', {
        endpoint,
        duration,
        threshold: this.thresholds.apiCallSlow
      })
    }

    // Alert on errors
    if (error || status >= 400) {
      this.alert('api_error', {
        endpoint,
        status,
        error: error?.message
      })
    }

    return metric
  }

  /**
   * Track render frame performance
   */
  trackFrame(duration) {
    const metric = {
      timestamp: Date.now(),
      duration
    }

    this.metrics.renderFrames.push(metric)
    
    // Keep only last 1000 frames
    if (this.metrics.renderFrames.length > 1000) {
      this.metrics.renderFrames.shift()
    }

    // Alert on slow frames
    if (duration > this.thresholds.renderFrameSlow) {
      this.alert('slow_frame', {
        duration,
        threshold: this.thresholds.renderFrameSlow,
        fps: Math.round(1000 / duration)
      })
    }

    return metric
  }

  /**
   * Track model load performance
   */
  trackModelLoad(filename, duration, size, error = null) {
    const metric = {
      timestamp: Date.now(),
      filename,
      duration,
      size,
      error: error?.message
    }

    this.metrics.modelLoads.push(metric)
    
    // Keep only last 100 loads
    if (this.metrics.modelLoads.length > 100) {
      this.metrics.modelLoads.shift()
    }

    // Alert on slow loads
    if (duration > this.thresholds.modelLoadSlow) {
      this.alert('slow_model_load', {
        filename,
        duration,
        size,
        threshold: this.thresholds.modelLoadSlow
      })
    }

    return metric
  }

  /**
   * Track export performance
   */
  trackExport(format, duration, inputSize, outputSize, error = null) {
    const metric = {
      timestamp: Date.now(),
      format,
      duration,
      inputSize,
      outputSize,
      compressionRatio: inputSize > 0 ? (outputSize / inputSize) : 0,
      error: error?.message
    }

    this.metrics.exports.push(metric)
    
    // Keep only last 100 exports
    if (this.metrics.exports.length > 100) {
      this.metrics.exports.shift()
    }

    // Alert on slow exports
    if (duration > this.thresholds.exportSlow) {
      this.alert('slow_export', {
        format,
        duration,
        threshold: this.thresholds.exportSlow
      })
    }

    return metric
  }

  /**
   * Generate alert
   */
  alert(type, data) {
    const alert = {
      timestamp: Date.now(),
      type,
      data
    }

    this.alerts.push(alert)
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift()
    }

    // Emit alert event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('performance:alert', { detail: alert }))
    }

    return alert
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const apiCalls = this.metrics.apiCalls
    const frames = this.metrics.renderFrames
    const modelLoads = this.metrics.modelLoads
    const exports = this.metrics.exports

    return {
      apiCalls: {
        total: apiCalls.length,
        averageDuration: apiCalls.length > 0 
          ? apiCalls.reduce((sum, m) => sum + m.duration, 0) / apiCalls.length 
          : 0,
        errorRate: apiCalls.length > 0
          ? apiCalls.filter(m => m.error || m.status >= 400).length / apiCalls.length
          : 0,
        slowCalls: apiCalls.filter(m => m.duration > this.thresholds.apiCallSlow).length
      },
      rendering: {
        totalFrames: frames.length,
        averageFrameTime: frames.length > 0
          ? frames.reduce((sum, f) => sum + f.duration, 0) / frames.length
          : 0,
        currentFPS: frames.length > 0 && frames[frames.length - 1]
          ? Math.round(1000 / frames[frames.length - 1].duration)
          : 0,
        slowFrames: frames.filter(f => f.duration > this.thresholds.renderFrameSlow).length
      },
      modelLoads: {
        total: modelLoads.length,
        averageDuration: modelLoads.length > 0
          ? modelLoads.reduce((sum, m) => sum + m.duration, 0) / modelLoads.length
          : 0,
        slowLoads: modelLoads.filter(m => m.duration > this.thresholds.modelLoadSlow).length,
        errorRate: modelLoads.length > 0
          ? modelLoads.filter(m => m.error).length / modelLoads.length
          : 0
      },
      exports: {
        total: exports.length,
        averageDuration: exports.length > 0
          ? exports.reduce((sum, e) => sum + e.duration, 0) / exports.length
          : 0,
        averageCompressionRatio: exports.length > 0
          ? exports.reduce((sum, e) => sum + e.compressionRatio, 0) / exports.length
          : 0,
        slowExports: exports.filter(e => e.duration > this.thresholds.exportSlow).length
      },
      alerts: {
        total: this.alerts.length,
        recent: this.alerts.slice(-10)
      }
    }
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      apiCalls: [],
      renderFrames: [],
      modelLoads: [],
      exports: []
    }
    this.alerts = []
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor()

export default performanceMonitor
