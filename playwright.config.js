// @ts-check
// Playwright config for e2e tests. Run dev server first: npm run dev
// Then: npm run test:e2e (or npx playwright test)

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3099',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: !!process.env.CI, // Show browser window locally; headless in CI
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Start dev server on port 3099 to avoid conflict with manual "npm run dev" on 3000
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3099',
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: '3099' },
  },
});
