import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL ?? 'http://localhost:3010'

function excludeMswWorkerFromBuild(): Plugin {
  return {
    name: 'exclude-msw-worker-from-build',
    apply: 'build',
    async closeBundle() {
      await rm(resolve('dist/mockServiceWorker.js'), { force: true })
    },
  }
}

export default defineConfig(({ command }) => {
  const isServe = command === 'serve'

  return {
    plugins: [react(), excludeMswWorkerFromBuild()],
    publicDir: 'public',
    server: isServe
      ? {
          proxy: {
            '/api/v1': {
              target: backendUrl,
              changeOrigin: true,
              secure: false,
            },
          },
        }
      : undefined,
    test: {
      environment: 'jsdom',
      globals: true,
      testTimeout: 15000,
      setupFiles: ['src/test/setup.ts'],
      environmentOptions: {
        jsdom: {
          // Habilita o virtualConsole do jsdom conectado ao console do worker,
          // permitindo ao setup silenciar "Not implemented: navigation..." (downloads blob).
          console: true,
        },
      },
    },
  }
})
