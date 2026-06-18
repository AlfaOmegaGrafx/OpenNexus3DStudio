/**
 * Rollback Manager
 * Provides rollback capabilities for operations
 */

class RollbackManager {
  constructor() {
    this.snapshots = new Map()
    this.maxSnapshots = 50
  }

  /**
   * Create a snapshot of current state
   */
  createSnapshot(key, state) {
    const snapshot = {
      timestamp: Date.now(),
      key,
      state: this.deepClone(state)
    }

    if (!this.snapshots.has(key)) {
      this.snapshots.set(key, [])
    }

    const snapshots = this.snapshots.get(key)
    snapshots.push(snapshot)

    // Limit snapshots per key
    if (snapshots.length > this.maxSnapshots) {
      snapshots.shift()
    }

    return snapshot
  }

  /**
   * Rollback to previous snapshot
   */
  rollback(key, steps = 1) {
    if (!this.snapshots.has(key)) {
      throw new Error(`No snapshots found for key: ${key}`)
    }

    const snapshots = this.snapshots.get(key)
    if (snapshots.length < steps) {
      throw new Error(`Not enough snapshots. Available: ${snapshots.length}, requested: ${steps}`)
    }

    // Remove the last N snapshots and return the one before
    for (let i = 0; i < steps; i++) {
      snapshots.pop()
    }

    if (snapshots.length === 0) {
      throw new Error('No snapshots remaining after rollback')
    }

    return this.deepClone(snapshots[snapshots.length - 1].state)
  }

  /**
   * Get available snapshots for a key
   */
  getSnapshots(key) {
    return this.snapshots.has(key) ? this.snapshots.get(key) : []
  }

  /**
   * Clear snapshots for a key
   */
  clearSnapshots(key) {
    if (key) {
      this.snapshots.delete(key)
    } else {
      this.snapshots.clear()
    }
  }

  /**
   * Deep clone utility
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime())
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item))
    }

    if (typeof obj === 'object') {
      const cloned = {}
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key])
        }
      }
      return cloned
    }

    return obj
  }
}

// Create singleton instance
export const rollbackManager = new RollbackManager()

export default rollbackManager
