import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    ...devices['Pixel 5'],
    // Optional: run against a browser you already have (e.g. in CI without Playwright downloads).
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] }
      : {},
  },
  // E2E_BASE_URL=http://localhost:4000 tests the merged app served by the gateway (no dev server).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // E2E_MODE=live builds against the real gateway (.env.live); default is the mock (.env.e2e).
        command: `npx vite --mode ${process.env.E2E_MODE ?? 'e2e'} --port 4173 --strictPort`,
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
      },
});
