/**
 * Structured Logging System
 * Provides consistent, structured logging with error tracking and monitoring
 */

class Logger {
  constructor(options = {}) {
    this.service = options.service || 'app'
    this.environment = options.environment || (import.meta.env.MODE || 'development')
    this.enableRemoteLogging = options.enableRemoteLogging || false
    this.remoteEndpoint = options.remoteEndpoint || '/__remote_log'
    this.logLevel = options.logLevel || 'info'
    
    // Log levels: debug < info < warn < error
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 }
  }

  /**
   * Create structured log entry
   */
  _createLogEntry(level, message, data = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      environment: this.environment,
      message,
      ...data,
      // Add stack trace for errors
      ...(level === 'error' && data.error instanceof Error ? {
        stack: data.error.stack,
        errorName: data.error.name
      } : {})
    }
  }

  /**
   * Send log to remote endpoint if enabled
   */
  async _sendRemoteLog(entry) {
    if (!this.enableRemoteLogging || typeof window === 'undefined') return

    try {
      await fetch(this.remoteEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        signal: AbortSignal.timeout(1000) // 1s timeout
      }).catch(() => {
        // Silently fail remote logging to avoid error loops
      })
    } catch {
      // Silently fail to avoid error loops
    }
  }

  /**
   * Check if log level should be logged
   */
  _shouldLog(level) {
    return this.levels[level] >= this.levels[this.logLevel]
  }

  /**
   * Log debug message
   */
  debug(message, data = {}) {
    if (!this._shouldLog('debug')) return
    
    const entry = this._createLogEntry('debug', message, data)
    console.debug(`[${this.service}]`, message, data)
    this._sendRemoteLog(entry)
  }

  /**
   * Log info message
   */
  info(message, data = {}) {
    if (!this._shouldLog('info')) return
    
    const entry = this._createLogEntry('info', message, data)
    console.log(`[${this.service}]`, message, data)
    this._sendRemoteLog(entry)
  }

  /**
   * Log warning
   */
  warn(message, data = {}) {
    if (!this._shouldLog('warn')) return
    
    const entry = this._createLogEntry('warn', message, data)
    console.warn(`[${this.service}]`, message, data)
    this._sendRemoteLog(entry)
  }

  /**
   * Log error with full context
   */
  error(message, error = null, context = {}) {
    if (!this._shouldLog('error')) return
    
    const errorData = {
      ...context,
      ...(error instanceof Error ? {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...(error.code && { code: error.code }),
          ...(error.status && { status: error.status }),
          ...(error.response && {
            responseStatus: error.response.status,
            responseData: error.response.data
          })
        }
      } : error ? { error } : {})
    }

    const entry = this._createLogEntry('error', message, errorData)
    console.error(`[${this.service}]`, message, errorData)
    this._sendRemoteLog(entry)
    
    // Emit error event for monitoring
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:error', { detail: entry }))
    }
  }

  /**
   * Log performance metric
   */
  performance(operation, duration, metadata = {}) {
    const entry = this._createLogEntry('info', `Performance: ${operation}`, {
      operation,
      duration,
      ...metadata,
      type: 'performance'
    })
    
    console.log(`[${this.service}] Performance: ${operation} took ${duration}ms`, metadata)
    this._sendRemoteLog(entry)
  }

  /**
   * Log API request
   */
  apiRequest(method, url, status, duration, error = null) {
    const entry = this._createLogEntry(
      error ? 'error' : status >= 400 ? 'warn' : 'info',
      `API ${method} ${url}`,
      {
        method,
        url,
        status,
        duration,
        ...(error && { error: error.message })
      }
    )
    
    if (error) {
      console.error(`[${this.service}] API Error: ${method} ${url}`, { status, duration, error })
    } else if (status >= 400) {
      console.warn(`[${this.service}] API Warning: ${method} ${url}`, { status, duration })
    } else {
      console.log(`[${this.service}] API: ${method} ${url}`, { status, duration })
    }
    
    this._sendRemoteLog(entry)
  }
}

// Create default logger instance
export const logger = new Logger({
  service: 'app',
  environment: import.meta.env.MODE || 'development',
  enableRemoteLogging: import.meta.env.VITE_REMOTE_LOG === '1',
  logLevel: import.meta.env.VITE_LOG_LEVEL || 'info'
})

// Create service-specific loggers
export const createLogger = (service, options = {}) => {
  return new Logger({
    service,
    ...options
  })
}

export default logger
