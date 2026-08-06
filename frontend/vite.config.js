import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

const productConfigCleanUrl = {
  name: 'product-config-clean-url',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/product-config') {
        req.url = '/product-config.html'
      }
      next()
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/product-config') {
        req.url = '/product-config.html'
      }
      next()
    })
  },
}

export default defineConfig({
  plugins: [productConfigCleanUrl, react()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(rootDir, 'index.html'),
        productConfig: path.resolve(rootDir, 'product-config.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@/api/client': path.resolve(rootDir, './src/api/catalog-client.ts'),
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:6001',
        changeOrigin: true,
      },
    },
  },
})
