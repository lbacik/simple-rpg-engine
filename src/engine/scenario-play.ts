// Combat MVP 1.0 journey on the v3 document (P6 Scenario adapter, #242).
//
// The journey rules ported from `src/engine/index.ts` to `PlaythroughV3`:
// starting at full Health (40, the hero profile's maximum), Travel, Choose,
// Continue, Open Scene, Equip, Unequip and Use item, Outcome application
// including `start-combat`, and the shared views. Combat Rounds resolve
// through `src/engine/scenario-combat.ts`; a finished fight's routed Outcome
// is applied here, so Effects, transitions and the death Ending land exactly
// like a Choice Outcome.
//
// Pure and framework-free like the v2 journey: no IO, no Date, no randomness
// except the injected `rng`, no text beyond Scenario content as presented.

import type { Scenario } from '../content/index';
import type {
  CompiledChoice,
  CompiledCompanion,
  CompiledEffect,
  CompiledEncounter,
  CompiledOutcome,
  CompiledScene,
} from '../content/model';
import { effectiveAttributes, evaluateCondition } from './conditions';
import type { RoundCommand } from './combat/index';
import { isEquipmentSlot, removeFromInventory, type EquipmentSlot } from './inventory';
import {
  DIFFICULTY_TARGETS,
  illustrationView,
  type GameView,
  type NewJournalEntry,
  type Rng,
} from './index';
import { deriveMap, type MapOptions } from './map';
import { substituteName } from './narration';
import {
  confirmScenarioCombatRound,
  startScenarioCombat,
  surrenderScenarioCombat,
  type ScenarioCombatJournalEntry,
  type ScenarioCompanionJournalEntry,
} from './scenario-combat';
import { PLAYTHROUGH_MAX_HEALTH, PLAYTHROUGH_SCHEMA_VERSION } from './state-v3';
import type { PlaythroughV3 } from './state-v3';

/** Journal entries one v3 turn produces: journey entries plus Combat and Companion entries. */
export type ScenarioJournalEntry =
  | NewJournalEntry
  | ScenarioCombatJournalEntry
  | ScenarioCompanionJournalEntry;

/**
 * The present Companion's definition, resolved from the localized Scenario so
 * names are stored as presented. Unknown ids read as absent: the reference
 * check already holds those Playthroughs read-only.
 */
function presentCompanion(
  scenario: Scenario,
  state: PlaythroughV3,
): CompiledCompanion | null {
  const id = state.companion?.id;
  if (id === undefined) return null;
  return scenario.companionsById[id] ?? null;
}

/**
 * Player actions on a v3 Playthrough. The journey actions mirror the v2
 * kinds; the Combat actions carry the command-panel command and the step
 * guard. Travel identifies the Connection by its target; Equip names a held
 * Equipment item; Unequip names a slot; Use item names a held Consumable;
 * Choose names a Choice of the active Scene; Continue applies the empty
 * Outcome when no Choice is visible; Open Scene activates an on-demand Scene
 * of the current Location.
 */
export type ScenarioActionV3 =
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
    };

export type ApplyScenarioActionSuccess = {
  ok: true;
  state: PlaythroughV3;
  journal: ScenarioJournalEntry[];
  /**
   * The routed Outcome when a Combat ended on this turn: the Encounter's
   * `victory`, `surrender` or `draw` Outcome (already applied), or `'death'`
   * for `LOSS`. Absent when no Combat ended.
   */
  end?: { outcome: CompiledOutcome | 'death' };
};

export type ApplyScenarioActionFailure = {
  ok: false;
  reason: 'stale-step' | 'stale-round' | 'illegal-action' | 'ended';
};

export type ApplyScenarioActionResult = ApplyScenarioActionSuccess | ApplyScenarioActionFailure;

export type StartScenarioPlaythroughResult =
  | { ok: true; state: PlaythroughV3; journal: ScenarioJournalEntry[] }
  | { ok: false; reason: 'invalid-name' | 'unknown-template' };

function pushUnique(list: string[], id: string): string[] {
  return list.includes(id) ? list : [...list, id];
}

/**
 * Starting a Playthrough on the v3 document: create the Character from the
 * Template (trimmed 1-40 name, copied base Attributes, full Health 40,
 * starting items, Template Equipment equipped), set step 0 at the starting
 * Location with empty Flags, no Companion and no Combat, append the intro,
 * and enter the starting Location (marked visited, opening on-enter Scene
 * active).
 */
export function startPlaythroughV3(
  scenario: Scenario,
  templateId: string,
  name: string,
  // Kept for the engine contract: later steps roll dice, starting one does not.
  _rng: Rng,
): StartScenarioPlaythroughResult {
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

  const equipment: PlaythroughV3['equipment'] = {};
  for (const entry of template.items) {
    if (entry.item.kind === 'equipment') {
      equipment[entry.item.slot] = entry.item.id;
    }
  }

  const initial: PlaythroughV3 = {
    schemaVersion: PLAYTHROUGH_SCHEMA_VERSION,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    contentHash: scenario.contentHash,
    status: 'active',
    step: 0,
    character: {
      templateId: template.id,
      name: trimmed,
      baseAttributes: { ...template.attributes },
      health: PLAYTHROUGH_MAX_HEALTH,
    },
    inventory,
    equipment,
    companion: null,
    lostCompanions: [],
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

  const journal: ScenarioJournalEntry[] = scenario.intro
    ? [{ type: 'intro', lang: scenario.language, text: substituteName(scenario.intro, trimmed) }]
    : [];
  const entered = enterLocationV3(scenario, initial, scenario.startLocation.id);
  return { ok: true, state: entered.state, journal: [...journal, ...entered.journal] };
}

/**
 * One synchronous, deterministic turn without I/O: the `step` guard first,
 * then legality in the current position. Journey actions are illegal while a
 * Combat runs (G5: Consumables are usable outside Combat only, and the
 * inventory shows `in-combat`); Combat actions resolve through the shared
 * core and apply the routed Outcome when the fight ends. Returns only the new
 * Journal entries.
 */
export function applyScenarioActionV3(
  scenario: Scenario,
  state: PlaythroughV3,
  action: ScenarioActionV3,
  rng: Rng,
): ApplyScenarioActionResult {
  if (action.expectedStep !== state.step) {
    return { ok: false, reason: 'stale-step' };
  }
  if (state.status === 'ended') {
    return { ok: false, reason: 'ended' };
  }
  switch (action.kind) {
    case 'combat-confirm':
      return applyCombatConfirmV3(scenario, state, action.command);
    case 'combat-surrender':
      return applyCombatSurrenderV3(scenario, state, action.round);
    case 'travel':
      if (state.activeCombat !== null) return { ok: false, reason: 'illegal-action' };
      return applyTravelV3(scenario, state, action.targetLocationId);
    case 'choose':
      if (state.activeCombat !== null) return { ok: false, reason: 'illegal-action' };
      return applyChooseV3(scenario, state, action.choiceId, rng);
    case 'continue':
      if (state.activeCombat !== null) return { ok: false, reason: 'illegal-action' };
      return applyContinueV3(scenario, state);
    case 'open-scene':
      if (state.activeCombat !== null) return { ok: false, reason: 'illegal-action' };
      return applyOpenSceneV3(scenario, state, action.sceneId);
    case 'equip':
      if (state.activeCombat !== null) return { ok: false, reason: 'illegal-action' };
      return applyEquipV3(scenario, state, action.itemId);
    case 'unequip':
      if (state.activeCombat !== null) return { ok: false, reason: 'illegal-action' };
      return applyUnequipV3(scenario, state, action.slot);
    case 'use-item':
      if (state.activeCombat !== null) return { ok: false, reason: 'illegal-action' };
      return applyUseItemV3(scenario, state, action.itemId);
    default:
      return { ok: false, reason: 'illegal-action' };
  }
}

/** The Encounter the running Combat was started from, if it still exists. */
function activeEncounter(scenario: Scenario, state: PlaythroughV3): CompiledEncounter | undefined {
  const encounterId = state.activeCombat?.encounterId;
  if (encounterId === undefined) return undefined;
  return scenario.encountersById[encounterId];
}

function applyCombatConfirmV3(
  scenario: Scenario,
  state: PlaythroughV3,
  command: RoundCommand,
): ApplyScenarioActionResult {
  const encounter = activeEncounter(scenario, state);
  if (encounter === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  const confirmed = confirmScenarioCombatRound({
    encounter,
    deathEnding: scenario.deathEnding,
    state,
    command,
    lang: scenario.language,
    companion: presentCompanion(scenario, state),
  });
  if (!confirmed.ok) {
    if (confirmed.reason === 'stale-round') return { ok: false, reason: 'stale-round' };
    if (confirmed.reason === 'ended') return { ok: false, reason: 'ended' };
    return { ok: false, reason: 'illegal-action' };
  }
  return applyCombatResultV3(scenario, confirmed.state, confirmed.journal, confirmed.end);
}

function applyCombatSurrenderV3(
  scenario: Scenario,
  state: PlaythroughV3,
  round: number,
): ApplyScenarioActionResult {
  const encounter = activeEncounter(scenario, state);
  if (encounter === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  const surrendered = surrenderScenarioCombat({
    encounter,
    deathEnding: scenario.deathEnding,
    state,
    round,
    lang: scenario.language,
    companion: presentCompanion(scenario, state),
  });
  if (!surrendered.ok) {
    if (surrendered.reason === 'stale-round') return { ok: false, reason: 'stale-round' };
    if (surrendered.reason === 'ended') return { ok: false, reason: 'ended' };
    return { ok: false, reason: 'illegal-action' };
  }
  return applyCombatResultV3(scenario, surrendered.state, surrendered.journal, surrendered.end);
}

/**
 * After a Combat Round: while the fight continues the Round entries stand on
 * their own; when the fight ended, the routed Outcome is applied like a
 * Choice Outcome (Effects, transitions, the death Ending), so Health, wounds
 * and the Journal update once, at the end.
 */
function applyCombatResultV3(
  scenario: Scenario,
  state: PlaythroughV3,
  journal: Array<ScenarioCombatJournalEntry | ScenarioCompanionJournalEntry>,
  end: { outcome: CompiledOutcome | 'death' } | undefined,
): ApplyScenarioActionResult {
  if (end === undefined) {
    return { ok: true, state, journal };
  }
  if (end.outcome === 'death') {
    // LOSS ends on the Scenario's death Ending: the Combat layer set Health
    // to 0 and ended the Playthrough; the Ending entry is the journey
    // layer's job (combat-contract.md, journal projection).
    const ended: PlaythroughV3 = { ...state, activeSceneId: null };
    return {
      ok: true,
      state: ended,
      journal: [...journal, endingEntryV3(scenario, ended, scenario.deathEnding)],
      end,
    };
  }
  const applied = applyScenarioOutcomeV3(scenario, state, end.outcome);
  if (!applied.ok) {
    // A routed Outcome that cannot apply (e.g. a victory that chains into a
    // defeated Encounter) rejects the turn: the Combat already ended, so the
    // Round entries stand and the position is unchanged beyond the Combat.
    return { ok: false, reason: 'illegal-action' };
  }
  return { ok: true, state: applied.state, journal: [...journal, ...applied.journal], end };
}

/** Visible Connections from the current Location, in authored order. */
function visibleConnectionsV3(
  scenario: Scenario,
  state: PlaythroughV3,
): import('../content/model').CompiledConnection[] {
  const current =
    scenario.locationsById[state.currentLocationId] ?? scenario.startLocation;
  return current.connections.filter(
    (connection) =>
      connection.when === undefined || evaluateCondition(scenario, state, connection.when),
  );
}

/**
 * Entering a Location (at start, by Travel, or by `move`, including to the
 * current Location): set the Location, mark visited, then activate the first
 * eligible on-enter Scene, if any.
 */
function enterLocationV3(
  scenario: Scenario,
  state: PlaythroughV3,
  locationId: string,
): { state: PlaythroughV3; journal: ScenarioJournalEntry[] } {
  const location = scenario.locationsById[locationId] ?? scenario.startLocation;
  const entered: PlaythroughV3 = {
    ...state,
    currentLocationId: location.id,
    activeSceneId: null,
    visited: pushUnique(state.visited, location.id),
  };
  const onEnter = findOnEnterSceneV3(scenario, entered, location.id);
  if (onEnter === undefined) {
    return { state: entered, journal: [] };
  }
  return activateSceneV3(scenario, entered, onEnter.id);
}

/** First eligible on-enter Scene of a Location, in listed order. */
function findOnEnterSceneV3(
  scenario: Scenario,
  state: PlaythroughV3,
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
 * Activating a Scene (on entering, by Open Scene, or by `next`): a `next` to
 * a non-repeatable Scene that has already fired is a no-op back to the
 * Location view. Otherwise the Scene joins the fired set at activation and
 * the position becomes Scene active, with the Scene narration appended to
 * the Journal.
 */
function activateSceneV3(
  scenario: Scenario,
  state: PlaythroughV3,
  sceneId: string,
): { state: PlaythroughV3; journal: ScenarioJournalEntry[] } {
  const scene = scenario.scenesById[sceneId];
  if (scene === undefined) {
    return { state: { ...state, activeSceneId: null }, journal: [] };
  }
  if (!scene.repeatable && state.firedScenes.includes(scene.id)) {
    return { state: { ...state, activeSceneId: null }, journal: [] };
  }
  const activated: PlaythroughV3 = {
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

function applyTravelV3(
  scenario: Scenario,
  state: PlaythroughV3,
  targetLocationId: string,
): ApplyScenarioActionResult {
  // Travel is legal only in the Location view: no active Scene.
  if (state.activeSceneId != null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const leadsThere = visibleConnectionsV3(scenario, state).some(
    (connection) => connection.to.id === targetLocationId,
  );
  const target = scenario.locationsById[targetLocationId];
  if (!leadsThere || target === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  const stepped: PlaythroughV3 = { ...state, step: state.step + 1 };
  const entered = enterLocationV3(scenario, stepped, target.id);
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
function isTakenOnceV3(state: PlaythroughV3, sceneId: string, choiceId: string): boolean {
  return state.takenOnceChoices.some(
    (taken) => taken.sceneId === sceneId && taken.choiceId === choiceId,
  );
}

/**
 * Visible Choices of a Scene: a Choice whose `when` does not hold is hidden,
 * and a taken `once` Choice stays hidden, including in a repeatable Scene.
 */
export function visibleChoicesV3(
  scenario: Scenario,
  state: PlaythroughV3,
  scene: CompiledScene,
): CompiledChoice[] {
  return scene.choices.filter(
    (choice) =>
      (choice.when === undefined || evaluateCondition(scenario, state, choice.when)) &&
      !(choice.once && isTakenOnceV3(state, scene.id, choice.id)),
  );
}

/**
 * The Ending Journal entry appended whenever the Playthrough ends, by `end`
 * or by death: kind, title and closing narration, stored as presented.
 */
function endingEntryV3(
  scenario: Scenario,
  state: PlaythroughV3,
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
 * Rolling a Test: 2d6 plus the effective Attribute against the Difficulty
 * target. No automatic success or failure, no criticals. Nothing from the
 * client reaches this roll: the Action carries no seed and no die value.
 */
function resolveTestV3(
  scenario: Scenario,
  state: PlaythroughV3,
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

function applyChooseV3(
  scenario: Scenario,
  state: PlaythroughV3,
  choiceId: string,
  rng: Rng,
): ApplyScenarioActionResult {
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
  if (choice.once && isTakenOnceV3(state, scene.id, choice.id)) {
    return { ok: false, reason: 'illegal-action' };
  }
  // Resolve the Test first: the roll picks the Outcome. Endings and lethal
  // damage are handled by applyScenarioOutcomeV3.
  const test = choice.test === undefined ? undefined : resolveTestV3(scenario, state, choice.test, rng);
  const outcome = test?.outcome ?? choice.outcome;

  let next: PlaythroughV3 = state;
  if (choice.once) {
    next = {
      ...next,
      takenOnceChoices: [...next.takenOnceChoices, { sceneId: scene.id, choiceId: choice.id }],
    };
  }
  const journal: ScenarioJournalEntry[] = [
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
    const applied = applyScenarioOutcomeV3(scenario, next, outcome);
    if (!applied.ok) {
      return applied;
    }
    next = applied.state;
    journal.push(...applied.journal);
  }
  return { ok: true, state: { ...next, step: state.step + 1 }, journal };
}

/** The implicit Continue: a domain action applying the empty Outcome. */
function applyContinueV3(scenario: Scenario, state: PlaythroughV3): ApplyScenarioActionResult {
  if (state.activeSceneId == null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const scene = scenario.scenesById[state.activeSceneId];
  if (scene === undefined) {
    return { ok: false, reason: 'illegal-action' };
  }
  // Legal only when no Choice is visible; otherwise it would skip the Scene.
  if (visibleChoicesV3(scenario, state, scene).length > 0) {
    return { ok: false, reason: 'illegal-action' };
  }
  return {
    ok: true,
    state: { ...state, activeSceneId: null, step: state.step + 1 },
    journal: [],
  };
}

/** On-demand Scenes on offer in the Location view, in listed order. */
export type OnDemandSceneViewV3 = {
  sceneId: string;
  title: string;
};

export function onDemandScenesV3(scenario: Scenario, state: PlaythroughV3): OnDemandSceneViewV3[] {
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

function applyOpenSceneV3(
  scenario: Scenario,
  state: PlaythroughV3,
  sceneId: string,
): ApplyScenarioActionResult {
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
  const activated = activateSceneV3(scenario, state, sceneId);
  return {
    ok: true,
    state: { ...activated.state, step: state.step + 1 },
    journal: activated.journal,
  };
}

/**
 * Applying an Outcome: narration, then Effects in authored order, then the
 * transition (`next`, `move`, `start-combat`, `end`, or none: back to the
 * Location view without re-evaluating on-enter Scenes).
 *
 * A `damage` Effect that brings Health to 0 or below sets Health to 0,
 * skips the remaining Effects and the transition, and ends the Playthrough
 * on the Scenario's death Ending. An `end` transition sets the status to
 * `ended(endingId)` and appends the Ending entry. Either way the position
 * becomes Ended: no active Scene. A `start-combat` transition starts a Combat
 * from the Encounter's authored arrangement (G2); starting an already
 * defeated Encounter rejects the turn, so a finished fight cannot restart by
 * repeating the Choice (G5: there is no Combat restart in a Playthrough).
 */
export function applyScenarioOutcomeV3(
  scenario: Scenario,
  state: PlaythroughV3,
  outcome: CompiledOutcome,
): ApplyScenarioActionResult {
  let next = state;
  const journal: ScenarioJournalEntry[] = [];
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
      journal.push(endingEntryV3(scenario, next, scenario.deathEnding));
      return { ok: true, state: next, journal };
    }
    const applied = applyEffectV3(scenario, next, effect);
    next = applied.state;
    journal.push(...applied.entries);
  }
  if (outcome.end !== undefined) {
    next = {
      ...next,
      status: 'ended',
      endingId: outcome.end.id,
      activeSceneId: null,
    };
    journal.push(endingEntryV3(scenario, next, outcome.end));
    return { ok: true, state: next, journal };
  }
  if (outcome.startCombat !== undefined) {
    const started = startScenarioCombat({
      encounter: outcome.startCombat,
      state: next,
      lang: scenario.language,
      companion: presentCompanion(scenario, next),
    });
    if (!started.ok) {
      return { ok: false, reason: 'illegal-action' };
    }
    return { ok: true, state: started.state, journal: [...journal, ...started.journal] };
  }
  if (outcome.next !== undefined) {
    const activated = activateSceneV3(scenario, next, outcome.next.id);
    next = activated.state;
    journal.push(...activated.journal);
  } else if (outcome.move !== undefined) {
    const entered = enterLocationV3(scenario, next, outcome.move.id);
    next = entered.state;
    journal.push(...entered.journal);
  } else {
    next = { ...next, activeSceneId: null };
  }
  return { ok: true, state: next, journal };
}

/**
 * One Effect and its Journal entries. Content-driven `heal` at full Health is
 * a silent no-op: no state change, no entry. Companion join/leave take effect
 * on the v3 document (G4): joining a lost Companion — or the present one, or
 * an unknown id — is a silent no-op; joining while another Companion is
 * present replaces them, recording a departure (`companion-left` for the old
 * Companion, never a loss) plus the arrival; leaving clears the presence with
 * a departure entry and never records a loss, so a departed Companion may
 * join again. Only a Companion at 0 HP when a Combat ends is lost (handled in
 * `src/engine/scenario-combat.ts`).
 */
function applyEffectV3(
  scenario: Scenario,
  state: PlaythroughV3,
  effect: CompiledEffect,
): { state: PlaythroughV3; entries: ScenarioJournalEntry[] } {
  if ('set-flag' in effect) {
    const flag = effect['set-flag'];
    // Flag changes are the author's internal memory and are never presented,
    // neither on screen nor in the Journal.
    return { state: { ...state, flags: pushUnique(state.flags, flag) }, entries: [] };
  }
  if ('clear-flag' in effect) {
    const flag = effect['clear-flag'];
    return {
      state: { ...state, flags: state.flags.filter((held) => held !== flag) },
      entries: [],
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
      entries: [
        {
          type: 'state-change',
          lang: scenario.language,
          change: 'item-received',
          itemId: item,
          name,
          amount: quantity,
        },
      ],
    };
  }
  if ('take-item' in effect) {
    const { item, quantity } = effect['take-item'];
    const name = scenario.itemsById[item]?.name ?? item;
    const held = state.inventory[item] ?? 0;
    const actual = Math.min(quantity, held);
    if (actual <= 0) {
      // Nothing held: no state change, so no Journal entry either.
      return { state, entries: [] };
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
        Object.keys(equipment) as Array<keyof PlaythroughV3['equipment']>
      ).find((candidate) => equipment[candidate] === item);
      if (slot !== undefined) {
        equipment = { ...equipment };
        delete equipment[slot];
      }
    }
    return {
      state: { ...state, inventory, equipment },
      entries: [
        {
          type: 'state-change',
          lang: scenario.language,
          change: 'item-lost',
          itemId: item,
          name,
          amount: actual,
        },
      ],
    };
  }
  if ('heal' in effect) {
    const restored =
      Math.min(PLAYTHROUGH_MAX_HEALTH, state.character.health + effect.heal) -
      state.character.health;
    if (restored <= 0) {
      return { state, entries: [] };
    }
    return {
      state: {
        ...state,
        character: { ...state.character, health: state.character.health + restored },
      },
      entries: [
        {
          type: 'state-change',
          lang: scenario.language,
          change: 'health-gained',
          amount: restored,
        },
      ],
    };
  }
  if ('damage' in effect) {
    // Non-lethal here: lethal damage ends on the death Ending in
    // applyScenarioOutcomeV3 before reaching this branch.
    return {
      state: {
        ...state,
        character: { ...state.character, health: state.character.health - effect.damage },
      },
      entries: [
        {
          type: 'state-change',
          lang: scenario.language,
          change: 'health-lost',
          amount: effect.damage,
        },
      ],
    };
  }
  if ('companion-join' in effect) {
    const id = effect['companion-join'];
    const incoming = scenario.companionsById[id];
    if (incoming === undefined) {
      // Unknown Companion: silent no-op, leaving any presence untouched.
      return { state, entries: [] };
    }
    if (state.lostCompanions.includes(id)) {
      // Lost in Combat: the loss is permanent, so rejoining is a no-op.
      return { state, entries: [] };
    }
    const presentId = state.companion?.id;
    if (presentId === id) {
      // Already travelling together: nothing changes.
      return { state, entries: [] };
    }
    const joined: ScenarioCompanionJournalEntry = {
      type: 'companion-joined',
      lang: scenario.language,
      companionId: id,
      name: incoming.name,
    };
    if (presentId === undefined) {
      return { state: { ...state, companion: { id } }, entries: [joined] };
    }
    // A replacement records a departure, never a loss: the old Companion may
    // join again later.
    const departed = scenario.companionsById[presentId];
    const left: ScenarioCompanionJournalEntry = {
      type: 'companion-left',
      lang: scenario.language,
      companionId: presentId,
      name: departed?.name ?? presentId,
    };
    return { state: { ...state, companion: { id } }, entries: [left, joined] };
  }
  if ('companion-leave' in effect) {
    const presentId = state.companion?.id;
    if (presentId === undefined) {
      return { state, entries: [] };
    }
    // Leaving is a departure, never a loss: `lostCompanions` is untouched, so
    // the departed Companion may join again.
    const departed = scenario.companionsById[presentId];
    const left: ScenarioCompanionJournalEntry = {
      type: 'companion-left',
      lang: scenario.language,
      companionId: presentId,
      name: departed?.name ?? presentId,
    };
    return { state: { ...state, companion: null }, entries: [left] };
  }
  if (!('reveal' in effect)) {
    return { state, entries: [] };
  }
  const target = effect.reveal;
  const name = scenario.locationsById[target]?.name ?? target;
  if (state.visited.includes(target)) {
    // Revealing a visited Location is a spec no-op: no state change, no entry.
    return { state, entries: [] };
  }
  return {
    state: { ...state, revealed: pushUnique(state.revealed, target) },
    entries: [
      {
        type: 'state-change',
        lang: scenario.language,
        change: 'revealed',
        itemId: target,
        name,
      },
    ],
  };
}

/**
 * Equip: legal in the Location view and while a Scene is active, never while
 * a Combat runs (G5). The held Equipment moves into its slot, replacing the
 * occupant. Advances `step` with an inventory entry. Equipment gives
 * Attribute bonuses only: nothing about the card changes Combat.
 */
function applyEquipV3(
  scenario: Scenario,
  state: PlaythroughV3,
  itemId: string,
): ApplyScenarioActionResult {
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
 * Unequip: legal in the Location view and while a Scene is active, never
 * while a Combat runs (G5). Empties an occupied slot. Advances `step` with
 * an inventory entry.
 */
function applyUnequipV3(
  scenario: Scenario,
  state: PlaythroughV3,
  slot: string,
): ApplyScenarioActionResult {
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
 * Use item: a held Consumable below full Health heals (capped at 40) and
 * consumes one copy; the position is unchanged. Usable outside Combat only
 * (G5): in Combat, and at full Health, the use is rejected — nothing is
 * consumed and `step` does not advance.
 */
function applyUseItemV3(
  scenario: Scenario,
  state: PlaythroughV3,
  itemId: string,
): ApplyScenarioActionResult {
  const item = scenario.itemsById[itemId];
  if (item === undefined || item.kind !== 'consumable') {
    return { ok: false, reason: 'illegal-action' };
  }
  if ((state.inventory[itemId] ?? 0) < 1) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (state.character.health >= PLAYTHROUGH_MAX_HEALTH) {
    return { ok: false, reason: 'illegal-action' };
  }
  const restored =
    Math.min(PLAYTHROUGH_MAX_HEALTH, state.character.health + item.heal) -
    state.character.health;
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
 * The current position on a v3 Playthrough: the Ending once ended, the
 * active Scene with its visible Choices (while a Scene is active there are
 * no exits), otherwise the Location view with its exits and on-demand
 * Scenes on offer. Every view carries the Location map derived from the
 * stored `visited`/`revealed` sets. While a Combat runs the caller renders
 * the command panel instead of this position.
 */
export function viewScenarioV3(
  scenario: Scenario,
  state: PlaythroughV3,
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
        choices: visibleChoicesV3(scenario, state, scene).map((choice) => ({
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
    exits: visibleConnectionsV3(scenario, state).map((connection) => ({
      targetLocationId: connection.to.id,
      label: connection.label,
    })),
    onDemandScenes: onDemandScenesV3(scenario, state),
    map: deriveMap(scenario, state, options),
  };
}
