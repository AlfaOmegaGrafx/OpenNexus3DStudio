import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { iwsdkDev } from '@iwsdk/vite-plugin-dev'
import path from 'path'
import fs from 'fs'

// https://vitejs.dev/config/
function remoteLogPlugin() {
  return {
    name: 'open-nexus-remote-log-endpoint',
    configureServer(server) {
      const logsDir = path.resolve(__dirname, 'logs')
      const logFile = path.resolve(logsDir, 'remote-log.txt')
      const maxLogBytes = 5 * 1024 * 1024 // 5MB rotate

      function ensureLogsDir() {
        try {
          if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
        } catch {
          // ignore
        }
      }

      function sanitizeLine(s) {
        if (!s) return ''
        return String(s)
          .replace(/\s+/g, ' ')
          .replace(/[^\x20-\x7E]/g, '') // keep ASCII-printable only
          .trim()
      }

      function truncateLine(s, max = 800) {
        if (!s || s.length <= max) return s
        return `${s.slice(0, max)}…(truncated ${s.length - max} chars)`
      }

      function appendLine(line) {
        try {
          ensureLogsDir()
          // rotate if needed
          if (fs.existsSync(logFile)) {
            const stat = fs.statSync(logFile)
            if (stat.size > maxLogBytes) {
              const rotated = path.resolve(
                logsDir,
                `remote-log.${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
              )
              fs.renameSync(logFile, rotated)
            }
          }
          fs.appendFileSync(logFile, `${line}\n`, 'utf8')
        } catch {
          // ignore
        }
      }

      server.middlewares.use('/__remote_log', (req, res, next) => {
        // Endpoint: POST /__remote_log (JSON)
        // Intended for forwarding logs from remote devices (XR headset) back to the dev server terminal.

        // Basic CORS support in case the device hits a different host/port.
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        let body = ''
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
          body += chunk
          // Safety limit: 1MB
          if (body.length > 1024 * 1024) {
            res.statusCode = 413
            res.end('Payload Too Large')
            req.destroy()
          }
        })

        req.on('end', () => {
          try {
            const payload = body ? JSON.parse(body) : null
            const ip =
              req.headers['x-forwarded-for'] ||
              req.socket?.remoteAddress ||
              'unknown'

            const sessionId = payload?.sessionId || 'unknown-session'
            const pageUrl = payload?.pageUrl || 'unknown-page'
            const events = Array.isArray(payload?.events) ? payload.events : []

            for (const evt of events) {
              const level = evt?.level || 'log'
              const ts = evt?.ts ? new Date(evt.ts).toISOString() : new Date().toISOString()
              const msg = truncateLine(sanitizeLine(evt?.message || ''))

              // Print one line per event (avoid dumping massive objects).
              // Example:
              // [REMOTE_LOG][10.0.0.50][session=abc][warn] 2026-01-14T...Z - something
              const line = `[REMOTE_LOG][${ip}][session=${sessionId}][${level}] ${ts} - ${msg} (${pageUrl})`
              console.log(line)
              appendLine(line)
            }

            res.statusCode = 204
            res.end()
          } catch (e) {
            res.statusCode = 400
            res.end('Bad Request')
          }
        })
      })
    },
  }
}

/**
 * Dev-only: APK POSTs face weights → broadcast to browsers via SSE (same origin as https dev server).
 * Chrome WebXR uses ?nativeFaceRelay=1 (see nativeFaceRelay.js).
 */
function nativeFaceRelayPlugin() {
  return {
    name: 'character-studio-native-face-relay',
    configureServer(server) {
      /** @type {Set<import('http').ServerResponse>} */
      const sseClients = new Set()
      /** @type {Record<string, unknown>|null} */
      let latestFacePayload = null
      let ingestCount = 0
      let lastIngestLogAt = 0

      const recordingsDir = path.resolve(__dirname, 'logs', 'face-recordings')
      // Free-tier cap. Long-session mode (subscription / x402 upgrade — see
      // MONETIZATION_ROADMAP.md §10) lifts this by passing `longSession: true`.
      const FREE_TIER_MAX_RECORDING_MS = 90 * 1000
      const MAX_RECORDING_AUDIO_BYTES = 32 * 1024 * 1024
      /** Active recording state: append every ingested payload as JSONL while recording. */
      let recording = {
        active: false,
        id: /** @type {string|null} */ (null),
        startedAt: 0,
        frames: 0,
        longSession: false,
        maxMs: FREE_TIER_MAX_RECORDING_MS,
        truncated: false,
        /** @type {import('fs').WriteStream|null} */
        stream: null,
      }

      function ensureRecordingsDir() {
        try {
          if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true })
        } catch {
          /* ignore */
        }
      }

      function safeRecordingId(raw) {
        const id = String(raw || '').trim()
        // Reject path traversal / unsafe filename chars; keep it boring.
        if (!id || !/^[A-Za-z0-9._-]{1,64}$/.test(id)) return null
        return id
      }

      function stopRecording() {
        const prev = recording
        if (prev.stream) {
          try {
            prev.stream.end()
          } catch {
            /* ignore */
          }
        }
        recording = {
          active: false,
          id: null,
          startedAt: 0,
          frames: 0,
          longSession: false,
          maxMs: FREE_TIER_MAX_RECORDING_MS,
          truncated: false,
          stream: null,
        }
        return prev
      }

      function startRecording(rawId, longSession) {
        ensureRecordingsDir()
        const id = safeRecordingId(rawId) || `face-${new Date().toISOString().replace(/[:.]/g, '-')}`
        stopRecording()
        const file = path.resolve(recordingsDir, `${id}.jsonl`)
        const stream = fs.createWriteStream(file, { flags: 'w' })
        recording = {
          active: true,
          id,
          startedAt: Date.now(),
          frames: 0,
          longSession: !!longSession,
          maxMs: longSession ? Infinity : FREE_TIER_MAX_RECORDING_MS,
          truncated: false,
          stream,
        }
        console.log(
          `[native-face-relay] recording started → ${id}.jsonl${longSession ? ' (long session)' : ` (free tier, cap ${FREE_TIER_MAX_RECORDING_MS / 1000}s)`}`,
        )
        return id
      }

      function appendRecordingFrame(payload) {
        if (!recording.active || !recording.stream) return
        // Free-tier cap: auto-stop when the recording exceeds maxMs.
        if (Date.now() - recording.startedAt > recording.maxMs) {
          recording.truncated = true
          const stopped = stopRecording()
          console.log(
            `[native-face-relay] recording auto-stopped at free-tier cap → ${stopped.id} (${stopped.frames} frames). Long-session mode unlocks longer captures.`,
          )
          return
        }
        try {
          // Always stamp a server receive time so playback can re-derive cadence
          // even if the APK omitted `t`.
          const frame =
            payload && typeof payload === 'object' && payload.t != null
              ? payload
              : { ...payload, t: Date.now() }
          recording.stream.write(`${JSON.stringify(frame)}\n`)
          recording.frames += 1
        } catch {
          /* ignore */
        }
      }

      function listRecordings() {
        ensureRecordingsDir()
        try {
          return fs
            .readdirSync(recordingsDir)
            .filter((f) => f.endsWith('.jsonl'))
            .map((f) => {
              const full = path.resolve(recordingsDir, f)
              let size = 0
              let mtime = 0
              try {
                const st = fs.statSync(full)
                size = st.size
                mtime = st.mtimeMs
              } catch {
                /* ignore */
              }
              const recId = f.replace(/\.jsonl$/, '')
              return {
                id: recId,
                bytes: size,
                mtimeMs: mtime,
                hasAudio: !!recordingAudioPath(recId),
              }
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs)
        } catch {
          return []
        }
      }

      function recordingAudioPath(id) {
        const safe = safeRecordingId(id)
        if (!safe) return null
        const file = path.resolve(recordingsDir, `${safe}.webm`)
        return fs.existsSync(file) ? file : null
      }

      function readRecordingFrames(id) {
        const safe = safeRecordingId(id)
        if (!safe) return null
        const file = path.resolve(recordingsDir, `${safe}.jsonl`)
        if (!fs.existsSync(file)) return null
        try {
          const text = fs.readFileSync(file, 'utf8')
          /** @type {Array<Record<string, unknown>>} */
          const frames = []
          for (const line of text.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              const obj = JSON.parse(trimmed)
              if (obj && typeof obj === 'object') frames.push(obj)
            } catch {
              /* skip malformed line */
            }
          }
          return frames
        } catch {
          return null
        }
      }

      function writeSse(res, data) {
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`)
        } catch {
          /* client gone */
        }
      }

      function broadcastFacePayload(payload) {
        latestFacePayload = payload
        appendRecordingFrame(payload)
        for (const res of sseClients) {
          writeSse(res, payload)
        }
      }

      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0]

        if (pathname === '/__native_face_sse' && req.method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          })
          res.write(': connected\n\n')
          sseClients.add(res)
          if (latestFacePayload) writeSse(res, latestFacePayload)
          req.on('close', () => {
            sseClients.delete(res)
          })
          return
        }

        if (pathname === '/__native_face_latest' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.statusCode = 200
          res.end(JSON.stringify(latestFacePayload || {}))
          return
        }

        // List available recordings (newest first).
        if (pathname === '/__native_face_recordings' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.statusCode = 200
          res.end(JSON.stringify({ recordings: listRecordings() }))
          return
        }

        // Companion mic audio for a face recording (WebM/Opus).
        if (pathname === '/__native_face_recording_audio') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
          const id = new URLSearchParams((req.url || '').split('?')[1] || '').get('id')
          const audioFile = recordingAudioPath(id)
          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }
          if (req.method === 'HEAD' || req.method === 'GET') {
            if (!audioFile) {
              res.statusCode = 404
              res.end()
              return
            }
            const stat = fs.statSync(audioFile)
            if (req.method === 'HEAD') {
              res.statusCode = 200
              res.setHeader('Content-Type', 'audio/webm')
              res.setHeader('Content-Length', String(stat.size))
              res.setHeader('Cache-Control', 'no-store')
              res.end()
              return
            }
            res.statusCode = 200
            res.setHeader('Content-Type', 'audio/webm')
            res.setHeader('Content-Length', String(stat.size))
            res.setHeader('Cache-Control', 'no-store')
            fs.createReadStream(audioFile).pipe(res)
            return
          }
        }

        if (pathname === '/__native_face_record_audio') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }

          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }

          const id = new URLSearchParams((req.url || '').split('?')[1] || '').get('id')
          const safe = safeRecordingId(id)
          if (!safe) {
            res.statusCode = 400
            res.end('Bad Request')
            return
          }

          const chunks = []
          let total = 0
          req.on('data', (chunk) => {
            total += chunk.length
            if (total > MAX_RECORDING_AUDIO_BYTES) {
              res.statusCode = 413
              res.end('Payload Too Large')
              req.destroy()
              return
            }
            chunks.push(chunk)
          })
          req.on('end', () => {
            try {
              ensureRecordingsDir()
              const out = path.resolve(recordingsDir, `${safe}.webm`)
              fs.writeFileSync(out, Buffer.concat(chunks))
              console.log(`[native-face-relay] audio saved → ${safe}.webm (${total} bytes)`)
              res.statusCode = 204
              res.end()
            } catch {
              res.statusCode = 500
              res.end('Write failed')
            }
          })
          return
        }

        // Fetch a single recording as an ordered array of frames for playback.
        if (pathname === '/__native_face_recording' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('Access-Control-Allow-Origin', '*')
          const id = new URLSearchParams((req.url || '').split('?')[1] || '').get('id')
          const frames = readRecordingFrames(id)
          if (!frames) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'recording not found' }))
            return
          }
          res.statusCode = 200
          res.end(JSON.stringify({ id, frames }))
          return
        }

        // Start/stop recording the relay stream to logs/face-recordings/<id>.jsonl.
        if (pathname === '/__native_face_record') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.setHeader('Content-Type', 'application/json')

          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }

          if (req.method === 'GET') {
            res.statusCode = 200
            res.end(
              JSON.stringify({
                active: recording.active,
                id: recording.id,
                frames: recording.frames,
                startedAt: recording.startedAt,
                longSession: recording.longSession,
                maxMs: recording.maxMs === Infinity ? null : recording.maxMs,
                truncated: recording.truncated,
              }),
            )
            return
          }

          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end(JSON.stringify({ error: 'Method Not Allowed' }))
            return
          }

          let body = ''
          req.setEncoding('utf8')
          req.on('data', (chunk) => {
            body += chunk
            if (body.length > 8 * 1024) {
              req.destroy()
            }
          })
          req.on('end', () => {
            let action = 'start'
            let id = null
            let longSession = false
            try {
              const obj = body ? JSON.parse(body) : {}
              if (obj && typeof obj === 'object') {
                if (typeof obj.action === 'string') action = obj.action
                if (typeof obj.id === 'string') id = obj.id
                longSession = obj.longSession === true || obj.longSession === 'true'
              }
            } catch {
              /* default to start */
            }
            if (action === 'stop') {
              const stopped = stopRecording()
              console.log(
                `[native-face-relay] recording stopped → ${stopped.id || '(none)'} (${stopped.frames} frames)`,
              )
              res.statusCode = 200
              res.end(
                JSON.stringify({
                  active: false,
                  id: stopped.id,
                  frames: stopped.frames,
                  truncated: stopped.truncated,
                }),
              )
              return
            }
            const startedId = startRecording(id, longSession)
            res.statusCode = 200
            res.end(JSON.stringify({ active: true, id: startedId, frames: 0, longSession }))
          })
          return
        }

        if (pathname === '/__native_face_ingest') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }

          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }

          let body = ''
          req.setEncoding('utf8')
          req.on('data', (chunk) => {
            body += chunk
            if (body.length > 256 * 1024) {
              res.statusCode = 413
              res.end('Payload Too Large')
              req.destroy()
            }
          })

          req.on('end', () => {
            try {
              const payload = body ? JSON.parse(body) : null
              if (!payload || typeof payload !== 'object') {
                res.statusCode = 400
                res.end('Bad Request')
                return
              }
              ingestCount += 1
              broadcastFacePayload(payload)
              const now = Date.now()
              if (now - lastIngestLogAt > 5000) {
                lastIngestLogAt = now
                const w =
                  payload.weights && typeof payload.weights === 'object'
                    ? Object.keys(payload.weights).length
                    : 0
                const ip =
                  req.headers['x-forwarded-for'] ||
                  req.socket?.remoteAddress ||
                  'unknown'
                console.log(
                  `[native-face-relay] ingest #${ingestCount} from ${ip} (${w} weights, ${sseClients.size} SSE clients)`,
                )
              }
              res.statusCode = 204
              res.end()
            } catch {
              res.statusCode = 400
              res.end('Bad Request')
            }
          })
          return
        }

        next()
      })
    },
  }
}

const DEV_DGX_PROXY_PREFIX = '/__dev_dgx_proxy'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = (env.DEV_API_PROXY_TARGET || '').trim().replace(/\/$/, '')
  const devApiProxy =
    command === 'serve' && proxyTarget && /^https?:\/\//i.test(proxyTarget)
      ? {
          [DEV_DGX_PROXY_PREFIX]: {
            target: proxyTarget,
            changeOrigin: true,
            secure: false,
            rewrite: (p) => {
              const stripped = p.startsWith(DEV_DGX_PROXY_PREFIX)
                ? p.slice(DEV_DGX_PROXY_PREFIX.length)
                : p
              return stripped || '/'
            },
          },
        }
      : {}

  if (command === 'serve' && Object.keys(devApiProxy).length) {
    console.log(`[vite] API dev proxy: ${DEV_DGX_PROXY_PREFIX} → ${proxyTarget}`)
  }

  return {
  plugins: [
    react(),
    ...(command === 'serve'
      ? [
          iwsdkDev({
            emulator: { device: 'metaQuest3', activation: 'localhost' },
            ai: {
              mode: 'agent',
              screenshotSize: { width: 800, height: 800 },
            },
            verbose: true,
          }),
          remoteLogPlugin(),
          nativeFaceRelayPlugin(),
        ]
      : []),
  ],
  build: {
    outDir: './build',
    commonjsOptions: {
      // Ensure Three.js is treated as a CommonJS module for proper deduplication
      include: [/three/, /node_modules/],
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: [
      { find: 'buffer', replacement: 'buffer/' },
      // Exact `three` only — a directory alias breaks `three/webgpu` and `three/addons/*` export paths
      {
        find: /^three$/,
        replacement: path.resolve(__dirname, 'node_modules/three/build/three.module.js'),
      },
      { find: '@/three', replacement: path.resolve(__dirname, 'src/library/three.js') },
    ],
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    host: true, // Allow access from network (e.g. https://YOUR_PC_LAN_IP:3000 for Galaxy XR)
    proxy: devApiProxy,
    // HTTPS is required for WebXR (AR/VR) — browsers block XR on non-secure origins
    https: (() => {
      const keyPath = path.resolve(__dirname, 'certs', 'localhost-key.pem')
      const certPath = path.resolve(__dirname, 'certs', 'localhost.pem')

      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        console.log('🔐 Using HTTPS (required for WebXR on Galaxy XR)')
        return {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      }
      console.warn('⚠️  HTTPS certificates not found. Run: npm run setup-https')
      console.warn('⚠️  WebXR (AR/VR) will not work on Galaxy XR without HTTPS')
      return false // Fall back to HTTP
    })(),
    strictPort: true, // fail if port in use (avoids multiple dev servers on 3001, 3002…). E2E uses PORT=3099
  },
  optimizeDeps: {
    include: [
      'three',
      '@pixiv/three-vrm',
      '@iwsdk/core',
      '@gltf-transform/core',
      '@gltf-transform/extensions',
      '@gltf-transform/functions',
      'meshoptimizer',
      'draco3dgltf',
    ],
    // Aggressively deduplicate Three.js to avoid multiple instances warning
    dedupe: ['three', '@pixiv/three-vrm'],
    esbuildOptions: {
      // Ensure Three.js is properly resolved
      resolveExtensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
  },
  ssr: {
    // Prevent multiple Three.js instances in SSR
    noExternal: ['three'],
  },
}
})
