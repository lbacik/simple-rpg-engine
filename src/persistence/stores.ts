// Async store ports behind Kysely (docs/spec/architecture.md, persistence).
// Async ports even though better-sqlite3 is synchronous.

import type { Kysely } from 'kysely';
import { parsePlaythroughState, type PlaythroughState } from '../engine/state';
import type { Database } from './schema';

export type StoredPlaythrough = {
  id: string;
  sessionId: string;
  scenarioId: string;
  scenarioVersion: string;
  contentHash: string;
  status: string;
  endingId: string | null;
  step: number;
  state: PlaythroughState;
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

export type NewPlaythrough = {
  id: string;
  sessionId: string;
  scenarioId: string;
  scenarioVersion: string;
  contentHash: string;
  status: string;
  endingId?: string | null;
  step: number;
  state: PlaythroughState;
};

export type NewJournalInput = {
  step: number;
  type: string;
  lang: string;
  payload: unknown;
};

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
    state: parsePlaythroughState(JSON.parse(row.state)),
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

  async create(input: NewPlaythrough, journal: NewJournalInput[]): Promise<StoredPlaythrough> {
    const now = new Date().toISOString();
    await this.db
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
    if (journal.length > 0) {
      await this.appendJournal(input.id, journal);
    }
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

  async appendJournal(playthroughId: string, entries: NewJournalInput[]): Promise<void> {
    if (entries.length === 0) return;
    const current = await this.db
      .selectFrom('journal_entries')
      .select(['seq'])
      .where('playthrough_id', '=', playthroughId)
      .orderBy('seq', 'desc')
      .limit(1)
      .executeTakeFirst();
    let seq = (current?.seq ?? 0) + 1;
    for (const entry of entries) {
      await this.db
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
  async updatePin(id: string, state: PlaythroughState, expectedStep: number): Promise<boolean> {
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
    next: { state: PlaythroughState; step: number; status: string; endingId?: string | null },
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
