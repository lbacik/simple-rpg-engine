// The Arena custom Character (issue #168): presets copied from the shipped
// Scenario Templates, the setup form parsing behind the Start action, and
// extreme values through the unchanged Combat rules (hit rolls, Speed order,
// Escape, Health).
//
// Relative imports only: vitest has no `@/` alias.

import { describe, expect, it } from 'vitest';
import {
  BESTIARY,
  buildArenaSetup,
  DEFAULT_ARENA_CHARACTER,
  parseArenaCharacter,
} from '../src/app/arena/bestiary';
import { arenaCombatView } from '../src/app/arena/combat-view';
import { getArenaPresets } from '../src/app/arena/presets';
import {
  applyArenaAction,
  arenaView,
  startArena,
  validateArenaSetup,
  type ArenaSetup,
  type Rng,
} from '../src/engine/index';

const noDice: Rng = () => {
  throw new Error('no dice should be drawn');
};

function strictDice(dice: number[]): Rng {
  let index = 0;
  return (min: number, max: number) => {
    if (index >= dice.length) throw new Error(`dice exhausted after ${index} draws`);
    const die = dice[index];
    index += 1;
    if (die === undefined || die < min || die >= max) {
      throw new Error(`die ${String(die)} out of range [${min}, ${max})`);
    }
    return die;
  };
}

/** A wolf-like steady melee foe at Near: Intent selection draws no dice. */
function wolfSetup(character: ArenaSetup['character']): ArenaSetup {
  const validated = validateArenaSetup({
    character,
    opponents: [
      {
        id: 'wolf',
        enemy: {
          name: 'Wolf',
          attributes: { might: 1, agility: 2, wits: 1, presence: 0 },
          health: 8,
          damage: 2,
          reach: 'melee',
          behaviour: 'steady',
        },
        range: 'near',
      },
    ],
  });
  expect(validated.ok).toBe(true);
  if (!validated.ok) throw new Error('fixture setup should validate');
  return validated.setup;
}

describe('arena presets', () => {
  it('copies every shipped Scenario Template with full Health', () => {
    const presets = getArenaPresets('en');
    expect(presets.length).toBeGreaterThan(0);
    const ids = presets.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of presets) {
      expect(preset.id).toMatch(/^[^/]+\/[^/]+$/);
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.scenarioName.length).toBeGreaterThan(0);
      for (const value of Object.values(preset.attributes)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(3);
      }
      expect(preset.health).toBeGreaterThanOrEqual(1);
      expect(preset.health).toBeLessThanOrEqual(12);
    }
  });

  it('names presets in the Interface Language', () => {
    const en = getArenaPresets('en');
    const pl = getArenaPresets('pl');
    expect(en.map((preset) => preset.id)).toEqual(pl.map((preset) => preset.id));
    for (const preset of [...en, ...pl]) {
      expect(preset.name.length).toBeGreaterThan(0);
    }
  });

  it('carries the whispering-woods Hunter Template', () => {
    const presets = getArenaPresets('en');
    const hunter = presets.find((preset) => preset.id === 'whispering-woods/hunter');
    expect(hunter?.attributes).toEqual({ might: 1, agility: 3, wits: 2, presence: 0 });
    expect(hunter?.health).toBe(12);
  });

  it('validates every preset as a Character against the Bestiary', () => {
    const first = BESTIARY[0];
    if (first === undefined) throw new Error('expected a bestiary entry');
    for (const preset of getArenaPresets('en')) {
      const setup = buildArenaSetup(first.id, 'en', {
        attributes: { ...preset.attributes },
        health: preset.health,
      });
      expect(setup).toBeDefined();
      expect(validateArenaSetup(setup).ok, preset.id).toBe(true);
    }
  });
});

describe('parseArenaCharacter', () => {
  it('parses valid controls, trimming whitespace', () => {
    expect(
      parseArenaCharacter({ might: ' 2 ', agility: '0', wits: '3', presence: '1', health: '12' }),
    ).toEqual({ attributes: { might: 2, agility: 0, wits: 3, presence: 1 }, health: 12 });
  });

  it('leaves range checks to the engine validation', () => {
    expect(
      parseArenaCharacter({ might: '4', agility: '0', wits: '0', presence: '0', health: '13' }),
    ).toEqual({ attributes: { might: 4, agility: 0, wits: 0, presence: 0 }, health: 13 });
  });

  it('rejects missing, empty and non-integer controls', () => {
    const valid = { might: '1', agility: '1', wits: '1', presence: '1', health: '8' };
    expect(parseArenaCharacter({ ...valid, might: null })).toBeUndefined();
    expect(parseArenaCharacter({ ...valid, health: '' })).toBeUndefined();
    expect(parseArenaCharacter({ ...valid, agility: '  ' })).toBeUndefined();
    expect(parseArenaCharacter({ ...valid, wits: 'abc' })).toBeUndefined();
    expect(parseArenaCharacter({ ...valid, presence: '2.5' })).toBeUndefined();
    expect(parseArenaCharacter({ ...valid, health: 'NaN' })).toBeUndefined();
  });
});

describe('the Start server path (parse, build, validate)', () => {
  function startPath(
    enemyId: string,
    fields: { might: string; agility: string; wits: string; presence: string; health: string },
  ): ReturnType<typeof validateArenaSetup> | undefined {
    const character = parseArenaCharacter(fields);
    if (character === undefined) return undefined;
    const setup = buildArenaSetup(enemyId, 'en', character);
    if (setup === undefined) return undefined;
    return validateArenaSetup(setup);
  }

  it('starts a custom Character the action would accept', () => {
    const first = BESTIARY[0];
    if (first === undefined) throw new Error('expected a bestiary entry');
    const validated = startPath(first.id, {
      might: '0',
      agility: '3',
      wits: '0',
      presence: '0',
      health: '5',
    });
    expect(validated?.ok).toBe(true);
    if (validated?.ok !== true) throw new Error('should validate');
    expect(validated.setup.character).toEqual({
      attributes: { might: 0, agility: 3, wits: 0, presence: 0 },
      health: 5,
    });
  });

  it('rejects out-of-range values through the engine validation', () => {
    const first = BESTIARY[0];
    if (first === undefined) throw new Error('expected a bestiary entry');
    const valid = { might: '1', agility: '1', wits: '1', presence: '1', health: '8' };
    expect(startPath(first.id, { ...valid, might: '4' })?.ok).toBe(false);
    expect(startPath(first.id, { ...valid, agility: '-1' })?.ok).toBe(false);
    expect(startPath(first.id, { ...valid, health: '0' })?.ok).toBe(false);
    expect(startPath(first.id, { ...valid, health: '13' })?.ok).toBe(false);
    expect(startPath(first.id, { ...valid, might: '' })).toBeUndefined();
  });

  it('rejects an unknown foe', () => {
    const valid = { might: '1', agility: '1', wits: '1', presence: '1', health: '8' };
    expect(startPath('no-such-foe', valid)).toBeUndefined();
  });

  it('keeps the default Character for the omitted preset path', () => {
    const first = BESTIARY[0];
    if (first === undefined) throw new Error('expected a bestiary entry');
    const setup = buildArenaSetup(first.id, 'en');
    expect(setup?.character).toEqual(DEFAULT_ARENA_CHARACTER);
    expect(setup?.character).not.toBe(DEFAULT_ARENA_CHARACTER);
  });
});

describe('extreme Characters through the Combat rules', () => {
  it('all 0 acts after the faster foe and rolls unmodified', () => {
    const { state } = startArena(
      wolfSetup({ attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 1 }),
      noDice,
    );
    // Speed order: both normal, Agility 0 loses to Agility 2.
    const view = arenaView(state);
    expect(view?.actions.find((action) => action.id === 'attack')?.order).toBe(2);
    // The wolf (Might 1) misses on [1,1]: 3 < 7 + Agility 0; the Character
    // (Might 0) misses on [1,1]: 2 < 7 + Agility 2.
    const result = applyArenaAction(
      state,
      { action: 'attack', targetId: 'wolf', expectedStep: 0 },
      strictDice([1, 1, 1, 1]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('should resolve');
    const round = result.journal.find((entry) => entry.type === 'arena-round');
    expect(round?.type).toBe('arena-round');
    if (round?.type !== 'arena-round') throw new Error('expected a round');
    expect(round.actions.map((action) => action.actor.kind)).toEqual(['participant', 'character']);
    expect(round.actions[0]?.roll).toMatchObject({ modifier: 1, target: 7, hit: false });
    expect(round.actions[1]?.roll).toMatchObject({ modifier: 0, target: 9, hit: false });
    expect(result.state.status).toBe('active');
  });

  it('Agility 3 escapes first with its bonus against the foe', () => {
    const { state } = startArena(
      wolfSetup({ attributes: { might: 0, agility: 3, wits: 0, presence: 0 }, health: 12 }),
      noDice,
    );
    // Speed order: both normal, Agility 3 beats Agility 2.
    const view = arenaView(state);
    expect(view?.actions.find((action) => action.id === 'attack')?.order).toBe(1);
    // Escape on [3,3]: 6 + Agility 3 = 9 >= 7 + Agility 2, so the wolf's
    // Strike never resolves.
    const result = applyArenaAction(state, { action: 'escape', expectedStep: 0 }, strictDice([3, 3]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('should resolve');
    const round = result.journal.find((entry) => entry.type === 'arena-round');
    expect(round?.type).toBe('arena-round');
    if (round?.type !== 'arena-round') throw new Error('expected a round');
    expect(round.actions[0]?.kind).toBe('escape');
    expect(round.actions[0]?.roll).toMatchObject({ modifier: 3, target: 9, hit: true });
    expect(round.actions[0]?.order).toBe(1);
    expect(round.actions[1]).toMatchObject({ status: 'not-reached' });
    expect(result.state.status).toBe('escape');
  });

  it('starting Health shows below the full maximum', () => {
    const { state } = startArena(
      wolfSetup({ attributes: { might: 1, agility: 1, wits: 1, presence: 1 }, health: 5 }),
      noDice,
    );
    expect(state.character.health).toBe(5);
    const combat = arenaCombatView(state, 'en');
    expect(combat?.character.health).toBe(5);
    expect(combat?.character.maxHealth).toBe(12);
  });
});
