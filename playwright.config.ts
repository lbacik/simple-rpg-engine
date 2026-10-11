import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

// The smoke suite runs against a production build with a throwaway database:
// build once with `npm run build`, then `npm run test:e2e` starts
// `npx next start` (after `npm run migrate`) automatically.
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    // `npm run start` runs the migrations (prestart) and then serves the
    // standalone production server; `output: standalone` is not served by
    // `next start`.
    command: 'npm run start',
    port: PORT,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_PATH: './e2e-smoke.sqlite',
      SCENARIO_DIR: './scenarios',
      PORT: String(PORT),
      // The standalone server otherwise binds the machine hostname only.
      HOSTNAME: '127.0.0.1',
    },
  },
});
