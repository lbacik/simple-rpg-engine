// Arena fight persistence (Combat MVP 1.0, package P2): one versioned run
// per Session in `arena_fights`, with the remembered Setup and the monotonic
// step clock in `arena_remembered_setups`.
//
// S2: rows carry the Arena run v1 document (`schemaVersion: 1`, never
// `stateVersion`); a malformed row, an unknown `schemaVersion` or a wrong
// `rulesVersion` reads as "cannot be read" without rewriting the row, which a
// user-initiated start or import alone replaces. S3: every write is guarded
// by `WHERE step = expected`, and the `step` is monotonic per Session across
// start, rematch, restart and import.

import { describe, expect, it } from 'vitest';

import { ARENA_RUN_SCHEMA_VERSION } from '../src/engine/combat/index';
import type { CombatState } from '../src/engine/combat/index';
import { ArenaFightStore, migrateDatabase, openDatabase } from '../src/persistence/index';
import { duelChooseState, duelPlanState } from './combat-core-fixtures';

const SETUP = { opponents: [{ profileId: 'brute', startingGroup: 'g0', engagedWithHero: true }] };

function chooseCombat(): CombatState {
  return structuredClone(duelChooseState());
}

async function rawStateText(db: ReturnType<typeof openDatabase>, sessionId: string) {
  const row = await db
    .selectFrom('arena_fights')
    .select(['state'])
    .where('session_id', '=', sessionId)
    .executeTakeFirst();
  return row?.state;
}

describe('arena fight store', () => {
  it('reports missing when no fight was started', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      expect(await new ArenaFightStore(db).read('hash-1')).toEqual({ status: 'missing' });
    } finally {
      await db.destroy();
    }
  });

  it('starts a versioned run and reads it back', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      expect(ARENA_RUN_SCHEMA_VERSION).toBe(1);
      const started = await fights.start('hash-1', {
        origin: 'setup',
        setup: SETUP,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      expect(started.step).toBe(1);
      expect(started.origin).toBe('setup');
      expect(started.setup).toEqual(SETUP);
      expect(started.combat.phase).toBe('CHOOSE');
      const read = await fights.read('hash-1');
      expect(read).toEqual({ status: 'ready', fight: { ...started, createdAt: started.createdAt, updatedAt: started.updatedAt } });
      // The stored document carries schemaVersion 1, never stateVersion.
      const text = await rawStateText(db, 'hash-1');
      expect(text).toContain('"schemaVersion":1');
      expect(text).not.toContain('stateVersion');
      // Another Session sees nothing.
      expect(await fights.read('hash-2')).toEqual({ status: 'missing' });
    } finally {
      await db.destroy();
    }
  });

  it('keeps the step monotonic across start, commit, rematch, clear, import and restart', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const seen: number[] = [];

      const first = await fights.start('hash-1', {
        origin: 'setup',
        setup: SETUP,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      seen.push(first.step);

      // One accepted Round advances the step once.
      expect(await fights.commit('hash-1', first.step, { ...chooseCombat(), round: 2 })).toBe(true);
      const afterCommit = await fights.read('hash-1');
      expect(afterCommit.status).toBe('ready');
      if (afterCommit.status === 'ready') {
        seen.push(afterCommit.fight.step);
        expect(afterCommit.fight.combat.round).toBe(2);
      }

      // A rematch (fresh start from the remembered Setup) beats every old step.
      const rematch = await fights.start('hash-1', {
        origin: 'setup',
        setup: SETUP,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      seen.push(rematch.step);

      // Clearing the fight keeps the clock: the import after it moves forward.
      await fights.clear('hash-1');
      expect(await fights.read('hash-1')).toEqual({ status: 'missing' });
      const imported = await fights.start('hash-1', {
        origin: 'import',
        setup: null,
        initial: null,
        combat: chooseCombat(),
      });
      expect(imported.origin).toBe('import');
      seen.push(imported.step);

      // A restart (back to the initial state) moves forward too.
      const restarted = await fights.start('hash-1', {
        origin: 'setup',
        setup: SETUP,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      seen.push(restarted.step);

      const sorted = [...seen].sort((a, b) => a - b);
      expect(seen).toEqual(sorted);
      expect(new Set(seen).size).toBe(seen.length);
    } finally {
      await db.destroy();
    }
  });

  it('guards commits with WHERE step = expected: a stale tab changes nothing', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const started = await fights.start('hash-1', {
        origin: 'setup',
        setup: SETUP,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      const advanced: CombatState = { ...chooseCombat(), round: 2 };
      const [first, second] = await Promise.all([
        fights.commit('hash-1', started.step, advanced),
        fights.commit('hash-1', started.step, advanced),
      ]);
      expect([first, second].filter(Boolean)).toHaveLength(1);
      const read = await fights.read('hash-1');
      expect(read.status).toBe('ready');
      if (read.status === 'ready') {
        expect(read.fight.step).toBe(started.step + 1);
        expect(read.fight.combat.round).toBe(2);
      }
      // The loser (and any replayer) stays stale: the step moved on.
      expect(await fights.commit('hash-1', started.step, advanced)).toBe(false);
      expect(await fights.commit('missing', 0, advanced)).toBe(false);
    } finally {
      await db.destroy();
    }
  });

  it('reads a malformed row as unreadable without rewriting it', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      const started = await fights.start('hash-1', {
        origin: 'setup',
        setup: SETUP,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      await db
        .updateTable('arena_fights')
        .set({ state: '[broken' })
        .where('session_id', '=', 'hash-1')
        .execute();
      const read = await fights.read('hash-1');
      expect(read.status).toBe('unreadable');
      if (read.status === 'unreadable') {
        expect(read.step).toBe(started.step);
        expect(read.issues).toEqual([{ code: 'malformed' }]);
      }
      // Reading rewrote nothing.
      expect(await rawStateText(db, 'hash-1')).toBe('[broken');
      // A commit against the unreadable row refuses instead of overwriting it.
      expect(await fights.commit('hash-1', started.step, chooseCombat())).toBe(false);
      expect(await rawStateText(db, 'hash-1')).toBe('[broken');
      // Only a user-initiated start replaces the row.
      const replaced = await fights.start('hash-1', {
        origin: 'setup',
        setup: SETUP,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      expect(replaced.step).toBeGreaterThan(started.step);
      expect((await fights.read('hash-1')).status).toBe('ready');
    } finally {
      await db.destroy();
    }
  });

  it('reads an unknown schemaVersion, a wrong rulesVersion and a stateVersion as unreadable', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      await fights.start('hash-1', {
        origin: 'setup',
        setup: SETUP,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      const envelope = (combat: unknown, extra: Record<string, unknown> = {}) => ({
        schemaVersion: 1,
        origin: 'setup',
        setup: SETUP,
        initial: null,
        combat,
        ...extra,
      });

      await db
        .updateTable('arena_fights')
        .set({ state: JSON.stringify({ ...envelope(chooseCombat()), schemaVersion: 99 }) })
        .where('session_id', '=', 'hash-1')
        .execute();
      const unknown = await fights.read('hash-1');
      expect(unknown.status).toBe('unreadable');
      if (unknown.status === 'unreadable') {
        expect(unknown.issues).toEqual([{ code: 'unknown_schema_version' }]);
      }

      await db
        .updateTable('arena_fights')
        .set({
          state: JSON.stringify(
            envelope({ ...chooseCombat(), rulesVersion: 'bogus-rules' }),
          ),
        })
        .where('session_id', '=', 'hash-1')
        .execute();
      const wrongRules = await fights.read('hash-1');
      expect(wrongRules.status).toBe('unreadable');
      if (wrongRules.status === 'unreadable') {
        expect(wrongRules.issues[0]).toMatchObject({ code: 'bad_rules_version' });
      }

      await db
        .updateTable('arena_fights')
        .set({ state: JSON.stringify(envelope(chooseCombat(), { stateVersion: 0 })) })
        .where('session_id', '=', 'hash-1')
        .execute();
      const versioned = await fights.read('hash-1');
      expect(versioned.status).toBe('unreadable');
      if (versioned.status === 'unreadable') {
        expect(versioned.issues).toEqual([{ code: 'unexpected_state_version' }]);
      }
    } finally {
      await db.destroy();
    }
  });

  it('remembers the Setup apart from the fight and keeps it across clears', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const fights = new ArenaFightStore(db);
      expect(await fights.readSetup('hash-1')).toBeNull();
      await fights.start('hash-1', {
        origin: 'setup',
        setup: SETUP,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      expect(await fights.readSetup('hash-1')).toEqual(SETUP);
      // An import without a Setup keeps the remembered one.
      await fights.start('hash-1', {
        origin: 'import',
        setup: null,
        initial: null,
        combat: chooseCombat(),
      });
      expect(await fights.readSetup('hash-1')).toEqual(SETUP);
      // Clearing the fight never forgets it.
      await fights.clear('hash-1');
      expect(await fights.readSetup('hash-1')).toEqual(SETUP);
      // Remembering replaces it without rewinding the clock.
      const other = { opponents: [{ profileId: 'archer' }] };
      await fights.rememberSetup('hash-1', other);
      expect(await fights.readSetup('hash-1')).toEqual(other);
      const next = await fights.start('hash-1', {
        origin: 'setup',
        setup: other,
        initial: duelPlanState(),
        combat: chooseCombat(),
      });
      expect(next.step).toBeGreaterThan(2);
    } finally {
      await db.destroy();
    }
  });
});
