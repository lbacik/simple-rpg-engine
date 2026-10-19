// Combat MVP 1.0 P5a A1: the Arena Setup builds the §15.2 states with
// positional actor ids (h01, c01, e01–e05) from 1–5 explicit opponents.

import { describe, expect, it } from 'vitest';
import {
  ARENA_PRESETS,
  ARENA_PRESET_IDS,
  buildArenaInitial,
  parseArenaSetup,
  parseCombatState,
  startCombat,
} from '../src/engine/combat/index';
import { scenarioInitial } from './combat-core-fixtures';

describe('parseArenaSetup (A1)', () => {
  it('accepts 1–5 opponents with group, engagement, phaseOffset and power plus a companion', () => {
    const parsed = parseArenaSetup({
      opponents: [
        { profileId: 'raider', startingGroup: 'g0', engagedWithHero: true, phaseOffset: 1, power: 2 },
        { profileId: 'archer', startingGroup: 'g1', engagedWithHero: false },
      ],
      companion: 'party-sentinel',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.setup.opponents).toHaveLength(2);
    expect(parsed.setup.opponents[0]).toMatchObject({ phaseOffset: 1, power: 2 });
    expect(parsed.setup.companion).toBe('party-sentinel');
  });

  it('rejects an empty roster, six opponents, unknown profiles and bad fields', () => {
    expect(parseArenaSetup({ opponents: [] }).ok).toBe(false);
    expect(
      parseArenaSetup({
        opponents: [1, 2, 3, 4, 5, 6].map(() => ({
          profileId: 'raider',
          startingGroup: 'g0',
          engagedWithHero: true,
        })),
      }).ok,
    ).toBe(false);
    const badProfile = parseArenaSetup({
      opponents: [{ profileId: 'dragon', startingGroup: 'g0', engagedWithHero: true }],
    });
    expect(badProfile.ok).toBe(false);
    if (!badProfile.ok) expect(badProfile.issues[0]?.code).toBe('bad_opponent_profile');
    const badGroup = parseArenaSetup({
      opponents: [{ profileId: 'raider', startingGroup: 'far', engagedWithHero: true }],
    });
    expect(badGroup.ok).toBe(false);
    const badPower = parseArenaSetup({
      opponents: [{ profileId: 'raider', startingGroup: 'g0', engagedWithHero: true, power: 9 }],
    });
    expect(badPower.ok).toBe(false);
    const badCompanion = parseArenaSetup({
      opponents: [{ profileId: 'raider', startingGroup: 'g0', engagedWithHero: true }],
      companion: 'party-dragon',
    });
    expect(badCompanion.ok).toBe(false);
  });
});

describe('buildArenaInitial (A1)', () => {
  it('assigns positional ids in the opponents explicit order', () => {
    const parsed = parseArenaSetup({
      opponents: [
        { profileId: 'archer', startingGroup: 'g1', engagedWithHero: false },
        { profileId: 'brute', startingGroup: 'g0', engagedWithHero: true },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const initial = buildArenaInitial(parsed.setup);
    expect(initial.actors.map((actor) => `${actor.id}:${actor.profileId}`)).toEqual([
      'h01:hero',
      'e01:archer',
      'e02:brute',
    ]);
    expect(initial.engagements).toEqual([['e02', 'h01']]);
    expect(initial.nextGroupSerial).toBe(2);
  });

  it('starts the hero without equipment references and the companion in g0', () => {
    const parsed = parseArenaSetup({
      opponents: [{ profileId: 'raider', startingGroup: 'g0', engagedWithHero: true }],
      companion: 'party-archer',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const initial = buildArenaInitial(parsed.setup);
    const hero = initial.actors.find((actor) => actor.id === 'h01');
    const companion = initial.actors.find((actor) => actor.id === 'c01');
    expect(hero?.ref).toBeNull();
    expect(companion?.profileId).toBe('party-archer');
    expect(companion?.groupId).toBe('g0');
  });
});

describe('presets T1–T7 (A1)', () => {
  it('covers exactly T1–T7', () => {
    expect(ARENA_PRESET_IDS).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
    expect(Object.keys(ARENA_PRESETS).sort()).toEqual([...ARENA_PRESET_IDS].sort());
  });

  it.each(ARENA_PRESET_IDS)('preset %s builds the §15.2 state and passes startCombat', (id) => {
    const initial = buildArenaInitial(ARENA_PRESETS[id]!);
    expect(initial).toEqual(scenarioInitial(id));
    const parsed = parseCombatState(initial);
    expect(parsed.ok).toBe(true);
    const started = startCombat(initial);
    expect(started.ok).toBe(true);
  });
});
