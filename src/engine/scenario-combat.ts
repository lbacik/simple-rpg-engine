// Combat inside a Playthrough on Combat MVP 1.0 rules (P6 Scenario adapter;
// #183, ADR 0010; contract docs/spec/combat-contract.md).
//
// Pure and framework-free like the journey engine: an Encounter starts a
// Combat from the authored arrangement with the Character's current Health,
// Rounds resolve through the shared core, and the result routes to the right
// Outcome with Health, wounds and the Journal written once at the end. The
// present Companion (P6b) fights automatically at full HP in every Combat; a
// Companion at 0 HP when the fight ends is lost for the rest of the
// Playthrough, and the fight's routing continues.
//
// While a Combat runs, the hero's Combat Health (`h01`) in the Combat state is
// authoritative; `character.health` and `encounters` wounds are written once,
// when the Combat ends, never per Round. Only Health, wounds and Companion
// presence cross the Combat boundary.

import { buildInitialCombatState } from '../content/combatBuilder';
import type {
  CompiledCompanion,
  CompiledEncounter,
  CompiledEnding,
  CompiledOutcome,
} from '../content/model';
import { PROFILES, startCombat, submitRound, surrender } from './combat/index';
import type { CombatEvent, CombatState, RoundCommand } from './combat/index';
import { substituteName } from './narration';
import { PLAYTHROUGH_MAX_HEALTH, type PlaythroughV3 } from './state-v3';

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
      /** The Companion fighting alongside, when one is present. */
      companion?: { ref: string; name: string };
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

/**
 * Companion presence entries (G4/G6): joining and leaving through Effects,
 * and permanent loss in Combat. Each stores the Companion name as presented
 * plus the Companion id as event data, and renders from the catalogue on
 * read — never from Scenario content.
 */
export type ScenarioCompanionJournalEntry =
  | { type: 'companion-joined'; lang: string; companionId: string; name: string }
  | { type: 'companion-left'; lang: string; companionId: string; name: string }
  | { type: 'companion-lost'; lang: string; companionId: string; name: string };

export type ScenarioCombatResult =
  | {
      ok: true;
      state: PlaythroughV3;
      journal: Array<ScenarioCombatJournalEntry | ScenarioCompanionJournalEntry>;
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
 * engagements). The present Companion, if any, enters at full HP and stamina
 * in the hero's group with its definition id as `ref` (#183 Q4). Appends the
 * `combat-start` entry, naming the Companion when one fights. Never advances
 * `step`: the surrounding `step` (the Choice that led to the Encounter)
 * advances it.
 */
export function startScenarioCombat(args: {
  encounter: CompiledEncounter;
  state: PlaythroughV3;
  lang: string;
  /** The present Companion's definition, if one fights. */
  companion?: CompiledCompanion | null;
}): ScenarioCombatResult {
  const { encounter, state, lang } = args;
  const companion = args.companion ?? null;
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
    companion,
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
        text: substituteName(encounter.text, state.character.name),
        participants: encounter.participants.map((participant) => ({
          ref: participant.id,
          name: participant.enemy.name,
        })),
        ...(companion === null
          ? {}
          : { companion: { ref: companion.id, name: companion.name } }),
      },
    ],
  };
}

/** Display names by actor id, resolved at write time from Scenario content. */
function actorNames(
  encounter: CompiledEncounter,
  state: PlaythroughV3,
  combat: CombatState,
  companion: CompiledCompanion | null,
): Record<string, string> {
  const byRef = new Map(encounter.participants.map((participant) => [participant.id, participant.enemy.name]));
  const names: Record<string, string> = {};
  for (const actor of combat.actors) {
    if (actor.role === 'hero') {
      names[actor.id] = state.character.name;
    } else if (actor.role === 'companion') {
      names[actor.id] =
        companion !== null && (actor.ref === null || actor.ref === companion.id)
          ? companion.name
          : (actor.ref ?? actor.id);
    } else {
      names[actor.id] = byRef.get(actor.ref ?? '') ?? actor.id;
    }
  }
  return names;
}

/**
 * Resolve one Round in the command panel: the shared core validates and
 * resolves, `step` advances by one, and the Round's typed events plus the
 * actor-to-`ref` mapping append as one `combat-round` (`version: 3`) entry.
 * `character.health` and wounds wait for the end of the fight. A stale round
 * or an illegal command changes nothing. When the Round finishes the fight,
 * Health and wounds are written back once and the result routes to the right
 * Outcome (G3): `WIN` to `victory`, `DRAW_LIMIT` to `draw`, `LOSS` to the
 * Scenario's death Ending (no `combat-end`: the ending entry is the journey
 * layer's job).
 */
export function confirmScenarioCombatRound(args: {
  encounter: CompiledEncounter;
  deathEnding: CompiledEnding;
  state: PlaythroughV3;
  command: RoundCommand;
  lang: string;
  /** The present Companion's definition, for write-time names and loss. */
  companion?: CompiledCompanion | null;
}): ScenarioCombatResult {
  const { encounter, deathEnding, state, command, lang } = args;
  const companion = args.companion ?? null;
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
    names: actorNames(encounter, state, submitted.state, companion),
  };
  if (submitted.state.result === null) {
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
  return routeFinishedCombat({
    encounter,
    deathEnding,
    state,
    combat: submitted.state,
    encounterId: active.encounterId,
    lang,
    companion,
    extraJournal: [roundEntry],
  });
}

/**
 * Damage taken per participant at the end of a fight: each surviving enemy's
 * wounds are its profile maximum minus its remaining Combat Health; fighters
 * already gone at the start keep their recorded wounds.
 */
function woundsAtEnd(
  encounter: CompiledEncounter,
  state: PlaythroughV3,
  combat: CombatState,
): Record<string, number> {
  const prior = state.encounters[encounter.id] ?? {};
  const record: Record<string, number> = {};
  for (const participant of encounter.participants) {
    const maxHealth = PROFILES[participant.enemy.profile].maxHp;
    const fighter = combat.actors.find((actor) => actor.ref === participant.id);
    record[participant.id] =
      fighter === undefined ? (prior[participant.id] ?? 0) : maxHealth - fighter.hp;
  }
  return record;
}

/** The hero's Combat Health, within the campaign bounds. */
function heroHealthAtEnd(combat: CombatState): number {
  const hero = combat.actors.find((actor) => actor.role === 'hero');
  return Math.max(0, Math.min(PLAYTHROUGH_MAX_HEALTH, hero?.hp ?? 0));
}

/**
 * Write Health and wounds back once and route a finished Combat to the right
 * Outcome (G2/G3). `WIN` appends `combat-end` (`win`) and routes to the
 * Encounter's `victory`; `DRAW_LIMIT` appends `combat-end` (`draw`) and routes
 * to `draw`; `LOSS_SURRENDER` appends `combat-end` (`surrender`) and routes to
 * `surrender` (the Encounter stays undefeated either way); `LOSS` ends the
 * Playthrough on the Scenario's death Ending with no `combat-end` entry.
 * A Companion at 0 HP is lost permanently on any result (#183 Q4): removed
 * from the Playthrough, recorded in `lostCompanions`, and announced with a
 * `companion-lost` entry before the routed Outcome lands. The fight itself
 * already continued past the fall, as in the MVP.
 */
function routeFinishedCombat(args: {
  encounter: CompiledEncounter;
  deathEnding: CompiledEnding;
  state: PlaythroughV3;
  combat: CombatState;
  encounterId: string;
  lang: string;
  companion: CompiledCompanion | null;
  extraJournal: ScenarioCombatJournalEntry[];
}): ScenarioCombatResult {
  const { encounter, deathEnding, state, combat, encounterId, lang, companion, extraJournal } = args;
  const result = combat.result;
  if (result === null) {
    return { ok: false, reason: 'illegal-action' };
  }
  const wounds = woundsAtEnd(encounter, state, combat);
  const fallen = combat.actors.find((actor) => actor.role === 'companion' && actor.hp <= 0);
  const lostCompanionId =
    fallen?.ref !== undefined &&
    fallen.ref !== null &&
    state.companion?.id === fallen.ref
      ? fallen.ref
      : null;
  const journal: Array<ScenarioCombatJournalEntry | ScenarioCompanionJournalEntry> = [...extraJournal];
  let next: PlaythroughV3 = state;
  if (lostCompanionId !== null) {
    const lost = next.lostCompanions.includes(lostCompanionId)
      ? next.lostCompanions
      : [...next.lostCompanions, lostCompanionId];
    next = { ...next, companion: null, lostCompanions: lost };
    journal.push({
      type: 'companion-lost',
      lang,
      companionId: lostCompanionId,
      name:
        companion !== null && companion.id === lostCompanionId ? companion.name : lostCompanionId,
    });
  }
  if (result === 'LOSS') {
    return {
      ok: true,
      state: {
        ...next,
        step: next.step + 1,
        status: 'ended',
        endingId: deathEnding.id,
        character: { ...next.character, health: 0 },
        encounters: { ...next.encounters, [encounter.id]: wounds },
        activeCombat: null,
      },
      journal,
      end: { outcome: 'death' },
    };
  }
  const routed: { outcome: CompiledOutcome; howEnded: 'win' | 'surrender' | 'draw' } =
    result === 'WIN'
      ? { outcome: encounter.victory ?? encounter.draw, howEnded: 'win' }
      : result === 'DRAW_LIMIT'
        ? { outcome: encounter.draw, howEnded: 'draw' }
        : { outcome: encounter.surrender, howEnded: 'surrender' };
  return {
    ok: true,
    state: {
      ...next,
      step: next.step + 1,
      character: { ...next.character, health: heroHealthAtEnd(combat) },
      encounters: { ...next.encounters, [encounter.id]: wounds },
      activeCombat: null,
    },
    journal: [
      ...journal,
      { type: 'combat-end', lang, encounterId, howEnded: routed.howEnded },
    ],
    end: { outcome: routed.outcome },
  };
}

/**
 * Yield the Combat: the shared core ends the fight as `LOSS_SURRENDER`, `step`
 * advances by one, and Health and wounds are written back once. The Encounter
 * stays undefeated and the result routes to its `surrender` Outcome. A stale
 * round or surrender with no fight running changes nothing.
 */
export function surrenderScenarioCombat(args: {
  encounter: CompiledEncounter;
  deathEnding: CompiledEnding;
  state: PlaythroughV3;
  round: number;
  lang: string;
  /** The present Companion's definition, for write-time names and loss. */
  companion?: CompiledCompanion | null;
}): ScenarioCombatResult {
  const { encounter, deathEnding, state, round, lang } = args;
  const companion = args.companion ?? null;
  if (state.status !== 'active') {
    return { ok: false, reason: 'ended' };
  }
  const active = state.activeCombat;
  if (active === null) {
    return { ok: false, reason: 'illegal-action' };
  }
  if (round !== active.combat.round) {
    return { ok: false, reason: 'stale-round' };
  }
  const yielded = surrender(active.combat);
  if (!yielded.ok) {
    return { ok: false, reason: 'illegal-action' };
  }
  return routeFinishedCombat({
    encounter,
    deathEnding,
    state,
    combat: yielded.state,
    encounterId: active.encounterId,
    lang,
    companion,
    extraJournal: [],
  });
}
