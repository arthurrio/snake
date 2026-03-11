import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// In WSL2 environments, the Playwright-bundled Chromium often lacks system
// libraries.  Fall back to the user's Windows Chrome when available.
const WSL_CHROME = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = existsSync(WSL_CHROME) ? WSL_CHROME : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 20_000,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'npx serve . -p 3000 --no-clipboard',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },

  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { executablePath } : {}),
      },
    },
    {
      name: 'Mobile Safari (iPhone 13)',
      use: {
        ...devices['iPhone 13'],
        ...(executablePath ? { executablePath } : {}),
      },
    },
    {
      name: 'Mobile Chrome (Pixel 5)',
      use: {
        ...devices['Pixel 5'],
        ...(executablePath ? { executablePath } : {}),
      },
    },
  ],
});
