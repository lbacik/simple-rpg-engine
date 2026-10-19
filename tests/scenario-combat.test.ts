// P6a (Scenario adapter): Combat inside a Playthrough on the v3 document.
//
// Tested through the public functions of `src/engine/scenario-combat.ts`:
// starting a Combat from the authored arrangement, fighting Rounds in the
// command panel, and routing the result to the right Outcome with Health,
// wounds and the Journal written once at the end (#183 lifecycle, G2/G3).

import { describe, expect, it } from 'vitest';

import type {
  CompiledEncounter,
  CompiledEnding,
} from '../src/content/model';
import { PROFILES, planRound } from '../src/engine/combat/index';
import {
  confirmScenarioCombatRound,
  startScenarioCombat,
  surrenderScenarioCombat,
} from '../src/engine/scenario-combat';
import { PLAYTHROUGH_SCHEMA_VERSION } from '../src/engine/state-v3';
import type { PlaythroughV3 } from '../src/engine/state-v3';

const LANG = 'en';

const deathEnding: CompiledEnding = {
  id: 'death',
  kind: 'defeat',
  title: 'Death',
  text: 'The road ends here.',
};

function makeEncounter(): CompiledEncounter {
  return {
    id: 'wolf-fight',
    participants: [
      {
        id: 'alpha',
        enemy: { id: 'grey-wolf', name: 'Alpha wolf', profile: 'raider' },
        startRange: 'melee',
        phaseOffset: 0,
        power: 0,
      },
      {
        id: 'beta',
        enemy: { id: 'grey-wolf', name: 'Beta wolf', profile: 'raider' },
        startRange: 'near',
        phaseOffset: 0,
        power: 0,
      },
    ],
    text: 'Two wolves circle out of the dark.',
    victory: {
      text: 'The wolves fall silent.',
      effects: [],
    },
    surrender: {
      text: 'You back away with empty hands.',
      effects: [],
    },
    draw: {
      text: 'Neither side gives ground.',
      effects: [],
    },
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
      health: 27,
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

describe('starting a Scenario Combat', () => {
  it('enters at the current Health with full stamina, Round-1 cooldowns and no Prepare', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({ encounter, state: makeState(), lang: LANG });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.state.activeCombat?.encounterId).toBe('wolf-fight');
    const combat = started.state.activeCombat?.combat;
    expect(combat?.phase).toBe('CHOOSE');
    expect(combat?.round).toBe(1);
    const hero = combat?.actors.find((actor) => actor.id === 'h01');
    // G2: the hero's Combat HP is the Character's current Health (max 40).
    expect(hero?.hp).toBe(27);
    // G2: every Combat starts with full stamina, cooldowns at Round 1, no Prepare.
    expect(hero?.stamina).toBe(PROFILES['hero'].maxStamina);
    expect(hero?.readyRound).toBeNull();
    expect(hero?.availableRound).toEqual({});
    expect(hero?.stance).toBe('balanced');
    // Arrangement: melee participant engaged in g0, near participant in g0.
    expect(combat?.engagements).toEqual([['e01', 'h01']]);
    const enemies = combat?.actors.filter((actor) => actor.role === 'enemy') ?? [];
    expect(enemies.map((enemy) => enemy.id)).toEqual(['e01', 'e02']);
    expect(enemies.map((enemy) => enemy.ref)).toEqual(['alpha', 'beta']);
    expect(started.state.step).toBe(3);
  });

  it('appends one combat-start entry with the Participants and the opening narration', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({ encounter, state: makeState(), lang: LANG });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.journal).toEqual([
      {
        type: 'combat-start',
        lang: LANG,
        encounterId: 'wolf-fight',
        text: 'Two wolves circle out of the dark.',
        participants: [
          { ref: 'alpha', name: 'Alpha wolf' },
          { ref: 'beta', name: 'Beta wolf' },
        ],
      },
    ]);
  });
});

function makeSoloEncounter(): CompiledEncounter {
  return {
    id: 'solo-fight',
    participants: [
      {
        id: 'solo',
        enemy: { id: 'grey-wolf', name: 'Lone wolf', profile: 'raider' },
        startRange: 'melee',
        phaseOffset: 0,
        power: 0,
      },
    ],
    text: 'A lone wolf bars the path.',
    victory: {
      text: 'The wolf falls silent.',
      effects: [],
    },
    surrender: {
      text: 'You back away with empty hands.',
      effects: [],
    },
    draw: {
      text: 'Neither side gives ground.',
      effects: [],
    },
  };
}

describe('confirming a Combat Round', () => {
  it('resolves through the core and appends one combat-round entry, leaving Health and wounds for the end', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({ encounter, state: makeState(), lang: LANG });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const confirmed = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: started.state,
      command: { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
      lang: LANG,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    // One accepted command advances `step` by one.
    expect(confirmed.state.step).toBe(4);
    // G2: h01.hp is authoritative during Combat; the campaign copies wait.
    expect(confirmed.state.character.health).toBe(27);
    expect(confirmed.state.encounters['wolf-fight']).toEqual({ alpha: 0, beta: 0 });
    const combat = confirmed.state.activeCombat?.combat;
    expect(combat?.phase).toBe('CHOOSE');
    expect(combat?.round).toBe(2);
    expect(confirmed.journal).toHaveLength(1);
    const entry = confirmed.journal[0];
    expect(entry?.type).toBe('combat-round');
    if (entry?.type !== 'combat-round') return;
    expect(entry.version).toBe(3);
    expect(entry.encounterId).toBe('wolf-fight');
    expect(entry.round).toBe(1);
    expect(entry.events.length).toBeGreaterThan(0);
    expect(entry.actors).toEqual({ h01: null, e01: 'alpha', e02: 'beta' });
    expect(entry.names).toEqual({ h01: 'Robin', e01: 'Alpha wolf', e02: 'Beta wolf' });
  });

  it('rejects a stale round and an illegal command without changing state', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({ encounter, state: makeState(), lang: LANG });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const before = started.state;
    const stale = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: before,
      command: { round: 2, stance: 'balanced', actionId: 'brace', targetId: null },
      lang: LANG,
    });
    expect(stale).toEqual({ ok: false, reason: 'stale-round' });
    // The hero has no shot in the base set: illegal, no state change, no cost.
    const illegal = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: before,
      command: { round: 1, stance: 'balanced', actionId: 'shot', targetId: 'e02' },
      lang: LANG,
    });
    expect(illegal.ok).toBe(false);
    if (illegal.ok) return;
    expect(illegal.reason).toBe('illegal-action');
    expect(before.activeCombat?.combat).toBe(started.state.activeCombat?.combat);
  });
});

describe('routing the end of a Combat', () => {
  it('WIN writes Health and wounds once and routes to the victory Outcome', () => {
    const encounter = makeSoloEncounter();
    // Attrition: the wolf already carries 13 wounds from an earlier fight.
    const started = startScenarioCombat({
      encounter,
      state: makeState({ encounters: { 'solo-fight': { solo: 13 } } }),
      lang: LANG,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.state.activeCombat?.combat.actors.find((a) => a.id === 'e01')?.hp).toBe(1);
    const confirmed = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: started.state,
      command: { round: 1, stance: 'aggressive', actionId: 'strike', targetId: 'e01' },
      lang: LANG,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    // G2: Health leaves the Combat at the final value, written once, at the end.
    expect(confirmed.state.character.health).toBe(27);
    expect(confirmed.state.encounters['solo-fight']).toEqual({ solo: 14 });
    expect(confirmed.state.activeCombat).toBeNull();
    expect(confirmed.state.step).toBe(4);
    // G3: WIN routes to the Encounter's victory Outcome.
    expect(confirmed.end?.outcome).toBe(encounter.victory);
    const types = confirmed.journal.map((entry) => entry.type);
    expect(types).toEqual(['combat-round', 'combat-end']);
    const end = confirmed.journal[1];
    expect(end?.type).toBe('combat-end');
    if (end?.type !== 'combat-end') return;
    expect(end.howEnded).toBe('win');
  });

  it('surrender leaves the Encounter undefeated and routes to the surrender Outcome', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({ encounter, state: makeState(), lang: LANG });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const braced = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: started.state,
      command: { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
      lang: LANG,
    });
    expect(braced.ok).toBe(true);
    if (!braced.ok) return;
    const heroHp = braced.state.activeCombat?.combat.actors.find((a) => a.id === 'h01')?.hp;
    expect(heroHp).toBeLessThan(27);
    expect(heroHp).toBeGreaterThan(0);
    const surrendered = surrenderScenarioCombat({
      encounter,
      deathEnding,
      state: braced.state,
      round: 2,
      lang: LANG,
    });
    expect(surrendered.ok).toBe(true);
    if (!surrendered.ok) return;
    // G2/G3: Health at the final value; wounds kept; the Encounter not defeated.
    expect(surrendered.state.character.health).toBe(heroHp);
    expect(surrendered.state.activeCombat).toBeNull();
    expect(surrendered.end?.outcome).toBe(encounter.surrender);
    const wounds = surrendered.state.encounters['wolf-fight'] ?? {};
    expect(Object.values(wounds).some((taken) => taken < PROFILES['raider'].maxHp)).toBe(true);
    expect(surrendered.journal).toEqual([
      { type: 'combat-end', lang: LANG, encounterId: 'wolf-fight', howEnded: 'surrender' },
    ]);
  });

  it('DRAW_LIMIT routes to the draw Outcome with Health and wounds written back', () => {
    const encounter = makeSoloEncounter();
    const started = startScenarioCombat({ encounter, state: makeState(), lang: LANG });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    // Thirty full Rounds pass with no result: fast-forward to a planned
    // round-30 state the same way the core's own suites do (PLAN shape through
    // planRound, so the frozen plans verify).
    const round1 = started.state.activeCombat!.combat;
    const round30 = planRound({
      ...round1,
      phase: 'PLAN',
      round: 30,
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
    });
    const lastRound = {
      ...started.state,
      activeCombat: {
        encounterId: 'solo-fight',
        combat: round30,
      },
    };
    const confirmed = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: lastRound,
      command: { round: 30, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
      lang: LANG,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.state.activeCombat).toBeNull();
    expect(confirmed.end?.outcome).toBe(encounter.draw);
    const end = confirmed.journal.find((entry) => entry.type === 'combat-end');
    expect(end?.type).toBe('combat-end');
    if (end?.type !== 'combat-end') return;
    expect(end.howEnded).toBe('draw');
  });

  it('LOSS ends the Playthrough on the death Ending with no combat-end entry', () => {
    const encounter = makeEncounter();
    const started = startScenarioCombat({
      encounter,
      state: makeState({ character: { templateId: 'hunter', name: 'Robin', baseAttributes: { might: 1, agility: 1, wits: 1, presence: 1 }, health: 5 } }),
      lang: LANG,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const confirmed = confirmScenarioCombatRound({
      encounter,
      deathEnding,
      state: started.state,
      command: { round: 1, stance: 'balanced', actionId: 'brace', targetId: 'h01' },
      lang: LANG,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    // G3: LOSS routes to the Scenario's deathEnding; the hero's fate is final.
    expect(confirmed.state.character.health).toBe(0);
    expect(confirmed.state.status).toBe('ended');
    expect(confirmed.state.endingId).toBe('death');
    expect(confirmed.state.activeCombat).toBeNull();
    expect(confirmed.end?.outcome).toBe('death');
    expect(confirmed.journal.some((entry) => entry.type === 'combat-end')).toBe(false);
  });
});
