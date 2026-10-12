// Pure game rules: startPlaythrough, applyAction, view.
//
// This module must stay free of Next.js, React and persistence imports
// (enforced by the no-restricted-imports rule in eslint.config.mjs).

import type { Scenario } from '../content/index';
import type {
  AttributeName,
  CompiledChoice,
  CompiledEffect,
  CompiledEncounter,
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

/**
 * Reason codes for unavailable inventory actions. The view returns these
 * codes and the app renders them from the catalogue, so the engine produces
 * no Interface Text (docs/spec/architecture.md, engine contract).
 */
export type InventoryReason = 'in-combat' | 'full-health';

/** Why Equip/Unequip is unavailable outside the Location/Scene position. */
export function inventoryEquipReason(state: PlaythroughState): InventoryReason | undefined {
  return state.activeCombat != null ? 'in-combat' : undefined;
}

/** Why Use item is unavailable: in Combat, or at full Health outside it. */
export function inventoryUseReason(state: PlaythroughState): InventoryReason | undefined {
  if (state.activeCombat != null) return 'in-combat';
  return state.character.health >= MAX_HEALTH ? 'full-health' : undefined;
}

/**
 * One side's roll inside a Combat round: both dice, the attacker's Might, the
 * total, the target and the Damage dealt (docs/spec/mechanics.md, hitting).
 */
export type CombatRoll = {
  side: 'character' | 'enemy';
  die1: number;
  die2: number;
  /** The attacker's Might (the effective value for the Character). */
  modifier: number;
  total: number;
  target: number;
  hit: boolean;
  /** Damage dealt by this roll: the attacker's Damage on a hit, else 0. */
  damage: number;
};

/** Character actions (docs/spec/mechanics.md, character actions). */
export type CombatAction = 'advance' | 'attack' | 'defend' | 'fall-back' | 'escape' | 'use-item';

export type CombatRange = 'near' | 'far';

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
  | {
      type: 'combat-start';
      lang: string;
      encounterId: string;
      text: string;
    }
  | {
      type: 'combat-round';
      lang: string;
      encounterId: string;
      /** The round this turn resolved: the Combat's round before it incremented. */
      round: number;
      action: CombatAction;
      rangeBefore: CombatRange;
      rangeAfter: CombatRange;
      /**
       * Whether the Character defended this turn. The "guard up" marker reads
       * this entry; the Defend bonus itself is never stored.
       */
      guard: boolean;
      /** The text as presented: actions, rolls, Damage and Range change. */
      text: string;
      rolls: CombatRoll[];
    }
  | {
      type: 'combat-end';
      lang: string;
      encounterId: string;
      text: string;
    }
  | {
      type: 'enemy-defeated';
      lang: string;
      encounterId: string;
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
 * on-demand Scene of the current Location. A Combat action names one of the
 * Character actions; a Combat `use-item` also names the Consumable.
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
      kind: 'combat';
      combatAction: CombatAction;
      /** The Consumable for a Combat `use-item`; ignored by other actions. */
      itemId?: string;
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
    case 'combat':
      return applyCombat(scenario, state, action.combatAction, rng, action.itemId);
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
      { type: 'travel', lang: scenario.language, to: target.id, name: target.name },
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
  // Resolve the Test first: the roll picks the Outcome. Endings, lethal
  // damage and `start-combat` are handled by applyOutcome.
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
 * transition (`next`, `move`, `end`, or none: back to the Location view
 * without re-evaluating on-enter Scenes).
 *
 * A `damage` Effect that brings Health to 0 or below sets Health to 0,
 * skips the remaining Effects and the transition, and ends the Playthrough
 * on the Scenario's death Ending. An `end` transition sets the status to
 * `ended(endingId)` and appends the Ending entry. Either way the position
 * becomes Ended: no active Scene or Combat.
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
        activeCombat: null,
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
      activeCombat: null,
    };
    journal.push(endingEntry(scenario, next, outcome.end));
    return { state: next, journal };
  }
  if (outcome.startCombat !== undefined) {
    const started = startCombat(scenario, next, outcome.startCombat.id);
    next = started.state;
    journal.push(...started.journal);
  } else if (outcome.next !== undefined) {
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

/**
 * `start-combat: E` (docs/spec/playthrough-state.md, Combat): on an already
 * defeated Encounter a no-op back to the Location view (no fight, no victory
 * Outcome). Otherwise create E's record (Damage taken) if absent, set the
 * position to Combat {E, `startRange`, round 1} and append the opening
 * narration. Re-entry after an escape starts again at `startRange` and shows
 * the opening narration again, keeping the Damage taken.
 */
function startCombat(
  scenario: Scenario,
  state: PlaythroughState,
  encounterId: string,
): { state: PlaythroughState; journal: NewJournalEntry[] } {
  const encounter = scenario.encountersById[encounterId];
  if (encounter === undefined) {
    return { state: { ...state, activeSceneId: null }, journal: [] };
  }
  if ((state.encounterDamage[encounterId] ?? 0) >= encounter.enemy.health) {
    return { state: { ...state, activeSceneId: null, activeCombat: null }, journal: [] };
  }
  const encounterDamage =
    encounterId in state.encounterDamage
      ? state.encounterDamage
      : { ...state.encounterDamage, [encounterId]: 0 };
  return {
    state: {
      ...state,
      activeSceneId: null,
      activeCombat: {
        encounterId: encounter.id,
        range: encounter.startRange,
        round: 1,
      },
      encounterDamage,
    },
    journal: [
      {
        type: 'combat-start',
        lang: scenario.language,
        encounterId: encounter.id,
        text: substituteName(encounter.text, state.character.name),
      },
    ],
  };
}

/**
 * The Character's attack Damage and Reach: the equipped weapon's, or 2 /
 * `melee` unarmed (docs/spec/mechanics.md, Items).
 */
function characterAttack(
  scenario: Scenario,
  state: PlaythroughState,
): { damage: number; reach: 'melee' | 'ranged'; weaponName: string | undefined } {
  const weaponId = state.equipment.weapon;
  const item = weaponId === undefined ? undefined : scenario.itemsById[weaponId];
  if (item !== undefined && item.kind === 'equipment' && item.slot === 'weapon') {
    return { damage: item.damage ?? 2, reach: item.reach, weaponName: item.name };
  }
  return { damage: 2, reach: 'melee', weaponName: undefined };
}

export type CombatAvailability = {
  id: CombatAction;
  group: 'Position' | 'Fight' | 'Items' | 'Leave';
  label: string;
  enabled: boolean;
  reason?: string;
  /** The Consumable a `use-item` entry uses; absent on every other action. */
  itemId?: string;
};

/** Why an Attack is unavailable at the current Range. */
function attackReason(weaponName: string | undefined): string {
  if (weaponName === undefined) {
    return 'Unarmed attacks need Near Range.';
  }
  return `Your ${weaponName.toLowerCase()} needs Near Range.`;
}

/**
 * Whether each Character action is available in the current Combat
 * (docs/spec/mechanics.md, character actions): Advance at Far, Fall back at
 * Near, Attack when the Character's Reach allows it at the current Range,
 * Defend and Escape always, and one Use entry per held Consumable while below
 * full Health. The UI disables unavailable actions with the reason; the engine
 * rejects them independently.
 */
export function combatActions(
  scenario: Scenario,
  state: PlaythroughState,
): CombatAvailability[] {
  const combat = state.activeCombat;
  if (combat == null) {
    return [];
  }
  const attack = characterAttack(scenario, state);
  const inReach = attack.reach === 'ranged' || combat.range === 'near';
  const belowFull = state.character.health < MAX_HEALTH;
  const consumables = Object.keys(state.inventory).filter(
    (itemId) => scenario.itemsById[itemId]?.kind === 'consumable',
  );
  return [
    {
      id: 'advance',
      group: 'Position',
      label: 'Advance',
      enabled: combat.range === 'far',
      reason: combat.range === 'far' ? undefined : 'Already at Near Range.',
    },
    {
      id: 'fall-back',
      group: 'Position',
      label: 'Fall back',
      enabled: combat.range === 'near',
      reason: combat.range === 'near' ? undefined : 'Already at Far Range.',
    },
    {
      id: 'attack',
      group: 'Fight',
      label:
        attack.weaponName === undefined ? 'Attack' : `Attack with ${attack.weaponName}`,
      enabled: inReach,
      reason: inReach ? undefined : attackReason(attack.weaponName),
    },
    { id: 'defend', group: 'Fight', label: 'Defend', enabled: true },
    ...consumables.map((itemId): CombatAvailability => {
      const name = scenario.itemsById[itemId]?.name ?? itemId;
      return {
        id: 'use-item',
        group: 'Items',
        label: `Use ${name}`,
        enabled: belowFull,
        reason: belowFull ? undefined : 'Already at full Health.',
        itemId,
      };
    }),
    { id: 'escape', group: 'Leave', label: 'Escape', enabled: true },
  ];
}

/** One roll as presented: dice, modifier, total and target. */
function combatRollText(roll: CombatRoll): string {
  return `${roll.die1}+${roll.die2}+${roll.modifier}=${roll.total} vs ${roll.target}`;
}

/**
 * Victory (Damage taken ≥ the Enemy's maximum Health, including from a
 * counterattack): the Combat ends, a Combat end entry is appended, then the
 * `victory` Outcome is applied — or, without one, the Enemy-defeated notice,
 * back in the Location view of the fight.
 */
function finishVictory(
  scenario: Scenario,
  state: PlaythroughState,
  encounter: CompiledEncounter,
  round: Extract<NewJournalEntry, { type: 'combat-round' }>,
  health: number,
  encounterDamage: PlaythroughState['encounterDamage'],
  inventory: PlaythroughState['inventory'] = state.inventory,
  equipment: PlaythroughState['equipment'] = state.equipment,
): ApplyActionResult {
  const end: NewJournalEntry = {
    type: 'combat-end',
    lang: scenario.language,
    encounterId: encounter.id,
    text: `${encounter.enemy.name} is defeated.`,
  };
  let next: PlaythroughState = {
    ...state,
    step: state.step + 1,
    character: { ...state.character, health },
    encounterDamage,
    inventory,
    equipment,
    activeSceneId: null,
    activeCombat: null,
  };
  const journal: NewJournalEntry[] = [round, end];
  if (encounter.victory !== undefined) {
    const applied = applyOutcome(scenario, next, encounter.victory);
    next = applied.state;
    journal.push(...applied.journal);
  } else {
    journal.push({
      type: 'enemy-defeated',
      lang: scenario.language,
      encounterId: encounter.id,
      text: `The ${encounter.enemy.name} is defeated.`,
    });
  }
  return { ok: true, state: next, journal };
}

/**
 * Escape (Damage taken < the Enemy's maximum Health, so the Combat was still
 * running): the Combat ends with no Enemy response, the Range is discarded,
 * the Encounter record keeps its Damage taken, and the `escape` Outcome is
 * applied. The Combat end entry joins the result panel with the Outcome.
 */
function finishEscape(
  scenario: Scenario,
  state: PlaythroughState,
  encounter: CompiledEncounter,
  round: Extract<NewJournalEntry, { type: 'combat-round' }>,
  health: number,
  encounterDamage: PlaythroughState['encounterDamage'],
  inventory: PlaythroughState['inventory'],
  equipment: PlaythroughState['equipment'],
): ApplyActionResult {
  const end: NewJournalEntry = {
    type: 'combat-end',
    lang: scenario.language,
    encounterId: encounter.id,
    text: `You escape from ${encounter.enemy.name}.`,
  };
  // The Range is discarded by clearing the active Combat before the Outcome:
  // `move` and `end` clear it again, and `next` keeps the cleared position.
  // (An escape Outcome that starts another Combat replaces it deliberately.)
  const next: PlaythroughState = {
    ...state,
    step: state.step + 1,
    character: { ...state.character, health },
    encounterDamage,
    inventory,
    equipment,
    activeSceneId: null,
    activeCombat: null,
  };
  const journal: NewJournalEntry[] = [round, end];
  const applied = applyOutcome(scenario, next, encounter.escape);
  return { ok: true, state: applied.state, journal: [...journal, ...applied.journal] };
}

/**
 * One Combat turn (docs/spec/mechanics.md, Combat;
 * docs/spec/playthrough-state.md, Combat): the Character acts first, then —
 * if the Combat is still running — the Enemy responds. One turn is one action
 * and one `step`, increments the round and appends one Combat round entry
 * (actions, rolls, Damage, Range change). Death ends the Playthrough on the
 * death Ending.
 */
function applyCombat(
  scenario: Scenario,
  state: PlaythroughState,
  combatAction: CombatAction,
  rng: Rng,
  itemId?: string,
): ApplyActionResult {
  const combat = state.activeCombat;
  if (combat == null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const encounter = scenario.encountersById[combat.encounterId];
  if (encounter === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  const enemy = encounter.enemy;
  const attack = characterAttack(scenario, state);
  // The action must be available (see combatActions): Advance only at Far,
  // Fall back only at Near, Attack only when the Character's Reach allows the
  // current Range, a Combat use-item only for a held Consumable below full
  // Health. Escape is always available.
  if (combatAction === 'advance' && combat.range !== 'far') {
    return { ok: false, reason: 'illegal-action' };
  }
  if (combatAction === 'fall-back' && combat.range !== 'near') {
    return { ok: false, reason: 'illegal-action' };
  }
  if (combatAction === 'attack' && attack.reach === 'melee' && combat.range === 'far') {
    return { ok: false, reason: 'illegal-action' };
  }
  if (combatAction === 'use-item') {
    const item = itemId === undefined ? undefined : scenario.itemsById[itemId];
    if (item === undefined || item.kind !== 'consumable') {
      return { ok: false, reason: 'illegal-action' };
    }
    if ((state.inventory[itemId as string] ?? 0) < 1) {
      return { ok: false, reason: 'illegal-action' };
    }
    if (state.character.health >= MAX_HEALTH) {
      return { ok: false, reason: 'illegal-action' };
    }
  }

  const effective = effectiveAttributes(scenario, state);
  const rangeBefore = combat.range;
  const defending = combatAction === 'defend';
  let range = combat.range;
  let health = state.character.health;
  let encounterDamage = state.encounterDamage;
  let inventory = state.inventory;
  let equipment = state.equipment;
  const damageSoFar = (): number => encounterDamage[combat.encounterId] ?? 0;
  const rolls: CombatRoll[] = [];
  const parts: string[] = [];

  const strike = (
    side: 'character' | 'enemy',
    might: number,
    agility: number,
    extra: number,
    damage: number,
  ): CombatRoll => {
    const die1 = rng(1, 7);
    const die2 = rng(1, 7);
    const total = die1 + die2 + might;
    const target = 7 + agility + extra;
    const hit = total >= target;
    return { side, die1, die2, modifier: might, total, target, hit, damage: hit ? damage : 0 };
  };

  /** An Agility manoeuvre roll: Fall back, or Escape with +2 at Far. */
  const manoeuvre = (bonus: number): CombatRoll => {
    const die1 = rng(1, 7);
    const die2 = rng(1, 7);
    const modifier = effective.agility + bonus;
    const total = die1 + die2 + modifier;
    const target = 7 + enemy.attributes.agility;
    const hit = total >= target;
    return { side: 'character', die1, die2, modifier, total, target, hit, damage: 0 };
  };

  if (combatAction === 'advance') {
    range = 'near';
    parts.push('You advance to Near Range.');
  } else if (combatAction === 'fall-back') {
    const roll = manoeuvre(0);
    rolls.push(roll);
    if (roll.hit) {
      range = 'far';
      parts.push(`You fall back (${combatRollText(roll)}): success, now at Far Range.`);
    } else {
      parts.push(
        `You try to fall back (${combatRollText(roll)}): failure, staying at Near Range.`,
      );
    }
  } else if (combatAction === 'escape') {
    const bonus = combat.range === 'far' ? 2 : 0;
    const roll = manoeuvre(bonus);
    rolls.push(roll);
    if (roll.hit) {
      parts.push(`You escape (${combatRollText(roll)}): success.`);
      const round = (
        rangeAfter: CombatRange,
      ): Extract<NewJournalEntry, { type: 'combat-round' }> => ({
        type: 'combat-round',
        lang: scenario.language,
        encounterId: encounter.id,
        round: combat.round,
        action: combatAction,
        rangeBefore,
        rangeAfter,
        guard: defending,
        text: parts.join(' '),
        rolls,
      });
      return finishEscape(
        scenario,
        state,
        encounter,
        round(range),
        health,
        encounterDamage,
        inventory,
        equipment,
      );
    }
    parts.push(`You try to escape (${combatRollText(roll)}): failure.`);
  } else if (combatAction === 'use-item') {
    const heldId = itemId as string;
    const item = scenario.itemsById[heldId];
    const heal = item !== undefined && item.kind === 'consumable' ? item.heal : 0;
    const restored = Math.min(MAX_HEALTH, health + heal) - health;
    const taken = removeFromInventory(state, heldId, 1);
    inventory = taken.inventory;
    equipment = taken.equipment;
    health += restored;
    const name = item?.name ?? heldId;
    parts.push(`You use ${name}, restored ${restored} Health.`);
  } else if (combatAction === 'attack') {
    const roll = strike(
      'character',
      effective.might,
      enemy.attributes.agility,
      0,
      attack.damage,
    );
    rolls.push(roll);
    const weapon =
      attack.weaponName === undefined
        ? 'unarmed'
        : `your ${attack.weaponName.toLowerCase()}`;
    parts.push(
      roll.hit
        ? `You attack ${weapon} (${combatRollText(roll)}): hit, ${roll.damage} Damage.`
        : `You attack ${weapon} (${combatRollText(roll)}): miss.`,
    );
    if (roll.hit) {
      encounterDamage = { ...encounterDamage, [combat.encounterId]: damageSoFar() + roll.damage };
    }
  } else {
    parts.push('You raise your guard.');
  }

  const roundEntry = (
    rangeAfter: CombatRange,
  ): Extract<NewJournalEntry, { type: 'combat-round' }> => ({
    type: 'combat-round',
    lang: scenario.language,
    encounterId: encounter.id,
    round: combat.round,
    action: combatAction,
    rangeBefore,
    rangeAfter,
    guard: defending,
    text: parts.join(' '),
    rolls,
  });

  // Victory from the Character's action: the Enemy does not respond.
  if (damageSoFar() >= enemy.health) {
    return finishVictory(
      scenario,
      state,
      encounter,
      roundEntry(range),
      health,
      encounterDamage,
      inventory,
      equipment,
    );
  }

  // The Enemy's response: a melee Enemy at Far closes to Near without
  // attacking; otherwise it attacks (a ranged Enemy never moves).
  if (enemy.reach === 'melee' && range === 'far') {
    range = 'near';
    parts.push(`${enemy.name} closes in to Near Range instead of attacking.`);
    // The Defend bonus expires at the end of this Enemy turn, even though it
    // only moved; the round entry still records the guard that was up.
  } else {
    const roll = strike(
      'enemy',
      enemy.attributes.might,
      effective.agility,
      defending ? 2 : 0,
      enemy.damage,
    );
    rolls.push(roll);
    if (roll.hit) {
      health -= roll.damage;
      parts.push(
        `${enemy.name} attacks (${combatRollText(roll)}): hit, ${roll.damage} Damage.`,
      );
    } else {
      parts.push(
        defending
          ? `${enemy.name} attacks (${combatRollText(roll)}): miss; your counterattack deals 1 Damage.`
          : `${enemy.name} attacks (${combatRollText(roll)}): miss.`,
      );
      if (defending) {
        encounterDamage = { ...encounterDamage, [combat.encounterId]: damageSoFar() + 1 };
      }
    }
  }

  // Victory from a counterattack: no further Enemy response.
  if (damageSoFar() >= enemy.health) {
    return finishVictory(
      scenario,
      state,
      encounter,
      roundEntry(range),
      health,
      encounterDamage,
      inventory,
      equipment,
    );
  }

  // Death: the Character's Health reaches 0.
  if (health <= 0) {
    const ended: PlaythroughState = {
      ...state,
      step: state.step + 1,
      character: { ...state.character, health: 0 },
      encounterDamage,
      inventory,
      equipment,
      status: 'ended',
      endingId: scenario.deathEnding.id,
      activeSceneId: null,
      activeCombat: null,
    };
    return {
      ok: true,
      state: ended,
      journal: [roundEntry(range), endingEntry(scenario, ended, scenario.deathEnding)],
    };
  }

  const next: PlaythroughState = {
    ...state,
    step: state.step + 1,
    character: { ...state.character, health },
    encounterDamage,
    inventory,
    equipment,
    activeCombat: { encounterId: combat.encounterId, range, round: combat.round + 1 },
  };
  return { ok: true, state: next, journal: [roundEntry(range)] };
}

/**
 * Journal rows the Combat panel reads (stored rows or new entries mapped to
 * `{ type, payload }`). The guard marker and the roll log derive from the
 * Journal, never from stored state: the Defend bonus expires within its turn.
 */
export type CombatJournalRow = {
  type: string;
  payload: {
    encounterId?: unknown;
    guard?: unknown;
  };
};

/**
 * Guard up when the latest round of this Encounter was a Defend. Walking back
 * stops at the Encounter's latest opening narration, so an earlier Combat
 * cannot leak its guard in. The marker survives a reload because the Journal
 * is the store.
 */
export function combatGuardUp(
  entries: ReadonlyArray<CombatJournalRow>,
  encounterId: string,
): boolean {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined || entry.payload.encounterId !== encounterId) {
      continue;
    }
    if (entry.type === 'combat-round') {
      return entry.payload.guard === true;
    }
    if (entry.type === 'combat-start') {
      return false;
    }
  }
  return false;
}

export type CombatRoundView = {
  round: number;
  action: CombatAction;
  rangeBefore: CombatRange;
  rangeAfter: CombatRange;
  guard: boolean;
  text: string;
  rolls: CombatRoll[];
};

/**
 * The rounds of the current Combat: the Combat round entries since the latest
 * opening narration of the Encounter.
 */
export function combatRounds(
  entries: ReadonlyArray<CombatJournalRow>,
  encounterId: string,
): CombatRoundView[] {
  const rounds: CombatRoundView[] = [];
  for (const entry of entries) {
    if (entry.payload.encounterId !== encounterId) {
      continue;
    }
    if (entry.type === 'combat-start') {
      rounds.length = 0;
    } else if (entry.type === 'combat-round') {
      const payload = entry.payload as {
        round?: unknown;
        action?: unknown;
        rangeBefore?: unknown;
        rangeAfter?: unknown;
        guard?: unknown;
        text?: unknown;
        rolls?: unknown;
      };
      rounds.push({
        round: typeof payload.round === 'number' ? payload.round : rounds.length + 1,
        action:
          payload.action === 'advance' ||
          payload.action === 'defend' ||
          payload.action === 'fall-back' ||
          payload.action === 'escape' ||
          payload.action === 'use-item'
            ? payload.action
            : 'attack',
        rangeBefore: payload.rangeBefore === 'near' ? 'near' : 'far',
        rangeAfter: payload.rangeAfter === 'near' ? 'near' : 'far',
        guard: payload.guard === true,
        text: typeof payload.text === 'string' ? payload.text : '',
        rolls: Array.isArray(payload.rolls) ? (payload.rolls as CombatRoll[]) : [],
      });
    }
  }
  return rounds;
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
 * The active Scene's Illustration (docs/spec/ui.md, scene illustration): the
 * hashed asset route URL with the registry width, height and catalog alt.
 */
export type IllustrationView = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

/**
 * The asset URL of a declared image: the Scenario asset route with the
 * registry image hash, so the immutable cache entry breaks when the bytes do.
 */
export function sceneIllustrationUrl(scenarioId: string, image: { hash: string; path: string }): string {
  return `/scenarios/${scenarioId}/assets/${image.hash}/${image.path}`;
}

/** Derived projection the UI renders: Location view, Scene, Combat or Ended. */
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
  | {
      kind: 'combat';
      locationId: string;
      locationName: string;
      encounterId: string;
      encounterName: string;
      /** Raw opening narration; the UI renders it with the Character's name. */
      text: string;
      characterName: string;
      range: CombatRange;
      round: number;
      character: {
        health: number;
        maxHealth: number;
        weaponName: string;
        reach: 'melee' | 'ranged';
        damage: number;
      };
      enemy: {
        name: string;
        health: number;
        maxHealth: number;
        damage: number;
        reach: 'melee' | 'ranged';
      };
      actions: CombatAvailability[];
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
      endingKind: ending.kind,
      title: ending.title,
      // Raw narration source; the UI renders it with the Character's name,
      // like Scene text. The Journal holds the substituted presentation text.
      text: ending.text,
      map: deriveMap(scenario, state, options),
    };
  }
  if (state.activeCombat != null) {
    const combat = state.activeCombat;
    const encounter = scenario.encountersById[combat.encounterId];
    if (encounter !== undefined) {
      const location =
        scenario.locationsById[state.currentLocationId] ?? scenario.startLocation;
      const attack = characterAttack(scenario, state);
      const taken = state.encounterDamage[combat.encounterId] ?? 0;
      return {
        kind: 'combat',
        locationId: location.id,
        locationName: location.name,
        encounterId: encounter.id,
        encounterName: encounter.enemy.name,
        text: encounter.text,
        characterName: state.character.name,
        range: combat.range,
        round: combat.round,
        character: {
          health: state.character.health,
          maxHealth: MAX_HEALTH,
          weaponName: attack.weaponName ?? 'Bare hands',
          reach: attack.reach,
          damage: attack.damage,
        },
        enemy: {
          name: encounter.enemy.name,
          health: Math.max(0, encounter.enemy.health - taken),
          maxHealth: encounter.enemy.health,
          damage: encounter.enemy.damage,
          reach: encounter.enemy.reach,
        },
        actions: combatActions(scenario, state),
        map: deriveMap(scenario, state, options),
      };
    }
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
        illustration:
          scene.illustration === undefined
            ? undefined
            : {
                src: sceneIllustrationUrl(scenario.id, scene.illustration),
                width: scene.illustration.width,
                height: scene.illustration.height,
                alt: scene.illustration.alt,
              },
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
    illustration:
      location.illustration === undefined
        ? undefined
        : {
            src: sceneIllustrationUrl(scenario.id, location.illustration),
            width: location.illustration.width,
            height: location.illustration.height,
            alt: location.illustration.alt,
          },
    exits: visibleExits(scenario, state),
    onDemandScenes: onDemandScenes(scenario, state),
    map: deriveMap(scenario, state, options),
  };
}
