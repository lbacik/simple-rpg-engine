import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.E2E_PORT ?? 3100);

// The language suite (tests/e2e/scenario-languages.spec.ts) needs the shipped
// Scenarios plus both Translation fixtures, with stara-studnia carrying no
// `en` Translation so it falls back to its Polish base under `en`
// (docs/spec/architecture.md, testing strategy). Every spec shares one
// webServer, so the temporary directory is built here at load — the webServer
// starts before a globalSetup would — and pointed at for ALL specs. The
// language suite asserts the full E2E collection lists (shipped Scenarios
// plus the Translation and tactical-pair fixtures), so adding or removing a
// fixture directory here means updating its expectations.
//
// The directory is unique per config-loading process (`process.pid`): every
// Playwright worker loads this config in its own process, and two workers
// rebuilding one shared directory race — one worker's cleanup deletes the
// other's half-copied tree and the copy fails with ENOENT. Every copy holds
// identical content, so sharing the single webServer across workers stays
// correct whichever copy it serves.
function pruneStaleE2EScenarioDirs(): void {
  const e2eDir = path.join(ROOT, 'tests', 'e2e');
  for (const entry of fs.readdirSync(e2eDir)) {
    const pidMatch = /^\.tmp-scenarios-(\d+)$/.exec(entry);
    if (pidMatch !== null) {
      let alive = true;
      try {
        process.kill(Number(pidMatch[1]), 0);
      } catch {
        alive = false;
      }
      if (!alive) fs.rmSync(path.join(e2eDir, entry), { recursive: true, force: true });
      continue;
    }
    // The pre-pid shared name from before the per-process split: no current
    // config version writes it, so it is always safe to drop.
    if (entry === '.tmp-scenarios') {
      fs.rmSync(path.join(e2eDir, entry), { recursive: true, force: true });
    }
  }
}

function buildE2EScenarioDir(): string {
  pruneStaleE2EScenarioDirs();
  const tmp = path.join(ROOT, 'tests', 'e2e', `.tmp-scenarios-${process.pid}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  for (const name of fs.readdirSync(path.join(ROOT, 'scenarios'))) {
    fs.cpSync(path.join(ROOT, 'scenarios', name), path.join(tmp, name), { recursive: true });
  }
  fs.cpSync(path.join(ROOT, 'tests', 'fixtures', 'scenarios', 'two-bridges'), path.join(tmp, 'two-bridges'), {
    recursive: true,
  });
  // The tactical pair fixture (tests/fixtures/scenarios/tactical-pairs): the
  // two-Grey-Wolf Encounter the tactical Combat E2E reaches through the
  // test-only entry path. A test/loader fixture only, never shipped.
  fs.cpSync(
    path.join(ROOT, 'tests', 'fixtures', 'scenarios', 'tactical-pairs'),
    path.join(tmp, 'tactical-pairs'),
    { recursive: true },
  );
  const staraSource = path.join(ROOT, 'tests', 'fixtures', 'scenarios', 'stara-studnia');
  const staraDest = path.join(tmp, 'stara-studnia');
  fs.cpSync(staraSource, staraDest, {
    recursive: true,
    // Without its `en` Translation the Scenario falls back to Polish under `en`.
    filter: (source) => !source.startsWith(path.join(staraSource, 'translations', 'en')),
  });
  // Dropping the directory alone would leave a dangling manifest entry (a
  // missing-file error, tagged on the rejected Translation). Strip the entry
  // so the copy loads with no diagnostics at all.
  const manifestPath = path.join(staraDest, 'scenario.yaml');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const stripped = manifest.replace(/\ntranslations:\n {2}- translations\/en\/translation\.yaml\n/, '\n');
  if (stripped === manifest) {
    throw new Error('stara-studnia fixture manifest no longer lists only translations/en/translation.yaml');
  }
  fs.writeFileSync(manifestPath, stripped);
  return tmp;
}

const SCENARIO_DIR = buildE2EScenarioDir();

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
      SCENARIO_DIR,
      PORT: String(PORT),
      // The standalone server otherwise binds the machine hostname only.
      HOSTNAME: '127.0.0.1',
      // Unlock the test-only tactical entry path (`/test-tactical`), which
      // seeds real pair-Combat and legacy saves for the tactical E2E. Set
      // only for the throwaway E2E server, never in production.
      E2E_TEST_ROUTES: '1',
    },
  },
});
