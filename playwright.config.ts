import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'https://127.0.0.1:3443'
const localTLS = new URL(baseURL).protocol === 'https:' && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7000 },
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { baseURL, ignoreHTTPSErrors: localTLS, trace: 'retain-on-failure' },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node scripts/e2e-server.mjs', url: 'https://127.0.0.1:3443/api/health',
    ignoreHTTPSErrors: true,
    env: { PORT: '3107', SERVER_HOST: '127.0.0.1' },
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
})
