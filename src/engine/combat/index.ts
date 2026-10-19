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
  CombatEventType,
  CombatPhase,
  CombatResult,
  CombatState,
  CommandOption,
  FrozenPlan,
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
  ENEMY_CYCLES,
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
export type { BasicActionRules, CardRules, CycleEntry, ProfileStats, RulesVersion, StanceModifiers } from './rules';
export {
  addEngagement,
  canonicalizeEngagements,
  engagementsOf,
  groupMembers,
  isFree,
  rangeOf,
  removeEngagementsOf,
} from './range';
export { findOption, listOptions, REASON_ORDER } from './options';
export { isPrimaryAttack, planRound, verifyFrozenPlans } from './plan';
export { PARSE_ISSUE_CODES, parseCombatState } from './parse';
export {
  ARENA_RUN_SCHEMA_VERSION,
  parseArenaRunDocument,
} from './arena-run';
export type {
  ArenaRunIssue,
  ArenaRunIssueCode,
  ArenaRunOrigin,
  ArenaRunRead,
  ArenaRunV1,
  VerifyFrozenPlans,
} from './arena-run';
export {
  ARENA_COMPANIONS,
  ARENA_MAX_OPPONENTS,
  ARENA_MAX_POWER,
  ARENA_MIN_OPPONENTS,
  ARENA_OPPONENT_PROFILES,
  ARENA_PRESETS,
  ARENA_PRESET_IDS,
  buildArenaInitial,
  parseArenaSetup,
} from './arena-setup';
export type {
  ArenaCompanionProfile,
  ArenaOpponent,
  ArenaOpponentProfile,
  ArenaPresetId,
  ArenaSetup,
  ArenaSetupIssue,
  ArenaSetupIssueCode,
  ArenaSetupResult,
} from './arena-setup';
export type { Accepted, CancelReason, Previewed, PreviewResult, Rejected, StartResult, SubmitResult, SurrenderResult } from './resolve';
export { CANCEL_REASONS, COMBAT_EVENT_TYPES, COMBAT_RESULTS, previewRound, startCombat, submitRound, surrender } from './resolve';
