// Arena Setup (Combat MVP 1.0, P5 A1): the Setup a run starts from and the
// presets T1–T7 that build the §15.2 states.
//
// The opponents' explicit order is the authored order the adapter assigns
// e01–e05 in, so it breaks ties (docs/spec/combat-contract.md, actor ids).
// Actor ids are positional: h01 the hero, c01 the companion when one fights,
// e01–e05 the enemies. The hero needs no setup: no equipment.
//
// Pure data and functions: no IO, no Date, no randomness, no text.
// Statistics come only from the versioned rules table; per instance the
// Setup sets only power, phaseOffset, the initial group and engagements.

import { canonicalizeEngagements } from './range';
import { PROFILES } from './rules';
import type { CombatActor, CombatState, GroupId, ProfileId } from './types';

/** Enemy profiles the Arena offers, in explicit authored order. */
export type ArenaOpponentProfile = 'raider' | 'brute' | 'sentinel' | 'archer';

export const ARENA_OPPONENT_PROFILES: readonly ArenaOpponentProfile[] = [
  'raider',
  'brute',
  'sentinel',
  'archer',
];

/** Companion profiles the Arena offers. */
export type ArenaCompanionProfile = 'party-sentinel' | 'party-archer';

export const ARENA_COMPANIONS: readonly ArenaCompanionProfile[] = ['party-sentinel', 'party-archer'];

/** Power bounds for Arena opponents (rules §8.1, contract authoring bound). */
export const ARENA_MAX_POWER = 3;

/** How many opponents one Setup holds. */
export const ARENA_MIN_OPPONENTS = 1;
export const ARENA_MAX_OPPONENTS = 5;

export interface ArenaOpponent {
  profileId: ArenaOpponentProfile;
  startingGroup: GroupId;
  engagedWithHero: boolean;
  /** Enemies only; default 0 (rules §8.1). */
  phaseOffset?: number;
  /** 0..3, default 0. */
  power?: number;
}

export interface ArenaSetup {
  /** 1..5 opponents, in explicit order: e01–e05. */
  opponents: ArenaOpponent[];
  companion?: ArenaCompanionProfile;
}

export type ArenaSetupIssueCode =
  | 'bad_setup'
  | 'bad_opponent_count'
  | 'bad_opponent_profile'
  | 'bad_starting_group'
  | 'bad_engaged_flag'
  | 'bad_phase_offset'
  | 'bad_power'
  | 'bad_companion';

export interface ArenaSetupIssue {
  code: ArenaSetupIssueCode;
  /** Zero-based opponent index the issue belongs to, when it is per-opponent. */
  index?: number;
}

export type ArenaSetupResult = { ok: true; setup: ArenaSetup } | { ok: false; issues: ArenaSetupIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const GROUP_ID_PATTERN = /^g\d+$/;

function isOpponentProfile(value: unknown): value is ArenaOpponentProfile {
  return (
    value === 'raider' || value === 'brute' || value === 'sentinel' || value === 'archer'
  );
}

function isCompanionProfile(value: unknown): value is ArenaCompanionProfile {
  return value === 'party-sentinel' || value === 'party-archer';
}

/**
 * Strictly parse an Arena Setup: 1–5 opponents in explicit order, each with
 * a starting group, an engaged-with-hero flag, phaseOffset and power, plus
 * an optional Companion. Unknown shapes read as failures the caller renders
 * from its own catalogue; nothing is repaired or defaulted beyond the
 * documented phaseOffset/power defaults applied at build time.
 */
export function parseArenaSetup(value: unknown): ArenaSetupResult {
  if (!isRecord(value)) return { ok: false, issues: [{ code: 'bad_setup' }] };
  const issues: ArenaSetupIssue[] = [];
  const opponentsValue = value['opponents'];
  let opponents: ArenaOpponent[] = [];
  if (
    !Array.isArray(opponentsValue) ||
    opponentsValue.length < ARENA_MIN_OPPONENTS ||
    opponentsValue.length > ARENA_MAX_OPPONENTS
  ) {
    issues.push({ code: 'bad_opponent_count' });
  } else {
    opponents = [];
    opponentsValue.forEach((entry, index) => {
      if (!isRecord(entry)) {
        issues.push({ code: 'bad_setup', index });
        return;
      }
      const opponent: ArenaOpponent = {
        profileId: 'raider',
        startingGroup: 'g0',
        engagedWithHero: false,
      };
      let valid = true;
      if (!isOpponentProfile(entry['profileId'])) {
        issues.push({ code: 'bad_opponent_profile', index });
        valid = false;
      } else {
        opponent.profileId = entry['profileId'];
      }
      if (typeof entry['startingGroup'] !== 'string' || !GROUP_ID_PATTERN.test(entry['startingGroup'])) {
        issues.push({ code: 'bad_starting_group', index });
        valid = false;
      } else {
        opponent.startingGroup = entry['startingGroup'];
      }
      if (typeof entry['engagedWithHero'] !== 'boolean') {
        issues.push({ code: 'bad_engaged_flag', index });
        valid = false;
      } else {
        opponent.engagedWithHero = entry['engagedWithHero'];
      }
      const phaseOffset = entry['phaseOffset'];
      if (phaseOffset !== undefined) {
        if (!isNonNegativeInteger(phaseOffset)) {
          issues.push({ code: 'bad_phase_offset', index });
          valid = false;
        } else {
          opponent.phaseOffset = phaseOffset;
        }
      }
      const power = entry['power'];
      if (power !== undefined) {
        if (!isNonNegativeInteger(power) || power > ARENA_MAX_POWER) {
          issues.push({ code: 'bad_power', index });
          valid = false;
        } else {
          opponent.power = power;
        }
      }
      if (valid) opponents.push(opponent);
    });
  }
  const companionValue = value['companion'];
  let companion: ArenaCompanionProfile | undefined;
  if (companionValue !== undefined && companionValue !== null) {
    if (!isCompanionProfile(companionValue)) {
      issues.push({ code: 'bad_companion' });
    } else {
      companion = companionValue;
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, setup: companion === undefined ? { opponents } : { opponents, companion } };
}

function groupNumber(groupId: GroupId): number {
  return Number(/^g(\d+)$/.exec(groupId)?.[1] ?? 0);
}

function heroActor(): CombatActor {
  return {
    id: 'h01',
    ref: null,
    team: 'heroes',
    role: 'hero',
    profileId: 'hero',
    hp: PROFILES['hero'].maxHp,
    stamina: PROFILES['hero'].maxStamina,
    stance: 'balanced',
    groupId: 'g0',
    readyRound: null,
    availableRound: { heavy: 1, counter: 1, feint: 1, cover: 1, charge: 1, prepare: 1 },
  };
}

function companionActor(profileId: ArenaCompanionProfile): CombatActor {
  const stats = PROFILES[profileId];
  return {
    id: 'c01',
    ref: null,
    team: 'heroes',
    role: 'companion',
    profileId,
    hp: stats.maxHp,
    stamina: stats.maxStamina,
    stance: 'balanced',
    groupId: 'g0',
    readyRound: null,
    availableRound: {},
  };
}

function enemyActor(id: string, profileId: ProfileId, opponent: ArenaOpponent): CombatActor {
  const power = opponent.power ?? 0;
  return {
    id,
    ref: null,
    team: 'enemies',
    role: 'enemy',
    profileId,
    hp: PROFILES[profileId].maxHp,
    stamina: null,
    stance: 'balanced',
    groupId: opponent.startingGroup,
    readyRound: null,
    availableRound: {},
    // The §15.2 reference states carry power only when it differs from the
    // default 0 (rules §8.1); preset twins of those states must match them
    // exactly, so the default stays absent here as well.
    ...(power === 0 ? {} : { power }),
    phaseOffset: opponent.phaseOffset ?? 0,
    waitAge: 0,
  };
}

/**
 * Build the initial Combat state (phase PLAN, round 1, no plans, empty log)
 * for an Arena Setup. Every fight starts with full health and stamina,
 * waitAge 0 and phaseOffset/power from the Setup; everyone the table does
 * not place elsewhere is in g0 with the stated engagements before round 1
 * (rules §15.2). Actor ids are positional in the opponents' explicit order.
 */
export function buildArenaInitial(setup: ArenaSetup): CombatState {
  const actors: CombatActor[] = [heroActor()];
  if (setup.companion !== undefined) actors.push(companionActor(setup.companion));
  const pairs: [string, string][] = [];
  setup.opponents.forEach((opponent, index) => {
    const id = `e0${index + 1}`;
    actors.push(enemyActor(id, opponent.profileId, opponent));
    if (opponent.engagedWithHero) pairs.push([id, 'h01']);
  });
  let maxGroup = 0;
  for (const actor of actors) maxGroup = Math.max(maxGroup, groupNumber(actor.groupId));
  return {
    rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
    round: 1,
    phase: 'PLAN',
    result: null,
    nextGroupSerial: maxGroup + 1,
    actors,
    engagements: canonicalizeEngagements(pairs),
    frozenEnemyPlans: [],
    frozenCompanionPlan: null,
    log: [],
  };
}

export type ArenaPresetId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7';

export const ARENA_PRESET_IDS: readonly ArenaPresetId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function opponent(
  profileId: ArenaOpponentProfile,
  startingGroup: GroupId,
  engagedWithHero: boolean,
): ArenaOpponent {
  return { profileId, startingGroup, engagedWithHero, phaseOffset: 0, power: 0 };
}

/**
 * Presets T1–T7 build the §15.2 states: the composition and position table
 * as Setups, so a preset fight and its hand-built Setup twin start the same
 * state and Fight again reproduces either from the remembered Setup.
 */
export const ARENA_PRESETS: Record<ArenaPresetId, ArenaSetup> = {
  T1: { opponents: [opponent('brute', 'g0', true)] },
  T2: { opponents: [opponent('sentinel', 'g0', true)] },
  T3: {
    opponents: [
      opponent('raider', 'g0', true),
      opponent('raider', 'g0', true),
      opponent('raider', 'g0', true),
    ],
  },
  T4: {
    opponents: [opponent('raider', 'g0', true), opponent('archer', 'g1', false)],
  },
  T5: { opponents: [opponent('archer', 'g1', false)] },
  T6: {
    opponents: [
      opponent('raider', 'g0', true),
      opponent('raider', 'g0', true),
      opponent('archer', 'g1', false),
    ],
    companion: 'party-sentinel',
  },
  T7: {
    opponents: [
      opponent('raider', 'g0', true),
      opponent('raider', 'g0', true),
      opponent('sentinel', 'g0', false),
      opponent('archer', 'g1', false),
      opponent('archer', 'g1', false),
    ],
    companion: 'party-archer',
  },
};
