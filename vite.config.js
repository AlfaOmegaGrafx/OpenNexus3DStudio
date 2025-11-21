import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: './build',
    commonjsOptions: {
      // Ensure Three.js is treated as a CommonJS module for proper deduplication
      include: [/three/, /node_modules/],
      transformMixedEsModules: true
    }
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
      // Force all Three.js imports to use the same instance
      'three': path.resolve(__dirname, 'node_modules/three'),
      // Alias for centralized Three.js module
      '@/three': path.resolve(__dirname, 'src/library/three.js')
    }
  },
  server: {
    port: 3000,
    host: true
  },
  optimizeDeps: {
    include: ['three', '@pixiv/three-vrm'],
    // Aggressively deduplicate Three.js to avoid multiple instances warning
    dedupe: ['three', '@pixiv/three-vrm'],
    esbuildOptions: {
      // Ensure Three.js is properly resolved
      resolveExtensions: ['.js', '.jsx', '.ts', '.tsx']
    }
  },
  ssr: {
    // Prevent multiple Three.js instances in SSR
    noExternal: ['three']
  }
})
