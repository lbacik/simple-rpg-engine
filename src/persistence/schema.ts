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

export type ArenaSetupRow = {
  session_id: string;
  /** The remembered Arena Setup snapshot JSON document, stored as TEXT. */
  setup: string;
  created_at: string;
  updated_at: string;
};

/**
 * Combat MVP 1.0 Arena fight (migration 005): one versioned run per Session.
 * The `state` column holds the whole Arena run v1 document
 * (`schemaVersion: 1`, `origin`, `setup`, `initial`, §12 `combat`) as TEXT;
 * the Arena log is projected from `combat.log`, so there is no journal
 * column. The row-level `step` is the concurrency revision and is monotonic
 * per Session: every start, rematch, restart and import allocates a higher
 * step, so a tab from a replaced run never matches `expectedStep`.
 */
export type ArenaFightRow = {
  session_id: string;
  step: number;
  /** The Arena run v1 document JSON, stored as TEXT. */
  state: string;
  created_at: string;
  updated_at: string;
};

/**
 * Combat MVP 1.0 remembered Setup with the monotonic step clock (migration
 * 005): the last Setup per Session, kept apart from the fight so going back
 * to the setup or clearing a fight never forgets it, plus `next_step`, the
 * next allocatable fight `step`. The clock survives fight clears, which keeps
 * the fight `step` monotonic per Session across start, rematch, restart and
 * import.
 */
export type ArenaRememberedSetupRow = {
  session_id: string;
  /** The remembered Arena Setup snapshot JSON document, stored as TEXT. */
  setup: string;
  next_step: number;
  created_at: string;
  updated_at: string;
};

export type Database = {
  playthroughs: PlaythroughRow;
  journal_entries: JournalEntryRow;
  sessions: SessionRow;
  arena_runs: ArenaRunRow;
  arena_setups: ArenaSetupRow;
  arena_fights: ArenaFightRow;
  arena_remembered_setups: ArenaRememberedSetupRow;
};
