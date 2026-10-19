// Command-panel forecast (Combat MVP 1.0, P4 U4): the display model behind the
// round forecast. deriveForecast runs the core's previewRound and maps its
// events and projected state into sections — movement, blow order with the
// full arithmetic, Cover/Counter/riposte tags, cancellations with reasons, the
// terminal-cutoff line, HP/stamina and engagements after the round, and
// regeneration. It performs no rules arithmetic of its own: every number below
// is copied verbatim from a previewRound event or the projected state, and the
// unacted blows of a terminal round are the declared attackers with no
// attack/cancelled event, read straight off the event list.

import { PROFILES, isPrimaryAttack, previewRound } from '../../engine/combat/index';
import type {
  ActorId,
  CombatResult,
  CombatState,
  MoveVariant,
  ReasonCode,
  RoundCommand,
} from '../../engine/combat/index';
import type { CancelReason } from '../../engine/combat/index';

/** A failed move reports a halt code or a shared legality code. */
export type HaltCode = CancelReason | 'must_disengage' | 'target_far' | 'invalid_target';

export interface ForecastMove {
  actor: ActorId;
  action: string;
  target: ActorId | null;
  success: boolean;
  variant: MoveVariant | null;
  group: string | null;
  reason: HaltCode | null;
}

export interface ForecastBlow {
  kind: 'attack' | 'riposte';
  actor: ActorId;
  target: ActorId;
  recipient: ActorId;
  redirected: boolean;
  counter: boolean;
  range: string;
  attackScore: number;
  defenseScore: number;
  hit: boolean;
  raw: number;
  parry: number;
  armor: number;
  absorbed: number;
  hpLoss: number;
}

export interface ForecastCancel {
  actor: ActorId;
  target: ActorId | null;
  reason: CancelReason;
}

export interface ForecastRegen {
  actor: ActorId;
  gain: number;
  stamina: number;
}

export interface ForecastActorAfter {
  id: ActorId;
  hp: number;
  maxHp: number;
  stamina: number | null;
  maxStamina: number | null;
}

export interface Forecast {
  command: RoundCommand;
  moves: ForecastMove[];
  blows: ForecastBlow[];
  cancels: ForecastCancel[];
  eliminations: ActorId[];
  terminal: boolean;
  unacted: { actor: ActorId; target: ActorId | null }[];
  result: CombatResult | null;
  after: ForecastActorAfter[];
  engagementsAfter: [ActorId, ActorId][];
  regens: ForecastRegen[];
}

export type ForecastResult =
  | { ok: true; forecast: Forecast }
  | { ok: false; reason: ReasonCode; params?: Record<string, string | number> };

function str(event: Record<string, unknown>, key: string): string {
  const value = event[key];
  if (typeof value !== 'string') throw new Error(`forecast needs string field ${key}`);
  return value;
}

function num(event: Record<string, unknown>, key: string): number {
  const value = event[key];
  if (typeof value !== 'number') throw new Error(`forecast needs numeric field ${key}`);
  return value;
}

function maybeStr(event: Record<string, unknown>, key: string): string | null {
  const value = event[key];
  return typeof value === 'string' ? value : null;
}

function isCancelReason(reason: string): reason is CancelReason {
  return (
    reason === 'actor_or_target_dead' ||
    reason === 'range_lost' ||
    reason === 'charge_failed' ||
    reason === 'shooter_engaged' ||
    reason === 'target_dead'
  );
}

function isHaltCode(reason: string): reason is HaltCode {
  return (
    isCancelReason(reason) || reason === 'must_disengage' || reason === 'target_far' || reason === 'invalid_target'
  );
}

/**
 * Render the forecast for a command, straight from previewRound. Rejections
 * carry the core reason; the input state is left untouched (previewRound
 * guarantees it, and this function keeps no copy).
 */
export function deriveForecast(state: CombatState, command: RoundCommand): ForecastResult {
  const preview = previewRound(state, command);
  if (!preview.ok) {
    return preview.params === undefined
      ? { ok: false, reason: preview.reason }
      : { ok: false, reason: preview.reason, params: preview.params };
  }

  const moves: ForecastMove[] = [];
  const blows: ForecastBlow[] = [];
  const cancels: ForecastCancel[] = [];
  const eliminations: ActorId[] = [];
  const regens: ForecastRegen[] = [];
  const declaredAttackers: { actor: ActorId; target: ActorId | null }[] = [];
  const resolvedActors = new Set<ActorId>();
  let terminal = false;
  let result: CombatResult | null = null;

  for (const raw of preview.events) {
    const event = raw as Record<string, unknown>;
    const type = str(event, 'type');
    switch (type) {
      case 'moved': {
        const reason = maybeStr(event, 'reason');
        if (reason !== null && !isHaltCode(reason)) throw new Error(`unknown halt code ${reason}`);
        const variant = maybeStr(event, 'variant');
        moves.push({
          actor: str(event, 'actor'),
          action: str(event, 'action'),
          target: maybeStr(event, 'target'),
          success: num(event, 'success') === 1,
          variant: variant === 'JOIN' || variant === 'ENGAGE' ? variant : null,
          group: maybeStr(event, 'group'),
          reason,
        });
        break;
      }
      case 'attack':
      case 'riposte': {
        blows.push({
          kind: type,
          actor: str(event, 'actor'),
          target: str(event, 'target'),
          recipient: str(event, 'recipient'),
          redirected: num(event, 'redirected') === 1,
          counter: num(event, 'counter') === 1,
          range: str(event, 'range'),
          attackScore: num(event, 'attackScore'),
          defenseScore: num(event, 'defenseScore'),
          hit: num(event, 'hit') === 1,
          raw: num(event, 'raw'),
          parry: num(event, 'parry'),
          armor: num(event, 'armor'),
          absorbed: num(event, 'absorbed'),
          hpLoss: num(event, 'hpLoss'),
        });
        resolvedActors.add(str(event, 'actor'));
        break;
      }
      case 'cancelled': {
        const reason = str(event, 'reason');
        if (!isCancelReason(reason)) throw new Error(`unknown cancel reason ${reason}`);
        cancels.push({ actor: str(event, 'actor'), target: maybeStr(event, 'target'), reason });
        resolvedActors.add(str(event, 'actor'));
        break;
      }
      case 'eliminated': {
        eliminations.push(str(event, 'actor'));
        break;
      }
      case 'declared': {
        const action = str(event, 'action') as Parameters<typeof isPrimaryAttack>[0];
        if (isPrimaryAttack(action)) {
          declaredAttackers.push({ actor: str(event, 'actor'), target: maybeStr(event, 'target') });
        }
        break;
      }
      case 'regenerated': {
        regens.push({ actor: str(event, 'actor'), gain: num(event, 'gain'), stamina: num(event, 'stamina') });
        break;
      }
      case 'finished': {
        terminal = true;
        result = str(event, 'result') as CombatResult;
        break;
      }
      default:
        break;
    }
  }

  const unacted = declaredAttackers.filter((declared) => !resolvedActors.has(declared.actor));

  // Maxima are display labels from the versioned rules table (like card
  // costs), not forecast arithmetic: the values themselves come from core.
  const after: ForecastActorAfter[] = preview.projected.actors.map((actor) => {
    const profile = PROFILES[actor.profileId];
    return {
      id: actor.id,
      hp: actor.hp,
      maxHp: profile.maxHp,
      stamina: actor.stamina,
      maxStamina: profile.maxStamina,
    };
  });

  return {
    ok: true,
    forecast: {
      command,
      moves,
      blows,
      cancels,
      eliminations,
      terminal,
      unacted,
      result,
      after,
      engagementsAfter: preview.projected.engagements,
      regens,
    },
  };
}
