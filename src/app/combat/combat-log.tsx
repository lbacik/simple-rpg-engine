// The per-Round Combat log (Combat MVP 1.0, P4 U5): every resolved Round as
// one group headed by the Round line and the player's declared choice, with
// the core's log events rendered through the Combat catalogue slice. The log
// reads straight off state.log, so it matches the server and browser views.
//
// This module is server-safe (no hooks, no browser APIs): the step-by-step
// replay with its skip lives in the client CombatLogReplay, which receives
// only pre-rendered strings — Client Components never import the catalogue.
// The first render (and the no-JavaScript page) shows every group in full.

import type { ActorId, CombatEvent, CombatState, Range } from '../../engine/combat/index';
import { getCombatCatalogue, type CombatCatalogue } from '../../i18n/combat';
import type { InterfaceLanguage } from '../../i18n/languages';
import { CombatLogReplay } from './combat-log-replay';

export interface CombatLogProps {
  state: CombatState;
  language: InterfaceLanguage;
  getActorName?: (id: ActorId) => string;
}

export interface LogGroup {
  round: number;
  events: CombatEvent[];
}

/** Group the log by Round in (round, seq) order. Pure: unit-tested. */
export function groupLogByRound(log: CombatEvent[]): LogGroup[] {
  const ordered = [...log].sort((a, b) => a.round - b.round || a.seq - b.seq);
  const groups: LogGroup[] = [];
  for (const event of ordered) {
    const last = groups[groups.length - 1];
    if (last === undefined || last.round !== event.round) {
      groups.push({ round: event.round, events: [event] });
    } else {
      last.events.push(event);
    }
  }
  return groups;
}

export interface HeroChoice {
  stance: string;
  actionId: string;
  targetId: ActorId | null;
}

/** The player's declared choice for a Round's event list, if the hero declared. Pure. */
export function heroChoiceOf(events: CombatEvent[]): HeroChoice | null {
  for (const event of events) {
    if (event['type'] === 'declared' && event['actor'] === 'h01') {
      const stance = event['stance'];
      const action = event['action'];
      if (typeof stance !== 'string' || typeof action !== 'string') return null;
      const target = event['target'];
      return { stance, actionId: action, targetId: typeof target === 'string' ? target : null };
    }
  }
  return null;
}

function str(event: CombatEvent, key: string): string | null {
  const value = event[key];
  return typeof value === 'string' ? value : null;
}

function num(event: CombatEvent, key: string): number {
  const value = event[key];
  return typeof value === 'number' ? value : 0;
}

function flag(event: CombatEvent, key: string): boolean {
  return num(event, key) === 1;
}

function actionName(text: CombatCatalogue, action: string): string {
  return (text.actions as Record<string, string>)[action] ?? action;
}

function stanceName(text: CombatCatalogue, stance: string): string {
  return (text.stances as Record<string, string>)[stance] ?? stance;
}

function rangeName(text: CombatCatalogue, range: string): string {
  return (text.ranges as Record<string, string>)[range as Range] ?? range;
}

/** Join the present parts with the catalogue separator shared by every panel label. */
export function joinPresent(parts: (string | null)[]): string {
  return parts.filter((part) => part !== null).join(' · ');
}

/** A failed movement in the log: the legality line for halts, the cancel line for a dead target. */
function moveReasonText(text: CombatCatalogue, reason: string): string {
  switch (reason) {
    case 'must_disengage':
      return text.reasons.must_disengage;
    case 'target_far':
      return text.reasons.target_far;
    case 'invalid_target':
      return text.reasons.invalid_target;
    default:
      return cancelReasonText(text, reason);
  }
}

function cancelReasonText(text: CombatCatalogue, reason: string): string {
  return (text.cancelReasons as Record<string, string>)[reason] ?? reason;
}

/** One log line for one core event, with actor ids and vocabulary localised. Pure. */
export function logLine(text: CombatCatalogue, event: CombatEvent, nameOf: (id: ActorId) => string): string {
  try {
    return describeEvent(text, event, nameOf);
  } catch {
    return `${str(event, 'type') ?? 'event'} #${event.seq}`;
  }
}

function describeEvent(text: CombatCatalogue, event: CombatEvent, nameOf: (id: ActorId) => string): string {
  const type = str(event, 'type');
  const name = (id: string | null): string | null => (id === null ? null : nameOf(id));
  switch (type) {
    case 'round-planned':
      return text.events['round-planned']({
        actor: nameOf(str(event, 'actor') ?? '?'),
        action: actionName(text, str(event, 'action') ?? '?'),
        stance: stanceName(text, str(event, 'stance') ?? '?'),
        attackSlot: flag(event, 'attackSlot'),
        wasCandidate: flag(event, 'wasCandidate'),
        baseDamage: num(event, 'baseDamage'),
        priority: num(event, 'priority'),
        target: name(str(event, 'target')),
      });
    case 'declared':
      return text.events.declared({
        actor: nameOf(str(event, 'actor') ?? '?'),
        action: actionName(text, str(event, 'action') ?? '?'),
        stance: stanceName(text, str(event, 'stance') ?? '?'),
        cost: num(event, 'cost'),
        preparedAccuracy: num(event, 'preparedAccuracy'),
        preparedDamage: num(event, 'preparedDamage'),
        target: name(str(event, 'target')),
      });
    case 'effect-established':
      return text.events['effect-established']({
        actor: nameOf(str(event, 'actor') ?? '?'),
        action: actionName(text, str(event, 'action') ?? '?'),
        guard: num(event, 'guard'),
        exposed: flag(event, 'exposed'),
        counter: flag(event, 'counter'),
        ward: name(str(event, 'ward')),
        readyRound: typeof event['readyRound'] === 'number' ? (event['readyRound'] as number) : null,
      });
    case 'moved': {
      const success = flag(event, 'success');
      const reason = str(event, 'reason');
      const variant = str(event, 'variant');
      const group = str(event, 'group');
      const detail = success
        ? joinPresent([
            variant === 'JOIN' || variant === 'ENGAGE' ? text.panel.moveVariant[variant] : null,
            group === null ? null : text.panel.moveGroup(group),
          ]) || null
        : reason === null
          ? null
          : moveReasonText(text, reason);
      return text.events.moved({
        actor: nameOf(str(event, 'actor') ?? '?'),
        action: actionName(text, str(event, 'action') ?? '?'),
        target: name(str(event, 'target')),
        success,
        detail,
      });
    }
    case 'attack':
    case 'riposte': {
      const params = {
        actor: nameOf(str(event, 'actor') ?? '?'),
        target: nameOf(str(event, 'target') ?? '?'),
        recipient: nameOf(str(event, 'recipient') ?? '?'),
        redirected: flag(event, 'redirected'),
        counter: flag(event, 'counter'),
        range: rangeName(text, str(event, 'range') ?? '?'),
        attackScore: num(event, 'attackScore'),
        defenseScore: num(event, 'defenseScore'),
        hit: flag(event, 'hit'),
        raw: num(event, 'raw'),
        parry: num(event, 'parry'),
        armor: num(event, 'armor'),
        absorbed: num(event, 'absorbed'),
        hpLoss: num(event, 'hpLoss'),
      };
      return type === 'attack' ? text.events.attack(params) : text.events.riposte(params);
    }
    case 'cancelled':
      return text.events.cancelled({
        actor: nameOf(str(event, 'actor') ?? '?'),
        target: name(str(event, 'target')),
        reason: cancelReasonText(text, str(event, 'reason') ?? ''),
      });
    case 'eliminated':
      return text.events.eliminated(nameOf(str(event, 'actor') ?? '?'));
    case 'regenerated':
      return text.events.regenerated({
        actor: nameOf(str(event, 'actor') ?? '?'),
        gain: num(event, 'gain'),
        stamina: num(event, 'stamina'),
      });
    case 'wait-age-updated':
      return text.events['wait-age-updated']({
        actor: nameOf(str(event, 'actor') ?? '?'),
        waitAge: num(event, 'waitAge'),
      });
    case 'finished':
      return text.events.finished({
        result: (str(event, 'result') ?? 'DRAW_LIMIT') as Parameters<typeof text.events.finished>[0]['result'],
        round: num(event, 'round'),
      });
    default:
      return `${type ?? 'event'} #${event.seq}`;
  }
}

export function CombatLog(props: CombatLogProps) {
  const { state, language } = props;
  const text = getCombatCatalogue(language);
  const nameOf = (id: ActorId): string => props.getActorName?.(id) ?? id;
  const groups = groupLogByRound(state.log);

  return (
    <section className="combat-log" aria-label={text.panel.logHeading}>
      <h2>{text.panel.logHeading}</h2>
      {groups.length === 0 ? <p className="cp-dim">{text.panel.logEmpty}</p> : null}
      {groups.map((group) => {
        const choice = heroChoiceOf(group.events);
        const lines = group.events.map((event) => logLine(text, event, nameOf));
        return (
          <section key={group.round} aria-label={text.panel.roundLine(group.round)}>
            <h3>{text.panel.roundLine(group.round)}</h3>
            {choice === null ? null : (
              <p className="cp-choice">
                {text.panel.logChoice({
                  stance: stanceName(text, choice.stance),
                  action: actionName(text, choice.actionId),
                  target: choice.targetId === null ? null : nameOf(choice.targetId),
                })}
              </p>
            )}
            <CombatLogReplay
              lines={lines}
              replayLabel={text.panel.logReplay(group.round)}
              nextLabel={text.panel.logNext}
              pauseLabel={text.panel.logPause}
              skipLabel={text.panel.logSkip}
              stepLabels={lines.map((_, index) => text.panel.logStep(index + 1, lines.length))}
            />
          </section>
        );
      })}
    </section>
  );
}
