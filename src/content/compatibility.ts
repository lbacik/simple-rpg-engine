// The mechanical reference check (docs/spec/architecture.md, content
// compatibility; ADR 0001): when a Playthrough's pinned content hash differs
// from the loaded Scenario's, play continues only when every content id in the
// stored state still exists with the right type and the stored state still
// satisfies the invariants that depend on content. A changed trigger or
// Location membership of the active Scene does not fail the check.
//
// Participant rules (tactical-combat-handoff package "State versions and
// compatibility", issue #125; docs/spec/architecture.md, content
// compatibility; docs/spec/playthrough-state.md, stored-and-derived-state):
// every participant in an Encounter record still exists in that Encounter; a
// participant the record does not list (added to the content later) is allowed
// only while the Encounter is neither defeated by its record nor in the active
// Combat; during an active Combat the participants with action state are
// exactly the Encounter's currently surviving participants, are all in this
// Combat's starting membership, and appear exactly once in its current Round
// tie-break order, while every starting and tie-break id still exists.
// Subject to those invariants, participant order, `startRange`, an Enemy's
// Attributes, Damage, Reach and Behaviour, and a participant's Enemy kind may
// change without failing the check: the announced Round keeps its saved
// tie-break order and statistics stay derived from the current content.
//
// Pure and synchronous: the caller compares the hashes, derives
// incompatibility on read (never stored), and updates the pin on a pass.

import { isEquipmentSlot } from '../engine/inventory';
import type { PlaythroughState } from '../engine/state';
import type { Scenario } from './model';

export type CompatibilityResult = { ok: true } | { ok: false; reasons: string[] };

/**
 * Whether a stored active Combat has the legacy v1 shape (`{ encounterId,
 * range, round }` with none of the v2 membership fields). Like the v1-shaped
 * Encounter records above, such documents reach this check only from
 * pre-migration tests (production v1 documents fail v2 validation first and
 * migrate with the state-versions package, issue #124): only the Encounter
 * reference is checked, never the membership invariants.
 */
function isLegacyCombatShape(combat: PlaythroughState['activeCombat']): boolean {
  const shape = combat as unknown as {
    startedParticipants?: unknown;
    roundParticipantOrder?: unknown;
    participants?: unknown;
  };
  return (
    shape !== null &&
    shape !== undefined &&
    shape.startedParticipants === undefined &&
    shape.roundParticipantOrder === undefined &&
    shape.participants === undefined
  );
}

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

  // Encounters: every record key, every participant the record lists, and any
  // participant the content added since the record was created. The wounds
  // record is keyed by Encounter id and then participant id (state v2). The
  // `?? {}` fallbacks only keep legacy v1-shaped documents passed by
  // pre-migration tests from crashing here; v1 documents never reach this
  // check in production (they fail v2 validation first) and migrate with the
  // state-versions package (issue #124).
  for (const [encounterId, record] of Object.entries(state.encounters ?? {})) {
    const encounter = scenario.encountersById[encounterId];
    if (encounter === undefined) {
      fail(`unknown encounter "${encounterId}"`);
      continue;
    }
    const contentIds = new Set(encounter.participants.map((participant) => participant.id));
    for (const participantId of Object.keys(record)) {
      if (!contentIds.has(participantId)) {
        fail(`unknown participant "${participantId}" in encounter "${encounterId}"`);
      }
    }
    // A participant the record does not list was added to the content later.
    // It joins at full Health on the next start, so it is allowed only while
    // the Encounter is neither defeated by its record nor in the active
    // Combat: adding to a defeated Encounter, or to one being fought, would
    // orphan or invent Combat state.
    const added = encounter.participants.filter((participant) => record[participant.id] === undefined);
    if (added.length > 0) {
      const recordedIds = Object.keys(record);
      const defeatedByRecord =
        recordedIds.length > 0 &&
        recordedIds.every((participantId) => {
          const participant = encounter.participants.find((entry) => entry.id === participantId);
          if (participant === undefined) return false;
          return (record[participantId] ?? 0) >= participant.enemy.health;
        });
      const names = added.map((participant) => participant.id).join('", "');
      if (defeatedByRecord) {
        fail(`encounter "${encounterId}" is defeated by its record and gains participant "${names}"`);
      } else if (state.activeCombat?.encounterId === encounterId) {
        fail(
          `encounter "${encounterId}" gains participant "${names}" during its active Combat`,
        );
      }
    }
  }
  if (state.activeCombat != null) {
    const combat = state.activeCombat;
    const encounter = scenario.encountersById[combat.encounterId];
    if (encounter === undefined) {
      fail(`unknown encounter "${combat.encounterId}"`);
    } else if (!isLegacyCombatShape(combat)) {
      // A partially written v2 shape (a membership field missing) fails
      // closed: the coerced empties trip the membership checks below instead
      // of throwing on `undefined`. Production reads never reach this branch
      // (the strict v2 schema requires every field), so this only hardens the
      // function's verdict contract for direct callers.
      const startedParticipants: string[] = Array.isArray(combat.startedParticipants)
        ? combat.startedParticipants
        : [];
      const roundOrder: string[] = Array.isArray(combat.roundParticipantOrder)
        ? combat.roundParticipantOrder
        : [];
      const actionState = combat.participants ?? {};
      const byId = new Map(encounter.participants.map((participant) => [participant.id, participant]));
      for (const participantId of startedParticipants) {
        if (!byId.has(participantId)) {
          fail(
            `unknown participant "${participantId}" in the starting membership of encounter "${encounter.id}"`,
          );
        }
      }
      for (const participantId of roundOrder) {
        if (!byId.has(participantId)) {
          fail(
            `unknown participant "${participantId}" in the Round tie-break order of encounter "${encounter.id}"`,
          );
        }
      }
      if (startedParticipants.length === 0) {
        fail(`encounter "${encounter.id}" has no starting membership`);
      }
      if (roundOrder.length === 0) {
        fail(`encounter "${encounter.id}" has no Round tie-break order`);
      }
      if (new Set(startedParticipants).size !== startedParticipants.length) {
        fail(`encounter "${encounter.id}" repeats a participant in its starting membership`);
      }
      if (new Set(roundOrder).size !== roundOrder.length) {
        fail(`encounter "${encounter.id}" repeats a participant in its Round tie-break order`);
      }
      const wounds = state.encounters?.[combat.encounterId] ?? {};
      // Surviving participants under the current content: a participant
      // without a record entry (added later) counts at full Health here, so
      // the exact-match check below also rejects additions to an active
      // Combat. Reviving a defeated participant without action state, or
      // lowering a fighting participant's maximum Health to its Damage taken
      // or below, moves it across this boundary and fails the same way.
      const survivors = new Set(
        encounter.participants
          .filter((participant) => participant.enemy.health > (wounds[participant.id] ?? 0))
          .map((participant) => participant.id),
      );
      const active = Object.keys(actionState);
      const activeSet = new Set(active);
      for (const participantId of active) {
        const participant = byId.get(participantId);
        if (participant === undefined) {
          fail(
            `unknown participant "${participantId}" with active Combat state in encounter "${encounter.id}"`,
          );
        } else if (!(participant.enemy.health > (wounds[participantId] ?? 0))) {
          fail(
            `participant "${participantId}" of encounter "${encounter.id}" no longer has more maximum Health (${participant.enemy.health}) than the Damage taken (${wounds[participantId] ?? 0})`,
          );
        }
      }
      const missingState = [...survivors].filter((participantId) => !activeSet.has(participantId)).sort();
      const extraState = active.filter((participantId) => !survivors.has(participantId)).sort();
      if (missingState.length > 0 || extraState.length > 0) {
        fail(
          `the active Combat state of encounter "${encounter.id}" no longer matches its surviving participants`,
        );
      }
      const startedSet = new Set(startedParticipants);
      for (const participantId of active) {
        if (!startedSet.has(participantId)) {
          fail(
            `participant "${participantId}" with active Combat state is not in the starting membership of encounter "${encounter.id}"`,
          );
        }
      }
      const orderCounts = new Map<string, number>();
      for (const participantId of roundOrder) {
        orderCounts.set(participantId, (orderCounts.get(participantId) ?? 0) + 1);
      }
      for (const participantId of active) {
        if ((orderCounts.get(participantId) ?? 0) !== 1) {
          fail(
            `participant "${participantId}" with active Combat state is not exactly once in the Round tie-break order of encounter "${encounter.id}"`,
          );
        }
      }
      for (const participantId of roundOrder) {
        if (!startedSet.has(participantId)) {
          fail(
            `participant "${participantId}" in the Round tie-break order is not in the starting membership of encounter "${encounter.id}"`,
          );
        }
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
