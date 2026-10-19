// P1a K1: parseCombatState rejects every §12 rule with a ParseIssue code.
// Valid states round-trip unchanged.

import { describe, expect, it } from 'vitest';
import { parseCombatState } from '../src/engine/combat/index';
import type { ParseIssueCode } from '../src/engine/combat/index';
import { companionActor, duelChooseState, duelPlanState, enemyActor, heroActor } from './combat-core-fixtures';

function codesOf(json: unknown): ParseIssueCode[] {
  const result = parseCombatState(json);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe('parseCombatState valid states', () => {
  it('rejects a non-object root as a state shape error', () => {
    expect(codesOf(null)).toContain('bad_state');
    expect(codesOf([1, 2])).toContain('bad_state');
  });
  it('round-trips the §12 PLAN duel unchanged', () => {
    const input = duelPlanState();
    const result = parseCombatState(JSON.parse(JSON.stringify(input)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(input);
  });

  it('round-trips a CHOOSE state with a companion unchanged', () => {
    const input = duelChooseState();
    input.actors = [heroActor(), companionActor('party-sentinel'), enemyActor('e01', 'raider')];
    input.frozenCompanionPlan = {
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
    const result = parseCombatState(JSON.parse(JSON.stringify(input)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(input);
  });

  it('round-trips a FINISHED state with eliminated characters', () => {
    const input = duelChooseState();
    input.phase = 'FINISHED';
    input.result = 'WIN';
    input.actors = [heroActor({ hp: 30, stamina: 5 }), enemyActor('e01', 'brute', { hp: 0 })];
    input.engagements = [];
    const result = parseCombatState(JSON.parse(JSON.stringify(input)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(input);
  });
});

describe('parseCombatState rulesVersion', () => {  it('rejects an unknown rulesVersion', () => {
    expect(codesOf({ ...duelPlanState(), rulesVersion: 'tactical-v2' })).toContain('bad_rules_version');
  });

  it('rejects a mismatched rulesVersion', () => {
    expect(codesOf({ ...duelPlanState(), rulesVersion: 'simple-rpg-engine-stance-cards-2.0' })).toContain(
      'bad_rules_version',
    );
  });

  it('rejects a missing rulesVersion', () => {
    const rest = { ...(duelPlanState() as unknown as Record<string, unknown>) };
    delete rest['rulesVersion'];
    expect(codesOf(rest)).toContain('bad_rules_version');
  });

  it('rejects the retired MVP stateVersion key', () => {
    expect(codesOf({ ...duelPlanState(), stateVersion: 1 })).toContain('unexpected_state_version');
  });
});

describe('parseCombatState actors', () => {
  it('rejects duplicate actor ids', () => {
    const state = duelPlanState();
    state.actors = [heroActor(), heroActor()];
    expect(codesOf(state)).toContain('duplicate_actor_id');
  });

  it('rejects malformed actor ids', () => {
    const state = duelPlanState();
    state.actors = [{ ...heroActor(), id: 'hero1' }, enemyActor('e01', 'brute')];
    expect(codesOf(state)).toContain('bad_actor_id');
  });

  it('rejects an id bound to the wrong role', () => {
    const state = duelPlanState();
    state.actors = [{ ...heroActor(), id: 'e02' }, enemyActor('e01', 'brute')];
    expect(codesOf(state)).toContain('bad_team_role');
  });

  it('rejects unknown profiles', () => {
    const state = duelPlanState();
    state.actors = [{ ...heroActor(), profileId: 'dragon' as never }, enemyActor('e01', 'brute')];
    expect(codesOf(state)).toContain('unknown_profile');
  });

  it('rejects a missing hero', () => {
    const state = duelPlanState();
    state.actors = [enemyActor('e01', 'brute')];
    expect(codesOf(state)).toContain('missing_hero');
  });

  it('rejects more than one companion', () => {
    const state = duelPlanState();
    state.actors = [heroActor(), companionActor('party-sentinel'), { ...companionActor('party-archer'), id: 'e02' }];
    expect(codesOf(state)).toContain('too_many_companions');
  });

  it('rejects zero enemies and a sixth enemy id', () => {
    const solo = duelPlanState();
    solo.actors = [heroActor()];
    expect(codesOf(solo)).toContain('bad_enemy_count');

    // Canonical ids admit only e01–e05, so a sixth enemy is rejected at the id.
    const horde = duelPlanState();
    horde.actors = [heroActor(), enemyActor('e01', 'raider'), { ...enemyActor('e02', 'raider'), id: 'e06' }];
    expect(codesOf(horde)).toContain('bad_actor_id');
  });

  it('accepts five enemies in PLAN', () => {
    const state = duelPlanState();
    state.actors = [
      heroActor(),
      enemyActor('e01', 'raider'),
      enemyActor('e02', 'raider'),
      enemyActor('e03', 'brute'),
      enemyActor('e04', 'sentinel'),
      enemyActor('e05', 'archer'),
    ];
    state.engagements = [];
    const result = parseCombatState(state);
    expect(result.ok).toBe(true);
  });

  it('rejects hp above the profile maximum and below zero', () => {
    const over = duelPlanState();
    over.actors = [heroActor({ hp: 41 }), enemyActor('e01', 'brute')];
    expect(codesOf(over)).toContain('hp_out_of_range');

    const under = duelPlanState();
    under.actors = [heroActor(), enemyActor('e01', 'brute', { hp: -1 })];
    expect(codesOf(under)).toContain('hp_out_of_range');
  });

  it('rejects non-null enemy stamina and out-of-range hero stamina', () => {
    const enemyStamina = duelPlanState();
    enemyStamina.actors = [heroActor(), enemyActor('e01', 'brute', { stamina: 5 })];
    expect(codesOf(enemyStamina)).toContain('bad_stamina');

    const heroStamina = duelPlanState();
    heroStamina.actors = [heroActor({ stamina: 11 }), enemyActor('e01', 'brute')];
    expect(codesOf(heroStamina)).toContain('bad_stamina');
  });

  it('rejects bad stances, groups, ready and available rounds', () => {
    const stance = duelPlanState();
    stance.actors = [{ ...heroActor(), stance: 'reckless' as never }, enemyActor('e01', 'brute')];
    expect(codesOf(stance)).toContain('bad_stance');

    const group = duelPlanState();
    group.actors = [{ ...heroActor(), groupId: 'here' }, enemyActor('e01', 'brute')];
    expect(codesOf(group)).toContain('bad_group_id');

    const ready = duelPlanState();
    ready.actors = [heroActor({ readyRound: 0 }), enemyActor('e01', 'brute')];
    expect(codesOf(ready)).toContain('bad_ready_round');

    const cooldown = duelPlanState();
    cooldown.actors = [heroActor({ availableRound: { heavy: 0 } }), enemyActor('e01', 'brute')];
    expect(codesOf(cooldown)).toContain('bad_available_round');

    const cooldownKey = duelPlanState();
    cooldownKey.actors = [heroActor({ availableRound: { strike: 2 } as never }), enemyActor('e01', 'brute')];
    expect(codesOf(cooldownKey)).toContain('bad_available_round');
  });

  it('rejects a bad ref and a profile bound to the wrong role', () => {
    const ref = duelPlanState();
    ref.actors = [{ ...heroActor(), ref: 42 as never }, enemyActor('e01', 'brute')];
    expect(codesOf(ref)).toContain('bad_ref');

    const binding = duelPlanState();
    binding.actors = [{ ...heroActor(), profileId: 'raider' }, enemyActor('e01', 'brute')];
    expect(codesOf(binding)).toContain('bad_profile_role');

    const enemyBinding = duelPlanState();
    enemyBinding.actors = [heroActor(), { ...enemyActor('e01', 'brute'), profileId: 'hero' }];
    expect(codesOf(enemyBinding)).toContain('bad_profile_role');
  });

  it('holds hero and companion power at the table value of 0', () => {
    const heroPower = duelPlanState();
    heroPower.actors = [heroActor({ power: 2 }), enemyActor('e01', 'brute')];
    expect(codesOf(heroPower)).toContain('bad_power');

    const enemyPower = duelPlanState();
    enemyPower.actors = [heroActor(), enemyActor('e01', 'brute', { power: 2 })];
    expect(parseCombatState(enemyPower).ok).toBe(true);
  });

  it('rejects an active fight without a living hero or without living enemies', () => {
    const deadHero = duelChooseState();
    deadHero.actors = [heroActor({ hp: 0 }), enemyActor('e01', 'raider')];
    expect(codesOf(deadHero)).toContain('no_living_hero');

    const deadEnemies = duelChooseState();
    deadEnemies.actors = [heroActor(), enemyActor('e01', 'raider', { hp: 0 })];
    deadEnemies.engagements = [];
    expect(codesOf(deadEnemies)).toContain('no_living_enemies');
  });
});

describe('parseCombatState groups and engagements', () => {
  it('rejects a nextGroupSerial that is not greater than every group in use', () => {
    const state = duelPlanState();
    state.nextGroupSerial = 1;
    state.actors = [{ ...heroActor(), groupId: 'g0' }, { ...enemyActor('e01', 'brute'), groupId: 'g1' }];
    state.engagements = [];
    expect(codesOf(state)).toContain('bad_next_group_serial');
  });

  it('rejects engagements with unknown actors', () => {
    const state = duelPlanState();
    state.engagements = [['h01', 'e09']];
    expect(codesOf(state)).toContain('bad_engagement');
  });

  it('rejects engagements between allies', () => {
    const state = duelPlanState();
    state.actors = [heroActor(), companionActor('party-sentinel'), enemyActor('e01', 'raider')];
    state.engagements = [['c01', 'h01']];
    expect(codesOf(state)).toContain('bad_engagement');
  });

  it('rejects engagements across groups and with the dead', () => {
    const across = duelPlanState();
    across.actors = [{ ...heroActor(), groupId: 'g0' }, { ...enemyActor('e01', 'brute'), groupId: 'g1' }];
    across.nextGroupSerial = 2;
    across.engagements = [['e01', 'h01']];
    expect(codesOf(across)).toContain('bad_engagement');

    const dead = duelChooseState();
    dead.actors = [heroActor(), enemyActor('e01', 'raider', { hp: 0 })];
    expect(codesOf(dead)).toContain('bad_engagement');
  });

  it('reduces reversed and repeated pairs to one canonical pair', () => {
    const state = duelChooseState();
    state.engagements = [
      ['h01', 'e01'],
      ['e01', 'h01'],
      ['e01', 'h01'],
    ];
    const result = parseCombatState(state);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.engagements).toEqual([['e01', 'h01']]);
  });
});

describe('parseCombatState rounds, phases and plans', () => {
  it('rejects rounds outside 1–30', () => {
    expect(codesOf({ ...duelPlanState(), round: 0 })).toContain('bad_round');
    expect(codesOf({ ...duelPlanState(), round: 31 })).toContain('bad_round');
  });

  it('rejects unknown phases and results', () => {
    expect(codesOf({ ...duelPlanState(), phase: 'RESOLVE' })).toContain('bad_phase');
    expect(codesOf({ ...duelPlanState(), result: 'DRAW' })).toContain('bad_result');
  });

  it('rejects FINISHED without a result and CHOOSE with one', () => {
    expect(codesOf({ ...duelChooseState(), phase: 'FINISHED', result: null })).toContain('finished_without_result');
    expect(codesOf({ ...duelChooseState(), result: 'WIN' })).toContain('result_before_finish');
  });

  it('rejects frozen plans in PLAN and missing plans in CHOOSE', () => {
    const plannedPlan = duelPlanState();
    plannedPlan.frozenEnemyPlans = duelChooseState().frozenEnemyPlans;
    expect(codesOf(plannedPlan)).toContain('bad_frozen_plans');

    const planless = duelChooseState();
    planless.frozenEnemyPlans = [];
    expect(codesOf(planless)).toContain('bad_frozen_plans');
  });

  it('rejects a frozen plan with a bad action, target or numbers', () => {
    const badAction = duelChooseState();
    badAction.frozenEnemyPlans = [{ ...badAction.frozenEnemyPlans[0]!, actionId: 'escape' as never }];
    expect(codesOf(badAction)).toContain('bad_frozen_plan');

    const badTarget = duelChooseState();
    badTarget.frozenEnemyPlans = [{ ...badTarget.frozenEnemyPlans[0]!, targetId: 'e09' }];
    expect(codesOf(badTarget)).toContain('bad_frozen_plan');

    const selfTarget = duelChooseState();
    selfTarget.frozenEnemyPlans = [{ ...selfTarget.frozenEnemyPlans[0]!, actionId: 'brace', targetId: 'h01' }];
    expect(codesOf(selfTarget)).toContain('bad_frozen_plan');
  });

  it('requires a companion plan in CHOOSE exactly when the companion lives', () => {
    const withCompanion = duelChooseState();
    withCompanion.actors = [heroActor(), companionActor('party-archer'), enemyActor('e01', 'raider')];
    expect(codesOf(withCompanion)).toContain('bad_frozen_plans');

    const deadCompanion = duelChooseState();
    deadCompanion.actors = [heroActor(), companionActor('party-archer', { hp: 0 }), enemyActor('e01', 'raider')];
    deadCompanion.frozenCompanionPlan = {
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
    const result = parseCombatState(deadCompanion);
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed log', () => {
    expect(codesOf({ ...duelPlanState(), log: {} })).toContain('bad_log');
    expect(codesOf({ ...duelPlanState(), log: [42] })).toContain('bad_log');
  });
});
