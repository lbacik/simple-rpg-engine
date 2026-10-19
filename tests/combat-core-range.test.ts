// P1a K2: Range relation, groups and edge add/remove (rules §3).

import { describe, expect, it } from 'vitest';
import {
  addEngagement,
  canonicalizeEngagements,
  engagementsOf,
  groupMembers,
  isFree,
  rangeOf,
  removeEngagementsOf,
} from '../src/engine/combat/index';
import { companionActor, duelChooseState, enemyActor, heroActor } from './combat-core-fixtures';

describe('rangeOf', () => {
  it('computes SELF, MELEE, NEAR and FAR', () => {
    const state = duelChooseState();
    state.actors = [
      heroActor(),
      { ...enemyActor('e01', 'raider'), groupId: 'g0' },
      { ...enemyActor('e02', 'archer'), groupId: 'g1' },
      { ...companionActor('party-archer'), groupId: 'g0' },
    ];
    state.nextGroupSerial = 2;
    state.engagements = [['e01', 'h01']];
    state.frozenEnemyPlans = [
      { ...state.frozenEnemyPlans[0]! },
      {
        actorId: 'e02',
        stance: 'balanced',
        actionId: 'shot',
        targetId: 'h01',
        moveVariant: null,
        wasCandidate: true,
        attackSlot: true,
        baseDamage: 6,
        priority: 20,
      },
    ];

    expect(rangeOf(state, 'h01', 'h01')).toBe('self');
    expect(rangeOf(state, 'h01', 'e01')).toBe('melee');
    expect(rangeOf(state, 'e01', 'h01')).toBe('melee');
    // Same group, no engagement: Near.
    expect(rangeOf(state, 'h01', 'c01')).toBe('near');
    // Different groups: Far.
    expect(rangeOf(state, 'h01', 'e02')).toBe('far');
    expect(rangeOf(state, 'e02', 'c01')).toBe('far');
  });

  it('reads a pair with a dead endpoint as removed', () => {
    const state = duelChooseState();
    state.actors = [heroActor(), enemyActor('e01', 'raider', { hp: 0 })];
    // Both in g0: without the edge the relation falls back to Near.
    expect(rangeOf(state, 'h01', 'e01')).toBe('near');
    expect(isFree(state, 'h01')).toBe(true);
  });

  it('is symmetric', () => {
    const state = duelChooseState();
    const ids = ['h01', 'e01'] as const;
    for (const a of ids) for (const b of ids) expect(rangeOf(state, a, b)).toBe(rangeOf(state, b, a));
  });
});

describe('engagement pairs', () => {
  it('canonicalizes sorted pairs without duplicates', () => {
    expect(
      canonicalizeEngagements([
        ['h01', 'e01'],
        ['e01', 'h01'],
        ['c01', 'e02'],
      ]),
    ).toEqual([
      ['c01', 'e02'],
      ['e01', 'h01'],
    ]);
  });

  it('adds an edge once and removes all edges of an actor', () => {
    const once = addEngagement([], 'h01', 'e01');
    expect(once).toEqual([['e01', 'h01']]);
    expect(addEngagement(once, 'e01', 'h01')).toEqual([['e01', 'h01']]);

    const three = addEngagement(addEngagement(once, 'h01', 'e02'), 'h01', 'e03');
    expect(three).toHaveLength(3);
    // Disengage from three engagements removes all three; the group is untouched.
    expect(removeEngagementsOf(three, 'h01')).toEqual([]);
    // Death of one of three engaged enemies removes only its edges.
    expect(removeEngagementsOf(three, 'e02')).toEqual([
      ['e01', 'h01'],
      ['e03', 'h01'],
    ]);
  });

  it('tracks freedom and engaged partners', () => {
    const state = duelChooseState();
    expect(isFree(state, 'h01')).toBe(false);
    expect(engagementsOf(state, 'h01')).toEqual(['e01']);

    const freed = { ...state, engagements: [] as [string, string][] };
    expect(isFree(freed, 'h01')).toBe(true);
    expect(engagementsOf(freed, 'h01')).toEqual([]);
  });
});

describe('groups', () => {
  it('JOIN to a group of three makes the actor Near all three without engagements', () => {
    const state = duelChooseState();
    state.actors = [
      { ...heroActor(), groupId: 'g0' },
      { ...enemyActor('e01', 'raider'), groupId: 'g1' },
      { ...enemyActor('e02', 'raider'), groupId: 'g1' },
      { ...enemyActor('e03', 'brute'), groupId: 'g1' },
    ];
    state.nextGroupSerial = 2;
    state.engagements = [];
    expect(groupMembers(state, 'g1')).toEqual(['e01', 'e02', 'e03']);

    // The JOIN movement: the actor takes the target's group, no edge created.
    const joined: typeof state = {
      ...state,
      actors: state.actors.map((actor) => (actor.id === 'h01' ? { ...actor, groupId: 'g1' } : actor)),
    };
    expect(groupMembers(joined, 'g1')).toEqual(['e01', 'e02', 'e03', 'h01']);
    expect(rangeOf(joined, 'h01', 'e01')).toBe('near');
    expect(rangeOf(joined, 'h01', 'e02')).toBe('near');
    expect(rangeOf(joined, 'h01', 'e03')).toBe('near');
    expect(isFree(joined, 'h01')).toBe(true);
  });
});
