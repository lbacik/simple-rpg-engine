// Live Condition evaluation (docs/spec/content-semantics.md, conditions).
//
// Used both when rendering (which Connections, on-demand Scenes and Choices
// are visible) and again when an action is submitted. The Scenes ticket
// extends this with the facts Choices need; the vocabulary here already
// covers every fact Connections can test.

import type { CompiledCondition, Scenario } from '../content/model';
import type { PlaythroughState } from './state';

const ATTRIBUTE_NAMES = ['might', 'agility', 'wits', 'presence'] as const;

export type AttributeName = (typeof ATTRIBUTE_NAMES)[number];

/** Effective Attributes: base plus Equipment bonuses, capped at +2 each. */
export function effectiveAttributes(
  scenario: Scenario,
  state: PlaythroughState,
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

function isDefeated(scenario: Scenario, state: PlaythroughState, encounterId: string): boolean {
  const encounter = scenario.encountersById[encounterId];
  if (encounter === undefined) return false;
  // An Encounter is defeated when every participant is: each participant's
  // recorded Damage taken reaches its Enemy's current maximum Health
  // (docs/spec/content-semantics.md, conditions; docs/spec/mechanics.md,
  // persistence of wounds). The stored record is still one Damage-taken
  // number per Encounter (state v1); per-participant wounds arrive with the
  // state-versions package, which reuses this predicate shape.
  const taken = state.encounterDamage[encounterId] ?? 0;
  return encounter.participants.every((participant) => taken >= participant.enemy.health);
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
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

/** Evaluate one Condition against live state. Unknown ids read as false. */
export function evaluateCondition(
  scenario: Scenario,
  state: PlaythroughState,
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
  if ('all' in c) {
    return c.all.every((branch) => evaluateCondition(scenario, state, branch));
  }
  if ('any' in c) {
    return c.any.some((branch) => evaluateCondition(scenario, state, branch));
  }
  return !evaluateCondition(scenario, state, c.not);
}
