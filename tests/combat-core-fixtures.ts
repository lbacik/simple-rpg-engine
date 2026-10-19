// Fixtures for the Combat core P1a suites: explicit §12 states.
// Per the §15.3 preamble, tests initialised from an unusual state set
// positions, stances, plans and bonuses explicitly here.

import type { CombatActor, CombatState } from '../src/engine/combat/index';
import { PROFILES } from '../src/engine/combat/index';

export function heroActor(overrides: Partial<CombatActor> = {}): CombatActor {
  return {
    id: 'h01',
    ref: null,
    team: 'heroes',
    role: 'hero',
    profileId: 'hero',
    hp: 40,
    stamina: 10,
    stance: 'balanced',
    groupId: 'g0',
    readyRound: null,
    availableRound: { heavy: 1, counter: 1, feint: 1, cover: 1, charge: 1, prepare: 1 },
    ...overrides,
  };
}

export function enemyActor(id: string, profileId: CombatActor['profileId'], overrides: Partial<CombatActor> = {}): CombatActor {
  return {
    id,
    ref: null,
    team: 'enemies',
    role: 'enemy',
    profileId,
    hp: PROFILES[profileId].maxHp,
    stamina: null,
    stance: 'balanced',
    groupId: 'g0',
    readyRound: null,
    availableRound: {},
    phaseOffset: 0,
    waitAge: 0,
    ...overrides,
  };
}

export function companionActor(kind: 'party-sentinel' | 'party-archer', overrides: Partial<CombatActor> = {}): CombatActor {
  return {
    id: 'c01',
    ref: null,
    team: 'heroes',
    role: 'companion',
    profileId: kind,
    hp: PROFILES[kind].maxHp,
    stamina: 8,
    stance: 'balanced',
    groupId: 'g0',
    readyRound: null,
    availableRound: {},
    ...overrides,
  };
}

/** The §12 sample: pre-round-1 duel against a Brute, phase PLAN. */
export function duelPlanState(): CombatState {
  return {
    rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
    round: 1,
    phase: 'PLAN',
    result: null,
    nextGroupSerial: 1,
    actors: [heroActor(), enemyActor('e01', 'brute')],
    engagements: [['e01', 'h01']],
    frozenEnemyPlans: [],
    frozenCompanionPlan: null,
    log: [],
  };
}

/** A CHOOSE duel: hero engaged with a Raider, no companion. */
export function duelChooseState(): CombatState {
  return {
    rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
    round: 1,
    phase: 'CHOOSE',
    result: null,
    nextGroupSerial: 1,
    actors: [heroActor(), enemyActor('e01', 'raider')],
    engagements: [['e01', 'h01']],
    frozenEnemyPlans: [
      {
        actorId: 'e01',
        stance: 'aggressive',
        actionId: 'strike',
        targetId: 'h01',
        moveVariant: null,
        wasCandidate: true,
        attackSlot: true,
        baseDamage: 7,
        priority: 20,
      },
    ],
    frozenCompanionPlan: null,
    log: [],
  };
}
