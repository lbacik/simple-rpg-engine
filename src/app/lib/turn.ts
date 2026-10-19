// The turn pipeline every player action reuses
// (docs/spec/architecture.md, turn atomicity and rejections).
//
// Framework-free so tests can drive it against in-memory SQLite: the Server
// Action in travel.ts adds the Session cookie, the 404 mapping, the sliding
// refresh and the redirect-with-notice around this core.
//
// Order per turn: read the row (another Session, or none, is `not-found`),
// resolve the Scenario (gone means the Playthrough is read-only,
// `incompatible`), validate the stored document against the current schema
// (anything but v2 means `incompatible`), run the reference check when the pinned hash differs
// (a pass updates the pin, a fail means `incompatible`), run `applyAction`
// (`step`, then legality), then the atomic commit
// (`UPDATE … WHERE step = <expected>` plus the Journal inserts in one
// transaction): no row changed means a concurrent turn won, so report `stale`.
// Only the winner's Journal entries commit, together with its state.
//
// The commit is serialized per database handle as well as guarded: Kysely
// transactions on better-sqlite3 serve every statement on one connection, so
// two concurrent `transaction().execute()` bodies would interleave their
// statements without the store's write queue. The guarded UPDATE stays the
// atomic compare-and-swap on every dialect (no in-process locks decide the
// winner); the queue only keeps the loser's statements from interleaving the
// winner's transaction.

import type { Kysely } from 'kysely';
// Relative imports: vitest has no `@/` alias, and tests drive this module
// directly against in-memory SQLite.
import { checkPlaythroughCompatibility } from '../../content/compatibility';
import type { Scenario } from '../../content/loadScenario';
import { localizeScenario } from '../../content/localize';
import { applyAction, type Action, type Rng } from '../../engine/index';
import { PlaythroughStateSchema, type PlaythroughState } from '../../engine/state';
import { readPlaythroughV3Document } from '../../engine/state-v3';
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
  // The player's Interface Language: the turn runs on the Scenario text it
  // selects, so the Journal records the shown language. Compatibility stays
  // on the base Scenario (IDs are identical either way).
  interfaceLanguage: string = 'en',
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
  // The store returns raw state: validate here, where the Scenario is known.
  // Only current v2 documents play: invalid documents (including retired v1
  // documents, whose migration left with the tactical Combat in S4) fail
  // without any write and without blocking the Journal (which reads through
  // the store directly, never through this path). Combat MVP 1.0 v3 turns
  // arrive with the P6 Scenario adapter; until then v3 rows are read-only
  // and no turn commits against them.
  let state: PlaythroughState;
  if (
    typeof row.state === 'object' &&
    row.state !== null &&
    'schemaVersion' in row.state &&
    readPlaythroughV3Document(row.state).ok
  ) {
    return { ok: false, reason: 'incompatible' };
  }
  const parsed = PlaythroughStateSchema.safeParse(row.state);
  if (!parsed.success) {
    return { ok: false, reason: 'incompatible' };
  }
  state = parsed.data;
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
  const localized = localizeScenario(scenario, interfaceLanguage).scenario;
  const applied = applyAction(localized, state, action, rng);
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
  const committed = await store.commitTurn(
    playthroughId,
    action.expectedStep,
    {
      state: applied.state,
      step: applied.state.step,
      status: applied.state.status,
      endingId: applied.state.endingId ?? null,
    },
    applied.journal.map((entry) => {
      const { type, lang, ...payload } = entry;
      return { step: applied.state.step, type, lang, payload };
    }),
  );
  if (!committed) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true, step: applied.state.step };
}
