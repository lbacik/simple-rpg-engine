// Combat inside a Playthrough on Combat MVP 1.0 rules (P6a, Scenario
// adapter; #183, ADR 0010; contract docs/spec/combat-contract.md).
//
// Pure and framework-free like the journey engine: an Encounter starts a
// Combat from the authored arrangement with the Character's current Health,
// Rounds resolve through the shared core, and the result routes to the right
// Outcome with Health, wounds and the Journal written once at the end. No
// Companion fights in this slice (P6b owns it): the hero fights alone.
//
// While a Combat runs, `h01.hp` in the Combat state is authoritative;
// `character.health` and `encounters` wounds are written once, when the
// Combat ends, never per Round. Only Health, wounds and Companion presence
// cross the Combat boundary.

import { buildInitialCombatState } from '../content/combatBuilder';
import type { CompiledEncounter, CompiledOutcome } from '../content/model';
import { PROFILES, startCombat, submitRound, surrender } from './combat/index';
import type { CombatEvent, CombatState, CombatResult, RoundCommand } from './combat/index';
import type { PlaythroughV3 } from './state-v3';

/** Journal entries the Scenario Combat lifecycle produces (G6). */
export type ScenarioCombatJournalEntry =
  | {
      type: 'combat-start';
      lang: string;
      encounterId: string;
      /** The Encounter's opening narration, as presented. */
      text: string;
      /** The Participants in authored order, with names as presented. */
      participants: { ref: string; name: string }[];
    }
  | {
      type: 'combat-round';
      lang: string;
      /** Combat Journal entries are versioned: readers render `version: 3`. */
      version: 3;
      encounterId: string;
      round: number;
      /** The core's typed events for that Round: ids and numbers, never text. */
      events: CombatEvent[];
      /** Actor-to-`ref` mapping: hero `h01` maps to null, enemies to participant ids. */
      actors: Record<string, string | null>;
      /** Display names by actor id, resolved at write time from Scenario content. */
      names: Record<string, string>;
    }
  | {
      type: 'combat-end';
      lang: string;
      encounterId: string;
      howEnded: 'win' | 'surrender' | 'draw';
    };

export type ScenarioCombatResult =
  | {
      ok: true;
      state: PlaythroughV3;
      journal: ScenarioCombatJournalEntry[];
      /**
       * The routed Outcome when the Combat ended on this turn: the
       * Encounter's `victory`, `surrender` or `draw` Outcome, or `'death'`
       * for `LOSS` (the journey layer ends on the Scenario's death Ending).
       * Absent while the fight continues.
       */
      end?: { outcome: CompiledOutcome | 'death' };
    }
  | { ok: false; reason: 'stale-step' | 'stale-round' | 'illegal-action' | 'ended' };

function notStarted(state: PlaythroughV3): boolean {
  return state.activeCombat === null;
}

/** An Encounter is defeated when every Participant's wounds reach its maximum (#183 Q6). */
function isDefeatedByRecord(
  encounter: CompiledEncounter,
  wounds: Record<string, number>,
): boolean {
  return encounter.participants.every(
    (participant) => (wounds[participant.id] ?? 0) >= PROFILES[participant.enemy.profile].maxHp,
  );
}

/**
 * Start a Combat from an Encounter's authored arrangement (#183 Q1): the hero
 * enters at the Character's current Health, survivors only, every fighter
 * fresh (full stamina, Round-1 cooldowns, no Prepare, authored groups and
 * engagements). Appends the `combat-start` entry. Never advances `step`: the
 * surrounding turn (the Choice that led to the Encounter) owns the clock.
 */
export function startScenarioCombat(args: {
  encounter: CompiledEncounter;
  state: PlaythroughV3;
  lang: string;
}): ScenarioCombatResult {
  const { encounter, state, lang } = args;
  if (state.status !== 'active') {
    return { ok: false, reason: 'ended' };
  }
  if (!notStarted(state)) {
    return { ok: false, reason: 'illegal-action' };
  }
  const wounds = state.encounters[encounter.id] ?? {};
  if (isDefeatedByRecord(encounter, wounds)) {
    return { ok: false, reason: 'illegal-action' };
  }
  const initial = buildInitialCombatState(encounter, {
    heroHp: state.character.health,
    wounds,
    companion: null,
  });
  const started = startCombat(initial);
  if (!started.ok) {
    return { ok: false, reason: 'illegal-action' };
  }
  const record: Record<string, number> = { ...(state.encounters[encounter.id] ?? {}) };
  for (const participant of encounter.participants) {
    if (record[participant.id] === undefined) {
      record[participant.id] = 0;
    }
  }
  return {
    ok: true,
    state: {
      ...state,
      activeCombat: { encounterId: encounter.id, combat: started.state },
      encounters: { ...state.encounters, [encounter.id]: record },
    },
    journal: [
      {
        type: 'combat-start',
        lang,
        encounterId: encounter.id,
        text: encounter.text,
        participants: encounter.participants.map((participant) => ({
          ref: participant.id,
          name: participant.enemy.name,
        })),
      },
    ],
  };
}

/** Display names by actor id, resolved at write time from Scenario content. */
function actorNames(
  encounter: CompiledEncounter,
  state: PlaythroughV3,
  combat: CombatState,
): Record<string, string> {
  const byRef = new Map(encounter.participants.map((participant) => [participant.id, participant.enemy.name]));
  const names: Record<string, string> = {};
  for (const actor of combat.actors) {
    names[actor.id] =
      actor.role === 'hero'
        ? state.character.name
        : (byRef.get(actor.ref ?? '') ?? actor.id);
  }
  return names;
}

/**
 * Resolve one Round in the command panel: the shared core validates and
 * resolves, the document clock advances one turn, and the Round's typed
 * events plus the actor-to-`ref` mapping append as one `combat-round`
 * (`version: 3`) entry. `character.health` and wounds wait for the end of the
 * fight. A stale round or an illegal command changes nothing.
 */
export function confirmScenarioCombatRound(args: {
  encounter: CompiledEncounter;
  state: PlaythroughV3;
  command: RoundCommand;
  lang: string;
}): ScenarioCombatResult {
  const { encounter, state, command, lang } = args;
  if (state.status !== 'active') {
    return { ok: false, reason: 'ended' };
  }
  const active = state.activeCombat;
  if (active === null) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (command.round !== active.combat.round) {
    return { ok: false, reason: 'stale-round' };
  }
  const submitted = submitRound(active.combat, command);
  if (!submitted.ok) {
    return { ok: false, reason: 'illegal-action' };
  }
  const roundEntry: ScenarioCombatJournalEntry = {
    type: 'combat-round',
    lang,
    version: 3,
    encounterId: active.encounterId,
    round: active.combat.round,
    events: submitted.events,
    actors: Object.fromEntries(submitted.state.actors.map((actor) => [actor.id, actor.ref])),
    names: actorNames(encounter, state, submitted.state),
  };
  return {
    ok: true,
    state: {
      ...state,
      step: state.step + 1,
      activeCombat: { encounterId: active.encounterId, combat: submitted.state },
    },
    journal: [roundEntry],
  };
}

/** Yield the Combat; the Encounter stays undefeated (routing lives here next). */
export function surrenderScenarioCombat(_args: {
  encounter: CompiledEncounter;
  state: PlaythroughV3;
  round: number;
  lang: string;
}): ScenarioCombatResult {
  throw new Error('not implemented');
}
