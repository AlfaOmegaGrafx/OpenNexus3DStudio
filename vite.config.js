import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
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

export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command === 'serve' ? [remoteLogPlugin()] : [])],
  build: {
    outDir: './build',
    commonjsOptions: {
      // Ensure Three.js is treated as a CommonJS module for proper deduplication
      include: [/three/, /node_modules/],
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
      // Force all Three.js imports to use the same instance
      three: path.resolve(__dirname, 'node_modules/three'),
      // Alias for centralized Three.js module
      '@/three': path.resolve(__dirname, 'src/library/three.js'),
    },
  },
  server: {
    port: 3000,
    host: true, // Allow access from network (for Galaxy XR device)
    // HTTPS is required for WebXR support
    https: (() => {
      const keyPath = path.resolve(__dirname, 'certs', 'localhost-key.pem')
      const certPath = path.resolve(__dirname, 'certs', 'localhost.pem')

      // Check if certificates exist
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        console.log('🔐 Using HTTPS with local certificates')
        return {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      } else {
        console.warn('⚠️  HTTPS certificates not found. Run: npm run setup-https')
        console.warn('⚠️  WebXR (AR/VR) will not work without HTTPS')
        return false // Fall back to HTTP
      }
    })(),
    strictPort: true,
  },
  optimizeDeps: {
    include: ['three', '@pixiv/three-vrm'],
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
}))
