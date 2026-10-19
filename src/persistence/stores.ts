// Async store ports behind Kysely (docs/spec/architecture.md, persistence).
// Async ports even though better-sqlite3 is synchronous.
//
// The store is a raw persistence seam: it parses the stored TEXT as JSON but
// never validates the state document. Validation and migration are
// Scenario-aware and live in `src/app/lib/playthrough.ts` (and the turn path
// in `src/app/lib/turn.ts`), which own the current Scenario. Callers that need
// a validated state must go through that layer; reading `state` here yields
// the stored bytes as parsed JSON, including invalid documents.

import type { Kysely, Transaction } from 'kysely';
import type { ArenaJournalEntry, ArenaState } from '../engine/arena';
import {
  ARENA_RUN_SCHEMA_VERSION,
  parseArenaRunDocument,
  type ArenaRunIssue,
  type ArenaRunOrigin,
  type ArenaRunV1,
  type CombatState as CombatMvpState,
} from '../engine/combat/index';
import type { PlaythroughState } from '../engine/state';
import type { PlaythroughV3 } from '../engine/state-v3';
import { runSerialized } from './db';
import type { Database } from './schema';

type Executor = Kysely<Database> | Transaction<Database>;

export type StoredPlaythrough = {
  id: string;
  sessionId: string;
  scenarioId: string;
  scenarioVersion: string;
  contentHash: string;
  status: string;
  endingId: string | null;
  step: number;
  /** Raw stored state: parsed JSON, unvalidated. Validate via the read layer. */
  state: unknown;
  createdAt: string;
  updatedAt: string;
};

export type StoredJournalEntry = {
  playthroughId: string;
  seq: number;
  step: number;
  type: string;
  /** The language of the Scenario text in effect when the entry was presented. */
  lang: string;
  payload: unknown;
  createdAt: string;
};

export type JournalBatch = {
  /** Entries newest first (descending `seq`). */
  entries: StoredJournalEntry[];
  /**
   * The cursor for the next older batch: the `seq` everything older must
   * fall below. Undefined when the start of the Journal has been reached.
   */
  nextCursor: number | undefined;
};

/**
 * State documents the Playthrough store persists: v2 (tactical) and Combat
 * MVP 1.0 v3. The store is a raw seam and never validates either shape;
 * validation lives in the Scenario-aware read layer.
 */
export type PersistedPlaythroughState = PlaythroughState | PlaythroughV3;

export type NewPlaythrough = {
  id: string;
  sessionId: string;
  scenarioId: string;
  scenarioVersion: string;
  contentHash: string;
  status: string;
  endingId?: string | null;
  step: number;
  state: PersistedPlaythroughState;
};

export type NewJournalInput = {
  step: number;
  type: string;
  lang: string;
  payload: unknown;
};

function parseRawState(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Corrupt TEXT is not valid state: the Scenario-aware read layer reports
    // it as invalid without rewriting it, while the Journal stays readable.
    return undefined;
  }
}

function toStored(row: Database['playthroughs']): StoredPlaythrough {
  return {
    id: row.id,
    sessionId: row.session_id,
    scenarioId: row.scenario_id,
    scenarioVersion: row.scenario_version,
    contentHash: row.content_hash,
    status: row.status,
    endingId: row.ending_id,
    step: row.step,
    state: parseRawState(row.state),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toJournalEntry(row: Database['journal_entries']): StoredJournalEntry {
  return {
    playthroughId: row.playthrough_id,
    seq: row.seq,
    step: row.step,
    type: row.type,
    lang: row.lang,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
  };
}

export class PlaythroughStore {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Run `fn` in a transaction serialized per database handle, so concurrent
   * multi-statement writes cannot interleave on better-sqlite3's single
   * connection. Single-statement guarded writes (updatePin,
   * updateIfStepMatches) stay outside the queue: each is one atomic statement
   * and its `WHERE step = <expected>` guard keeps it from overwriting a newer
   * row, so interleaving with a queued transaction cannot corrupt either side.
   */
  private withSerializedTransaction<T>(fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
    return runSerialized(this.db, () => this.db.transaction().execute(fn));
  }

  /**
   * Insert the journal entries with consecutive `seq` values continuing the
   * highest stored one. Runs on whatever executor the caller passes (a
   * transaction for atomic commits, the plain handle otherwise) and performs
   * no locking itself: public callers serialize first.
   */
  private static async insertJournalEntries(
    executor: Executor,
    playthroughId: string,
    entries: NewJournalInput[],
  ): Promise<void> {
    if (entries.length === 0) return;
    const current = await executor
      .selectFrom('journal_entries')
      .select(['seq'])
      .where('playthrough_id', '=', playthroughId)
      .orderBy('seq', 'desc')
      .limit(1)
      .executeTakeFirst();
    let seq = (current?.seq ?? 0) + 1;
    for (const entry of entries) {
      await executor
        .insertInto('journal_entries')
        .values({
          playthrough_id: playthroughId,
          seq,
          step: entry.step,
          type: entry.type,
          lang: entry.lang,
          payload: JSON.stringify(entry.payload),
          created_at: new Date().toISOString(),
        })
        .execute();
      seq += 1;
    }
  }

  /**
   * Create the Playthrough row and its initial Journal entries atomically: a
   * failure appending the Journal rolls back the insert, leaving no partial
   * Playthrough. Serialized per database handle so concurrent creates (and
   * turns) on better-sqlite3's single connection cannot interleave.
   */
  async create(input: NewPlaythrough, journal: NewJournalInput[]): Promise<StoredPlaythrough> {
    const now = new Date().toISOString();
    await this.withSerializedTransaction(async (trx) => {
      await trx
        .insertInto('playthroughs')
        .values({
          id: input.id,
          session_id: input.sessionId,
          scenario_id: input.scenarioId,
          scenario_version: input.scenarioVersion,
          content_hash: input.contentHash,
          status: input.status,
          ending_id: input.endingId ?? null,
          step: input.step,
          state: JSON.stringify(input.state),
          created_at: now,
          updated_at: now,
        })
        .execute();
      await PlaythroughStore.insertJournalEntries(trx, input.id, journal);
    });
    const found = await this.findById(input.id);
    if (!found) throw new Error('playthrough insert failed');
    return found;
  }

  async findById(id: string): Promise<StoredPlaythrough | null> {
    const row = await this.db
      .selectFrom('playthroughs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toStored(row) : null;
  }

  async listBySession(sessionId: string): Promise<StoredPlaythrough[]> {
    const rows = await this.db
      .selectFrom('playthroughs')
      .selectAll()
      .where('session_id', '=', sessionId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toStored);
  }

  /**
   * Standalone Journal append (no state change): serialized and transactional
   * so concurrent appends cannot interleave `seq` allocation on SQLite.
   */
  async appendJournal(playthroughId: string, entries: NewJournalInput[]): Promise<void> {
    if (entries.length === 0) return;
    await this.withSerializedTransaction(async (trx) => {
      await PlaythroughStore.insertJournalEntries(trx, playthroughId, entries);
    });
  }

  async listJournal(playthroughId: string): Promise<StoredJournalEntry[]> {
    const rows = await this.db
      .selectFrom('journal_entries')
      .selectAll()
      .where('playthrough_id', '=', playthroughId)
      .orderBy('seq', 'asc')
      .execute();
    return rows.map(toJournalEntry);
  }

  /** Total journal entries of a Playthrough, for pagination. */
  async countJournal(playthroughId: string): Promise<number> {
    const row = await this.db
      .selectFrom('journal_entries')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('playthrough_id', '=', playthroughId)
      .executeTakeFirst();
    const count = row?.count;
    return typeof count === 'string' ? Number.parseInt(count, 10) : Number(count ?? 0);
  }

  /**
   * One journal batch, newest first, for the infinitely scrolling journal.
   * Batches are addressed by a cursor on the entry sequence: `beforeSeq`
   * keeps only entries with a lower `seq` ("entries older than X"), so
   * entries appended after the Journal was opened never shift or duplicate
   * what is already on screen. A missing or invalid cursor (not a positive
   * integer) reads the newest batch.
   */
  async listJournalBatch(
    playthroughId: string,
    options: { limit: number; beforeSeq?: number },
  ): Promise<JournalBatch> {
    const before = options.beforeSeq;
    const bounded = Number.isInteger(before) && (before as number) > 0;
    let query = this.db
      .selectFrom('journal_entries')
      .selectAll()
      .where('playthrough_id', '=', playthroughId);
    if (bounded) {
      query = query.where('seq', '<', before as number);
    }
    // One extra row probes whether older entries remain, without a count.
    const rows = await query.orderBy('seq', 'desc').limit(options.limit + 1).execute();
    const shown = rows.slice(0, options.limit).map(toJournalEntry);
    const nextCursor =
      rows.length > options.limit ? shown[shown.length - 1]?.seq : undefined;
    return { entries: shown, nextCursor };
  }

  /**
   * Refresh the content pin after a passed reference check: the row columns
   * and the state document's own pin move to the loaded Scenario together.
   * The pin travels in `state` itself, so it is passed once.
   *
   * Guarded by the `step` that was read: when a turn commits between the read
   * and this update, no row matches and the newer state is left alone.
   * Resolves true when the pin moved, false when someone else moved on (the
   * caller re-reads or reports stale instead of overwriting the newer state).
   */
  async updatePin(id: string, state: PersistedPlaythroughState, expectedStep: number): Promise<boolean> {
    const result = await this.db
      .updateTable('playthroughs')
      .set({
        scenario_version: state.scenarioVersion,
        content_hash: state.contentHash,
        state: JSON.stringify(state),
        step: state.step,
        status: state.status,
        ending_id: state.endingId ?? null,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .where('step', '=', expectedStep)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  /**
   * Optimistic-concurrency state swap: updates only when the stored `step`
   * still equals `expectedStep`. Resolves true on success, false when stale.
   */
  async updateIfStepMatches(
    id: string,
    expectedStep: number,
    next: { state: PersistedPlaythroughState; step: number; status: string; endingId?: string | null },
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('playthroughs')
      .set({
        scenario_version: next.state.scenarioVersion,
        content_hash: next.state.contentHash,
        state: JSON.stringify(next.state),
        step: next.step,
        status: next.status,
        ending_id: next.endingId ?? null,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .where('step', '=', expectedStep)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  /**
   * Atomic turn commit: the guarded state swap and the new Journal entries
   * commit together or not at all. Resolves false when the stored `step` no
   * longer equals `expectedStep` (a concurrent turn won; nothing is written).
   * A Journal failure after the state update rolls the update back with it.
   *
   * Serialized per database handle so concurrent commits on better-sqlite3's
   * single connection cannot interleave their transaction statements.
   */
  async commitTurn(
    id: string,
    expectedStep: number,
    next: { state: PersistedPlaythroughState; step: number; status: string; endingId?: string | null },
    journal: NewJournalInput[],
  ): Promise<boolean> {
    return this.withSerializedTransaction(async (trx) => {
      const result = await trx
        .updateTable('playthroughs')
        .set({
          scenario_version: next.state.scenarioVersion,
          content_hash: next.state.contentHash,
          state: JSON.stringify(next.state),
          step: next.step,
          status: next.status,
          ending_id: next.endingId ?? null,
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', id)
        .where('step', '=', expectedStep)
        .executeTakeFirst();
      if ((result.numUpdatedRows ?? 0n) === 0n) {
        return false;
      }
      await PlaythroughStore.insertJournalEntries(trx, id, journal);
      return true;
    });
  }
}

export type StoredSession = {
  idHash: string;
  createdAt: string;
  lastSeenAt: string;
};

export class SessionStore {
  constructor(private readonly db: Kysely<Database>) {}

  async findByHash(idHash: string): Promise<StoredSession | null> {
    const row = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id_hash', '=', idHash)
      .executeTakeFirst();
    if (!row) return null;
    return { idHash: row.id_hash, createdAt: row.created_at, lastSeenAt: row.last_seen_at };
  }

  async touch(idHash: string): Promise<StoredSession> {
    const now = new Date().toISOString();
    const existing = await this.findByHash(idHash);
    if (existing) {
      await this.db
        .updateTable('sessions')
        .set({ last_seen_at: now })
        .where('id_hash', '=', idHash)
        .execute();
      return { ...existing, lastSeenAt: now };
    }
    await this.db
      .insertInto('sessions')
      .values({ id_hash: idHash, created_at: now, last_seen_at: now })
      .execute();
    return { idHash, createdAt: now, lastSeenAt: now };
  }
}

export type StoredArenaRun = {
  sessionId: string;
  step: number;
  /** The running fight; validated structurally on read, never trusted blindly. */
  state: ArenaState;
  journal: ArenaJournalEntry[];
  createdAt: string;
  updatedAt: string;
};

function parseArenaState(text: string): ArenaState | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || (parsed as { kind?: unknown }).kind !== 'arena') {
      return undefined;
    }
    return parsed as ArenaState;
  } catch {
    return undefined;
  }
}

function parseArenaJournal(text: string): ArenaJournalEntry[] | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as ArenaJournalEntry[];
  } catch {
    return undefined;
  }
}

/**
 * The Arena runs (issue #166, ADR 0006): one run per Session, stored outside
 * the Playthrough stores so a fight is never listed among the Session's
 * Playthroughs. A reload reads the same row back and resumes the same Combat;
 * starting a fight replaces the row, going back to the setup clears it.
 */
export class ArenaStore {
  constructor(private readonly db: Kysely<Database>) {}

  async findBySession(sessionId: string): Promise<StoredArenaRun | null> {
    const row = await this.db
      .selectFrom('arena_runs')
      .selectAll()
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    if (!row) return null;
    // Corrupt rows read as absent without rewriting them, like corrupt
    // Playthrough state: the page falls back to the setup.
    const state = parseArenaState(row.state);
    const journal = parseArenaJournal(row.journal);
    if (state === undefined || journal === undefined) return null;
    return {
      sessionId: row.session_id,
      step: row.step,
      state,
      journal,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Store the Session's run, replacing any previous one. Used when a fight
   * starts: the new Setup takes the place of whatever ran before.
   */
  async replace(sessionId: string, state: ArenaState, journal: ArenaJournalEntry[]): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.db
      .selectFrom('arena_runs')
      .select(['session_id'])
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    if (existing) {
      await this.db
        .updateTable('arena_runs')
        .set({
          step: state.step,
          state: JSON.stringify(state),
          journal: JSON.stringify(journal),
          updated_at: now,
        })
        .where('session_id', '=', sessionId)
        .execute();
      return;
    }
    await this.db
      .insertInto('arena_runs')
      .values({
        session_id: sessionId,
        step: state.step,
        state: JSON.stringify(state),
        journal: JSON.stringify(journal),
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  /**
   * Guarded Round commit: swaps the state and appends the new Journal entries
   * only when the stored `step` still equals `expectedStep`. Resolves false
   * when stale (a concurrent Round won; nothing is written) or when no run is
   * stored. Serialized per database handle like the Playthrough turn commit.
   */
  async commit(
    sessionId: string,
    expectedStep: number,
    state: ArenaState,
    journal: ArenaJournalEntry[],
  ): Promise<boolean> {
    return runSerialized(this.db, () =>
      this.db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('arena_runs')
          .selectAll()
          .where('session_id', '=', sessionId)
          .executeTakeFirst();
        if (!row || row.step !== expectedStep) {
          return false;
        }
        const stored = parseArenaJournal(row.journal) ?? [];
        await trx
          .updateTable('arena_runs')
          .set({
            step: state.step,
            state: JSON.stringify(state),
            journal: JSON.stringify([...stored, ...journal]),
            updated_at: new Date().toISOString(),
          })
          .where('session_id', '=', sessionId)
          .where('step', '=', expectedStep)
          .execute();
        return true;
      }),
    );
  }

  async clear(sessionId: string): Promise<void> {
    await this.db.deleteFrom('arena_runs').where('session_id', '=', sessionId).execute();
  }
}

/**
 * The remembered Arena Setups (issue #171): the last setup per Session, kept
 * apart from the run. Starting a fight remembers its setup; going back to the
 * setup or finishing a fight never forgets it. The payload is the snapshot
 * JSON the Arena layer validates on read, never trusted blindly.
 */
export class ArenaSetupStore {
  constructor(private readonly db: Kysely<Database>) {}

  /** The Session's remembered setup JSON, or null when none was remembered. */
  async findRaw(sessionId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('arena_setups')
      .select(['setup'])
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    return row?.setup ?? null;
  }

  /** Remember the Session's setup, replacing any previous one. */
  async save(sessionId: string, setup: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.db
      .selectFrom('arena_setups')
      .select(['session_id'])
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    if (existing) {
      await this.db
        .updateTable('arena_setups')
        .set({ setup, updated_at: now })
        .where('session_id', '=', sessionId)
        .execute();
      return;
    }
    await this.db
      .insertInto('arena_setups')
      .values({ session_id: sessionId, setup, created_at: now, updated_at: now })
      .execute();
  }
}

export type StoredArenaFight = {
  sessionId: string;
  step: number;
  origin: ArenaRunOrigin;
  /** The remembered Setup this run started from; null for setup-less imports. */
  setup: unknown;
  /** The initial Combat state for Restart; null for CHOOSE/FINISHED imports. */
  initial: unknown;
  /** The running fight; validated strictly on read, never trusted blindly. */
  combat: CombatMvpState;
  createdAt: string;
  updatedAt: string;
};

export type NewArenaFight = {
  origin: ArenaRunOrigin;
  setup: unknown;
  initial: unknown;
  combat: CombatMvpState;
};

export type ArenaFightRead =
  | { status: 'missing' }
  | { status: 'ready'; fight: StoredArenaFight }
  /**
   * The row cannot be read (malformed, unknown `schemaVersion`, wrong
   * `rulesVersion`, …). Reading never rewrites the row: it is replaced only
   * by a user-initiated start or import.
   */
  | { status: 'unreadable'; step: number; issues: ArenaRunIssue[] };

function parseStoredJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * The Combat MVP 1.0 Arena fights (migration 005, ADR 0009): one versioned
 * run per Session in `arena_fights`, with the remembered Setup and the
 * monotonic step clock in `arena_remembered_setups`.
 *
 * Every allocating path (start, rematch, restart, import) goes through
 * `start`, which allocates a step above every step the Session has ever used:
 * the clock survives fight clears, so a tab from a replaced run never matches
 * `expectedStep`. Every write is guarded by `WHERE step = expected`.
 */
export class ArenaFightStore {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Run `fn` in a transaction serialized per database handle, like the
   * Playthrough turn commit: the guarded `UPDATE … WHERE step = <expected>`
   * stays the atomic compare-and-swap and the queue only keeps concurrent
   * transaction bodies on better-sqlite3's single connection from
   * interleaving.
   */
  private withSerializedTransaction<T>(fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
    return runSerialized(this.db, () => this.db.transaction().execute(fn));
  }

  /**
   * Read the Session's fight without ever writing: a corrupt row reads as
   * `unreadable` (with its stored `step` and the strict-parse issues) and the
   * stored bytes are left alone for a user-initiated start or import to
   * replace.
   */
  async read(sessionId: string): Promise<ArenaFightRead> {
    const row = await this.db
      .selectFrom('arena_fights')
      .selectAll()
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    if (!row) return { status: 'missing' };
    const parsed = parseStoredJson(row.state);
    if (!parsed.ok) {
      return { status: 'unreadable', step: row.step, issues: [{ code: 'malformed' }] };
    }
    const run = parseArenaRunDocument(parsed.value);
    if (!run.ok) {
      return { status: 'unreadable', step: row.step, issues: run.issues };
    }
    return {
      status: 'ready',
      fight: {
        sessionId: row.session_id,
        step: row.step,
        origin: run.run.origin,
        setup: run.run.setup,
        initial: run.run.initial,
        combat: run.run.combat,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  }

  /** The Session's remembered Setup JSON, or null when none was remembered. */
  async readSetup(sessionId: string): Promise<unknown> {
    const row = await this.db
      .selectFrom('arena_remembered_setups')
      .select(['setup'])
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    if (!row) return null;
    const parsed = parseStoredJson(row.setup);
    return parsed.ok ? parsed.value : null;
  }

  /**
   * Remember the Session's Setup, replacing any previous one. The monotonic
   * clock is preserved: remembering never rewinds the fight `step`.
   */
  async rememberSetup(sessionId: string, setup: unknown): Promise<void> {
    const now = new Date().toISOString();
    const body = JSON.stringify(setup);
    await this.withSerializedTransaction(async (trx) => {
      const existing = await trx
        .selectFrom('arena_remembered_setups')
        .select(['session_id'])
        .where('session_id', '=', sessionId)
        .executeTakeFirst();
      if (existing) {
        await trx
          .updateTable('arena_remembered_setups')
          .set({ setup: body, updated_at: now })
          .where('session_id', '=', sessionId)
          .execute();
        return;
      }
      await trx
        .insertInto('arena_remembered_setups')
        .values({ session_id: sessionId, setup: body, next_step: 1, created_at: now, updated_at: now })
        .execute();
    });
  }

  /**
   * Store the Session's fight, replacing any previous one. Used by every
   * user-initiated replacement: start, rematch, restart and import. The new
   * row's `step` beats every step the Session has used before (the clock
   * survives clears), and the remembered Setup is refreshed when the
   * replacement carries one. The Arena log is projected from the Combat log,
   * so no journal is stored.
   */
  async start(sessionId: string, input: NewArenaFight): Promise<StoredArenaFight> {
    const now = new Date().toISOString();
    // Stored verbatim: the strict read validates the envelope, so a bad Setup
    // from a caller surfaces as `unreadable` instead of failing the write.
    const document = {
      schemaVersion: ARENA_RUN_SCHEMA_VERSION,
      origin: input.origin,
      setup: input.setup,
      initial: input.initial,
      combat: input.combat,
    };
    const stored = await this.withSerializedTransaction(async (trx) => {
      const [fight, memory] = await Promise.all([
        trx
          .selectFrom('arena_fights')
          .select(['step'])
          .where('session_id', '=', sessionId)
          .executeTakeFirst(),
        trx
          .selectFrom('arena_remembered_setups')
          .selectAll()
          .where('session_id', '=', sessionId)
          .executeTakeFirst(),
      ]);
      const step = Math.max(memory?.next_step ?? 1, (fight?.step ?? 0) + 1);
      const state = JSON.stringify(document);
      if (fight) {
        await trx
          .updateTable('arena_fights')
          .set({ step, state, updated_at: now })
          .where('session_id', '=', sessionId)
          .execute();
      } else {
        await trx
          .insertInto('arena_fights')
          .values({ session_id: sessionId, step, state, created_at: now, updated_at: now })
          .execute();
      }
      const setupBody = JSON.stringify(document.setup);
      if (memory) {
        await trx
          .updateTable('arena_remembered_setups')
          .set({
            // An import without a Setup keeps the remembered one: forgetting
            // is never a side effect of importing.
            setup: document.setup === null ? memory.setup : setupBody,
            next_step: step + 1,
            updated_at: now,
          })
          .where('session_id', '=', sessionId)
          .execute();
      } else {
        await trx
          .insertInto('arena_remembered_setups')
          .values({
            session_id: sessionId,
            setup: setupBody,
            next_step: step + 1,
            created_at: now,
            updated_at: now,
          })
          .execute();
      }
      return { step };
    });
    const read = await this.read(sessionId);
    if (read.status !== 'ready' || read.fight.step !== stored.step) {
      throw new Error('arena fight start failed');
    }
    return read.fight;
  }

  /**
   * Guarded Round commit: swaps the Combat state only when the stored `step`
   * still equals `expectedStep`, advancing the row and the monotonic clock
   * together. Resolves false when stale (a concurrent Round won, or the fight
   * was replaced or cleared; nothing is written), when no fight is stored, or
   * when the stored row cannot be read (a corrupt row is never overwritten
   * blindly: only a user-initiated start or import replaces it).
   */
  async commit(sessionId: string, expectedStep: number, combat: CombatMvpState): Promise<boolean> {
    return this.withSerializedTransaction(async (trx) => {
      const row = await trx
        .selectFrom('arena_fights')
        .selectAll()
        .where('session_id', '=', sessionId)
        .executeTakeFirst();
      if (!row || row.step !== expectedStep) {
        return false;
      }
      const parsed = parseStoredJson(row.state);
      if (!parsed.ok) {
        return false;
      }
      const run = parseArenaRunDocument(parsed.value);
      if (!run.ok) {
        return false;
      }
      const next: ArenaRunV1 = { ...run.run, combat };
      const now = new Date().toISOString();
      const result = await trx
        .updateTable('arena_fights')
        .set({ step: expectedStep + 1, state: JSON.stringify(next), updated_at: now })
        .where('session_id', '=', sessionId)
        .where('step', '=', expectedStep)
        .executeTakeFirst();
      if ((result.numUpdatedRows ?? 0n) === 0n) {
        return false;
      }
      const memory = await trx
        .selectFrom('arena_remembered_setups')
        .select(['session_id', 'next_step'])
        .where('session_id', '=', sessionId)
        .executeTakeFirst();
      const nextStep = Math.max(memory?.next_step ?? 1, expectedStep + 2);
      if (memory) {
        await trx
          .updateTable('arena_remembered_setups')
          .set({ next_step: nextStep, updated_at: now })
          .where('session_id', '=', sessionId)
          .execute();
      } else {
        await trx
          .insertInto('arena_remembered_setups')
          .values({
            session_id: sessionId,
            setup: JSON.stringify(run.run.setup),
            next_step: nextStep,
            created_at: now,
            updated_at: now,
          })
          .execute();
      }
      return true;
    });
  }

  /**
   * Clear the Session's fight (going back to the setup). The remembered Setup
   * and the monotonic clock survive: the next start allocates a higher step,
   * so a tab from the cleared fight never matches.
   */
  async clear(sessionId: string): Promise<void> {
    await this.db.deleteFrom('arena_fights').where('session_id', '=', sessionId).execute();
  }
}
