// Combat MVP 1.0 P5a A2/A6: an Arena run persists with origin, setup and
// initial; a reload resumes the same CHOOSE state with the same frozen
// plans; tampered plans read as "cannot be read"; guarded commits make
// stale and double submits change nothing.

import { describe, expect, it } from 'vitest';
import {
  ARENA_PRESETS,
  buildArenaInitial,
  parseArenaRunDocument,
  startCombat,
  submitRound,
  verifyFrozenPlans,
} from '../src/engine/combat/index';
import type { CombatState } from '../src/engine/combat/index';
import { ArenaFightStore, migrateDatabase, openDatabase } from '../src/persistence/index';

async function startedT1(): Promise<{ setup: unknown; initial: CombatState; combat: CombatState }> {
  const setup = JSON.parse(JSON.stringify(ARENA_PRESETS['T1'])) as unknown;
  const initial = buildArenaInitial(ARENA_PRESETS['T1']!);
  const started = startCombat(initial);
  if (!started.ok) throw new Error('preset T1 must start');
  return { setup, initial: initial as CombatState, combat: started.state };
}

describe('ArenaFightStore (A2)', () => {
  it('persists origin, setup and initial and resumes the same CHOOSE with the same plans', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const { setup, initial, combat } = await startedT1();
      const stored = await fights.start('session-1', {
        origin: 'setup',
        setup,
        initial,
        combat,
      });
      expect(stored.origin).toBe('setup');
      expect(stored.setup).toEqual(setup);
      expect(stored.initial).toEqual(initial);

      const read = await fights.read('session-1');
      expect(read.status).toBe('ready');
      if (read.status !== 'ready') return;
      expect(read.fight.combat).toEqual(combat);
      expect(read.fight.combat.frozenEnemyPlans).toEqual(combat.frozenEnemyPlans);
      expect(verifyFrozenPlans(read.fight.combat)).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  it('reads tampered frozen plans as unreadable and never repairs the row', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const { setup, initial, combat } = await startedT1();
      await fights.start('session-1', { origin: 'setup', setup, initial, combat });

      const tampered: CombatState = JSON.parse(JSON.stringify(combat)) as CombatState;
      tampered.frozenEnemyPlans[0] = {
        ...tampered.frozenEnemyPlans[0]!,
        actionId: 'brace',
      };
      const raw = await db.selectFrom('arena_fights').selectAll().where('session_id', '=', 'session-1').executeTakeFirstOrThrow();
      const document = JSON.parse(raw.state as string) as { combat: CombatState } & Record<string, unknown>;
      document.combat = tampered;
      await db
        .updateTable('arena_fights')
        .set({ state: JSON.stringify(document) })
        .where('session_id', '=', 'session-1')
        .execute();

      const read = await fights.read('session-1');
      expect(read.status).toBe('unreadable');
      if (read.status !== 'unreadable') return;
      expect(read.issues).toContainEqual({ code: 'bad_frozen_plans' });

      // The row is left alone for a user-initiated start to replace.
      const again = await fights.read('session-1');
      expect(again.status).toBe('unreadable');
      // A direct recomputation check agrees with the store read.
      const direct = parseArenaRunDocument(document, {
        verifyFrozenPlans: (state) => verifyFrozenPlans(state).length === 0,
      });
      expect(direct.ok).toBe(false);
    } finally {
      await db.destroy();
    }
  });

  it('reads a wrong rulesVersion as unreadable', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const { setup, initial, combat } = await startedT1();
      await fights.start('session-1', { origin: 'setup', setup, initial, combat });
      const raw = await db.selectFrom('arena_fights').selectAll().where('session_id', '=', 'session-1').executeTakeFirstOrThrow();
      const document = JSON.parse(raw.state as string) as Record<string, unknown>;
      (document['combat'] as Record<string, unknown>)['rulesVersion'] = 'no-such-rules';
      await db
        .updateTable('arena_fights')
        .set({ state: JSON.stringify(document) })
        .where('session_id', '=', 'session-1')
        .execute();
      expect(await fights.read('session-1')).toMatchObject({ status: 'unreadable' });
    } finally {
      await db.destroy();
    }
  });
});

describe('ArenaFightStore step guards (A6)', () => {
  it('rejects a stale expectedStep and leaves state and step unchanged', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const { setup, initial, combat } = await startedT1();
      const stored = await fights.start('session-1', { origin: 'setup', setup, initial, combat });

      const submitted = submitRound(combat, { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      expect(await fights.commit('session-1', stored.step + 100, submitted.state)).toBe(false);
      const read = await fights.read('session-1');
      expect(read.status).toBe('ready');
      if (read.status !== 'ready') return;
      expect(read.fight.step).toBe(stored.step);
      expect(read.fight.combat).toEqual(combat);
    } finally {
      await db.destroy();
    }
  });

  it('commits once: a double submit with the same expectedStep applies nothing twice', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const { setup, initial, combat } = await startedT1();
      const stored = await fights.start('session-1', { origin: 'setup', setup, initial, combat });

      const submitted = submitRound(combat, { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      expect(await fights.commit('session-1', stored.step, submitted.state)).toBe(true);
      // The loser of the race retries with the same expectedStep: rejected.
      expect(await fights.commit('session-1', stored.step, submitted.state)).toBe(false);
      const read = await fights.read('session-1');
      expect(read.status).toBe('ready');
      if (read.status !== 'ready') return;
      expect(read.fight.step).toBe(stored.step + 1);
      expect(read.fight.combat).toEqual(submitted.state);
    } finally {
      await db.destroy();
    }
  });

  it('allocates a higher step across replacement and clear, so old tabs never match', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const { setup, initial, combat } = await startedT1();
      const first = await fights.start('session-1', { origin: 'setup', setup, initial, combat });
      const second = await fights.start('session-1', { origin: 'setup', setup, initial, combat });
      expect(second.step).toBeGreaterThan(first.step);
      await fights.clear('session-1');
      expect(await fights.read('session-1')).toMatchObject({ status: 'missing' });
      const third = await fights.start('session-1', { origin: 'setup', setup, initial, combat });
      expect(third.step).toBeGreaterThan(second.step);
      // The remembered Setup survives the clear for Fight again.
      expect(await fights.readSetup('session-1')).toEqual(setup);
    } finally {
      await db.destroy();
    }
  });
});
