// Read-layer seam: the store returns raw state, validation lives in the
// Scenario-aware layer (src/app/lib/playthrough.ts + turn path). Missing
// Scenarios and invalid documents never trigger a state write and never block
// Journal access; every state read goes through the layer.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '../src/content/index';
import { startPlaythrough, type Rng } from '../src/engine/index';
import type { PlaythroughState } from '../src/engine/state';
import {
  listSessionPlaythroughs,
  resolvePlaythrough,
  safeCharacterName,
  validateStoredState,
} from '../src/app/lib/playthrough';
import { executeTurn } from '../src/app/lib/turn';
import {
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
} from '../src/persistence/index';
import { loadCrossroadsScenario } from './fixtures/crossroads';

const rng: Rng = () => 1;
const SESSION = 'session-read-layer';

function loadFixture(): Scenario {
  return loadCrossroadsScenario();
}

async function setupValid(scenario: Scenario, id: string, sessionId = SESSION) {
  const db = openDatabase(':memory:');
  await migrateDatabase(db);
  const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
  if (!started.ok) throw new Error('fixture start failed');
  await new PlaythroughStore(db).create(
    {
      id,
      sessionId,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      contentHash: scenario.contentHash,
      status: started.state.status,
      step: started.state.step,
      state: started.state,
    },
    started.journal.map((entry) => {
      const { type, lang, ...payload } = entry;
      return { step: 0, type, lang, payload };
    }),
  );
  return db;
}

async function insertRaw(
  db: ReturnType<typeof openDatabase>,
  id: string,
  rawState: unknown,
  journal: { step: number; type: string; lang: string; payload: unknown }[] = [],
) {
  const scenario = loadFixture();
  await new PlaythroughStore(db).create(
    {
      id,
      sessionId: SESSION,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      contentHash: scenario.contentHash,
      status: 'active',
      step: 0,
      // Bypass the typed writer to simulate a stored document that fails
      // validation: the column holds whatever bytes were written.
      state: rawState as PlaythroughState,
    },
    journal,
  );
  // Overwrite with the exact raw bytes when the raw value is not a valid
  // state (create stringifies whatever it is given, which is what we want).
  if (validateStoredState(rawState) === undefined) {
    await db
      .updateTable('playthroughs')
      .set({ state: JSON.stringify(rawState) })
      .where('id', '=', id)
      .execute();
  }
}

async function rawStateText(db: ReturnType<typeof openDatabase>, id: string) {
  const row = await db
    .selectFrom('playthroughs')
    .select(['state'])
    .where('id', '=', id)
    .executeTakeFirst();
  return row?.state;
}

describe('store returns raw state', () => {
  it('findById and listBySession do not validate', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      await insertRaw(db, 'pt-raw', { bogus: true });
      const store = new PlaythroughStore(db);
      const found = await store.findById('pt-raw');
      expect(found).not.toBeNull();
      expect(found?.state).toEqual({ bogus: true });
      expect(validateStoredState(found?.state)).toBeUndefined();
      const listed = await store.listBySession(SESSION);
      expect(listed.map((p) => p.id)).toContain('pt-raw');
      expect(listed.find((p) => p.id === 'pt-raw')?.state).toEqual({ bogus: true });
    } finally {
      await db.destroy();
    }
  });
});

describe('invalid stored state', () => {
  it('fails validation without being rewritten and without blocking the Journal', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined =>
      id === scenario.id ? scenario : undefined;
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      await insertRaw(
        db,
        'pt-invalid',
        { bogus: true },
        [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'You wake.' } }],
      );
      const before = await rawStateText(db, 'pt-invalid');
      const resolved = await resolvePlaythrough(db, load, 'pt-invalid', SESSION);
      expect(resolved?.compatible).toBe(false);
      if (resolved && !resolved.compatible) {
        expect(resolved.parsed).toBeUndefined();
      }
      // No rewrite of the invalid bytes.
      expect(await rawStateText(db, 'pt-invalid')).toBe(before);
      // Journal stays readable.
      const journal = await new PlaythroughStore(db).listJournal('pt-invalid');
      expect(journal.map((e) => e.type)).toEqual(['intro']);
      // Safe name never crashes.
      expect(safeCharacterName((resolved as { playthrough: { state: unknown } }).playthrough.state, 'fallback')).toBe(
        'fallback',
      );
      // The action path rejects without writing.
      const turned = await executeTurn(
        db,
        load,
        'pt-invalid',
        SESSION,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      );
      expect(turned).toEqual({ ok: false, reason: 'incompatible' });
      expect(await rawStateText(db, 'pt-invalid')).toBe(before);
      expect((await new PlaythroughStore(db).listJournal('pt-invalid')).map((e) => e.type)).toEqual([
        'intro',
      ]);
    } finally {
      await db.destroy();
    }
  });
});

describe('missing Scenario', () => {
  it('performs no state write while the Journal stays readable', async () => {
    const scenario = loadFixture();
    const db = await setupValid(scenario, 'pt-gone');
    try {
      const store = new PlaythroughStore(db);
      const before = await rawStateText(db, 'pt-gone');
      const resolved = await resolvePlaythrough(db, () => undefined, 'pt-gone', SESSION);
      expect(resolved?.compatible).toBe(false);
      if (resolved && !resolved.compatible) expect(resolved.scenario).toBeUndefined();
      expect(await rawStateText(db, 'pt-gone')).toBe(before);
      expect((await store.listJournal('pt-gone')).map((e) => e.type)).toContain('intro');
      const turned = await executeTurn(
        db,
        () => undefined,
        'pt-gone',
        SESSION,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      );
      expect(turned).toEqual({ ok: false, reason: 'incompatible' });
      expect(await rawStateText(db, 'pt-gone')).toBe(before);
      // The list entry is viewable, never resumable, and never crashes.
      const entries = await listSessionPlaythroughs(db, () => undefined, SESSION);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.compatible).toBe(false);
    } finally {
      await db.destroy();
    }
  });
});

describe('session list goes through the read layer', () => {
  it('resolves every entry and keeps invalid documents viewable', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined =>
      id === scenario.id ? scenario : undefined;
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
      if (!started.ok) throw new Error('fixture start failed');
      const store = new PlaythroughStore(db);
      await store.create(
        {
          id: 'pt-good',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          contentHash: scenario.contentHash,
          status: started.state.status,
          step: started.state.step,
          state: started.state,
        },
        [],
      );
      await insertRaw(db, 'pt-bad', { bogus: true });
      const entries = await listSessionPlaythroughs(db, load, SESSION);
      expect(entries).toHaveLength(2);
      const good = entries.find((e) => e.playthrough.id === 'pt-good');
      const bad = entries.find((e) => e.playthrough.id === 'pt-bad');
      expect(good?.compatible).toBe(true);
      expect(bad?.compatible).toBe(false);
    } finally {
      await db.destroy();
    }
  });
});

describe('state-read boundary', () => {
  it('only the Scenario-aware layer reads raw state by id or by session', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const allowed = new Set([
      path.join('src', 'app', 'lib', 'playthrough.ts'),
      path.join('src', 'app', 'lib', 'turn.ts'),
    ]);
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const rel = path.relative(repoRoot, full);
        if (rel.startsWith(path.join('src', 'persistence'))) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/\.findById\(|\.listBySession\(/.test(text) && !allowed.has(rel)) {
          offenders.push(rel);
        }
      }
    };
    walk(path.join(repoRoot, 'src'));
    expect(offenders).toEqual([]);
  });
});
