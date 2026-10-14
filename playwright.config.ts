import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests', fullyParallel: false, retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', baseURL: 'http://127.0.0.1:4180', trace: 'retain-on-failure', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
  // Test real 404 fallback behavior; Vite preview silently rewrites unknown URLs.
  webServer: { command: 'node tests/pages-server.mjs', url: `http://127.0.0.1:4180${process.env.BASE_PATH ?? '/'}`, reuseExistingServer: false },
});
