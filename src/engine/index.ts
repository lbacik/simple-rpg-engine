// Pure game rules: startPlaythrough, applyAction, view.
//
// This module must stay free of Next.js, React and persistence imports
// (enforced by the no-restricted-imports rule in eslint.config.mjs).

import type { Scenario } from '../content/index';
import type {
  AttributeName,
  CompiledChoice,
  CompiledEffect,
  CompiledImageEntry,
  CompiledOutcome,
  CompiledScene,
} from '../content/model';
import { effectiveAttributes, evaluateCondition, isV3State } from './conditions';
import type { RoundCommand } from './combat/index';
import { isEquipmentSlot, removeFromInventory, type EquipmentSlot } from './inventory';
import { substituteName } from './narration';
import { deriveMap, type MapOptions, type MapView } from './map';
import { MAX_HEALTH, STATE_VERSION, type PlaythroughState } from './state';
import { PLAYTHROUGH_MAX_HEALTH, type PlaythroughV3 } from './state-v3';

export type { PlaythroughState } from './state';
export {
  MAX_HEALTH,
  PlaythroughStateSchema,
  STATE_VERSION,
  parsePlaythroughState,
} from './state';
export { effectiveAttributes, evaluateCondition, isV3State, type JourneyState } from './conditions';
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

/**
 * Reason codes for unavailable inventory actions. The view returns these
 * codes and the app renders them from the catalogue, so the engine produces
 * no Interface Text (docs/spec/architecture.md, engine contract).
 */
export type InventoryReason = 'in-combat' | 'full-health';

/**
 * The Character's maximum Health on either document: 12 on the v2 journey,
 * 40 (the hero profile's maximum) on Combat MVP 1.0 documents.
 */
export function maxHealthFor(state: PlaythroughState | PlaythroughV3): number {
  return isV3State(state) ? PLAYTHROUGH_MAX_HEALTH : MAX_HEALTH;
}

/**
 * Why Equip/Unequip is unavailable outside the Location/Scene position. S4
 * (Combat MVP 1.0): the tactical Combat is deleted, so a v2 Playthrough is
 * never in Combat; on a v3 document the inventory shows `in-combat` while a
 * fight runs (G5).
 */
export function inventoryEquipReason(
  state: PlaythroughState | PlaythroughV3,
): InventoryReason | undefined {
  if (isV3State(state) && state.activeCombat !== null) {
    return 'in-combat';
  }
  return undefined;
}

/** Why Use item is unavailable: in Combat, or at full Health. */
export function inventoryUseReason(
  state: PlaythroughState | PlaythroughV3,
): InventoryReason | undefined {
  if (isV3State(state) && state.activeCombat !== null) {
    return 'in-combat';
  }
  return state.character.health >= maxHealthFor(state) ? 'full-health' : undefined;
}

/**
 * New Journal entries produced by one engine step.
 * (docs/spec/playthrough-state.md, journal; ADR 0004).
 *
 * Every entry carries `lang`: the language of the Scenario text in effect
 * when the entry was presented (the Scenario's Base Language until
 * Translations are shown). Scenario text is stored as presented; the travel
 * wording and the Ending's kind come from the Interface Text catalogue when
 * the entry is read, so the travel entry stores the target Location's name
 * and id instead of a sentence.
 */
export type NewJournalEntry =
  | {
      type: 'intro';
      lang: string;
      text: string;
    }
  | {
      type: 'travel';
      lang: string;
      to: string;
      /** The target Location's name as presented. */
      name: string;
    }
  | {
      type: 'inventory';
      lang: string;
      /** Structured inventory action: equipped, unequipped or used. */
      action: 'equipped' | 'unequipped' | 'used';
      /** The item id and the name as presented. */
      itemId: string;
      name: string;
      /** Health restored by a Use; absent on equip/unequip. */
      healed?: number;
    }
  | {
      type: 'scene';
      lang: string;
      sceneId: string;
      text: string;
    }
  | {
      type: 'choice';
      lang: string;
      sceneId: string;
      choiceId: string;
      text: string;
    }
  | {
      type: 'test';
      lang: string;
      attribute: AttributeName;
      difficulty: Difficulty;
      /** The Difficulty target the total was measured against. */
      target: number;
      die1: number;
      die2: number;
      /** The effective Attribute the roll added. */
      modifier: number;
      total: number;
      success: boolean;
    }
  | {
      type: 'outcome';
      lang: string;
      text: string;
    }
  | {
      type: 'state-change';
      lang: string;
      /** Structured state change; Flag changes are never emitted. */
      change: 'item-received' | 'item-lost' | 'health-gained' | 'health-lost' | 'revealed';
      /** Item id for item changes; Location id for a reveal. */
      itemId?: string;
      /** Item or Location name as presented; present on item and reveal changes. */
      name?: string;
      /** Item quantity, or Health gained/lost. */
      amount?: number;
    }
  | {
      type: 'ending';
      lang: string;
      endingId: string;
      kind: 'victory' | 'defeat';
      title: string;
      text: string;
    }

/**
 * Journal entry types that make up the Outcome modal
 * (docs/spec/playthrough-state.md, outcome modal): the Test, Outcome
 * narration and state changes of the latest step. The intro is not part of
 * it: at the start of a Playthrough it shows in a modal over the starting
 * Location instead. Scene narration and travel are revealed after
 * acknowledgement through the existing engine sequence. S4 (Combat MVP 1.0)
 * removes the Combat end and Enemy-defeated entries with the tactical Combat;
 * the P6 adapter re-adds the v3 Combat entries.
 */
export const OUTCOME_MODAL_ENTRY_TYPES: ReadonlySet<string> = new Set([
  'test',
  'outcome',
  'state-change',
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
    visited: [scenario.startLocation.id],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounters: {},
  };

  const journal: NewJournalEntry[] = scenario.intro
    ? [{ type: 'intro', lang: scenario.language, text: substituteName(scenario.intro, trimmed) }]
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
 * on-demand Scene of the current Location.
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
    }
  | {
      kind: 'combat-confirm';
      command: RoundCommand;
      expectedStep: number;
    }
  | {
      kind: 'combat-surrender';
      round: number;
      expectedStep: number;
    }

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
  state: PlaythroughState | PlaythroughV3,
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
  // dice; Tests do.
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
  state: PlaythroughState | PlaythroughV3,
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
        lang: scenario.language,
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
  // Travel is legal only in the Location view: no active Scene.
  if (state.activeSceneId != null) {
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
      { type: 'travel', lang: scenario.language, to: target.id, name: target.name },
      ...entered.journal,
    ],
  };
}

/** Whether a `once` Choice was already taken in its Scene. */
function isTakenOnce(state: PlaythroughState | PlaythroughV3, sceneId: string, choiceId: string): boolean {
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
  state: PlaythroughState | PlaythroughV3,
  scene: CompiledScene,
): CompiledChoice[] {
  return scene.choices.filter(
    (choice) =>
      (choice.when === undefined || evaluateCondition(scenario, state, choice.when)) &&
      !(choice.once && isTakenOnce(state, scene.id, choice.id)),
  );
}

/**
 * The Ending Journal entry appended whenever the Playthrough ends, by `end`
 * or by death (docs/spec/playthrough-state.md, journal): kind, title and
 * closing narration, stored as presented.
 */
function endingEntry(
  scenario: Scenario,
  state: PlaythroughState,
  ending: { id: string; kind: 'victory' | 'defeat'; title: string; text: string },
): NewJournalEntry {
  return {
    type: 'ending',
    lang: scenario.language,
    endingId: ending.id,
    kind: ending.kind,
    title: ending.title,
    text: substituteName(ending.text, state.character.name),
  };
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
  const target = DIFFICULTY_TARGETS[test.difficulty];
  const success = total >= target;
  return {
    entry: {
      type: 'test',
      lang: scenario.language,
      attribute: test.attribute,
      difficulty: test.difficulty,
      target,
      die1,
      die2,
      modifier,
      total,
      success,
    },
    outcome: success ? test.success : test.failure,
  };
}

function applyChoose(
  scenario: Scenario,
  state: PlaythroughState,
  choiceId: string,
  rng: Rng,
): ApplyActionResult {
  // Choosing is legal only with a Scene active.
  if (state.activeSceneId == null) {
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
  // Resolve the Test first: the roll picks the Outcome. Endings and lethal
  // damage are handled by applyOutcome.
  const test = choice.test === undefined ? undefined : resolveTest(scenario, state, choice.test, rng);
  const outcome = test?.outcome ?? choice.outcome;

  let next: PlaythroughState = state;
  if (choice.once) {
    next = {
      ...next,
      takenOnceChoices: [...next.takenOnceChoices, { sceneId: scene.id, choiceId: choice.id }],
    };
  }
  const journal: NewJournalEntry[] = [
    {
      type: 'choice',
      lang: scenario.language,
      sceneId: scene.id,
      choiceId: choice.id,
      text: choice.text,
    },
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
  if (state.activeSceneId == null) {
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

export function onDemandScenes(scenario: Scenario, state: PlaythroughState | PlaythroughV3): OnDemandSceneView[] {
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
  // Opening is legal only in the Location view: no active Scene.
  if (state.activeSceneId != null) {
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
 * transition (`next`, `move`, `end`, or none: back to the Location view
 * without re-evaluating on-enter Scenes).
 *
 * A `damage` Effect that brings Health to 0 or below sets Health to 0,
 * skips the remaining Effects and the transition, and ends the Playthrough
 * on the Scenario's death Ending. An `end` transition sets the status to
 * `ended(endingId)` and appends the Ending entry. Either way the position
 * becomes Ended: no active Scene.
 */
function applyOutcome(
  scenario: Scenario,
  state: PlaythroughState,
  outcome: CompiledOutcome,
): { state: PlaythroughState; journal: NewJournalEntry[] } {
  let next = state;
  const journal: NewJournalEntry[] = [];
  if (outcome.text !== undefined) {
    journal.push({
      type: 'outcome',
      lang: scenario.language,
      text: substituteName(outcome.text, state.character.name),
    });
  }
  for (const effect of outcome.effects) {
    if ('damage' in effect && next.character.health - effect.damage <= 0) {
      next = {
        ...next,
        character: { ...next.character, health: 0 },
      };
      journal.push({
        type: 'state-change',
        lang: scenario.language,
        change: 'health-lost',
        amount: effect.damage,
      });
      next = {
        ...next,
        status: 'ended',
        endingId: scenario.deathEnding.id,
        activeSceneId: null,
          };
      journal.push(endingEntry(scenario, next, scenario.deathEnding));
      return { state: next, journal };
    }
    const applied = applyEffect(scenario, next, effect);
    next = applied.state;
    if (applied.entry !== undefined) {
      journal.push(applied.entry);
    }
  }
  if (outcome.end !== undefined) {
    next = {
      ...next,
      status: 'ended',
      endingId: outcome.end.id,
      activeSceneId: null,
      };
    journal.push(endingEntry(scenario, next, outcome.end));
    return { state: next, journal };
  }
  // S4 (Combat MVP 1.0): the tactical Combat entry is deleted and the shared
  // core adapter (P6) is not wired yet, so a `start-combat` Outcome cannot
  // enter Combat. Other transitions still apply; the Encounter stays
  // undefeated and repeatable until the adapter lands.
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
    // Flag changes are the author's internal memory and are never presented,
    // neither on screen nor in the Journal.
    return { state: { ...state, flags: pushUnique(state.flags, flag) }, entry: undefined };
  }
  if ('clear-flag' in effect) {
    const flag = effect['clear-flag'];
    return {
      state: { ...state, flags: state.flags.filter((held) => held !== flag) },
      entry: undefined,
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
        lang: scenario.language,
        change: 'item-received',
        itemId: item,
        name,
        amount: quantity,
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
        lang: scenario.language,
        change: 'item-lost',
        itemId: item,
        name,
        amount: actual,
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
      entry: {
        type: 'state-change',
        lang: scenario.language,
        change: 'health-gained',
        amount: restored,
      },
    };
  }
  if ('damage' in effect) {
    // Non-lethal here: lethal damage ends on the death Ending in
    // applyOutcome before reaching this branch.
    return {
      state: {
        ...state,
        character: { ...state.character, health: state.character.health - effect.damage },
      },
      entry: {
        type: 'state-change',
        lang: scenario.language,
        change: 'health-lost',
        amount: effect.damage,
      },
    };
  }
  // Companion join/leave are validated content (P3) but take effect only in
  // the Scenario adapter (P6): the old tactical engine keeps no Companion
  // state, so they are no-ops here.
  if ('companion-join' in effect || 'companion-leave' in effect) {
    return { state, entry: undefined };
  }
  if (!('reveal' in effect)) {
    return { state, entry: undefined };
  }
  const target = effect.reveal;
  const name = scenario.locationsById[target]?.name ?? target;
  if (state.visited.includes(target)) {
    // Revealing a visited Location is a spec no-op: no state change, no entry.
    return { state, entry: undefined };
  }
  return {
    state: { ...state, revealed: pushUnique(state.revealed, target) },
    entry: {
      type: 'state-change',
      lang: scenario.language,
      change: 'revealed',
      itemId: target,
      name,
    },
  };
}

/**
 * Equip (docs/spec/playthrough-state.md): legal in the Location view and
 * while a Scene is active. The held Equipment moves into its slot, replacing
 * the occupant. Advances `step` with an inventory entry.
 */
function applyEquip(
  scenario: Scenario,
  state: PlaythroughState,
  itemId: string,
): ApplyActionResult {
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
    journal: [
      {
        type: 'inventory',
        lang: scenario.language,
        action: 'equipped',
        itemId,
        name: item.name,
      },
    ],
  };
}

/**
 * Unequip: legal in the Location view and while a Scene is active. Empties
 * an occupied slot. Advances `step` with an inventory entry.
 */
function applyUnequip(
  scenario: Scenario,
  state: PlaythroughState,
  slot: string,
): ApplyActionResult {
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
    journal: [
      {
        type: 'inventory',
        lang: scenario.language,
        action: 'unequipped',
        itemId: equippedId,
        name,
      },
    ],
  };
}

/**
 * Use item: a held Consumable below full Health heals (capped at 12) and
 * consumes one copy; the position is unchanged. At full Health the use is
 * rejected: nothing is consumed and `step` does not advance.
 */
function applyUseItem(
  scenario: Scenario,
  state: PlaythroughState,
  itemId: string,
): ApplyActionResult {
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
    journal: [
      {
        type: 'inventory',
        lang: scenario.language,
        action: 'used',
        itemId,
        name: item.name,
        healed: restored,
      },
    ],
  };
}
export type ExitView = {
  targetLocationId: string;
  label: string;
};

export function visibleExits(scenario: Scenario, state: PlaythroughState | PlaythroughV3): ExitView[] {
  return visibleConnections(scenario, state).map((connection) => ({
    targetLocationId: connection.to.id,
    label: connection.label,
  }));
}

/** One visible Choice per row: Choice text is literal (no Markdown). */
export type ChoiceView = {
  id: string;
  text: string;
  /**
   * The Test in structured form, if the Choice has one. The app renders the
   * label from these codes through the Interface Text catalogue, so the
   * Attribute and Difficulty names follow the Interface Language.
   */
  test?: {
    attribute: AttributeName;
    difficulty: Difficulty;
    target: number;
  };
};

/**
 * One Motion Layer as the UI renders it (docs/spec/ui.md, motion): the
 * declaration with defaults applied, the Layer file's asset URL under its own
 * hash and the file's pixel size. A sprite-strip Layer also carries `frames`
 * and `fps`, so the browser steps through one frame at a time. A flickering
 * Layer also carries `flicker`, so the browser varies its opacity along the
 * engine's fixed curve.
 */
export type IllustrationLayerView = {
  path: string;
  at: { x: number; y: number };
  anchor: { x: number; y: number };
  width: number;
  /** The sprite strip frame count; present exactly when `fps` is. */
  frames?: number;
  /** Frames per second; present exactly when `frames` is. */
  fps?: number;
  /** The Flicker depth, the deepest opacity dip in percent; present only when the Layer flickers. */
  flicker?: { depth: number };
  blend: 'normal' | 'multiply' | 'screen';
  /** Present only when the Layer drifts (docs/spec/ui.md, drift). */
  drift?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    duration: number;
    delay: number;
    loop: boolean;
  };
  /** The Layer file's asset URL, under the file's own hash. */
  src: string;
  pixelWidth: number;
  pixelHeight: number;
};

/**
 * An Illustration's Camera as the UI renders it (docs/spec/ui.md, motion):
 * the declaration with defaults applied. One transform moves the Still and
 * every Layer together, so the Layers stay aligned with the Still.
 */
export type IllustrationCameraView = {
  from: { zoom: number; x: number; y: number };
  to: { zoom: number; x: number; y: number };
  duration: number;
  delay: number;
  loop: boolean;
};

/**
 * A Scene or Location Illustration (docs/spec/ui.md, scene and location
 * illustration): the hashed asset route URL with the registry width, height
 * and catalog alt. When the image has Motion, every Layer with defaults
 * applied (its file's asset URL and pixel size), the Camera with defaults
 * applied, and the Showing key ride along; an image without Motion carries
 * none, so existing views compare unchanged.
 */
export type IllustrationView = {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Present only when the image has Motion. */
  layers?: IllustrationLayerView[];
  /** Present only when the image has a Camera. */
  camera?: IllustrationCameraView;
  /**
   * The Scene or Location the Illustration is shown with: `scene:<id>` while
   * a Scene is active, otherwise `location:<id>`. Present only with Motion
   * (Layers or a Camera); the UI keys the Illustration by it
   * (docs/spec/ui.md, timeline). Derived from the current position only.
   */
  showingKey?: string;
};

/**
 * The asset URL of a declared image: the Scenario asset route with the
 * registry image hash, so the immutable cache entry breaks when the bytes do.
 */
export function sceneIllustrationUrl(scenarioId: string, image: { hash: string; path: string }): string {
  return `/scenarios/${scenarioId}/assets/${image.hash}/${image.path}`;
}

/**
 * One compiled image entry as the `IllustrationView` the UI renders, or
 * undefined when the Scene or Location declares no Illustration
 * (docs/spec/ui.md, scene and location illustration): the hashed asset route
 * URL with the registry width, height and catalog alt. Every surface that
 * shows an Illustration — the Location view, the Scene view and the Scenario
 * intro modal over the starting Location — builds it through this helper, so
 * Motion Layers, the Camera and the Showing key (ADR 0007) land in one place.
 */
export function illustrationView(
  scenarioId: string,
  image: CompiledImageEntry | undefined,
  showingKey?: string,
): IllustrationView | undefined {
  if (image === undefined) {
    return undefined;
  }
  const still: IllustrationView = {
    src: sceneIllustrationUrl(scenarioId, image),
    width: image.width,
    height: image.height,
    alt: image.alt,
  };
  if (image.motion === undefined) {
    return still;
  }
  return {
    ...still,
    layers: image.motion.layers.map((layer) => ({
      path: layer.path,
      at: layer.at,
      anchor: layer.anchor,
      width: layer.width,
      ...(layer.frames === undefined ? {} : { frames: layer.frames }),
      ...(layer.fps === undefined ? {} : { fps: layer.fps }),
      ...(layer.flicker === undefined ? {} : { flicker: layer.flicker }),
      blend: layer.blend,
      ...(layer.drift === undefined ? {} : { drift: layer.drift }),
      src: sceneIllustrationUrl(scenarioId, layer.file),
      pixelWidth: layer.file.width,
      pixelHeight: layer.file.height,
    })),
    ...(image.motion.camera === undefined ? {} : { camera: image.motion.camera }),
    ...(showingKey === undefined ? {} : { showingKey }),
  };
}

/** Derived projection the UI renders: Location view, Scene or Ended. */
export type GameView =
  | {
      kind: 'location';
      locationId: string;
      name: string;
      description: string;
      /** Present only when the Location declares an Illustration. */
      illustration?: IllustrationView;
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
      /** Present only when the Scene declares an Illustration. */
      illustration?: IllustrationView;
      choices: ChoiceView[];
      map: MapView;
    }
  | {
      kind: 'ended';
      endingId: string;
      endingKind: 'victory' | 'defeat';
      title: string;
      text: string;
      map: MapView;
    }

/**
 * The current position: the Ending once ended, the active Scene with its
 * visible Choices (while a Scene is active there are no exits), otherwise
 * the Location view with its exits and on-demand Scenes on offer. Every
 * view carries the Location map derived from the stored `visited`/`revealed` sets.
 */
export function view(
  scenario: Scenario,
  state: PlaythroughState | PlaythroughV3,
  options: MapOptions = {},
): GameView {
  if (state.status === 'ended') {
    const endingId = state.endingId ?? scenario.deathEnding.id;
    const ending = scenario.endingsById[endingId] ?? scenario.deathEnding;
    return {
      kind: 'ended',
      endingId: ending.id,
      endingKind: ending.kind,
      title: ending.title,
      // Raw narration source; the UI renders it with the Character's name,
      // like Scene text. The Journal holds the substituted presentation text.
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
        illustration: illustrationView(scenario.id, scene.illustration, `scene:${scene.id}`),
        choices: visibleChoices(scenario, state, scene).map((choice) => ({
          id: choice.id,
          text: choice.text,
          test:
            choice.test === undefined
              ? undefined
              : {
                  attribute: choice.test.attribute,
                  difficulty: choice.test.difficulty,
                  target: DIFFICULTY_TARGETS[choice.test.difficulty],
                },
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
    illustration: illustrationView(scenario.id, location.illustration, `location:${location.id}`),
    exits: visibleExits(scenario, state),
    onDemandScenes: onDemandScenes(scenario, state),
    map: deriveMap(scenario, state, options),
  };
}
