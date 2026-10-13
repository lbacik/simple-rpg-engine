// Kysely database handles. `SqliteDialect` with `better-sqlite3` now;
// `PostgresDialect` or `MysqlDialect` later. Queries stay portable.

import path from 'node:path';
import DatabaseJS from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { Migrator } from 'kysely/migration';
import { MIGRATIONS } from './migrations';
import type { Database } from './schema';

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data.sqlite');
}

export function openDatabase(file: string): Kysely<Database> {
  if (file === ':memory:') {
    const inner = new DatabaseJS(':memory:');
    return new Kysely<Database>({ dialect: new SqliteDialect({ database: inner }) });
  }
  const inner = new DatabaseJS(file);
  inner.pragma('journal_mode = WAL');
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: inner }) });
}

let shared: Kysely<Database> | undefined;

// Serialized write queue, one chain per database handle.
//
// better-sqlite3 serves every statement on a single connection, so two
// concurrent `db.transaction().execute()` bodies interleave their statements
// (each `await` yields to the event loop while the SQLite transaction stays
// open). Chaining the whole transaction body behind a per-handle promise
// queue keeps concurrent transactions from interleaving: the next body starts
// only after the previous one committed or rolled back. The guarded
// `UPDATE … WHERE step = <expected>` inside remains the cross-process
// compare-and-swap; the queue only fixes in-process interleaving.
const writeTails = new WeakMap<object, Promise<void>>();

export function runSerialized<T>(db: Kysely<Database>, fn: () => Promise<T>): Promise<T> {
  const prev = writeTails.get(db) ?? Promise.resolve();
  let release: () => void = () => {};
  const slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  writeTails.set(db, slot);
  return (async () => {
    try {
      await prev;
    } catch {
      // A previous slot never rejects (it only resolves via `release`), but
      // never let a broken chain block later writes.
    }
    try {
      return await fn();
    } finally {
      release();
    }
  })();
}

export function getDatabase(): Kysely<Database> {
  if (!shared) shared = openDatabase(databasePath());
  return shared;
}

/** For tests: replace the shared handle. */
export function setDatabase(db: Kysely<Database>): void {
  shared = db;
}

export async function migrateDatabase(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: () =>
        Promise.resolve(
          Object.fromEntries(
            Object.entries(MIGRATIONS).map(([name, migration]) => [
              name,
              { up: migration.up, down: async () => {} },
            ]),
          ),
        ),
    },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
