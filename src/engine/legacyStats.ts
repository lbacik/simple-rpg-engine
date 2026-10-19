// Transitional v1-stat shim over the v2 content model (P3; P2b deletes the
// old tactical Combat, P6 replaces it with the MVP core).
//
// The retired Enemy statistics are derived from the MVP profile table so the
// old Combat keeps compiling while v2 is the only accepted format: Health
// from the profile's `maxHp`, Damage from its `strikeBase`, Reach `ranged`
// only for `archer`. `behaviour: 'steady'` and the neutral attributes are
// arbitrary and carry no rules meaning under MVP 1.0.
//
// This module must stay free of Next.js, React and persistence imports
// (enforced by the no-restricted-imports rule in eslint.config.mjs).

import type { CompiledEncounter, CompiledEnemy, CompiledOutcome, CompiledParticipant } from '../content/model';
import { PROFILES } from './combat/rules';

export function legacyEnemyStats(enemy: CompiledEnemy): {
  health: number;
  damage: number;
  reach: 'melee' | 'ranged';
  behaviour: 'steady';
  attributes: { might: number; agility: number; wits: number; presence: number };
} {
  const profile = PROFILES[enemy.profile];
  return {
    health: profile.maxHp,
    damage: profile.strikeBase ?? 2,
    reach: enemy.profile === 'archer' ? 'ranged' : 'melee',
    behaviour: 'steady',
    attributes: { might: 1, agility: 1, wits: 1, presence: 1 },
  };
}

/** The old Encounter-level Range derived from per-participant `startRange`. */
export function legacyEncounterRange(encounter: CompiledEncounter): 'near' | 'far' {
  return encounter.participants.every((participant) => participant.startRange === 'far')
    ? 'far'
    : 'near';
}

/** The old per-participant Range derived from its authored `startRange`. */
export function legacyParticipantRange(participant: CompiledParticipant): 'near' | 'far' {
  return participant.startRange === 'far' ? 'far' : 'near';
}

/** The retired `escape` Outcome reads the v2 `surrender` Outcome. */
export function legacyEscapeOutcome(encounter: CompiledEncounter): CompiledOutcome {
  return encounter.surrender;
}
