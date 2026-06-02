import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/NextCode/' : '/',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'restrict-properties',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['pyodide'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Nextcode IDE',
        short_name: 'Nextcode',
        description: 'เขียนโค้ดบนเบราว์เซอร์',
        theme_color: '#6366f1',
        background_color: '#0f0f0f',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/accounts\.google\.com/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/www\.googleapis\.com/,
            handler: 'NetworkFirst',
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
            return 'monaco';
          }
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('dexie') || id.includes('zustand')) {
              return 'vendor-state';
            }
          }
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
}))
