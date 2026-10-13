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
  CompiledParticipant,
  CompiledScene,
} from '../content/model';
import { effectiveAttributes, evaluateCondition } from './conditions';
import { isEquipmentSlot, removeFromInventory, type EquipmentSlot } from './inventory';
import { substituteName } from './narration';
import { deriveMap, type MapOptions, type MapView } from './map';
import { MAX_HEALTH, STATE_VERSION, type PlaythroughState } from './state';
import {
  CHARACTER_ACTION_SPEED,
  INTENT_SPEED,
  intentInReach,
  orderActions,
  selectIntents,
  type QueuedAction,
  type Speed,
} from './tactical';
import type { IntentKind } from './state';

export type { PlaythroughState } from './state';
export {
  MAX_HEALTH,
  PlaythroughStateSchema,
  STATE_VERSION,
  parsePlaythroughState,
} from './state';
export { effectiveAttributes, evaluateCondition } from './conditions';
export { escapeHtml, renderNarration, renderStoredText, substituteName } from './narration';
// Intent selection, Speed and the Round order live in `tactical.ts` so the
// v1 migration (issue #124) reuses the same rules with the Prepare draw
// disabled, instead of a second Behaviour engine.
export {
  CHARACTER_ACTION_SPEED,
  INTENT_SPEED,
  orderActions,
  selectIntents,
  type QueuedAction,
  type SelectIntentsOptions,
  type SelectIntentsResult,
  type SelectionParticipant,
  type Speed,
} from './tactical';
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
 * One side's roll inside a Combat round: both dice, the attacker's modifier,
 * the total, the target and the Damage dealt (docs/spec/mechanics.md, hitting).
 * Attacks roll Might; a Distract rolls Wits.
 */
export type CombatRoll = {
  side: 'character' | 'enemy';
  die1: number;
  die2: number;
  /** The attacker's Might (the effective value for the Character), or Wits on a Distract. */
  modifier: number;
  total: number;
  target: number;
  hit: boolean;
  /** Damage dealt by this roll: the attacker's Damage on a hit, else 0. */
  damage: number;
};

/** Character actions (docs/spec/mechanics.md, character actions). */
export type CombatAction =
  | 'advance'
  | 'attack'
  | 'defend'
  | 'distract'
  | 'fall-back'
  | 'escape'
  | 'use-item';

export type CombatRange = 'near' | 'far';

/**
 * One participant as presented in a tactical Combat event
 * (docs/spec/playthrough-state.md, Combat events): the participant id, its
 * Enemy id, the Enemy name as presented and an ordinal — the 1-based position
 * among the participants of the same Enemy kind in its Encounter, or none
 * when the kind is unique there. The ordinal tells two grey wolves apart
 * without authored names; wording is presentation.
 */
export type CombatParticipantRef = {
  participantId: string;
  enemyId: string;
  /** The Enemy name as presented. */
  name: string;
  /** 1-based position among same-kind participants; absent when unique. */
  ordinal?: number;
};

/** The actor of one action inside a Combat round: the Character or a participant. */
export type TacticalActor = { kind: 'character' } | ({ kind: 'participant' } & CombatParticipantRef);

/** How one queued action came out of the resolution order. */
export type TacticalActionStatus = 'executed' | 'cancelled' | 'dropped' | 'not-reached';

/** Why an announced action was cancelled at its place in the order. */
export type TacticalCancelReason =
  | 'interrupted'
  | 'target-defeated'
  | 'out-of-reach'
  | 'already-near'
  | 'none-near';

/**
 * One action of a Combat round, in resolution order: its actor (the Character
 * or a participant reference), its action or Intent kind and its Speed, its
 * target for a targeted Character action (Intents always target the
 * Character), its status, and — for an executed action — what it did: the
 * roll (both dice, modifier, total, target, success), the Damage dealt and to
 * whom, Range changes, the prepared state it left and the participants it
 * defeated. Display text is never stored here, only names as presented.
 */
export type TacticalActionEvent = {
  actor: TacticalActor;
  /** The Character's action id, or the participant's Intent kind. */
  kind: CombatAction | IntentKind;
  speed: Speed;
  /** The 1-based place in the Round's resolution order. */
  order: number;
  target?: TacticalActor;
  status: TacticalActionStatus;
  cancelReason?: TacticalCancelReason;
  /** The roll, when the executed action rolls (an attack). */
  roll?: CombatRoll;
  /** Damage dealt by the executed action. */
  damage?: number;
  /** A Guarded Character (from Defend): the effect this executed action applied. */
  guarded?: boolean;
  /** A distracted participant's Wary: its last round, set by a successful Distract. */
  waryUntilRound?: number;
  /**
   * The counterattack reaction inside the missed melee attack it answers
   * (docs/spec/mechanics.md, temporary effects): its roll, its Damage and any
   * defeat. A reaction triggers no further reaction.
   */
  counter?: {
    roll: CombatRoll;
    damage: number;
    defeatedParticipants?: string[];
  };
  rangeBefore?: CombatRange;
  rangeAfter?: CombatRange;
  /**
   * The participant's prepared state after this action: Prepare leaves it,
   * and the Heavy attack it prepares clears it when it resolves or is
   * cancelled for any reason.
   */
  prepared?: boolean;
  /** Participant ids this action defeated. */
  defeatedParticipants?: string[];
  /** This action killed the Character. */
  characterDefeated?: boolean;
  /** The Character's weapon name as presented; on Attack when armed. */
  weaponName?: string;
  /** A Combat `use-item`: the Consumable id. */
  itemId?: string;
  /** A Combat `use-item`: the Consumable name as presented. */
  itemName?: string;
  /** A Combat `use-item`: the Health restored at execution. */
  healed?: number;
};

/**
 * How the Round's sequence stopped, if it did: the last participant's defeat
 * (victory), the Character's death, or a successful Escape. Remaining actions
 * do not resolve. A partially defeated Round carries no stop.
 */
export type CombatStopReason = 'victory' | 'death' | 'escape';

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
      /** The participants taking part, in participant order, as presented. */
      participants: CombatParticipantRef[];
      /** The opening narration as presented (Scenario text). */
      text: string;
    }
  | {
      type: 'combat-round';
      lang: string;
      encounterId: string;
      /** The round this turn resolved: the Combat's round before it incremented. */
      round: number;
      /** Tactical payload version: every stored row without it is legacy v1. */
      version: 2;
      /** Every action of the Round, in resolution order. */
      actions: TacticalActionEvent[];
      /** How the sequence stopped, if it did; absent on a continuing Round. */
      stop?: CombatStopReason;
    }
  | {
      type: 'combat-end';
      lang: string;
      encounterId: string;
      /** Every participant of the Encounter, in participant order, as presented. */
      participants: CombatParticipantRef[];
      howEnded: 'victory' | 'escape';
    }
  | {
      type: 'enemy-defeated';
      lang: string;
      encounterId: string;
      /** Every participant of the Encounter, in participant order, as presented. */
      participants: CombatParticipantRef[];
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
      /**
       * The target participant id for a targeted Combat action (attack,
       * distract, advance). With one surviving participant it may be omitted
       * and is then that participant; with two it is required. A missing,
       * unknown or defeated target, or a target on an action that takes none,
       * is rejected (docs/spec/playthrough-state.md, actions).
       */
      targetParticipantId?: string;
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
      return applyCombat(
        scenario,
        state,
        action.combatAction,
        rng,
        action.itemId,
        action.targetParticipantId,
      );
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
    const applied = applyOutcome(scenario, next, outcome, rng);
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
  rng: Rng,
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
    const started = startCombat(scenario, next, outcome.startCombat.id, rng);
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
 * Whether every participant of an Encounter is defeated: each participant's
 * recorded Damage taken reaches its Enemy's current maximum Health
 * (docs/spec/content-semantics.md, conditions; docs/spec/mechanics.md,
 * persistence of wounds). A participant without an entry (one added to the
 * content later) is at full Health.
 */
function encounterDefeated(
  encounter: CompiledEncounter,
  wounds: Record<string, number>,
): boolean {
  return encounter.participants.every(
    (participant) => (wounds[participant.id] ?? 0) >= participant.enemy.health,
  );
}

/** Surviving participants in encounter (participant) order. */
function survivorsOf(
  encounter: CompiledEncounter,
  wounds: Record<string, number>,
): CompiledParticipant[] {
  return encounter.participants.filter(
    (participant) => (wounds[participant.id] ?? 0) < participant.enemy.health,
  );
}

/**
 * One participant as presented in a tactical Combat event: its participant
 * id, Enemy id and Enemy name as presented, with the same-kind ordinal the
 * Journal contract describes.
 */
function participantRefOf(
  encounter: CompiledEncounter,
  participant: CompiledParticipant,
): CombatParticipantRef {
  const sameKind = encounter.participants.filter(
    (candidate) => candidate.enemy.id === participant.enemy.id,
  );
  if (sameKind.length <= 1) {
    return {
      participantId: participant.id,
      enemyId: participant.enemy.id,
      name: participant.enemy.name,
    };
  }
  return {
    participantId: participant.id,
    enemyId: participant.enemy.id,
    name: participant.enemy.name,
    ordinal: sameKind.findIndex((candidate) => candidate.id === participant.id) + 1,
  };
}

/** Every participant of the Encounter in order, as presented, for end entries. */
function allParticipantRefs(encounter: CompiledEncounter): CombatParticipantRef[] {
  return encounter.participants.map((participant) => participantRefOf(encounter, participant));
}

/**
 * `start-combat: E` (docs/spec/playthrough-state.md, Combat): on an already
 * defeated Encounter a no-op back to the Location view (no Combat, no victory
 * Outcome). Otherwise create E's record (Damage taken per participant, 0 for
 * each participant without one) if absent, set the position to Combat with
 * each surviving participant at E's `startRange`, round 1, this Combat's
 * starting membership and Round tie-break order, select and store the first
 * Round's Intents, and append the opening narration. Re-entry after an escape
 * starts again at `startRange` with freshly selected Intents and no prepared
 * states or temporary effects, shows the opening narration again, and keeps
 * the Damage taken; its starting membership contains only the survivors.
 * Nothing resolves and no die is drawn beyond what Intent selection needs.
 */
function startCombat(
  scenario: Scenario,
  state: PlaythroughState,
  encounterId: string,
  rng: Rng,
): { state: PlaythroughState; journal: NewJournalEntry[] } {
  const encounter = scenario.encountersById[encounterId];
  if (encounter === undefined) {
    return { state: { ...state, activeSceneId: null }, journal: [] };
  }
  const wounds: Record<string, number> = { ...(state.encounters[encounterId] ?? {}) };
  for (const participant of encounter.participants) {
    if (!(participant.id in wounds)) {
      wounds[participant.id] = 0;
    }
  }
  if (encounterDefeated(encounter, wounds)) {
    return { state: { ...state, activeSceneId: null, activeCombat: null }, journal: [] };
  }
  const survivors = survivorsOf(encounter, wounds);
  const order = survivors.map((participant) => participant.id);
  const selection = selectIntents(
    survivors.map((participant) => ({
      participant,
      range: encounter.startRange,
      prepared: false,
    })),
    rng,
  );
  const participants: Record<
    string,
    { range: 'near' | 'far'; intent: IntentKind; prepared: boolean }
  > = {};
  for (const survivor of survivors) {
    participants[survivor.id] = {
      range: encounter.startRange,
      intent: selection.intents[survivor.id] ?? 'strike',
      prepared: selection.prepared[survivor.id] ?? false,
    };
  }
  return {
    state: {
      ...state,
      activeSceneId: null,
      activeCombat: {
        encounterId: encounter.id,
        round: 1,
        startedParticipants: order,
        roundParticipantOrder: order,
        participants,
      },
      encounters: { ...state.encounters, [encounterId]: wounds },
    },
    journal: [
      {
        type: 'combat-start',
        lang: scenario.language,
        encounterId: encounter.id,
        participants: survivors.map((participant) => participantRefOf(encounter, participant)),
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
): {
  damage: number;
  reach: 'melee' | 'ranged';
  weaponId: string | undefined;
  weaponName: string | undefined;
} {
  const weaponId = state.equipment.weapon;
  const item = weaponId === undefined ? undefined : scenario.itemsById[weaponId];
  if (item !== undefined && item.kind === 'equipment' && item.slot === 'weapon') {
    return { damage: item.damage ?? 2, reach: item.reach, weaponId: item.id, weaponName: item.name };
  }
  return { damage: 2, reach: 'melee', weaponId: undefined, weaponName: undefined };
}

/** Action groups as codes; the catalogue renders them (docs/spec/ui.md, actions). */
export type CombatActionGroup = 'position' | 'fight' | 'items' | 'leave';

/**
 * Why an action is unavailable, as a code; the catalogue renders the reason in
 * the Interface Language.
 */
export type CombatDisabledReason =
  | 'already-near'
  | 'already-far'
  | 'needs-near'
  | 'full-health'
  | 'wary';

export type CombatAvailability = {
  id: CombatAction;
  group: CombatActionGroup;
  enabled: boolean;
  reason?: CombatDisabledReason;
  /** The Consumable a `use-item` entry uses; absent on every other action. */
  itemId?: string;
  /** The Consumable's name as presented; present only on `use-item`. */
  itemName?: string;
  /** The equipped weapon's id; absent from Attack when unarmed. */
  weaponId?: string;
  /** The equipped weapon's name as presented; absent from Attack when unarmed. */
  weaponName?: string;
};

/**
 * Whether each Character action is available in the current Combat: Advance
 * while a surviving participant is Far, Fall back while one is Near, Attack
 * when the Character's Reach allows the Range to a surviving participant,
 * Defend and Escape always, Distract while a surviving participant is neither
 * Wary nor already past in the Round's order, and one Use entry per held
 * Consumable while below full Health. Entries carry codes and names as
 * presented; the UI renders labels and reasons through the catalogue. The
 * engine rejects unavailable actions independently.
 *
 * Attack, Defend and Distract resolve (issues #120, #122); movement, Escape
 * and Consumables report their standing availability here, but submitting one
 * is rejected until its package lands (issue #121). The full per-target
 * projection (Speed, order, thresholds) arrives with the arena view
 * (issue #123).
 */
export function combatActions(
  scenario: Scenario,
  state: PlaythroughState,
): CombatAvailability[] {
  const combat = state.activeCombat;
  if (combat == null) {
    return [];
  }
  const encounter = scenario.encountersById[combat.encounterId];
  const wounds = state.encounters[combat.encounterId] ?? {};
  const survivors =
    encounter === undefined ? [] : survivorsOf(encounter, wounds);
  const ranges = survivors.map(
    (participant) => combat.participants[participant.id]?.range ?? 'far',
  );
  const attack = characterAttack(scenario, state);
  const inReach =
    attack.reach === 'ranged' || ranges.some((range) => range === 'near');
  const belowFull = state.character.health < MAX_HEALTH;
  const consumables = Object.keys(state.inventory).filter(
    (itemId) => scenario.itemsById[itemId]?.kind === 'consumable',
  );
  const anyFar = ranges.some((range) => range === 'far');
  const anyNear = ranges.some((range) => range === 'near');
  // Distract is available while a surviving participant is neither Wary nor
  // already past in the Round's order. Distract is fast, so it precedes every
  // Intent; the order check is defensive, and Wary is the bar that disables
  // the entry in practice.
  const effectiveAgility = effectiveAttributes(scenario, state).agility;
  const distractOrder = orderActions(
    [
      { key: 'character', actor: 'character', speed: 'fast', agility: effectiveAgility },
      ...survivors.map(
        (participant): QueuedAction => ({
          key: participant.id,
          actor: 'participant',
          participantId: participant.id,
          speed: INTENT_SPEED[combat.participants[participant.id]?.intent ?? 'strike'],
          agility: participant.enemy.attributes.agility,
        }),
      ),
    ],
    combat.roundParticipantOrder,
  );
  const distractPosition = distractOrder.findIndex((action) => action.actor === 'character');
  const distractable = survivors.some(
    (participant) =>
      (combat.participants[participant.id]?.waryUntilRound ?? 0) < combat.round &&
      distractOrder.findIndex((action) => action.participantId === participant.id) >
        distractPosition,
  );
  return [
    {
      id: 'advance',
      group: 'position',
      enabled: anyFar,
      reason: anyFar ? undefined : 'already-near',
    },
    {
      id: 'fall-back',
      group: 'position',
      enabled: anyNear,
      reason: anyNear ? undefined : 'already-far',
    },
    {
      id: 'attack',
      group: 'fight',
      enabled: inReach,
      reason: inReach ? undefined : 'needs-near',
      weaponId: attack.weaponId,
      weaponName: attack.weaponName,
    },
    { id: 'defend', group: 'fight', enabled: true },
    {
      id: 'distract',
      group: 'fight',
      enabled: distractable,
      reason: distractable ? undefined : 'wary',
    },
    ...consumables.map((itemId): CombatAvailability => {
      const name = scenario.itemsById[itemId]?.name ?? itemId;
      return {
        id: 'use-item',
        group: 'items',
        enabled: belowFull,
        reason: belowFull ? undefined : 'full-health',
        itemId,
        itemName: name,
      };
    }),
    { id: 'escape', group: 'leave', enabled: true },
  ];
}

/**
 * Victory (every participant's Damage taken ≥ its Enemy's maximum Health):
 * the Combat ends, a Combat end entry is appended, then the `victory` Outcome
 * is applied — or, without one, the Enemy-defeated notice, back in the
 * Location view of the fight. Entries carry every participant as presented
 * and how the Combat ended; their wording comes from the catalogue when they
 * are read. Victory resolves neither cleanup selection nor remaining actions.
 */
function finishVictory(
  scenario: Scenario,
  state: PlaythroughState,
  encounter: CompiledEncounter,
  round: Extract<NewJournalEntry, { type: 'combat-round' }>,
  health: number,
  encounters: PlaythroughState['encounters'],
  rng: Rng,
  inventory: PlaythroughState['inventory'] = state.inventory,
  equipment: PlaythroughState['equipment'] = state.equipment,
): ApplyActionResult {
  const end: NewJournalEntry = {
    type: 'combat-end',
    lang: scenario.language,
    encounterId: encounter.id,
    participants: allParticipantRefs(encounter),
    howEnded: 'victory',
  };
  let next: PlaythroughState = {
    ...state,
    step: state.step + 1,
    character: { ...state.character, health },
    encounters,
    inventory,
    equipment,
    activeSceneId: null,
    activeCombat: null,
  };
  const journal: NewJournalEntry[] = [round, end];
  if (encounter.victory !== undefined) {
    const applied = applyOutcome(scenario, next, encounter.victory, rng);
    next = applied.state;
    journal.push(...applied.journal);
  } else {
    journal.push({
      type: 'enemy-defeated',
      lang: scenario.language,
      encounterId: encounter.id,
      participants: allParticipantRefs(encounter),
    });
  }
  return { ok: true, state: next, journal };
}

/**
 * Escape (docs/spec/playthrough-state.md, transitions): the Combat ends, its
 * starting membership, tie-break order, Ranges and temporary effects are
 * discarded, the Encounter record keeps each participant's Damage taken
 * (including defeated participants), and the `escape` Outcome is applied.
 * Like victory it resolves neither cleanup selection nor remaining actions.
 */
function finishEscape(
  scenario: Scenario,
  state: PlaythroughState,
  encounter: CompiledEncounter,
  round: Extract<NewJournalEntry, { type: 'combat-round' }>,
  health: number,
  encounters: PlaythroughState['encounters'],
  rng: Rng,
): ApplyActionResult {
  const end: NewJournalEntry = {
    type: 'combat-end',
    lang: scenario.language,
    encounterId: encounter.id,
    participants: allParticipantRefs(encounter),
    howEnded: 'escape',
  };
  const next: PlaythroughState = {
    ...state,
    step: state.step + 1,
    character: { ...state.character, health },
    encounters,
    activeSceneId: null,
    activeCombat: null,
  };
  const applied = applyOutcome(scenario, next, encounter.escape, rng);
  return { ok: true, state: applied.state, journal: [round, end, ...applied.journal] };
}

/**
 * Character actions that name a target participant. Distract joins this set
 * with issue #122.
 */
const TARGETED_COMBAT_ACTIONS: ReadonlySet<CombatAction> = new Set([
  'attack',
  'advance',
  'distract',
]);

/**
 * One Combat Round (docs/spec/mechanics.md, rounds;
 * docs/spec/playthrough-state.md, Combat): the Character's action takes its
 * place in the order among the Round's committed Intents, and the whole Round
 * resolves in one atomic step — one action and one `step`. Actions resolve in
 * Speed order (fast, normal, slow), then by effective Agility (the Character
 * wins ties; equal Enemies use the saved participant order). A defeated
 * participant's queued action is dropped while the Round continues; defeating
 * the last participant, the Character's death, or a successful Escape stops
 * the sequence with later actions recorded as not reached. A continuing Round
 * increments the round number and `step` once, expires round-scoped effects,
 * captures the current content order and stores the next Round's Intents.
 *
 * Issue #120 resolves the targeted Attack (plus the Enemy Intents Strike,
 * Close in, Prepare and Heavy attack); issue #121 adds Advance, Fall back,
 * Escape and Consumable use; issue #122 adds Defend and Distract. Anything
 * else unknown is rejected without advancing `step`, drawing dice or changing
 * Intents, state or Journal.
 */
function applyCombat(
  scenario: Scenario,
  state: PlaythroughState,
  combatAction: CombatAction,
  rng: Rng,
  itemId?: string,
  targetParticipantId?: string,
): ApplyActionResult {
  // A Combat `use-item` names its Consumable; the other actions take none.
  // The Consumable resolves at its place in the order (issue #121).
  const combat = state.activeCombat;
  if (combat == null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const encounter = scenario.encountersById[combat.encounterId];
  if (encounter === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  const woundsBefore = state.encounters[combat.encounterId] ?? {};
  const survivors = survivorsOf(encounter, woundsBefore);

  // Target validation (R10): a missing, unknown or defeated target, or a
  // target on an action that takes none, is rejected before anything resolves.
  let targetId = targetParticipantId;
  if (targetId !== undefined && !TARGETED_COMBAT_ACTIONS.has(combatAction)) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (TARGETED_COMBAT_ACTIONS.has(combatAction)) {
    if (targetId === undefined) {
      // One surviving participant permits an omitted target; two require one.
      const only = survivors.length === 1 ? survivors[0] : undefined;
      if (only === undefined) {
        return { ok: false, reason: 'illegal-action' };
      }
      targetId = only.id;
    } else if (!survivors.some((participant) => participant.id === targetId)) {
      return { ok: false, reason: 'illegal-action' };
    }
  }

  // Availability at submission (R10): every known action resolves.
  // Anything else unknown is rejected too.
  const target = targetId === undefined ? undefined : encounter.participants.find(
    (participant) => participant.id === targetId,
  );
  if (targetId !== undefined && target === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  // A fresh non-optional binding: the closures below resolve at their place in
  // the order, so they capture this instead of the narrowed `find` result.
  const victim: CompiledParticipant | undefined = target;
  const attack = characterAttack(scenario, state);
  if (combatAction === 'attack' || combatAction === 'distract') {
    if (victim === undefined) {
      return { ok: false, reason: 'illegal-action' };
    }
    const targetRange = combat.participants[victim.id]?.range ?? encounter.startRange;
    if (attack.reach === 'melee' && targetRange === 'far') {
      return { ok: false, reason: 'illegal-action' };
    }
  } else if (combatAction === 'advance') {
    if (victim === undefined) {
      return { ok: false, reason: 'illegal-action' };
    }
    // Advance is available only while the Range to the target is Far.
    const targetRange = combat.participants[victim.id]?.range ?? encounter.startRange;
    if (targetRange === 'near') {
      return { ok: false, reason: 'illegal-action' };
    }
  } else if (combatAction === 'fall-back') {
    // Fall back is available while at least one surviving participant is Near.
    const anyNear = survivors.some(
      (participant) => (combat.participants[participant.id]?.range ?? encounter.startRange) === 'near',
    );
    if (!anyNear) {
      return { ok: false, reason: 'illegal-action' };
    }
  } else if (combatAction === 'use-item') {
    const consumable = itemId === undefined ? undefined : scenario.itemsById[itemId];
    if (
      consumable === undefined ||
      consumable.kind !== 'consumable' ||
      (state.inventory[consumable.id] ?? 0) < 1
    ) {
      return { ok: false, reason: 'illegal-action' };
    }
    // Use-item at full Health is rejected: nothing is consumed.
    if (state.character.health >= MAX_HEALTH) {
      return { ok: false, reason: 'illegal-action' };
    }
  } else if (combatAction !== 'escape') {
    return { ok: false, reason: 'illegal-action' };
  }
  }
  // Escape is always available. The +2 bonus is captured from the Round as
  // shown when the Character commits: when no surviving participant was Near
  // then, an Enemy that closes in earlier in the order does not remove it.
  const escapeBonus =
    combatAction === 'escape' &&
    survivors.every(
      (participant) => (combat.participants[participant.id]?.range ?? encounter.startRange) !== 'near',
    )
      ? 2
      : 0;

  const effective = effectiveAttributes(scenario, state);
  const characterRef: TacticalActor = { kind: 'character' };
  // Captured for the resolvers below: narrowing of `combat` does not flow
  // into their bodies.
  const round = combat.round;
  const wounds: Record<string, number> = { ...woundsBefore };
  let health = state.character.health;
  // A Combat `use-item` consumes its copy at execution; every exit path below
  // carries these instead of the submitted inventory.
  let inventory: PlaythroughState['inventory'] = { ...state.inventory };
  let equipment: PlaythroughState['equipment'] = { ...state.equipment };
  const ranges: Record<string, CombatRange> = {};
  const prepared: Record<string, boolean> = {};
  const waryUntil: Record<string, number | undefined> = {};
  for (const [participantId, record] of Object.entries(combat.participants)) {
    ranges[participantId] = record.range;
    prepared[participantId] = record.prepared;
    waryUntil[participantId] = record.waryUntilRound;
  }

  /**
   * One roll: 2d6 plus the modifier against the base plus the defender's
   * Agility (Might for attacks, Wits for a Distract; 9 instead of 7 against a
   * Guarded Character). A miss deals no Damage.
   */
  const attackRoll = (
    side: 'character' | 'enemy',
    modifier: number,
    agility: number,
    damage: number,
    base = 7,
  ): CombatRoll => {
    const die1 = rng(1, 7);
    const die2 = rng(1, 7);
    const total = die1 + die2 + modifier;
    const targetNumber = base + agility;
    const hit = total >= targetNumber;
    return {
      side,
      die1,
      die2,
      modifier,
      total,
      target: targetNumber,
      hit,
      damage: hit ? damage : 0,
    };
  };

  // Commit. The Character's action takes its place in the order among the
  // Round's Intents. The order is fixed now; nothing during the Round
  // reorders it.
  const characterSpeed = CHARACTER_ACTION_SPEED[combatAction] ?? 'normal';
  const queued: QueuedAction[] = [
    { key: 'character', actor: 'character', speed: characterSpeed, agility: effective.agility },
    ...survivors.map(
      (participant): QueuedAction => ({
        key: participant.id,
        actor: 'participant',
        participantId: participant.id,
        speed: INTENT_SPEED[combat.participants[participant.id]?.intent ?? 'strike'],
        agility: participant.enemy.attributes.agility,
      }),
    ),
  ];
  const ordered = orderActions(queued, combat.roundParticipantOrder);

  if (combatAction === 'distract' && victim !== undefined) {
    // A Wary target cannot be distracted again: the attempt is rejected.
    if ((combat.participants[victim.id]?.waryUntilRound ?? 0) >= combat.round) {
      return { ok: false, reason: 'illegal-action' };
    }
    // The target's Intent must come later in the Round's order than the
    // Distract. A fast Distract precedes every Intent, so this bar is
    // defensive; it stays explicit because the spec requires it.
    const distractPosition = ordered.findIndex((action) => action.actor === 'character');
    const targetPosition = ordered.findIndex(
      (action) => action.participantId === victim.id,
    );
    if (targetPosition <= distractPosition) {
      return { ok: false, reason: 'illegal-action' };
    }
  }

  // Resolve in order.
  const actions: TacticalActionEvent[] = [];
  let stop: CombatStopReason | undefined;
  // Guarded from Defend's execution until cleanup: attacks against the
  // Character use the guarded threshold. Round-scoped, never stored.
  let guarded = false;
  // At most one counterattack per Round: only the first missed melee attack
  // against the Guarded Character triggers it.
  let counterUsed = false;
  // Participants whose Intent a successful Distract interrupted: cancelled at
  // their place in the order.
  const interrupted = new Set<string>();

  /** The target participant as presented, for the Character's action. */
  function targetRef(): TacticalActor {
    if (victim === undefined) {
      throw new Error('targeted action committed without a target');
    }
    return { kind: 'participant', ...participantRefOf(encounter, victim) };
  }

  /** The given participant as presented, for parameterized resolvers. */
  function targetRefOf(participant: CompiledParticipant): TacticalActor {
    return { kind: 'participant', ...participantRefOf(encounter, participant) };
  }
  }

  /** One Enemy Intent at its place in the order. */
  function resolveEnemyAction(
    participant: CompiledParticipant,
    actor: TacticalActor,
    intent: IntentKind,
    speed: Speed,
    order: number,
  ): void {
    // Its actor was defeated earlier in the Round: the action is dropped.
    if ((wounds[participant.id] ?? 0) >= participant.enemy.health) {
      actions.push({
        actor,
        kind: intent,
        speed,
        order,
        target: characterRef,
        status: 'dropped',
      });
      return;
    }
    // A successful Distract interrupted its Intent: cancelled at its place in
    // the order, never replaced. Interrupting a Prepare or a Heavy attack
    // clears the preparation it builds on.
    if (interrupted.has(participant.id)) {
      prepared[participant.id] = false;
      actions.push({
        actor,
        kind: intent,
        speed,
        order,
        target: characterRef,
        status: 'cancelled',
        cancelReason: 'interrupted',
        ...((intent === 'prepare' || intent === 'heavy-attack') ? { prepared: false } : {}),
      });
      return;
    }
    const range = ranges[participant.id] ?? encounter.startRange;
    if (intent === 'close-in') {
      if (range === 'near') {
        actions.push({
          actor,
          kind: intent,
          speed,
          order,
          target: characterRef,
          status: 'cancelled',
          cancelReason: 'already-near',
        });
      } else {
        ranges[participant.id] = 'near';
        actions.push({
          actor,
          kind: intent,
          speed,
          order,
          target: characterRef,
          status: 'executed',
          rangeBefore: 'far',
          rangeAfter: 'near',
        });
      }
      return;
    }
    if (intent === 'prepare') {
      prepared[participant.id] = true;
      actions.push({
        actor,
        kind: intent,
        speed,
        order,
        target: characterRef,
        status: 'executed',
        prepared: true,
      });
      return;
    }
    // Strike and Heavy attack. The Heavy attack is slow and deals base Damage
    // +3. Its miss or Reach cancellation clears the preparation it builds on.
    const heavy = intent === 'heavy-attack';
    const damage = participant.enemy.damage + (heavy ? 3 : 0);
    if (!intentInReach(participant.enemy.reach, range)) {
      if (heavy) {
        prepared[participant.id] = false;
      }
      actions.push({
        actor,
        kind: intent,
        speed,
        order,
        target: characterRef,
        status: 'cancelled',
        cancelReason: 'out-of-reach',
        ...(heavy ? { prepared: false } : {}),
      });
      return;
    }
    // Attacks against the Guarded Character need 9 + Agility instead of 7.
    const roll = attackRoll(
      'enemy',
      participant.enemy.attributes.might,
      effective.agility,
      damage,
      guarded ? 9 : 7,
    );
    if (roll.hit) {
      health -= damage;
    }
    if (heavy) {
      prepared[participant.id] = false;
    }
    const event: TacticalActionEvent = {
      actor,
      kind: intent,
      speed,
      order,
      target: characterRef,
      status: 'executed',
      roll,
      damage: roll.hit ? damage : 0,
      ...(heavy ? { prepared: false } : {}),
    };
    // The first melee attack in the Round that misses the Guarded Character
    // triggers the counterattack reaction: the Character's hit roll against
    // that attacker for 1 Damage. Ranged misses trigger none, later misses
    // trigger none, and the reaction triggers no further reaction.
    if (!roll.hit && guarded && !counterUsed && participant.enemy.reach === 'melee') {
      counterUsed = true;
      const counterRoll = attackRoll(
        'character',
        effective.might,
        participant.enemy.attributes.agility,
        1,
      );
      let counterDefeated: string[] | undefined;
      if (counterRoll.hit) {
        wounds[participant.id] = (wounds[participant.id] ?? 0) + 1;
        if ((wounds[participant.id] ?? 0) >= participant.enemy.health) {
          counterDefeated = [participant.id];
        }
      }
      event.counter = {
        roll: counterRoll,
        damage: counterRoll.hit ? 1 : 0,
        ...(counterDefeated !== undefined ? { defeatedParticipants: counterDefeated } : {}),
      };
      if (counterDefeated !== undefined && encounterDefeated(encounter, wounds)) {
        stop = 'victory';
      }
    }
    if (roll.hit && health <= 0) {
      event.characterDefeated = true;
      stop = 'death';
    }
    actions.push(event);
  }

  /** Defend at its place in the order: no roll. The Character is Guarded now. */
  function resolveCharacterDefend(order: number): void {
    guarded = true;
    actions.push({
      actor: characterRef,
      kind: 'defend',
      speed: 'fast',
      order,
      status: 'executed',
      guarded: true,
    });
  }

  /** Distract at its place in the order: a Wits roll against the target. */
  function resolveCharacterDistract(victim: CompiledParticipant, order: number): void {
    const ref = targetRefOf(victim);
    // Cancelled when the target has been defeated.
    if ((wounds[victim.id] ?? 0) >= victim.enemy.health) {
      actions.push({
        actor: characterRef,
        kind: 'distract',
        speed: 'fast',
        order,
        target: ref,
        status: 'cancelled',
        cancelReason: 'target-defeated',
      });
      return;
    }
    const roll = attackRoll(
      'character',
      effective.wits,
      victim.enemy.attributes.wits,
      0,
    );
    if (!roll.hit) {
      // Failure has no effect: no interruption, no Wary, no prepared change.
      actions.push({
        actor: characterRef,
        kind: 'distract',
        speed: 'fast',
        order,
        target: ref,
        status: 'executed',
        roll,
        damage: 0,
      });
      return;
    }
    // Success interrupts the announced Intent (cancelled at its place in the
    // order), clears the preparation it builds on, and makes the target Wary
    // until the end of the next Round.
    interrupted.add(victim.id);
    prepared[victim.id] = false;
    waryUntil[victim.id] = round + 1;
    actions.push({
      actor: characterRef,
      kind: 'distract',
      speed: 'fast',
      order,
      target: ref,
      status: 'executed',
      roll,
      damage: 0,
      prepared: false,
      waryUntilRound: round + 1,
    });
  }

  /** The Character's Attack at its place in the order. */
  function resolveCharacterAttack(order: number): void {
    if (victim === undefined) {
      throw new Error('attack committed without a target');
    }
    const ref = targetRef();
    // Cancelled when the target has been defeated, or the Character's Reach
    // no longer allows it at the Range to the target.
    if ((wounds[victim.id] ?? 0) >= victim.enemy.health) {
      actions.push({
        actor: characterRef,
        kind: 'attack',
        speed: 'normal',
        order,
        target: ref,
        status: 'cancelled',
        cancelReason: 'target-defeated',
      });
      return;
    }
    const currentRange = ranges[victim.id] ?? encounter.startRange;
    if (attack.reach === 'melee' && currentRange === 'far') {
      actions.push({
        actor: characterRef,
        kind: 'attack',
        speed: 'normal',
        order,
        target: ref,
        status: 'cancelled',
        cancelReason: 'out-of-reach',
      });
      return;
    }
    const roll = attackRoll(
      'character',
      effective.might,
      victim.enemy.attributes.agility,
      attack.damage,
    );
    let defeatedParticipants: string[] | undefined;
    if (roll.hit) {
      wounds[victim.id] = (wounds[victim.id] ?? 0) + attack.damage;
      if ((wounds[victim.id] ?? 0) >= victim.enemy.health) {
        defeatedParticipants = [victim.id];
      }
    }
    actions.push({
      actor: characterRef,
      kind: 'attack',
      speed: 'normal',
      order,
      target: ref,
      status: 'executed',
      roll,
      damage: roll.hit ? attack.damage : 0,
      ...(attack.weaponName !== undefined ? { weaponName: attack.weaponName } : {}),
      ...(defeatedParticipants !== undefined ? { defeatedParticipants } : {}),
    });
    if (defeatedParticipants !== undefined && encounterDefeated(encounter, wounds)) {
      stop = 'victory';
    }
  }

  /** Participants still standing at this place in the order. */
  function currentSurvivors(): CompiledParticipant[] {
    return survivors.filter(
      (participant) => (wounds[participant.id] ?? 0) < participant.enemy.health,
    );
  }

  /** The Character's Advance at its place in the order: no roll. */
  function resolveCharacterAdvance(order: number): void {
    if (victim === undefined) {
      throw new Error('advance committed without a target');
    }
    const ref = targetRef();
    // Cancelled when the target has been defeated, or a faster Close in has
    // already made the Range Near. The Round is spent, not replaced.
    if ((wounds[victim.id] ?? 0) >= victim.enemy.health) {
      actions.push({
        actor: characterRef,
        kind: 'advance',
        speed: characterSpeed,
        order,
        target: ref,
        status: 'cancelled',
        cancelReason: 'target-defeated',
      });
      return;
    }
    if ((ranges[victim.id] ?? encounter.startRange) === 'near') {
      actions.push({
        actor: characterRef,
        kind: 'advance',
        speed: characterSpeed,
        order,
        target: ref,
        status: 'cancelled',
        cancelReason: 'already-near',
      });
      return;
    }
    // Only the targeted Far lane moves; every other Range is untouched.
    ranges[victim.id] = 'near';
    actions.push({
      actor: characterRef,
      kind: 'advance',
      speed: characterSpeed,
      order,
      target: ref,
      status: 'executed',
      rangeBefore: 'far',
      rangeAfter: 'near',
    });
  }

  /** The Character's Fall back at its place in the order: slow, one roll. */
  function resolveCharacterFallBack(order: number): void {
    // Cancelled when no surviving participant is Near at this place in the
    // order. The opposing Agility is read now, from the currently Near
    // survivors, so a participant defeated earlier no longer opposes.
    const near = currentSurvivors().filter(
      (participant) => (ranges[participant.id] ?? encounter.startRange) === 'near',
    );
    if (near.length === 0) {
      actions.push({
        actor: characterRef,
        kind: 'fall-back',
        speed: characterSpeed,
        order,
        status: 'cancelled',
        cancelReason: 'none-near',
      });
      return;
    }
    const opposing = Math.max(
      ...near.map((participant) => participant.enemy.attributes.agility),
    );
    const die1 = rng(1, 7);
    const die2 = rng(1, 7);
    const total = die1 + die2 + effective.agility;
    const targetNumber = 7 + opposing;
    const success = total >= targetNumber;
    const roll: CombatRoll = {
      side: 'character',
      die1,
      die2,
      modifier: effective.agility,
      total,
      target: targetNumber,
      hit: success,
      damage: 0,
    };
    if (!success) {
      actions.push({
        actor: characterRef,
        kind: 'fall-back',
        speed: characterSpeed,
        order,
        status: 'executed',
        roll,
        damage: 0,
      });
      return;
    }
    // Success moves every Near lane to Far — including a later melee Heavy
    // attack's lane, which then cancels as out of Reach at its own place in
    // the order. Earlier normal actions already resolved and are unaffected.
    for (const participant of near) {
      ranges[participant.id] = 'far';
    }
    actions.push({
      actor: characterRef,
      kind: 'fall-back',
      speed: characterSpeed,
      order,
      status: 'executed',
      roll,
      damage: 0,
      rangeBefore: 'near',
      rangeAfter: 'far',
    });
  }

  /** The Character's Escape at its place in the order: never cancelled. */
  function resolveCharacterEscape(order: number): void {
    // The opposing Agility is read now, from the current survivors, while the
    // +2 bonus was captured at commitment from the Round as shown then.
    const alive = currentSurvivors();
    const opposing = alive.length === 0
      ? 0
      : Math.max(...alive.map((participant) => participant.enemy.attributes.agility));
    const die1 = rng(1, 7);
    const die2 = rng(1, 7);
    const modifier = effective.agility + escapeBonus;
    const total = die1 + die2 + modifier;
    const targetNumber = 7 + opposing;
    const success = total >= targetNumber;
    const roll: CombatRoll = {
      side: 'character',
      die1,
      die2,
      modifier,
      total,
      target: targetNumber,
      hit: success,
      damage: 0,
    };
    actions.push({
      actor: characterRef,
      kind: 'escape',
      speed: characterSpeed,
      order,
      status: 'executed',
      roll,
      damage: 0,
    });
    if (success) {
      stop = 'escape';
    }
  }

  /** The Character's Consumable use at its place in the order: never cancelled. */
  function resolveCharacterUseItem(order: number): void {
    const consumable = itemId === undefined ? undefined : scenario.itemsById[itemId];
    if (consumable === undefined || consumable.kind !== 'consumable') {
      throw new Error('use-item committed without a consumable');
    }
    // Heals — and consumes — only at execution, from the current Health, so
    // earlier Enemy actions in the order reduce the waste. A death earlier in
    // the order stops the sequence before this action instead.
    const restored =
      Math.min(MAX_HEALTH, health + consumable.heal) - health;
    health += restored;
    const after = removeFromInventory({ ...state, inventory, equipment }, consumable.id, 1);
    inventory = after.inventory;
    equipment = after.equipment;
    actions.push({
      actor: characterRef,
      kind: 'use-item',
      speed: characterSpeed,
      order,
      status: 'executed',
      itemId: consumable.id,
      itemName: consumable.name,
      healed: restored,
    });
  }

  /** The Character's action at its place in the order. */
  function resolveCharacterAction(order: number): void {
    if (combatAction === 'advance') {
      resolveCharacterAdvance(order);
    } else if (combatAction === 'fall-back') {
      resolveCharacterFallBack(order);
    } else if (combatAction === 'escape') {
      resolveCharacterEscape(order);
    } else if (combatAction === 'use-item') {
      resolveCharacterUseItem(order);
    } else if (combatAction === 'defend') {
      resolveCharacterDefend(order);
    } else if (combatAction === 'distract') {
      // Unreachable when the victim is missing: targeted actions always bind
      // one at submission, and the resolvers below capture that binding.
      if (victim !== undefined) {
        resolveCharacterDistract(victim, order);
      }
    } else {
      resolveCharacterAttack(order);
    }
  }

  ordered.forEach((queuedAction, index) => {
    const order = index + 1;
    if (queuedAction.actor === 'participant') {
      const participant = encounter.participants.find(
        (candidate) => candidate.id === queuedAction.participantId,
      );
      if (participant === undefined) {
        return;
      }
      const actor: TacticalActor = {
        kind: 'participant',
        ...participantRefOf(encounter, participant),
      };
      const intent = combat.participants[participant.id]?.intent ?? 'strike';
      // The sequence stopped earlier: later actions are recorded as not
      // reached. Otherwise the Intent resolves as announced or is cancelled;
      // it is never swapped for another action.
      if (stop !== undefined) {
        actions.push({
          actor,
          kind: intent,
          speed: INTENT_SPEED[intent],
          order,
          target: characterRef,
          status: 'not-reached',
        });
        return;
      }
      resolveEnemyAction(participant, actor, intent, INTENT_SPEED[intent], order);
      return;
    }
    if (stop !== undefined) {
      actions.push({
        actor: characterRef,
        kind: combatAction,
        speed: characterSpeed,
        order,
        ...(victim === undefined ? {} : { target: targetRef() }),
        status: 'not-reached',
      });
      return;
    }
    resolveCharacterAction(order);
  });

  /**
   * One Combat round entry: every action of the Round in order — executed,
   * cancelled, dropped, or not reached because the sequence stopped — with
   * the participant names as presented. Wording comes from the Interface Text
   * catalogue when the entry is read, so no display text is stored here.
   */
  const roundEntry: Extract<NewJournalEntry, { type: 'combat-round' }> = {
    type: 'combat-round',
    lang: scenario.language,
    encounterId: encounter.id,
    round: combat.round,
    version: 2,
    actions,
    ...(stop !== undefined ? { stop } : {}),
  };
  const encounters = { ...state.encounters, [encounter.id]: wounds };

  // Character death ends the Playthrough on the death Ending: no cleanup
  // selection, no remaining actions, only the death Outcome.
  if (stop === 'death') {
    const ended: PlaythroughState = {
      ...state,
      step: state.step + 1,
      character: { ...state.character, health: 0 },
      encounters,
      status: 'ended',
      endingId: scenario.deathEnding.id,
      activeSceneId: null,
      activeCombat: null,
    };
    return {
      ok: true,
      state: ended,
      journal: [roundEntry, endingEntry(scenario, ended, scenario.deathEnding)],
    };
  }

  // Victory ends the Combat: no cleanup selection, no remaining actions, only
  // the applicable Encounter Outcome.
  if (stop === 'victory') {
    return finishVictory(scenario, state, encounter, roundEntry, health, encounters, rng, inventory, equipment);
  }

  // A successful Escape ends the Combat: later actions do not resolve, no
  // next Intents are selected, and the `escape` Outcome is applied.
  if (stop === 'escape') {
    return finishEscape(scenario, state, encounter, roundEntry, health, encounters, rng);
  }

  // A continuing Round (R11): the round number and `step` increment once,
  // round-scoped effects expire, then the current content order of the
  // survivors is captured and their next Intents are selected and stored.
  // Selection dice draw here, after the resolution rolls, in participant order.
  const nextRound = combat.round + 1;
  const remaining = survivorsOf(encounter, wounds);
  const nextOrder = remaining.map((participant) => participant.id);
  const selection = selectIntents(
    remaining.map((participant) => ({
      participant,
      range: ranges[participant.id] ?? encounter.startRange,
      prepared: prepared[participant.id] ?? false,
    })),
    rng,
  );
  const nextParticipants: Record<
    string,
    { range: CombatRange; intent: IntentKind; prepared: boolean; waryUntilRound?: number }
  > = {};
  for (const participant of remaining) {
    const record: (typeof nextParticipants)[string] = {
      range: ranges[participant.id] ?? encounter.startRange,
      intent: selection.intents[participant.id] ?? 'strike',
      prepared: selection.prepared[participant.id] ?? false,
    };
    // Wary outlasts the step: it lasts until the end of the next Round,
    // including Wary a successful Distract applied this Round.
    const until = waryUntil[participant.id];
    if (until !== undefined && until >= nextRound) {
      record.waryUntilRound = until;
    }
    nextParticipants[participant.id] = record;
  }
  const next: PlaythroughState = {
    ...state,
    step: state.step + 1,
    character: { ...state.character, health },
    encounters,
    inventory,
    equipment,
    activeCombat: {
      encounterId: encounter.id,
      round: nextRound,
      startedParticipants: combat.startedParticipants,
      roundParticipantOrder: nextOrder,
      participants: nextParticipants,
    },
  };
  return { ok: true, state: next, journal: [roundEntry] };
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
 * is the store. Tactical (v2) rounds carry no guard: Defend does not resolve
 * there yet (issue #122), so a v2 round reads as guard down.
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
      if (isTacticalRoundPayload(entry.payload)) return false;
      return entry.payload.guard === true;
    }
    if (entry.type === 'combat-start') {
      return false;
    }
  }
  return false;
}

/**
 * Whether a stored combat-round payload is a tactical (v2) round: every
 * action of the Round in resolution order, instead of the legacy v1
 * action/rolls/guard fields. The full v2 report rendering arrives with the
 * application integration (I5); the v1 readers below skip these rows.
 */
function isTacticalRoundPayload(payload: { encounterId?: unknown; guard?: unknown }): boolean {
  return Array.isArray((payload as { actions?: unknown }).actions);
}

export type CombatRoundView = {
  round: number;
  action: CombatAction;
  rangeBefore: CombatRange;
  rangeAfter: CombatRange;
  guard: boolean;
  rolls: CombatRoll[];
  /**
   * New rows: the Enemy's name as presented. Absent on legacy rows, which
   * carry stored English text instead and are shown verbatim.
   */
  enemyName?: string;
  /** New `attack` rows: the weapon name as presented; absent when unarmed. */
  weaponName?: string;
  /** New `use-item` rows: the Consumable's name as presented. */
  itemName?: string;
  /** New `use-item` rows: the Health restored. */
  healed?: number;
  /** Legacy rows only: the stored English text, shown verbatim. */
  text?: string;
};

/**
 * The rounds of the current Combat: the Combat round entries since the latest
 * opening narration of the Encounter. New rows carry structured events and are
 * rendered through the catalogue; legacy rows carry stored text and are shown
 * verbatim. Tactical (v2) rounds are skipped: their ordered action report is
 * rendered by the application integration (I5), never reinterpreted as legacy
 * guard payloads.
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
      if (isTacticalRoundPayload(entry.payload)) continue;
      const payload = entry.payload as {
        round?: unknown;
        action?: unknown;
        rangeBefore?: unknown;
        rangeAfter?: unknown;
        guard?: unknown;
        enemyName?: unknown;
        weaponName?: unknown;
        itemName?: unknown;
        healed?: unknown;
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
        rolls: Array.isArray(payload.rolls) ? (payload.rolls as CombatRoll[]) : [],
        ...(typeof payload.enemyName === 'string' ? { enemyName: payload.enemyName } : {}),
        ...(typeof payload.weaponName === 'string' ? { weaponName: payload.weaponName } : {}),
        ...(typeof payload.itemName === 'string' ? { itemName: payload.itemName } : {}),
        ...(typeof payload.healed === 'number' ? { healed: payload.healed } : {}),
        ...(typeof payload.text === 'string' ? { text: payload.text } : {}),
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
        /** The equipped weapon's name as presented; absent when unarmed. */
        weaponName?: string;
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
      // Interim projection (issue #120): the Combat view keeps its old shape
      // and shows the first surviving participant. The full arena projection
      // (membership, targets, order, badges) arrives with the arena view
      // (issue #123, R12).
      const wounds = state.encounters[combat.encounterId] ?? {};
      const leadParticipant =
        survivorsOf(encounter, wounds)[0] ?? encounter.participants[0];
      if (leadParticipant === undefined) {
        throw new Error(`encounter "${encounter.id}" has no participants`);
      }
      const lead = leadParticipant.enemy;
      const taken = wounds[leadParticipant.id] ?? 0;
      return {
        kind: 'combat',
        locationId: location.id,
        locationName: location.name,
        encounterId: encounter.id,
        encounterName: lead.name,
        text: encounter.text,
        characterName: state.character.name,
        range: combat.participants[leadParticipant.id]?.range ?? encounter.startRange,
        round: combat.round,
        character: {
          health: state.character.health,
          maxHealth: MAX_HEALTH,
          // The default weapon's name comes from the catalogue when rendered;
          // the engine carries only the equipped weapon's name as presented.
          ...(attack.weaponName === undefined ? {} : { weaponName: attack.weaponName }),
          reach: attack.reach,
          damage: attack.damage,
        },
        enemy: {
          name: lead.name,
          health: Math.max(0, lead.health - taken),
          maxHealth: lead.health,
          damage: lead.damage,
          reach: lead.reach,
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
