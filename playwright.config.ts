import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 3,
  timeout: 40_000,
  use: {
    baseURL: 'http://127.0.0.1:5200',
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5200 --strictPort',
    url: 'http://127.0.0.1:5200',
    reuseExistingServer: !process.env.CI,
  },
})
