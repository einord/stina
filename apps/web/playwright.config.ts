import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3002',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'STINA_E2E=true STINA_DB_PATH=/tmp/stina-e2e.db pnpm --filter @stina/api dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @stina/web dev',
      url: 'http://localhost:3002',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
