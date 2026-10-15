// Arena persistence tests (issue #166): an Arena run is stored outside the
// Playthrough stores, keyed by Session, so a reload resumes the same Combat
// without ever listing the fight among the Session's Playthroughs.

import { describe, expect, it } from 'vitest';
import { startArena, validateArenaSetup, type ArenaState } from '../src/engine/index';
import { ArenaStore, migrateDatabase, openDatabase } from '../src/persistence/index';
import { DEFAULT_ARENA_CHARACTER, buildArenaSetup } from '../src/app/arena/bestiary';

function freshState(): { state: ArenaState; journal: { type: 'arena-start'; opponents: [] }[] } {
  const setup = buildArenaSetup('grey-wolf', 'en');
  if (setup === undefined) throw new Error('expected a setup');
  const validated = validateArenaSetup({
    character: DEFAULT_ARENA_CHARACTER,
    opponents: setup.opponents,
  });
  if (!validated.ok) throw new Error('fixture setup should validate');
  let counter = 1;
  const started = startArena(validated.setup, () => counter++);
  return started as unknown as {
    state: ArenaState;
    journal: { type: 'arena-start'; opponents: [] }[];
  };
}

describe('arena store', () => {
  it('round-trips a run by Session and reports nothing when absent', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const runs = new ArenaStore(db);
      expect(await runs.findBySession('hash-1')).toBeNull();
      const { state, journal } = freshState();
      await runs.replace('hash-1', state, journal);
      const found = await runs.findBySession('hash-1');
      expect(found?.sessionId).toBe('hash-1');
      expect(found?.state).toEqual(state);
      expect(found?.journal).toEqual(journal);
      expect(found?.step).toBe(state.step);
      // Another Session sees nothing: the fight is never listed as a Playthrough.
      expect(await runs.findBySession('hash-2')).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  it('guards a Round commit against a stale step', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const runs = new ArenaStore(db);
      const { state, journal } = freshState();
      await runs.replace('hash-1', state, journal);
      const advanced: ArenaState = { ...state, step: state.step + 1, round: state.round + 1 };
      expect(await runs.commit('hash-1', state.step, advanced, journal)).toBe(true);
      expect(await runs.commit('hash-1', state.step, advanced, journal)).toBe(false);
      expect((await runs.findBySession('hash-1'))?.step).toBe(state.step + 1);
      expect(await runs.commit('missing', 0, advanced, journal)).toBe(false);
    } finally {
      await db.destroy();
    }
  });

  it('clears the run back to the setup', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const runs = new ArenaStore(db);
      const { state, journal } = freshState();
      await runs.replace('hash-1', state, journal);
      await runs.clear('hash-1');
      expect(await runs.findBySession('hash-1')).toBeNull();
    } finally {
      await db.destroy();
    }
  });
});
