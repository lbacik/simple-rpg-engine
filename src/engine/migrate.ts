// Deterministic version 1 to version 2 migration
// (docs/spec/playthrough-state.md, version 1 to version 2; ADR 0005;
// tactical-combat-handoff package "State versions and compatibility",
// issue #124).
//
// A version is a frozen contract: each stored version is validated strictly
// against its own schema, then migrated one version at a time. A document
// with an unknown or newer version is an error, never downgraded or guessed.
// Migration is a pure function of the stored document and the current
// Scenario: it draws no randomness, so repeating it gives the same result,
// and a current document is returned unchanged.
//
// The participant id comes from the current content, because version 1 stores
// no Enemy id. It is unambiguous while the Encounter has one participant. If
// the Encounter no longer exists, or now has two participants, the stored
// Damage cannot be assigned and the Playthrough is incompatible. An Encounter
// with no saved record may change freely within the content rules.
//
// The migrated Combat's Intent is selected by the ordinary rules without rule
// 3: a heavy Enemy does not draw to Prepare in this first Round, so the
// selection needs no randomness (selectIntents with the Prepare draw
// disabled). Nothing resolves during migration: no action, no Journal entry.
// The old Defend bonus expired within its own turn, so nothing of it carries
// over.

import type { Scenario } from '../content/model';
import type { Rng } from './index';
import {
  PlaythroughStateSchema,
  STATE_VERSION,
  type PlaythroughState,
} from './state';
import {
  PlaythroughStateV1Schema,
  STATE_VERSION_V1,
  type PlaythroughStateV1,
} from './state-v1';
import { selectIntents } from './tactical';

/** A stored document by version: v1, current v2, or neither. */
export type VersionedState =
  | { kind: 'v1'; state: PlaythroughStateV1 }
  | { kind: 'v2'; state: PlaythroughState }
  | { kind: 'invalid' };

/**
 * Validate a stored document against its own version's strict schema. Unknown
 * or newer versions, missing versions and invalid documents are `invalid`:
 * never interpreted as v1, never rewritten.
 */
export function parseVersionedState(value: unknown): VersionedState {
  if (typeof value !== 'object' || value === null) {
    return { kind: 'invalid' };
  }
  const version = (value as { stateVersion?: unknown }).stateVersion;
  if (version === STATE_VERSION) {
    const parsed = PlaythroughStateSchema.safeParse(value);
    return parsed.success ? { kind: 'v2', state: parsed.data } : { kind: 'invalid' };
  }
  if (version === STATE_VERSION_V1) {
    const parsed = PlaythroughStateV1Schema.safeParse(value);
    return parsed.success ? { kind: 'v1', state: parsed.data } : { kind: 'invalid' };
  }
  return { kind: 'invalid' };
}

export type MigrationResult =
  | { ok: true; state: PlaythroughState }
  | { ok: false; reasons: string[] };

/**
 * Migration draws no randomness: this source fails the migration if Intent
 * selection ever draws, instead of silently consuming production dice.
 */
function noRandomness(): Rng {
  return () => {
    throw new Error('v1 migration draws no randomness');
  };
}

/** Why the recorded Damage for one Encounter cannot be assigned. */
function assignmentFailure(scenario: Scenario, encounterId: string): string {
  const encounter = scenario.encountersById[encounterId];
  if (encounter === undefined) {
    return `unknown encounter "${encounterId}"`;
  }
  return (
    `encounter "${encounterId}" has ${encounter.participants.length} participants: ` +
    `cannot assign the recorded single-Enemy Damage taken`
  );
}

/**
 * Migrate a version 1 document to strict state v2 against the current
 * Scenario. Deterministic: no randomness, no Journal, no resolution. Fails as
 * incompatible when a recorded Encounter (or the active Combat's Encounter)
 * is missing or now has two participants; the caller preserves the original
 * bytes and writes nothing.
 */
export function migratePlaythroughState(
  v1: PlaythroughStateV1,
  scenario: Scenario,
): MigrationResult {
  const reasons: string[] = [];
  const fail = (reason: string): void => {
    reasons.push(reason);
  };

  // Damage taken `n` for Encounter E becomes E's record `{ p: n }`, where `p`
  // is E's only participant in the current content. Zero-Damage entries are
  // kept: the participant is at full Health.
  const encounters: Record<string, Record<string, number>> = {};
  for (const [encounterId, taken] of Object.entries(v1.encounterDamage)) {
    const encounter = scenario.encountersById[encounterId];
    const participant = encounter?.participants[0];
    if (encounter === undefined || encounter.participants.length !== 1 || participant === undefined) {
      fail(assignmentFailure(scenario, encounterId));
      continue;
    }
    encounters[encounterId] = { [participant.id]: taken };
  }

  // The carried-over Combat keeps its round and Range; its starting
  // membership and Round tie-break order are both `[p]`, and its first Intent
  // is selected deterministically without the Prepare draw, unprepared and
  // not Wary.
  let activeCombat: PlaythroughState['activeCombat'];
  if (v1.activeCombat != null) {
    const combat = v1.activeCombat;
    const encounter = scenario.encountersById[combat.encounterId];
    const participant = encounter?.participants[0];
    if (encounter === undefined || encounter.participants.length !== 1 || participant === undefined) {
      fail(assignmentFailure(scenario, combat.encounterId));
    } else {
      const selection = selectIntents(
        [{ participant, range: combat.range, prepared: false }],
        noRandomness(),
        { allowPrepareDraw: false },
      );
      activeCombat = {
        encounterId: encounter.id,
        round: combat.round,
        startedParticipants: [participant.id],
        roundParticipantOrder: [participant.id],
        participants: {
          [participant.id]: {
            range: combat.range,
            intent: selection.intents[participant.id] ?? 'strike',
            prepared: selection.prepared[participant.id] ?? false,
          },
        },
      };
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  // Everything else is unchanged; the v1-only Damage-taken table is replaced
  // by the per-participant record (the strict v2 schema rejects the old key).
  const {
    encounterDamage: _taken,
    stateVersion: _version,
    activeCombat: _combat,
    ...rest
  } = v1;
  void _taken;
  void _version;
  const candidate = {
    ...rest,
    stateVersion: STATE_VERSION,
    encounters,
    activeCombat: activeCombat ?? _combat ?? null,
  };
  const parsed = PlaythroughStateSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reasons: ['migrated document fails strict state v2 validation'] };
  }
  return { ok: true, state: parsed.data };
}
