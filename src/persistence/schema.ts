// Kysely database shape. Portable by design: plain tables, no
// SQLite-specific features (see docs/spec/architecture.md, persistence).

export type PlaythroughRow = {
  id: string;
  session_id: string;
  scenario_id: string;
  scenario_version: string;
  content_hash: string;
  status: string;
  ending_id: string | null;
  step: number;
  /** The engine-owned state JSON document, stored as TEXT. */
  state: string;
  created_at: string;
  updated_at: string;
};

export type JournalEntryRow = {
  playthrough_id: string;
  seq: number;
  step: number;
  type: string;
  /**
   * The language of the Scenario text in effect when the entry was presented
   * (docs/spec/playthrough-state.md, journal). Rows stored before Interface
   * Languages existed hold English text and were tagged `en` by migration 002.
   */
  lang: string;
  /** Entry payload JSON, stored as TEXT. */
  payload: string;
  created_at: string;
};

export type SessionRow = {
  id_hash: string;
  created_at: string;
  last_seen_at: string;
};

export type ArenaRunRow = {
  session_id: string;
  step: number;
  /** The engine-owned Arena state JSON document, stored as TEXT. */
  state: string;
  /** The Arena journal entries JSON array, stored as TEXT. */
  journal: string;
  created_at: string;
  updated_at: string;
};

export type Database = {
  playthroughs: PlaythroughRow;
  journal_entries: JournalEntryRow;
  sessions: SessionRow;
  arena_runs: ArenaRunRow;
};
