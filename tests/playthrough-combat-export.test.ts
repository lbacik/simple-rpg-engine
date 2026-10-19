// Combat MVP 1.0 P6 G7: the current CombatState exported from a Playthrough
// imports into the Arena, and Playthroughs react correctly when the Scenario
// content they reference changes (#184 Q18).
//
// End-to-end through both adapters: the Scenario adapter starts (and advances)
// a fight, the exported bare CombatState JSON goes through the Arena adapter's
// one strict parse (`prepareArenaImport`), and the imported fight equals the
// exported one. Compatibility: unknown Companion references or a disappeared
// active Participant make the Playthrough read-only; a changed profile,
// `startRange`, `phaseOffset` or `power` applies from the next Combat start.

import { describe, expect, it } from 'vitest';
import { checkPlaythroughCompatibility } from '../src/content/index';
import type { Scenario } from '../src/content/index';
import type { CompiledCompanion, CompiledEncounter } from '../src/content/model';
import { buildInitialCombatState } from '../src/content/combatBuilder';
import {
  listOptions,
  prepareArenaImport,
  PROFILES,
  type CombatState,
  type RoundCommand,
} from '../src/engine/combat/index';
import {
  confirmScenarioCombatRound,
  startScenarioCombat,
} from '../src/engine/scenario-combat';
import { startPlaythroughV3 } from '../src/engine/scenario-play';
import type { PlaythroughV3 } from '../src/engine/state-v3';
import type { Rng } from '../src/engine/index';
import { loadCrossroadsCombatScenario } from './fixtures/crossroads-combat';

const rng: Rng = () => 1;

function freshState(scenario: Scenario): PlaythroughV3 {
  const started = startPlaythroughV3(scenario, 'hunter', 'Robin', rng);
  if (!started.ok) throw new Error('fixture start failed');
  return started.state;
}

function denFight(scenario: Scenario): CompiledEncounter {
  const encounter = scenario.encountersById['den-fight'];
  if (encounter === undefined) throw new Error('fixture lacks den-fight');
  return encounter;
}

/** Start the solo den fight and return the Playthrough with an active Combat. */
function fightingState(scenario: Scenario): PlaythroughV3 {
  const started = startScenarioCombat({
    encounter: denFight(scenario),
    state: freshState(scenario),
    lang: 'en',
  });
  if (!started.ok) throw new Error('fight must start');
  return started.state;
}

/** The export payload: the bare CombatState JSON of the running fight. */
function exportCombat(state: PlaythroughV3): string {
  if (state.activeCombat === null) throw new Error('no active Combat to export');
  return JSON.stringify(state.activeCombat.combat);
}

function firstLegalCommand(combat: CombatState): RoundCommand {
  const option = listOptions(combat, 'balanced').find((entry) => entry.legal);
  if (option === undefined) throw new Error('a legal option (Brace) always exists');
  return {
    round: combat.round,
    stance: 'balanced',
    actionId: option.actionId,
    targetId: option.targetId,
  };
}

describe('G7: Playthrough Combat export imports into the Arena', () => {
  it('a PLAN opening state goes through the Arena import verdict', () => {
    const scenario = loadCrossroadsCombatScenario();
    const initial = buildInitialCombatState(denFight(scenario), { heroHp: 40 });
    expect(initial.phase).toBe('PLAN');
    const imported = prepareArenaImport(JSON.stringify(initial));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.combat.phase).toBe('CHOOSE');
  });

  it('the running CHOOSE fight exports and re-imports unchanged', () => {
    const scenario = loadCrossroadsCombatScenario();
    const state = fightingState(scenario);
    const exported = state.activeCombat?.combat;
    expect(exported?.phase).toBe('CHOOSE');
    const imported = prepareArenaImport(exportCombat(state));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.combat).toEqual(exported);
  });

  it('a mid-fight CHOOSE state after a resolved Round exports and re-imports', () => {
    const scenario = loadCrossroadsCombatScenario();
    const encounter = denFight(scenario);
    const deathEnding = scenario.endingsById['death'];
    if (deathEnding === undefined) throw new Error('fixture lacks a death Ending');
    const fighting = fightingState(scenario);
    const combat = fighting.activeCombat?.combat;
    if (combat === undefined) throw new Error('no active Combat');
    const confirmed = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: fighting,
      command: firstLegalCommand(combat),
      lang: 'en',
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    // The lone wolf may fall in one Round; only a continuing fight exports.
    if (confirmed.state.activeCombat === null) return;
    const imported = prepareArenaImport(exportCombat(confirmed.state));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.combat).toEqual(confirmed.state.activeCombat.combat);
  });
});

describe('Q18: content compatibility of Playthroughs with a running Combat', () => {
  it('a disappeared active Participant makes the Playthrough read-only', () => {
    const scenario = loadCrossroadsCombatScenario();
    const state = fightingState(scenario);
    const encounterId = state.activeCombat?.encounterId;
    expect(encounterId).toBe('den-fight');
    const encounter = denFight(scenario);
    const oldId = encounter.participants[0]?.id;
    expect(typeof oldId).toBe('string');
    // Rename the Participant in the content and align the wounds record with
    // the new content, so only the running Combat still names the old id: the
    // record check passes and the active-Combat check fails it (Q18).
    const renamed: Scenario = {
      ...scenario,
      encountersById: {
        ...scenario.encountersById,
        'den-fight': {
          ...encounter,
          participants: encounter.participants.map((participant, index) =>
            index === 0 ? { ...participant, id: 'renamed-wolf' } : participant,
          ),
        },
      },
    };
    const record: Record<string, number> = {};
    for (const participant of renamed.encountersById['den-fight']!.participants) {
      record[participant.id] = 0;
    }
    const result = checkPlaythroughCompatibility(renamed, {
      ...state,
      encounters: { ...state.encounters, 'den-fight': record },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((reason) => reason.includes(String(oldId)))).toBe(true);
  });

  it('an unknown Companion reference makes the Playthrough read-only', () => {
    const scenario = loadCrossroadsCombatScenario();
    const state = {
      ...freshState(scenario),
      companion: { id: 'renamed-companion' },
    };
    const result = checkPlaythroughCompatibility(scenario, state);
    expect(result.ok).toBe(false);
  });

  it('an unknown lost Companion makes the Playthrough read-only', () => {
    const scenario = loadCrossroadsCombatScenario();
    const state = { ...freshState(scenario), lostCompanions: ['renamed-companion'] };
    const result = checkPlaythroughCompatibility(scenario, state);
    expect(result.ok).toBe(false);
  });

  it('a Companion actor the content no longer defines makes the fight read-only', () => {
    const scenario = loadCrossroadsCombatScenario();
    const astrid: CompiledCompanion = {
      id: 'astrid',
      name: 'Astrid',
      profile: 'party-sentinel',
    };
    const withCompanion = { ...scenario, companionsById: { astrid } };
    const started = startScenarioCombat({
      encounter: denFight(scenario),
      state: { ...freshState(scenario), companion: { id: 'astrid' } },
      lang: 'en',
      companion: astrid,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(
      started.state.activeCombat?.combat.actors.some((actor) => actor.role === 'companion'),
    ).toBe(true);
    // The fixture defines no Companions: the fighting Companion's definition
    // is gone from the content, so the Playthrough is read-only.
    const result = checkPlaythroughCompatibility(scenario, started.state);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((reason) => reason.includes('astrid'))).toBe(true);
    // Against content that still defines her, the same fight stays playable.
    expect(checkPlaythroughCompatibility(withCompanion, started.state)).toEqual({ ok: true });
  });

  it('a changed profile outside Combat revives or defeats without breaking compatibility', () => {
    const scenario = loadCrossroadsCombatScenario();
    const encounter = denFight(scenario);
    const participant = encounter.participants[0];
    if (participant === undefined) throw new Error('fixture lacks a den-fight participant');
    // Wounds at the raider maximum: defeated under the authored profile.
    const state: PlaythroughV3 = {
      ...freshState(scenario),
      encounters: { 'den-fight': { [participant.id]: PROFILES.raider.maxHp } },
    };
    const retuned: Scenario = {
      ...scenario,
      encountersById: {
        ...scenario.encountersById,
        'den-fight': {
          ...encounter,
          participants: [
            {
              ...participant,
              enemy: { ...participant.enemy, profile: 'brute' as const },
            },
            ...encounter.participants.slice(1),
          ],
        },
      },
    };
    // The brute's higher maximum revives the Participant, but the
    // Playthrough stays compatible: only the next Combat start applies it.
    expect(checkPlaythroughCompatibility(retuned, state)).toEqual({ ok: true });
  });

  it('a changed profile, startRange, phaseOffset or power keeps the Playthrough playable', () => {
    const scenario = loadCrossroadsCombatScenario();
    const state = fightingState(scenario);
    const encounter = scenario.encountersById['den-fight'];
    if (encounter === undefined) throw new Error('fixture lacks den-fight');
    const retuned: Scenario = {
      ...scenario,
      encountersById: {
        ...scenario.encountersById,
        'den-fight': {
          ...encounter,
          participants: encounter.participants.map((participant) => ({
            ...participant,
            startRange: 'far' as const,
            phaseOffset: 1,
            power: 2,
            enemy: { ...participant.enemy, profile: 'brute' as const },
          })),
        },
      },
    };
    expect(checkPlaythroughCompatibility(retuned, state)).toEqual({ ok: true });
  });

  it('retuned content applies from the next Combat start', () => {
    const scenario = loadCrossroadsCombatScenario();
    const encounter = scenario.encountersById['den-fight'];
    if (encounter === undefined) throw new Error('fixture lacks den-fight');
    const retunedEncounter = {
      ...encounter,
      participants: encounter.participants.map((participant) => ({
        ...participant,
        startRange: 'far' as const,
        enemy: { ...participant.enemy, profile: 'brute' as const },
      })),
    };
    const started = startScenarioCombat({
      encounter: retunedEncounter,
      state: freshState(scenario),
      lang: 'en',
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const combat = started.state.activeCombat?.combat;
    expect(combat?.phase).toBe('CHOOSE');
    // The retuned arrangement reaches the fight: far enemies share group g1.
    const groups = new Set(combat?.actors.map((actor) => actor.groupId));
    expect(groups.has('g1')).toBe(true);
  });
});
