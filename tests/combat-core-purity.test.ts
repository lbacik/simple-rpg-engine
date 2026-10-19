// P1a K4: the core performs no IO, reads no Date, takes no randomness
// and holds no catalogue imports. The rules live in eslint.config.mjs;
// these tests prove the rules fire and the core itself passes.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');
const combatDir = path.join(repoRoot, 'src', 'engine', 'combat');

function runEslint(files: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('npx', ['eslint', ...files], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 180_000,
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

describe('combat core purity', () => {
  it('holds no Date, randomness, IO or catalogue references in source', () => {
    const forbidden = [
      /\bnew Date\s*\(/,
      /\bDate\s*\.\s*(now|parse|UTC)/,
      /\bMath\s*\.\s*random\s*\(/,
      /\bconsole\s*\./,
      /\bprocess\s*\./,
      /\bfrom\s+['"]node:/,
      /\bfrom\s+['"]\.\.\/(i18n|content|persistence)\//,
      /\bfetch\s*\(/,
    ];
    for (const file of fs.readdirSync(combatDir)) {
      if (!file.endsWith('.ts')) continue;
      const source = fs.readFileSync(path.join(combatDir, file), 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('passes lint as a whole', () => {
    const files = fs
      .readdirSync(combatDir)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => path.join(combatDir, file));
    const { status, stdout } = runEslint(files);
    expect(`${stdout}`).not.toContain('error');
    expect(status).toBe(0);
  });

  it('fails lint for Date, randomness, console, IO and catalogue probes', () => {
    const probes: Array<[string, string]> = [
      ['__purity-date-probe.ts', 'export const now = Date.now();\n'],
      ['__purity-random-probe.ts', 'export const roll = Math.random();\n'],
      ['__purity-console-probe.ts', 'console.log("probe");\nexport const probe = 1;\n'],
      ['__purity-io-probe.ts', "import fs from 'node:fs';\nexport const probe = fs;\n"],
      ['__purity-catalogue-probe.ts', "import '../i18n/index';\nexport const probe = 1;\n"],
    ];
    const paths = probes.map(([name, source]) => {
      const full = path.join(combatDir, name);
      fs.writeFileSync(full, source);
      return full;
    });
    try {
      const { stdout, status } = runEslint(paths);
      expect(status).not.toBe(0);
      for (const full of paths) expect(stdout).toContain(path.basename(full));
      expect(stdout).toContain('no-restricted-globals');
      expect(stdout).toContain('no-restricted-properties');
      expect(stdout).toContain('no-console');
      expect(stdout).toContain('no-restricted-imports');
    } finally {
      for (const full of paths) fs.rmSync(full, { force: true });
    }
  });
});
