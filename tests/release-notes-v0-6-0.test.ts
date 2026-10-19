// R1: the v0.6.0 release notes state the data discard, the Scenario
// directory reset, the backup, deploy, smoke-test and rollback steps, and
// that progress after the release is lost on rollback.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const notes = fs.readFileSync(path.join(testsDir, '..', 'docs', 'releases', 'v0.6.0.md'), 'utf8');

describe('v0.6.0 release notes (R1)', () => {
  it('is titled v0.6.0 and never says "release 1.0"', () => {
    expect(notes).toContain('v0.6.0');
    expect(notes).not.toMatch(/release 1\.0/i);
  });

  it('states the data discard', () => {
    expect(notes).toMatch(/deletes every Playthrough/i);
    expect(notes).toMatch(/Journal/i);
    expect(notes).toMatch(/arena_runs.*arena_setups|drops the `arena_runs`/i);
    expect(notes).toMatch(/sessions/i);
  });

  it('states the Scenario directory reset', () => {
    expect(notes).toMatch(/\/data\/scenarios/);
    expect(notes).toMatch(/re-seed/i);
  });

  it('gives the operator procedure: stop, backup, deploy, smoke test', () => {
    expect(notes).toMatch(/stop the running container/i);
    expect(notes).toMatch(/back up the whole `\/data`/i);
    expect(notes).toMatch(/driving developer pushes the `v0\.6\.0` tag/i);
    expect(notes).toMatch(/smoke-test/i);
  });

  it('gives the restore-then-redeploy rollback and the progress-loss warning', () => {
    expect(notes).toMatch(/restore.*backup|restore-then-redeploy/i);
    expect(notes).toMatch(/workflow_dispatch/);
    expect(notes).toMatch(/v0\.5\.0/);
    expect(notes).toMatch(/everything played after the release is lost/i);
  });
});
