// Live Condition evaluation (docs/spec/content-semantics.md, conditions).
//
// Used both when rendering (which Connections, on-demand Scenes and Choices
// are visible) and again when an action is submitted. The Scenes ticket
// extends this with the facts Choices need; the vocabulary here already
// covers every fact Connections can test.

import type { CompiledCondition, Scenario } from '../content/model';
import { PROFILES } from './combat/rules';
import type { PlaythroughState } from './state';
import type { PlaythroughV3 } from './state-v3';

const ATTRIBUTE_NAMES = ['might', 'agility', 'wits', 'presence'] as const;

export type AttributeName = (typeof ATTRIBUTE_NAMES)[number];

/** Journey state on either document: the v2 journey or the v3 Scenario adapter. */
export type JourneyState = PlaythroughState | PlaythroughV3;

/** Whether the state is a Combat MVP 1.0 (v3) document. */
export function isV3State(state: JourneyState): state is PlaythroughV3 {
  return 'activeCombat' in state;
}

/** Effective Attributes: base plus Equipment bonuses, capped at +2 each. */
export function effectiveAttributes(
  scenario: Scenario,
  state: JourneyState,
): Record<AttributeName, number> {
  const bonus: Record<AttributeName, number> = { might: 0, agility: 0, wits: 0, presence: 0 };
  for (const itemId of Object.values(state.equipment)) {
    if (itemId === undefined) continue;
    const item = scenario.itemsById[itemId];
    if (item === undefined || item.kind !== 'equipment' || item.bonus === undefined) continue;
    bonus[item.bonus] += 1;
  }
  const effective = {} as Record<AttributeName, number>;
  for (const name of ATTRIBUTE_NAMES) {
    effective[name] = state.character.baseAttributes[name] + Math.min(2, bonus[name]);
  }
  return effective;
}

function isDefeated(scenario: Scenario, state: JourneyState, encounterId: string): boolean {
  const encounter = scenario.encountersById[encounterId];
  if (encounter === undefined) return false;
  // An Encounter is defeated when every participant is: each participant's
  // recorded Damage taken reaches its Enemy's current maximum Health
  // (docs/spec/content-semantics.md, conditions; docs/spec/mechanics.md,
  // persistence of wounds). A participant without an entry (one added to the
  // content later) is at full Health.
  const wounds = state.encounters?.[encounterId] ?? {};
  return encounter.participants.every(
    (participant) => (wounds[participant.id] ?? 0) >= PROFILES[participant.enemy.profile].maxHp,
  );
}

/**
 * Structural Condition shape. The compiled model types `when` through a
 * recursive Zod union that infers as `unknown`, so the evaluator casts to
 * this shape (the loader validated it) instead of narrowing the unknown.
 */
export type Condition =
  | { flag: string }
  | { visited: string }
  | { fired: string }
  | { defeated: string }
  | { has: { item: string; atLeast?: number } }
  | {
      attribute: {
        name: AttributeName;
        atLeast?: number;
        atMost?: number;
      };
    }
  | { health: { atLeast?: number; atMost?: number } }
  | { companion: string }
  | { companionLost: string }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

/** Evaluate one Condition against live state. Unknown ids read as false. */
export function evaluateCondition(
  scenario: Scenario,
  state: JourneyState,
  condition: CompiledCondition,
): boolean {
  const c = condition as unknown as Condition;
  if ('flag' in c) return state.flags.includes(c.flag);
  if ('visited' in c) return state.visited.includes(c.visited);
  if ('fired' in c) return state.firedScenes.includes(c.fired);
  if ('defeated' in c) return isDefeated(scenario, state, c.defeated);
  if ('has' in c) {
    return (state.inventory[c.has.item] ?? 0) >= (c.has.atLeast ?? 1);
  }
  if ('attribute' in c) {
    const value = effectiveAttributes(scenario, state)[c.attribute.name];
    if (c.attribute.atLeast !== undefined) return value >= c.attribute.atLeast;
    if (c.attribute.atMost !== undefined) return value <= c.attribute.atMost;
    return true;
  }
  if ('health' in c) {
    if (c.health.atLeast !== undefined) return state.character.health >= c.health.atLeast;
    if (c.health.atMost !== undefined) return state.character.health <= c.health.atMost;
    return true;
  }
  // Companion presence and loss travel in the v3 document (P6): on v2
  // documents both facts still read as false so content referencing them
  // stays inert but valid.
  if ('companion' in c)
    return isV3State(state) ? (state.companion?.id === c.companion) : false;
  if ('companionLost' in c)
    return isV3State(state) ? state.lostCompanions.includes(c.companionLost) : false;
  if ('all' in c) {
    return c.all.every((branch) => evaluateCondition(scenario, state, branch));
  }
  if ('any' in c) {
    return c.any.some((branch) => evaluateCondition(scenario, state, branch));
  }
  return !evaluateCondition(scenario, state, c.not);
}
