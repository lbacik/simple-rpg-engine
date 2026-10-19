// P3 C5 (builder): the pure Encounter → InitialCombatState builder (#184 Q4).
//
// Arrangement units pin the Q4 table exactly; the matrix proves the acceptance
// contract: for fixture Encounters covering 1–5 Participants, every
// startRange, every valid phaseOffset, every power 0–3, no Companion and each
// party profile, the built state passes the core's `startCombat` validation.

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildInitialCombatState, loadScenario } from '../src/content/index';
import type {
  CompiledCompanion,
  CompiledEncounter,
  CompiledParticipant,
} from '../src/content/model';
import { startCombat } from '../src/engine/combat/index';
import { ENEMY_CYCLES, PROFILES } from '../src/engine/combat/rules';

type EnemyProfile = 'raider' | 'brute' | 'sentinel' | 'archer';
type PartyProfile = 'party-sentinel' | 'party-archer';

const ENEMY_PROFILES: EnemyProfile[] = ['raider', 'brute', 'sentinel', 'archer'];

function participant(
  id: string,
  profile: EnemyProfile,
  startRange: CompiledParticipant['startRange'],
  extra: Partial<Pick<CompiledParticipant, 'phaseOffset' | 'power'>> = {},
): CompiledParticipant {
  return {
    id,
    enemy: { id: `${id}-kind`, name: `${id} kind`, profile },
    startRange,
    phaseOffset: 0,
    power: 0,
    ...extra,
  };
}

function encounter(participants: CompiledParticipant[]): CompiledEncounter {
  return {
    id: 'test-encounter',
    participants,
    text: 'Test encounter.',
    surrender: { text: 'We yield.', effects: [] },
    draw: { text: 'A stalemate.', effects: [] },
  };
}

function companion(id: string, profile: PartyProfile): CompiledCompanion {
  return { id, name: id, profile };
}

function startedOk(state: unknown): void {
  const result = startCombat(state);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`expected startCombat to accept, got ${result.reason} ${JSON.stringify(result.issues)}`);
  }
}

describe('buildInitialCombatState arrangement', () => {
  it('places the hero alone in g0 at full health and stamina', () => {
    const state = buildInitialCombatState(encounter([participant('wolf', 'raider', 'near')]));
    const hero = state.actors.find((actor) => actor.id === 'h01');
    expect(hero).toMatchObject({
      ref: null,
      team: 'heroes',
      role: 'hero',
      profileId: 'hero',
      hp: 40,
      stamina: 10,
      stance: 'balanced',
      groupId: 'g0',
      readyRound: null,
    });
    expect(state.rulesVersion).toBe('simple-rpg-engine-stance-cards-1.0');
    expect(state.round).toBe(1);
    expect(state.phase).toBe('PLAN');
    expect(state.result).toBeNull();
    expect(state.frozenEnemyPlans).toEqual([]);
    expect(state.frozenCompanionPlan).toBeNull();
    expect(state.log).toEqual([]);
  });

  it('maps melee to g0 with a hero engagement, near to g0 alone, far to shared g1', () => {
    const state = buildInitialCombatState(
      encounter([
        participant('a', 'raider', 'melee'),
        participant('b', 'brute', 'near'),
        participant('c', 'archer', 'far'),
        participant('d', 'sentinel', 'far'),
      ]),
    );
    const byId = new Map(state.actors.map((actor) => [actor.id, actor]));
    expect(byId.get('e01')).toMatchObject({ ref: 'a', groupId: 'g0', profileId: 'raider' });
    expect(byId.get('e02')).toMatchObject({ ref: 'b', groupId: 'g0', profileId: 'brute' });
    expect(byId.get('e03')).toMatchObject({ ref: 'c', groupId: 'g1', profileId: 'archer' });
    expect(byId.get('e04')).toMatchObject({ ref: 'd', groupId: 'g1', profileId: 'sentinel' });
    expect(state.engagements).toEqual([['e01', 'h01']]);
    expect(state.nextGroupSerial).toBe(2);
    for (const enemy of ['e01', 'e02', 'e03', 'e04']) {
      expect(byId.get(enemy)).toMatchObject({
        team: 'enemies',
        role: 'enemy',
        stance: 'balanced',
        stamina: null,
        readyRound: null,
        waitAge: 0,
      });
    }
  });

  it('uses serial 1 when nobody starts far and carries power and phaseOffset', () => {
    const state = buildInitialCombatState(
      encounter([
        participant('a', 'raider', 'melee', { power: 2, phaseOffset: 3 }),
        participant('b', 'brute', 'near', { power: 1, phaseOffset: 2 }),
      ]),
    );
    expect(state.nextGroupSerial).toBe(1);
    const byId = new Map(state.actors.map((actor) => [actor.id, actor]));
    expect(byId.get('e01')).toMatchObject({ power: 2, phaseOffset: 3 });
    expect(byId.get('e02')).toMatchObject({ power: 1, phaseOffset: 2 });
  });

  it('adds the companion at full HP and stamina in g0 without touching the serial', () => {
    const base = buildInitialCombatState(
      encounter([participant('a', 'archer', 'far')]),
      { companion: companion('astrid', 'party-sentinel') },
    );
    const escort = base.actors.find((actor) => actor.id === 'c01');
    expect(escort).toMatchObject({
      ref: 'astrid',
      team: 'heroes',
      role: 'companion',
      profileId: 'party-sentinel',
      hp: PROFILES['party-sentinel'].maxHp,
      stamina: PROFILES['party-sentinel'].maxStamina,
      stance: 'balanced',
      groupId: 'g0',
    });
    expect(base.nextGroupSerial).toBe(2);
    expect(base.engagements).toEqual([]);
    startedOk(base);

    const bow = buildInitialCombatState(encounter([participant('a', 'raider', 'near')]), {
      companion: companion('bow', 'party-archer'),
    });
    expect(bow.actors.find((actor) => actor.id === 'c01')).toMatchObject({
      hp: PROFILES['party-archer'].maxHp,
      stamina: PROFILES['party-archer'].maxStamina,
    });
    expect(bow.nextGroupSerial).toBe(1);
    startedOk(bow);
  });

  it('applies wounds by participant id and skips slain participants', () => {
    const parts = [participant('a', 'raider', 'near'), participant('b', 'brute', 'near')];
    const wounded = buildInitialCombatState(encounter(parts), { wounds: { a: 5 } });
    const byId = new Map(wounded.actors.map((actor) => [actor.id, actor]));
    expect(byId.get('e01')?.hp).toBe(PROFILES.raider.maxHp - 5);
    expect(byId.get('e02')?.hp).toBe(PROFILES.brute.maxHp);
    startedOk(wounded);

    const slain = buildInitialCombatState(encounter(parts), {
      wounds: { a: PROFILES.raider.maxHp },
    });
    expect(slain.actors.map((actor) => actor.id)).toEqual(['h01', 'e01']);
    expect(slain.actors.find((actor) => actor.id === 'e01')?.ref).toBe('b');
    startedOk(slain);
    expect(
      startCombat(buildInitialCombatState(encounter(parts), { heroHp: 0 })).ok,
    ).toBe(false);
    expect(
      startCombat(
        buildInitialCombatState(encounter(parts), {
          wounds: { a: PROFILES.raider.maxHp, b: PROFILES.brute.maxHp },
        }),
      ).ok,
    ).toBe(false);
  });
});

describe('buildInitialCombatState acceptance matrix', () => {
  const ranges: CompiledParticipant['startRange'][] = ['melee', 'near', 'far'];

  it('passes startCombat for 1–5 participants across ranges, powers and companions', () => {
    let checked = 0;
    const companions: (CompiledCompanion | null)[] = [
      null,
      companion('sentinel-friend', 'party-sentinel'),
      companion('archer-friend', 'party-archer'),
    ];
    for (let size = 1; size <= 5; size += 1) {
      const rangeConfigs: CompiledParticipant['startRange'][][] = [
        Array<CompiledParticipant['startRange']>(size).fill('melee'),
        Array<CompiledParticipant['startRange']>(size).fill('near'),
        Array<CompiledParticipant['startRange']>(size).fill('far'),
        Array.from({ length: size }, (_, i) => ranges[i % ranges.length]),
      ];
      const powerConfigs: number[][] = [
        Array<number>(size).fill(0),
        Array<number>(size).fill(1),
        Array<number>(size).fill(2),
        Array<number>(size).fill(3),
        Array.from({ length: size }, (_, i) => i % 4),
      ];
      for (const rangeConfig of rangeConfigs) {
        for (const powerConfig of powerConfigs) {
          for (const escort of companions) {
            const parts = rangeConfig.map((startRange, i) => {
              const profile = ENEMY_PROFILES[i % ENEMY_PROFILES.length];
              const cycleLength = ENEMY_CYCLES[profile].length;
              return participant(`p${i}`, profile, startRange, {
                power: powerConfig[i],
                phaseOffset: i % cycleLength,
              });
            });
            const state = buildInitialCombatState(encounter(parts), { companion: escort });
            const result = startCombat(state);
            expect(
              result.ok,
              `size ${size} ranges ${rangeConfig} powers ${powerConfig} companion ${escort?.profile ?? 'none'}`,
            ).toBe(true);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('passes startCombat for every shipped v2 Encounter with and without each Companion', () => {
    const repoRoot = path.resolve(__dirname, '..');
    // P3 C5: every Encounter in all five shipped Scenarios, built with no
    // Companion and with each party profile, passes startCombat.
    for (const name of [
      'tests/fixtures/scenarios/two-bridges',
      'scenarios/whispering-woods',
      'scenarios/perun-stone',
      'scenarios/the-drowned-ledger',
      'scenarios/the-ember-pass',
      'scenarios/the-frost-cairn',
    ]) {
      const result = loadScenario(path.join(repoRoot, name));
      expect(result.ok, `${name} loads`).toBe(true);
      if (!result.ok) continue;
      for (const found of result.scenario.encounters) {
        for (const escort of [null, companion('sentinel-friend', 'party-sentinel'), companion('archer-friend', 'party-archer')] as const) {
          const started = startCombat(buildInitialCombatState(found, { companion: escort }));
          expect(started.ok, `${name}/${found.id} with ${escort?.profile ?? 'no companion'}`).toBe(true);
        }
      }
    }
  });

  it('passes startCombat for every valid phaseOffset of every enemy profile', () => {
    for (const profile of ENEMY_PROFILES) {
      const cycleLength = ENEMY_CYCLES[profile].length;
      for (let offset = 0; offset < cycleLength; offset += 1) {
        for (const escort of [null, companion('escort', 'party-archer')] as const) {
          startedOk(
            buildInitialCombatState(encounter([participant('solo', profile, 'near', { phaseOffset: offset })]), {
              companion: escort,
            }),
          );
        }
      }
    }
  });
});
