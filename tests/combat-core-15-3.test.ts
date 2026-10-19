// P1c K9: the whole rules §15.3 table, one test per row, named after the row.
//
// Each test builds its state explicitly (positions, stances, plans, bonuses;
// §15.3 preamble) and asserts the row's expected result through the public
// engine. Rows already proven as K7 mechanics or K8 goldens are re-asserted
// here under the row's own name; that duplication is intentional.

import { describe, expect, it } from 'vitest';
import { planRound, submitRound, surrender } from '../src/engine/combat/index';
import type { CombatEvent, CombatState, RoundCommand, SubmitResult } from '../src/engine/combat/index';
import { companionActor, duelPlanState, enemyActor, heroActor } from './combat-core-fixtures';

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

function round30(heroHp: number, enemyHp: number): CombatState {
  return chooseOf({
    rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
    round: 30,
    phase: 'PLAN',
    result: null,
    nextGroupSerial: 1,
    actors: [heroActor({ hp: heroHp }), enemyActor('e01', 'raider', { hp: enemyHp })],
    engagements: [['e01', 'h01']],
    frozenEnemyPlans: [],
    frozenCompanionPlan: null,
    log: [],
  });
}

describe('§15.3 minimum engine acceptance tests', () => {
  it('Identical state and command: identical result and log regardless of time and animation', () => {
    const play = (): CombatState => {
      let state = chooseOf(duelPlanState());
      state = accepted(submitRound(state, cmd(1, 'defensive', 'counter', 'h01'))).state;
      return accepted(submitRound(state, cmd(2, 'balanced', 'feint', 'e01'))).state;
    };
    const first = play();
    const second = play();
    expect(second).toEqual(first);
    expect(second.log).toEqual(first.log);
  });

  it('The whole duel 11.1: WIN in r. 3; hero 30 HP, 5 stamina', () => {
    let state = accepted(submitRound(chooseOf(duelPlanState()), cmd(1, 'defensive', 'counter', 'h01'))).state;
    state = accepted(submitRound(state, cmd(2, 'balanced', 'feint', 'e01'))).state;
    const terminal = accepted(submitRound(state, cmd(3, 'aggressive', 'heavy', 'e01'))).state;
    expect(terminal.result).toBe('WIN');
    expect(terminal.round).toBe(3);
    expect(terminal.actors[0]).toMatchObject({ hp: 30, stamina: 5 });
  });

  it('Sequence 11.4: WIN in r. 3; hero 40 HP, 9 stamina', () => {
    const far = (round: number): CombatState =>
      chooseOf({
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
    let state = accepted(submitRound(far(1), cmd(1, 'defensive', 'approach', 'e01'))).state;
    state = accepted(submitRound(state, cmd(2, 'aggressive', 'charge', 'e01'))).state;
    const terminal = accepted(submitRound(state, cmd(3, 'aggressive', 'strike', 'e01'))).state;
    expect(terminal.result).toBe('WIN');
    expect(terminal.round).toBe(3);
    expect(terminal.actors[0]).toMatchObject({ hp: 40, stamina: 9 });
  });

  it('Hit tie: attack 6 against defense 6 hits', () => {
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
    const out = accepted(submitRound(open, cmd(1, 'defensive', 'counter', 'h01')));
    expect(eventsOf(out.state, 'attack')[0]).toMatchObject({ attackScore: 6, defenseScore: 6, hit: 1 });
  });

  it('Armor higher than strength: 0 HP loss, guard does not decrease', () => {
    // An engaged Archer falls back to a plain Balanced Strike, base 4. The
    // hero Counters in Balanced: parry 6 plus armor 1 take the whole packet
    // to 0, so the guard pool is subtracted by 0 (absorbed 0, hpLoss 0).
    // (A Counter grants no pool of its own, so absorbed 0 is the whole
    // observable content of "guard does not decrease".)
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), enemyActor('e01', 'archer')],
      engagements: [['e01', 'h01']],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(1, 'balanced', 'counter', 'h01')));
    const attacks = eventsOf(out.state, 'attack');
    expect(attacks).toHaveLength(1);
    expect(attacks[0]).toMatchObject({ hit: 1, raw: 4, parry: 6, absorbed: 0, hpLoss: 0 });
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  it('Feint against D with guard 6 and armor 1: base 9 deals 8 HP on a legal hit; guard still 6', () => {
    // Round 4: both Sentinels Brace in Defensive (guard 6 each). The
    // party-archer companion cannot help here (it would Disengage or miss),
    // so the party-sentinel carries an explicit Prepare bonus (§15.3
    // preamble) and its follow-up Strike is absorbed by the full pool,
    // proving the Feint ignored the guard without consuming it.
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 4,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [
        heroActor(),
        companionActor('party-sentinel', { readyRound: 4 }),
        enemyActor('e01', 'sentinel'),
        enemyActor('e02', 'sentinel'),
      ],
      engagements: [
        ['e01', 'h01'],
        ['e02', 'h01'],
        ['c01', 'e01'],
        ['c01', 'e02'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    expect(open.frozenEnemyPlans.find((plan) => plan.actorId === 'e01')).toMatchObject({ actionId: 'brace', stance: 'defensive' });
    const out = accepted(submitRound(open, cmd(4, 'balanced', 'feint', 'e01')));
    const feint = eventsOf(out.state, 'attack').find((event) => event['actor'] === 'h01');
    expect(feint).toMatchObject({ hit: 1, raw: 9, absorbed: 0, hpLoss: 8 });
    const followUp = eventsOf(out.state, 'attack').find((event) => event['actor'] === 'c01');
    expect(followUp).toMatchObject({ hit: 1, absorbed: 6, hpLoss: 4 });
    expect(out.state.actors.find((actor) => actor.id === 'e01')).toMatchObject({ hp: 8 });
    expect(out.state.actors.find((actor) => actor.id === 'e02')).toMatchObject({ hp: 20 });
  });

  it('Two Strike 7 hits against a Counter in D: a total loss of 6 HP; one riposte', () => {
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
    const out = accepted(submitRound(open, cmd(1, 'defensive', 'counter', 'h01')));
    expect(out.state.actors[0]).toMatchObject({ hp: 34 });
    expect(eventsOf(out.state, 'riposte')).toHaveLength(1);
    expect(out.state.actors[1]).toMatchObject({ hp: 7 });
    expect(out.state.actors[2]).toMatchObject({ hp: 14 });
  });

  it('A missed direct attack on a Counter: token consumed; one riposte, if both alive and engaged', () => {
    // Round 3: the Brute Strikes Balanced and the Sentinel Heavies
    // Aggressive; both miss Defensive (4 and 5 against 6).
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 3,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), enemyActor('e01', 'brute'), enemyActor('e02', 'sentinel')],
      engagements: [
        ['e01', 'h01'],
        ['e02', 'h01'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(3, 'defensive', 'counter', 'h01')));
    const attacks = eventsOf(out.state, 'attack');
    expect(attacks).toHaveLength(2);
    expect(attacks[0]).toMatchObject({ actor: 'e01', hit: 0, counter: 1 });
    expect(attacks[1]).toMatchObject({ actor: 'e02', hit: 0, counter: 0 });
    expect(eventsOf(out.state, 'riposte')).toHaveLength(1);
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  it('Shot or Feint on a Counter: does not consume the Counter token and does not cause a riposte', () => {
    // The observable half: a free Archer's Shot at a Countering hero. (MVP
    // enemies never use Feint or Counterattack — rules §9 — so no Feint can
    // ever meet a Counter token; the row's Feint half is vacuous.)
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 2,
      actors: [
        heroActor({ groupId: 'g0' }),
        enemyActor('e01', 'archer', { groupId: 'g1' }),
        enemyActor('e02', 'raider', { groupId: 'g0' }),
      ],
      engagements: [['e02', 'h01']],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(1, 'defensive', 'counter', 'h01')));
    expect(eventsOf(out.state, 'attack').find((event) => event['actor'] === 'e01')).toMatchObject({ counter: 0 });
    // The token survives the Shot and still answers the Raider's Strike.
    expect(eventsOf(out.state, 'attack').find((event) => event['actor'] === 'e02')).toMatchObject({ counter: 1 });
    expect(eventsOf(out.state, 'riposte')).toHaveLength(1);
  });

  it('Attack cancelled by Disengage: does not trigger the Counter or Cover, because it is not a legal attempt', () => {
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), companionActor('party-sentinel'), enemyActor('e01', 'raider')],
      engagements: [['e01', 'h01']],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(1, 'balanced', 'disengage', 'h01')));
    expect(out.state.engagements).toEqual([]);
    expect(eventsOf(out.state, 'cancelled')).toHaveLength(1);
    expect(eventsOf(out.state, 'cancelled')[0]).toMatchObject({ reason: 'range_lost' });
    expect(eventsOf(out.state, 'attack')).toHaveLength(0);
    expect(eventsOf(out.state, 'riposte')).toHaveLength(0);
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  // Cover against two Shots (reference 11.5) is NOT proven here: 11.5's
  // intents (free Archers shooting the companion; companion Prepare in
  // Balanced) contradict the AI rules (§8.2, §10) and no CHOOSE state with
  // those plans passes frozen-plan recomputation (K6). See decision issue
  // #264; settling it in a test is forbidden by the ticket.
  it.skip('Cover against two Shots: reference 11.5 — hero 40 HP, companion 12 HP (blocked by #264)', () => {
    expect(true).toBe(true);
  });

  it('Mutual Cover: at most one redirection of a given attack', () => {
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), companionActor('party-sentinel'), enemyActor('e01', 'raider'), enemyActor('e02', 'raider')],
      engagements: [
        ['e01', 'h01'],
        ['e02', 'h01'],
        ['c01', 'e02'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(1, 'balanced', 'cover', 'c01')));
    const attacks = eventsOf(out.state, 'attack');
    expect(attacks).toHaveLength(2);
    expect(attacks[0]).toMatchObject({ actor: 'e01', target: 'h01', recipient: 'c01', redirected: 1 });
    expect(attacks[1]).toMatchObject({ actor: 'e02', target: 'c01', recipient: 'h01', redirected: 1 });
    expect(eventsOf(out.state, 'attack').filter((event) => event['redirected'] === 1)).toHaveLength(2);
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
    expect(out.state.actors[1]).toMatchObject({ hp: 24 });
  });

  it('Two sides Charge each other: the earlier movement creates the engagement; the later Charge gets no free blow', () => {
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), enemyActor('e01', 'raider')],
      engagements: [],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(1, 'aggressive', 'charge', 'e01')));
    expect(out.state.engagements).toEqual([['e01', 'h01']]);
    expect(out.state.actors[1]).toMatchObject({ hp: 8 });
    expect(eventsOf(out.state, 'cancelled').find((event) => event['reason'] === 'charge_failed')).toBeDefined();
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  it('Disengage from three engagements: all three edges removed; group unchanged', () => {
    const open = chooseOf({
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
    });
    const out = accepted(submitRound(open, cmd(1, 'balanced', 'disengage', 'h01')));
    expect(out.state.engagements).toEqual([]);
    expect(out.state.actors[0]?.groupId).toBe('g0');
    expect(eventsOf(out.state, 'cancelled')).toHaveLength(2);
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  it('Approach JOIN to a group of three characters: actor Near all three, without automatic engagements', () => {
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 2,
      actors: [
        heroActor({ groupId: 'g0' }),
        enemyActor('e01', 'raider', { groupId: 'g1' }),
        enemyActor('e02', 'raider', { groupId: 'g1' }),
        enemyActor('e03', 'raider', { groupId: 'g1' }),
      ],
      engagements: [],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(1, 'defensive', 'approach', 'e01')));
    expect(out.state.actors[0]?.groupId).toBe('g1');
    expect(out.state.engagements).toEqual([]);
  });

  it('Death of one of three engaged enemies: only that enemy’s edges disappear', () => {
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), enemyActor('e01', 'raider', { hp: 5 }), enemyActor('e02', 'raider'), enemyActor('e03', 'raider')],
      engagements: [
        ['e01', 'h01'],
        ['e02', 'h01'],
        ['e03', 'h01'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(1, 'aggressive', 'strike', 'e01')));
    expect(out.state.actors[1]).toMatchObject({ hp: 0 });
    expect(out.state.engagements).toEqual([
      ['e02', 'h01'],
      ['e03', 'h01'],
    ]);
    expect(eventsOf(out.state, 'eliminated')).toHaveLength(1);
  });

  it('Charge on a free Archer with a Shot: engagement before the blows; the announced Shot cancelled', () => {
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 2,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 2,
      actors: [heroActor({ groupId: 'g1' }), enemyActor('e01', 'archer', { groupId: 'g1' })],
      engagements: [],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(2, 'aggressive', 'charge', 'e01')));
    expect(out.state.engagements).toEqual([['e01', 'h01']]);
    expect(eventsOf(out.state, 'cancelled').find((event) => event['reason'] === 'shooter_engaged')).toBeDefined();
    expect(out.state.actors[1]).toMatchObject({ hp: 6 });
    expect(out.state.actors[0]).toMatchObject({ hp: 40, stamina: 9 });
  });

  it('Three candidates and killing one active: no slot refill in that round; at most two intents', () => {
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 2,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), enemyActor('e01', 'raider', { hp: 5 }), enemyActor('e02', 'raider'), enemyActor('e03', 'raider')],
      engagements: [
        ['e01', 'h01'],
        ['e02', 'h01'],
        ['e03', 'h01'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(2, 'aggressive', 'strike', 'e01')));
    const actors = eventsOf(out.state, 'attack')
      .filter((event) => event['round'] === 2)
      .map((event) => event['actor']);
    expect(actors).not.toContain('e01');
    expect(actors).not.toContain('e03');
    expect(actors).toEqual(['h01', 'e02']);
    expect(out.state.actors[0]).toMatchObject({ hp: 29 });
    const next = out.state.frozenEnemyPlans.find((plan) => plan.actorId === 'e03');
    expect(next?.attackSlot).toBe(true);
  });

  it('Prepare and the next Counter without triggering: bonus consumed on declaration and does not carry over', () => {
    const r1in: CombatState = {
      ...duelPlanState(),
      actors: [heroActor({ stamina: 5 }), enemyActor('e01', 'brute')],
    };
    const r1 = accepted(submitRound(chooseOf(r1in), cmd(1, 'balanced', 'prepare', 'h01'))).state;
    expect(r1.actors[0]).toMatchObject({ hp: 29, stamina: 10 });
    expect(r1.actors[0]?.readyRound).toBe(2);
    // Round 2 the Brute Prepares, so the hero's Counter never triggers — yet
    // the bonus is captured on declaration and gone afterwards.
    const r2 = accepted(submitRound(r1, cmd(2, 'balanced', 'counter', 'h01'))).state;
    expect(eventsOf(r2, 'declared').find((event) => event['actor'] === 'h01' && event['round'] === 2)).toMatchObject({
      preparedAccuracy: 2,
      preparedDamage: 3,
    });
    expect(r2.actors[0]?.readyRound).toBeNull();
    // Round 3 the hero Strikes without any leftover bonus: 6 to hit, 7 damage.
    const r3 = accepted(submitRound(r2, cmd(3, 'aggressive', 'strike', 'e01'))).state;
    const strike = eventsOf(r3, 'attack').find((event) => event['actor'] === 'h01');
    expect(strike).toMatchObject({ attackScore: 6, hpLoss: 7 });
    expect(r3.actors[1]).toMatchObject({ hp: 19 });
  });

  it('Prepare twice in a row: only one bonus for the next round, without stacking', () => {
    const r1in: CombatState = {
      ...duelPlanState(),
      actors: [heroActor({ stamina: 5 }), enemyActor('e01', 'brute')],
    };
    const r1 = accepted(submitRound(chooseOf(r1in), cmd(1, 'balanced', 'prepare', 'h01'))).state;
    const r2 = accepted(submitRound(r1, cmd(2, 'balanced', 'prepare', 'h01'))).state;
    expect(r2.actors[0]?.readyRound).toBe(3);
    const r3 = accepted(submitRound(r2, cmd(3, 'aggressive', 'strike', 'e01'))).state;
    const strike = eventsOf(r3, 'attack').find((event) => event['actor'] === 'h01');
    expect(strike).toMatchObject({ attackScore: 8, raw: 11, hpLoss: 10 });
    expect(r3.actors[1]).toMatchObject({ hp: 16 });
  });

  it('Counter used in r. 1: illegal in r. 2, legal from r. 3', () => {
    const r1 = accepted(submitRound(chooseOf(duelPlanState()), cmd(1, 'defensive', 'counter', 'h01'))).state;
    const clash = submitRound(r1, cmd(2, 'defensive', 'counter', 'h01'));
    expect(clash.ok).toBe(false);
    if (clash.ok) throw new Error('expected rejected');
    expect(clash.reason).toBe('on_cooldown');
    const r2 = accepted(submitRound(r1, cmd(2, 'balanced', 'brace', 'h01'))).state;
    expect(submitRound(r2, cmd(3, 'balanced', 'counter', 'h01')).ok).toBe(true);
  });

  it('Illegal target, stance, cost or old version: the whole state stays unchanged, without stamina being taken', () => {
    const cases: Array<[string, RoundCommand, string]> = [
      ['old version', cmd(2, 'defensive', 'counter', 'h01'), 'wrong_round'],
      ['illegal action', cmd(1, 'balanced', 'wait', 'h01'), 'invalid_target'],
      ['stance disallows', cmd(1, 'defensive', 'heavy', 'e01'), 'stance_disallows'],
      ['illegal target', cmd(1, 'aggressive', 'strike', 'h01'), 'invalid_target'],
      ['illegal cost', cmd(1, 'aggressive', 'heavy', 'e01'), 'insufficient_stamina'],
    ];
    for (const [label, command, reason] of cases) {
      const open = chooseOf(
        label === 'illegal cost'
          ? { ...duelPlanState(), actors: [heroActor({ stamina: 0 }), enemyActor('e01', 'brute')] }
          : duelPlanState(),
      );
      const before = JSON.stringify(open);
      const stamina = open.actors[0]?.stamina;
      const out = submitRound(open, command);
      expect(out.ok, label).toBe(false);
      if (out.ok) throw new Error(`expected rejected for ${label}`);
      expect(out.reason, label).toBe(reason);
      expect(JSON.stringify(open), label).toBe(before);
      expect(open.actors[0]?.stamina, label).toBe(stamina);
    }
    // Wrong phase rejects the same way on PLAN and on FINISHED.
    const plan = duelPlanState();
    const beforePlan = JSON.stringify(plan);
    const onPlan = submitRound(plan, cmd(1, 'balanced', 'brace', 'h01'));
    expect(onPlan.ok).toBe(false);
    expect(JSON.stringify(plan)).toBe(beforePlan);
    const finished = accepted(surrender(chooseOf(duelPlanState()))).state;
    const beforeFinished = JSON.stringify(finished);
    expect(submitRound(finished, cmd(1, 'balanced', 'brace', 'h01')).ok).toBe(false);
    expect(JSON.stringify(finished)).toBe(beforeFinished);
  });

  it('Death of the companion: its engagements removed; the fight continues with the hero', () => {
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), companionActor('party-sentinel', { hp: 1 }), enemyActor('e01', 'raider')],
      engagements: [
        ['c01', 'e01'],
        ['e01', 'h01'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(1, 'balanced', 'brace', 'h01')));
    expect(out.state.actors[1]).toMatchObject({ hp: 0 });
    expect(out.state.engagements).toEqual([['e01', 'h01']]);
    expect(out.state.result).toBeNull();
    expect(out.state.frozenCompanionPlan).toBeNull();
  });

  it('Death of the target before the companion’s blow: no automatic choice of another target', () => {
    const open = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), companionActor('party-archer'), enemyActor('e01', 'raider', { hp: 5 }), enemyActor('e02', 'raider')],
      engagements: [
        ['e01', 'h01'],
        ['e02', 'h01'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    const out = accepted(submitRound(open, cmd(1, 'aggressive', 'strike', 'e01')));
    expect(out.state.result).toBeNull();
    expect(eventsOf(out.state, 'cancelled').find((event) => event['actor'] === 'c01')).toMatchObject({
      reason: 'actor_or_target_dead',
    });
    expect(eventsOf(out.state, 'attack').filter((event) => event['actor'] === 'c01')).toHaveLength(0);
    expect(out.state.actors[0]).toMatchObject({ hp: 34 });
  });

  it('Terminal round: no further attacks and no regeneration after the result', () => {
    const won = accepted(submitRound(round30(40, 5), cmd(30, 'aggressive', 'strike', 'e01'))).state;
    expect(won.result).toBe('WIN');
    const finishedAt = won.log.findIndex((event) => event['type'] === 'finished');
    expect(finishedAt).toBeGreaterThanOrEqual(0);
    expect(won.log.slice(finishedAt + 1)).toHaveLength(0);
    expect(submitRound(won, cmd(30, 'balanced', 'brace', 'h01')).ok).toBe(false);
  });

  it('No end after 30 full rounds: DRAW_LIMIT, never WIN', () => {
    const out = accepted(submitRound(round30(40, 14), cmd(30, 'balanced', 'brace', 'h01')));
    expect(out.state.result).toBe('DRAW_LIMIT');
    expect(out.state.phase).toBe('FINISHED');
    expect(out.events[out.events.length - 1]).toMatchObject({ type: 'finished', result: 'DRAW_LIMIT' });
    // A round-30 killing blow is WIN, never DRAW_LIMIT.
    const kill = accepted(submitRound(round30(40, 5), cmd(30, 'aggressive', 'strike', 'e01')));
    expect(kill.state.result).toBe('WIN');
  });

});
