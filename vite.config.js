import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: './build',
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
      'three': 'three'
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
