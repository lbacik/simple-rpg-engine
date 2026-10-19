// S5 (new documents): state, `step`, status, Ending and new Journal entries
// still commit atomically for Combat MVP 1.0 v3 documents: exactly one of two
// same-step writers wins with only its Journal entries, and a Journal failure
// rolls the state swap back with it.

import { describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { PLAYTHROUGH_SCHEMA_VERSION } from '../src/engine/state-v3';
import type { PlaythroughV3 } from '../src/engine/state-v3';
import { migrateDatabase, openDatabase, PlaythroughStore } from '../src/persistence/index';

const SESSION = 'session-v3-atomic';

function makeV3(overrides: Partial<Record<string, unknown>> = {}): PlaythroughV3 {
  return {
    schemaVersion: PLAYTHROUGH_SCHEMA_VERSION,
    scenarioId: 'crossroads',
    scenarioVersion: '1.0.0',
    contentHash: 'hash-v3',
    status: 'active',
    step: 0,
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 1, agility: 3, wits: 2, presence: 0 },
      health: 40,
    },
    inventory: { sword: 1 },
    equipment: { weapon: 'sword' },
    companion: null,
    lostCompanions: [],
    currentLocationId: 'glade',
    activeSceneId: null,
    activeCombat: null,
    visited: ['glade'],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounters: {},
    ...overrides,
  } as PlaythroughV3;
}

async function setupV3(id: string) {
  const db = openDatabase(':memory:');
  await migrateDatabase(db);
  await new PlaythroughStore(db).create(
    {
      id,
      sessionId: SESSION,
      scenarioId: 'crossroads',
      scenarioVersion: '1.0.0',
      contentHash: 'hash-v3',
      status: 'active',
      step: 0,
      state: makeV3(),
    },
    [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'You wake.' } }],
  );
  return db;
}

describe('v3 turn atomicity', () => {
  it('lets exactly one of two same-step v3 writers win, with only its Journal', async () => {
    const db = await setupV3('pt-v3-race');
    try {
      const store = new PlaythroughStore(db);
      const next = (health: number): PlaythroughV3 => makeV3({ step: 1, character: { templateId: 'hunter', name: 'Robin', baseAttributes: { might: 1, agility: 3, wits: 2, presence: 0 }, health } });
      const [first, second] = await Promise.all([
        store.commitTurn(
          'pt-v3-race',
          0,
          { state: next(39), step: 1, status: 'active' },
          [{ step: 1, type: 'travel', lang: 'en', payload: { to: 'grove' } }],
        ),
        store.commitTurn(
          'pt-v3-race',
          0,
          { state: next(38), step: 1, status: 'active' },
          [{ step: 1, type: 'travel', lang: 'en', payload: { to: 'cave' } }],
        ),
      ]);
      expect([first, second].filter(Boolean)).toHaveLength(1);
      const stored = await store.findById('pt-v3-race');
      expect(stored?.step).toBe(1);
      expect((stored?.state as PlaythroughV3).schemaVersion).toBe(3);
      const journal = await store.listJournal('pt-v3-race');
      expect(journal.map((e) => e.type)).toEqual(['intro', 'travel']);
    } finally {
      await db.destroy();
    }
  });

  it('rolls back a v3 state swap when the journal insert fails', async () => {
    const db = await setupV3('pt-v3-rollback');
    try {
      const store = new PlaythroughStore(db);
      await sql`CREATE TRIGGER inject_journal_failure BEFORE INSERT ON journal_entries BEGIN SELECT RAISE(ABORT, 'injected journal failure'); END;`.execute(
        db,
      );
      await expect(
        store.commitTurn(
          'pt-v3-rollback',
          0,
          { state: makeV3({ step: 1, status: 'ended', endingId: 'death' }), step: 1, status: 'ended', endingId: 'death' },
          [{ step: 1, type: 'ending', lang: 'en', payload: { ending: 'death' } }],
        ),
      ).rejects.toThrow('injected journal failure');
      const stored = await store.findById('pt-v3-rollback');
      // Nothing committed: state, pin, status and ending are untouched too.
      expect(stored?.step).toBe(0);
      expect((stored?.state as PlaythroughV3).status).toBe('active');
      expect(stored?.status).toBe('active');
      expect(stored?.endingId).toBeNull();
      expect(stored?.scenarioVersion).toBe('1.0.0');
      expect(stored?.contentHash).toBe('hash-v3');
      expect((await store.listJournal('pt-v3-rollback')).map((e) => e.type)).toEqual(['intro']);
    } finally {
      await db.destroy();
    }
  });
});
