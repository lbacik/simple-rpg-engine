// Scenario asset route (docs/spec/architecture.md, scenario assets): only the
// Route Handler `/scenarios/[scenarioId]/assets/[hash]/[...path]` serves
// declared image paths, read from the Scenario directory, when the hash
// matches the registry entry. Anything else is a 404, with immutable caching
// headers on success and no Session required.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAllScenarios } from '../src/content/registry';
import { GET } from '../src/app/scenarios/[scenarioId]/assets/[hash]/[...path]/route';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function get(params: { scenarioId: string; hash: string; path: string[] }): Promise<Response> {
  return GET(new Request('http://localhost/'), { params: Promise.resolve(params) });
}

beforeAll(() => {
  loadAllScenarios(path.join(repoRoot, 'scenarios'));
});

describe('scenario asset route', () => {
  it('serves a declared path with the right hash and the specified headers', async () => {
    const registry = loadAllScenarios(path.join(repoRoot, 'scenarios'));
    const scenario = registry.get('whispering-woods');
    expect(scenario).toBeDefined();
    const image = scenario?.imagesById['chapel-altar'];
    expect(image).toBeDefined();
    const response = await get({
      scenarioId: 'whispering-woods',
      hash: image?.hash ?? '',
      path: ['images', 'chapel-altar.png'],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    const expected = fs.readFileSync(
      path.join(repoRoot, 'scenarios', 'whispering-woods', 'images', 'chapel-altar.png'),
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
  });

  it('returns 404 for a wrong hash, an undeclared path, a `..` path or an unknown Scenario', async () => {
    const wrongHash = await get({
      scenarioId: 'whispering-woods',
      hash: '0'.repeat(64),
      path: ['images', 'chapel-altar.png'],
    });
    expect(wrongHash.status).toBe(404);
    const undeclared = await get({
      scenarioId: 'whispering-woods',
      hash: '0'.repeat(64),
      path: ['scenario.yaml'],
    });
    expect(undeclared.status).toBe(404);
    const traversal = await get({
      scenarioId: 'whispering-woods',
      hash: '0'.repeat(64),
      path: ['..', 'scenario.yaml'],
    });
    expect(traversal.status).toBe(404);
    const unknown = await get({
      scenarioId: 'no-such-scenario',
      hash: '0'.repeat(64),
      path: ['images', 'chapel-altar.png'],
    });
    expect(unknown.status).toBe(404);
  });

  it('returns 404 when the image file is deleted after startup', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-assets-'));
    fs.cpSync(path.join(repoRoot, 'scenarios', 'whispering-woods'), path.join(root, 'whispering-woods'), {
      recursive: true,
    });
    try {
      const registry = loadAllScenarios(root);
      const image = registry.get('whispering-woods')?.imagesById['chapel-altar'];
      expect(image).toBeDefined();
      fs.rmSync(path.join(root, 'whispering-woods', 'images', 'chapel-altar.png'));
      const response = await get({
        scenarioId: 'whispering-woods',
        hash: image?.hash ?? '',
        path: ['images', 'chapel-altar.png'],
      });
      expect(response.status).toBe(404);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      loadAllScenarios(path.join(repoRoot, 'scenarios'));
    }
  });
});
