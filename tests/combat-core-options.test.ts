// P1a K3: listOptions is the single source of command legality.
// Every action × target row carries ALL applicable reason codes.

import { describe, expect, it } from 'vitest';
import { findOption, listOptions } from '../src/engine/combat/index';
import type { ActionId, ActorId, CommandOption } from '../src/engine/combat/index';
import { companionActor, duelChooseState, enemyActor, heroActor } from './combat-core-fixtures';

function get(options: CommandOption[], actionId: ActionId, targetId: ActorId | null): CommandOption {
  const found = findOption(options, actionId, targetId);
  expect(found).toBeDefined();
  return found!;
}

function codesOf(option: CommandOption | undefined): string[] {
  return option === undefined ? [] : option.reasons.map((r) => r.code);
}

describe('listOptions matrix', () => {
  it('returns every action × target', () => {
    const options = listOptions(duelChooseState(), 'balanced');
    // 12 hero actions × (2 living actors + null).
    expect(options).toHaveLength(36);
    const actions = new Set(options.map((o) => o.actionId));
    expect(actions.size).toBe(12);
    expect(actions.has('wait')).toBe(false);
  });

  it('keeps a legal Brace in every stance and every hostile state', () => {
    for (const stance of ['aggressive', 'balanced', 'defensive'] as const) {
      const state = duelChooseState();
      state.actors = [heroActor({ stamina: 0 }), enemyActor('e01', 'raider')];
      const brace = get(listOptions(state, stance), 'brace', 'h01');
      expect(brace.legal).toBe(true);
      expect(brace.reasons).toEqual([]);
    }
    // Engaged, far from a second enemy, broke and cooling down: Brace still holds.
    const state = duelChooseState();
    state.actors = [
      heroActor({ stamina: 0, availableRound: { heavy: 5 } }),
      enemyActor('e01', 'raider'),
      { ...enemyActor('e02', 'archer'), groupId: 'g1' },
    ];
    state.nextGroupSerial = 2;
    const brace = get(listOptions(state, 'defensive'), 'brace', 'h01');
    expect(brace.legal).toBe(true);
  });

  it('returns ALL applicable reason codes, not only the first', () => {
    const state = duelChooseState();
    state.actors = [
      heroActor({ stamina: 0, availableRound: { heavy: 5 } }),
      enemyActor('e01', 'raider'),
      { ...enemyActor('e02', 'archer'), groupId: 'g1' },
    ];
    state.nextGroupSerial = 2;
    // Heavy in Defensive, broke, cooling down, engaged, target Far: five reasons.
    const heavy = get(listOptions(state, 'defensive'), 'heavy', 'e02');
    expect(heavy.legal).toBe(false);
    expect(codesOf(heavy)).toEqual([
      'insufficient_stamina',
      'on_cooldown',
      'stance_disallows',
      'actor_engaged',
      'target_far',
    ]);
    expect(heavy.reasons.find((r) => r.code === 'insufficient_stamina')?.params).toEqual({ missing: 4 });
    expect(heavy.reasons.find((r) => r.code === 'on_cooldown')?.params).toEqual({ availableRound: 5 });
  });

  it('grades melee range: Melee legal, Near needs engagement, Far is far', () => {
    const state = duelChooseState();
    state.actors = [
      { ...heroActor(), groupId: 'g0' },
      { ...enemyActor('e01', 'raider'), groupId: 'g0' },
      { ...enemyActor('e02', 'raider'), groupId: 'g0' },
      { ...enemyActor('e03', 'archer'), groupId: 'g1' },
    ];
    state.nextGroupSerial = 2;
    state.engagements = [['e01', 'h01']];
    const options = listOptions(state, 'aggressive');

    expect(get(options, 'strike', 'e01').legal).toBe(true);
    expect(codesOf(get(options, 'strike', 'e02'))).toEqual(['actor_engaged', 'target_not_near']);
    expect(codesOf(get(options, 'strike', 'e03'))).toEqual(['actor_engaged', 'target_far']);
    expect(codesOf(get(options, 'strike', 'h01'))).toContain('invalid_target');
  });

  it('requires a free actor and Near for Charge, with the ENGAGE variant', () => {
    const state = duelChooseState();
    state.actors = [
      { ...heroActor(), groupId: 'g0' },
      { ...enemyActor('e01', 'raider'), groupId: 'g0' },
      { ...enemyActor('e02', 'archer'), groupId: 'g1' },
    ];
    state.nextGroupSerial = 2;
    state.engagements = [];
    const options = listOptions(state, 'aggressive');

    const near = get(options, 'charge', 'e01');
    expect(near.legal).toBe(true);
    expect(near.moveVariant).toBe('ENGAGE');
    expect(codesOf(get(options, 'charge', 'e02'))).toEqual(['target_far']);

    const engaged = { ...state, engagements: [['e01', 'h01']] as [string, string][] };
    const engagedOptions = listOptions(engaged, 'aggressive');
    expect(codesOf(get(engagedOptions, 'charge', 'e01'))).toEqual(['must_disengage']);
  });

  it('derives Approach variants and rejects Near allies', () => {
    const state = duelChooseState();
    state.actors = [
      { ...heroActor(), groupId: 'g0' },
      companionActor('party-sentinel'),
      { ...enemyActor('e01', 'raider'), groupId: 'g0' },
      { ...enemyActor('e02', 'archer'), groupId: 'g1' },
    ];
    state.nextGroupSerial = 2;
    state.engagements = [];
    state.frozenCompanionPlan = {
      actorId: 'c01',
      stance: 'defensive',
      actionId: 'brace',
      targetId: 'c01',
      moveVariant: null,
      wasCandidate: false,
      attackSlot: false,
      baseDamage: 0,
      priority: 0,
    };
    const options = listOptions(state, 'balanced');

    const join = get(options, 'approach', 'e02');
    expect(join.legal).toBe(true);
    expect(join.moveVariant).toBe('JOIN');
    const engage = get(options, 'approach', 'e01');
    expect(engage.legal).toBe(true);
    expect(engage.moveVariant).toBe('ENGAGE');
    expect(codesOf(get(options, 'approach', 'c01'))).toContain('invalid_target');
    expect(codesOf(get(options, 'approach', 'h01'))).toContain('invalid_target');

    const engaged = { ...state, engagements: [['e01', 'h01']] as [string, string][] };
    expect(codesOf(get(listOptions(engaged, 'balanced'), 'approach', 'e02'))).toContain('must_disengage');
  });

  it('covers only Near allies', () => {
    const state = duelChooseState();
    state.actors = [heroActor(), { ...companionActor('party-sentinel'), groupId: 'g1' }, enemyActor('e01', 'raider')];
    state.nextGroupSerial = 2;
    state.frozenCompanionPlan = {
      actorId: 'c01',
      stance: 'defensive',
      actionId: 'brace',
      targetId: 'c01',
      moveVariant: null,
      wasCandidate: false,
      attackSlot: false,
      baseDamage: 0,
      priority: 0,
    };
    const options = listOptions(state, 'balanced');
    expect(codesOf(get(options, 'cover', 'c01'))).toEqual(['requires_near_ally']);
    expect(codesOf(get(options, 'cover', 'h01'))).toContain('invalid_target');
    expect(codesOf(get(options, 'cover', 'e01'))).toContain('invalid_target');

    const near = { ...state, actors: [heroActor(), companionActor('party-sentinel'), enemyActor('e01', 'raider')] };
    expect(get(listOptions(near, 'balanced'), 'cover', 'c01').legal).toBe(true);
  });

  it('needs an engagement for Counterattack and Disengage', () => {
    const free = { ...duelChooseState(), engagements: [] as [string, string][] };
    expect(codesOf(get(listOptions(free, 'balanced'), 'counter', 'h01'))).toEqual(['not_engaged']);
    expect(codesOf(get(listOptions(free, 'balanced'), 'disengage', 'h01'))).toEqual(['not_engaged']);

    const engaged = duelChooseState();
    expect(get(listOptions(engaged, 'balanced'), 'counter', 'h01').legal).toBe(true);
    expect(get(listOptions(engaged, 'balanced'), 'disengage', 'h01').legal).toBe(true);
  });

  it('leaves Withdraw to free actors and the null target', () => {
    const free = { ...duelChooseState(), engagements: [] as [string, string][] };
    expect(get(listOptions(free, 'balanced'), 'withdraw', null).legal).toBe(true);
    expect(codesOf(get(listOptions(free, 'balanced'), 'withdraw', 'e01'))).toContain('invalid_target');

    const engaged = duelChooseState();
    expect(codesOf(get(listOptions(engaged, 'balanced'), 'withdraw', null))).toEqual(['must_disengage']);
  });

  it('marks every Shot illegal: the hero has no shot in the base set', () => {
    const options = listOptions(duelChooseState(), 'balanced');
    for (const option of options.filter((o) => o.actionId === 'shot')) {
      expect(option.legal).toBe(false);
      expect(option.reasons[0]?.code).toBe('no_shot_ability');
    }
  });

  it('enforces stances and cooldowns per card', () => {
    const state = duelChooseState();
    expect(codesOf(get(listOptions(state, 'defensive'), 'heavy', 'e01'))).toContain('stance_disallows');
    expect(get(listOptions(state, 'aggressive'), 'heavy', 'e01').legal).toBe(true);
    expect(codesOf(get(listOptions(state, 'aggressive'), 'counter', 'h01'))).toContain('stance_disallows');

    const cooling = duelChooseState();
    cooling.round = 2;
    cooling.actors = [heroActor({ availableRound: { heavy: 3, counter: 3 } }), enemyActor('e01', 'raider')];
    const coolingOptions = listOptions(cooling, 'balanced');
    expect(get(coolingOptions, 'heavy', 'e01').reasons.find((r) => r.code === 'on_cooldown')?.params).toEqual({
      availableRound: 3,
    });
    expect(get(coolingOptions, 'feint', 'e01').legal).toBe(true);
  });

  it('findOption misses unknown combinations', () => {
    const options = listOptions(duelChooseState(), 'balanced');
    expect(findOption(options, 'strike', 'e09')).toBeUndefined();
  });
});
