// S1: migration 005_combat_mvp_1_0 discards pre-release game data.
// On a database built by 001-004 holding v1 and v2 Playthroughs, Journal
// rows, an Arena run and a remembered Setup: afterwards `playthroughs` and
// `journal_entries` are empty, `arena_runs` and `arena_setups` are gone, the
// new Arena tables exist and `sessions` rows are intact. Running `migrate`
// again is a no-op; the empty-database path in CI still passes.

import { describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';

import { PlaythroughStateV1Schema } from '../src/engine/state-v1';
import { PlaythroughStateSchema } from '../src/engine/state';
import {
  ArenaFightStore,
  MIGRATIONS,
  SessionStore,
  migrateDatabase,
  openDatabase,
} from '../src/persistence/index';
import type { Database } from '../src/persistence/schema';
import { duelChooseState } from './combat-core-fixtures';

const NOW = '2026-10-19T00:00:00.000Z';

/** Migrate a fresh handle up to (and including) the named migration only. */
async function migrateTo(db: Kysely<Database>, target: string): Promise<void> {
  const names = Object.keys(MIGRATIONS).filter((name) => name <= target);
  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: () =>
        Promise.resolve(
          Object.fromEntries(
            names.map((name) => [name, { up: MIGRATIONS[name].up, down: async () => {} }]),
          ),
        ),
    },
  });
  const { error } = await migrator.migrateTo(target);
  if (error) throw error;
}

async function tableNames(db: Kysely<Database>): Promise<string[]> {
  const result = await sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table'`.execute(
    db,
  );
  return result.rows.map((row) => row.name);
}

/** A schema-valid v2 Playthrough document (pre-release game data). */
function v2Document(): unknown {
  return {
    stateVersion: 2,
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
    encounters: {},
  };
}

/** A schema-valid v1 Playthrough document (pre-release game data). */
function v1Document(): unknown {
  return {
    stateVersion: 1,
    scenarioId: 'meadow',
    scenarioVersion: '1.0.0',
    contentHash: 'abc',
    status: 'active',
    step: 0,
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 1, agility: 3, wits: 2, presence: 0 },
      health: 10,
    },
    inventory: {},
    equipment: {},
    currentLocationId: 'glade',
    visited: [],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounterDamage: {},
  };
}

/** Build the pre-release database the release migration runs against. */
async function seedPreRelease(db: Kysely<Database>): Promise<void> {
  const v2 = v2Document();
  const v1 = v1Document();
  expect(PlaythroughStateSchema.safeParse(v2).success).toBe(true);
  expect(PlaythroughStateV1Schema.safeParse(v1).success).toBe(true);

  await new SessionStore(db).touch('session-keep');

  await db
    .insertInto('playthroughs')
    .values({
      id: 'pt-v2',
      session_id: 'session-keep',
      scenario_id: 'meadow',
      scenario_version: '1.0.0',
      content_hash: 'abc',
      status: 'active',
      ending_id: null,
      step: 0,
      state: JSON.stringify(v2),
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();
  await db
    .insertInto('playthroughs')
    .values({
      id: 'pt-v1',
      session_id: 'session-keep',
      scenario_id: 'meadow',
      scenario_version: '1.0.0',
      content_hash: 'abc',
      status: 'ended',
      ending_id: 'death',
      step: 4,
      state: JSON.stringify(v1),
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();
  await db
    .insertInto('journal_entries')
    .values({
      playthrough_id: 'pt-v2',
      seq: 1,
      step: 0,
      type: 'intro',
      lang: 'en',
      payload: JSON.stringify({ text: 'You wake.' }),
      created_at: NOW,
    })
    .execute();
  await db
    .insertInto('journal_entries')
    .values({
      playthrough_id: 'pt-v1',
      seq: 1,
      step: 4,
      type: 'ending',
      lang: 'en',
      payload: JSON.stringify({ ending: 'death' }),
      created_at: NOW,
    })
    .execute();
  await db
    .insertInto('arena_runs')
    .values({
      session_id: 'session-keep',
      step: 3,
      state: JSON.stringify({ kind: 'arena', status: 'active', step: 3, round: 2 }),
      journal: JSON.stringify([{ type: 'arena-start', opponents: [] }]),
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();
  await db
    .insertInto('arena_setups')
    .values({
      session_id: 'session-keep',
      setup: JSON.stringify({ character: {}, opponents: [] }),
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();
}

describe('005_combat_mvp_1_0 wipe migration', () => {
  it('empties game data, drops the old Arena tables, keeps sessions, and is a no-op on re-run', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateTo(db, '004_arena_setups');
      await seedPreRelease(db);

      // Sanity: the pre-release data is really there.
      expect(await db.selectFrom('playthroughs').selectAll().execute()).toHaveLength(2);
      expect(await db.selectFrom('journal_entries').selectAll().execute()).toHaveLength(2);
      expect(await db.selectFrom('arena_runs').selectAll().execute()).toHaveLength(1);
      expect(await db.selectFrom('arena_setups').selectAll().execute()).toHaveLength(1);

      await migrateDatabase(db);

      // Playthroughs and Journal rows are gone; the tables themselves remain.
      expect(await db.selectFrom('playthroughs').selectAll().execute()).toEqual([]);
      expect(await db.selectFrom('journal_entries').selectAll().execute()).toEqual([]);

      // The old Arena tables are gone, the new Arena tables exist.
      const names = await tableNames(db);
      expect(names).not.toContain('arena_runs');
      expect(names).not.toContain('arena_setups');
      expect(names).toContain('arena_fights');
      expect(names).toContain('arena_remembered_setups');
      expect(names).toContain('playthroughs');
      expect(names).toContain('journal_entries');
      expect(names).toContain('sessions');

      // Sessions survive the wipe.
      expect((await new SessionStore(db).findByHash('session-keep'))?.idHash).toBe('session-keep');

      // The new Arena tables are usable: a fresh fight starts at step 1.
      const fights = new ArenaFightStore(db);
      const started = await fights.start('session-keep', {
        origin: 'setup',
        setup: { opponents: ['brute'] },
        initial: null,
        combat: duelChooseState(),
      });
      expect(started.step).toBe(1);
      expect((await fights.read('session-keep')).status).toBe('ready');

      // Running `migrate` again is a no-op.
      await migrateDatabase(db);
      const again = await tableNames(db);
      expect(again).not.toContain('arena_runs');
      expect(again).not.toContain('arena_setups');
      expect(await db.selectFrom('playthroughs').selectAll().execute()).toEqual([]);
      expect((await fights.read('session-keep')).status).toBe('ready');
      expect((await new SessionStore(db).findByHash('session-keep'))?.idHash).toBe('session-keep');
    } finally {
      await db.destroy();
    }
  });

  it('migrates an empty database twice, like CI', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      await migrateDatabase(db);
      const names = await tableNames(db);
      expect(names).toContain('arena_fights');
      expect(names).toContain('arena_remembered_setups');
      expect(names).not.toContain('arena_runs');
      expect(names).not.toContain('arena_setups');
      expect(await db.selectFrom('playthroughs').selectAll().execute()).toEqual([]);
    } finally {
      await db.destroy();
    }
  });
});
