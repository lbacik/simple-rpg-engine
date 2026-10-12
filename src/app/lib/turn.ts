// The turn pipeline every player action reuses
// (docs/spec/architecture.md, turn atomicity and rejections).
//
// Framework-free so tests can drive it against in-memory SQLite: the Server
// Action in travel.ts adds the Session cookie, the 404 mapping, the sliding
// refresh and the redirect-with-notice around this core.
//
// Order per turn: read the row (another Session, or none, is `not-found`),
// resolve the Scenario (gone means the Playthrough is read-only,
// `incompatible`), run the reference check when the pinned hash differs (a
// pass updates the pin, a fail means `incompatible`), run `applyAction`
// (`step`, then legality), then the optimistic-concurrency swap
// `UPDATE … WHERE step = <expected>`: no row changed means a concurrent turn
// won, so roll back and report `stale`. Only the winner inserts its Journal
// entries.
//
// The swap plus the insert are adjacent synchronous statements rather than a
// Kysely transaction object: better-sqlite3 serves every statement on one
// connection, so two concurrent `transaction().execute()` bodies interleave
// their BEGINs. The guarded UPDATE is the atomic compare-and-swap on every
// dialect (no in-process locks), and only its winner reaches the insert.

import type { Kysely } from 'kysely';
// Relative imports: vitest has no `@/` alias, and tests drive this module
// directly against in-memory SQLite.
import { checkPlaythroughCompatibility } from '../../content/compatibility';
import type { Scenario } from '../../content/loadScenario';
import { applyAction, type Action, type Rng } from '../../engine/index';
import { PlaythroughStore } from '../../persistence/index';
import type { Database } from '../../persistence/schema';

export type TurnResult =
  | { ok: true; step: number }
  | { ok: false; reason: 'not-found' | 'stale' | 'illegal' | 'ended' | 'incompatible' };

export async function executeTurn(
  db: Kysely<Database>,
  resolveScenario: (scenarioId: string) => Scenario | undefined,
  playthroughId: string,
  sessionHash: string | undefined,
  action: Action,
  rng: Rng,
): Promise<TurnResult> {
  const store = new PlaythroughStore(db);
  const row = await store.findById(playthroughId);
  if (row === null || sessionHash === undefined || row.sessionId !== sessionHash) {
    return { ok: false, reason: 'not-found' };
  }
  const scenario = resolveScenario(row.scenarioId);
  if (scenario === undefined) {
    return { ok: false, reason: 'incompatible' };
  }
  let state = row.state;
  let pinMoved = false;
  if (row.contentHash !== scenario.contentHash) {
    const check = checkPlaythroughCompatibility(scenario, state);
    if (!check.ok) {
      return { ok: false, reason: 'incompatible' };
    }
    // Fold the pin into the step-guarded swap below instead of a separate
    // update: a turn that commits meanwhile wins and this one reports stale,
    // so the pin never rolls a newer state back.
    state = { ...state, scenarioVersion: scenario.version, contentHash: scenario.contentHash };
    pinMoved = true;
  }
  const applied = applyAction(scenario, state, action, rng);
  if (!applied.ok) {
    if (pinMoved) {
      // Best effort: leave the pin moved even though the action was rejected,
      // unless a concurrent turn won meanwhile.
      await store.updatePin(playthroughId, state, row.step);
    }
    if (applied.reason === 'stale-step') return { ok: false, reason: 'stale' };
    if (applied.reason === 'ended') return { ok: false, reason: 'ended' };
    return { ok: false, reason: 'illegal' };
  }
  const swapped = await store.updateIfStepMatches(playthroughId, action.expectedStep, {
    state: applied.state,
    step: applied.state.step,
    status: applied.state.status,
    endingId: applied.state.endingId ?? null,
  });
  if (!swapped) {
    return { ok: false, reason: 'stale' };
  }
  await store.appendJournal(
    playthroughId,
    applied.journal.map((entry) => {
      const { type, lang, ...payload } = entry;
      return { step: applied.state.step, type, lang, payload };
    }),
  );
  return { ok: true, step: applied.state.step };
}
