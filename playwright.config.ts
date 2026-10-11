import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.E2E_PORT ?? 3100);

// The smoke suite runs against a production build with a throwaway database:
// build once with `npm run build`, then `npm run test:e2e` starts
// `npx next start` (after `npm run migrate`) automatically.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    // Start from a throwaway database (this runs before globalSetup would, so
    // the cleanup has to live here). `npm run start` runs the migrations (prestart) and then serves the
    // standalone production server; `output: standalone` is not served by
    // `next start`.
    command: 'rm -f e2e-smoke.sqlite e2e-smoke.sqlite-shm e2e-smoke.sqlite-wal e2e-smoke.sqlite-journal && npm run start',
    port: PORT,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_PATH: path.join(ROOT, 'e2e-smoke.sqlite'),
      SCENARIO_DIR: path.join(ROOT, 'scenarios'),
      PORT: String(PORT),
      // The standalone server otherwise binds the machine hostname only.
      HOSTNAME: '127.0.0.1',
    },
  },
});
