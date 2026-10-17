import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3123',
    ...devices['iPhone 13'],
    browserName: 'chromium', // WebKit no está disponible en este entorno; la prueba real en iPhone queda pendiente
    serviceWorkers: 'allow',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },
  webServer: { command: 'PORT=3123 node scripts/serve.mjs', port: 3123, reuseExistingServer: true },
})
