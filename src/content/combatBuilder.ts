// Encounter → initial Combat state (content format v2, #184 Q4).
//
// A pure adapter from the authored arrangement to the shape the shared core
// accepts (`startCombat` in `src/engine/combat/resolve.ts`, rules §12). The
// Scenario adapter consumes this when a Combat starts; repeat fights rebuild
// from the authored arrangement with the persisted wounds (#183 lifecycle).
//
// Arrangement (#184 Q4), by each Participant's `startRange`:
// - `melee` → the hero's group `g0`, engaged with the hero (`[e0n, h01]`);
// - `near` → `g0`, no engagement;
// - `far` → the shared group `g1`, no engagement.
// `nextGroupSerial` is 2 when any Participant starts `far`, else 1. Relations
// are valid by construction: engagements stay within one group, never between
// allies, and the serial stays above every group in use (rules §12).
//
// Enemy actor ids (`e01`–) follow the authored Participant order, which is
// mechanically meaningful (tie-breaking, #181); the Participant id is kept as
// the opaque `ref`. Wounds are keyed by Participant id: a Participant whose
// wounds reach its profile's `maxHp` stays dead and is skipped (#183). The
// optional Companion (`c01`) always enters at full HP and stamina in `g0` with
// its definition id as `ref`. The hero (`h01`) enters in `g0` at the given HP
// with full stamina. Everyone starts `balanced` with `waitAge 0`; enemies
// carry their authored `power` and `phaseOffset`.

import { canonicalizeEngagements } from '../engine/combat/range';
import { PROFILES, RULES_VERSION } from '../engine/combat/rules';
import type {
  CombatActor,
  InitialCombatState,
} from '../engine/combat/types';
import type {
  CompiledCompanion,
  CompiledEncounter,
} from './model';

export type CombatBuilderOptions = {
  /** The hero's entry HP (profile max 40). Defaults to 40. */
  heroHp?: number;
  /** Wounds by Participant id, persisting across repeat fights (#183). */
  wounds?: Record<string, number>;
  /** The accompanying Companion definition, if one fights. */
  companion?: CompiledCompanion | null;
};

function fullStamina(profileId: 'hero' | 'party-sentinel' | 'party-archer'): number {
  const max = PROFILES[profileId].maxStamina;
  if (max === null) {
    throw new Error(`profile "${profileId}" has no stamina table entry`);
  }
  return max;
}

/**
 * Build the initial Combat state for an Encounter. Pure: reads the authored
 * Encounter, options and profile tables only. The result satisfies the core's
 * §12 shape when the content is valid (1–5 Participants, at least one living
 * enemy, a living hero); invalid content yields a well-formed state that
 * `startCombat` rejects with its ParseIssue codes.
 */
export function buildInitialCombatState(
  encounter: CompiledEncounter,
  options: CombatBuilderOptions = {},
): InitialCombatState {
  const heroHp = options.heroHp ?? PROFILES.hero.maxHp;
  const wounds = options.wounds ?? {};
  const companion = options.companion ?? null;

  const actors: CombatActor[] = [
    {
      id: 'h01',
      ref: null,
      team: 'heroes',
      role: 'hero',
      profileId: 'hero',
      hp: heroHp,
      stamina: fullStamina('hero'),
      stance: 'balanced',
      groupId: 'g0',
      readyRound: null,
      availableRound: {},
    },
  ];

  const engagements: [string, string][] = [];
  let anyFar = false;
  // Survivor counter, not the authored index: slain Participants leave no id
  // gaps, so the fight's enemies are always e01… in authored order (#181).
  let enemySerial = 0;
  encounter.participants.forEach((participant) => {
    const maxHp = PROFILES[participant.enemy.profile].maxHp;
    if ((wounds[participant.id] ?? 0) >= maxHp) {
      return;
    }
    enemySerial += 1;
    const id = `e0${enemySerial}`;
    const groupId = participant.startRange === 'far' ? 'g1' : 'g0';
    if (participant.startRange === 'far') {
      anyFar = true;
    }
    if (participant.startRange === 'melee') {
      engagements.push([id, 'h01']);
    }
    actors.push({
      id,
      ref: participant.id,
      team: 'enemies',
      role: 'enemy',
      profileId: participant.enemy.profile,
      hp: maxHp - (wounds[participant.id] ?? 0),
      stamina: null,
      stance: 'balanced',
      groupId,
      readyRound: null,
      availableRound: {},
      power: participant.power,
      phaseOffset: participant.phaseOffset,
      waitAge: 0,
    });
  });

  if (companion !== null) {
    actors.push({
      id: 'c01',
      ref: companion.id,
      team: 'heroes',
      role: 'companion',
      profileId: companion.profile,
      hp: PROFILES[companion.profile].maxHp,
      stamina: fullStamina(companion.profile),
      stance: 'balanced',
      groupId: 'g0',
      readyRound: null,
      availableRound: {},
    });
  }

  return {
    rulesVersion: RULES_VERSION,
    round: 1,
    phase: 'PLAN',
    result: null,
    nextGroupSerial: anyFar ? 2 : 1,
    actors,
    engagements: canonicalizeEngagements(engagements),
    frozenEnemyPlans: [],
    frozenCompanionPlan: null,
    log: [],
  };
}
