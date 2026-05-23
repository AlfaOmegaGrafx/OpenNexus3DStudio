/**
 * Integration tests for monitoring and alerting
 */
import { describe, it, expect } from 'vitest'
import { performanceMonitor } from '../../src/library/performanceMonitor.js'
import { logger } from '../../src/library/logger.js'

describe('Monitoring and Alerting', () => {
  beforeEach(() => {
    performanceMonitor.reset()
  })

  describe('Performance Monitoring', () => {
    it('should track API call performance', () => {
      const metric = performanceMonitor.trackAPICall(
        '/api/test',
        'POST',
        1500,
        200
      )

      expect(metric).toBeDefined()
      expect(metric.endpoint).toBe('/api/test')
      expect(metric.duration).toBe(1500)
      expect(metric.status).toBe(200)

      const stats = performanceMonitor.getStats()
      expect(stats.apiCalls.total).toBe(1)
      expect(stats.apiCalls.averageDuration).toBe(1500)
    })

    it('should alert on slow API calls', () => {
      performanceMonitor.trackAPICall('/api/slow', 'POST', 3000, 200)

      const stats = performanceMonitor.getStats()
      expect(stats.alerts.total).toBeGreaterThan(0)
      expect(stats.alerts.recent.some(a => a.type === 'slow_api_call')).toBe(true)
    })

    it('should alert on API errors', () => {
      const error = new Error('API Error')
      performanceMonitor.trackAPICall('/api/error', 'POST', 500, 500, error)

      const stats = performanceMonitor.getStats()
      expect(stats.alerts.recent.some(a => a.type === 'api_error')).toBe(true)
    })

    it('should track render frame performance', () => {
      performanceMonitor.trackFrame(16) // 60fps
      performanceMonitor.trackFrame(33) // 30fps
      performanceMonitor.trackFrame(50) // 20fps (slow)

      const stats = performanceMonitor.getStats()
      expect(stats.rendering.totalFrames).toBe(3)
      expect(stats.rendering.slowFrames).toBe(1)
    })

    it('should track model load performance', () => {
      performanceMonitor.trackModelLoad('test.vrm', 3000, 1024 * 1024)

      const stats = performanceMonitor.getStats()
      expect(stats.modelLoads.total).toBe(1)
      expect(stats.modelLoads.averageDuration).toBe(3000)
    })
  })

  describe('Structured Logging', () => {
    it('should create structured log entries', () => {
      const logSpy = vi.spyOn(console, 'error')
      
      logger.error('Test error', new Error('Test'), { context: 'test' })
      
      expect(logSpy).toHaveBeenCalled()
      logSpy.mockRestore()
    })

    it('should log API requests', () => {
      const logSpy = vi.spyOn(console, 'log')
      
      logger.apiRequest('POST', '/api/test', 200, 1500)
      
      expect(logSpy).toHaveBeenCalled()
      logSpy.mockRestore()
    })
  })
})
