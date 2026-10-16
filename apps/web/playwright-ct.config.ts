import { defineConfig, devices } from '@playwright/experimental-ct-react';

export default defineConfig({
  testDir: './browser-tests',
  outputDir: '../../test-results/reader',
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    ctPort: 41783,
    ctViteConfig: { server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' } },
    ctCacheDir: '../../test-results/reader-cache',
    trace: 'retain-on-failure',
  },
});
