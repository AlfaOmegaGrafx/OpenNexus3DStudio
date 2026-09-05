import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import fs from 'fs'
import os from 'os'
import net from 'net'
import { spawn } from 'child_process'
import { ensureDevCerts } from './scripts/ensure-dev-certs.mjs'

/**
 * Prefer Surface LAN for browser open / tip — Cursor often binds broken
 * 127.0.0.1:3000 / ::1:3000 while Vite serves the LAN interface successfully.
 * Override host: VITE_DEV_OPEN_HOST=10.0.0.32  ·  opt-in browser open: VITE_DEV_OPEN=1
 * (Default: print LAN URL only — avoids duplicate Studio tabs with Cursor port forward.)
 */
function resolvePreferredLanHost() {
  const fromEnv = (process.env.VITE_DEV_OPEN_HOST || '').trim()
  if (fromEnv) return fromEnv

  const preferredExact = '10.0.0.32'
  const ipv4 = []
  for (const entries of Object.values(os.networkInterfaces() || {})) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue
      ipv4.push(entry.address)
    }
  }
  if (ipv4.includes(preferredExact)) return preferredExact
  const lan10 = ipv4.find((ip) => ip.startsWith('10.0.0.'))
  if (lan10) return lan10
  // Skip Tailscale CGNAT (100.x) for the default browser URL
  const privateLan = ipv4.find(
    (ip) =>
      !ip.startsWith('100.') &&
      (ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)),
  )
  return privateLan || ipv4[0] || null
}

function openExternalUrl(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref()
      return
    }
    if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
      return
    }
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
  } catch {
    // ignore — tip still printed
  }
}

function preferLanDevUrlPlugin() {
  return {
    name: 'prefer-lan-dev-url',
    configureServer(server) {
      const httpServer = server.httpServer
      if (!httpServer) return
      httpServer.once('listening', () => {
        const host = resolvePreferredLanHost()
        if (!host) return
        const addr = httpServer.address()
        const port =
          typeof addr === 'object' && addr && typeof addr.port === 'number'
            ? addr.port
            : server.config.server.port || 3000
        const proto = server.config.server.https ? 'https' : 'http'
        const url = `${proto}://${host}:${port}/`
        console.log('')
        console.log('[vite] Preferred URL (LAN — use this; localhost is often broken on Surface):')
        console.log(`  ➜  ${url}`)
        console.log('')
        if (process.env.VITE_DEV_OPEN !== '1') return
        // Defer so Vite finishes printing its Local/Network block first.
        setTimeout(() => openExternalUrl(url), 400)
      })
    },
  }
}

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

function moatOrPublic(publicFile, moatFile) {
  const moatPath = path.resolve(__dirname, moatFile)
  const publicPath = path.resolve(__dirname, publicFile)
  return fs.existsSync(moatPath) ? moatPath : publicPath
}

/** Resolve companion imports to gitignored src/moat on local builds (Windows-safe). */
function companionMoatResolvePlugin() {
  /** @type {Record<string, [string, string]>} tracked rel → [public, moat] */
  const MAP = {
    'src/pages/CompanionPage.jsx': [
      'src/pages/CompanionPage.public.jsx',
      'src/moat/companion/CompanionPage.jsx',
    ],
    'src/library/companionHandoff.js': [
      'src/library/companionHandoff.public.js',
      'src/moat/companion/companionHandoff.js',
    ],
    'src/library/companionConfig.js': [
      'src/library/companionConfig.public.js',
      'src/moat/companion/companionConfig.js',
    ],
    'src/library/companionBridge.js': [
      'src/library/companionBridge.public.js',
      'src/moat/companion/companionBridge.js',
    ],
  }

  return {
    name: 'companion-moat-resolve',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null
      const abs = path.normalize(path.resolve(path.dirname(importer), source))
      const root = path.resolve(__dirname)
      const moatRoot = path.join(root, 'src/moat/companion')
      // Already inside moat overlay — never bounce back through library stubs (Windows resolve loops).
      if (abs.startsWith(moatRoot)) return null
      const rel = path.relative(root, abs).replace(/\\/g, '/')
      if (rel.startsWith('..')) return null
      const pair = MAP[rel]
      if (!pair) return null
      const resolved = moatOrPublic(pair[0], pair[1])
      if (path.normalize(resolved) === abs) return null
      return resolved
    },
  }
}

const DEV_DGX_PROXY_PREFIX = '/__dev_dgx_proxy'

function getLocalIpv4Addresses() {
  const ips = new Set()
  for (const entries of Object.values(os.networkInterfaces() || {})) {
    for (const entry of entries || []) {
      if (entry?.family === 'IPv4' && !entry.internal) ips.add(entry.address)
    }
  }
  return ips
}

/** Surface OpenNexus — auto-spawn LAN companion HTTPS proxy when the local overlay script exists. */
function isCompanionSurfaceHost() {
  if (process.env.VITE_COMPANION_AUTO_PROXY === '0') return false
  if (process.env.VITE_COMPANION_AUTO_PROXY === '1') return true
  const ips = getLocalIpv4Addresses()
  const dgxIp = String(process.env.VITE_DGX_LAN_IP || process.env.DGX_LAN_IP || '10.0.0.158').trim()
  if (dgxIp && ips.has(dgxIp)) return false
  return ips.has('10.0.0.32')
}

function isPortListeningOnHost(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.setTimeout(400, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function isPortListeningOnLan(port) {
  const hosts = [...getLocalIpv4Addresses()].filter((ip) => ip && ip !== '127.0.0.1')
  if (hosts.length === 0) return Promise.resolve(false)
  return Promise.any(hosts.map((host) => isPortListeningOnHost(port, host).then((ok) => (ok ? true : Promise.reject())))).then(
    () => true,
    () => false,
  )
}

function resolveSurfaceCompanionRoot() {
  const candidates = [
    process.env.COMPANION_ROOT,
    process.env.MOECHAT_ROOT,
    path.join(os.homedir(), 'Documents', 'GitHub', 'chat'),
    'C:\\Users\\alfao\\Documents\\GitHub\\chat',
  ].filter(Boolean)
  return candidates.find((root) => fs.existsSync(path.join(root, 'app'))) || ''
}

async function ensureSurfaceCompanion(chatPort) {
  if (await isPortListeningOnHost(Number(chatPort), '127.0.0.1')) return true
  const chatRoot = resolveSurfaceCompanionRoot()
  if (!chatRoot) {
    console.log('[vite] Companion repo not on this PC — companion proxy will use DGX :5173 fallback')
    return false
  }
  const logsDir = path.resolve(__dirname, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  const logFd = fs.openSync(path.join(logsDir, 'companion-dev.log'), 'a')
  const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  // Surface may have pnpm 11 while chat pins packageManager 10.x — ignore mismatch so :5173 starts.
  const env = {
    ...process.env,
    COREPACK_ENABLE_STRICT: '0',
  }
  console.log(`[vite] Starting Surface Companion :${chatPort} from ${chatRoot}/app`)
  const child = spawn(
    pnpmCmd,
    ['--dir', path.join(chatRoot, 'app'), '--pm-on-fail=ignore', 'dev', '--host', '127.0.0.1', '--port', String(chatPort)],
    {
      cwd: chatRoot,
      stdio: ['ignore', logFd, logFd],
      detached: true,
      windowsHide: true,
      shell: process.platform === 'win32',
      env,
    },
  )
  child.unref()
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 500))
    if (await isPortListeningOnHost(Number(chatPort), '127.0.0.1')) return true
  }
  console.warn(`[vite] Surface Companion :${chatPort} not listening yet — proxy will fall back to DGX`)
  return false
}

function companionSurfaceProxyPlugin() {
  /** @type {import('child_process').ChildProcess | null} */
  let child = null

  function stopChild() {
    if (!child) return
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    child = null
  }

  return {
    name: 'companion-surface-proxy',
    async configureServer() {
      if (!isCompanionSurfaceHost()) return

      const chatPort = process.env.COMPANION_CHAT_PORT || process.env.COMPANION_PORT || process.env.MOECHAT_PORT || '5173'
      await ensureSurfaceCompanion(chatPort)

      const port = Number(process.env.COMPANION_PROXY_PORT || 8464)
      if (await isPortListeningOnLan(port)) {
        console.log(`[vite] Companion proxy already listening on LAN :${port}`)
        return
      }

      ensureDevCerts()

      const dgx = String(process.env.VITE_DGX_LAN_IP || process.env.DGX_LAN_IP || '10.0.0.158').trim()
      const localUrl = `http://127.0.0.1:${chatPort}`
      const dgxUrl = `http://${dgx}:${chatPort}`
      const chatUrl = process.env.COMPANION_CHAT_URL || localUrl
      const fallbackUrl = process.env.COMPANION_CHAT_FALLBACK_URL || dgxUrl
      const script = path.resolve(__dirname, 'scripts/companion-surface-proxy.mjs')
      if (!fs.existsSync(script)) {
        console.log('[vite] Companion proxy script not present (local-only overlay)')
        return
      }

      console.log(`[vite] Auto-starting companion HTTPS proxy :${port} → ${chatUrl} (fallback ${fallbackUrl})`)

      child = spawn(process.execPath, [script], {
        stdio: 'inherit',
        env: {
          ...process.env,
          COMPANION_CHAT_URL: chatUrl,
          COMPANION_CHAT_FALLBACK_URL: fallbackUrl,
          COMPANION_PROXY_PORT: String(port),
          PERSONAPLEX_WS_URL: process.env.PERSONAPLEX_WS_URL || `http://${dgx}:8998`,
        },
      })

      child.on('exit', (code, signal) => {
        if (code && code !== 0) {
          console.warn(`[vite] Companion proxy exited (${signal || code})`)
        }
        child = null
      })

      process.on('exit', stopChild)
      process.on('SIGINT', () => {
        stopChild()
        process.exit(0)
      })
      process.on('SIGTERM', stopChild)
    },
  }
}

function personaplexSurfaceProxyPlugin() {
  /** @type {import('child_process').ChildProcess | null} */
  let child = null

  function stopChild() {
    if (!child) return
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    child = null
  }

  return {
    name: 'personaplex-surface-proxy',
    async configureServer() {
      if (!isCompanionSurfaceHost()) return

      const port = Number(process.env.PERSONAPLEX_PROXY_PORT || 8455)
      if (await isPortListeningOnLan(port)) {
        console.log(`[vite] PersonaPlex WSS proxy already listening on LAN :${port}`)
        return
      }

      ensureDevCerts()

      const script = path.resolve(__dirname, 'src/moat/companion/scripts/personaplex-ws-proxy.mjs')
      if (!fs.existsSync(script)) {
        console.log('[vite] PersonaPlex proxy script not present (local-only overlay)')
        return
      }

      const dgx = String(process.env.VITE_DGX_LAN_IP || process.env.DGX_LAN_IP || '10.0.0.158').trim()
      const target = process.env.PERSONAPLEX_WS_URL || `http://${dgx}:8998`
      const certDir = path.resolve(__dirname, 'certs')
      console.log(`[vite] Auto-starting PersonaPlex WSS proxy :${port} → ${target}`)

      child = spawn(process.execPath, [script], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PERSONAPLEX_WS_URL: target,
          PERSONAPLEX_PROXY_PORT: String(port),
          PERSONAPLEX_PROXY_CERT_DIR: certDir,
        },
      })

      child.on('exit', (code, signal) => {
        if (code && code !== 0) {
          console.warn(`[vite] PersonaPlex proxy exited (${signal || code})`)
        }
        child = null
      })

      process.on('exit', stopChild)
    },
  }
}

/** Paths that never need HMR — keeps file watchers under OS limits. */
const DEV_WATCH_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/build/**',
  '**/dist/**',
  '**/docs/**',
  '**/native/**',
  '**/graphify-out/**',
  '**/src/moat/**/graphify-out/**',
  '**/src/moat/**/__tests__/**',
  '**/.sessionmem-team/**',
  '**/coverage/**',
  '**/logs/**',
  '**/.vite/**',
  '**/public/loot-assets/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/electron-dist/**',
]

export default defineConfig(async ({ command, mode }) => {
  // @iwsdk/vite-plugin-dev is ESM-only; static import breaks Vite config load via require.
  const { iwsdkDev } =
    command === 'serve'
      ? await import('@iwsdk/vite-plugin-dev')
      : { iwsdkDev: null }
  const env = loadEnv(mode, process.cwd(), '')
  const useWatchPolling =
    env.VITE_USE_POLLING === '1' ||
    env.CHOKIDAR_USEPOLLING === '1' ||
    env.CHOKIDAR_USEPOLLING === 'true'
  const proxyTarget = (env.DEV_API_PROXY_TARGET || '').trim().replace(/\/$/, '')
  const dgxLan = String(env.VITE_DGX_LAN_IP || env.DGX_LAN_IP || '10.0.0.158').trim()
  const voiceUploadTarget = (
    env.PERSONAPLEX_VOICE_UPLOAD_URL
    || `http://${dgxLan}:${env.PERSONAPLEX_VOICE_UPLOAD_PORT || 8999}`
  ).replace(/\/$/, '')
  const personaplexVoiceProxy =
    command === 'serve'
      ? {
          '/__personaplex_voices': {
            target: voiceUploadTarget,
            changeOrigin: true,
            secure: false,
            timeout: 120000,
            proxyTimeout: 120000,
            rewrite: (p) => {
              try {
                const u = new URL(p, 'http://localhost')
                return `/api/personaplex/voices${u.search || ''}`
              } catch {
                return '/api/personaplex/voices'
              }
            },
            configure: (proxy) => {
              proxy.on('error', (err, _req, res) => {
                console.error('[vite] PersonaPlex voice upload proxy error:', err?.message || err)
                if (res && !res.headersSent && typeof res.writeHead === 'function') {
                  try {
                    res.writeHead(502, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({
                      ok: false,
                      error: `Live Speech voice upload unreachable (${voiceUploadTarget})`,
                    }))
                  } catch {
                    /* ignore */
                  }
                }
              })
            },
          },
        }
      : {}
  const devApiProxy =
    command === 'serve' && proxyTarget && /^https?:\/\//i.test(proxyTarget)
      ? {
          ...personaplexVoiceProxy,
          [DEV_DGX_PROXY_PREFIX]: {
            target: proxyTarget,
            changeOrigin: true,
            secure: false,
            timeout: 300000,
            proxyTimeout: 300000,
            ws: true,
            rewrite: (p) => {
              const stripped = p.startsWith(DEV_DGX_PROXY_PREFIX)
                ? p.slice(DEV_DGX_PROXY_PREFIX.length)
                : p
              return stripped || '/'
            },
            configure: (proxy) => {
              // Unhandled http-proxy errors crash Vite (ERR_CONNECTION_REFUSED).
              proxy.on('error', (err, _req, res) => {
                console.error('[vite] DGX proxy error:', err?.message || err)
                if (res && !res.headersSent && typeof res.writeHead === 'function') {
                  try {
                    res.writeHead(502, { 'Content-Type': 'text/plain' })
                    res.end('DGX proxy error')
                  } catch {
                    /* socket already closed */
                  }
                }
              })
            },
          },
        }
      : { ...personaplexVoiceProxy }

  if (command === 'serve' && Object.keys(devApiProxy).length) {
    if (proxyTarget) {
      console.log(`[vite] API dev proxy: ${DEV_DGX_PROXY_PREFIX} → ${proxyTarget}`)
    }
    console.log(`[vite] PersonaPlex voice upload proxy: /__personaplex_voices → ${voiceUploadTarget}`)
  }
  if (command === 'serve' && useWatchPolling) {
    console.log('[vite] File watch: polling mode (VITE_USE_POLLING / CHOKIDAR_USEPOLLING)')
  }

  return {
  plugins: [
    companionMoatResolvePlugin(),
    react(),
    ...(command === 'serve'
      ? [
          preferLanDevUrlPlugin(),
          companionSurfaceProxyPlugin(),
          personaplexSurfaceProxyPlugin(),
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
      { find: /^three\/addons\/(.*)/, replacement: path.resolve(__dirname, 'node_modules/three/examples/jsm/$1') },
      { find: 'three/webgpu', replacement: path.resolve(__dirname, 'node_modules/three/build/three.webgpu.js') },
      { find: 'three/tsl', replacement: path.resolve(__dirname, 'node_modules/three/build/three.tsl.js') },
      { find: /^three$/, replacement: path.resolve(__dirname, 'node_modules/three/build/three.module.js') },
      { find: 'buffer', replacement: 'buffer/' },
      { find: '@/three', replacement: path.resolve(__dirname, 'src/library/three.js') },
    ],
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    host: '0.0.0.0', // Explicit IPv4 — Galaxy XR Chrome fails on some Windows IPv6-only ::: binds
    // Do not auto-open localhost — preferLanDevUrlPlugin opens the LAN URL instead.
    open: false,
    proxy: devApiProxy,
    // HTTPS is required for WebXR (AR/VR) — browsers block XR on non-secure origins
    https: (() => {
      let keyPath = path.resolve(__dirname, 'certs', 'localhost-key.pem')
      let certPath = path.resolve(__dirname, 'certs', 'localhost.pem')

      if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        try {
          ;({ keyPath, certPath } = ensureDevCerts())
        } catch (err) {
          console.warn('⚠️  Could not generate dev HTTPS certs:', err?.message || err)
        }
      }

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
    strictPort: false, // allow Cursor on 127.0.0.1:3000 while Vite serves LAN (Galaxy XR)
    watch: {
      ignored: DEV_WATCH_IGNORED,
      followSymlinks: false,
      ...(useWatchPolling ? { usePolling: true, interval: 300 } : {}),
    },
  },
  optimizeDeps: {
    // Havok ships WASM — must stay out of esbuild prebundle (IWSDK physics).
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pixiv/three-vrm',
      '@iwsdk/core',
      '@gltf-transform/core',
      '@gltf-transform/extensions',
      '@gltf-transform/functions',
      'meshoptimizer',
      'draco3dgltf',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    // Aggressively deduplicate Three.js / UIKit graphs (IWSDK spatial UI).
    dedupe: [
      'three',
      '@pixiv/three-vrm',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
    esbuildOptions: {
      // Ensure Three.js is properly resolved
      resolveExtensions: ['.js', '.jsx', '.ts', '.tsx'],
      alias: {
        'three/addons/postprocessing/Pass.js': path.resolve(
          __dirname,
          'node_modules/three/examples/jsm/postprocessing/Pass.js',
        ),
        'three/webgpu': path.resolve(__dirname, 'node_modules/three/build/three.webgpu.js'),
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
  ssr: {
    // Prevent multiple Three.js instances in SSR
    noExternal: ['three'],
  },
}
})
