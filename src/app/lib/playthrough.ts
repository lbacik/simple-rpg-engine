// Reading a Playthrough against the current Scenario collection
// (docs/spec/architecture.md, content compatibility).
//
// Incompatibility is derived on read, never stored: a missing or invalid
// Scenario, or a failed reference check when the pinned hash differs, makes
// the Playthrough read-only. A passed check updates the pin (row columns and
// the state document together) so the next read is cheap.
//
// Framework-free like turn.ts, so tests can drive it against in-memory
// SQLite: relative imports only.

import type { Kysely } from 'kysely';
import { checkPlaythroughCompatibility } from '../../content/compatibility';
import type { Scenario } from '../../content/loadScenario';
import { PlaythroughStore, type StoredPlaythrough } from '../../persistence/index';
import type { Database } from '../../persistence/schema';

export type ResolvedPlaythrough =
  | {
      compatible: true;
      scenario: Scenario;
      playthrough: StoredPlaythrough;
    }
  | {
      compatible: false;
      scenario: Scenario | undefined;
      playthrough: StoredPlaythrough;
    };

/**
 * Load a Playthrough and resolve it against the Scenario collection.
 * Returns null when the row does not belong to the Session (the caller
 * answers 404, revealing nothing).
 */
export async function resolvePlaythrough(
  db: Kysely<Database>,
  resolveScenario: (scenarioId: string) => Scenario | undefined,
  playthroughId: string,
  sessionHash: string | undefined,
): Promise<ResolvedPlaythrough | null> {
  const store = new PlaythroughStore(db);
  const row = await store.findById(playthroughId);
  if (row === null || sessionHash === undefined || row.sessionId !== sessionHash) {
    return null;
  }
  const scenario = resolveScenario(row.scenarioId);
  if (scenario === undefined) {
    return { compatible: false, scenario: undefined, playthrough: row };
  }
  if (row.contentHash === scenario.contentHash) {
    return { compatible: true, scenario, playthrough: row };
  }
  const check = checkPlaythroughCompatibility(scenario, row.state);
  if (!check.ok) {
    return { compatible: false, scenario, playthrough: row };
  }
  const state = {
    ...row.state,
    scenarioVersion: scenario.version,
    contentHash: scenario.contentHash,
  };
  if (await store.updatePin(row.id, state, row.step)) {
    const updated = await store.findById(row.id);
    return { compatible: true, scenario, playthrough: updated ?? { ...row, state } };
  }
  // A turn committed between the read and the pin update: report its fresh
  // row instead of overwriting it with the older state.
  const fresh = await store.findById(row.id);
  if (fresh === null || fresh.sessionId !== sessionHash) {
    return null;
  }
  if (fresh.contentHash === scenario.contentHash) {
    return { compatible: true, scenario, playthrough: fresh };
  }
  if (!checkPlaythroughCompatibility(scenario, fresh.state).ok) {
    return { compatible: false, scenario, playthrough: fresh };
  }
  return { compatible: true, scenario, playthrough: fresh };
}

/**
 * Content the incompatible read-only screen must leave out (docs/spec/ui.md,
 * read-only Playthroughs): `view()` falls back to the start Location (or the
 * death Ending) when an id is gone, which would show the wrong position for a
 * Playthrough whose current Location (or Ending) was renamed away. Scene and
 * Combat views never name the Location, so only the Location view and the
 * Ending need the gap detected; the caller renders a short notice instead.
 */
export function readOnlyGap(
  scenario: Scenario,
  state: StoredPlaythrough['state'],
  viewKind: 'location' | 'scene' | 'combat' | 'ended',
  hasRecordedEnding: boolean,
): 'location' | 'ending' | undefined {
  if (viewKind === 'ended') {
    if (
      state.endingId !== undefined &&
      scenario.endingsById[state.endingId] === undefined &&
      !hasRecordedEnding
    ) {
      return 'ending';
    }
    return undefined;
  }
  if (viewKind === 'location' && scenario.locationsById[state.currentLocationId] === undefined) {
    return 'location';
  }
  return undefined;
}
