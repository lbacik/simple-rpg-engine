// Persistence port tests against in-memory SQLite, including the step-race.

import { describe, expect, it } from 'vitest';
import {
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
  SessionStore,
} from '../src/persistence/index';
import { STATE_VERSION, type PlaythroughState } from '../src/engine/state';

function makeState(overrides: Partial<PlaythroughState> = {}): PlaythroughState {
  return {
    stateVersion: STATE_VERSION,
    scenarioId: 'meadow',
    scenarioVersion: '1.0.0',
    contentHash: 'abc',
    status: 'active',
    step: 0,
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 1, agility: 3, wits: 2, presence: 0 },
      health: 12,
    },
    inventory: { sword: 1 },
    equipment: { weapon: 'sword' },
    currentLocationId: 'glade',
    activeSceneId: null,
    activeCombat: null,
    visited: ['glade'],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounterDamage: {},
    ...overrides,
  };
}

describe('persistence ports', () => {
  it('creates, reads, lists and paginates the journal', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const playthroughs = new PlaythroughStore(db);
      const sessions = new SessionStore(db);

      await sessions.touch('hash-1');
      expect(await sessions.findByHash('hash-1')).not.toBeNull();

      const state = makeState();
      const created = await playthroughs.create(
        {
          id: 'pt-1',
          sessionId: 'hash-1',
          scenarioId: 'meadow',
          scenarioVersion: '1.0.0',
          contentHash: 'abc',
          status: 'active',
          step: 0,
          state,
        },
        [{ step: 0, type: 'intro', lang: 'en', payload: { text: 'You wake.' } }],
      );
      expect(created.state).toEqual(state);

      const found = await playthroughs.findById('pt-1');
      expect(found?.sessionId).toBe('hash-1');

      expect(await playthroughs.findById('missing')).toBeNull();

      const listed = await playthroughs.listBySession('hash-1');
      expect(listed.map((p) => p.id)).toEqual(['pt-1']);
      expect(await playthroughs.listBySession('other')).toEqual([]);

      await playthroughs.appendJournal('pt-1', [
        { step: 0, type: 'travel', lang: 'en', payload: { to: 'glade' } },
      ]);
      const journal = await playthroughs.listJournal('pt-1');
      expect(journal.map((e) => [e.seq, e.type])).toEqual([
        [1, 'intro'],
        [2, 'travel'],
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('lets exactly one of two same-step writers win', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const playthroughs = new PlaythroughStore(db);
      const state = makeState();
      await playthroughs.create(
        {
          id: 'pt-race',
          sessionId: 'hash-1',
          scenarioId: 'meadow',
          scenarioVersion: '1.0.0',
          contentHash: 'abc',
          status: 'active',
          step: 0,
          state,
        },
        [],
      );
      const next = (health: number): PlaythroughState => makeState({ step: 1, character: { ...state.character, health } });
      const [first, second] = await Promise.all([
        playthroughs.updateIfStepMatches('pt-race', 0, { state: next(11), step: 1, status: 'active' }),
        playthroughs.updateIfStepMatches('pt-race', 0, { state: next(10), step: 1, status: 'active' }),
      ]);
      expect([first, second].filter(Boolean)).toHaveLength(1);
      const stored = await playthroughs.findById('pt-race');
      expect(stored?.step).toBe(1);
    } finally {
      await db.destroy();
    }
  });
});
