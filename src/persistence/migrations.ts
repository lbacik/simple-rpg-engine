// Kysely migrations. Run by `npm run migrate`, never in `register()`.

import type { Kysely } from 'kysely';
import type { Database } from './schema';

export const MIGRATIONS: Record<string, { up(db: Kysely<Database>): Promise<void> }> = {
  '001_init': {
    async up(db: Kysely<Database>): Promise<void> {
      await db.schema
        .createTable('sessions')
        .ifNotExists()
        .addColumn('id_hash', 'text', (col) => col.primaryKey())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('last_seen_at', 'text', (col) => col.notNull())
        .execute();
      await db.schema
        .createTable('playthroughs')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('session_id', 'text', (col) => col.notNull())
        .addColumn('scenario_id', 'text', (col) => col.notNull())
        .addColumn('scenario_version', 'text', (col) => col.notNull())
        .addColumn('content_hash', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('ending_id', 'text')
        .addColumn('step', 'integer', (col) => col.notNull())
        .addColumn('state', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute();
      await db.schema
        .createTable('journal_entries')
        .ifNotExists()
        .addColumn('playthrough_id', 'text', (col) => col.notNull())
        .addColumn('seq', 'integer', (col) => col.notNull())
        .addColumn('step', 'integer', (col) => col.notNull())
        .addColumn('type', 'text', (col) => col.notNull())
        .addColumn('payload', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('journal_entries_pk', ['playthrough_id', 'seq'])
        .execute();
      await db.schema
        .createIndex('playthroughs_session_idx')
        .ifNotExists()
        .on('playthroughs')
        .column('session_id')
        .execute();
      await db.schema
        .createIndex('journal_playthrough_idx')
        .ifNotExists()
        .on('journal_entries')
        .column('playthrough_id')
        .execute();
    },
  },
  // ADR 0004, expand step: every Journal entry records the language of the
  // Scenario text in effect when it was presented. Existing rows hold English
  // text only, so the new column backfills them as `en`.
  '002_journal_lang': {
    async up(db: Kysely<Database>): Promise<void> {
      await db.schema
        .alterTable('journal_entries')
        .addColumn('lang', 'text', (col) => col.notNull().defaultTo('en'))
        .execute();
    },
  },
  // The Arena page (issue #166): one run per Session, outside the Playthrough
  // stores, so a reload resumes the same Combat without ever listing the
  // fight among the Session's Playthroughs (ADR 0006).
  '003_arena_runs': {
    async up(db: Kysely<Database>): Promise<void> {
      await db.schema
        .createTable('arena_runs')
        .ifNotExists()
        .addColumn('session_id', 'text', (col) => col.primaryKey())
        .addColumn('step', 'integer', (col) => col.notNull())
        .addColumn('state', 'text', (col) => col.notNull())
        .addColumn('journal', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute();
    },
  },
};
