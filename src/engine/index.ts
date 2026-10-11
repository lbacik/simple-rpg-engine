// Pure game rules: startPlaythrough, applyAction (later tickets), view.
//
// This module must stay free of Next.js, React and persistence imports
// (enforced by the no-restricted-imports rule in eslint.config.mjs).

import type { Scenario } from '../content/index';
import { STATE_VERSION, type PlaythroughState } from './state';

export type { PlaythroughState } from './state';
export { PlaythroughStateSchema, STATE_VERSION, parsePlaythroughState } from './state';

/**
 * Injected random source. Mirrors `crypto.randomInt(min, max)`: `min`
 * inclusive, `max` exclusive. Production rolls each die with
 * `randomInt(1, 7)`; tests pass a deterministic function.
 */
export type Rng = (min: number, max: number) => number;

/** New Journal entries produced by one engine step. Stored text as presented. */
export type NewJournalEntry = {
  type: 'intro';
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

/** Derived projection the UI renders. Later tickets add Scene, Combat, map. */
export type GameView =
  | {
      kind: 'location';
      locationId: string;
      name: string;
      description: string;
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
  };
}
