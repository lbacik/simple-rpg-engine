// The Arena helpers (src/app/lib/arena.ts): enemy picking, the Bestiary
// view-model, the result-screen outcome and the fight URLs. Framework-free,
// so the cases below drive the helpers directly.
//
// Relative imports only: vitest has no `@/` alias.

import { describe, expect, it } from 'vitest';
import type { Scenario } from '../src/content/model';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';
import {
  ARENA_CALL_SCENE_ID,
  ARENA_CHARACTER_NAME,
  ARENA_SCENARIO_ID,
  ARENA_TEMPLATE_ID,
  arenaBestiary,
  arenaEncounterId,
  arenaFightHref,
  arenaOutcomeKind,
  arenaTargetHref,
  parseArenaEnemy,
} from '../src/app/lib/arena';

function arenaScenario(): Scenario {
  return {
    enemies: [
      {
        id: 'dummy',
        name: 'Dummy',
        attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
        health: 6,
        damage: 1,
        reach: 'melee',
        behaviour: 'steady',
      },
      {
        id: 'wolf',
        name: 'Wolf',
        description: 'Teeth.',
        attributes: { might: 2, agility: 1, wits: 1, presence: 0 },
        health: 8,
        damage: 2,
        reach: 'melee',
        behaviour: 'steady',
      },
    ],
    enemiesById: {},
    encounters: [],
    encountersById: {},
    scenesById: {
      [ARENA_CALL_SCENE_ID]: {
        id: ARENA_CALL_SCENE_ID,
        choices: [{ id: 'fight-dummy' }, { id: 'fight-wolf' }],
      },
    },
    endingsById: {
      triumph: { id: 'triumph', kind: 'victory' },
      death: { id: 'death', kind: 'defeat' },
    },
  } as unknown as Scenario;
}

function scenarioWithEncounters(): Scenario {
  const scenario = arenaScenario();
  const encounters = [
    { id: 'fight-dummy', participants: [{ id: 'dummy', enemy: { id: 'dummy' } }] },
    { id: 'fight-wolf', participants: [{ id: 'wolf', enemy: { id: 'wolf' } }] },
  ];
  return {
    ...scenario,
    encounters,
    encountersById: Object.fromEntries(encounters.map((encounter) => [encounter.id, encounter])),
    enemiesById: Object.fromEntries(
      (scenario.enemies as unknown[]).map((enemy) => [(enemy as { id: string }).id, enemy]),
    ),
  } as unknown as Scenario;
}

describe('arenaEncounterId', () => {
  it('names the encounter (and choice) for an enemy', () => {
    expect(arenaEncounterId('dummy')).toBe('fight-dummy');
  });
});

describe('parseArenaEnemy', () => {
  it('accepts a listed enemy whose encounter and call-scene choice exist', () => {
    expect(parseArenaEnemy('dummy', scenarioWithEncounters())).toEqual({
      enemyId: 'dummy',
      encounterId: 'fight-dummy',
      choiceId: 'fight-dummy',
    });
  });

  it('rejects an unknown enemy, an empty value and an enemy without an encounter', () => {
    const scenario = scenarioWithEncounters();
    expect(parseArenaEnemy('bear', scenario)).toBeUndefined();
    expect(parseArenaEnemy('', scenario)).toBeUndefined();
    expect(parseArenaEnemy(undefined, scenario)).toBeUndefined();
    expect(parseArenaEnemy('  ', scenario)).toBeUndefined();
    const bare = arenaScenario();
    expect(parseArenaEnemy('dummy', bare)).toBeUndefined();
  });
});

describe('arenaBestiary', () => {
  it('lists every enemy in scenario order with its fight stats', () => {
    const bestiary = arenaBestiary(scenarioWithEncounters());
    expect(bestiary.map((entry) => entry.id)).toEqual(['dummy', 'wolf']);
    expect(bestiary[0]).toMatchObject({
      id: 'dummy',
      name: 'Dummy',
      health: 6,
      damage: 1,
      reach: 'melee',
      encounterId: 'fight-dummy',
    });
    expect(bestiary[1]).toMatchObject({ id: 'wolf', encounterId: 'fight-wolf' });
  });
});

describe('arenaOutcomeKind', () => {
  const rows = (types: string[]): { type: string; step: number; payload: unknown }[] =>
    types.map((type, index) => ({
      type,
      step: index,
      payload: type === 'combat-end' ? { howEnded: 'escape' } : {},
    }));

  it('is undefined while the combat runs', () => {
    expect(
      arenaOutcomeKind(
        { status: 'active', endingId: undefined, activeCombat: { encounterId: 'x' } },
        scenarioWithEncounters(),
        [],
      ),
    ).toBeUndefined();
  });

  it('reads victory and death from the reached ending', () => {
    const scenario = scenarioWithEncounters();
    expect(
      arenaOutcomeKind(
        { status: 'ended', endingId: 'triumph', activeCombat: null },
        scenario,
        [],
      ),
    ).toBe('victory');
    expect(
      arenaOutcomeKind(
        { status: 'ended', endingId: 'death', activeCombat: null },
        scenario,
        [],
      ),
    ).toBe('death');
  });

  it('reads an escape from the latest combat-end entry', () => {
    expect(
      arenaOutcomeKind(
        { status: 'active', endingId: undefined, activeCombat: null },
        scenarioWithEncounters(),
        rows(['combat-start', 'combat-round', 'combat-end']),
      ),
    ).toBe('escape');
  });

  it('is undefined with no finished combat on record', () => {
    expect(
      arenaOutcomeKind(
        { status: 'active', endingId: undefined, activeCombat: null },
        scenarioWithEncounters(),
        rows(['combat-start']),
      ),
    ).toBeUndefined();
  });
});

describe('arena fight hrefs', () => {
  it('points at the fight and preserves the notice and target', () => {
    expect(arenaFightHref('abc')).toBe('/arena?fight=abc');
    expect(arenaFightHref('abc', { notice: 'stale' })).toBe('/arena?fight=abc&notice=stale');
    expect(arenaTargetHref('abc', 'wolf-a')).toBe('/arena?fight=abc&target=wolf-a');
    expect(arenaTargetHref('abc', 'wolf-a', { notice: 'stale' })).toBe(
      '/arena?fight=abc&notice=stale&target=wolf-a',
    );
  });
});

describe('arena interface text', () => {
  it('names the constants the content agrees on', () => {
    expect(ARENA_SCENARIO_ID).toBe('arena');
    expect(ARENA_TEMPLATE_ID).toBe('arena-fighter');
    expect(ARENA_CALL_SCENE_ID).toBe('choose-foe');
    expect(ARENA_CHARACTER_NAME).toBe('Champion');
  });

  it('is non-empty in both languages', () => {
    const strings: string[] = [
      en.nav.arena,
      pl.nav.arena,
      en.arena.title,
      pl.arena.title,
      en.arena.description,
      pl.arena.description,
      en.arena.bestiary,
      pl.arena.bestiary,
      en.arena.chooseOpponent,
      pl.arena.chooseOpponent,
      en.arena.fighter,
      pl.arena.fighter,
      en.arena.start,
      pl.arena.start,
      en.arena.starting,
      pl.arena.starting,
      en.arena.unknownEnemy,
      pl.arena.unknownEnemy,
      en.arena.result,
      pl.arena.result,
      en.arena.backToArena,
      pl.arena.backToArena,
    ];
    for (const text of strings) {
      expect(text.trim()).not.toBe('');
    }
  });
});
