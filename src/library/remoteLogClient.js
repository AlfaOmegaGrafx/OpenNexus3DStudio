const DEFAULT_ENDPOINT_PATH = '/__remote_log'

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isThreeLikeObject(value) {
  // Avoid importing `three` here; detect via common runtime flags.
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value.isObject3D ||
        value.isTexture ||
        value.isMaterial ||
        value.isBufferGeometry ||
        value.isVector2 ||
        value.isVector3 ||
        value.isVector4 ||
        value.isEuler ||
        value.isMatrix3 ||
        value.isMatrix4 ||
        value.isQuaternion ||
        value.isColor),
  )
}

function describeObject(value) {
  const name = value?.constructor?.name || 'Object'
  const parts = [name]

  // Common lightweight identifiers (don’t touch deep/nested fields).
  if (typeof value?.type === 'string' && value.type) parts.push(`type=${value.type}`)
  if (typeof value?.name === 'string' && value.name) parts.push(`name=${value.name}`)
  if (typeof value?.uuid === 'string' && value.uuid) parts.push(`uuid=${value.uuid}`)

  return `[${parts.join(' ')}]`
}

function safeFormat(value, opts, depth, seen) {
  const { maxKeys, maxArrayLength, maxStringLength } = opts

  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  const t = typeof value
  if (t === 'string') {
    if (value.length <= maxStringLength) return value
    return `${value.slice(0, maxStringLength)}…(truncated ${value.length - maxStringLength} chars)`
  }
  if (t === 'number' || t === 'boolean') return String(value)
  if (t === 'bigint') return `${value.toString()}n`
  if (t === 'symbol') return value.toString()
  if (t === 'function') return `[Function${value.name ? ` ${value.name}` : ''}]`

  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack || ''}`.trim()
  }

  // Objects
  if (t === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)

    // Don’t recurse into Three.js objects or other class instances; their `toJSON()` can be extremely expensive.
    if (isThreeLikeObject(value)) return describeObject(value)

    // Also avoid recursing into non-plain objects; keep it lightweight.
    if (!isPlainObject(value) && !Array.isArray(value)) return describeObject(value)

    if (depth <= 0) return describeObject(value)

    if (Array.isArray(value)) {
      const len = value.length
      const shown = Math.min(len, maxArrayLength)
      const items = []
      for (let i = 0; i < shown; i += 1) {
        items.push(safeFormat(value[i], opts, depth - 1, seen))
      }
      const suffix = len > shown ? `, …(+${len - shown})` : ''
      return `[${items.join(', ')}${suffix}]`
    }

    // Plain object: show a bounded set of keys (shallow-ish).
    const keys = Object.keys(value)
    const shown = Math.min(keys.length, maxKeys)
    const parts = []
    for (let i = 0; i < shown; i += 1) {
      const k = keys[i]
      let v
      try {
        // Accessing own enumerable props should be safe; still guard against getters throwing.
        v = value[k]
      } catch {
        v = '[Unserializable]'
      }
      parts.push(`${k}: ${safeFormat(v, opts, depth - 1, seen)}`)
    }
    const suffix = keys.length > shown ? `, …(+${keys.length - shown} keys)` : ''
    return `{ ${parts.join(', ')}${suffix} }`
  }

  // Last resort.
  try {
    return String(value)
  } catch {
    return '[Unserializable]'
  }
}

function getSessionId() {
  try {
    const existing = localStorage.getItem('remoteLogSessionId')
    if (existing) return existing
    const id =
      (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `session-${Math.random().toString(16).slice(2)}-${Date.now()}`)
    localStorage.setItem('remoteLogSessionId', id)
    return id
  } catch {
    return `session-${Math.random().toString(16).slice(2)}-${Date.now()}`
  }
}

function safeToString(value) {
  // IMPORTANT:
  // Do NOT use JSON.stringify here. Some objects (notably Three.js textures/materials)
  // have `toJSON()` implementations that serialize image data (base64) and can block
  // the main thread for seconds/minutes per log.
  const opts = {
    maxKeys: 30,
    maxArrayLength: 20,
    maxStringLength: 2000,
  }
  return safeFormat(value, opts, 2, new WeakSet())
}

function truncate(str, max = 10000) {
  if (!str || str.length <= max) return str
  return `${str.slice(0, max)}…(truncated ${str.length - max} chars)`
}

/**
 * Enable forwarding console logs + runtime errors to a local endpoint.
 *
 * Enable via one of:
 * - URL query param: ?remoteLog=1
 * - localStorage: localStorage.setItem('remoteLogEnabled', '1')
 * - Vite env: VITE_REMOTE_LOG=1 (available as import.meta.env.VITE_REMOTE_LOG)
 */
export function initRemoteLogClient(options = {}) {
  const endpointPath = options.endpointPath || DEFAULT_ENDPOINT_PATH

  const enabledByQuery =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('remoteLog') === '1'

  const enabledByStorage = (() => {
    try {
      return localStorage.getItem('remoteLogEnabled') === '1'
    } catch {
      return false
    }
  })()

  const enabledByEnv = (() => {
    try {
      return import.meta?.env?.VITE_REMOTE_LOG === '1'
    } catch {
      return false
    }
  })()

  const enabled = enabledByQuery || enabledByStorage || enabledByEnv
  if (!enabled) return { enabled: false }

  const sessionId = getSessionId()
  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''

  const queue = []
  let dropped = 0
  let flushTimer = null
  let isFlushing = false

  const maxQueueSize = options.maxQueueSize ?? 200
  const flushIntervalMs = options.flushIntervalMs ?? 750
  const requestTimeoutMs = options.requestTimeoutMs ?? 1000
  const maxMessageLen = options.maxMessageLen ?? 2000

  function enqueue(level, args) {
    const ts = Date.now()
    const message = truncate(
      args
        .map((a) => truncate(safeToString(a), Math.min(2000, maxMessageLen)))
        .join(' ')
        // keep server output one-line (term-friendly)
        .replace(/\s+/g, ' ')
        .trim(),
      maxMessageLen,
    )

    if (queue.length >= maxQueueSize) {
      dropped += 1
      return
    }

    queue.push({ level, ts, message })
    scheduleFlush()
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush()
    }, flushIntervalMs)
  }

  async function flush() {
    if (isFlushing) return
    if (queue.length === 0 && dropped === 0) return

    isFlushing = true
    try {
      const events = queue.splice(0, queue.length)
      if (dropped > 0) {
        events.unshift({
          level: 'warn',
          ts: Date.now(),
          message: `RemoteLog queue overflow: dropped ${dropped} events`,
        })
        dropped = 0
      }

      const payload = {
        sessionId,
        pageUrl,
        events,
      }

      // Prefer sendBeacon for background/pagehide reliability
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
        const ok = navigator.sendBeacon(endpointPath, blob)
        if (!ok) {
          // Fallback to fetch
          const controller = new AbortController()
          const t = setTimeout(() => controller.abort(), requestTimeoutMs)
          try {
            await fetch(endpointPath, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              keepalive: true,
              signal: controller.signal,
            })
          } catch {
            // ignore
          } finally {
            clearTimeout(t)
          }
        }
      } else {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), requestTimeoutMs)
        try {
          await fetch(endpointPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
            signal: controller.signal,
          })
        } catch {
          // ignore
        } finally {
          clearTimeout(t)
        }
      }
    } catch {
      // Swallow errors to avoid infinite error loops.
    } finally {
      isFlushing = false
    }
  }

  // Hook console
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  }

  console.log = (...args) => {
    enqueue('log', args)
    original.log(...args)
  }
  console.info = (...args) => {
    enqueue('info', args)
    original.info(...args)
  }
  console.warn = (...args) => {
    enqueue('warn', args)
    original.warn(...args)
  }
  console.error = (...args) => {
    enqueue('error', args)
    original.error(...args)
  }
  console.debug = (...args) => {
    enqueue('debug', args)
    original.debug(...args)
  }

  // Hook global errors (only if window is available)
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      enqueue('error', [
        'window.onerror:',
        event?.message,
        event?.filename,
        `line=${event?.lineno}`,
        `col=${event?.colno}`,
        event?.error instanceof Error ? event.error : null,
      ])
    })

    window.addEventListener('unhandledrejection', (event) => {
      enqueue('error', ['unhandledrejection:', event?.reason])
    })

    // Flush on navigation/background
    window.addEventListener('pagehide', () => {
      void flush()
    })
    
    if (typeof document !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flush()
      })
    }
  }

  // Emit a startup marker
  enqueue('info', ['RemoteLog enabled', { sessionId }])

  return { enabled: true, sessionId, flush }
}

