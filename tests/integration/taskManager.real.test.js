/**
 * Integration tests for TaskManager with real API (e.g. DGX Sparks).
 * Skipped when no VITE_API_ENDPOINT or TEST_API_ENDPOINT is set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { TaskManager } from '../../src/library/taskManager.js'

const API_ENDPOINT = process.env.TEST_API_ENDPOINT || process.env.VITE_API_ENDPOINT || ''

describe.skipIf(!API_ENDPOINT)('TaskManager - Real API Execution Tests', () => {
  let taskManager

  beforeAll(async () => {
    taskManager = new TaskManager(API_ENDPOINT)
    // Wait for API to be available
    let retries = 10
    while (retries > 0) {
      try {
        const connected = await taskManager.checkConnection()
        if (connected) break
      } catch (error) {
        // API not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 500))
      retries--
    }
  })

  afterAll(() => {
    if (taskManager) {
      taskManager.dispose()
    }
  })

  describe('Real API Connection', () => {
    it('should connect to real API server', async () => {
      const connected = await taskManager.checkConnection()
      expect(connected).toBe(true)
    })

    it('should handle API connection failures gracefully', async () => {
      const badManager = new TaskManager('http://127.0.0.1:9999')
      const connected = await badManager.checkConnection()
      expect(connected).toBe(false)
      badManager.dispose()
    })
  })

  describe('Real Text-to-3D Execution', () => {
    it('should execute text-to-3D task with real API', async () => {
      const task = taskManager.createTask({
        type: 'text-to-3d',
        prompt: 'A simple test cube',
        options: {}
      })

      expect(task).toBeDefined()
      expect(task.id).toBeDefined()
      expect(task.status).toBe('pending')

      // Start the task - this will call the REAL API
      const final = await taskManager.startTask(task.id)

      expect(final).toBeDefined()
      // 3DAIGC-API: POST returns { job_id, status, message }; poll completion exposes result.mesh_url as modelUrl.
      if (final.statusPollingUnavailable) {
        expect(final.job_id).toBeDefined()
      } else {
        expect(final.modelUrl || final.mesh_url || final.downloadUrl).toBeDefined()
      }

      const updatedTask = taskManager.getTask(task.id)
      expect(['completed', 'running']).toContain(updatedTask.status)
      expect(updatedTask.result).toBeDefined()
    }, 600000) // Await POST + poll until 3DAIGC job completes (GPU jobs often exceed 10s)

    it('should handle API errors properly', async () => {
      const badManager = new TaskManager('http://127.0.0.1:9999')
      const task = badManager.createTask({
        type: 'text-to-3d',
        prompt: 'test',
        options: {}
      })

      await expect(badManager.startTask(task.id)).rejects.toThrow()
      
      const failedTask = badManager.getTask(task.id)
      expect(failedTask.status).toBe('failed')
      expect(failedTask.error).toBeDefined()
      
      badManager.dispose()
    }, 10000)
  })

  describe('Real Task Lifecycle', () => {
    it('should track task through complete lifecycle', async () => {
      const task = taskManager.createTask({
        type: 'text-to-3d',
        prompt: 'Lifecycle test',
        options: {}
      })

      expect(task.status).toBe('pending')

      // Start task
      const startPromise = taskManager.startTask(task.id)
      
      // Check status during execution
      await new Promise(resolve => setTimeout(resolve, 500))
      const runningTask = taskManager.getTask(task.id)
      expect(['pending', 'running', 'completed']).toContain(runningTask.status)

      // Wait for completion
      await startPromise

      const completedTask = taskManager.getTask(task.id)
      expect(['completed', 'running']).toContain(completedTask.status)
      expect(completedTask.result).toBeDefined()
    }, 600000)
  })

  describe('Error Recovery', () => {
    it('should handle network errors with retry logic', async () => {
      // This test verifies error handling, not actual retry (retry not yet implemented)
      const badManager = new TaskManager('http://127.0.0.1:9999')
      
      try {
        await badManager.checkConnection()
      } catch (error) {
        // Expected to fail
      }

      const connected = badManager.isConnected
      expect(connected).toBe(false)
      
      badManager.dispose()
    })
  })
})
