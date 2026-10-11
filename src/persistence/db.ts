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
