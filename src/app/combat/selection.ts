// Command-panel selection (Combat MVP 1.0, P4 U2/U3/U8): the player's choice
// as URL parameters. Stance, card, target and perspective travel in the query
// string; reading them changes no game state and advances no step. Both the
// no-JavaScript server render and the interactive client panel resolve the
// same parameters through parseSelection and the same command through
// selectionCommand, so the server and the browser always show the same
// forecast for the same URL.
//
// Legality always comes from the core's listOptions: targetCandidates drops
// only the rows whose reasons include invalid_target (a wrong-shaped target
// for the chosen card), and cardReasons unions the reasons of the remaining
// rows. There is no second legality function here.

import { HERO_ACTION_IDS, STANCE_IDS, findOption, listOptions } from '../../engine/combat/index';
import type {
  ActionId,
  ActorId,
  CombatState,
  CommandOption,
  OptionReason,
  RoundCommand,
  Stance,
} from '../../engine/combat/index';

/** The panel choice: stance, optional card, optional target, range perspective. */
export interface PanelSelection {
  stance: Stance;
  actionId: ActionId | null;
  targetId: ActorId | null;
  perspectiveId: ActorId;
}

/** The query shape Next.js searchParams takes on the way in. */
export type SelectionParams = Record<string, string | string[] | undefined>;

function first(params: SelectionParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function heroStance(state: CombatState): Stance {
  // The hero's stored stance is the previous round's choice (the resolver
  // writes every declaration back), so defaulting to it keeps that stance
  // selected at the start of each round (handoff U3).
  return state.actors.find((actor) => actor.id === 'h01')?.stance ?? 'balanced';
}

function isHeroAction(action: string): action is ActionId {
  return (HERO_ACTION_IDS as readonly string[]).includes(action);
}

/**
 * Validate each URL parameter independently. Unknown values fall back to the
 * previous round's stance, no card, no target and the hero's perspective;
 * nothing is ever rejected, because selection is not game state.
 */
export function parseSelection(params: SelectionParams, state: CombatState): PanelSelection {
  const stanceParam = first(params, 'stance');
  const stance: Stance =
    stanceParam !== undefined && (STANCE_IDS as readonly string[]).includes(stanceParam)
      ? (stanceParam as Stance)
      : heroStance(state);

  const actionParam = first(params, 'action');
  const actionId = actionParam !== undefined && isHeroAction(actionParam) ? actionParam : null;

  const targetParam = first(params, 'target');
  const targetId =
    targetParam !== undefined && state.actors.some((actor) => actor.id === targetParam) ? targetParam : null;

  const perspectiveParam = first(params, 'perspective');
  const companionId = state.actors.find((actor) => actor.id === 'c01' && actor.hp > 0)?.id;
  const perspectiveId = perspectiveParam === companionId && companionId !== undefined ? companionId : 'h01';

  return { stance, actionId, targetId, perspectiveId };
}

/** Encode a selection as a query string (nulls omitted). */
export function selectionQuery(selection: PanelSelection): string {
  const query = new URLSearchParams();
  query.set('stance', selection.stance);
  if (selection.actionId !== null) query.set('action', selection.actionId);
  if (selection.targetId !== null) query.set('target', selection.targetId);
  if (selection.perspectiveId !== 'h01') query.set('perspective', selection.perspectiveId);
  return query.toString();
}

/** A selection link: the current choice with one patch applied. */
export function selectionHref(
  basePath: string,
  current: PanelSelection,
  patch: Partial<PanelSelection>,
): string {
  return `${basePath}?${selectionQuery({ ...current, ...patch })}`;
}

export type SelectionCommand =
  | { ok: true; command: RoundCommand }
  | { ok: false; complete: false }
  | { ok: false; complete: true; reasons: OptionReason[] };

function fixedTarget(state: CombatState, actionId: ActionId): ActorId | null | undefined {
  const hero = state.actors.find((actor) => actor.role === 'hero');
  switch (actionId) {
    case 'counter':
    case 'brace':
    case 'prepare':
    case 'disengage':
      return hero?.id ?? undefined;
    case 'withdraw':
      return null;
    default:
      return undefined;
  }
}

/**
 * Resolve the selection to a round command. Self actions fix their target to
 * the hero and Withdraw to null; other cards need an explicit target.
 * Legality (and every reason) is read from the listOptions matrix.
 */
export function selectionCommand(state: CombatState, selection: PanelSelection): SelectionCommand {
  if (selection.actionId === null) return { ok: false, complete: false };
  const fixed = fixedTarget(state, selection.actionId);
  const targetId = fixed !== undefined ? fixed : selection.targetId;
  // An unfixed card with no target picked yet is incomplete, not illegal.
  if (targetId === null && fixed === undefined) return { ok: false, complete: false };
  const option = findOption(listOptions(state, selection.stance), selection.actionId, targetId);
  if (option === undefined || !option.legal) {
    return { ok: false, complete: true, reasons: option?.reasons ?? [{ code: 'invalid_target' }] };
  }
  return {
    ok: true,
    command: { round: state.round, stance: selection.stance, actionId: selection.actionId, targetId },
  };
}

/**
 * The target rows the panel offers for a card: every action × target row
 * except the wrong-shaped ones (those carrying invalid_target). Shown rows
 * carry their full reason list, so every disabled reason stays visible.
 */
export function targetCandidates(state: CombatState, stance: Stance, actionId: ActionId): CommandOption[] {
  return listOptions(state, stance).filter(
    (option) => option.actionId === actionId && !option.reasons.some((reason) => reason.code === 'invalid_target'),
  );
}

/**
 * Every distinct reason across a card's rows, in core order: the candidate
 * rows when the card has a plausible target, otherwise all rows (so a card
 * with no target at all still names its reasons, e.g. Cover with no ally).
 */
export function cardReasons(state: CombatState, stance: Stance, actionId: ActionId): OptionReason[] {
  const rows = listOptions(state, stance).filter((option) => option.actionId === actionId);
  const candidates = rows.filter(
    (option) => !option.reasons.some((reason) => reason.code === 'invalid_target'),
  );
  const source = candidates.length > 0 ? candidates : rows;
  const seen = new Map<string, OptionReason>();
  for (const candidate of source) {
    for (const reason of candidate.reasons) {
      if (!seen.has(reason.code)) seen.set(reason.code, reason);
    }
  }
  return [...seen.values()];
}
