// The mechanical reference check (docs/spec/architecture.md, content
// compatibility; ADR 0001): when a Playthrough's pinned content hash differs
// from the loaded Scenario's, play continues only when every content id in the
// stored state still exists with the right type and the stored state still
// satisfies the invariants that depend on content. A changed trigger or
// Location membership of the active Scene does not fail the check.
//
// Pure and synchronous: the caller compares the hashes, derives
// incompatibility on read (never stored), and updates the pin on a pass.

import { isEquipmentSlot } from '../engine/inventory';
import type { PlaythroughState } from '../engine/state';
import type { Scenario } from './model';

export type CompatibilityResult = { ok: true } | { ok: false; reasons: string[] };

/**
 * Run the reference check of `state` against the current `scenario`.
 * Returns `{ ok: true }` when play may continue, otherwise every failed
 * reference and invariant in `reasons`.
 */
export function checkPlaythroughCompatibility(
  scenario: Scenario,
  state: PlaythroughState,
): CompatibilityResult {
  const reasons: string[] = [];
  const fail = (reason: string): void => {
    reasons.push(reason);
  };
  const missing = (table: Record<string, unknown>, id: string, label: string): void => {
    if (table[id] === undefined) fail(`unknown ${label} "${id}"`);
  };

  if (state.scenarioId !== scenario.id) {
    fail(`scenario "${state.scenarioId}" is not the loaded scenario "${scenario.id}"`);
  }

  // Locations: the current Location and the exploration sets.
  missing(scenario.locationsById, state.currentLocationId, 'location');
  for (const id of state.visited) {
    missing(scenario.locationsById, id, 'location');
  }
  for (const id of state.revealed) {
    missing(scenario.locationsById, id, 'location');
  }

  // Scenes: the active Scene and the fired set. The active Scene's trigger
  // and Location membership are deliberately not checked.
  if (state.activeSceneId != null) {
    missing(scenario.scenesById, state.activeSceneId, 'scene');
  }
  for (const id of state.firedScenes) {
    missing(scenario.scenesById, id, 'scene');
  }

  // Taken `once` Choices are (Scene id, Choice id) pairs.
  for (const taken of state.takenOnceChoices) {
    const scene = scenario.scenesById[taken.sceneId];
    if (scene === undefined) {
      fail(`unknown scene "${taken.sceneId}"`);
    } else if (!scene.choices.some((choice) => choice.id === taken.choiceId)) {
      fail(`unknown choice "${taken.choiceId}" in scene "${taken.sceneId}"`);
    }
  }

  // Encounters: every record key, plus the active Combat and its invariant.
  for (const id of Object.keys(state.encounterDamage)) {
    missing(scenario.encountersById, id, 'encounter');
  }
  if (state.activeCombat != null) {
    const encounter = scenario.encountersById[state.activeCombat.encounterId];
    if (encounter === undefined) {
      fail(`unknown encounter "${state.activeCombat.encounterId}"`);
    } else {
      const taken = state.encounterDamage[state.activeCombat.encounterId] ?? 0;
      // The active Combat still has a surviving Participant while at least one
      // participant's maximum Health exceeds the Damage taken. (Single
      // participant: exactly the old invariant.) Per-participant wounds and
      // the full membership rules arrive with the state-versions package.
      const survivors = encounter.participants.filter(
        (participant) => participant.enemy.health > taken,
      );
      if (survivors.length === 0) {
        const highestHealth = Math.max(
          ...encounter.participants.map((participant) => participant.enemy.health),
        );
        fail(
          `encounter "${encounter.id}" no longer has more maximum Health (${highestHealth}) than the Damage taken (${taken})`,
        );
      }
    }
  }

  // Items: the held quantities and the equipped pointers. Equipment slots
  // are fixed vocabulary, not content ids, but a stored slot still has to be
  // one of them.
  for (const id of Object.keys(state.inventory)) {
    missing(scenario.itemsById, id, 'item');
  }
  for (const [slot, itemId] of Object.entries(state.equipment)) {
    if (itemId === undefined) continue;
    if (!isEquipmentSlot(slot)) {
      fail(`unknown slot "${slot}"`);
      continue;
    }
    const item = scenario.itemsById[itemId];
    if (item === undefined) {
      fail(`unknown item "${itemId}"`);
    } else if (item.kind !== 'equipment' || item.slot !== slot) {
      fail(`item "${itemId}" is no longer equipment of slot "${slot}"`);
    }
  }

  // Flags: every true Flag must still be declared by the manifest.
  const flags = new Set(scenario.flags);
  for (const flag of state.flags) {
    if (!flags.has(flag)) fail(`unknown flag "${flag}"`);
  }

  // Character Template and Ending.
  missing(scenario.templatesById, state.character.templateId, 'character template');
  if (state.endingId !== undefined) {
    missing(scenario.endingsById, state.endingId, 'ending');
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
