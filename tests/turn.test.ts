// Turn pipeline tests: the Server Action core (executeTurn) against
// in-memory SQLite — double submit, hidden targets, foreign sessions and the
// same-step race (docs/spec/architecture.md, turn atomicity).

import { describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { Scenario } from '../src/content/index';
import { startPlaythrough, type Rng } from '../src/engine/index';
import { executeTurn } from '../src/app/lib/turn';
import {
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
  type NewPlaythrough,
} from '../src/persistence/index';
import { loadCrossroadsScenario } from './fixtures/crossroads';

const rng: Rng = () => 1;
const SESSION = 'session-hash-1';
const OTHER_SESSION = 'session-hash-2';

function loadFixture(): Scenario {
  return loadCrossroadsScenario();
}

async function setupPlaythrough(
  scenario: Scenario,
  sessionId: string,
  id = `pt-${Math.random().toString(36).slice(2)}`,
): Promise<{ db: ReturnType<typeof openDatabase>; playthroughId: string }> {
  const db = openDatabase(':memory:');
  await migrateDatabase(db);
  const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
  if (!started.ok) throw new Error('fixture start failed');
  const input: NewPlaythrough = {
    id,
    sessionId,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    contentHash: scenario.contentHash,
    status: started.state.status,
    step: started.state.step,
    state: started.state,
  };
  await new PlaythroughStore(db).create(
    input,
    started.journal.map((entry) => {
      const { type, lang, ...payload } = entry;
      return { step: 0, type, lang, payload };
    }),
  );
  return { db, playthroughId: id };
}

describe('executeTurn', () => {
  it('travels, marks visited, appends a travel entry and advances step', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario, SESSION);
    try {
      const result = await executeTurn(
        db,
        load,
        playthroughId,
        SESSION,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      );
      expect(result).toEqual({ ok: true, step: 1 });
      const store = new PlaythroughStore(db);
      const stored = await store.findById(playthroughId);
      expect(stored?.state.currentLocationId).toBe('grove');
      expect(stored?.state.visited).toEqual(['glade', 'grove']);
      expect(stored?.step).toBe(1);
      const journal = await store.listJournal(playthroughId);
      expect(journal.map((entry) => entry.type)).toEqual(['intro', 'travel']);
      expect(journal[1]?.step).toBe(1);
    } finally {
      await db.destroy();
    }
  });

  it('applies a double submit once; the second is stale and changes nothing', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario, SESSION);
    try {
      const action = { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 } as const;
      expect(await executeTurn(db, load, playthroughId, SESSION, action, rng)).toEqual({
        ok: true,
        step: 1,
      });
      expect(await executeTurn(db, load, playthroughId, SESSION, action, rng)).toEqual({
        ok: false,
        reason: 'stale',
      });
      const store = new PlaythroughStore(db);
      const stored = await store.findById(playthroughId);
      expect(stored?.step).toBe(1);
      expect(stored?.state.currentLocationId).toBe('grove');
      expect((await store.listJournal(playthroughId)).map((e) => e.type)).toEqual([
        'intro',
        'travel',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('rejects a hidden connection target and changes nothing', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario, SESSION);
    try {
      const result = await executeTurn(
        db,
        load,
        playthroughId,
        SESSION,
        { kind: 'travel', targetLocationId: 'cave', expectedStep: 0 },
        rng,
      );
      expect(result).toEqual({ ok: false, reason: 'illegal' });
      const store = new PlaythroughStore(db);
      expect((await store.findById(playthroughId))?.step).toBe(0);
      expect((await store.listJournal(playthroughId)).map((e) => e.type)).toEqual(['intro']);
    } finally {
      await db.destroy();
    }
  });

  it('answers 404 for another session and changes nothing', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario, SESSION);
    try {
      const result = await executeTurn(
        db,
        load,
        playthroughId,
        OTHER_SESSION,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      );
      expect(result).toEqual({ ok: false, reason: 'not-found' });
      const store = new PlaythroughStore(db);
      expect((await store.findById(playthroughId))?.step).toBe(0);
      expect((await store.listJournal(playthroughId)).map((e) => e.type)).toEqual(['intro']);
    } finally {
      await db.destroy();
    }
  });

  it('lets exactly one of two same-step actions succeed', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario, SESSION);
    try {
      const [first, second] = await Promise.all([
        executeTurn(
          db,
          load,
          playthroughId,
          SESSION,
          { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
          rng,
        ),
        executeTurn(
          db,
          load,
          playthroughId,
          SESSION,
          { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
          rng,
        ),
      ]);
      expect([first, second].filter((r) => r.ok)).toHaveLength(1);
      expect([first, second].filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'stale' }]);
      const store = new PlaythroughStore(db);
      expect((await store.findById(playthroughId))?.step).toBe(1);
      expect((await store.listJournal(playthroughId)).map((e) => e.type)).toEqual([
        'intro',
        'travel',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('rejects travel on an ended playthrough', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const started = startPlaythrough(scenario, 'hunter', 'Robin', rng);
      if (!started.ok) throw new Error('fixture start failed');
      const ended = { ...started.state, status: 'ended' as const, endingId: 'death' };
      await new PlaythroughStore(db).create(
        {
          id: 'pt-ended',
          sessionId: SESSION,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          contentHash: scenario.contentHash,
          status: 'ended',
          endingId: 'death',
          step: 0,
          state: ended,
        },
        [],
      );
      const result = await executeTurn(
        db,
        load,
        'pt-ended',
        SESSION,
        { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
        rng,
      );
      expect(result).toEqual({ ok: false, reason: 'ended' });
    } finally {
      await db.destroy();
    }
  });

  it('rolls back the state update when the journal insert fails', async () => {
    const scenario = loadFixture();
    const load = (id: string): Scenario | undefined => (id === scenario.id ? scenario : undefined);
    const { db, playthroughId } = await setupPlaythrough(scenario, SESSION);
    try {
      // Fail every journal insert from here on; the intro entry is already stored.
      await sql`CREATE TRIGGER inject_journal_failure BEFORE INSERT ON journal_entries BEGIN SELECT RAISE(ABORT, 'injected journal failure'); END;`.execute(
        db,
      );
      await expect(
        executeTurn(
          db,
          load,
          playthroughId,
          SESSION,
          { kind: 'travel', targetLocationId: 'grove', expectedStep: 0 },
          rng,
        ),
      ).rejects.toThrow('injected journal failure');
      const store = new PlaythroughStore(db);
      const stored = await store.findById(playthroughId);
      expect(stored?.step).toBe(0);
      expect(stored?.state.currentLocationId).toBe('glade');
      // Nothing committed: state, pin, status and ending are untouched too.
      expect(stored?.status).toBe('active');
      expect(stored?.endingId).toBeNull();
      expect(stored?.scenarioVersion).toBe(scenario.version);
      expect(stored?.contentHash).toBe(scenario.contentHash);
      expect((await store.listJournal(playthroughId)).map((e) => e.type)).toEqual(['intro']);
    } finally {
      await db.destroy();
    }
  });
});
