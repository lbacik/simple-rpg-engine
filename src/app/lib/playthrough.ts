// Reading a Playthrough against the current Scenario collection
// (docs/spec/architecture.md, content compatibility).
//
// This is the Scenario-aware read layer: the persistence store returns raw
// stored state (parsed JSON, unvalidated) and every validation step lives
// here, where the current Scenario is available for version-aware validation.
// Only current v2 documents validate; unknown, newer (including retired v1)
// and invalid documents fail validation without being interpreted or
// rewritten.
//
// Incompatibility is derived on read, never stored: a missing or invalid
// Scenario, an invalid stored document, or a failed reference check when the
// pinned hash differs, makes the Playthrough read-only. A passed check updates
// the pin (row columns and the state document together) so the next read is
// cheap. Invalid documents and missing Scenarios never trigger a state write;
// the Journal stays readable in every case.
//
// Framework-free like turn.ts, so tests can drive it against in-memory
// SQLite: relative imports only.
//
// State reads must go through this module: `PlaythroughStore.findById` and
// `listBySession` return raw state and must only be called here (and in the
// turn path, which shares this validation). See
// `tests/playthrough-read-layer.test.ts` for the boundary check.

import type { Kysely } from 'kysely';
import { checkPlaythroughCompatibility } from '../../content/compatibility';
import type { Scenario } from '../../content/loadScenario';
import { PlaythroughStateSchema, type PlaythroughState } from '../../engine/state';
import { readPlaythroughV3Document } from '../../engine/state-v3';
import { PlaythroughStore, type StoredPlaythrough } from '../../persistence/index';
import type { Database } from '../../persistence/schema';

/** A stored row whose state passed v1 validation. */
export type ValidatedStoredPlaythrough = Omit<StoredPlaythrough, 'state'> & {
  state: PlaythroughState;
};

export type ResolvedPlaythrough =
  | {
      compatible: true;
      scenario: Scenario;
      playthrough: ValidatedStoredPlaythrough;
    }
  | {
      compatible: false;
      scenario: Scenario | undefined;
      playthrough: StoredPlaythrough;
      /**
       * The validated state when the stored document is valid v1 (content
       * incompatibility or a missing Scenario with a readable document).
       * Undefined when the stored document itself is invalid: the caller must
       * render a safe Journal-only view and never interpret the raw bytes.
       */
      parsed: PlaythroughState | undefined;
    };

/** Validate raw stored state against the current (v2) schema. Anything else (including retired v1 documents) is undefined. */
export function validateStoredState(value: unknown): PlaythroughState | undefined {
  const result = PlaythroughStateSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

/**
 * Best-effort character name for safe read-only screens: the validated name
 * when available, otherwise the raw document's name when it is a non-empty
 * string, otherwise the fallback (the Journal renderer takes any string and
 * never crashes on it).
 */
export function safeCharacterName(rawState: unknown, fallback: string): string {
  const parsed = validateStoredState(rawState);
  if (parsed !== undefined) return parsed.character.name;
  const record = (rawState ?? {}) as Record<string, unknown>;
  const character = record.character as Record<string, unknown> | undefined;
  const name = character?.name;
  return typeof name === 'string' && name !== '' ? name : fallback;
}

/**
 * Load a Playthrough and resolve it against the Scenario collection.
 * Returns null when the row does not belong to the Session (the caller
 * answers 404, revealing nothing).
 *
 * Missing Scenarios and invalid stored documents return incompatible without
 * any state write; the Journal remains readable through the returned row id.
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
  // Only current v2 documents validate here. Retired v1 documents (whose
  // migration left with the tactical Combat in S4) and malformed envelopes
  // are invalid: fail validation without rewriting them and without blocking
  // Journal access.
  const parsedV2 = validateStoredState(row.state);
  const isV3 =
    typeof row.state === 'object' &&
    row.state !== null &&
    'schemaVersion' in row.state &&
    readPlaythroughV3Document(row.state).ok;
  if (isV3) {
    // Combat MVP 1.0 documents (P2, issue #232): malformed envelopes, unknown
    // `schemaVersion` values and wrong `rulesVersion` values parse as invalid
    // and read as read-only with the Journal. A valid v3 document stays
    // read-only too until P6 wires the Scenario adapter (gameplay, rendering
    // and the v3 reference check): the row is never rewritten here either way.
    return { compatible: false, scenario, playthrough: row, parsed: undefined };
  }
  if (parsedV2 === undefined) {
    return { compatible: false, scenario, playthrough: row, parsed: undefined };
  }
  if (scenario === undefined) {
    // No state write: without the Scenario there is nothing valid to check
    // towards. A current v2 document still parses for read-only views; the
    // Journal stays readable through the returned row id either way.
    return {
      compatible: false,
      scenario: undefined,
      playthrough: row,
      parsed: parsedV2,
    };
  }
  // The reference check runs before both the same-hash fast path and the
  // changed-hash path below. Only v2 documents reach it.
  const state: PlaythroughState = parsedV2;
  const migrated = false;
  if (!migrated && row.contentHash === scenario.contentHash) {
    return { compatible: true, scenario, playthrough: { ...row, state } };
  }
  const check = checkPlaythroughCompatibility(scenario, state);
  if (!check.ok) {
    return { compatible: false, scenario, playthrough: row, parsed: state };
  }
  // A migrated Playthrough that is compatible is written back with the pin,
  // in the same step-guarded update, without advancing `step` and without a
  // Journal entry.
  const pinned: PlaythroughState = {
    ...state,
    scenarioVersion: scenario.version,
    contentHash: scenario.contentHash,
  };
  if (await store.updatePin(row.id, pinned, row.step)) {
    const updated = await store.findById(row.id);
    const reparsed = updated === null ? undefined : validateStoredState(updated.state);
    if (updated !== null && reparsed !== undefined) {
      return { compatible: true, scenario, playthrough: { ...updated, state: reparsed } };
    }
    return { compatible: true, scenario, playthrough: { ...row, state: pinned } };
  }
  // A turn committed between the read and the pin update: report its fresh
  // row instead of overwriting it with the older state. Revalidate the fresh
  // row the same way: never report an unvalidated document as current v2.
  const fresh = await store.findById(row.id);
  if (fresh === null || fresh.sessionId !== sessionHash) {
    return null;
  }
  // A turn committed between the read and the pin update: revalidate the
  // fresh row the same way, never reporting an unvalidated document as
  // current v2. A v3 row committed meanwhile is read-only until P6 wires the
  // adapter.
  const freshIsV3 =
    typeof fresh.state === 'object' &&
    fresh.state !== null &&
    'schemaVersion' in fresh.state &&
    readPlaythroughV3Document(fresh.state).ok;
  if (freshIsV3) {
    return { compatible: false, scenario, playthrough: fresh, parsed: undefined };
  }
  const freshState = validateStoredState(fresh.state);
  if (freshState === undefined) {
    return { compatible: false, scenario, playthrough: fresh, parsed: undefined };
  }
  if (fresh.contentHash === scenario.contentHash) {
    return { compatible: true, scenario, playthrough: { ...fresh, state: freshState } };
  }
  if (!checkPlaythroughCompatibility(scenario, freshState).ok) {
    return { compatible: false, scenario, playthrough: fresh, parsed: freshState };
  }
  return { compatible: true, scenario, playthrough: { ...fresh, state: freshState } };
}

/**
 * List every Playthrough of a Session through the Scenario-aware read layer:
 * each entry resolves (and pins on a passing check) exactly like a single
 * read, so the list never surfaces an unvalidated state as playable.
 */
export async function listSessionPlaythroughs(
  db: Kysely<Database>,
  resolveScenario: (scenarioId: string) => Scenario | undefined,
  sessionHash: string | undefined,
): Promise<ResolvedPlaythrough[]> {
  if (sessionHash === undefined) return [];
  const store = new PlaythroughStore(db);
  const stored = await store.listBySession(sessionHash);
  const entries = await Promise.all(
    stored.map((playthrough) =>
      resolvePlaythrough(db, resolveScenario, playthrough.id, sessionHash),
    ),
  );
  return entries.filter((entry) => entry !== null);
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
  state: ValidatedStoredPlaythrough['state'],
  viewKind: 'location' | 'scene' | 'ended',
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
