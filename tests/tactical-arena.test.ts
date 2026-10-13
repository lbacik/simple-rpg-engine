// The tactical arena view projection (issue #123, R12): `view`/`combatArena`
// supply membership (including grey lanes), legal targets, reason codes,
// thresholds and guarded thresholds, Speed/order positions, badges and
// preparation descriptions from state and current content — with no RNG, no
// mutation and no Journal.

import { describe, expect, it } from 'vitest';
import {
  applyAction,
  combatArena,
  view,
  type CombatArenaView,
  type PlaythroughState,
} from '../src/engine/index';
import { loadArenaExample } from './fixtures/tactical';

function arenaAction(arena: CombatArenaView, id: string) {
  const action = arena.actions.find((entry) => entry.id === id);
  if (action === undefined) {
    throw new Error(`arena has no action "${id}"`);
  }
  return action;
}

function arenaParticipant(arena: CombatArenaView, participantId: string) {
  const lane = arena.participants.find((entry) => entry.participantId === participantId);
  if (lane === undefined) {
    throw new Error(`arena has no lane "${participantId}"`);
  }
  return lane;
}

describe('tactical arena projection', () => {
  it('projects one participant: membership, targets, reasons, thresholds and order', () => {
    const { scenario, state, arena } = loadArenaExample('solo');
    expect(arena.encounterId).toBe('solo-ambush');
    expect(arena.round).toBe(1);
    expect(arena.guarded).toBe(false);

    // One lane, active, at Far with its announced Close in.
    expect(arena.participants.map((lane) => lane.participantId)).toEqual(['wolf-solo']);
    const wolf = arenaParticipant(arena, 'wolf-solo');
    expect(wolf).toMatchObject({
      enemyId: 'grey-wolf',
      name: 'Grey Wolf',
      defeated: false,
      range: 'far',
      health: 8,
      maxHealth: 8,
      damage: 2,
      reach: 'melee',
      intent: 'close-in',
      intentSpeed: 'normal',
      order: 1,
      prepared: false,
    });
    expect(wolf.ordinal).toBeUndefined();
    // Close in attacks nothing: no thresholds, no preparation.
    expect(wolf.threshold).toBeUndefined();
    expect(wolf.guardedThreshold).toBeUndefined();
    expect(wolf.preparation).toBeUndefined();
    expect(wolf.waryUntilRound).toBeUndefined();

    expect(arena.legalTargets).toEqual(['wolf-solo']);
    expect(arena.order).toEqual([
      {
        participantId: 'wolf-solo',
        name: 'Grey Wolf',
        intent: 'close-in',
        speed: 'normal',
        order: 1,
      },
    ]);

    // The Hunter (Might 1, Agility 3, Wits 2, Sword 3/melee) faces a wolf
    // (Agility 2, Wits 1) at Far: Attack needs Near, Advance is open.
    const attack = arenaAction(arena, 'attack');
    expect(attack).toMatchObject({
      group: 'fight',
      enabled: false,
      reason: 'needs-near',
      speed: 'normal',
      order: 1,
      weaponName: 'Sword',
    });
    expect(attack.targets).toEqual([
      {
        participantId: 'wolf-solo',
        name: 'Grey Wolf',
        range: 'far',
        enabled: false,
        reason: 'needs-near',
        threshold: 9,
      },
    ]);
    const advance = arenaAction(arena, 'advance');
    expect(advance).toMatchObject({ enabled: true, speed: 'normal', order: 1 });
    expect(advance.reason).toBeUndefined();
    expect(advance.targets).toEqual([
      {
        participantId: 'wolf-solo',
        name: 'Grey Wolf',
        range: 'far',
        enabled: true,
        threshold: undefined,
      },
    ]);
    const distract = arenaAction(arena, 'distract');
    expect(distract).toMatchObject({ enabled: true, speed: 'fast', order: 1 });
    expect(distract.targets).toEqual([
      {
        participantId: 'wolf-solo',
        name: 'Grey Wolf',
        range: 'far',
        enabled: true,
        threshold: 8,
      },
    ]);
    expect(arenaAction(arena, 'defend')).toMatchObject({
      enabled: true,
      speed: 'fast',
      order: 1,
    });
    // Nothing is Near: Fall back is closed with no threshold.
    const fallBack = arenaAction(arena, 'fall-back');
    expect(fallBack).toMatchObject({
      enabled: false,
      reason: 'already-far',
      speed: 'slow',
      order: 2,
    });
    expect(fallBack.threshold).toBeUndefined();
    // Escape keeps the all-Far +2 with the threshold against the wolf.
    expect(arenaAction(arena, 'escape')).toMatchObject({
      enabled: true,
      speed: 'normal',
      order: 1,
      threshold: 9,
      escapeBonus: 2,
    });
    void scenario;
    void state;
  });

  it('numbers a same-kind pair with ordinals and predicts the order', () => {
    const { arena } = loadArenaExample('wolves');
    expect(arena.participants.map((lane) => lane.participantId)).toEqual([
      'wolf-a',
      'wolf-b',
    ]);
    expect(arenaParticipant(arena, 'wolf-a')).toMatchObject({
      name: 'Grey Wolf',
      ordinal: 1,
      defeated: false,
      range: 'far',
      intent: 'close-in',
      order: 1,
    });
    expect(arenaParticipant(arena, 'wolf-b')).toMatchObject({
      name: 'Grey Wolf',
      ordinal: 2,
      defeated: false,
      range: 'far',
      intent: 'close-in',
      order: 2,
    });
    expect(arena.legalTargets).toEqual(['wolf-a', 'wolf-b']);
    expect(arena.order.map((entry) => entry.participantId)).toEqual([
      'wolf-a',
      'wolf-b',
    ]);
    // Fast before normal before slow; the Hunter's Agility 3 leads normals.
    expect(arenaAction(arena, 'defend').order).toBe(1);
    expect(arenaAction(arena, 'attack').order).toBe(1);
    expect(arenaAction(arena, 'escape').order).toBe(1);
    expect(arenaAction(arena, 'fall-back').order).toBe(3);
    // Both lanes Far: both Attack targets need Near, both Advances are open.
    const attack = arenaAction(arena, 'attack');
    expect(attack).toMatchObject({ enabled: false, reason: 'needs-near' });
    expect(attack.targets?.map((target) => target.enabled)).toEqual([false, false]);
    expect(attack.targets?.map((target) => target.threshold)).toEqual([9, 9]);
    const advance = arenaAction(arena, 'advance');
    expect(advance).toMatchObject({ enabled: true });
    expect(advance.targets?.map((target) => target.enabled)).toEqual([true, true]);
  });

  it('describes a Prepare as the slow Heavy attack it builds towards', () => {
    const { arena } = loadArenaExample('mixed');
    expect(arena.participants.map((lane) => lane.participantId)).toEqual([
      'grey-wolf',
      'bandit-archer',
    ]);
    // Defaulted ids fall back to the Enemy ids; kinds are unique: no letters.
    expect(arenaParticipant(arena, 'grey-wolf')).toMatchObject({
      name: 'Grey Wolf',
      intent: 'close-in',
      order: 1,
    });
    expect(arenaParticipant(arena, 'grey-wolf').ordinal).toBeUndefined();
    const archer = arenaParticipant(arena, 'bandit-archer');
    expect(archer).toMatchObject({
      name: 'Bandit Archer',
      intent: 'prepare',
      intentSpeed: 'normal',
      order: 2,
      reach: 'ranged',
      prepared: false,
    });
    // A Prepare attacks nothing itself, but names what it prepares: the slow
    // Heavy attack for base Damage +3.
    expect(archer.threshold).toBeUndefined();
    expect(archer.preparation).toEqual({
      kind: 'heavy-attack',
      speed: 'slow',
      damage: 5,
    });
  });

  it('keeps a grey lane for the defeated participant', () => {
    const { scenario, state, arena, journal } = loadArenaExample('defeated');
    expect(arena.round).toBe(5);
    expect(arena.participants.map((lane) => lane.participantId)).toEqual([
      'wolf-a',
      'wolf-b',
    ]);
    // The defeated lane: grey, no Range, no Intent, no thresholds, no badges.
    const fallen = arenaParticipant(arena, 'wolf-a');
    expect(fallen).toMatchObject({
      name: 'Grey Wolf',
      ordinal: 1,
      defeated: true,
      health: 0,
      maxHealth: 8,
      prepared: false,
    });
    expect(fallen.range).toBeUndefined();
    expect(fallen.intent).toBeUndefined();
    expect(fallen.order).toBeUndefined();
    expect(fallen.threshold).toBeUndefined();
    // The survivor fights on at Near with its announced Strike: 7 + Agility
    // 3 hits on 10+, 9 + 3 behind a Guard.
    const survivor = arenaParticipant(arena, 'wolf-b');
    expect(survivor).toMatchObject({
      ordinal: 2,
      defeated: false,
      range: 'near',
      health: 8,
      intent: 'strike',
      intentSpeed: 'normal',
      order: 1,
      threshold: 10,
      guardedThreshold: 12,
    });
    // Only the survivor is a legal target; the shared Journal carries the
    // rounds that defeated wolf-a.
    expect(arena.legalTargets).toEqual(['wolf-b']);
    expect(arena.order.map((entry) => entry.participantId)).toEqual(['wolf-b']);
    expect(
      journal.filter((entry) => entry.type === 'combat-round'),
    ).toHaveLength(4);
    // Melee at Near: Attack is open, Advance has nothing Far to close on,
    // Fall back rolls against the Near survivor, Escape lost its bonus.
    expect(arenaAction(arena, 'attack')).toMatchObject({ enabled: true, order: 1 });
    expect(arenaAction(arena, 'advance')).toMatchObject({
      enabled: false,
      reason: 'already-near',
    });
    expect(arenaAction(arena, 'fall-back')).toMatchObject({
      enabled: true,
      threshold: 9,
    });
    expect(arenaAction(arena, 'escape')).toMatchObject({
      threshold: 9,
      escapeBonus: 0,
    });
    void scenario;
    void state;
  });

  it('shows the Wary badge and disables Distract with its reason', () => {
    const { scenario, state } = loadArenaExample('solo');
    // Distract hits on 8 (3+3+Wits 2 vs 7+Wits 1): the Close in is
    // interrupted and the wolf grows Wary until the end of round 2.
    const result = applyAction(
      scenario,
      state,
      {
        kind: 'combat',
        combatAction: 'distract',
        targetParticipantId: 'wolf-solo',
        expectedStep: state.step,
      },
      () => 3,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('distract should resolve');
    }
    const arena = combatArena(scenario, result.state);
    expect(arena?.round).toBe(2);
    expect(arenaParticipant(arena as CombatArenaView, 'wolf-solo')).toMatchObject({
      waryUntilRound: 2,
    });
    expect(arenaAction(arena as CombatArenaView, 'distract')).toMatchObject({
      enabled: false,
      reason: 'wary',
    });
    expect(
      arenaAction(arena as CombatArenaView, 'distract').targets,
    ).toEqual([
      {
        participantId: 'wolf-solo',
        name: 'Grey Wolf',
        range: 'far',
        enabled: false,
        reason: 'wary',
        threshold: 8,
      },
    ]);
  });

  it('exposes the same arena through view, with no RNG and no mutation', () => {
    const { scenario, state } = loadArenaExample('wolves');
    const beforeState = JSON.stringify(state);
    const first = combatArena(scenario, state);
    const second = combatArena(scenario, state);
    expect(first).toBeDefined();
    expect(second).toEqual(first);
    const gameView = view(scenario, state);
    expect(gameView.kind).toBe('combat');
    if (gameView.kind !== 'combat') {
      throw new Error('expected a Combat view');
    }
    expect(gameView.arena).toEqual(first);
    expect(view(scenario, state)).toEqual(gameView);
    expect(JSON.stringify(state)).toBe(beforeState);
  });

  it('works with an empty Journal and returns nothing outside Combat', () => {
    // The projection takes state and current content only: no Journal rows
    // exist here at all, and the examples above never pass one.
    const { scenario, state } = loadArenaExample('solo');
    expect(combatArena(scenario, state)?.participants).toHaveLength(1);
    const locationState: PlaythroughState = { ...state, activeCombat: null };
    expect(combatArena(scenario, locationState)).toBeUndefined();
    const gameView = view(scenario, locationState);
    expect(gameView.kind).not.toBe('combat');
    void scenario;
  });
});
