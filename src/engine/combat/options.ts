// Shared Combat core: hero command options (rules §§3–5, §14.2).
//
// listOptions is the single source of command legality: a command is
// legal exactly when listOptions marks that action × target legal.
// There is no second legality function; the resolver (P1c) looks the
// command up in this matrix. Every action × target row carries ALL
// applicable reason codes with their parameters, not only the first.
//
// Brace on self is always legal, in every stance and every state.
// The hero has no shot in the base set: every shot row is illegal
// with no_shot_ability. Pure function: no IO, no Date, no randomness.

import { isFree, rangeOf } from './range';
import { CARDS, HERO_ACTION_IDS, MOVEMENT_COSTS, STANCE_IDS, isCardId } from './rules';
import type {
  ActionId,
  ActorId,
  CombatActor,
  CombatState,
  CommandOption,
  MoveVariant,
  OptionReason,
  Range,
  ReasonCode,
  Stance,
} from './types';

/** Canonical reason order, so rows compare equal across runs. It lists every
 *  ReasonCode, so the client catalogue slice can check completeness against it. */
export const REASON_ORDER: readonly ReasonCode[] = [
  'insufficient_stamina',
  'on_cooldown',
  'stance_disallows',
  'no_shot_ability',
  'not_engaged',
  'must_disengage',
  'actor_engaged',
  'target_far',
  'target_not_near',
  'requires_near_ally',
  'invalid_target',
  'wrong_round',
  'wrong_phase',
  'in-combat',
];

function sortReasons(reasons: OptionReason[]): OptionReason[] {
  return reasons.sort((a, b) => REASON_ORDER.indexOf(a.code) - REASON_ORDER.indexOf(b.code));
}

function reason(code: ReasonCode, params?: Record<string, string | number>): OptionReason {
  return params === undefined ? { code } : { code, params };
}

/**
 * Every action × target option for the hero under the given stance.
 * The target universe is every living actor plus null (Withdraw only).
 */
export function listOptions(state: CombatState, stance: Stance): CommandOption[] {
  const hero = state.actors.find((actor) => actor.role === 'hero');
  if (hero === undefined) return [];
  const validStance = (STANCE_IDS as readonly string[]).includes(stance);
  const livingIds = state.actors.filter((actor) => actor.hp > 0).map((actor) => actor.id);
  const targets: (ActorId | null)[] = [...livingIds, null];

  const heroFree = isFree(state, hero.id);
  const stamina = typeof hero.stamina === 'number' ? hero.stamina : 0;

  const options: CommandOption[] = [];
  for (const actionId of HERO_ACTION_IDS) {
    for (const targetId of targets) {
      options.push(buildOption(state, hero, actionId, targetId, validStance ? stance : null, stamina, heroFree));
    }
  }
  return options;
}

/** Look a command up in a listOptions matrix. Absent rows are illegal. */
export function findOption(
  options: readonly CommandOption[],
  actionId: ActionId,
  targetId: ActorId | null,
): CommandOption | undefined {
  return options.find((option) => option.actionId === actionId && option.targetId === targetId);
}

function buildOption(
  state: CombatState,
  hero: CombatActor,
  actionId: ActionId,
  targetId: ActorId | null,
  stance: Stance | null,
  stamina: number,
  heroFree: boolean,
): CommandOption {
  const heroId = hero.id;
  const reasons: OptionReason[] = [];
  let moveVariant: MoveVariant | null = null;

  // Cost and cooldown.
  if (isCardId(actionId)) {
    const card = CARDS[actionId];
    if (stamina < card.cost) {
      reasons.push(reason('insufficient_stamina', { missing: card.cost - stamina }));
    }
    const availableRound = hero.availableRound[actionId] ?? 1;
    if (availableRound > state.round) {
      reasons.push(reason('on_cooldown', { availableRound }));
    }
    if (stance === null || !card.stances.includes(stance)) {
      reasons.push(reason('stance_disallows'));
    }
  } else if (actionId === 'disengage' && stamina < MOVEMENT_COSTS['disengage']) {
    reasons.push(reason('insufficient_stamina', { missing: MOVEMENT_COSTS['disengage'] - stamina }));
  }

  // Geometry and target shape per action.
  const target = targetId === null ? undefined : state.actors.find((a) => a.id === targetId);
  const targetLiving = target !== undefined && target.hp > 0;
  const rel: Range | null = targetId === null || target === undefined ? null : rangeOf(state, heroId, targetId);

  switch (actionId) {
    case 'heavy':
    case 'feint':
    case 'strike': {
      if (targetId === null || !targetLiving || target.team !== 'enemies') {
        reasons.push(reason('invalid_target'));
      } else if (rel === 'far') {
        reasons.push(reason('target_far'));
        if (!heroFree) reasons.push(reason('actor_engaged'));
      } else if (rel === 'near') {
        reasons.push(reason('target_not_near'));
        if (!heroFree) reasons.push(reason('actor_engaged'));
      }
      break;
    }
    case 'shot': {
      reasons.push(reason('no_shot_ability'));
      if (targetId === null || !targetLiving || target.team !== 'enemies') {
        reasons.push(reason('invalid_target'));
      }
      break;
    }
    case 'counter':
    case 'brace':
    case 'prepare':
    case 'disengage': {
      if (targetId !== heroId) {
        reasons.push(reason('invalid_target'));
      } else if (actionId === 'counter' && heroFree) {
        reasons.push(reason('not_engaged'));
      } else if (actionId === 'disengage' && heroFree) {
        reasons.push(reason('not_engaged'));
      }
      break;
    }
    case 'cover': {
      if (targetId === null || !targetLiving || target.id === heroId || target.team !== 'heroes') {
        reasons.push(reason('invalid_target'));
      } else if (rel === 'far') {
        reasons.push(reason('requires_near_ally'));
      }
      break;
    }
    case 'charge': {
      moveVariant = 'ENGAGE';
      if (targetId === null || !targetLiving || target.team !== 'enemies') {
        reasons.push(reason('invalid_target'));
      } else if (!heroFree) {
        reasons.push(reason('must_disengage'));
        if (rel === 'far') reasons.push(reason('target_far'));
      } else if (rel === 'far') {
        reasons.push(reason('target_far'));
      } else if (rel === 'melee') {
        reasons.push(reason('must_disengage'));
      }
      break;
    }
    case 'approach': {
      if (targetId === null || !targetLiving || targetId === heroId) {
        reasons.push(reason('invalid_target'));
      } else {
        moveVariant = rel === 'far' ? 'JOIN' : target.team === 'enemies' ? 'ENGAGE' : null;
        if (!heroFree) {
          reasons.push(reason('must_disengage'));
        } else if (rel === 'near' && target.team === 'heroes') {
          reasons.push(reason('invalid_target'));
        } else if (rel === 'melee') {
          reasons.push(reason('invalid_target'));
        }
      }
      break;
    }
    case 'withdraw': {
      if (targetId !== null) {
        reasons.push(reason('invalid_target'));
      } else if (!heroFree) {
        reasons.push(reason('must_disengage'));
      }
      break;
    }
    default: {
      reasons.push(reason('invalid_target'));
      break;
    }
  }

  const sorted = sortReasons(reasons);
  return { actionId, targetId, moveVariant, legal: sorted.length === 0, reasons: sorted };
}
