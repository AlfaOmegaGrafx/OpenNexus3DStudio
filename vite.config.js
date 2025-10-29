import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: './build',
  },
  resolve: {
    dedupe: ['three'],
    alias: {
      buffer: 'buffer/',
      three: path.resolve(__dirname, 'node_modules/three')
    }
  },
  server: {
    port: 3000,
    host: true
  },
  optimizeDeps: {
    include: ['three', '@pixiv/three-vrm']
  }
})
