import { defineConfig, devices } from '@playwright/test';

// Cấu hình Playwright cho repo (plan mục 8 bước 4). E2E chỉ chạy trên trang công khai,
// vì mọi trang trong matcher của proxy.ts đều cần phiên đăng nhập thật của Neon Auth.
const BASE_URL = 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter web dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
