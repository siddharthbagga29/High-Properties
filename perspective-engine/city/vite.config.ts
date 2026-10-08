/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // The Jarvis core lives beside the city so other apps can share it.
  resolve: { alias: { '@jarvis': decodeURIComponent(new URL('../jarvis/core', import.meta.url).pathname) } },
  server: { fs: { allow: ['..'] } },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('preload-helper') || id.includes('commonjsHelpers')) return 'react'
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          if (id.includes('node_modules/three/')) return 'three'
          if (/@react-three|postprocessing|maath|three-stdlib|troika|camera-controls|meshline|its-fine|suspend-react/.test(id)) return 'r3f'
          return 'vendor'
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
