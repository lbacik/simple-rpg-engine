// P1c K7, K11–K13: resolveRound mechanics, determinism, rejection, results.
// States are built explicitly per the §15.3 preamble: positions, stances,
// plans and bonuses are set here, never inferred from a previous test. Where
// an AI intent is needed, a PLAN state is planned with planRound so the
// frozen plans always verify; unusual hit points are set explicitly.

import { describe, expect, it } from 'vitest';
import {
  planRound,
  previewRound,
  startCombat,
  submitRound,
  surrender,
} from '../src/engine/combat/index';
import type {
  CombatEvent,
  CombatState,
  RoundCommand,
  SubmitResult,
} from '../src/engine/combat/index';
import { companionActor, duelPlanState, enemyActor, heroActor } from './combat-core-fixtures';

function cmd(round: number, stance: RoundCommand['stance'], actionId: RoundCommand['actionId'], targetId: RoundCommand['targetId']): RoundCommand {
  return { round, stance, actionId, targetId };
}

function accepted(result: SubmitResult): { state: CombatState; events: CombatEvent[] } {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected accepted, got ${result.reason}`);
  return { state: result.state, events: result.events };
}

function rejected(result: SubmitResult): string {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected rejected');
  return result.reason;
}

function chooseOf(plan: CombatState): CombatState {
  return planRound(plan);
}

function eventsOf(state: CombatState, type: string): CombatEvent[] {
  return state.log.filter((event) => event['type'] === type);
}

function duelRound1(): CombatState {
  return chooseOf(duelPlanState());
}

describe('public contract', () => {
  it('exports startCombat, previewRound, submitRound and surrender', () => {
    expect(typeof startCombat).toBe('function');
    expect(typeof previewRound).toBe('function');
    expect(typeof submitRound).toBe('function');
    expect(typeof surrender).toBe('function');
  });

  it('startCombat validates §12 then plans the first round', () => {
    const before = JSON.stringify(duelPlanState());
    const result = startCombat(duelPlanState());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected accepted');
    expect(result.state.phase).toBe('CHOOSE');
    expect(result.state.round).toBe(1);
    expect(result.state.frozenEnemyPlans).toHaveLength(1);
    expect(result.events.map((event) => event['type'])).toEqual(['round-planned']);
    expect(JSON.stringify(duelPlanState())).toBe(before);
  });

  it('startCombat rejects a non-PLAN state with wrong_phase', () => {
    const result = startCombat(duelRound1());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejected');
    expect(result.reason).toBe('wrong_phase');
  });

  it('startCombat rejects a bad rulesVersion with issues attached', () => {
    const result = startCombat({ ...duelPlanState(), rulesVersion: 'tactical-2' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejected');
    expect(result.reason).toBe('invalid_target');
    expect(result.issues?.length).toBeGreaterThan(0);
  });
});

// §11.1 and §11.4 goldens moved to combat-core-golden.test.ts (K8); the
// mechanics below stay here as the K7 evidence.

describe('hit ties and reductions', () => {
  it('a 6-against-6 tie hits (K7)', () => {
    const three: CombatState = chooseOf({
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
    const out = accepted(submitRound(three, cmd(1, 'defensive', 'counter', 'h01')));
    const first = eventsOf(out.state, 'attack')[0];
    expect(first).toMatchObject({ actor: 'e01', attackScore: 6, defenseScore: 6, hit: 1, counter: 1 });
    // Parry 6 plus armor 1 absorb the whole Strike 7.
    expect(first).toMatchObject({ raw: 7, parry: 6, absorbed: 0, hpLoss: 0 });
    // The riposte answers only the first blow; the second costs 6 HP.
    expect(eventsOf(out.state, 'riposte')).toHaveLength(1);
    expect(out.state.actors[0]).toMatchObject({ hp: 34 });
    expect(out.state.actors[1]).toMatchObject({ hp: 7 });
  });

  it('armor absorbs a weak hit to 0 without touching guard (K7)', () => {
    const archer: CombatState = chooseOf({
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
    // The engaged Archer replaces its Shot with a plain Balanced Strike, base 4.
    const out = accepted(submitRound(archer, cmd(1, 'balanced', 'counter', 'h01')));
    const attack = eventsOf(out.state, 'attack')[0];
    expect(attack).toMatchObject({ hit: 1, raw: 4, parry: 6, absorbed: 0, hpLoss: 0 });
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  it('Feint against Defensive ignores guard and deals base 9 minus armor (K7)', () => {
    const sentinel: CombatState = chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), enemyActor('e01', 'sentinel')],
      engagements: [['e01', 'h01']],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
    // Round 1 Sentinel braces in Defensive: guard 6, stance D.
    const out = accepted(submitRound(sentinel, cmd(1, 'balanced', 'feint', 'e01')));
    const attack = eventsOf(out.state, 'attack')[0];
    expect(attack).toMatchObject({ hit: 1, raw: 9, absorbed: 0, hpLoss: 8 });
    expect(out.state.actors[1]).toMatchObject({ hp: 12 });
  });
});

describe('Counter and riposte', () => {
  function brutePlusSentinel(): CombatState {
    return chooseOf({
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
  }

  it('a missed direct attack still consumes the token and ripostes (K7)', () => {
    // Round 3: Brute Strikes Balanced, Sentinel Heavies Aggressive; both miss
    // Defensive (4 and 5 against 6).
    const out = accepted(submitRound(brutePlusSentinel(), cmd(3, 'defensive', 'counter', 'h01')));
    const attacks = eventsOf(out.state, 'attack');
    expect(attacks).toHaveLength(2);
    expect(attacks[0]).toMatchObject({ actor: 'e01', hit: 0, counter: 1 });
    expect(attacks[1]).toMatchObject({ actor: 'e02', hit: 0, counter: 0 });
    expect(eventsOf(out.state, 'riposte')).toHaveLength(1);
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  it('a Shot never consumes the Counter token and never ripostes (K7)', () => {
    const mixed: CombatState = chooseOf({
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
    const out = accepted(submitRound(mixed, cmd(1, 'defensive', 'counter', 'h01')));
    const shot = eventsOf(out.state, 'attack').find((event) => event['actor'] === 'e01');
    expect(shot).toMatchObject({ hit: 0, counter: 0 });
    // Feint and Counter never meet in the MVP enemy set: enemies use neither
    // card, so the Shot above is the observable half of the §15.3 row.
    expect(eventsOf(out.state, 'riposte')).toHaveLength(1);
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
    expect(out.state.actors[2]).toMatchObject({ hp: 7 });
  });

  it('an attack cancelled by Disengage triggers neither Counter nor Cover (K7)', () => {
    const setup: CombatState = chooseOf({
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
    // The Sentinel covers the hero (open slot on the hero); the hero slips away.
    const out = accepted(submitRound(setup, cmd(1, 'balanced', 'disengage', 'h01')));
    expect(out.state.engagements).toEqual([]);
    expect(eventsOf(out.state, 'cancelled')).toHaveLength(1);
    expect(eventsOf(out.state, 'cancelled')[0]).toMatchObject({ reason: 'range_lost' });
    expect(eventsOf(out.state, 'attack')).toHaveLength(0);
    expect(eventsOf(out.state, 'riposte')).toHaveLength(0);
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  it('Counter used in round 1 is on cooldown in round 2 and legal from round 3 (K7)', () => {
    const r1 = accepted(submitRound(duelRound1(), cmd(1, 'defensive', 'counter', 'h01'))).state;
    expect(rejected(submitRound(r1, cmd(2, 'defensive', 'counter', 'h01')))).toBe('on_cooldown');
    const r2 = accepted(submitRound(r1, cmd(2, 'balanced', 'brace', 'h01'))).state;
    const r3 = submitRound(r2, cmd(3, 'balanced', 'counter', 'h01'));
    expect(r3.ok).toBe(true);
  });
});

describe('Cover redirection', () => {
  function twoRaidersOnCompanion(): CombatState {
    return chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round: 1,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 1,
      actors: [heroActor(), companionActor('party-archer', { stamina: 0 }), enemyActor('e01', 'raider'), enemyActor('e02', 'raider')],
      engagements: [
        ['c01', 'e01'],
        ['c01', 'e02'],
        ['e01', 'h01'],
        ['e02', 'h01'],
      ],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
  }

  it('redirects the first attack on the ward; the second hits it normally (K7)', () => {
    // Both Raiders strike the 18 HP companion; the hero covers it in Balanced.
    // The companion has 0 stamina so it Prepares instead of Disengaging away.
    const out = accepted(submitRound(twoRaidersOnCompanion(), cmd(1, 'balanced', 'cover', 'c01')));
    const attacks = eventsOf(out.state, 'attack');
    expect(attacks).toHaveLength(2);
    expect(attacks[0]).toMatchObject({ target: 'c01', recipient: 'h01', redirected: 1, absorbed: 6, hpLoss: 0 });
    expect(attacks[1]).toMatchObject({ target: 'c01', recipient: 'c01', redirected: 0, hpLoss: 7 });
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
    expect(out.state.actors[1]).toMatchObject({ hp: 11 });
  });

  it('mutual Cover redirects at most once per attack (K7)', () => {
    const setup: CombatState = chooseOf({
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
    // e01 strikes the hero (redirected to the covering Sentinel), e02 strikes
    // the Sentinel (redirected to the covering hero). Neither chains further.
    const out = accepted(submitRound(setup, cmd(1, 'balanced', 'cover', 'c01')));
    const attacks = eventsOf(out.state, 'attack');
    expect(attacks).toHaveLength(2);
    expect(attacks[0]).toMatchObject({ actor: 'e01', target: 'h01', recipient: 'c01', redirected: 1 });
    expect(attacks[1]).toMatchObject({ actor: 'e02', target: 'c01', recipient: 'h01', redirected: 1 });
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
    expect(out.state.actors[1]).toMatchObject({ hp: 24 });
  });
});

describe('Charge, Prepare and movements', () => {
  function heroNearArcher(round: number): CombatState {
    return chooseOf({
      rulesVersion: 'simple-rpg-engine-stance-cards-1.0',
      round,
      phase: 'PLAN',
      result: null,
      nextGroupSerial: 2,
      actors: [heroActor({ groupId: 'g1' }), enemyActor('e01', 'archer', { groupId: 'g1' })],
      engagements: [],
      frozenEnemyPlans: [],
      frozenCompanionPlan: null,
      log: [],
    });
  }

  it('Charge engages before the blows and cancels the announced Shot (K7)', () => {
    const out = accepted(submitRound(heroNearArcher(2), cmd(2, 'aggressive', 'charge', 'e01')));
    expect(out.state.engagements).toEqual([['e01', 'h01']]);
    expect(eventsOf(out.state, 'cancelled').find((event) => event['reason'] === 'shooter_engaged')).toBeDefined();
    expect(out.state.actors[1]).toMatchObject({ hp: 6 });
    expect(out.state.actors[0]).toMatchObject({ hp: 40, stamina: 9 });
  });

  it('two Chargers: the earlier movement wins, the later blow is lost (K7)', () => {
    const near: CombatState = chooseOf({
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
    // Round-1 Raider, free and Near, Charges Aggressive; so does the hero.
    const out = accepted(submitRound(near, cmd(1, 'aggressive', 'charge', 'e01')));
    expect(out.state.engagements).toEqual([['e01', 'h01']]);
    expect(out.state.actors[1]).toMatchObject({ hp: 8 });
    expect(eventsOf(out.state, 'cancelled').find((event) => event['reason'] === 'charge_failed')).toBeDefined();
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  it('Disengage removes three engagements and keeps the group (K7)', () => {
    const surrounded: CombatState = chooseOf({
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
    const out = accepted(submitRound(surrounded, cmd(1, 'balanced', 'disengage', 'h01')));
    expect(out.state.engagements).toEqual([]);
    expect(out.state.actors[0]?.groupId).toBe('g0');
    // Only the two slot holders announced Strikes; the third waits Guarded.
    expect(surrounded.frozenEnemyPlans.find((plan) => plan.actorId === 'e03')?.actionId).toBe('wait');
    expect(eventsOf(out.state, 'cancelled')).toHaveLength(2);
    expect(out.state.actors[0]).toMatchObject({ hp: 40 });
  });

  it('Approach JOIN reaches a group of three Near without engagements (K7)', () => {
    const far: CombatState = chooseOf({
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
    const out = accepted(submitRound(far, cmd(1, 'defensive', 'approach', 'e01')));
    expect(out.state.actors[0]?.groupId).toBe('g1');
    expect(out.state.engagements).toEqual([]);
  });

  it('Withdraw moves to a fresh Far group and advances the serial (K7)', () => {
    const free: CombatState = chooseOf({
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
    const out = accepted(submitRound(free, cmd(1, 'balanced', 'withdraw', null)));
    expect(out.state.actors[0]?.groupId).toBe('g1');
    expect(out.state.nextGroupSerial).toBe(2);
    expect(eventsOf(out.state, 'moved')[0]).toMatchObject({ action: 'withdraw', success: 1, group: 'g1' });
  });

  it('only the dead enemy loses its edges (K7)', () => {
    const setup: CombatState = chooseOf({
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
    const out = accepted(submitRound(setup, cmd(1, 'aggressive', 'strike', 'e01')));
    expect(out.state.actors[1]).toMatchObject({ hp: 0 });
    expect(out.state.engagements).toEqual([
      ['e02', 'h01'],
      ['e03', 'h01'],
    ]);
    expect(eventsOf(out.state, 'eliminated')).toHaveLength(1);
  });

  it('killing an active candidate refills no slot in that round (K7)', () => {
    const setup: CombatState = chooseOf({
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
    // Round 2 Raiders Heavy Aggressive; e01/e02 hold the slots, e03 waits.
    const out = accepted(submitRound(setup, cmd(2, 'aggressive', 'strike', 'e01')));
    const actors = eventsOf(out.state, 'attack').map((event) => event['actor']);
    expect(actors).not.toContain('e01');
    expect(actors).not.toContain('e03');
    expect(actors).toEqual(['h01', 'e02']);
    expect(out.state.actors[0]).toMatchObject({ hp: 29 });
    // The waiting Raider rotates into a slot next round through wait age.
    const next = out.state.frozenEnemyPlans.find((plan) => plan.actorId === 'e03');
    expect(next?.attackSlot).toBe(true);
  });

  it('Prepare then an untriggered Counter consumes the bonus (K7)', () => {
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

  it('Prepare twice grants a single bonus for the next round (K7)', () => {
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
});

describe('companions in resolution', () => {
  it('death of the companion removes its edges and the fight continues (K7)', () => {
    const setup: CombatState = chooseOf({
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
    // The Raider strikes the 1 HP Sentinel; the Sentinel answers first.
    const out = accepted(submitRound(setup, cmd(1, 'balanced', 'brace', 'h01')));
    expect(out.state.actors[1]).toMatchObject({ hp: 0 });
    expect(out.state.engagements).toEqual([['e01', 'h01']]);
    expect(out.state.result).toBeNull();
    expect(out.state.frozenCompanionPlan).toBeNull();
  });

  it('no automatic retarget when the companion target dies first (K7)', () => {
    const setup: CombatState = chooseOf({
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
    // The hero kills e01 before the companion's Shot; the Shot is lost rather
    // than retargeted at e02, while e02 still strikes the hero.
    const out = accepted(submitRound(setup, cmd(1, 'aggressive', 'strike', 'e01')));
    expect(out.state.result).toBeNull();
    expect(eventsOf(out.state, 'cancelled').find((event) => event['actor'] === 'c01')).toMatchObject({
      reason: 'actor_or_target_dead',
    });
    expect(eventsOf(out.state, 'attack').filter((event) => event['actor'] === 'c01')).toHaveLength(0);
    expect(out.state.actors[0]).toMatchObject({ hp: 34 });
  });
});

describe('preview', () => {
  it('previewRound projects the same resolution without mutating or planning', () => {
    const state = duelRound1();
    const before = JSON.stringify(state);
    const preview = previewRound(state, cmd(1, 'defensive', 'counter', 'h01'));
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error('expected preview');
    expect(JSON.stringify(state)).toBe(before);

    const sub = accepted(submitRound(state, cmd(1, 'defensive', 'counter', 'h01')));
    expect(preview.events).toEqual(sub.events.slice(0, preview.events.length));
    expect(preview.projected.actors).toEqual(sub.state.actors);
    expect(preview.projected.round).toBe(sub.state.round);
    expect(preview.projected.result).toBe(sub.state.result);
    // No planning on preview: the projection waits in PLAN with empty plans.
    expect(preview.projected.phase).toBe('PLAN');
    expect(preview.projected.frozenEnemyPlans).toEqual([]);
  });

  it('previewRound rejects like submitRound and mutates nothing', () => {
    const state = duelRound1();
    const before = JSON.stringify(state);
    const preview = previewRound(state, cmd(2, 'defensive', 'counter', 'h01'));
    expect(preview.ok).toBe(false);
    if (preview.ok) throw new Error('expected rejected');
    expect(preview.reason).toBe('wrong_round');
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('determinism and replay (K11)', () => {
  function playDuel(): CombatState {
    let state = duelRound1();
    state = accepted(submitRound(state, cmd(1, 'defensive', 'counter', 'h01'))).state;
    state = accepted(submitRound(state, cmd(2, 'balanced', 'feint', 'e01'))).state;
    return accepted(submitRound(state, cmd(3, 'aggressive', 'heavy', 'e01'))).state;
  }

  it('initial state plus command list replays to an identical state and log', () => {
    const first = playDuel();
    const second = playDuel();
    expect(second).toEqual(first);
    expect(second.log).toEqual(first.log);
    expect(first.result).toBe('WIN');
  });
});

describe('rejection without mutation (K12)', () => {
  function staminaOf(state: CombatState): number | null {
    return state.actors[0]?.stamina ?? null;
  }

  it.each([
    ['wrong round', cmd(2, 'defensive', 'counter', 'h01'), 'wrong_round'],
    ['illegal action', cmd(1, 'balanced', 'wait' as RoundCommand['actionId'], 'h01'), 'invalid_target'],
    ['stance disallows', cmd(1, 'defensive', 'heavy', 'e01'), 'stance_disallows'],
    ['illegal target', cmd(1, 'aggressive', 'strike', 'h01'), 'invalid_target'],
  ])('%s returns a reason code and mutates nothing', (_label, command, reason) => {
    const state = duelRound1();
    const before = JSON.stringify(state);
    const stamina = staminaOf(state);
    expect(rejected(submitRound(state, command))).toBe(reason);
    expect(JSON.stringify(state)).toBe(before);
    expect(staminaOf(state)).toBe(stamina);
  });

  it('wrong phase rejects on PLAN and on FINISHED', () => {
    const plan = duelPlanState();
    const beforePlan = JSON.stringify(plan);
    expect(rejected(submitRound(plan, cmd(1, 'balanced', 'brace', 'h01')))).toBe('wrong_phase');
    expect(JSON.stringify(plan)).toBe(beforePlan);

    const finished = accepted(surrender(duelRound1())).state;
    const beforeFinished = JSON.stringify(finished);
    expect(rejected(submitRound(finished, cmd(1, 'balanced', 'brace', 'h01')))).toBe('wrong_phase');
    expect(JSON.stringify(finished)).toBe(beforeFinished);
  });

  it('insufficient stamina rejects without taking stamina', () => {
    const setup: CombatState = {
      ...duelRound1(),
      actors: [heroActor({ stamina: 0 }), enemyActor('e01', 'raider')],
    };
    // Re-plan after the stamina change: hero stamina never steers the AI.
    const replanned = chooseOf({ ...setup, phase: 'PLAN', frozenEnemyPlans: [], frozenCompanionPlan: null });
    const before = JSON.stringify(replanned);
    expect(rejected(submitRound(replanned, cmd(1, 'aggressive', 'heavy', 'e01')))).toBe('insufficient_stamina');
    expect(JSON.stringify(replanned)).toBe(before);
    expect(staminaOf(replanned)).toBe(0);
  });

  it('surrender outside CHOOSE rejects without mutation', () => {
    const plan = duelPlanState();
    const beforePlan = JSON.stringify(plan);
    const noSurrender = surrender(plan);
    expect(noSurrender.ok).toBe(false);
    expect(JSON.stringify(plan)).toBe(beforePlan);

    const finished = accepted(surrender(duelRound1())).state;
    const beforeFinished = JSON.stringify(finished);
    expect(surrender(finished).ok).toBe(false);
    expect(JSON.stringify(finished)).toBe(beforeFinished);
  });

  it('surrender with tampered frozen plans rejects without mutation', () => {
    const tampered: CombatState = {
      ...duelRound1(),
      frozenEnemyPlans: [
        {
          actorId: 'e01',
          stance: 'balanced',
          actionId: 'brace',
          targetId: 'e01',
          moveVariant: null,
          wasCandidate: false,
          attackSlot: false,
          baseDamage: 0,
          priority: 0,
        },
      ],
    };
    const before = JSON.stringify(tampered);
    const out = surrender(tampered);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('expected rejected');
    expect(out.reason).toBe('wrong_phase');
    expect(JSON.stringify(tampered)).toBe(before);
  });
});

describe('results (K13)', () => {
  it('LOSS_SURRENDER comes from CHOOSE only', () => {
    const out = surrender(duelRound1());
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected accepted');
    expect(out.state.result).toBe('LOSS_SURRENDER');
    expect(out.state.phase).toBe('FINISHED');
    expect(out.events.map((event) => event['type'])).toEqual(['finished']);
  });

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

  it('DRAW_LIMIT applies after 30 full rounds', () => {
    const out = accepted(submitRound(round30(40, 14), cmd(30, 'balanced', 'brace', 'h01')));
    expect(out.state.result).toBe('DRAW_LIMIT');
    expect(out.state.phase).toBe('FINISHED');
    expect(out.events[out.events.length - 1]).toMatchObject({ type: 'finished', result: 'DRAW_LIMIT' });
  });

  it('a round-30 killing blow is WIN, never DRAW_LIMIT', () => {
    const out = accepted(submitRound(round30(40, 5), cmd(30, 'aggressive', 'strike', 'e01')));
    expect(out.state.result).toBe('WIN');
  });

  it('no attacks or regeneration happen after a terminal result', () => {
    const won = accepted(submitRound(round30(40, 5), cmd(30, 'aggressive', 'strike', 'e01'))).state;
    const log = won.log;
    const finishedAt = log.findIndex((event) => event['type'] === 'finished');
    expect(finishedAt).toBeGreaterThanOrEqual(0);
    expect(log.slice(finishedAt + 1)).toHaveLength(0);
    // Committing anything after FINISHED is rejected, so nothing can follow.
    expect(rejected(submitRound(won, cmd(30, 'balanced', 'brace', 'h01')))).toBe('wrong_phase');
  });

  it('events carry only ids and numbers, plus round and a sequence number', () => {
    let state = duelRound1();
    state = accepted(submitRound(state, cmd(1, 'defensive', 'counter', 'h01'))).state;
    state = accepted(submitRound(state, cmd(2, 'balanced', 'feint', 'e01'))).state;
    state = accepted(submitRound(state, cmd(3, 'aggressive', 'heavy', 'e01'))).state;
    state.log.forEach((event, index) => {
      expect(typeof event.round).toBe('number');
      expect(typeof event.seq).toBe('number');
      expect(event.seq).toBe(index);
      for (const [key, value] of Object.entries(event)) {
        if (key === 'round' || key === 'seq') continue;
        expect(['string', 'number']).toContain(typeof value);
      }
    });
  });
});
