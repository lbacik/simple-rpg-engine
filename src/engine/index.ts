// Pure game rules: startPlaythrough, applyAction, view.
//
// This module must stay free of Next.js, React and persistence imports
// (enforced by the no-restricted-imports rule in eslint.config.mjs).

import type { Scenario } from '../content/index';
import type {
  AttributeName,
  CompiledChoice,
  CompiledEffect,
  CompiledOutcome,
  CompiledScene,
} from '../content/model';
import { effectiveAttributes, evaluateCondition } from './conditions';
import { isEquipmentSlot, removeFromInventory, type EquipmentSlot } from './inventory';
import { substituteName } from './narration';
import { deriveMap, type MapOptions, type MapView } from './map';
import { MAX_HEALTH, STATE_VERSION, type PlaythroughState } from './state';

export type { PlaythroughState } from './state';
export {
  MAX_HEALTH,
  PlaythroughStateSchema,
  STATE_VERSION,
  parsePlaythroughState,
} from './state';
export { effectiveAttributes, evaluateCondition } from './conditions';
export { escapeHtml, renderNarration, renderStoredText, substituteName } from './narration';
export {
  MAP_ASPECT_RATIO,
  MAP_CENTRE,
  deriveMap,
  resolveMapPositions,
  type MapEdge,
  type MapNode,
  type MapNodeStatus,
  type MapOptions,
  type MapView,
} from './map';

/**
 * Injected random source. Mirrors `crypto.randomInt(min, max)`: `min`
 * inclusive, `max` exclusive. Production rolls each die with
 * `randomInt(1, 7)`; tests pass a deterministic function.
 */
export type Rng = (min: number, max: number) => number;

/** Test Difficulty targets (docs/spec/mechanics.md, Tests). */
export const DIFFICULTY_TARGETS = {
  easy: 7,
  ordinary: 9,
  hard: 11,
  'very-hard': 13,
} as const;

export type Difficulty = keyof typeof DIFFICULTY_TARGETS;

const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: 'Easy',
  ordinary: 'Ordinary',
  hard: 'Hard',
  'very-hard': 'Very hard',
};

const ATTRIBUTE_NAMES: Record<AttributeName, string> = {
  might: 'Might',
  agility: 'Agility',
  wits: 'Wits',
  presence: 'Presence',
};

/**
 * The Choice label shown before a Test is taken (docs/spec/ui.md, tests and
 * results): the Attribute and the Difficulty by name and number, for example
 * "Might, Very hard 13".
 */
export function testLabel(attribute: AttributeName, difficulty: Difficulty): string {
  return `${ATTRIBUTE_NAMES[attribute]}, ${DIFFICULTY_NAMES[difficulty]} ${DIFFICULTY_TARGETS[difficulty]}`;
}

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
    }
  | {
      type: 'scene';
      sceneId: string;
      text: string;
    }
  | {
      type: 'choice';
      sceneId: string;
      choiceId: string;
      text: string;
    }
  | {
      type: 'test';
      /** The text as presented: both dice, the modifier, the total and the result. */
      text: string;
      attribute: AttributeName;
      difficulty: Difficulty;
      die1: number;
      die2: number;
      /** The effective Attribute the roll added. */
      modifier: number;
      total: number;
      success: boolean;
    }
  | {
      type: 'outcome';
      text: string;
    }
  | {
      type: 'state-change';
      text: string;
    };

/**
 * Journal entry types that make up the result panel
 * (docs/spec/playthrough-state.md, result panel): the Test, Outcome
 * narration and state changes of the latest step, plus intro, Combat end and
 * the Enemy-defeated notice. Scene narration, travel, Combat start and rounds
 * are shown by the new position itself. Test and Combat types arrive with
 * their tickets; the set already lists them.
 */
export const RESULT_PANEL_ENTRY_TYPES: ReadonlySet<string> = new Set([
  'intro',
  'test',
  'outcome',
  'state-change',
  'combat-end',
  'enemy-defeated',
]);

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
 * enter the starting Location (marked visited, opening on-enter Scene active).
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

  const initial: PlaythroughState = {
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
    ? [{ type: 'intro', text: substituteName(scenario.intro, trimmed) }]
    : [];
  // Entering the starting Location (no travel entry at start) may activate
  // its opening on-enter Scene. The Scene counts as fired at activation, so
  // a reload cannot fire it twice.
  const entered = enterLocation(scenario, initial, scenario.startLocation.id);
  return { ok: true, state: entered.state, journal: [...journal, ...entered.journal] };
}

/**
 * Player actions. Travel identifies the Connection by its target: every
 * visible Connection to the same target has the same effect. Equip names a
 * held Equipment item, Unequip names a slot, Use item names a held
 * Consumable. Choose names a Choice of the active Scene. Continue applies
 * the empty Outcome when no Choice is visible. Open Scene activates an
 * on-demand Scene of the current Location. Later tickets add Combat actions.
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
    }
  | {
      kind: 'choose';
      choiceId: string;
      expectedStep: number;
    }
  | {
      kind: 'continue';
      expectedStep: number;
    }
  | {
      kind: 'open-scene';
      sceneId: string;
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

function pushUnique(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

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
  // Kept for the engine contract: Travel, Scene and Location actions roll no
  // dice; Tests and Combat do.
  rng: Rng,
): ApplyActionResult {
  if (action.expectedStep !== state.step) {
    return { ok: false, reason: 'stale-step' };
  }
  if (state.status === 'ended') {
    return { ok: false, reason: 'ended' };
  }
  switch (action.kind) {
    case 'travel':
      return applyTravel(scenario, state, action.targetLocationId);
    case 'choose':
      return applyChoose(scenario, state, action.choiceId, rng);
    case 'continue':
      return applyContinue(scenario, state);
    case 'open-scene':
      return applyOpenScene(scenario, state, action.sceneId);
    case 'equip':
      return applyEquip(scenario, state, action.itemId);
    case 'unequip':
      return applyUnequip(scenario, state, action.slot);
    case 'use-item':
      return applyUseItem(scenario, state, action.itemId);
    default:
      return { ok: false, reason: 'illegal-action' };
  }
}

/** First eligible on-enter Scene of a Location, in listed order. */
function findOnEnterScene(
  scenario: Scenario,
  state: PlaythroughState,
  locationId: string,
): CompiledScene | undefined {
  const location = scenario.locationsById[locationId] ?? scenario.startLocation;
  return location.scenes.find(
    (scene) =>
      scene.trigger === 'on-enter' &&
      (scene.when === undefined || evaluateCondition(scenario, state, scene.when)) &&
      (scene.repeatable || !state.firedScenes.includes(scene.id)),
  );
}

/**
 * Entering a Location (at start, by Travel, or by `move`, including to the
 * current Location): set the Location, mark visited, then activate the first
 * eligible on-enter Scene, if any.
 */
function enterLocation(
  scenario: Scenario,
  state: PlaythroughState,
  locationId: string,
): { state: PlaythroughState; journal: NewJournalEntry[] } {
  const location = scenario.locationsById[locationId] ?? scenario.startLocation;
  const entered: PlaythroughState = {
    ...state,
    currentLocationId: location.id,
    activeSceneId: null,
    activeCombat: null,
    visited: pushUnique(state.visited, location.id),
  };
  const onEnter = findOnEnterScene(scenario, entered, location.id);
  if (onEnter === undefined) {
    return { state: entered, journal: [] };
  }
  return activateScene(scenario, entered, onEnter.id);
}

/**
 * Activating a Scene (on entering, by Open Scene, or by `next`): a `next` to
 * a non-repeatable Scene that has already fired is a no-op back to the
 * Location view. Otherwise the Scene joins the fired set at activation and
 * the position becomes Scene active, with the Scene narration appended to
 * the Journal.
 */
function activateScene(
  scenario: Scenario,
  state: PlaythroughState,
  sceneId: string,
): { state: PlaythroughState; journal: NewJournalEntry[] } {
  const scene = scenario.scenesById[sceneId];
  if (scene === undefined) {
    return { state: { ...state, activeSceneId: null }, journal: [] };
  }
  if (!scene.repeatable && state.firedScenes.includes(scene.id)) {
    return { state: { ...state, activeSceneId: null }, journal: [] };
  }
  const activated: PlaythroughState = {
    ...state,
    activeSceneId: scene.id,
    firedScenes: pushUnique(state.firedScenes, scene.id),
  };
  return {
    state: activated,
    journal: [
      {
        type: 'scene',
        sceneId: scene.id,
        text: substituteName(scene.text, state.character.name),
      },
    ],
  };
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
  const stepped: PlaythroughState = { ...state, step: state.step + 1 };
  const entered = enterLocation(scenario, stepped, target.id);
  return {
    ok: true,
    state: entered.state,
    journal: [
      { type: 'travel', text: `Travelled to ${target.name}.`, to: target.id },
      ...entered.journal,
    ],
  };
}

/** Whether a `once` Choice was already taken in its Scene. */
function isTakenOnce(state: PlaythroughState, sceneId: string, choiceId: string): boolean {
  return state.takenOnceChoices.some(
    (taken) => taken.sceneId === sceneId && taken.choiceId === choiceId,
  );
}

/**
 * Visible Choices of a Scene: a Choice whose `when` does not hold is hidden,
 * and a taken `once` Choice stays hidden, including in a repeatable Scene.
 */
export function visibleChoices(
  scenario: Scenario,
  state: PlaythroughState,
  scene: CompiledScene,
): CompiledChoice[] {
  return scene.choices.filter(
    (choice) =>
      (choice.when === undefined || evaluateCondition(scenario, state, choice.when)) &&
      !(choice.once && isTakenOnce(state, scene.id, choice.id)),
  );
}

/** Would this Outcome's damage drop the Character to 0 Health (later ticket)? */
function outcomeWouldKill(state: PlaythroughState, outcome: CompiledOutcome): boolean {
  let health = state.character.health;
  for (const effect of outcome.effects) {
    if ('heal' in effect) {
      health = Math.min(MAX_HEALTH, health + effect.heal);
    } else if ('damage' in effect) {
      health -= effect.damage;
      if (health <= 0) return true;
    }
  }
  return false;
}

/**
 * Rolling a Test (docs/spec/mechanics.md, Tests): 2d6 plus the effective
 * Attribute against the Difficulty target. No automatic success or failure,
 * no criticals. Production rolls each die with `crypto.randomInt(1, 7)`;
 * the `rng` here is that function in production, deterministic in tests.
 * Nothing from the client reaches this roll: the Action carries no seed and
 * no die value.
 */
function resolveTest(
  scenario: Scenario,
  state: PlaythroughState,
  test: NonNullable<CompiledChoice['test']>,
  rng: Rng,
): { entry: Extract<NewJournalEntry, { type: 'test' }>; outcome: CompiledOutcome } {
  const die1 = rng(1, 7);
  const die2 = rng(1, 7);
  const modifier = effectiveAttributes(scenario, state)[test.attribute];
  const total = die1 + die2 + modifier;
  const success = total >= DIFFICULTY_TARGETS[test.difficulty];
  const signed = modifier >= 0 ? `+${modifier}` : `${modifier}`;
  return {
    entry: {
      type: 'test',
      text: `${testLabel(test.attribute, test.difficulty)}: rolled ${die1} and ${die2}, modifier ${signed}, total ${total} — ${success ? 'success' : 'failure'}.`,
      attribute: test.attribute,
      difficulty: test.difficulty,
      die1,
      die2,
      modifier,
      total,
      success,
    },
    outcome: success ? test.success : test.failure,
  };
}

/**
 * An Outcome the engine cannot apply yet (later tickets): `start-combat`
 * (docs/spec/mechanics.md, Combat) and `end`
 * (docs/spec/playthrough-state.md, transitions).
 */
function outcomeNeedsLaterTicket(outcome: CompiledOutcome): boolean {
  return outcome.startCombat !== undefined || outcome.end !== undefined;
}

function applyChoose(
  scenario: Scenario,
  state: PlaythroughState,
  choiceId: string,
  rng: Rng,
): ApplyActionResult {
  // Choosing is legal only with a Scene active (and no Combat).
  if (state.activeSceneId == null || state.activeCombat != null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const scene = scenario.scenesById[state.activeSceneId];
  if (scene === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  const choice = scene.choices.find((candidate) => candidate.id === choiceId);
  if (choice === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  // Conditions are evaluated live: the Choice must still be visible.
  if (choice.when !== undefined && !evaluateCondition(scenario, state, choice.when)) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (choice.once && isTakenOnce(state, scene.id, choice.id)) {
    return { ok: false, reason: 'illegal-action' };
  }
  // Resolve the Test first: the roll picks the Outcome, and an Outcome
  // leading to Combat or an Ending, or a damage that kills, is rejected until
  // those tickets (nothing changes, including the `once` record).
  const test = choice.test === undefined ? undefined : resolveTest(scenario, state, choice.test, rng);
  const outcome = test?.outcome ?? choice.outcome;
  if (
    outcome !== undefined &&
    (outcomeNeedsLaterTicket(outcome) || outcomeWouldKill(state, outcome))
  ) {
    return { ok: false, reason: 'illegal-action' };
  }

  let next: PlaythroughState = state;
  if (choice.once) {
    next = {
      ...next,
      takenOnceChoices: [...next.takenOnceChoices, { sceneId: scene.id, choiceId: choice.id }],
    };
  }
  const journal: NewJournalEntry[] = [
    { type: 'choice', sceneId: scene.id, choiceId: choice.id, text: choice.text },
  ];
  if (test !== undefined) {
    journal.push(test.entry);
  }
  if (outcome === undefined) {
    // Neither outcome nor Test: the empty Outcome, back to the Location view.
    next = { ...next, activeSceneId: null };
  } else {
    const applied = applyOutcome(scenario, next, outcome);
    next = applied.state;
    journal.push(...applied.journal);
  }
  return { ok: true, state: { ...next, step: state.step + 1 }, journal };
}

/** The implicit Continue: a domain action applying the empty Outcome. */
function applyContinue(scenario: Scenario, state: PlaythroughState): ApplyActionResult {
  if (state.activeSceneId == null || state.activeCombat != null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const scene = scenario.scenesById[state.activeSceneId];
  if (scene === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  // Legal only when no Choice is visible; otherwise it would skip the Scene.
  if (visibleChoices(scenario, state, scene).length > 0) {
    return { ok: false, reason: 'illegal-action' };
  }
  return {
    ok: true,
    state: { ...state, activeSceneId: null, step: state.step + 1 },
    journal: [],
  };
}

/** On-demand Scenes on offer in the Location view, in listed order. */
export type OnDemandSceneView = {
  sceneId: string;
  title: string;
};

export function onDemandScenes(scenario: Scenario, state: PlaythroughState): OnDemandSceneView[] {
  const location =
    scenario.locationsById[state.currentLocationId] ?? scenario.startLocation;
  return location.scenes
    .filter(
      (scene) =>
        scene.trigger === 'on-demand' &&
        (scene.when === undefined || evaluateCondition(scenario, state, scene.when)) &&
        (scene.repeatable || !state.firedScenes.includes(scene.id)),
    )
    .map((scene) => ({ sceneId: scene.id, title: scene.title }));
}

function applyOpenScene(
  scenario: Scenario,
  state: PlaythroughState,
  sceneId: string,
): ApplyActionResult {
  // Opening is legal only in the Location view: no active Scene, no Combat.
  if (state.activeSceneId != null || state.activeCombat != null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const scene = scenario.scenesById[sceneId];
  if (scene === undefined || scene.trigger !== 'on-demand') {
    return { ok: false, reason: 'illegal-action' };
  }
  if (scene.location?.id !== state.currentLocationId) {
    return { ok: false, reason: 'illegal-action' };
  }
  // An on-demand Scene's `when` is checked when it is activated.
  if (scene.when !== undefined && !evaluateCondition(scenario, state, scene.when)) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (!scene.repeatable && state.firedScenes.includes(scene.id)) {
    return { ok: false, reason: 'illegal-action' };
  }
  const activated = activateScene(scenario, state, sceneId);
  return {
    ok: true,
    state: { ...activated.state, step: state.step + 1 },
    journal: activated.journal,
  };
}

/**
 * Applying an Outcome: narration, then Effects in authored order, then the
 * transition (`next`, `move`, or none: back to the Location view without
 * re-evaluating on-enter Scenes).
 */
function applyOutcome(
  scenario: Scenario,
  state: PlaythroughState,
  outcome: CompiledOutcome,
): { state: PlaythroughState; journal: NewJournalEntry[] } {
  let next = state;
  const journal: NewJournalEntry[] = [];
  if (outcome.text !== undefined) {
    journal.push({ type: 'outcome', text: substituteName(outcome.text, state.character.name) });
  }
  for (const effect of outcome.effects) {
    const applied = applyEffect(scenario, next, effect);
    next = applied.state;
    if (applied.entry !== undefined) {
      journal.push(applied.entry);
    }
  }
  if (outcome.next !== undefined) {
    const activated = activateScene(scenario, next, outcome.next.id);
    next = activated.state;
    journal.push(...activated.journal);
  } else if (outcome.move !== undefined) {
    const entered = enterLocation(scenario, next, outcome.move.id);
    next = entered.state;
    journal.push(...entered.journal);
  } else {
    next = { ...next, activeSceneId: null };
  }
  return { state: next, journal };
}

/**
 * One Effect and its state-change Journal entry. Content-driven `heal` at
 * full Health is a silent no-op: no state change, no entry.
 */
function applyEffect(
  scenario: Scenario,
  state: PlaythroughState,
  effect: CompiledEffect,
): { state: PlaythroughState; entry: NewJournalEntry | undefined } {
  if ('set-flag' in effect) {
    const flag = effect['set-flag'];
    return {
      state: { ...state, flags: pushUnique(state.flags, flag) },
      entry: { type: 'state-change', text: `flag set: ${flag}` },
    };
  }
  if ('clear-flag' in effect) {
    const flag = effect['clear-flag'];
    return {
      state: { ...state, flags: state.flags.filter((held) => held !== flag) },
      entry: { type: 'state-change', text: `flag cleared: ${flag}` },
    };
  }
  if ('give-item' in effect) {
    const { item, quantity } = effect['give-item'];
    const name = scenario.itemsById[item]?.name ?? item;
    return {
      state: {
        ...state,
        inventory: { ...state.inventory, [item]: (state.inventory[item] ?? 0) + quantity },
      },
      entry: {
        type: 'state-change',
        text: quantity === 1 ? `received: ${name}` : `received: ${name} ×${quantity}`,
      },
    };
  }
  if ('take-item' in effect) {
    const { item, quantity } = effect['take-item'];
    const name = scenario.itemsById[item]?.name ?? item;
    const held = state.inventory[item] ?? 0;
    const actual = Math.min(quantity, held);
    if (actual <= 0) {
      // Nothing held: no state change, so no Journal entry either.
      return { state, entry: undefined };
    }
    const left = held - actual;
    const inventory = { ...state.inventory };
    if (left <= 0) {
      delete inventory[item];
    } else {
      inventory[item] = left;
    }
    // Removing the last copy of an equipped item unequips it first; removing
    // one of several copies leaves it equipped.
    let equipment = state.equipment;
    if (left <= 0) {
      const slot = (
        Object.keys(equipment) as Array<keyof PlaythroughState['equipment']>
      ).find((candidate) => equipment[candidate] === item);
      if (slot !== undefined) {
        equipment = { ...equipment };
        delete equipment[slot];
      }
    }
    return {
      state: { ...state, inventory, equipment },
      entry: {
        type: 'state-change',
        text: actual === 1 ? `lost: ${name}` : `lost: ${name} ×${actual}`,
      },
    };
  }
  if ('heal' in effect) {
    const restored =
      Math.min(MAX_HEALTH, state.character.health + effect.heal) - state.character.health;
    if (restored <= 0) {
      return { state, entry: undefined };
    }
    return {
      state: {
        ...state,
        character: { ...state.character, health: state.character.health + restored },
      },
      entry: { type: 'state-change', text: `+${restored} Health` },
    };
  }
  if ('damage' in effect) {
    // Non-lethal here: lethal damage is rejected before the Outcome applies.
    return {
      state: {
        ...state,
        character: { ...state.character, health: state.character.health - effect.damage },
      },
      entry: { type: 'state-change', text: `−${effect.damage} Health` },
    };
  }
  const target = effect.reveal;
  const name = scenario.locationsById[target]?.name ?? target;
  if (state.visited.includes(target)) {
    // Revealing a visited Location is a spec no-op: no state change, no entry.
    return { state, entry: undefined };
  }
  return {
    state: { ...state, revealed: pushUnique(state.revealed, target) },
    entry: { type: 'state-change', text: `revealed: ${name}` },
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

export function visibleExits(scenario: Scenario, state: PlaythroughState): ExitView[] {
  return visibleConnections(scenario, state).map((connection) => ({
    targetLocationId: connection.to.id,
    label: connection.label,
  }));
}

/** One visible Choice per row: Choice text is literal (no Markdown). */
export type ChoiceView = {
  id: string;
  text: string;
  /** The Test label shown before the Choice is taken, if the Choice has a Test. */
  testLabel?: string;
};

/** Derived projection the UI renders. Later tickets add Combat and the map. */
export type GameView =
  | {
      kind: 'location';
      locationId: string;
      name: string;
      description: string;
      exits: ExitView[];
      onDemandScenes: OnDemandSceneView[];
      map: MapView;
    }
  | {
      kind: 'scene';
      locationId: string;
      locationName: string;
      sceneId: string;
      title: string;
      /** Raw narration source; the UI renders it with the Character's name. */
      text: string;
      characterName: string;
      choices: ChoiceView[];
      map: MapView;
    }
  | {
      kind: 'ended';
      endingId: string;
      title: string;
      text: string;
      map: MapView;
    };

/**
 * The current position: the Ending once ended, the active Scene with its
 * visible Choices (while a Scene is active there are no exits), otherwise
 * the Location view with its exits and on-demand Scenes on offer. Every
 * view carries the Location map derived from the stored `visited`/`revealed` sets.
 */
export function view(
  scenario: Scenario,
  state: PlaythroughState,
  options: MapOptions = {},
): GameView {
  if (state.status === 'ended') {
    const endingId = state.endingId ?? scenario.deathEnding.id;
    const ending = scenario.endingsById[endingId] ?? scenario.deathEnding;
    return {
      kind: 'ended',
      endingId: ending.id,
      title: ending.title,
      text: ending.text,
      map: deriveMap(scenario, state, options),
    };
  }
  if (state.activeSceneId != null) {
    const scene = scenario.scenesById[state.activeSceneId];
    if (scene !== undefined) {
      const location =
        scenario.locationsById[state.currentLocationId] ?? scenario.startLocation;
      return {
        kind: 'scene',
        locationId: location.id,
        locationName: location.name,
        sceneId: scene.id,
        title: scene.title,
        text: scene.text,
        characterName: state.character.name,
        choices: visibleChoices(scenario, state, scene).map((choice) => ({
          id: choice.id,
          text: choice.text,
          testLabel:
            choice.test === undefined
              ? undefined
              : testLabel(choice.test.attribute, choice.test.difficulty),
        })),
        map: deriveMap(scenario, state, options),
      };
    }
  }
  const location =
    scenario.locationsById[state.currentLocationId] ?? scenario.startLocation;
  return {
    kind: 'location',
    locationId: location.id,
    name: location.name,
    description: location.description,
    exits: visibleExits(scenario, state),
    onDemandScenes: onDemandScenes(scenario, state),
    map: deriveMap(scenario, state, options),
  };
}
