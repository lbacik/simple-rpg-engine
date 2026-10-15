// The Arena Combat adapter (issue #166): the stored Arena run rendered
// through the existing Combat presentation. The adapter derives the Scenario
// Combat view shape from Arena state, so the Arena page reuses the Combat
// panel and its actions unchanged.

import { describe, expect, it } from 'vitest';
import { applyArenaAction, startArena, validateArenaSetup } from '../src/engine/index';
import {
  arenaCombatView,
  arenaFoeName,
  arenaTacticalRounds,
} from '../src/app/arena/combat-view';
import { buildArenaSetup } from '../src/app/arena/bestiary';

function freshRun() {
  const setup = buildArenaSetup('grey-wolf', 'en');
  if (setup === undefined) throw new Error('expected a setup');
  const validated = validateArenaSetup({ character: setup.character, opponents: setup.opponents });
  if (!validated.ok) throw new Error('fixture setup should validate');
  // Steady selection draws no dice.
  return startArena(validated.setup, () => {
    throw new Error('no dice expected');
  });
}

describe('arena combat adapter', () => {
  it('derives the Combat view with the localized opponent', () => {
    const { state, journal } = freshRun();
    const combat = arenaCombatView(state, 'en');
    expect(combat?.encounterName).toBe('Grey Wolf');
    expect(combat?.characterName).toBe('You');
    expect(combat?.round).toBe(1);
    expect(combat?.arena.participants).toHaveLength(1);
    expect(arenaCombatView(state, 'pl')?.encounterName).toBe('Szary Wilk');
    expect(arenaCombatView(state, 'pl')?.characterName).toBe('Ty');
    expect(arenaTacticalRounds(journal)).toEqual([]);
  });

  it('carries the resolved Rounds into the Combat log', () => {
    const { state } = freshRun();
    // Character hits (3+4+2=9 vs 9), the wolf misses (1+1+1=3 vs 9).
    const dice = [3, 4, 1, 1];
    const result = applyArenaAction(
      state,
      { action: 'attack', expectedStep: state.step },
      () => dice.shift() ?? 1,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a round');
    const combat = arenaCombatView(result.state, 'en');
    expect(combat?.round).toBe(2);
    const rounds = arenaTacticalRounds(result.journal);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.round).toBe(1);
    expect(arenaCombatView(result.state, 'en')?.character.health).toBe(
      result.state.character.health,
    );
  });

  it('returns undefined once the fight has ended', () => {
    const { state } = freshRun();
    expect(arenaCombatView({ ...state, status: 'victory' }, 'en')).toBeUndefined();
    expect(arenaFoeName(state, 'en')).toBe('Grey Wolf');
  });
});
