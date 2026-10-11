// CLI tests: output format, summary line, --json and exit codes.
// See docs/spec/validation.md ("CLI").

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../src/content/index';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');

function runValidate(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'src/cli/validate.ts', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120_000,
    });
    return { stdout, status: 0 };
  } catch (error) {
    const failure = error as { status?: unknown; stdout?: unknown };
    return {
      stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
      status: typeof failure.status === 'number' ? failure.status : 1,
    };
  }
}

function makeInvalidPackage(): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-cli-')), 'cli-invalid');
  fs.mkdirSync(dir, { recursive: true });
  const id = path.basename(dir);
  fs.writeFileSync(
    path.join(dir, 'scenario.yaml'),
    `schemaVersion: 1\nid: ${id}\nlocations:\n  - locations/ghost.yaml\ntemplates:\n  - templates.yaml\nendings:\n  - endings.yaml\n`,
  );
  fs.writeFileSync(path.join(dir, 'templates.yaml'), '- id: t\n');
  fs.writeFileSync(path.join(dir, 'endings.yaml'), '- id: e\n');
  return dir;
}

describe('validate CLI', () => {
  it('exits 0 with a summary line for a clean Scenario', () => {
    const { stdout, status } = runValidate([path.join(repoRoot, 'scenarios', 'whispering-woods')]);
    expect(status).toBe(0);
    expect(stdout).toBe('0 errors, 0 warnings\n');
  });

  it('prints clickable file:line:column lines and exits 1 on errors', () => {
    const dir = makeInvalidPackage();
    const { stdout, status } = runValidate([dir]);
    expect(status).toBe(1);
    expect(stdout).toBe(
      `${dir}/scenario.yaml:4:5 error package/missing-file: listed file "locations/ghost.yaml" is missing or unreadable\n1 error, 0 warnings\n`,
    );
  });

  it('--json prints the raw Diagnostic array', () => {
    const dir = makeInvalidPackage();
    const { stdout, status } = runValidate([dir, '--json']);
    expect(status).toBe(1);
    const diagnostics = JSON.parse(stdout) as Diagnostic[];
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'package/missing-file',
      file: 'scenario.yaml',
      range: { line: 4, column: 5, endLine: 4, endColumn: 25 },
    });
  });

  it('exits 0 with --json for a clean Scenario', () => {
    const { stdout, status } = runValidate([
      '--json',
      path.join(repoRoot, 'scenarios', 'whispering-woods'),
    ]);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual([]);
  });
});
