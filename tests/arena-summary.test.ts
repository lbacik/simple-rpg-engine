// Arena fight summary (issue #171): the result screen judges playability by
// the outcome, the Rounds fought, the remaining Health, and the hits and
// misses on both sides. The summary derives from the finished state and the
// stored journal: only executed attack rolls count (the Character's attacks
// with its counterattacks, the foes' strikes and heavy attacks) —
// cancelled, dropped or not-reached actions carry no roll and change nothing.

import { describe, expect, it } from 'vitest';
import {
  applyArenaAction,
  arenaSummary,
  startArena,
  validateArenaSetup,
  type ArenaSetup,
  type Rng,
} from '../src/engine/index';

function validSetup(): ArenaSetup {
  const validated = validateArenaSetup({
    character: {
      attributes: { might: 3, agility: 3, wits: 3, presence: 0 },
      health: 12,
    },
    opponents: [
      {
        id: 'wolf',
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
  return validated.setup;
}

/** Dice that always roll 6s: every attack hits, every escape succeeds. */
const hotDice: Rng = () => 6;

describe('arenaSummary', () => {
  it('is undefined while the fight runs', () => {
    const started = startArena(validSetup(), hotDice);
    expect(arenaSummary(started.state, started.journal)).toBeUndefined();
  });

  it('summarizes a victory: outcome, rounds, health, hits and misses', () => {
    const started = startArena(validSetup(), hotDice);
    const first = applyArenaAction(
      started.state,
      { action: 'attack', targetId: 'wolf', expectedStep: started.state.step },
      hotDice,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected the attack to resolve');
    const journal = [...started.journal, ...first.journal];
    const summary = arenaSummary(first.state, journal);
    expect(summary).toBeDefined();
    if (summary === undefined) throw new Error('expected a summary');
    // The Character acts first (Agility 3 vs 0) and hot dice hit the 2-Health
    // wolf for 2: one attack ends the fight in round 1 before it answers.
    expect(first.state.status).toBe('victory');
    expect(summary.outcome).toBe('victory');
    expect(summary.rounds).toBe(first.state.round);
    expect(summary.characterHealth).toBe(first.state.character.health);
    expect(summary.characterMaxHealth).toBe(12);
    expect(summary.opponents).toHaveLength(1);
    expect(summary.opponents[0]?.maxHealth).toBe(2);
    expect(summary.opponents[0]?.health).toBe(0);
    // Every counted roll hit with hot dice; misses stay zero.
    expect(summary.characterHits + summary.characterMisses).toBeGreaterThan(0);
    expect(summary.characterMisses).toBe(0);
    expect(summary.foeHits + summary.foeMisses).toBeGreaterThanOrEqual(0);
    expect(summary.foeMisses).toBe(0);
  });

  it('counts misses on both sides with cold dice', () => {
    // Cold dice roll 1s: nothing hits, so the fight continues and misses pile
    // up on both sides.
    const cold: Rng = () => 1;
    const started = startArena(validSetup(), cold);
    const first = applyArenaAction(
      started.state,
      { action: 'attack', targetId: 'wolf', expectedStep: started.state.step },
      cold,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected the attack to resolve');
    expect(first.state.status).toBe('active');
    const summary = arenaSummary(
      { ...first.state, status: 'death', character: { ...first.state.character, health: 0 } },
      [...started.journal, ...first.journal],
    );
    expect(summary).toBeDefined();
    if (summary === undefined) throw new Error('expected a summary');
    expect(summary.outcome).toBe('death');
    expect(summary.characterHits).toBe(0);
    expect(summary.characterMisses).toBeGreaterThan(0);
    expect(summary.foeHits).toBe(0);
    expect(summary.foeMisses).toBeGreaterThan(0);
    expect(summary.characterHealth).toBe(0);
  });

  it('names duplicate foes distinguishably and reports each Health', () => {
    const validated = validateArenaSetup({
      character: {
        attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
        health: 12,
      },
      opponents: [
        {
          id: 'grey-wolf',
          enemy: {
            name: 'Grey Wolf',
            attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
            health: 6,
            damage: 1,
          },
          range: 'far',
        },
        {
          id: 'grey-wolf-2',
          enemy: {
            name: 'Grey Wolf',
            attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
            health: 6,
            damage: 1,
          },
          range: 'far',
        },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('fixture setup should validate');
    const started = startArena(validated.setup, hotDice);
    const escaped = applyArenaAction(
      started.state,
      { action: 'escape', expectedStep: started.state.step },
      hotDice,
    );
    expect(escaped.ok).toBe(true);
    if (!escaped.ok) throw new Error('expected the escape to resolve');
    expect(escaped.state.status).toBe('escape');
    const summary = arenaSummary(escaped.state, [...started.journal, ...escaped.journal]);
    expect(summary).toBeDefined();
    if (summary === undefined) throw new Error('expected a summary');
    expect(summary.outcome).toBe('escape');
    expect(summary.opponents.map((opponent) => opponent.name)).toEqual([
      'Grey Wolf A',
      'Grey Wolf B',
    ]);
    for (const opponent of summary.opponents) {
      expect(opponent.health).toBe(6);
      expect(opponent.maxHealth).toBe(6);
    }
  });

  it('counts the counterattack for the Character side', () => {
    // A guarded Character answered by a melee miss triggers the counterattack
    // reaction: its roll counts as a Character attack roll.
    const validated = validateArenaSetup({
      character: {
        attributes: { might: 3, agility: 0, wits: 0, presence: 0 },
        health: 12,
      },
      opponents: [
        {
          id: 'wolf',
          enemy: {
            name: 'Grey Wolf',
            attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
            health: 30,
            damage: 1,
          },
          range: 'near',
        },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('fixture setup should validate');
    // Selection draws no dice for a steady foe at Near: it strikes.
    const started = startArena(validated.setup, () => {
      throw new Error('no selection dice expected');
    });
    // Defend first (fast, no roll), then the wolf's strike misses the guarded
    // threshold only on cold dice; the counterattack then rolls hot.
    const dice: Rng = (() => {
      let calls = 0;
      return () => {
        calls += 1;
        // The wolf's strike rolls 1+1 (+0 vs 9+0): a miss answering the guard.
        if (calls <= 2) return 1;
        // The counterattack rolls 6+6 (+3 vs 7+0): a hit.
        return 6;
      };
    })();
    const first = applyArenaAction(
      started.state,
      { action: 'defend', expectedStep: started.state.step },
      dice,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected the defend to resolve');
    const summary = arenaSummary(
      { ...first.state, status: 'death', character: { ...first.state.character, health: 0 } },
      [...started.journal, ...first.journal],
    );
    expect(summary).toBeDefined();
    if (summary === undefined) throw new Error('expected a summary');
    expect(summary.foeMisses).toBe(1);
    expect(summary.foeHits).toBe(0);
    expect(summary.characterHits).toBe(1);
    expect(summary.characterMisses).toBe(0);
  });
});
