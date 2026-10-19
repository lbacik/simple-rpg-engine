// Shared Combat core: round resolution (MVP 1.0, P1c).
//
// resolveRound is the only code applying rules §7 steps 5–12 (pseudocode
// §13.2–§13.4). previewRound runs it on an isolated copy without planning;
// submitRound runs the same function and then calls planRound unless the
// fight finished. startCombat validates §12 and plans the first round;
// surrender ends a CHOOSE fight as LOSS_SURRENDER.
//
// Every outcome is reported as typed events (combat-contract.md): one event
// per resolution step, each carrying `round` and a sequence number, holding
// only ids (as strings) and numbers. Round effects (guard, Exposed, Counter
// tokens, Cover wards, Prepare markers excluded) live only in working maps
// and never leave the core: actors carry no guard/exposed/counter fields.
//
// Pure functions: no IO, no Date, no randomness, no text. Statistics come
// only from the rules table; per-instance power, phaseOffset, waitAge,
// groups, engagements and hp/stamina are read from the state.

import { addEngagement, rangeOf, removeEngagementsOf } from './range';
import {
  BASIC_ACTIONS,
  CARDS,
  COUNTER_PARRY,
  EXPOSED_PENALTY,
  FEINT_BASE_VS_DEFENSIVE,
  GUARD,
  MAX_ROUNDS,
  MOVEMENT_COSTS,
  PREPARED_BONUS,
  PROFILES,
  REGENERATION,
  RIPOSTE,
  STANCES,
  STANCE_IDS,
  isCardId,
} from './rules';
import { findOption, listOptions } from './options';
import { parseCombatState } from './parse';
import { isPrimaryAttack, planRound, verifyFrozenPlans } from './plan';
import type {
  ActionId,
  ActorId,
  CombatActor,
  CombatEvent,
  CombatState,
  CommandOption,
  ParseIssue,
  ReasonCode,
  RoundCommand,
} from './types';

/** Accepted commit: the next persisted state plus the round's new events. */
export interface Accepted {
  ok: true;
  state: CombatState;
  events: CombatEvent[];
}

/** Rejected commit: a reason code, and nothing mutated. */
export interface Rejected {
  ok: false;
  reason: ReasonCode;
  params?: Record<string, string | number>;
  /** Present when startCombat rejects on §12 validation. */
  issues?: ParseIssue[];
}

/** Accepted preview: the projected post-resolution state plus its events. */
export interface Previewed {
  ok: true;
  projected: CombatState;
  events: CombatEvent[];
}

export type SubmitResult = Accepted | Rejected;
export type PreviewResult = Previewed | Rejected;
export type StartResult = Accepted | Rejected;
export type SurrenderResult = Accepted | Rejected;

/** Direct attacks (rules §2.2): the only intents triggering Counterattack. */
function isDirectAttack(actionId: ActionId): boolean {
  return actionId === 'strike' || actionId === 'heavy' || actionId === 'charge';
}

/** Offensive actions capture a pending Prepare bonus (rules §13.2). */
function isOffensiveAction(actionId: ActionId): boolean {
  return isPrimaryAttack(actionId) || actionId === 'counter';
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function copyState(state: CombatState): CombatState {
  return JSON.parse(JSON.stringify(state)) as CombatState;
}

function actorById(state: CombatState, id: ActorId): CombatActor | undefined {
  return state.actors.find((actor) => actor.id === id);
}

function heroOf(state: CombatState): CombatActor {
  const hero = state.actors.find((actor) => actor.role === 'hero');
  if (hero === undefined) throw new Error('resolveRound needs a hero');
  return hero;
}

/** Blow order role rank (rules §6.3): hero, then companion, then opponents. */
function roleRank(actor: CombatActor | undefined): number {
  if (actor?.role === 'hero') return 0;
  if (actor?.role === 'companion') return 1;
  return 2;
}

/** Free for resolution: no live engagement edge in either direction.
 *  Unlike the hero-centric range helper, this holds for enemies too: an
 *  Archer engaged with the hero cannot Shoot (rules §§3.4, 5.8). */
function isActorFree(state: CombatState, id: ActorId): boolean {
  const self = actorById(state, id);
  if (self === undefined || self.hp <= 0) return false;
  return !state.engagements.some((pair) => {
    if (pair[0] !== id && pair[1] !== id) return false;
    const other = actorById(state, pair[0] === id ? pair[1] : pair[0]);
    return other !== undefined && other.hp > 0;
  });
}

/** A specific live engagement pair between two actors. */
function isEngagedPair(state: CombatState, aId: ActorId, bId: ActorId): boolean {
  const a = actorById(state, aId);
  const b = actorById(state, bId);
  if (a === undefined || b === undefined || a.hp <= 0 || b.hp <= 0) return false;
  return state.engagements.some(
    (pair) =>
      (pair[0] === aId && pair[1] === bId) || (pair[0] === bId && pair[1] === aId),
  );
}

function actionCost(actionId: ActionId): number {
  if (isCardId(actionId)) return CARDS[actionId].cost;
  if (actionId === 'disengage') return MOVEMENT_COSTS['disengage'];
  return 0;
}

/** Hit-test accuracy contribution of the action itself (rules §5.1). */
function actionAccuracy(actionId: ActionId): number {
  if (actionId === 'heavy') return CARDS['heavy'].accuracy;
  if (actionId === 'feint') return CARDS['feint'].accuracy;
  return 0;
}

/** Frozen base damage and priority for the hero's chosen attack. */
function heroAttackNumbers(
  profileId: CombatActor['profileId'],
  actionId: ActionId,
): { baseDamage: number; priority: number } {
  if (actionId === 'strike') {
    return {
      baseDamage: PROFILES[profileId].strikeBase ?? BASIC_ACTIONS['strike'].baseDamage ?? 0,
      priority: BASIC_ACTIONS['strike'].priority ?? 0,
    };
  }
  if (actionId === 'heavy') {
    return {
      baseDamage: PROFILES[profileId].heavyBase ?? CARDS['heavy'].baseDamage ?? 0,
      priority: CARDS['heavy'].priority ?? 0,
    };
  }
  if (actionId === 'feint') {
    return { baseDamage: CARDS['feint'].baseDamage ?? 0, priority: CARDS['feint'].priority ?? 0 };
  }
  if (actionId === 'charge') {
    return { baseDamage: CARDS['charge'].baseDamage ?? 0, priority: CARDS['charge'].priority ?? 0 };
  }
  if (actionId === 'shot') {
    return {
      baseDamage: PROFILES[profileId].shotBase ?? 0,
      priority: BASIC_ACTIONS['shot'].priority ?? 0,
    };
  }
  return { baseDamage: 0, priority: 0 };
}

/** Working plan: a frozen plan plus resolution-only working fields. */
interface WorkingPlan {
  actorId: ActorId;
  stance: WorkingPlanStance;
  actionId: ActionId;
  targetId: ActorId | null;
  moveVariant: 'JOIN' | 'ENGAGE' | null;
  wasCandidate: boolean;
  attackSlot: boolean;
  baseDamage: number;
  priority: number;
  preparedAccuracy: number;
  preparedDamage: number;
  chargeMoveSucceeded: boolean;
}

type WorkingPlanStance = CombatActor['stance'];

function toWorkingPlan(plan: {
  actorId: ActorId;
  stance: WorkingPlanStance;
  actionId: ActionId;
  targetId: ActorId | null;
  moveVariant: 'JOIN' | 'ENGAGE' | null;
  wasCandidate: boolean;
  attackSlot: boolean;
  baseDamage: number;
  priority: number;
}): WorkingPlan {
  return { ...plan, preparedAccuracy: 0, preparedDamage: 0, chargeMoveSucceeded: false };
}

/** Append an event: seq is the event's index in the whole log. */
function emit(log: CombatEvent[], round: number, fields: Record<string, string | number>): CombatEvent {
  const event: CombatEvent = { round, seq: log.length, ...fields };
  log.push(event);
  return event;
}

/** One round-planned event per frozen intent (contract: intents and slots). */
function emitRoundPlanned(state: CombatState): CombatEvent[] {
  const events: CombatEvent[] = [];
  const plans = [...state.frozenEnemyPlans].sort((a, b) => compareIds(a.actorId, b.actorId));
  if (state.frozenCompanionPlan !== null) plans.push(state.frozenCompanionPlan);
  for (const plan of plans) {
    const fields: Record<string, string | number> = {
      type: 'round-planned',
      actor: plan.actorId,
      action: plan.actionId,
      stance: plan.stance,
      attackSlot: plan.attackSlot ? 1 : 0,
      wasCandidate: plan.wasCandidate ? 1 : 0,
      baseDamage: plan.baseDamage,
      priority: plan.priority,
    };
    if (plan.targetId !== null) fields['target'] = plan.targetId;
    events.push(emit(state.log, state.round, fields));
  }
  return events;
}

function mapParseIssuesToReason(issues: ParseIssue[]): ReasonCode {
  if (issues.some((issue) => issue.code === 'bad_phase' || issue.code === 'result_before_finish' || issue.code === 'finished_without_result')) {
    return 'wrong_phase';
  }
  if (issues.some((issue) => issue.code === 'bad_round')) return 'wrong_round';
  return 'invalid_target';
}

/**
 * startCombat: validate §12, then planRound (contract). The initial shape is
 * phase PLAN with no result; the output is the first CHOOSE state with frozen
 * plans and its round-planned events. The input is never mutated.
 */
export function startCombat(initial: unknown): StartResult {
  let copy: unknown = initial;
  try {
    copy = JSON.parse(JSON.stringify(initial)) as unknown;
  } catch {
    copy = initial;
  }
  const parsed = parseCombatState(copy);
  if (!parsed.ok) {
    return { ok: false, reason: mapParseIssuesToReason(parsed.issues), issues: parsed.issues };
  }
  if (parsed.state.phase !== 'PLAN' || parsed.state.result !== null) {
    return { ok: false, reason: 'wrong_phase' };
  }
  const state = planRound(parsed.state);
  const events = emitRoundPlanned(state);
  return { ok: true, state, events };
}

/**
 * Validate a hero command against a CHOOSE state (rules §7 step 5). A command
 * is legal exactly when listOptions marks that action × target legal; there
 * is no second legality function. Returns the matched option (carrying the
 * choice-time movement variant) or the first applicable reason code.
 */
function validateCommand(
  input: CombatState,
  command: RoundCommand,
): { option: CommandOption } | { reason: ReasonCode; params?: Record<string, string | number> } {
  if (input.phase !== 'CHOOSE') return { reason: 'wrong_phase' };
  if (command.round !== input.round) return { reason: 'wrong_round' };
  if (verifyFrozenPlans(input).length > 0) return { reason: 'wrong_phase' };
  if (!(STANCE_IDS as readonly string[]).includes(command.stance)) return { reason: 'stance_disallows' };
  const options = listOptions(input, command.stance);
  const option = findOption(options, command.actionId, command.targetId);
  if (option === undefined) return { reason: 'invalid_target' };
  if (!option.legal) {
    const first = option.reasons[0];
    if (first === undefined) return { reason: 'invalid_target' };
    return first.params === undefined ? { reason: first.code } : { reason: first.code, params: first.params };
  }
  return { option };
}

interface Resolution {
  /** Working state after §7 steps 5–12 except planning. */
  state: CombatState;
  /** The round's new events, in log order. */
  events: CombatEvent[];
}

/**
 * resolveRound: the only code applying §7 steps 5–12. Runs declaration,
 * movements, the attack queue with redirection/Counter/riposte, regeneration,
 * wait-age accounting and the round increment (or FINISHED) on a working
 * copy. Planning the next round is the caller's job.
 */
function resolveRound(working: CombatState, command: RoundCommand, option: CommandOption): Resolution {
  const round = working.round;
  const events: CombatEvent[] = [];
  const take = (fields: Record<string, string | number>): void => {
    events.push(emit(working.log, round, fields));
  };

  const hero = heroOf(working);
  const numbers = heroAttackNumbers(hero.profileId, command.actionId);
  const plans: WorkingPlan[] = [
    toWorkingPlan({
      actorId: hero.id,
      stance: command.stance,
      actionId: command.actionId,
      targetId: command.targetId,
      moveVariant: option.moveVariant,
      wasCandidate: isPrimaryAttack(command.actionId),
      attackSlot: false,
      baseDamage: numbers.baseDamage,
      priority: numbers.priority,
    }),
  ];
  if (working.frozenCompanionPlan !== null) plans.push(toWorkingPlan(working.frozenCompanionPlan));
  for (const plan of working.frozenEnemyPlans) plans.push(toWorkingPlan(plan));
  const planByActor = new Map<ActorId, WorkingPlan>(plans.map((plan) => [plan.actorId, plan]));

  // Working-only round effects: never persisted, never leave the core.
  const guard = new Map<ActorId, number>();
  const exposed = new Set<ActorId>();
  const counterToken = new Set<ActorId>();
  const coverWard = new Map<ActorId, ActorId>();

  // Step 6: costs, cooldowns, stances, captured Prepare bonuses.
  for (const plan of plans) {
    const actor = actorById(working, plan.actorId);
    if (actor === undefined || actor.hp <= 0) continue;
    const cost = actor.role === 'enemy' ? 0 : actionCost(plan.actionId);
    if (actor.role !== 'enemy') {
      actor.stamina = Math.max(0, (actor.stamina ?? 0) - cost);
      if (isCardId(plan.actionId)) {
        actor.availableRound[plan.actionId] = round + CARDS[plan.actionId].cooldown + 1;
      }
    }
    actor.stance = plan.stance;
    if (isOffensiveAction(plan.actionId) && actor.readyRound === round) {
      plan.preparedAccuracy = PREPARED_BONUS.accuracy;
      plan.preparedDamage = PREPARED_BONUS.damage;
      actor.readyRound = null;
    }
    const fields: Record<string, string | number> = {
      type: 'declared',
      actor: plan.actorId,
      action: plan.actionId,
      stance: plan.stance,
      cost,
      preparedAccuracy: plan.preparedAccuracy,
      preparedDamage: plan.preparedDamage,
    };
    if (plan.targetId !== null) fields['target'] = plan.targetId;
    if (isCardId(plan.actionId)) fields['availableRound'] = actor.availableRound[plan.actionId] ?? round;
    take(fields);
  }

  // Step 7: simultaneously established declaration effects.
  for (const plan of plans) {
    const actor = actorById(working, plan.actorId);
    if (actor === undefined || actor.hp <= 0) continue;
    let established = false;
    if (plan.actionId === 'heavy') {
      exposed.add(actor.id);
      established = true;
    }
    if (plan.actionId === 'brace' || plan.actionId === 'cover') {
      guard.set(actor.id, (guard.get(actor.id) ?? 0) + GUARD[plan.actionId]);
      established = true;
    }
    if (plan.actionId === 'wait') {
      guard.set(actor.id, (guard.get(actor.id) ?? 0) + GUARD['wait']);
      established = true;
    }
    if (plan.actionId === 'counter') {
      counterToken.add(actor.id);
      established = true;
    }
    if (plan.actionId === 'cover' && plan.targetId !== null) {
      coverWard.set(actor.id, plan.targetId);
      established = true;
    }
    if (plan.actionId === 'prepare') {
      actor.readyRound = round + 1;
      established = true;
    }
    if (!established) continue;
    const fields: Record<string, string | number> = {
      type: 'effect-established',
      actor: actor.id,
      action: plan.actionId,
      guard: guard.get(actor.id) ?? 0,
      exposed: exposed.has(actor.id) ? 1 : 0,
      counter: counterToken.has(actor.id) ? 1 : 0,
    };
    const ward = coverWard.get(actor.id);
    if (ward !== undefined) fields['ward'] = ward;
    if (plan.actionId === 'prepare' && actor.readyRound !== null) fields['readyRound'] = actor.readyRound;
    take(fields);
  }

  const eliminate = (id: ActorId): void => {
    working.engagements = removeEngagementsOf(working.engagements, id);
    take({ type: 'eliminated', actor: id });
    const nextHero = actorById(working, hero.id);
    if (nextHero !== undefined && nextHero.hp <= 0) {
      working.result = 'LOSS';
    } else if (!working.actors.some((actor) => actor.team === 'enemies' && actor.hp > 0)) {
      working.result = 'WIN';
    }
  };

  // Step 8: movements, hero → companion → enemies by ID (rules §13.4).
  const moveOrder = [...plans].sort((a, b) => roleRank(actorById(working, a.actorId)) - roleRank(actorById(working, b.actorId)) || compareIds(a.actorId, b.actorId));
  for (const plan of moveOrder) {
    const actor = actorById(working, plan.actorId);
    if (actor === undefined || actor.hp <= 0) continue;
    if (plan.actionId === 'disengage') {
      working.engagements = removeEngagementsOf(working.engagements, actor.id);
      take({ type: 'moved', actor: actor.id, action: 'disengage', success: 1 });
      continue;
    }
    if (plan.actionId === 'withdraw') {
      if (!isActorFree(working, actor.id)) {
        take({ type: 'moved', actor: actor.id, action: 'withdraw', success: 0, reason: 'must_disengage' });
        continue;
      }
      const group = `g${working.nextGroupSerial}`;
      working.nextGroupSerial += 1;
      actor.groupId = group;
      take({ type: 'moved', actor: actor.id, action: 'withdraw', success: 1, group });
      continue;
    }
    if (plan.actionId !== 'approach' && plan.actionId !== 'charge') continue;
    const target = plan.targetId === null ? undefined : actorById(working, plan.targetId);
    if (target === undefined || target.hp <= 0) {
      take({ type: 'moved', actor: actor.id, action: plan.actionId, success: 0, reason: 'target_dead' });
      continue;
    }
    if (!isActorFree(working, actor.id)) {
      take({ type: 'moved', actor: actor.id, action: plan.actionId, target: target.id, success: 0, reason: 'must_disengage' });
      continue;
    }
    if (plan.actionId === 'approach' && plan.moveVariant === 'JOIN') {
      actor.groupId = target.groupId;
      take({ type: 'moved', actor: actor.id, action: 'approach', target: target.id, success: 1, variant: 'JOIN' });
      continue;
    }
    if (rangeOf(working, actor.id, target.id) === 'near' && actor.team !== target.team) {
      working.engagements = addEngagement(working.engagements, actor.id, target.id);
      if (plan.actionId === 'charge') plan.chargeMoveSucceeded = true;
      take({ type: 'moved', actor: actor.id, action: plan.actionId, target: target.id, success: 1, variant: 'ENGAGE' });
    } else {
      const rel = rangeOf(working, actor.id, target.id);
      take({
        type: 'moved',
        actor: actor.id,
        action: plan.actionId,
        target: target.id,
        success: 0,
        reason: rel === 'far' ? 'target_far' : 'invalid_target',
      });
    }
  }

  // Step 9: the primary-attack queue (rules §§6, 13.3). One shared blow
  // resolver for attacks and ripostes: hit test, then raw → parry → armor →
  // guard absorption. Callers precompute the attack-specific accuracy,
  // defense contribution (Feint skips a positive stance bonus, rules §5.4),
  // base, parry and guard handling.
  const resolveBlow = (
    kind: 'attack' | 'riposte',
    attacker: CombatActor,
    recipient: CombatActor,
    originalId: ActorId,
    accuracy: number,
    defenseUsed: number,
    base: number,
    preparedDamage: number,
    parry: number,
    redirected: number,
    triggeredCounter: number,
    useGuard: boolean,
  ): void => {
    const attackScore = PROFILES[attacker.profileId].skill + STANCES[attacker.stance].attack + accuracy;
    const defenseScore = Math.max(0, PROFILES[recipient.profileId].defense + defenseUsed - (exposed.has(recipient.id) ? EXPOSED_PENALTY : 0));
    const range = rangeOf(working, attacker.id, originalId);
    if (attackScore < defenseScore) {
      take({
        type: kind,
        actor: attacker.id,
        target: originalId,
        recipient: recipient.id,
        redirected,
        counter: triggeredCounter,
        range,
        attackScore,
        defenseScore,
        hit: 0,
        raw: 0,
        parry: 0,
        armor: PROFILES[recipient.profileId].armor,
        absorbed: 0,
        hpLoss: 0,
      });
      return;
    }
    const raw = Math.max(0, base + (attacker.power ?? 0) + preparedDamage);
    const afterParry = Math.max(0, raw - parry);
    const armor = PROFILES[recipient.profileId].armor;
    const afterArmor = Math.max(0, afterParry - armor);
    let absorbed = 0;
    if (useGuard) {
      const pool = guard.get(recipient.id) ?? 0;
      absorbed = Math.min(pool, afterArmor);
      guard.set(recipient.id, pool - absorbed);
    }
    const hpLoss = afterArmor - absorbed;
    recipient.hp = Math.max(0, recipient.hp - hpLoss);
    take({
      type: kind,
      actor: attacker.id,
      target: originalId,
      recipient: recipient.id,
      redirected,
      counter: triggeredCounter,
      range,
      attackScore,
      defenseScore,
      hit: 1,
      raw,
      parry,
      armor,
      absorbed,
      hpLoss,
    });
    if (recipient.hp <= 0) eliminate(recipient.id);
  };

  const attacks = plans.filter((plan) => isPrimaryAttack(plan.actionId));
  attacks.sort(
    (a, b) =>
      b.priority - a.priority ||
      roleRank(actorById(working, a.actorId)) - roleRank(actorById(working, b.actorId)) ||
      compareIds(a.actorId, b.actorId),
  );
  for (const plan of attacks) {
    if (working.result !== null) break;
    const attacker = actorById(working, plan.actorId);
    const original = plan.targetId === null ? undefined : actorById(working, plan.targetId);
    if (attacker === undefined || attacker.hp <= 0 || original === undefined || original.hp <= 0) {
      const fields: Record<string, string | number> = {
        type: 'cancelled',
        actor: plan.actorId,
        reason: 'actor_or_target_dead',
      };
      if (plan.targetId !== null) fields['target'] = plan.targetId;
      take(fields);
      continue;
    }
    let failReason: string | null = null;
    if (plan.actionId === 'shot') {
      if (!isActorFree(working, attacker.id)) failReason = 'shooter_engaged';
    } else if (plan.actionId === 'charge') {
      if (!plan.chargeMoveSucceeded || !isEngagedPair(working, attacker.id, original.id)) {
        failReason = 'charge_failed';
      }
    } else if (!isEngagedPair(working, attacker.id, original.id)) {
      failReason = 'range_lost';
    }
    if (failReason !== null) {
      take({ type: 'cancelled', actor: attacker.id, target: original.id, reason: failReason });
      continue;
    }

    // Cover redirection: the lowest-ID eligible protector takes over once.
    let recipient = original;
    let redirected = 0;
    const protectors = [...coverWard.entries()]
      .filter(([, wardId]) => wardId === original.id)
      .map(([protectorId]) => protectorId)
      .sort(compareIds)
      .map((protectorId) => actorById(working, protectorId))
      .filter(
        (protector): protector is CombatActor =>
          protector !== undefined && protector.hp > 0 && rangeOf(working, protector.id, original.id) === 'near',
      );
    const protector = protectors[0];
    if (protector !== undefined) {
      recipient = protector;
      redirected = 1;
      coverWard.delete(protector.id);
    }

    const triggered = isDirectAttack(plan.actionId) && counterToken.has(recipient.id) && isEngagedPair(working, attacker.id, recipient.id) ? 1 : 0;
    if (triggered === 1) counterToken.delete(recipient.id);

    // The Feint base and stance handling are checked against the actual
    // recipient (rules §5.4), i.e. the protector after redirection.
    const isFeint = plan.actionId === 'feint';
    const base = isFeint
      ? recipient.stance === 'defensive'
        ? FEINT_BASE_VS_DEFENSIVE
        : (CARDS['feint'].baseDamage ?? 0)
      : plan.baseDamage;
    // Feint ignores the positive stance bonus to the target's defense; the
    // negative Aggressive modifier still applies (rules §5.4).
    const stanceUsed = isFeint ? Math.min(0, STANCES[recipient.stance].defense) : STANCES[recipient.stance].defense;
    resolveBlow(
      'attack',
      attacker,
      recipient,
      original.id,
      actionAccuracy(plan.actionId) + plan.preparedAccuracy,
      stanceUsed,
      base,
      plan.preparedDamage,
      triggered === 1 ? COUNTER_PARRY : 0,
      redirected,
      triggered,
      !isFeint,
    );

    if (working.result !== null) break;
    // Riposte: no Cover, no Counterattack; normal hit test, armor and guard.
    if (triggered === 1 && attacker.hp > 0 && recipient.hp > 0 && isEngagedPair(working, attacker.id, recipient.id)) {
      const counterPlan = planByActor.get(recipient.id);
      resolveBlow(
        'riposte',
        recipient,
        attacker,
        attacker.id,
        RIPOSTE.accuracy + (counterPlan?.preparedAccuracy ?? 0),
        STANCES[attacker.stance].defense,
        RIPOSTE.baseDamage,
        counterPlan?.preparedDamage ?? 0,
        0,
        0,
        0,
        true,
      );
    }
  }

  // A terminal round ends immediately after the lethal hit: no regeneration,
  // no wait-age accounting, no effect removal, no further blows (rules §7).
  if (working.result !== null) {
    working.phase = 'FINISHED';
    take({ type: 'finished', result: working.result, round });
    return { state: working, events };
  }

  // Step 10: regeneration for the living hero and companion only.
  for (const actor of [actorById(working, hero.id), ...working.actors.filter((a) => a.role === 'companion')]) {
    if (actor === undefined || actor.hp <= 0) continue;
    const actorPlan = planByActor.get(actor.id);
    const gain = REGENERATION.base + (actorPlan?.actionId === 'prepare' ? REGENERATION.afterPrepare : 0);
    const max = PROFILES[actor.profileId].maxStamina ?? 0;
    actor.stamina = Math.min(max, (actor.stamina ?? 0) + gain);
    take({ type: 'regenerated', actor: actor.id, gain, stamina: actor.stamina ?? 0 });
  }

  // Step 11: wait-age rotation, Prepare expiry, round-effect removal.
  for (const enemy of working.actors.filter((actor) => actor.role === 'enemy' && actor.hp > 0)) {
    const enemyPlan = planByActor.get(enemy.id);
    const withoutSlot = enemyPlan !== undefined && enemyPlan.wasCandidate && !enemyPlan.attackSlot;
    enemy.waitAge = withoutSlot ? (enemy.waitAge ?? 0) + 1 : 0;
    take({ type: 'wait-age-updated', actor: enemy.id, waitAge: enemy.waitAge ?? 0 });
  }
  for (const actor of working.actors) {
    if (actor.readyRound !== null && actor.readyRound <= round) actor.readyRound = null;
  }

  // Step 12: DRAW_LIMIT after 30 full rounds (never WIN here), else next PLAN.
  if (round >= MAX_ROUNDS) {
    working.result = 'DRAW_LIMIT';
    working.phase = 'FINISHED';
    take({ type: 'finished', result: 'DRAW_LIMIT', round });
  } else {
    // The round's plans are spent: the next planning starts from no intents.
    working.frozenEnemyPlans = [];
    working.frozenCompanionPlan = null;
    working.round = round + 1;
    working.phase = 'PLAN';
  }
  return { state: working, events };
}

/**
 * previewRound: resolveRound on an isolated copy; no planning (contract).
 * The input state is deep-equal before and after, win or lose.
 */
export function previewRound(state: CombatState, command: RoundCommand): PreviewResult {
  const snapshot = JSON.stringify(state);
  const validated = validateCommand(state, command);
  if (!('option' in validated)) {
    return validated.params === undefined
      ? { ok: false, reason: validated.reason }
      : { ok: false, reason: validated.reason, params: validated.params };
  }
  const working = copyState(state);
  const { state: projected, events } = resolveRound(working, command, validated.option);
  if (JSON.stringify(state) !== snapshot) throw new Error('previewRound mutated its input');
  return { ok: true, projected, events };
}

/**
 * submitRound: validate (step 5) → resolveRound → planRound unless FINISHED
 * (contract). Rejections return a reason code and leave the input deep-equal
 * with no stamina taken.
 */
export function submitRound(state: CombatState, command: RoundCommand): SubmitResult {
  const validated = validateCommand(state, command);
  if (!('option' in validated)) {
    return validated.params === undefined
      ? { ok: false, reason: validated.reason }
      : { ok: false, reason: validated.reason, params: validated.params };
  }
  const working = copyState(state);
  const resolution = resolveRound(working, command, validated.option);
  if (resolution.state.result !== null) {
    return { ok: true, state: resolution.state, events: resolution.events };
  }
  const planned = planRound(resolution.state);
  const plannedEvents = emitRoundPlanned(planned);
  return { ok: true, state: planned, events: [...resolution.events, ...plannedEvents] };
}

/**
 * surrender: CHOOSE only → FINISHED with LOSS_SURRENDER (contract). Any other
 * phase, or frozen plans that fail recomputation, return wrong_phase and
 * leave the input deep-equal.
 */
export function surrender(state: CombatState): SurrenderResult {
  if (state.phase !== 'CHOOSE' || verifyFrozenPlans(state).length > 0) {
    return { ok: false, reason: 'wrong_phase' };
  }
  const working = copyState(state);
  working.result = 'LOSS_SURRENDER';
  working.phase = 'FINISHED';
  const finished = emit(working.log, working.round, {
    type: 'finished',
    result: 'LOSS_SURRENDER',
    round: working.round,
  });
  return { ok: true, state: working, events: [finished] };
}
