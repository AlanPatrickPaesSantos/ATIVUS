import { defineConfig, devices } from '@playwright/test'

const frontendPort = process.env.E2E_REAL_FRONTEND_PORT ?? '4174'
const backendUrl = process.env.E2E_REAL_BACKEND_URL ?? 'http://127.0.0.1:3010'

export default defineConfig({
  testDir: './e2e-real',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium-real-backend', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
    url: `http://127.0.0.1:${frontendPort}`,
    reuseExistingServer: false,
    env: {
      VITE_ENABLE_MSW: 'false',
      VITE_BACKEND_URL: backendUrl,
    },
    timeout: 30_000,
  },
})
