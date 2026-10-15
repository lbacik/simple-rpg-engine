// Arena view projection (issue #166): everything the Arena page needs to
// render the existing Combat presentation over an ArenaState, derived with no
// RNG and no mutation, mirroring the Scenario Combat arena projection.

import { describe, expect, it } from 'vitest';
import {
  arenaView,
  startArena,
  validateArenaSetup,
  type ArenaSetup,
  type ArenaState,
  type Rng,
} from '../src/engine/index';

const noDice: Rng = () => {
  throw new Error('no dice should be drawn for steady selection');
};

function validSetup(): ArenaSetup {
  const validated = validateArenaSetup({
    character: {
      attributes: { might: 2, agility: 2, wits: 1, presence: 1 },
      health: 12,
    },
    opponents: [
      {
        id: 'wolf',
        enemy: {
          name: 'Grey Wolf',
          attributes: { might: 1, agility: 2, wits: 1, presence: 0 },
          health: 8,
          damage: 2,
        },
        range: 'far',
      },
    ],
  });
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error('fixture setup should validate');
  return validated.setup;
}

function freshState(): ArenaState {
  return startArena(validSetup(), noDice).state;
}

describe('arenaView', () => {
  it('projects lanes, order and actions for a fresh fight', () => {
    const view = arenaView(freshState());
    expect(view).toBeDefined();
    if (view === undefined) throw new Error('expected an arena view');
    expect(view.encounterId).toBe('arena');
    expect(view.round).toBe(1);
    expect(view.guarded).toBe(false);
    expect(view.legalTargets).toEqual(['wolf']);

    // The melee wolf starts Far, so it closes in.
    expect(view.participants).toHaveLength(1);
    const lane = view.participants[0];
    expect(lane).toMatchObject({
      participantId: 'wolf',
      name: 'Grey Wolf',
      defeated: false,
      range: 'far',
      health: 8,
      maxHealth: 8,
      damage: 2,
      reach: 'melee',
      intent: 'close-in',
      prepared: false,
    });

    // One committed Intent in resolution order.
    expect(view.order).toHaveLength(1);
    expect(view.order[0]).toMatchObject({
      participantId: 'wolf',
      intent: 'close-in',
      order: 1,
    });

    const byId = new Map(view.actions.map((action) => [action.id, action]));
    // Far: Advance is available, Attack and Fall back are not.
    expect(byId.get('advance')?.enabled).toBe(true);
    expect(byId.get('attack')?.enabled).toBe(false);
    expect(byId.get('attack')?.reason).toBe('needs-near');
    expect(byId.get('fall-back')?.enabled).toBe(false);
    expect(byId.get('fall-back')?.reason).toBe('already-far');
    expect(byId.get('defend')?.enabled).toBe(true);
    expect(byId.get('distract')?.enabled).toBe(true);
    expect(byId.get('escape')?.enabled).toBe(true);
    // No consumable entries: an Arena Setup carries no consumables.
    expect(view.actions.some((action) => action.id === 'use-item')).toBe(false);

    // Thresholds read against the wolf: attack 7 + Agility, distract 7 + Wits.
    const attackTarget = byId.get('attack')?.targets?.[0];
    expect(attackTarget).toMatchObject({
      participantId: 'wolf',
      range: 'far',
      enabled: false,
      reason: 'needs-near',
      threshold: 9,
    });
    expect(byId.get('distract')?.targets?.[0]?.threshold).toBe(8);
    // Escape against the highest Agility among survivors, with the +2 shown.
    expect(byId.get('escape')?.threshold).toBe(9);
    expect(byId.get('escape')?.escapeBonus).toBe(2);
    // Every action carries its Speed and predicted order position.
    for (const action of view.actions) {
      expect(action.order).toBeGreaterThanOrEqual(1);
      expect(action.order).toBeLessThanOrEqual(2);
    }
  });

  it('enables the Attack at Near range with the guarded thresholds on lanes', () => {
    const setup = validSetup();
    setup.opponents[0].range = 'near';
    const state = startArena(setup, noDice).state;
    const view = arenaView(state);
    if (view === undefined) throw new Error('expected an arena view');
    const lane = view.participants[0];
    expect(lane.intent).toBe('strike');
    expect(lane.threshold).toBe(9);
    expect(lane.guardedThreshold).toBe(11);
    const attack = view.actions.find((action) => action.id === 'attack');
    expect(attack?.enabled).toBe(true);
    expect(attack?.targets?.[0]).toMatchObject({ enabled: true, threshold: 9 });
    expect(view.actions.find((action) => action.id === 'advance')?.enabled).toBe(false);
  });

  it('keeps a grey lane for a defeated opponent and disables nothing globally', () => {
    const validated = validateArenaSetup({
      character: {
        attributes: { might: 2, agility: 2, wits: 1, presence: 1 },
        health: 12,
      },
      opponents: [
        {
          id: 'wolf-a',
          enemy: {
            name: 'Grey Wolf',
            attributes: { might: 1, agility: 0, wits: 0, presence: 0 },
            health: 2,
            damage: 1,
          },
          range: 'near',
        },
        {
          id: 'wolf-b',
          enemy: {
            name: 'Grey Wolf',
            attributes: { might: 1, agility: 0, wits: 0, presence: 0 },
            health: 2,
            damage: 1,
          },
          range: 'near',
        },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('fixture setup should validate');
    const state = startArena(validated.setup, noDice).state;
    // One wolf already defeated mid-fight: grey lane, no Intent, never a target.
    const fallen = state.opponents.find((opponent) => opponent.id === 'wolf-a');
    if (fallen === undefined) throw new Error('expected wolf-a');
    fallen.damageTaken = fallen.maxHealth;
    const view = arenaView(state);
    if (view === undefined) throw new Error('expected an arena view');
    expect(view.legalTargets).toEqual(['wolf-b']);
    const grey = view.participants.find((lane) => lane.participantId === 'wolf-a');
    expect(grey).toMatchObject({ defeated: true, health: 0 });
    expect(grey?.range).toBeUndefined();
    expect(grey?.intent).toBeUndefined();
    // Same-named survivors carry ordinals so the panel can tell them apart.
    expect(view.participants.find((lane) => lane.participantId === 'wolf-b')?.ordinal).toBe(2);
  });

  it('returns undefined once the fight has ended', () => {
    const state = freshState();
    const ended: ArenaState = { ...state, status: 'victory' };
    expect(arenaView(ended)).toBeUndefined();
  });
});
