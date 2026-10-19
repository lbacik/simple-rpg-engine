// Shared Combat core: versioned rules table for MVP 1.0
// (rules §§2, 4, 5, 8, 10, docs/spec/combat-contract.md).
//
// All statistics come from this table, keyed by rulesVersion.
// Content may set per instance only power, phaseOffset, waitAge,
// the initial group and engagements, and hp/stamina within range.
// Pure data: no IO, no Date, no randomness, no text.

import type { ActionId, CardId, ProfileId, RulesVersion, Stance } from './types';

export const RULES_VERSION: RulesVersion = 'simple-rpg-engine-stance-cards-1.0';
export type { RulesVersion };

/** Rules versions this core understands. A single MVP 1.0 version. */
export const SUPPORTED_RULES_VERSIONS: readonly string[] = [RULES_VERSION];

export interface ProfileStats {
  maxHp: number;
  /** Null for enemies, who have no stamina. */
  maxStamina: number | null;
  skill: number;
  defense: number;
  armor: number;
  /** Null when the profile uses the card table value (hero heavies). */
  strikeBase: number | null;
  heavyBase: number | null;
  /** Null for units without a shot. The hero has no shot in the base set. */
  shotBase: number | null;
}

export const PROFILES: Record<ProfileId, ProfileStats> = {
  hero: { maxHp: 40, maxStamina: 10, skill: 4, defense: 4, armor: 1, strikeBase: 8, heavyBase: null, shotBase: null },
  'party-sentinel': { maxHp: 24, maxStamina: 8, skill: 4, defense: 4, armor: 1, strikeBase: 8, heavyBase: null, shotBase: null },
  'party-archer': { maxHp: 18, maxStamina: 8, skill: 4, defense: 4, armor: 0, strikeBase: 8, heavyBase: null, shotBase: 5 },
  raider: { maxHp: 14, maxStamina: null, skill: 4, defense: 4, armor: 0, strikeBase: 7, heavyBase: 12, shotBase: null },
  brute: { maxHp: 26, maxStamina: null, skill: 4, defense: 4, armor: 1, strikeBase: 8, heavyBase: 12, shotBase: null },
  sentinel: { maxHp: 20, maxStamina: null, skill: 4, defense: 4, armor: 1, strikeBase: 6, heavyBase: 11, shotBase: null },
  archer: { maxHp: 12, maxStamina: null, skill: 4, defense: 4, armor: 0, strikeBase: 4, heavyBase: null, shotBase: 6 },
};

export interface StanceModifiers {
  attack: number;
  defense: number;
}

export const STANCES: Record<Stance, StanceModifiers> = {
  aggressive: { attack: 2, defense: -2 },
  balanced: { attack: 0, defense: 0 },
  defensive: { attack: -2, defense: 2 },
};

export const STANCE_IDS = Object.keys(STANCES) as Stance[];

export interface CardRules {
  cost: number;
  stances: readonly Stance[];
  /** Hit-test accuracy contribution. */
  accuracy: number;
  /** Raw base damage before power, Prepare and reductions. */
  baseDamage: number | null;
  /** Higher acts earlier. Counterattack is a reaction, not a queue entry. */
  priority: number | null;
  /** Cooldown in full rounds: played in r, available from r + CD + 1. */
  cooldown: number;
}

export const CARDS: Record<CardId, CardRules> = {
  heavy: { cost: 4, stances: ['aggressive', 'balanced'], accuracy: -1, baseDamage: 13, priority: 10, cooldown: 1 },
  counter: { cost: 3, stances: ['balanced', 'defensive'], accuracy: 2, baseDamage: 7, priority: null, cooldown: 1 },
  feint: { cost: 2, stances: ['aggressive', 'balanced'], accuracy: 2, baseDamage: 6, priority: 30, cooldown: 0 },
  cover: { cost: 2, stances: ['balanced', 'defensive'], accuracy: 0, baseDamage: null, priority: null, cooldown: 0 },
  charge: { cost: 3, stances: ['aggressive'], accuracy: 0, baseDamage: 6, priority: 20, cooldown: 0 },
  prepare: { cost: 0, stances: ['aggressive', 'balanced', 'defensive'], accuracy: 0, baseDamage: null, priority: null, cooldown: 0 },
};

/** Feint base against an actual recipient in the Defensive stance. */
export const FEINT_BASE_VS_DEFENSIVE = 9;

export interface BasicActionRules {
  cost: number;
  accuracy: number;
  /** Null: taken from the actor's profile (shot) or not a hit (brace). */
  baseDamage: number | null;
  priority: number | null;
}

export const BASIC_ACTIONS: Record<'strike' | 'brace' | 'shot', BasicActionRules> = {
  strike: { cost: 0, accuracy: 0, baseDamage: 8, priority: 20 },
  brace: { cost: 0, accuracy: 0, baseDamage: null, priority: null },
  shot: { cost: 0, accuracy: 0, baseDamage: null, priority: 20 },
};

export const MOVEMENT_COSTS: Record<'approach' | 'disengage' | 'withdraw', number> = {
  approach: 0,
  disengage: 1,
  withdraw: 0,
};

/** Guard pools established in the declaration phase. */
export const GUARD: Record<'brace' | 'cover' | 'wait', number> = {
  brace: 6,
  cover: 6,
  wait: 3,
};

/** Exposed penalty to defense after a declared Heavy Blow. */
export const EXPOSED_PENALTY = 2;
/** Damage parried by a triggered Counterattack, before armor and guard. */
export const COUNTER_PARRY = 6;
/** Counterattack riposte values. */
export const RIPOSTE = { accuracy: 2, baseDamage: 7 } as const;
/** Prepare bonus captured into the next offensive action. */
export const PREPARED_BONUS = { accuracy: 2, damage: 3 } as const;
/** Extra stamina for a living hero/companion after a Prepare round. */
export const REGENERATION = { base: 2, afterPrepare: 3 } as const;

/** At most two enemy primary attacks per round hold a slot. */
export const ATTACK_SLOT_BUDGET = 2;
/** A fight without victory or defeat after this many full rounds is DRAW_LIMIT. */
export const MAX_ROUNDS = 30;
/** Rounds are numbered from 1. */
export const MIN_ROUND = 1;
/** A combat pits the hero (plus at most one companion) against 1–5 enemies. */
export const MIN_ENEMIES = 1;
export const MAX_ENEMIES = 5;
/** Action ids the hero may choose. `wait` is enemy-only. */
export const HERO_ACTION_IDS: readonly ActionId[] = [
  'heavy',
  'counter',
  'feint',
  'cover',
  'charge',
  'prepare',
  'strike',
  'brace',
  'shot',
  'approach',
  'disengage',
  'withdraw',
];

export function isCardId(actionId: ActionId): actionId is CardId {
  return actionId in CARDS;
}
