// Shared Combat core: deterministic round planning (MVP 1.0, P1b).
//
// planRound implements rules §§8–10 and §13.1: every living enemy plans
// from its profile cycle, range adaptation (§8.3) and target choice
// (§8.2); the two-attack budget with slot rotation (§9) freezes at most
// two attack slots; the companion plans from the same state and the
// frozen enemy plan (§10). The output phase is CHOOSE with frozen plans.
//
// verifyFrozenPlans recomputes planRound from a CHOOSE state and requires
// exact equality (K6): a mismatch is a ParseIssue and the stored plans
// are never replaced. Reading or importing CHOOSE must go through it.
//
// Pure functions: no IO, no Date, no randomness, no text. Statistics come
// only from the rules table; content may set per instance only power,
// phaseOffset, waitAge, the initial group and engagements.

import { rangeOf } from './range';
import { ATTACK_SLOT_BUDGET, BASIC_ACTIONS, CARDS, ENEMY_CYCLES, PROFILES } from './rules';
import type {
  ActionId,
  ActorId,
  CombatActor,
  CombatState,
  FrozenPlan,
  ParseIssue,
  ProfileId,
  Stance,
} from './types';

/** Primary attacks (rules §2.2): the only intents competing for slots. */
const PRIMARY_ATTACKS: readonly ActionId[] = ['strike', 'heavy', 'feint', 'charge', 'shot'];

export function isPrimaryAttack(actionId: ActionId): boolean {
  return PRIMARY_ATTACKS.includes(actionId);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function livingActors(state: CombatState): CombatActor[] {
  return state.actors.filter((actor) => actor.hp > 0);
}

function heroOf(state: CombatState): CombatActor {
  const hero = state.actors.find((actor) => actor.role === 'hero');
  if (hero === undefined) throw new Error('planRound needs a hero');
  return hero;
}

/** Living opponents sharing an engagement pair with the actor. */
function engagedOpponentsOf(state: CombatState, actorId: ActorId): CombatActor[] {
  const self = state.actors.find((actor) => actor.id === actorId);
  if (self === undefined) return [];
  const partners = new Map<ActorId, CombatActor>();
  for (const pair of state.engagements) {
    if (pair[0] !== actorId && pair[1] !== actorId) continue;
    const otherId = pair[0] === actorId ? pair[1] : pair[0];
    const other = state.actors.find((actor) => actor.id === otherId);
    if (other !== undefined && other.hp > 0 && other.team !== self.team) {
      partners.set(other.id, other);
    }
  }
  return [...partners.values()];
}

/** Lowest current HP; ties broken by ascending ID (rules §8.2). */
function lowestHpFirst(actors: CombatActor[]): CombatActor | undefined {
  return [...actors].sort((a, b) => a.hp - b.hp || compareIds(a.id, b.id))[0];
}

/**
 * Base damage and priority for an attack kind: the actor's profile first,
 * then the card/basic table (rules §§5, 8). Charge is table-only: base 6
 * for every profile (rules §8.3).
 */
function attackNumbers(
  profileId: ProfileId,
  kind: 'strike' | 'heavy' | 'shot' | 'charge',
): { baseDamage: number; priority: number } {
  if (kind === 'strike') {
    return {
      baseDamage: PROFILES[profileId].strikeBase ?? BASIC_ACTIONS['strike'].baseDamage ?? 0,
      priority: BASIC_ACTIONS['strike'].priority ?? 0,
    };
  }
  if (kind === 'heavy') {
    return {
      baseDamage: PROFILES[profileId].heavyBase ?? CARDS['heavy'].baseDamage ?? 0,
      priority: CARDS['heavy'].priority ?? 0,
    };
  }
  if (kind === 'shot') {
    return {
      baseDamage: PROFILES[profileId].shotBase ?? BASIC_ACTIONS['shot'].baseDamage ?? 0,
      priority: BASIC_ACTIONS['shot'].priority ?? 0,
    };
  }
  return { baseDamage: CARDS['charge'].baseDamage ?? 0, priority: CARDS['charge'].priority ?? 0 };
}

function makePlan(
  actorId: ActorId,
  stance: Stance,
  actionId: ActionId,
  targetId: ActorId | null,
  moveVariant: FrozenPlan['moveVariant'],
  baseDamage: number,
  priority: number,
): FrozenPlan {
  return {
    actorId,
    stance,
    actionId,
    targetId,
    moveVariant,
    wasCandidate: isPrimaryAttack(actionId),
    attackSlot: false,
    baseDamage,
    priority,
  };
}

function selfPlan(actor: CombatActor, stance: Stance, actionId: ActionId): FrozenPlan {
  return makePlan(actor.id, stance, actionId, actor.id, null, 0, 0);
}

/**
 * One enemy's intent before the slot budget (rules §§8.2–8.3).
 * The cycle advances by global rounds: index = (round - 1 + phaseOffset)
 * mod length, also after a cancelled attack, a movement or waiting.
 */
function planOneEnemy(state: CombatState, enemy: CombatActor, hero: CombatActor): FrozenPlan {
  const cycle = ENEMY_CYCLES[enemy.profileId as keyof typeof ENEMY_CYCLES];
  if (cycle === undefined) throw new Error(`planRound needs an enemy profile for ${enemy.id}`);
  const offset = enemy.phaseOffset ?? 0;
  const entry = cycle[(state.round - 1 + offset) % cycle.length]!;

  // The only profile exception (§8.2): an engaged archer always replaces
  // the whole cycle entry with a plain Balanced Strike at its engaged
  // opponent with the lowest HP, even when the entry was Prepare.
  const engagedFoes = engagedOpponentsOf(state, enemy.id);
  if (enemy.profileId === 'archer' && engagedFoes.length > 0) {
    const target = lowestHpFirst(engagedFoes) ?? hero;
    const numbers = attackNumbers('archer', 'strike');
    return makePlan(enemy.id, 'balanced', 'strike', target.id, null, numbers.baseDamage, numbers.priority);
  }

  if (entry.action === 'strike' || entry.action === 'heavy') {
    const numbers = attackNumbers(enemy.profileId, entry.action);
    const target = lowestHpFirst(engagedOpponentsOf(state, enemy.id)) ?? hero;
    if (rangeOf(state, enemy.id, target.id) === 'melee') {
      return makePlan(enemy.id, entry.stance, entry.action, target.id, null, numbers.baseDamage, numbers.priority);
    }
    if (rangeOf(state, enemy.id, target.id) === 'far') {
      // Free and Far: Approach JOIN, keeping the entry's stance.
      return makePlan(enemy.id, entry.stance, 'approach', target.id, 'JOIN', 0, 0);
    }
    // Free and Near: Aggressive charges (§8.3, Charge base 6 for every
    // profile); Balanced approaches into Melee.
    if (entry.stance === 'aggressive') {
      const numbers = attackNumbers(enemy.profileId, 'charge');
      return makePlan(enemy.id, 'aggressive', 'charge', target.id, 'ENGAGE', numbers.baseDamage, numbers.priority);
    }
    return makePlan(enemy.id, 'balanced', 'approach', target.id, 'ENGAGE', 0, 0);
  }

  if (entry.action === 'shot') {
    // A free Shot has legal range to every enemy; the archer takes the hero.
    const numbers = attackNumbers(enemy.profileId, 'shot');
    return makePlan(enemy.id, entry.stance, 'shot', hero.id, null, numbers.baseDamage, numbers.priority);
  }

  // Brace and Prepare need no engagement and stay as they are.
  return selfPlan(enemy, entry.stance, entry.action);
}

/**
 * The companion's intent from the same state and the frozen enemy plan
 * (rules §10). First matching rule wins; the plan never changes after
 * the player's choice. A companion at 0 HP plans nothing (null).
 */
function planCompanion(state: CombatState, enemyPlans: FrozenPlan[], hero: CombatActor): FrozenPlan | null {
  const companion = state.actors.find((actor) => actor.role === 'companion');
  if (companion === undefined || companion.hp <= 0) return null;
  const stamina = companion.stamina ?? 0;
  const engaged = engagedOpponentsOf(state, companion.id);

  if (companion.profileId === 'party-sentinel') {
    // §10.2 Party Sentinel, first matching rule.
    if (stamina < 2) return selfPlan(companion, 'defensive', 'prepare');
    const coversTarget = enemyPlans.some((plan) => plan.attackSlot && plan.targetId === hero.id);
    if (rangeOf(state, companion.id, hero.id) === 'near' && coversTarget) {
      return makePlan(companion.id, 'defensive', 'cover', hero.id, null, 0, 0);
    }
    const foe = lowestHpFirst(engaged);
    if (foe !== undefined) {
      const numbers = attackNumbers('party-sentinel', 'strike');
      return makePlan(companion.id, 'balanced', 'strike', foe.id, null, numbers.baseDamage, numbers.priority);
    }
    if (rangeOf(state, companion.id, hero.id) === 'far') {
      return makePlan(companion.id, 'defensive', 'approach', hero.id, 'JOIN', 0, 0);
    }
    return selfPlan(companion, 'defensive', 'brace');
  }

  // §10.3 Party Archer, first matching rule.
  if (engaged.length > 0) {
    if (stamina >= 1) return selfPlan(companion, 'defensive', 'disengage');
    return selfPlan(companion, 'defensive', 'prepare');
  }
  const foes = livingActors(state).filter((actor) => actor.team === 'enemies');
  const foe = lowestHpFirst(foes);
  if (foe === undefined) throw new Error('planRound needs a living enemy');
  const numbers = attackNumbers('party-archer', 'shot');
  return makePlan(companion.id, 'balanced', 'shot', foe.id, null, numbers.baseDamage, numbers.priority);
}

function copyState(state: CombatState): CombatState {
  return {
    ...state,
    actors: state.actors.map((actor) => ({ ...actor, availableRound: { ...actor.availableRound } })),
    engagements: state.engagements.map((pair) => [pair[0], pair[1]] as [ActorId, ActorId]),
    frozenEnemyPlans: state.frozenEnemyPlans.map((plan) => ({ ...plan })),
    frozenCompanionPlan: state.frozenCompanionPlan === null ? null : { ...state.frozenCompanionPlan },
    log: state.log.map((entry) => ({ ...entry })),
  };
}

/**
 * Deterministic planning for the round (rules §13.1). Input must be a
 * parsed PLAN state with no result; the input is never mutated. Output
 * is a CHOOSE state with the frozen enemy and companion plans.
 *
 * Slot rotation (§9): candidates sort by waitAge descending, then
 * resulting base damage descending, then ID ascending; the first two
 * hold slots and the rest become Guarded Wait, keeping their stance
 * and wasCandidate. A slot freed later by killing or engaging is not
 * refilled in that round: the resolver (P1c) only ever reads these
 * frozen slots.
 */
export function planRound(input: CombatState): CombatState {
  if (input.phase !== 'PLAN') throw new Error('planRound needs phase PLAN');
  if (input.result !== null) throw new Error('planRound needs no result');
  const state = copyState(input);
  const hero = heroOf(state);

  const plans = livingActors(state)
    .filter((actor) => actor.role === 'enemy')
    .sort((a, b) => compareIds(a.id, b.id))
    .map((enemy) => planOneEnemy(state, enemy, hero));

  const candidates = plans.filter((plan) => plan.wasCandidate);
  const byId = new Map(state.actors.map((actor) => [actor.id, actor]));
  candidates.sort((a, b) => {
    const ageA = byId.get(a.actorId)?.waitAge ?? 0;
    const ageB = byId.get(b.actorId)?.waitAge ?? 0;
    return ageB - ageA || b.baseDamage - a.baseDamage || compareIds(a.actorId, b.actorId);
  });
  candidates.forEach((plan, index) => {
    plan.attackSlot = index < ATTACK_SLOT_BUDGET;
    if (!plan.attackSlot) {
      // Guarded Wait: no move, no attack, guard 3 at declaration (the
      // guard itself belongs to resolution). Stance, target, move
      // variant, base damage and wasCandidate stay frozen as evidence.
      plan.actionId = 'wait';
    }
  });

  state.frozenEnemyPlans = plans;
  state.frozenCompanionPlan = planCompanion(state, plans, hero);
  state.phase = 'CHOOSE';
  return state;
}

const PLAN_FIELDS: readonly (keyof FrozenPlan)[] = [
  'actorId',
  'stance',
  'actionId',
  'targetId',
  'moveVariant',
  'wasCandidate',
  'attackSlot',
  'baseDamage',
  'priority',
];

function plansEqual(a: FrozenPlan, b: FrozenPlan): boolean {
  return PLAN_FIELDS.every((field) => a[field] === b[field]);
}

function byActorId(plans: FrozenPlan[]): FrozenPlan[] {
  return [...plans].sort((a, b) => compareIds(a.actorId, b.actorId));
}

/**
 * K6: recompute planRound from a CHOOSE state and require exact equality
 * with the stored frozen plans. Returns ParseIssues (empty when the
 * plans verify); the input is never mutated and stored plans are never
 * replaced. Non-CHOOSE states carry nothing to verify and yield [].
 */
export function verifyFrozenPlans(input: CombatState): ParseIssue[] {
  if (input.phase !== 'CHOOSE') return [];
  const stripped = copyState(input);
  stripped.phase = 'PLAN';
  stripped.frozenEnemyPlans = [];
  stripped.frozenCompanionPlan = null;
  const recomputed = planRound(stripped);

  const storedEnemies = byActorId(input.frozenEnemyPlans);
  const freshEnemies = byActorId(recomputed.frozenEnemyPlans);
  if (storedEnemies.length !== freshEnemies.length) {
    return [{ code: 'bad_frozen_plans', params: { reason: 'mismatch' } }];
  }
  const enemiesMatch = storedEnemies.every((plan, index) => plansEqual(plan, freshEnemies[index]!));
  const storedCompanion = input.frozenCompanionPlan;
  const freshCompanion = recomputed.frozenCompanionPlan;
  const companionMatch =
    (storedCompanion === null && freshCompanion === null) ||
    (storedCompanion !== null && freshCompanion !== null && plansEqual(storedCompanion, freshCompanion));
  if (!enemiesMatch || !companionMatch) {
    return [{ code: 'bad_frozen_plans', params: { reason: 'mismatch' } }];
  }
  return [];
}
