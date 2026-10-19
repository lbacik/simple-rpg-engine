// Shared Combat core: state types for MVP 1.0
// (rules §12, docs/spec/combat-contract.md).
//
// This module holds types only: no IO, no Date, no randomness, no text.

export type RulesVersion = 'simple-rpg-engine-stance-cards-1.0';

/** Canonical actor id: h01 (hero), c01 (companion), e01–e05 (enemies). */
export type ActorId = string;

/** Proximity-group label, e.g. g0. A label, not a coordinate. */
export type GroupId = string;

export type ProfileId =
  | 'hero'
  | 'party-sentinel'
  | 'party-archer'
  | 'raider'
  | 'brute'
  | 'sentinel'
  | 'archer';

export type Team = 'heroes' | 'enemies';
export type Role = 'hero' | 'companion' | 'enemy';
export type Stance = 'aggressive' | 'balanced' | 'defensive';

export type CardId = 'heavy' | 'counter' | 'feint' | 'cover' | 'charge' | 'prepare';

export type ActionId =
  | CardId
  | 'strike'
  | 'brace'
  | 'shot'
  | 'approach'
  | 'disengage'
  | 'withdraw'
  | 'wait';

export type CombatResult = 'WIN' | 'LOSS' | 'LOSS_SURRENDER' | 'DRAW_LIMIT';

/** Persisted phases. PLAN is the initial shape only and is never persisted. */
export type CombatPhase = 'PLAN' | 'CHOOSE' | 'FINISHED';

export type MoveVariant = 'JOIN' | 'ENGAGE';

export interface CombatActor {
  id: ActorId;
  /** Opaque adapter reference; never read by the rules. */
  ref: string | null;
  team: Team;
  role: Role;
  profileId: ProfileId;
  /** 0..profile.maxHp. */
  hp: number;
  /** Null for enemies, who have no stamina. */
  stamina: number | null;
  stance: Stance;
  groupId: GroupId;
  readyRound: number | null;
  availableRound: Partial<Record<CardId, number>>;
  /** Enemies only; default 0 (rules §8.1). */
  power?: number;
  /** Enemies only. */
  phaseOffset?: number;
  /** Enemies only. */
  waitAge?: number;
}

/** Frozen plan: the verbatim §12 field set. */
export interface FrozenPlan {
  actorId: ActorId;
  stance: Stance;
  actionId: ActionId;
  targetId: ActorId | null;
  moveVariant: MoveVariant | null;
  wasCandidate: boolean;
  attackSlot: boolean;
  baseDamage: number;
  priority: number;
}

/** Combat event. Deep event typing arrives with the resolver (P1c);
 *  the parser only requires an array of objects. */
export interface CombatEvent {
  round: number;
  seq: number;
  [key: string]: string | number | boolean | null;
}

export interface CombatState {
  rulesVersion: RulesVersion;
  /** 1..30. */
  round: number;
  phase: CombatPhase;
  result: CombatResult | null;
  nextGroupSerial: number;
  actors: CombatActor[];
  /** Canonical sorted pairs, no duplicates. */
  engagements: [ActorId, ActorId][];
  frozenEnemyPlans: FrozenPlan[];
  frozenCompanionPlan: FrozenPlan | null;
  log: CombatEvent[];
}

/** Initial shape: phase PLAN, round 1, no plans, empty log. */
export type InitialCombatState = CombatState;

export interface RoundCommand {
  round: number;
  stance: Stance;
  actionId: ActionId;
  targetId: ActorId | null;
}

/** Range is a relation between two characters (rules §3.1). */
export type Range = 'self' | 'melee' | 'near' | 'far';

/** Strict-parser issue codes (rules §12). */
export type ParseIssueCode =
  | 'bad_rules_version'
  | 'unexpected_state_version'
  | 'bad_round'
  | 'bad_phase'
  | 'bad_result'
  | 'finished_without_result'
  | 'result_before_finish'
  | 'bad_next_group_serial'
  | 'bad_actors'
  | 'duplicate_actor_id'
  | 'bad_actor_id'
  | 'unknown_profile'
  | 'bad_team_role'
  | 'bad_stance'
  | 'bad_group_id'
  | 'hp_out_of_range'
  | 'bad_stamina'
  | 'bad_ready_round'
  | 'bad_available_round'
  | 'bad_power'
  | 'bad_phase_offset'
  | 'bad_wait_age'
  | 'missing_hero'
  | 'too_many_companions'
  | 'bad_enemy_count'
  | 'bad_state'
  | 'bad_ref'
  | 'bad_profile_role'
  | 'no_living_hero'
  | 'no_living_enemies'
  | 'bad_engagements'
  | 'bad_engagement'
  | 'bad_frozen_plans'
  | 'bad_frozen_plan'
  | 'bad_log';

export interface ParseIssue {
  code: ParseIssueCode;
  params?: Record<string, string | number>;
}

export type ParseResult = { ok: true; state: CombatState } | { ok: false; issues: ParseIssue[] };

/**
 * Reason codes for command legality (combat-contract.md).
 * listOptions emits every applicable code; submitRound reuses the
 * wrong_round / wrong_phase codes for document-level rejection (P1c).
 */
export type ReasonCode =
  | 'insufficient_stamina'
  | 'on_cooldown'
  | 'stance_disallows'
  | 'no_shot_ability'
  | 'not_engaged'
  | 'must_disengage'
  | 'actor_engaged'
  | 'target_far'
  | 'target_not_near'
  | 'requires_near_ally'
  | 'invalid_target'
  | 'wrong_round'
  | 'wrong_phase'
  | 'in-combat';

export interface OptionReason {
  code: ReasonCode;
  params?: Record<string, string | number>;
}

export interface CommandOption {
  actionId: ActionId;
  targetId: ActorId | null;
  /** Derived from range at choice time; the command does not carry it. */
  moveVariant: MoveVariant | null;
  legal: boolean;
  /** Every applicable reason, in canonical order; empty when legal. */
  reasons: OptionReason[];
}
