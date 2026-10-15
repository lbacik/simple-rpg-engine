// Engine Arena suite (issue #165): the Arena Setup validated and turned into
// a running Combat through the engine, every Round resolved through the public
// action entry point with the unchanged Combat rules, and Combat end yielding
// a plain Arena result with no Scenario Ending or Outcome involved.
//
// Dice: every test uses a STRICT finite rng that throws when exhausted, never
// cycling. Dice arrays are sized exactly: 2 dice per attack roll, plus 1 per
// heavy preparing draw in selection order after the resolution rolls.
// Rejection tests use a rng that throws on any draw.

import { describe, expect, it } from 'vitest';
import {
  applyArenaAction,
  arenaActions,
  arenaResult,
  startArena,
  validateArenaSetup,
  type ArenaAction,
  type ArenaJournalEntry,
  type ArenaSetup,
  type ArenaState,
  type Rng,
} from '../src/engine/index';

type ArenaSuccess = Extract<ReturnType<typeof applyArenaAction>, { ok: true }>;
type ArenaRoundEntry = Extract<ArenaJournalEntry, { type: 'arena-round' }>;
type StrictRng = Rng & { assertExhausted(): void };

/** A strict finite rng: deals the given dice in order, throws when exhausted. */
function strictDice(dice: number[]): StrictRng {
  let index = 0;
  const rng = ((min: number, max: number) => {
    if (index >= dice.length) {
      throw new Error(`dice exhausted after ${index} draws`);
    }
    const die = dice[index];
    if (die === undefined || die < min || die >= max) {
      throw new Error(`die ${String(die)} out of range [${min}, ${max})`);
    }
    index += 1;
    return die;
  }) as StrictRng;
  rng.assertExhausted = () => {
    expect(index).toBe(dice.length);
  };
  return rng;
}

/** A rng that fails the test if the engine draws any die (rejection paths). */
const noDice: Rng = () => {
  throw new Error('no dice should be drawn on a rejected action');
};

function validSetup(): ArenaSetup {
  const validated = validateArenaSetup({
    character: {
      attributes: { might: 3, agility: 3, wits: 1, presence: 0 },
      health: 12,
    },
    opponents: [
      {
        enemy: {
          name: 'Dummy',
          attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
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

function act(
  state: ArenaState,
  action: ArenaAction,
  rng: Rng,
): ArenaSuccess {
  const result = applyArenaAction(state, action, rng);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`action failed: ${result.reason}`);
  return result;
}

function roundOf(journal: ArenaJournalEntry[]): ArenaRoundEntry {
  const round = journal.find((entry) => entry.type === 'arena-round');
  expect(round?.type).toBe('arena-round');
  return round as ArenaRoundEntry;
}

describe('validateArenaSetup', () => {
  it('accepts a valid setup with defaults applied', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 1, agility: 1, wits: 1, presence: 1 }, health: 8 },
      opponents: [{ enemy: { name: 'Wolf', attributes: { might: 2, agility: 1, wits: 1, presence: 0 }, health: 8, damage: 2 } }],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('should validate');
    expect(validated.setup.opponents[0]?.enemy.reach).toBe('melee');
    expect(validated.setup.opponents[0]?.enemy.behaviour).toBe('steady');
    expect(validated.setup.opponents[0]?.range).toBe('far');
  });

  it('accepts extreme Attributes with no sum limit', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 3, agility: 3, wits: 3, presence: 3 }, health: 12 },
      opponents: [
        { enemy: { name: 'Titan', attributes: { might: 3, agility: 3, wits: 3, presence: 3 }, health: 30, damage: 6 } },
      ],
    });
    expect(validated.ok).toBe(true);
  });

  it('accepts two opponents', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 1 },
      opponents: [
        { enemy: { name: 'A', attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 1, damage: 1 } },
        { enemy: { name: 'B', attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 1, damage: 1 } },
      ],
    });
    expect(validated.ok).toBe(true);
  });

  it('rejects more than 2 opponents', () => {
    const foe = { enemy: { name: 'F', attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 1, damage: 1 } };
    const validated = validateArenaSetup({
      character: { attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 12 },
      opponents: [{ ...foe }, { ...foe }, { ...foe }],
    });
    expect(validated.ok).toBe(false);
  });

  it('rejects zero opponents', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 12 },
      opponents: [],
    });
    expect(validated.ok).toBe(false);
  });

  it('rejects out-of-range Attributes on either side', () => {
    const good = { might: 0, agility: 0, wits: 0, presence: 0 };
    for (const attributes of [
      { ...good, might: 4 },
      { ...good, agility: -1 },
    ]) {
      expect(
        validateArenaSetup({ character: { attributes, health: 12 }, opponents: [{ enemy: { name: 'F', attributes: good, health: 1, damage: 1 } }] }).ok,
      ).toBe(false);
      expect(
        validateArenaSetup({ character: { attributes: good, health: 12 }, opponents: [{ enemy: { name: 'F', attributes, health: 1, damage: 1 } }] }).ok,
      ).toBe(false);
    }
  });

  it('rejects out-of-range Health and Damage', () => {
    const good = { might: 0, agility: 0, wits: 0, presence: 0 };
    const character = { attributes: good, health: 12 };
    const enemy = { name: 'F', attributes: good, health: 1, damage: 1 };
    expect(validateArenaSetup({ character: { ...character, health: 0 }, opponents: [{ enemy }] }).ok).toBe(false);
    expect(validateArenaSetup({ character: { ...character, health: 13 }, opponents: [{ enemy }] }).ok).toBe(false);
    expect(validateArenaSetup({ character, opponents: [{ enemy: { ...enemy, health: 0 } }] }).ok).toBe(false);
    expect(validateArenaSetup({ character, opponents: [{ enemy: { ...enemy, health: 31 } }] }).ok).toBe(false);
    expect(validateArenaSetup({ character, opponents: [{ enemy: { ...enemy, damage: 0 } }] }).ok).toBe(false);
    expect(validateArenaSetup({ character, opponents: [{ enemy: { ...enemy, damage: 7 } }] }).ok).toBe(false);
  });

  it('rejects an out-of-range weapon and duplicate opponent ids', () => {
    const good = { might: 0, agility: 0, wits: 0, presence: 0 };
    const enemy = { name: 'F', attributes: good, health: 1, damage: 1 };
    expect(
      validateArenaSetup({
        character: { attributes: good, health: 12, weapon: { damage: 4, reach: 'ranged' } },
        opponents: [{ enemy }],
      }).ok,
    ).toBe(false);
    expect(
      validateArenaSetup({
        character: { attributes: good, health: 12 },
        opponents: [{ id: 'foe', enemy }, { id: 'foe', enemy }],
      }).ok,
    ).toBe(false);
  });
});

describe('startArena', () => {
  it('starts a running Combat with selected Intents and no result yet', () => {
    const { state, journal } = startArena(validSetup(), noDice);
    expect(state.kind).toBe('arena');
    expect(state.status).toBe('active');
    expect(state.round).toBe(1);
    expect(state.step).toBe(0);
    expect(state.opponents).toHaveLength(1);
    // A melee opponent at Near is in Reach: Strike, with no draw.
    expect(state.opponents[0]?.intent).toBe('strike');
    expect(journal).toHaveLength(1);
    expect(journal[0]?.type).toBe('arena-start');
    expect(arenaResult(state)).toBeUndefined();
  });

  it('selects Close in for a melee opponent starting Far', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 12 },
      opponents: [
        { enemy: { name: 'Brute', attributes: { might: 1, agility: 0, wits: 0, presence: 0 }, health: 5, damage: 2 } },
        { enemy: { name: 'Imp', attributes: { might: 0, agility: 1, wits: 0, presence: 0 }, health: 3, damage: 1, reach: 'ranged' } },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('should validate');
    const { state } = startArena(validated.setup, noDice);
    expect(state.opponents.map((opponent) => opponent.intent)).toEqual(['close-in', 'strike']);
    expect(state.opponents.map((opponent) => opponent.id)).toEqual(['foe-1', 'foe-2']);
  });

  it('draws the heavy Prepare through the shared selection', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 12 },
      opponents: [
        { enemy: { name: 'Ogre', attributes: { might: 2, agility: 0, wits: 0, presence: 0 }, health: 10, damage: 3, behaviour: 'heavy' }, range: 'near' },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('should validate');
    const preparing = startArena(validated.setup, strictDice([1]));
    expect(preparing.state.opponents[0]?.intent).toBe('prepare');
    const striking = startArena(validated.setup, strictDice([6]));
    expect(striking.state.opponents[0]?.intent).toBe('strike');
  });
});

describe('victory, death and escape through the public entry point', () => {
  it('plays a full fight to victory with no Ending or Outcome', () => {
    const { state: started } = startArena(validSetup(), noDice);
    // Character Might 3 + [3,3] = 9 >= 7 + Agility 0: hit for 2, defeating
    // the 2-Health Dummy before its Strike resolves.
    const rng = strictDice([3, 3]);
    const result = act(started, { action: 'attack', expectedStep: 0 }, rng);
    rng.assertExhausted();
    expect(result.state.status).toBe('victory');
    expect(result.state.step).toBe(1);
    const round = roundOf(result.journal);
    expect(round.stop).toBe('victory');
    expect(round.actions.map((entry) => entry.status)).toEqual(['executed', 'not-reached']);
    expect(result.journal.at(-1)).toMatchObject({ type: 'arena-end', howEnded: 'victory' });
    // No Scenario Ending or Outcome is involved: the journal carries only
    // Arena entries, and the result is the plain outcome.
    expect(result.journal.every((entry) => entry.type.startsWith('arena-'))).toBe(true);
    expect(arenaResult(result.state)).toEqual({ outcome: 'victory', rounds: 1 });
  });

  it('plays a full fight to death with no Ending', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 1 },
      opponents: [
        { enemy: { name: 'Slayer', attributes: { might: 3, agility: 3, wits: 0, presence: 0 }, health: 30, damage: 6 }, range: 'near' },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('should validate');
    const { state: started } = startArena(validated.setup, noDice);
    // Enemy Agility 3 acts before the Character: [3,3] + 3 = 9 >= 7 + 0 hits
    // for 6, killing the 1-Health Character before its Attack resolves.
    const rng = strictDice([3, 3]);
    const result = act(started, { action: 'attack', expectedStep: 0 }, rng);
    rng.assertExhausted();
    expect(result.state.status).toBe('death');
    expect(result.state.character.health).toBe(0);
    expect(roundOf(result.journal).stop).toBe('death');
    expect(result.journal.every((entry) => entry.type.startsWith('arena-'))).toBe(true);
    expect(arenaResult(result.state)).toEqual({ outcome: 'death', rounds: 1 });
  });

  it('plays a full fight to escape with the Far bonus', () => {
    const { state: started } = startArena(validSetup(), noDice);
    // The melee Dummy starts Far in this setup variant: Escape keeps its +2
    // (Agility 3 + 2 + [1,1] = 7 >= 7 + Agility 0) and the Round stops before
    // its Close in resolves.
    const far = startArena(
      {
        ...validSetup(),
        opponents: [{ ...validSetup().opponents[0]!, range: 'far' }],
      } as ArenaSetup,
      noDice,
    ).state;
    expect(far.opponents[0]?.intent).toBe('close-in');
    const rng = strictDice([1, 1]);
    const result = act(far, { action: 'escape', expectedStep: 0 }, rng);
    rng.assertExhausted();
    expect(result.state.status).toBe('escape');
    expect(roundOf(result.journal).stop).toBe('escape');
    expect(result.journal.at(-1)).toMatchObject({ type: 'arena-end', howEnded: 'escape' });
    expect(arenaResult(result.state)).toEqual({ outcome: 'escape', rounds: 1 });
    expect(started.status).toBe('active');
  });

  it('resolves selection dice after the resolution rolls on a continuing Round', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 12 },
      opponents: [
        { enemy: { name: 'Ogre', attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 10, damage: 1, behaviour: 'heavy' }, range: 'near' },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('should validate');
    // Start draws the Prepare roll ([6]: Strike); the Round then resolves the
    // Character Attack (miss), the Enemy Strike (miss), and draws the next
    // selection ([6]: Strike again) — resolution rolls first.
    const startRng = strictDice([6]);
    const { state: started } = startArena(validated.setup, startRng);
    startRng.assertExhausted();
    const rng = strictDice([1, 1, 3, 3, 6]);
    const result = act(started, { action: 'attack', expectedStep: 0 }, rng);
    rng.assertExhausted();
    expect(result.state.status).toBe('active');
    expect(result.state.round).toBe(2);
    expect(result.state.step).toBe(1);
    expect(result.state.opponents[0]?.intent).toBe('strike');
    expect(roundOf(result.journal).stop).toBeUndefined();
  });
});

describe('unchanged Combat rules', () => {
  it('guards with Defend and answers the first missed melee attack', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 3, agility: 3, wits: 0, presence: 0 }, health: 12 },
      opponents: [
        { enemy: { name: 'Mook', attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 1, damage: 1 }, range: 'near' },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('should validate');
    const { state: started } = startArena(validated.setup, noDice);
    // Defend (fast) guards first; the Strike then needs 9 + 3 = 12 and misses
    // on [1,1]; the counter hits ([2,2] + 3 = 7 >= 7 + 0) for 1, defeating the
    // 1-Health Mook: victory through the reaction.
    const rng = strictDice([1, 1, 2, 2]);
    const result = act(started, { action: 'defend', expectedStep: 0 }, rng);
    rng.assertExhausted();
    expect(result.state.status).toBe('victory');
    const round = roundOf(result.journal);
    expect(round.actions[0]).toMatchObject({ kind: 'defend', status: 'executed', guarded: true });
    expect(round.actions[1]?.counter).toMatchObject({ damage: 1 });
    expect(round.actions[1]?.counter?.defeatedParticipants).toEqual(['foe-1']);
  });

  it('interrupts with Distract and refuses the Wary target next Round', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 0, agility: 0, wits: 3, presence: 0 }, health: 12 },
      opponents: [
        { enemy: { name: 'Mook', attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 10, damage: 1 }, range: 'near' },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('should validate');
    const { state: started } = startArena(validated.setup, noDice);
    // [4,4] + 3 = 11 >= 7 + 0: the Strike is interrupted and the Mook is Wary
    // until the end of Round 2. The steady next selection draws no dice.
    const rng = strictDice([4, 4]);
    const result = act(started, { action: 'distract', expectedStep: 0 }, rng);
    rng.assertExhausted();
    expect(result.state.status).toBe('active');
    expect(result.state.opponents[0]?.waryUntilRound).toBe(2);
    expect(roundOf(result.journal).actions[1]).toMatchObject({ status: 'cancelled', cancelReason: 'interrupted' });
    const refused = applyArenaAction(result.state, { action: 'distract', expectedStep: 1 }, noDice);
    expect(refused).toEqual({ ok: false, reason: 'illegal-action' });
    expect(result.state.step).toBe(1);
  });

  it('advances to Reach and falls back from Near', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 0, agility: 3, wits: 0, presence: 0 }, health: 12 },
      opponents: [
        { enemy: { name: 'Archer', attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 10, damage: 1, reach: 'ranged' }, range: 'far' },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('should validate');
    const { state: started } = startArena(validated.setup, noDice);
    // Advance moves only the targeted lane to Near. The ranged Strike still
    // resolves: [1,1] + 0 = 2 < 7 + 3 misses. The next selection draws nothing.
    const advanceRng = strictDice([1, 1]);
    const advanced = act(started, { action: 'advance', expectedStep: 0 }, advanceRng);
    advanceRng.assertExhausted();
    expect(advanced.state.opponents[0]?.range).toBe('near');
    // Fall back needs 7 + 0 with Agility 3: [1,1] + 3 = 5 fails, and every
    // Near lane stays Near.
    const fallRng = strictDice([1, 1, 1, 1]);
    const fallen = act(advanced.state, { action: 'fall-back', expectedStep: 1 }, fallRng);
    fallRng.assertExhausted();
    expect(fallen.state.opponents[0]?.range).toBe('near');
  });
});

describe('rejections', () => {
  it('rejects an untargeted attack with two survivors, a Far melee attack and use-item', () => {
    const validated = validateArenaSetup({
      character: { attributes: { might: 3, agility: 0, wits: 0, presence: 0 }, health: 12 },
      opponents: [
        { enemy: { name: 'A', attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 10, damage: 1 }, range: 'near' },
        { enemy: { name: 'B', attributes: { might: 0, agility: 0, wits: 0, presence: 0 }, health: 10, damage: 1 }, range: 'far' },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('should validate');
    const { state: started } = startArena(validated.setup, noDice);
    expect(applyArenaAction(started, { action: 'attack', expectedStep: 0 }, noDice)).toEqual({
      ok: false, reason: 'illegal-action',
    });
    expect(applyArenaAction(started, { action: 'attack', targetId: 'foe-2', expectedStep: 0 }, noDice)).toEqual({
      ok: false, reason: 'illegal-action',
    });
    // An Arena Setup carries no consumables: use-item is always unavailable.
    expect(applyArenaAction(started, { action: 'use-item', expectedStep: 0 }, noDice)).toEqual({
      ok: false, reason: 'illegal-action',
    });
    // A target on an action that takes none is rejected too.
    expect(applyArenaAction(started, { action: 'escape', targetId: 'foe-1', expectedStep: 0 }, noDice)).toEqual({
      ok: false, reason: 'illegal-action',
    });
    expect(started.step).toBe(0);
  });

  it('rejects a stale step and any action once ended', () => {
    const { state: started } = startArena(validSetup(), noDice);
    expect(applyArenaAction(started, { action: 'defend', expectedStep: 1 }, noDice)).toEqual({
      ok: false, reason: 'stale-step',
    });
    const rng = strictDice([3, 3]);
    const won = act(started, { action: 'attack', expectedStep: 0 }, rng);
    rng.assertExhausted();
    expect(applyArenaAction(won.state, { action: 'defend', expectedStep: 1 }, noDice)).toEqual({
      ok: false, reason: 'ended',
    });
  });
});

describe('availability and the Playthrough boundary', () => {
  it('reports availability and goes quiet once ended', () => {
    const { state: started } = startArena(validSetup(), noDice);
    expect(arenaActions(started).find((entry) => entry.id === 'attack')?.enabled).toBe(true);
    expect(arenaActions(started).find((entry) => entry.id === 'advance')?.enabled).toBe(false);
    const rng = strictDice([3, 3]);
    const won = act(started, { action: 'attack', expectedStep: 0 }, rng);
    rng.assertExhausted();
    expect(arenaActions(won.state)).toEqual([]);
  });

  it('is never a Playthrough and yields no Ending or Outcome', () => {
    const { state: started, journal } = startArena(validSetup(), noDice);
    expect(started.kind).toBe('arena');
    expect(started).not.toHaveProperty('scenarioId');
    expect(started).not.toHaveProperty('endingId');
    expect(started).not.toHaveProperty('encounters');
    expect(journal[0]?.type).toBe('arena-start');
    const rng = strictDice([3, 3]);
    const won = act(started, { action: 'attack', expectedStep: 0 }, rng);
    rng.assertExhausted();
    expect(won.state).not.toHaveProperty('endingId');
    expect(arenaResult(won.state)).toEqual({ outcome: 'victory', rounds: 1 });
  });
});
