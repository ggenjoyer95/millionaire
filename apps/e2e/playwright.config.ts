import {defineConfig} from '@playwright/test';

/**
 * Конфигурация Playwright для e2e-тестов.
 *
 * Для запуска тестов нужно чтобы сервер и клиент были подняты.
 * Мы говорим Playwright поднять их через webServer.
 * Baseline URL клиента - http://127.0.0.1:3000.
 *
 * Если захотим изолированную среду (чистое сохранение game-state.json),
 * пишем в отдельную STORAGE_DIR через env.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {timeout: 10_000},
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter server dev',
      url: 'http://127.0.0.1:4000/api/health',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
      env: {
        PORT: '4000',
        STORAGE_DIR: './apps/server/src/data/storage-e2e',
        DISABLE_PERSISTENCE: '1',
      },
    },
    {
      command: 'pnpm --filter client dev',
      url: 'http://127.0.0.1:3000',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {browserName: 'chromium'},
    },
  ],
});
