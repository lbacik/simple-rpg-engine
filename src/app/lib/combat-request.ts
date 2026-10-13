// Combat form parsing for the Combat server action
// (docs/spec/architecture.md, turn transport;
// docs/spec/playthrough-state.md, actions).
//
// Framework-free like turn.ts, so tests can drive it directly: the Server
// Action in combat.ts adds the Session cookie, the 404 mapping, the sliding
// refresh and the redirect-with-notice around this parsing.
//
// The form transports a `target` independently from an `item`: a targeted
// action (attack, distract, advance) names its participant while a Combat
// use-item names its Consumable, and both fields travel even together — the
// engine validates the pair (a target on an action that takes none, or a
// missing, unknown or defeated target, is illegal). Pre-release
// single-participant forms post no target, which parses to no target: the
// engine fills in the lone survivor. A forged action value parses to
// undefined so the caller fails fast with the unavailable notice; the engine
// re-validates real actions independently.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly.

import type { Action, CombatAction } from '../../engine/index';

/** Character actions the Combat form may submit. */
export const COMBAT_ACTIONS: ReadonlySet<string> = new Set([
  'advance',
  'fall-back',
  'attack',
  'defend',
  'distract',
  'use-item',
  'escape',
]);

export function isCombatAction(value: string): value is CombatAction {
  return COMBAT_ACTIONS.has(value);
}

export type CombatFormFields = {
  /** The submitted `combat` value: one of the whitelisted actions. */
  actionId: string;
  /** The submitted `item` value: the Consumable for a Combat use-item. */
  itemId?: string;
  /** The submitted `target` value: the participant for a targeted action. */
  targetParticipantId?: string;
  expectedStep: number;
};

/**
 * Parse one Combat form submission into an engine Action, or undefined for a
 * forged action value. Empty item/target values parse to no item/target.
 */
export function parseCombatAction(fields: CombatFormFields): Action | undefined {
  if (!isCombatAction(fields.actionId)) {
    return undefined;
  }
  const action: Action = {
    kind: 'combat',
    combatAction: fields.actionId,
    expectedStep: fields.expectedStep,
  };
  if (fields.actionId === 'use-item' && fields.itemId !== undefined && fields.itemId !== '') {
    action.itemId = fields.itemId;
  }
  if (fields.targetParticipantId !== undefined && fields.targetParticipantId !== '') {
    action.targetParticipantId = fields.targetParticipantId;
  }
  return action;
}
