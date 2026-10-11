// Import-boundary tests: engine and content modules must not import Next.js,
// React or persistence (see docs/spec/architecture.md). The rule itself lives
// in eslint.config.mjs; these tests prove it fires.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');

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

describe('import boundaries', () => {
  it('fails lint for next/react imports in content and persistence imports in engine', () => {
    const contentProbe = path.join(repoRoot, 'src', 'content', '__boundary-probe.ts');
    const engineProbe = path.join(repoRoot, 'src', 'engine', '__boundary-probe.ts');
    fs.writeFileSync(contentProbe, "import 'next/router';\nimport 'react';\nexport const probe = 1;\n");
    fs.writeFileSync(
      engineProbe,
      "import * as persistence from '../persistence/index';\nexport const probe = persistence;\n",
    );
    try {
      const { stdout, status } = runEslint([contentProbe, engineProbe]);
      expect(status).not.toBe(0);
      expect(stdout).toContain('no-restricted-imports');
      expect(stdout).toContain('__boundary-probe');
    } finally {
      fs.rmSync(contentProbe, { force: true });
      fs.rmSync(engineProbe, { force: true });
    }
  });
});
