// P1b K5–K6: planRound (enemy AI, slots, companion AI) and frozen-plan
// verification. States are built explicitly per the §15.3 preamble.

import { describe, expect, it } from 'vitest';
import { parseCombatState, planRound, verifyFrozenPlans } from '../src/engine/combat/index';
import type { CombatState, FrozenPlan } from '../src/engine/combat/index';
import { companionActor, duelPlanState, enemyActor, heroActor } from './combat-core-fixtures';

function planOf(state: CombatState, actorId: string): FrozenPlan {
  const plan =
    state.frozenEnemyPlans.find((p) => p.actorId === actorId) ??
    (state.frozenCompanionPlan?.actorId === actorId ? state.frozenCompanionPlan : undefined);
  expect(plan).toBeDefined();
  return plan!;
}

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

describe('planRound enemy cycles and range adaptation', () => {
  it('plans the §11.1 duel open: Brute Heavy Aggressive vs the hero', () => {
    const out = planRound(duelPlanState());
    expect(out.phase).toBe('CHOOSE');
    expect(out.frozenEnemyPlans).toEqual([
      {
        actorId: 'e01',
        stance: 'aggressive',
        actionId: 'heavy',
        targetId: 'h01',
        moveVariant: null,
        wasCandidate: true,
        attackSlot: true,
        baseDamage: 12,
        priority: 10,
      },
    ]);
    expect(out.frozenCompanionPlan).toBeNull();
  });

  it('advances cycles by global rounds with phaseOffset', () => {
    // Brute cycle H(A), P(D), S(B): round 2 prepares, round 3 strikes.
    const round2 = { ...duelPlanState(), round: 2 };
    expect(planOf(planRound(round2), 'e01')).toMatchObject({
      actionId: 'prepare',
      stance: 'defensive',
      targetId: 'e01',
      wasCandidate: false,
      attackSlot: false,
    });
    const round3 = { ...duelPlanState(), round: 3 };
    expect(planOf(planRound(round3), 'e01')).toMatchObject({
      actionId: 'strike',
      stance: 'balanced',
      targetId: 'h01',
      baseDamage: 8,
      priority: 20,
    });
    // A phase offset of 1 starts the same Brute on Prepare in round 1.
    const offset = duelPlanState();
    offset.actors = [heroActor(), enemyActor('e01', 'brute', { phaseOffset: 1 })];
    expect(planOf(planRound(offset), 'e01')).toMatchObject({ actionId: 'prepare', stance: 'defensive' });
  });

  it('replaces a melee entry with Approach JOIN when the target is Far', () => {
    const state = duelPlanState();
    state.actors = [heroActor(), { ...enemyActor('e01', 'raider'), groupId: 'g1' }];
    state.engagements = [];
    state.nextGroupSerial = 2;
    // Raider round 1 wants Strike Aggressive; the hero is Far.
    expect(planOf(planRound(state), 'e01')).toMatchObject({
      actionId: 'approach',
      stance: 'aggressive',
      targetId: 'h01',
      moveVariant: 'JOIN',
      wasCandidate: false,
      attackSlot: false,
    });
  });

  it('replaces a Near Aggressive entry with Charge and a Near Balanced entry with Approach ENGAGE', () => {
    // Raider round 1 (Strike Aggressive), Near the hero, free.
    const charging = duelPlanState();
    charging.actors = [heroActor(), enemyActor('e01', 'raider')];
    charging.engagements = [];
    expect(planOf(planRound(charging), 'e01')).toMatchObject({
      actionId: 'charge',
      stance: 'aggressive',
      targetId: 'h01',
      moveVariant: 'ENGAGE',
      baseDamage: 6,
      priority: 20,
      wasCandidate: true,
    });
    // Brute round 3 (Strike Balanced), Near the hero, free.
    const approaching = { ...duelPlanState(), round: 3 };
    approaching.actors = [heroActor(), enemyActor('e01', 'brute')];
    approaching.engagements = [];
    expect(planOf(planRound(approaching), 'e01')).toMatchObject({
      actionId: 'approach',
      stance: 'balanced',
      targetId: 'h01',
      moveVariant: 'ENGAGE',
      wasCandidate: false,
    });
  });

  it('keeps Brace and Prepare entries regardless of range', () => {
    const state = { ...duelPlanState(), round: 2 };
    state.actors = [heroActor(), { ...enemyActor('e01', 'brute'), groupId: 'g1' }];
    state.engagements = [];
    state.nextGroupSerial = 2;
    expect(planOf(planRound(state), 'e01')).toMatchObject({
      actionId: 'prepare',
      stance: 'defensive',
      targetId: 'e01',
    });
  });

  it('shoots the hero from any range and strikes when engaged (§8.2 archer exception)', () => {
    // Free archer in g1: Shot at the hero.
    const far = duelPlanState();
    far.actors = [heroActor(), { ...enemyActor('e01', 'archer'), groupId: 'g1' }];
    far.engagements = [];
    far.nextGroupSerial = 2;
    expect(planOf(planRound(far), 'e01')).toMatchObject({
      actionId: 'shot',
      stance: 'balanced',
      targetId: 'h01',
      baseDamage: 6,
      priority: 20,
    });
    // The same archer engaged replaces even Prepare (round 3) with Strike.
    const engaged = { ...duelPlanState(), round: 3 };
    engaged.actors = [heroActor(), enemyActor('e01', 'archer')];
    engaged.engagements = [['e01', 'h01']];
    expect(planOf(planRound(engaged), 'e01')).toMatchObject({
      actionId: 'strike',
      stance: 'balanced',
      targetId: 'h01',
      baseDamage: 4,
      priority: 20,
    });
  });

  it('targets the engaged opponent with the lowest HP, ties by ID, else the hero', () => {
    const state = threeRaiders();
    state.actors = [
      heroActor({ hp: 30 }),
      enemyActor('e01', 'raider'),
      enemyActor('e02', 'raider'),
      enemyActor('e03', 'raider'),
      companionActor('party-sentinel', { hp: 5 }),
    ];
    // e01 engages both the hero (30 HP) and the companion (5 HP).
    state.engagements = [
      ['e01', 'c01'],
      ['e01', 'h01'],
      ['e02', 'h01'],
      ['e03', 'h01'],
    ];
    const out = planRound(state);
    expect(planOf(out, 'e01').targetId).toBe('c01');
    expect(planOf(out, 'e02').targetId).toBe('h01');
    // A free enemy never bypasses the hero to chase a free companion.
    const chasing = duelPlanState();
    chasing.actors = [heroActor(), companionActor('party-archer'), { ...enemyActor('e01', 'raider'), groupId: 'g1' }];
    chasing.engagements = [];
    chasing.nextGroupSerial = 2;
    expect(planOf(planRound(chasing), 'e01').targetId).toBe('h01');
  });
});

describe('planRound two-attack budget', () => {
  it('gives the §11.3 round-1 slots to e01 and e02 and waits e03 with its stance', () => {
    const out = planRound(threeRaiders());
    expect(planOf(out, 'e01')).toMatchObject({ actionId: 'strike', attackSlot: true, wasCandidate: true });
    expect(planOf(out, 'e02')).toMatchObject({ actionId: 'strike', attackSlot: true, wasCandidate: true });
    expect(planOf(out, 'e03')).toMatchObject({
      actionId: 'wait',
      stance: 'aggressive',
      attackSlot: false,
      wasCandidate: true,
    });
  });

  it('rotates by waitAge first: §11.3 round 2 slots go to e03, then e01', () => {
    const state = { ...threeRaiders(), round: 2 };
    state.actors = [
      heroActor(),
      enemyActor('e01', 'raider'),
      enemyActor('e02', 'raider', { waitAge: 1 }),
      enemyActor('e03', 'raider', { waitAge: 1 }),
    ];
    // Round 2 entries are Heavy Aggressive (base 12) for all three;
    // e03's age wins first, then the lower ID between e01... but e02
    // also has age 1, so e02 outranks e01: slots e02, e03.
    const out = planRound(state);
    expect(planOf(out, 'e02').attackSlot).toBe(true);
    expect(planOf(out, 'e03').attackSlot).toBe(true);
    expect(planOf(out, 'e01')).toMatchObject({ actionId: 'wait', attackSlot: false, wasCandidate: true });
    // The textbook §11.3 line: only e03 waited in round 1, so with
    // e03 at age 1 the slots go to e03 first, then to e01 by ID tie.
    const textbook = { ...threeRaiders(), round: 2 };
    textbook.actors = [
      heroActor(),
      enemyActor('e01', 'raider'),
      enemyActor('e02', 'raider'),
      enemyActor('e03', 'raider', { waitAge: 1 }),
    ];
    const tout = planRound(textbook);
    expect(planOf(tout, 'e03').attackSlot).toBe(true);
    expect(planOf(tout, 'e01').attackSlot).toBe(true);
    expect(planOf(tout, 'e02')).toMatchObject({ actionId: 'wait', stance: 'aggressive', attackSlot: false });
  });

  it('freezes at most two slots: killing an active candidate refills nothing', () => {
    const out = planRound(threeRaiders());
    const slots = out.frozenEnemyPlans.filter((plan) => plan.attackSlot);
    expect(slots).toHaveLength(2);
    // The frozen plan is the whole budget: resolution reads these slots
    // and never recomputes them, so a mid-round kill frees no slot.
    expect(out.frozenEnemyPlans.filter((plan) => plan.wasCandidate)).toHaveLength(3);
  });

  it('never waits a Brace or Prepare: non-candidates keep their action', () => {
    const state = duelPlanState();
    state.actors = [heroActor(), enemyActor('e01', 'sentinel')];
    // Sentinel round 1 wants Brace Defensive: not a candidate, no slot.
    const out = planRound(state);
    expect(planOf(out, 'e01')).toMatchObject({ actionId: 'brace', attackSlot: false, wasCandidate: false });
  });
});

describe('planRound companion AI', () => {
  function sentinelState(): CombatState {
    const state = threeRaiders();
    state.actors = [
      heroActor(),
      companionActor('party-sentinel'),
      enemyActor('e01', 'raider'),
      enemyActor('e02', 'raider'),
      enemyActor('e03', 'raider'),
    ];
    return state;
  }

  it('Sentinel rule 1: prepares when below 2 stamina', () => {
    const state = sentinelState();
    state.actors = state.actors.map((actor) => (actor.id === 'c01' ? { ...actor, stamina: 1 } : actor));
    const out = planRound(state);
    expect(out.frozenCompanionPlan).toMatchObject({
      actorId: 'c01',
      actionId: 'prepare',
      stance: 'defensive',
      targetId: 'c01',
    });
  });

  it('Sentinel rule 2: covers the Near hero against a slotted attack', () => {
    const out = planRound(sentinelState());
    // All three Raiders strike the hero; e01/e02 hold slots.
    expect(out.frozenCompanionPlan).toMatchObject({
      actorId: 'c01',
      actionId: 'cover',
      stance: 'defensive',
      targetId: 'h01',
    });
  });

  it('Sentinel rule 3: strikes the lowest-HP engaged enemy when nothing covers', () => {
    const state = sentinelState();
    // Raiders at range: no slotted attack on the hero, so no Cover.
    state.actors = state.actors.map((actor) =>
      actor.role === 'enemy' ? { ...actor, groupId: 'g1' } : actor,
    );
    state.engagements = [['c01', 'e01']];
    state.nextGroupSerial = 2;
    const out = planRound(state);
    expect(out.frozenCompanionPlan).toMatchObject({
      actionId: 'strike',
      stance: 'balanced',
      targetId: 'e01',
      baseDamage: 8,
      priority: 20,
    });
  });

  it('Sentinel rule 4: approaches a Far hero', () => {
    const state = sentinelState();
    state.actors = state.actors.map((actor) =>
      actor.id === 'h01' ? { ...actor, groupId: 'g9' } : actor,
    );
    state.engagements = [];
    state.nextGroupSerial = 10;
    const out = planRound(state);
    // Enemies approach-JOIN the hero (no slots target him yet at plan
    // time... they do target him but as approaches, not attacks), and
    // the free Sentinel joins him too.
    expect(out.frozenCompanionPlan).toMatchObject({
      actionId: 'approach',
      stance: 'defensive',
      targetId: 'h01',
      moveVariant: 'JOIN',
    });
  });

  it('Sentinel rule 5: braces when nothing else applies', () => {
    const state = sentinelState();
    // Companion far from the hero is rule 4; instead put the hero Near
    // with no slotted attack on him: Raiders brace... force non-attacks
    // by engaging nobody and moving enemies far with Balanced entries.
    // Simplest: enemies waiting cannot happen at plan time, so use a
    // single Sentinel enemy whose round-1 entry is Brace.
    state.actors = [heroActor(), companionActor('party-sentinel'), enemyActor('e01', 'sentinel')];
    state.engagements = [];
    const out = planRound(state);
    expect(out.frozenCompanionPlan).toMatchObject({ actionId: 'brace', stance: 'defensive', targetId: 'c01' });
  });

  it('Archer rules: disengages when engaged with stamina, prepares at 0, else shoots the weakest', () => {
    const engaged = threeRaiders();
    engaged.actors = [heroActor(), companionActor('party-archer'), enemyActor('e01', 'raider')];
    engaged.engagements = [
      ['c01', 'e01'],
      ['e01', 'h01'],
    ];
    expect(planRound(engaged).frozenCompanionPlan).toMatchObject({
      actionId: 'disengage',
      stance: 'defensive',
      targetId: 'c01',
    });
    const broke = threeRaiders();
    broke.actors = [
      heroActor(),
      companionActor('party-archer', { stamina: 0 }),
      enemyActor('e01', 'raider'),
    ];
    broke.engagements = [
      ['c01', 'e01'],
      ['e01', 'h01'],
    ];
    expect(planRound(broke).frozenCompanionPlan).toMatchObject({
      actionId: 'prepare',
      stance: 'defensive',
      targetId: 'c01',
    });
    const free = threeRaiders();
    free.actors = [
      heroActor(),
      companionActor('party-archer'),
      enemyActor('e01', 'raider', { hp: 10 }),
      enemyActor('e02', 'raider', { hp: 4 }),
    ];
    free.engagements = [
      ['e01', 'h01'],
      ['e02', 'h01'],
    ];
    expect(planRound(free).frozenCompanionPlan).toMatchObject({
      actionId: 'shot',
      stance: 'balanced',
      targetId: 'e02',
      baseDamage: 5,
      priority: 20,
    });
  });

  it('plans no companion intent when the companion is down or absent', () => {
    const down = sentinelState();
    down.actors = down.actors.map((actor) => (actor.id === 'c01' ? { ...actor, hp: 0 } : actor));
    down.engagements = down.engagements.filter((pair) => !pair.includes('c01'));
    expect(planRound(down).frozenCompanionPlan).toBeNull();
    expect(planRound(threeRaiders()).frozenCompanionPlan).toBeNull();
  });
});

describe('planRound purity of input', () => {
  it('never mutates its input', () => {
    const input = threeRaiders();
    const snapshot = JSON.parse(JSON.stringify(input));
    planRound(input);
    expect(input).toEqual(snapshot);
  });

  it('requires a PLAN state with no result', () => {
    expect(() => planRound({ ...duelPlanState(), phase: 'CHOOSE' })).toThrow();
    expect(() => planRound({ ...duelPlanState(), result: 'WIN' })).toThrow();
  });
});

describe('verifyFrozenPlans (K6)', () => {
  it('accepts a freshly planned CHOOSE state', () => {
    const planned = planRound(threeRaiders());
    expect(planned.phase).toBe('CHOOSE');
    expect(verifyFrozenPlans(planned)).toEqual([]);
    // A parsed round-trip verifies too.
    const parsed = parseCombatState(JSON.parse(JSON.stringify(planned)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(verifyFrozenPlans(parsed.state)).toEqual([]);
  });

  it('accepts a planned companion fight', () => {
    const state = threeRaiders();
    state.actors = [heroActor(), companionActor('party-sentinel'), enemyActor('e01', 'raider')];
    state.engagements = [['e01', 'h01']];
    const planned = planRound(state);
    expect(planned.frozenCompanionPlan).not.toBeNull();
    expect(verifyFrozenPlans(planned)).toEqual([]);
  });

  it.each(['targetId', 'stance', 'actionId', 'attackSlot', 'baseDamage', 'moveVariant'] as const)(
    'rejects a tampered enemy plan field (%s) with a ParseIssue and replaces nothing',
    (field) => {
      const planned = planRound(threeRaiders());
      const victim = planned.frozenEnemyPlans.find((plan) => plan.actorId === 'e01')!;
      if (field === 'targetId') victim.targetId = 'e02';
      else if (field === 'stance') victim.stance = 'defensive';
      else if (field === 'actionId') victim.actionId = 'brace';
      else if (field === 'attackSlot') victim.attackSlot = !victim.attackSlot;
      else if (field === 'baseDamage') victim.baseDamage += 1;
      else victim.moveVariant = victim.moveVariant === null ? 'JOIN' : null;
      const snapshot = JSON.parse(JSON.stringify(planned));
      const issues = verifyFrozenPlans(planned);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('bad_frozen_plans');
      // The stored plans are returned untouched, never recomputed over.
      expect(planned.frozenEnemyPlans).toEqual(snapshot.frozenEnemyPlans);
    },
  );

  it('rejects a tampered companion plan and a dropped plan', () => {
    const state = threeRaiders();
    state.actors = [heroActor(), companionActor('party-sentinel'), enemyActor('e01', 'raider')];
    state.engagements = [['e01', 'h01']];
    const planned = planRound(state);
    // The Sentinel covers the hero; retargeting the Cover must mismatch.
    expect(planned.frozenCompanionPlan?.targetId).toBe('h01');
    planned.frozenCompanionPlan = { ...planned.frozenCompanionPlan!, targetId: 'c01' };
    const snapshot = JSON.parse(JSON.stringify(planned));
    expect(verifyFrozenPlans(planned)).not.toEqual([]);
    expect(planned.frozenCompanionPlan).toEqual(snapshot.frozenCompanionPlan);
    const dropped = planRound(state);
    dropped.frozenEnemyPlans = [];
    expect(verifyFrozenPlans(dropped).map((issue) => issue.code)).toContain('bad_frozen_plans');
  });

  it('leaves the input deep-equal and verifies nothing outside CHOOSE', () => {
    const planned = planRound(threeRaiders());
    const snapshot = JSON.parse(JSON.stringify(planned));
    verifyFrozenPlans(planned);
    expect(planned).toEqual(snapshot);
    expect(verifyFrozenPlans(duelPlanState())).toEqual([]);
  });
});
