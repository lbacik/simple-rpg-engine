// Pure game rules: startPlaythrough, applyAction (later tickets), view.
//
// This module must stay free of Next.js, React and persistence imports
// (enforced by the no-restricted-imports rule in eslint.config.mjs).

import type { Scenario } from '../content/index';
import { evaluateCondition } from './conditions';
import { isEquipmentSlot, removeFromInventory, type EquipmentSlot } from './inventory';
import { MAX_HEALTH, STATE_VERSION, type PlaythroughState } from './state';

export type { PlaythroughState } from './state';
export {
  MAX_HEALTH,
  PlaythroughStateSchema,
  STATE_VERSION,
  parsePlaythroughState,
} from './state';
export { effectiveAttributes, evaluateCondition } from './conditions';

/**
 * Injected random source. Mirrors `crypto.randomInt(min, max)`: `min`
 * inclusive, `max` exclusive. Production rolls each die with
 * `randomInt(1, 7)`; tests pass a deterministic function.
 */
export type Rng = (min: number, max: number) => number;

/** New Journal entries produced by one engine step. Stored text as presented. */
export type NewJournalEntry =
  | {
      type: 'intro';
      text: string;
    }
  | {
      type: 'travel';
      text: string;
      to: string;
    }
  | {
      type: 'inventory';
      text: string;
    };

export type StartPlaythroughSuccess = {
  ok: true;
  state: PlaythroughState;
  journal: NewJournalEntry[];
};

export type StartPlaythroughFailure = {
  ok: false;
  reason: 'invalid-name' | 'unknown-template';
};

export type StartPlaythroughResult = StartPlaythroughSuccess | StartPlaythroughFailure;

/**
 * Starting a Playthrough, one atomic step
 * (docs/spec/playthrough-state.md, transitions):
 * create the Character from the Template (trimmed 1-40 name, copied base
 * Attributes, Health 12, starting items, Template Equipment equipped), set
 * step 0 at the starting Location with empty Flags, append the intro, and
 * enter the starting Location (marked visited).
 *
 * On-enter Scene activation arrives with the Scenes ticket; until then the
 * position is the Location view of the starting Location.
 */
export function startPlaythrough(
  scenario: Scenario,
  templateId: string,
  name: string,
  // Kept for the engine contract: later steps roll dice, starting one does not.
  _rng: Rng,
): StartPlaythroughResult {
  void _rng;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    return { ok: false, reason: 'invalid-name' };
  }
  const template = scenario.templatesById[templateId];
  if (template === undefined) {
    return { ok: false, reason: 'unknown-template' };
  }

  const inventory: Record<string, number> = {};
  for (const entry of template.items) {
    inventory[entry.item.id] = (inventory[entry.item.id] ?? 0) + entry.quantity;
  }

  const equipment: PlaythroughState['equipment'] = {};
  for (const entry of template.items) {
    if (entry.item.kind === 'equipment') {
      equipment[entry.item.slot] = entry.item.id;
    }
  }

  const state: PlaythroughState = {
    stateVersion: STATE_VERSION,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    contentHash: scenario.contentHash,
    status: 'active',
    step: 0,
    character: {
      templateId: template.id,
      name: trimmed,
      baseAttributes: { ...template.attributes },
      health: 12,
    },
    inventory,
    equipment,
    currentLocationId: scenario.startLocation.id,
    activeSceneId: null,
    activeCombat: null,
    visited: [scenario.startLocation.id],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounterDamage: {},
  };

  const journal: NewJournalEntry[] = scenario.intro
    ? [{ type: 'intro', text: scenario.intro }]
    : [];

  return { ok: true, state, journal };
}

/**
 * Player actions. Travel identifies the Connection by its target: every
 * visible Connection to the same target has the same effect. Equip names a
 * held Equipment item, Unequip names a slot, Use item names a held
 * Consumable. Later tickets add Choose, Continue, Open Scene and Combat
 * actions.
 */
export type Action =
  | {
      kind: 'travel';
      targetLocationId: string;
      expectedStep: number;
    }
  | {
      kind: 'equip';
      itemId: string;
      expectedStep: number;
    }
  | {
      kind: 'unequip';
      slot: EquipmentSlot;
      expectedStep: number;
    }
  | {
      kind: 'use-item';
      itemId: string;
      expectedStep: number;
    };

export type ApplyActionSuccess = {
  ok: true;
  state: PlaythroughState;
  journal: NewJournalEntry[];
};

export type ApplyActionFailure = {
  ok: false;
  reason: 'stale-step' | 'illegal-action' | 'ended';
};

export type ApplyActionResult = ApplyActionSuccess | ApplyActionFailure;

/** Visible Connections from the current Location, in authored order. */
function visibleConnections(
  scenario: Scenario,
  state: PlaythroughState,
): import('../content/model').CompiledConnection[] {
  const current =
    scenario.locationsById[state.currentLocationId] ?? scenario.startLocation;
  return current.connections.filter(
    (connection) =>
      connection.when === undefined || evaluateCondition(scenario, state, connection.when),
  );
}

/**
 * One synchronous, deterministic turn without I/O
 * (docs/spec/architecture.md, engine contract): the `step` guard first, then
 * legality in the current position. Returns only the new Journal entries.
 */
export function applyAction(
  scenario: Scenario,
  state: PlaythroughState,
  action: Action,
  // Kept for the engine contract: Travel rolls no dice, later actions do.
  _rng: Rng,
): ApplyActionResult {
  void _rng;
  if (action.expectedStep !== state.step) {
    return { ok: false, reason: 'stale-step' };
  }
  if (state.status === 'ended') {
    return { ok: false, reason: 'ended' };
  }
  if (action.kind === 'travel') {
    return applyTravel(scenario, state, action.targetLocationId);
  }
  if (action.kind === 'equip') {
    return applyEquip(scenario, state, action.itemId);
  }
  if (action.kind === 'unequip') {
    return applyUnequip(scenario, state, action.slot);
  }
  if (action.kind === 'use-item') {
    return applyUseItem(scenario, state, action.itemId);
  }
  return { ok: false, reason: 'illegal-action' };
}

function applyTravel(
  scenario: Scenario,
  state: PlaythroughState,
  targetLocationId: string,
): ApplyActionResult {
  // Travel is legal only in the Location view: no active Scene, no Combat.
  if (state.activeSceneId != null || state.activeCombat != null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const leadsThere = visibleConnections(scenario, state).some(
    (connection) => connection.to.id === targetLocationId,
  );
  const target = scenario.locationsById[targetLocationId];
  if (!leadsThere || target === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  // Entering the target: set the Location, mark visited, append travel.
  // On-enter Scene activation arrives with the Scenes ticket; until then the
  // position is the Location view of the target.
  const visited = state.visited.includes(target.id)
    ? state.visited
    : [...state.visited, target.id];
  return {
    ok: true,
    state: {
      ...state,
      step: state.step + 1,
      currentLocationId: target.id,
      activeSceneId: null,
      activeCombat: null,
      visited,
    },
    journal: [{ type: 'travel', text: `Travelled to ${target.name}.`, to: target.id }],
  };
}

/**
 * Equip (docs/spec/playthrough-state.md): legal in the Location view and
 * while a Scene is active, never in Combat. The held Equipment moves into
 * its slot, replacing the occupant. Advances `step` with an inventory entry.
 */
function applyEquip(
  scenario: Scenario,
  state: PlaythroughState,
  itemId: string,
): ApplyActionResult {
  if (state.activeCombat != null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const item = scenario.itemsById[itemId];
  if (item === undefined || item.kind !== 'equipment') {
    return { ok: false, reason: 'illegal-action' };
  }
  if ((state.inventory[itemId] ?? 0) < 1) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (state.equipment[item.slot] === itemId) {
    // Re-equipping what is already there changes nothing.
    return { ok: false, reason: 'illegal-action' };
  }
  return {
    ok: true,
    state: {
      ...state,
      step: state.step + 1,
      equipment: { ...state.equipment, [item.slot]: itemId },
    },
    journal: [{ type: 'inventory', text: `Equipped ${item.name}.` }],
  };
}

/**
 * Unequip: legal in the Location view and while a Scene is active, never in
 * Combat. Empties an occupied slot. Advances `step` with an inventory entry.
 */
function applyUnequip(
  scenario: Scenario,
  state: PlaythroughState,
  slot: string,
): ApplyActionResult {
  if (state.activeCombat != null) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (!isEquipmentSlot(slot)) {
    return { ok: false, reason: 'illegal-action' };
  }
  const equippedId = state.equipment[slot];
  if (equippedId === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  const equipment = { ...state.equipment };
  delete equipment[slot];
  const name = scenario.itemsById[equippedId]?.name ?? equippedId;
  return {
    ok: true,
    state: { ...state, step: state.step + 1, equipment },
    journal: [{ type: 'inventory', text: `Unequipped ${name}.` }],
  };
}

/**
 * Use item outside Combat: a held Consumable below full Health heals (capped
 * at 12) and consumes one copy; the position is unchanged. At full Health
 * the use is rejected: nothing is consumed and `step` does not advance.
 */
function applyUseItem(
  scenario: Scenario,
  state: PlaythroughState,
  itemId: string,
): ApplyActionResult {
  if (state.activeCombat != null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const item = scenario.itemsById[itemId];
  if (item === undefined || item.kind !== 'consumable') {
    return { ok: false, reason: 'illegal-action' };
  }
  if ((state.inventory[itemId] ?? 0) < 1) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (state.character.health >= MAX_HEALTH) {
    return { ok: false, reason: 'illegal-action' };
  }
  const restored =
    Math.min(MAX_HEALTH, state.character.health + item.heal) - state.character.health;
  const { inventory, equipment } = removeFromInventory(state, itemId, 1);
  return {
    ok: true,
    state: {
      ...state,
      step: state.step + 1,
      character: { ...state.character, health: state.character.health + restored },
      inventory,
      equipment,
    },
    journal: [{ type: 'inventory', text: `Used ${item.name}, restored ${restored} Health.` }],
  };
}

/** One exit button per visible Connection, in authored order. */
export type ExitView = {
  targetLocationId: string;
  label: string;
};

export function visibleExits(
  scenario: Scenario,
  state: PlaythroughState,
): ExitView[] {
  return visibleConnections(scenario, state).map((connection) => ({
    targetLocationId: connection.to.id,
    label: connection.label,
  }));
}

/** Derived projection the UI renders. Later tickets add Scene, Combat, map. */
export type GameView =
  | {
      kind: 'location';
      locationId: string;
      name: string;
      description: string;
      exits: ExitView[];
    }
  | {
      kind: 'ended';
      endingId: string;
      title: string;
      text: string;
    };

/** Location view of the current Location (Scene activation lands later). */
export function view(scenario: Scenario, state: PlaythroughState): GameView {
  if (state.status === 'ended') {
    const endingId = state.endingId ?? scenario.deathEnding.id;
    const ending = scenario.endingsById[endingId] ?? scenario.deathEnding;
    return { kind: 'ended', endingId: ending.id, title: ending.title, text: ending.text };
  }
  const location =
    scenario.locationsById[state.currentLocationId] ?? scenario.startLocation;
  return {
    kind: 'location',
    locationId: location.id,
    name: location.name,
    description: location.description,
    exits: visibleExits(scenario, state),
  };
}
