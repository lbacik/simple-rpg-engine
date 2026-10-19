// P6b (Scenario adapter): the Playthrough-level Companion (G4).
//
// - `companion-join` sets the presence and appends `companion-joined`; a
//   replacement records a departure (`companion-left` for the old Companion,
//   never a loss); joining a lost Companion — or the present one, or an
//   unknown id — is a silent no-op.
// - `companion-leave` clears the presence and appends `companion-left`; it
//   never records a loss, so a departed Companion may join again.
// - The Companion enters every Combat at full HP and stamina in the hero's
//   group; its `ref` is the Companion id and round names resolve it.
// - A Companion at 0 HP when a Combat ends is lost permanently: removed,
//   recorded in `lostCompanions` (so `companionLost` holds) with a
//   `companion-lost` entry, and the fight's routing continues.
// - `{companion}` / `{companionLost}` Conditions read the v3 presence/loss.

import { describe, expect, it } from 'vitest';

import type { Scenario } from '../src/content/index';
import type {
  CompiledCompanion,
  CompiledEncounter,
  CompiledEnding,
  CompiledOutcome,
} from '../src/content/model';
import { evaluateCondition } from '../src/engine/conditions';
import type { RoundCommand } from '../src/engine/combat/index';
import {
  confirmScenarioCombatRound,
  startScenarioCombat,
  surrenderScenarioCombat,
} from '../src/engine/scenario-combat';
import { applyScenarioOutcomeV3 } from '../src/engine/scenario-play';
import { PLAYTHROUGH_SCHEMA_VERSION } from '../src/engine/state-v3';
import type { PlaythroughV3 } from '../src/engine/state-v3';

const LANG = 'en';

const deathEnding: CompiledEnding = {
  id: 'death',
  kind: 'defeat',
  title: 'Death',
  text: 'The road ends here.',
};

const astrid: CompiledCompanion = {
  id: 'astrid',
  name: 'Astrid the Skald',
  profile: 'party-sentinel',
};

const birgit: CompiledCompanion = {
  id: 'birgit',
  name: 'Birgit the Keen',
  profile: 'party-archer',
};

function makeEncounter(): CompiledEncounter {
  return {
    id: 'lone-fight',
    participants: [
      {
        id: 'grey',
        enemy: { id: 'grey-wolf', name: 'Grey Wolf', profile: 'raider' },
        startRange: 'melee',
        phaseOffset: 0,
        // Power 8: the wolf's hits (every fourth round, redirected by Astrid's
        // Cover) fell her in round 9 (24 -> 16 -> 8 -> 0) while the bracing
        // hero stays untouched — the shape a loss test needs.
        power: 8,
      },
    ],
    text: 'A lone wolf bars the path.',
    victory: { text: 'The wolf falls silent.', effects: [] },
    surrender: { text: 'You back away.', effects: [] },
    draw: { text: 'Neither side gives ground.', effects: [] },
  };
}

function makeState(overrides: Partial<PlaythroughV3> = {}): PlaythroughV3 {
  return {
    schemaVersion: PLAYTHROUGH_SCHEMA_VERSION,
    scenarioId: 'test-scenario',
    scenarioVersion: '1.0.0',
    contentHash: 'hash',
    status: 'active',
    step: 3,
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 1, agility: 1, wits: 1, presence: 1 },
      health: 40,
    },
    inventory: {},
    equipment: {},
    companion: null,
    lostCompanions: [],
    currentLocationId: 'glade',
    activeSceneId: null,
    activeCombat: null,
    visited: ['glade'],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounters: {},
    ...overrides,
  };
}

/** A minimal Scenario carrying only what the Companion paths read. */
function makeScenario(): Scenario {
  return {
    language: LANG,
    companionsById: { astrid, birgit },
  } as unknown as Scenario;
}

function joinOutcome(id: string): CompiledOutcome {
  return { effects: [{ 'companion-join': id }] };
}

const leaveOutcome: CompiledOutcome = { effects: [{ 'companion-leave': null }] };

describe('companion-join / companion-leave Effects', () => {
  it('join sets the presence and appends companion-joined with the name as presented', () => {
    const applied = applyScenarioOutcomeV3(makeScenario(), makeState(), joinOutcome('astrid'));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.companion).toEqual({ id: 'astrid' });
    expect(applied.state.lostCompanions).toEqual([]);
    expect(applied.journal).toEqual([
      {
        type: 'companion-joined',
        lang: LANG,
        companionId: 'astrid',
        name: 'Astrid the Skald',
      },
    ]);
  });

  it('replacing the Companion records a departure, never a loss', () => {
    const scenario = makeScenario();
    const first = applyScenarioOutcomeV3(scenario, makeState(), joinOutcome('astrid'));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyScenarioOutcomeV3(scenario, first.state, joinOutcome('birgit'));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.companion).toEqual({ id: 'birgit' });
    expect(second.state.lostCompanions).toEqual([]);
    expect(second.journal).toEqual([
      { type: 'companion-left', lang: LANG, companionId: 'astrid', name: 'Astrid the Skald' },
      { type: 'companion-joined', lang: LANG, companionId: 'birgit', name: 'Birgit the Keen' },
    ]);
  });

  it('joining a lost Companion is a silent no-op', () => {
    const state = makeState({ lostCompanions: ['astrid'] });
    const applied = applyScenarioOutcomeV3(makeScenario(), state, joinOutcome('astrid'));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.companion).toBeNull();
    expect(applied.state.lostCompanions).toEqual(['astrid']);
    expect(applied.journal).toEqual([]);
  });

  it('joining the present Companion or an unknown id is a silent no-op', () => {
    const scenario = makeScenario();
    const present = applyScenarioOutcomeV3(
      scenario,
      makeState({ companion: { id: 'astrid' } }),
      joinOutcome('astrid'),
    );
    expect(present.ok).toBe(true);
    if (!present.ok) return;
    expect(present.state.companion).toEqual({ id: 'astrid' });
    expect(present.journal).toEqual([]);

    const unknown = applyScenarioOutcomeV3(scenario, makeState(), joinOutcome('nobody'));
    expect(unknown.ok).toBe(true);
    if (!unknown.ok) return;
    expect(unknown.state.companion).toBeNull();
    expect(unknown.journal).toEqual([]);
  });

  it('leave clears the presence with a departure entry but records no loss', () => {
    const applied = applyScenarioOutcomeV3(
      makeScenario(),
      makeState({ companion: { id: 'astrid' } }),
      leaveOutcome,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.companion).toBeNull();
    expect(applied.state.lostCompanions).toEqual([]);
    expect(applied.journal).toEqual([
      {
        type: 'companion-left',
        lang: LANG,
        companionId: 'astrid',
        name: 'Astrid the Skald',
      },
    ]);
  });

  it('leave with no Companion present is a silent no-op', () => {
    const applied = applyScenarioOutcomeV3(makeScenario(), makeState(), leaveOutcome);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.companion).toBeNull();
    expect(applied.journal).toEqual([]);
  });

  it('a departed Companion may join again; a lost one may not', () => {
    const scenario = makeScenario();
    const left = applyScenarioOutcomeV3(
      scenario,
      makeState({ companion: { id: 'astrid' } }),
      leaveOutcome,
    );
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    const rejoined = applyScenarioOutcomeV3(scenario, left.state, joinOutcome('astrid'));
    expect(rejoined.ok).toBe(true);
    if (!rejoined.ok) return;
    expect(rejoined.state.companion).toEqual({ id: 'astrid' });
    expect(rejoined.journal).toEqual([
      {
        type: 'companion-joined',
        lang: LANG,
        companionId: 'astrid',
        name: 'Astrid the Skald',
      },
    ]);
  });
});

describe('the Companion in Combat', () => {
  it('enters every Combat at full HP and stamina in the hero group with its ref', () => {
    const started = startScenarioCombat({
      encounter: makeEncounter(),
      state: makeState({ companion: { id: 'astrid' }, character: { ...makeState().character, health: 27 } }),
      lang: LANG,
      companion: astrid,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const combat = started.state.activeCombat?.combat;
    const fellow = combat?.actors.find((actor) => actor.id === 'c01');
    expect(fellow?.ref).toBe('astrid');
    expect(fellow?.hp).toBe(24);
    expect(fellow?.stamina).toBe(8);
    expect(fellow?.groupId).toBe('g0');
    // The hero still enters at the Character's current Health.
    expect(combat?.actors.find((actor) => actor.id === 'h01')?.hp).toBe(27);
  });

  it('without a Companion the fight starts as before, with no companion key', () => {
    const started = startScenarioCombat({ encounter: makeEncounter(), state: makeState(), lang: LANG });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.state.activeCombat?.combat.actors.some((actor) => actor.id === 'c01')).toBe(false);
    expect(started.journal).toHaveLength(1);
    expect('companion' in (started.journal[0] as Record<string, unknown>)).toBe(false);
  });

  it('the combat-start entry carries the Companion, and round names resolve it', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({
      encounter,
      state: makeState({ companion: { id: 'astrid' } }),
      lang: LANG,
      companion: astrid,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const start = started.journal[0];
    expect(start).toMatchObject({
      type: 'combat-start',
      companion: { ref: 'astrid', name: 'Astrid the Skald' },
    });
    const confirmed = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: started.state,
      command: { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
      lang: LANG,
      companion: astrid,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const round = confirmed.journal[0];
    expect(round?.type).toBe('combat-round');
    if (round?.type !== 'combat-round') return;
    expect(round.actors['c01']).toBe('astrid');
    expect(round.names['c01']).toBe('Astrid the Skald');
  });

  it('a Companion at 0 HP when the fight is won is lost permanently, and victory still routes', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({
      encounter,
      state: makeState({ companion: { id: 'astrid' } }),
      lang: LANG,
      companion: astrid,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    // Ten rounds against the lone wolf: the hero strikes first, then
    // braces behind Astrid's Cover until she falls in round 9, and finishes
    // the wolf in round 10.
    let state = started.state;
    const commands: RoundCommand[] = [
      { round: 1, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
      ...Array.from({ length: 8 }, (_, index): RoundCommand => ({
        round: 2 + index,
        stance: 'defensive',
        actionId: 'brace',
        targetId: 'h01',
      })),
      { round: 10, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
    ];
    for (const command of commands) {
      const confirmed = confirmScenarioCombatRound({
        encounter,
        deathEnding,
        state,
        command: { ...command },
        lang: LANG,
        companion: astrid,
      });
      expect(confirmed.ok).toBe(true);
      if (!confirmed.ok) return;
      state = confirmed.state;
      if (state.activeCombat === null) break;
    }
    expect(state.activeCombat).toBeNull();
    expect(state.character.health).toBe(40);
    expect(state.companion).toBeNull();
    expect(state.lostCompanions).toEqual(['astrid']);
    // Victory still routes to the victory Outcome.
    expect(state.encounters['lone-fight']).toEqual({ grey: 14 });
  });

  it('surrender with a fallen Companion still records the loss and routes to surrender', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({
      encounter,
      state: makeState({ companion: { id: 'astrid' } }),
      lang: LANG,
      companion: astrid,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    let state = started.state;
    for (let round = 1; round <= 10; round += 1) {
      const command: RoundCommand =
        round === 1
          ? { round, stance: 'aggressive', actionId: 'strike', targetId: 'e01' }
          : { round, stance: 'defensive', actionId: 'brace', targetId: 'h01' };
      const confirmed = confirmScenarioCombatRound({
        encounter,
        deathEnding,
        state,
        command: { ...command },
        lang: LANG,
        companion: astrid,
      });
      expect(confirmed.ok).toBe(true);
      if (!confirmed.ok) return;
      state = confirmed.state;
    }
    // Astrid fell in round 9; yielding now ends the fight undefeated.
    const surrendered = surrenderScenarioCombat({
      encounter,
      deathEnding,
      state,
      round: 11,
      lang: LANG,
      companion: astrid,
    });
    expect(surrendered.ok).toBe(true);
    if (!surrendered.ok) return;
    expect(surrendered.state.companion).toBeNull();
    expect(surrendered.state.lostCompanions).toEqual(['astrid']);
    expect(surrendered.state.activeCombat).toBeNull();
    const end = surrendered.journal.find((entry) => entry.type === 'combat-end');
    expect(end).toMatchObject({ howEnded: 'surrender' });
    const lost = surrendered.journal.find((entry) => entry.type === 'companion-lost');
    expect(lost).toMatchObject({ companionId: 'astrid', name: 'Astrid the Skald' });
  });

  it('a Companion that survives stays, with no loss entry', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({
      encounter,
      state: makeState({ companion: { id: 'astrid' } }),
      lang: LANG,
      companion: astrid,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const confirmed = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: started.state,
      command: { round: 1, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
      lang: LANG,
      companion: astrid,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    // One strike will not finish a fresh wolf, so surrender to end the fight
    // with Astrid still standing.
    const surrendered = surrenderScenarioCombat({
      encounter,
      deathEnding,
      state: confirmed.state,
      round: 2,
      lang: LANG,
      companion: astrid,
    });
    expect(surrendered.ok).toBe(true);
    if (!surrendered.ok) return;
    expect(surrendered.state.companion).toEqual({ id: 'astrid' });
    expect(surrendered.state.lostCompanions).toEqual([]);
    expect(surrendered.journal.some((entry) => entry.type === 'companion-lost')).toBe(false);
  });
});

describe('companion / companionLost Conditions', () => {
  it('reads presence and loss on v3 documents', () => {
    const scenario = makeScenario();
    const present = makeState({ companion: { id: 'astrid' } });
    expect(
      evaluateCondition(scenario, present, { companion: 'astrid' } as never),
    ).toBe(true);
    expect(
      evaluateCondition(scenario, present, { companion: 'birgit' } as never),
    ).toBe(false);
    expect(
      evaluateCondition(scenario, present, { companionLost: 'astrid' } as never),
    ).toBe(false);
    const lost = makeState({ lostCompanions: ['astrid'] });
    expect(evaluateCondition(scenario, lost, { companionLost: 'astrid' } as never)).toBe(true);
    expect(evaluateCondition(scenario, lost, { companionLost: 'birgit' } as never)).toBe(false);
    expect(evaluateCondition(scenario, lost, { companion: 'astrid' } as never)).toBe(false);
  });
});
