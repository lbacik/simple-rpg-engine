// P1c K8: rules §§11.1–11.4 as full-Round golden tests.
//
// Each test plays whole Rounds through submitRound from an explicit PLAN
// state and asserts the end state stated in the rules. T1 plays the duel
// 11.1 winning sequence (WIN in Round 3; hero 30 HP, 5 stamina); T5 plays
// the sequence 11.4 (WIN in Round 3; hero 40 HP, 9 stamina).
//
// §11.5 is deliberately absent: its intents (two free-Archers' Shots aimed
// at the companion, companion Prepare in Balanced) cannot arise from the
// AI rules (§8.2: a free archer shoots the hero; §10: no companion ever
// Prepares in Balanced), and submitRound rejects any CHOOSE state whose
// frozen plans fail recomputation (K6). Asserting 11.5's numbers would need
// either unreachable intents or different numbers, both forbidden by the
// ticket's stop condition. See decision issue #264 instead.

import { describe, expect, it } from 'vitest';
import { planRound, submitRound } from '../src/engine/combat/index';
import type { CombatEvent, CombatState, RoundCommand, SubmitResult } from '../src/engine/combat/index';
import { duelPlanState, enemyActor, heroActor } from './combat-core-fixtures';

function cmd(round: number, stance: RoundCommand['stance'], actionId: RoundCommand['actionId'], targetId: RoundCommand['targetId']): RoundCommand {
  return { round, stance, actionId, targetId };
}

function accepted(result: SubmitResult): { state: CombatState; events: CombatEvent[] } {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected accepted, got ${result.reason}`);
  return { state: result.state, events: result.events };
}

function eventsOf(state: CombatState, type: string): CombatEvent[] {
  return state.log.filter((event) => event['type'] === type);
}

function chooseOf(plan: CombatState): CombatState {
  return planRound(plan);
}

describe('§11.1 duel golden (T1)', () => {
  it('plays Counter → Feint → Heavy to WIN in round 3, hero 30 HP and 5 stamina', () => {
    let state = accepted(submitRound(chooseOf(duelPlanState()), cmd(1, 'defensive', 'counter', 'h01'))).state;
    expect(state.actors[0]).toMatchObject({ hp: 40, stamina: 9 });
    expect(state.actors[1]).toMatchObject({ hp: 20 });
    expect(state.actors[0]?.availableRound['counter']).toBe(3);

    state = accepted(submitRound(state, cmd(2, 'balanced', 'feint', 'e01'))).state;
    expect(state.actors[0]).toMatchObject({ hp: 40, stamina: 9 });
    expect(state.actors[1]).toMatchObject({ hp: 12 });

    const terminal = accepted(submitRound(state, cmd(3, 'aggressive', 'heavy', 'e01')));
    expect(terminal.state.result).toBe('WIN');
    expect(terminal.state.phase).toBe('FINISHED');
    expect(terminal.state.actors[0]).toMatchObject({ hp: 30, stamina: 5 });
    expect(terminal.state.actors[1]).toMatchObject({ hp: 0 });
    // Terminal cutoff: the killing round regenerates nothing.
    expect(eventsOf(terminal.state, 'regenerated').filter((event) => event['round'] === 3)).toHaveLength(0);
    expect(terminal.events.map((event) => event['type'])).toContain('finished');
  });
});

describe('§11.2 counter golden', () => {
  it('answers two Strike 7 hits in Defensive: hero 34 HP, first attacker −7 HP, second undamaged', () => {
    // Two engaged Raiders open Strike Aggressive, base 7, skill/defense 4,
    // armor 0, and both hold attack slots. The hero has a Counter, no Prepare.
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), enemyActor('e01', 'raider'), enemyActor('e02', 'raider')],
      engagements: [
        ['e01', 'h01'],
        ['e02', 'h01'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    expect(open.frozenEnemyPlans).toHaveLength(2);
    expect(open.frozenEnemyPlans.every((plan) => plan.attackSlot)).toBe(true);

    const out = accepted(submitRound(open, cmd(1, 'defensive', 'counter', 'h01')));
    const attacks = eventsOf(out.state, 'attack');
    expect(attacks).toHaveLength(2);
    // First: 6 against 6 hits; parry 6 plus armor 1 absorb the whole Strike 7.
    expect(attacks[0]).toMatchObject({ actor: 'e01', attackScore: 6, defenseScore: 6, hit: 1, counter: 1 });
    expect(attacks[0]).toMatchObject({ raw: 7, parry: 6, absorbed: 0, hpLoss: 0 });
    // The riposte answers only the first blow; the second costs 6 HP.
    expect(eventsOf(out.state, 'riposte')).toHaveLength(1);
    expect(eventsOf(out.state, 'riposte')[0]).toMatchObject({ actor: 'h01', hpLoss: 7 });
    expect(attacks[1]).toMatchObject({ actor: 'e02', hit: 1, counter: 0, hpLoss: 6 });
    expect(out.state.actors[0]).toMatchObject({ hp: 34, stamina: 9 });
    expect(out.state.actors[1]).toMatchObject({ hp: 7 });
    expect(out.state.actors[2]).toMatchObject({ hp: 14 });
  });
});

describe('§11.3 raider rotation golden (T3 line)', () => {
  function threeRaiders(): CombatState {
    return {
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), enemyActor('e01', 'raider'), enemyActor('e02', 'raider'), enemyActor('e03', 'raider')],
      engagements: [
        ['e01', 'h01'],
        ['e02', 'h01'],
        ['e03', 'h01'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    };
  }

  it('round 1: Counter answers two Strikes, the waiting Raider keeps Aggressive with guard 3', () => {
    const open = chooseOf(threeRaiders());
    // Ties give the slots to e01 and e02; e03 waits, keeps A, guards 3.
    expect(open.frozenEnemyPlans.find((plan) => plan.actorId === 'e03')).toMatchObject({
      actionId: 'wait',
      stance: 'aggressive',
      wasCandidate: true,
      attackSlot: false,
    });

    const out = accepted(submitRound(open, cmd(1, 'defensive', 'counter', 'h01')));
    expect(out.state.actors[0]).toMatchObject({ hp: 34, stamina: 9 });
    expect(out.state.actors[1]).toMatchObject({ hp: 7 });
    expect(out.state.actors[2]).toMatchObject({ hp: 14 });
    expect(out.state.actors[3]).toMatchObject({ hp: 14 });
    expect(eventsOf(out.state, 'riposte')).toHaveLength(1);
    // Only the waiter ages; the slot holders reset to 0.
    const ages = new Map(out.state.actors.map((actor) => [actor.id, actor.waitAge]));
    expect(ages.get('e01')).toBe(0);
    expect(ages.get('e02')).toBe(0);
    expect(ages.get('e03')).toBe(1);
  });

  it('round 2: Strike kills the active e01, no slot refill, hero ends 23 HP and 10 stamina', () => {
    const r1 = accepted(submitRound(chooseOf(threeRaiders()), cmd(1, 'defensive', 'counter', 'h01'))).state;
    // All want Heavy Blow Aggressive; age puts e03 first, lower ID then e01.
    expect(r1.frozenEnemyPlans.find((plan) => plan.actorId === 'e03')).toMatchObject({ actionId: 'heavy', attackSlot: true });
    expect(r1.frozenEnemyPlans.find((plan) => plan.actorId === 'e01')).toMatchObject({ actionId: 'heavy', attackSlot: true });
    expect(r1.frozenEnemyPlans.find((plan) => plan.actorId === 'e02')).toMatchObject({ actionId: 'wait', attackSlot: false });

    const out = accepted(submitRound(r1, cmd(2, 'aggressive', 'strike', 'e01')));
    // Priority-20 Strike precedes both Heavies: 6 against exposed 0, 8 damage.
    // (The log accumulates rounds, so only round-2 blows count here.)
    const strikes = eventsOf(out.state, 'attack').filter((event) => event['round'] === 2);
    expect(strikes.map((event) => event['actor'])).toEqual(['h01', 'e03']);
    expect(strikes[0]).toMatchObject({ attackScore: 6, defenseScore: 0, hpLoss: 8 });
    // The freed slot is not assigned to e02 in that round: at most two intents.
    expect(strikes).toHaveLength(2);
    // e03's blow: 5 hits defense 2; 12 − 1 armor = 11 HP loss.
    expect(strikes[1]).toMatchObject({ actor: 'e03', attackScore: 5, defenseScore: 2, hpLoss: 11 });
    expect(out.state.actors[0]).toMatchObject({ hp: 23, stamina: 10 });
    expect(out.state.actors[1]).toMatchObject({ hp: 0 });
    expect(out.state.actors[2]).toMatchObject({ hp: 14 });
    expect(out.state.actors[3]).toMatchObject({ hp: 14 });
    // Only the surviving engagements remain; e02 aged, e03 reset.
    expect(out.state.engagements).toEqual([
      ['e02', 'h01'],
      ['e03', 'h01'],
    ]);
    const ages = new Map(out.state.actors.map((actor) => [actor.id, actor.waitAge]));
    expect(ages.get('e02')).toBe(1);
    expect(ages.get('e03')).toBe(0);
  });
});

describe('§11.4 far → near → melee golden (T5)', () => {
  function archerFar(round: number): CombatState {
    return chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 2,
      actors: [heroActor({ groupId: 'g0' }), enemyActor('e01', 'archer', { groupId: 'g1' })],
      engagements: [],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
  }

  it('plays Approach → Charge → Strike to WIN in round 3, hero 40 HP and 9 stamina', () => {
    const r1 = accepted(submitRound(archerFar(1), cmd(1, 'defensive', 'approach', 'e01'))).state;
    expect(r1.actors[0]).toMatchObject({ hp: 40, stamina: 10, groupId: 'g1' });
    expect(eventsOf(r1, 'attack')).toHaveLength(1);
    expect(eventsOf(r1, 'attack')[0]).toMatchObject({ hit: 0 });

    // The r1 output is already the round-2 CHOOSE state.
    const r2 = accepted(submitRound(r1, cmd(2, 'aggressive', 'charge', 'e01'))).state;
    expect(r2.actors[1]).toMatchObject({ hp: 6 });
    expect(eventsOf(r2, 'cancelled').filter((event) => event['reason'] === 'shooter_engaged')).toHaveLength(1);
    expect(r2.actors[0]).toMatchObject({ hp: 40, stamina: 9 });
    expect(r2.engagements).toEqual([['e01', 'h01']]);

    const r3 = accepted(submitRound(r2, cmd(3, 'aggressive', 'strike', 'e01')));
    expect(r3.state.result).toBe('WIN');
    expect(r3.state.actors[0]).toMatchObject({ hp: 40, stamina: 9 });
    expect(eventsOf(r3.state, 'attack').filter((event) => event['actor'] === 'e01' && event['round'] === 3)).toHaveLength(0);
    expect(eventsOf(r3.state, 'regenerated').filter((event) => event['round'] === 3)).toHaveLength(0);
  });
});
