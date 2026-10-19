// Fixtures for the Combat core P1a suites: explicit §12 states.
// Per the §15.3 preamble, tests initialised from an unusual state set
// positions, stances, plans and bonuses explicitly here.

import type { CombatActor, CombatState, RoundCommand } from '../src/engine/combat/index';
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

/** Reference scenarios T1–T7 (rules §15.2) as initial PLAN states.
 *  Per §15.2 every fight starts with full health and stamina, waitAge 0 and
 *  phaseOffset 0; everyone is in g0 with the stated engagements unless the
 *  table places someone in g1. nextGroupSerial exceeds every group in use. */
export type ScenarioId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7';

export const SCENARIO_IDS: readonly ScenarioId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function scenarioInitial(id: ScenarioId): CombatState {
  const base: {
    rulesVersion: CombatState['rulesVersion'];
    round: number;
    phase: CombatState['phase'];
    result: null;
    frozenEnemyPlans: CombatState['frozenEnemyPlans'];
    frozenCompanionPlan: null;
    log: CombatState['log'];
  } = {
    rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
    round: 1,
    phase: 'PLAN',
    result: null,
    frozenEnemyPlans: [],
    frozenCompanionPlan: null,
    log: [],
  };
  switch (id) {
    case 'T1':
      return {
        ...base,
        nextGroupSerial: 1,
        actors: [heroActor(), enemyActor('e01', 'brute')],
        engagements: [['e01', 'h01']],
      };
    case 'T2':
      return {
        ...base,
        nextGroupSerial: 1,
        actors: [heroActor(), enemyActor('e01', 'sentinel')],
        engagements: [['e01', 'h01']],
      };
    case 'T3':
      return {
        ...base,
        nextGroupSerial: 1,
        actors: [heroActor(), enemyActor('e01', 'raider'), enemyActor('e02', 'raider'), enemyActor('e03', 'raider')],
        engagements: [
          ['e01', 'h01'],
          ['e02', 'h01'],
          ['e03', 'h01'],
        ],
      };
    case 'T4':
      return {
        ...base,
        nextGroupSerial: 2,
        actors: [heroActor({ groupId: 'g0' }), enemyActor('e01', 'raider', { groupId: 'g0' }), enemyActor('e02', 'archer', { groupId: 'g1' })],
        engagements: [['e01', 'h01']],
      };
    case 'T5':
      return {
        ...base,
        nextGroupSerial: 2,
        actors: [heroActor({ groupId: 'g0' }), enemyActor('e01', 'archer', { groupId: 'g1' })],
        engagements: [],
      };
    case 'T6':
      return {
        ...base,
        nextGroupSerial: 2,
        actors: [
          heroActor({ groupId: 'g0' }),
          companionActor('party-sentinel', { groupId: 'g0' }),
          enemyActor('e01', 'raider', { groupId: 'g0' }),
          enemyActor('e02', 'raider', { groupId: 'g0' }),
          enemyActor('e03', 'archer', { groupId: 'g1' }),
        ],
        engagements: [
          ['e01', 'h01'],
          ['e02', 'h01'],
        ],
      };
    case 'T7':
      return {
        ...base,
        nextGroupSerial: 2,
        actors: [
          heroActor({ groupId: 'g0' }),
          companionActor('party-archer', { groupId: 'g0' }),
          enemyActor('e01', 'raider', { groupId: 'g0' }),
          enemyActor('e02', 'raider', { groupId: 'g0' }),
          enemyActor('e03', 'sentinel', { groupId: 'g0' }),
          enemyActor('e04', 'archer', { groupId: 'g1' }),
          enemyActor('e05', 'archer', { groupId: 'g1' }),
        ],
        engagements: [
          ['e01', 'h01'],
          ['e02', 'h01'],
        ],
      };
  }
}

/** The stated winning sequences: T1 plays the duel 11.1, T5 the run 11.4. */
export const T1_WINNING_SEQUENCE: readonly RoundCommand[] = [
  { round: 1, stance: 'defensive', actionId: 'counter', targetId: 'h01' },
  { round: 2, stance: 'balanced', actionId: 'feint', targetId: 'e01' },
  { round: 3, stance: 'aggressive', actionId: 'heavy', targetId: 'e01' },
];

export const T5_WINNING_SEQUENCE: readonly RoundCommand[] = [
  { round: 1, stance: 'defensive', actionId: 'approach', targetId: 'e01' },
  { round: 2, stance: 'aggressive', actionId: 'charge', targetId: 'e01' },
  { round: 3, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
];

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
