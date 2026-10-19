// Shared Combat core: public entry point (MVP 1.0, P1a).
//
// Pure and isomorphic: no IO, no Date, no randomness, no text.
// Planning (P1b) and resolution (P1c) extend this module.

export type {
  ActionId,
  ActorId,
  CardId,
  CombatActor,
  CombatEvent,
  CombatPhase,
  CombatResult,
  CombatState,
  CommandOption,
  GroupId,
  InitialCombatState,
  MoveVariant,
  OptionReason,
  ParseIssue,
  ParseIssueCode,
  ParseResult,
  ProfileId,
  Range,
  ReasonCode,
  Role,
  RoundCommand,
  Stance,
  Team,
} from './types';
export {
  ATTACK_SLOT_BUDGET,
  BASIC_ACTIONS,
  CARDS,
  COUNTER_PARRY,
  EXPOSED_PENALTY,
  FEINT_BASE_VS_DEFENSIVE,
  GUARD,
  HERO_ACTION_IDS,
  MAX_ENEMIES,
  MAX_ROUNDS,
  MIN_ENEMIES,
  MIN_ROUND,
  MOVEMENT_COSTS,
  PREPARED_BONUS,
  PROFILES,
  REGENERATION,
  RIPOSTE,
  RULES_VERSION,
  STANCES,
  STANCE_IDS,
  SUPPORTED_RULES_VERSIONS,
  isCardId,
} from './rules';
export type { BasicActionRules, CardRules, ProfileStats, RulesVersion, StanceModifiers } from './rules';
export {
  addEngagement,
  canonicalizeEngagements,
  engagementsOf,
  groupMembers,
  isFree,
  rangeOf,
  removeEngagementsOf,
} from './range';
export { findOption, listOptions } from './options';
export { parseCombatState } from './parse';
