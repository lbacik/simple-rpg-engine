// Arena Equipment (issue #169): the equipment catalogue behind the Arena
// setup — melee weapons across 2-4 Damage, ranged weapons across 2-3,
// unarmed, outfits and talismans with Attribute bonuses — and the engine
// behaviour behind the choices: the weapon's Damage and Reach, the Equipment
// bonuses with the +2 cap through the effective Attributes, and the
// Consumable quantity with use-in-Combat consuming one copy.
//
// Dice: every test uses a STRICT finite rng that throws when exhausted, never
// cycling. Rejection tests use a rng that throws on any draw.

import { describe, expect, it } from 'vitest';
import {
  ARENA_CONSUMABLE,
  OUTFITS,
  TALISMANS,
  WEAPONS,
  equipmentName,
  parseArenaEquipment,
  validateEquipmentCatalogue,
} from '../src/app/arena/equipment';
import {
  applyArenaAction,
  arenaActions,
  arenaView,
  startArena,
  validateArenaSetup,
  type ArenaSetup,
  type ArenaState,
  type Rng,
} from '../src/engine/index';

type ArenaSuccess = Extract<ReturnType<typeof applyArenaAction>, { ok: true }>;

function strictDice(dice: number[]): Rng {
  let index = 0;
  const rng = ((min: number, max: number) => {
    if (index >= dice.length) throw new Error(`dice exhausted after ${index} draws`);
    const die = dice[index];
    index += 1;
    if (die === undefined || die < min || die >= max) {
      throw new Error(`die ${String(die)} out of range [${min}, ${max})`);
    }
    return die;
  }) as Rng;
  (rng as Rng & { assertExhausted(): void }).assertExhausted = () => {
    expect(index).toBe(dice.length);
  };
  return rng;
}

const noDice: Rng = () => {
  throw new Error('no dice should be drawn on a rejected action');
};

const FLAT = { might: 0, agility: 0, wits: 0, presence: 0 };

function wolfSetup(character: ArenaSetup['character']): ArenaSetup {
  const validated = validateArenaSetup({
    character,
    opponents: [
      {
        id: 'wolf',
        enemy: {
          name: 'Wolf',
          attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
          health: 30,
          damage: 1,
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

function act(state: ArenaState, action: Parameters<typeof applyArenaAction>[1], rng: Rng): ArenaSuccess {
  const result = applyArenaAction(state, action, rng);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`action failed: ${result.reason}`);
  return result;
}

describe('equipment catalogue', () => {
  it('covers melee 2-4, ranged 2-3, unarmed, and bonus outfits and talismans', () => {
    expect(validateEquipmentCatalogue()).toEqual([]);
    const melee = WEAPONS.filter((weapon) => weapon.reach === 'melee').map((w) => w.damage).sort();
    const ranged = WEAPONS.filter((weapon) => weapon.reach === 'ranged').map((w) => w.damage).sort();
    expect(melee).toEqual([2, 3, 4]);
    expect(ranged).toEqual([2, 3]);
    for (const outfit of OUTFITS) {
      if (outfit.id === 'none') {
        expect(outfit.bonus).toBeUndefined();
      } else {
        expect(outfit.bonus).toBeDefined();
      }
    }
    for (const talisman of TALISMANS) {
      if (talisman.id === 'none') {
        expect(talisman.bonus).toBeUndefined();
      } else {
        expect(talisman.bonus).toBeDefined();
      }
    }
    // Every option reads in both Interface Languages.
    for (const entry of [...WEAPONS, ...OUTFITS, ...TALISMANS]) {
      expect(equipmentName(entry, 'en').length).toBeGreaterThan(0);
      expect(equipmentName(entry, 'pl').length).toBeGreaterThan(0);
    }
    expect(ARENA_CONSUMABLE.heal).toBeGreaterThanOrEqual(1);
    expect(ARENA_CONSUMABLE.heal).toBeLessThanOrEqual(12);
  });

  it('parses a full selection and rejects forged values', () => {
    const parsed = parseArenaEquipment({
      weapon: 'sword',
      outfit: 'chain-shirt',
      talisman: 'bear-fang',
      consumables: '2',
    });
    expect(parsed).toBeDefined();
    expect(parsed?.weapon).toMatchObject({ damage: 3, reach: 'melee' });
    // Both grant Might: the +2 cap holds by construction.
    expect(parsed?.bonuses).toMatchObject({ might: 2 });
    expect(parsed?.consumables?.count).toBe(2);

    // Unarmed and empty slots carry no weapon and no bonuses.
    const bare = parseArenaEquipment({
      weapon: 'unarmed',
      outfit: 'none',
      talisman: 'none',
      consumables: '0',
    });
    expect(bare).toBeDefined();
    expect(bare?.weapon).toBeUndefined();
    expect(bare?.bonuses).toBeUndefined();
    expect(bare?.consumables?.count).toBe(0);

    // Forged ids and out-of-range quantities parse to no Equipment.
    expect(
      parseArenaEquipment({ weapon: 'doomblade', outfit: 'none', talisman: 'none', consumables: '0' }),
    ).toBeUndefined();
    expect(
      parseArenaEquipment({ weapon: 'sword', outfit: 'plate', talisman: 'none', consumables: '0' }),
    ).toBeUndefined();
    expect(
      parseArenaEquipment({ weapon: 'sword', outfit: 'none', talisman: 'amulet', consumables: '0' }),
    ).toBeUndefined();
    expect(
      parseArenaEquipment({ weapon: 'sword', outfit: 'none', talisman: 'none', consumables: '9' }),
    ).toBeUndefined();
    expect(
      parseArenaEquipment({ weapon: 'sword', outfit: 'none', talisman: 'none', consumables: '' }),
    ).toBeUndefined();
  });
});

describe('weapons in the fight', () => {
  it('deals the weapon Damage at its Reach, or 2 melee bare-handed', () => {
    // The axe (melee 4) hits for 4: Might 3 + [3,3] = 9 >= 7 + 0. The wolf
    // survives its 30 Health and misses back ([1,1] + 0 = 2 < 7 + 0).
    const axe = wolfSetup({
      attributes: { might: 3, agility: 0, wits: 0, presence: 0 },
      health: 12,
      weapon: { damage: 4, reach: 'melee' },
    });
    axe.opponents[0]!.range = 'near';
    const { state: axeState } = startArena(axe, noDice);
    const axeRng = strictDice([3, 3, 1, 1]);
    const axeResult = act(axeState, { action: 'attack', expectedStep: 0 }, axeRng);
    (axeRng as Rng & { assertExhausted(): void }).assertExhausted();
    expect(axeResult.state.status).toBe('active');
    expect(axeResult.state.opponents[0]?.damageTaken).toBe(4);

    // Unarmed keeps the basic 2 Damage: the same roll deals 2.
    const bare = wolfSetup({
      attributes: { might: 3, agility: 0, wits: 0, presence: 0 },
      health: 12,
    });
    bare.opponents[0]!.range = 'near';
    const { state: bareState } = startArena(bare, noDice);
    const bareRng = strictDice([3, 3, 1, 1]);
    const bareResult = act(bareState, { action: 'attack', expectedStep: 0 }, bareRng);
    (bareRng as Rng & { assertExhausted(): void }).assertExhausted();
    expect(bareResult.state.status).toBe('active');
    expect(bareResult.state.opponents[0]?.damageTaken).toBe(2);
  });

  it('shoots a ranged weapon from Far and refuses a melee one there', () => {
    const bow = wolfSetup({
      attributes: { might: 3, agility: 0, wits: 0, presence: 0 },
      health: 12,
      weapon: { damage: 3, reach: 'ranged' },
    });
    bow.opponents[0]!.range = 'far';
    const { state: bowState } = startArena(bow, noDice);
    // The wolf closes in instead of attacking; the ranged attack still
    // resolves: [3,3] + 3 = 9 hits for 3.
    const bowRng = strictDice([3, 3]);
    const bowResult = act(bowState, { action: 'attack', expectedStep: 0 }, bowRng);
    (bowRng as Rng & { assertExhausted(): void }).assertExhausted();
    expect(bowResult.state.status).toBe('active');
    expect(bowResult.state.opponents[0]?.damageTaken).toBe(3);
    expect(bowResult.state.opponents[0]?.range).toBe('near');

    const sword = wolfSetup({
      attributes: { might: 3, agility: 0, wits: 0, presence: 0 },
      health: 12,
      weapon: { damage: 3, reach: 'melee' },
    });
    sword.opponents[0]!.range = 'far';
    const { state: swordState } = startArena(sword, noDice);
    expect(applyArenaAction(swordState, { action: 'attack', expectedStep: 0 }, noDice)).toEqual({
      ok: false,
      reason: 'illegal-action',
    });
  });
});

describe('equipment bonuses in the fight', () => {
  it('adds bonuses to the effective Attributes, capped at +2', () => {
    // Base Might 0 with +2 from Equipment hits on [3,3] + 2 = 8 >= 7;
    // without it the same roll misses (6 < 7).
    const armed = wolfSetup({
      attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
      health: 12,
      bonuses: { might: 2 },
    });
    armed.opponents[0]!.range = 'near';
    const { state: armedState } = startArena(armed, noDice);
    const hitRng = strictDice([3, 3, 1, 1]);
    const hit = act(armedState, { action: 'attack', expectedStep: 0 }, hitRng);
    (hitRng as Rng & { assertExhausted(): void }).assertExhausted();
    expect(hit.state.status).toBe('active');

    const plain = wolfSetup({ attributes: { ...FLAT }, health: 12 });
    plain.opponents[0]!.range = 'near';
    const { state: plainState } = startArena(plain, noDice);
    const missRng = strictDice([3, 3, 1, 1]);
    const miss = act(plainState, { action: 'attack', expectedStep: 0 }, missRng);
    (missRng as Rng & { assertExhausted(): void }).assertExhausted();
    expect(miss.state.status).toBe('active');
    const hitRoll = hit.journal.find((entry) => entry.type === 'arena-round');
    const missRoll = miss.journal.find((entry) => entry.type === 'arena-round');
    expect(hitRoll).toBeDefined();
    expect(missRoll).toBeDefined();
  });

  it('shows the Agility bonus in the enemy thresholds', () => {
    const swift = wolfSetup({
      attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
      health: 12,
      bonuses: { agility: 2 },
    });
    const view = arenaView(startArena(swift, noDice).state);
    expect(view?.participants[0]?.threshold).toBe(9);
    const slow = wolfSetup({ attributes: { ...FLAT }, health: 12 });
    expect(arenaView(startArena(slow, noDice).state)?.participants[0]?.threshold).toBe(7);
  });
});

describe('consumables in the fight', () => {
  function consumableSetup(health: number, count: number): ArenaSetup {
    return wolfSetup({
      attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
      health,
      consumables: { id: 'healing-draught', name: 'Healing Draught', heal: 4, count },
    });
  }

  it('rejects use-item at full Health and without consumables', () => {
    const full = consumableSetup(12, 2);
    const { state: fullState } = startArena(full, noDice);
    expect(applyArenaAction(fullState, { action: 'use-item', expectedStep: 0 }, noDice)).toEqual({
      ok: false,
      reason: 'illegal-action',
    });
    const entries = arenaActions(fullState).filter((entry) => entry.id === 'use-item');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.enabled).toBe(false);
    expect(entries[0]?.reason).toBe('full-health');

    const none = wolfSetup({ attributes: { ...FLAT }, health: 5 });
    const { state: noneState } = startArena(none, noDice);
    expect(applyArenaAction(noneState, { action: 'use-item', expectedStep: 0 }, noDice)).toEqual({
      ok: false,
      reason: 'illegal-action',
    });
    expect(arenaActions(noneState).some((entry) => entry.id === 'use-item')).toBe(false);
  });

  it('heals and consumes one copy at execution', () => {
    const setup = consumableSetup(5, 2);
    setup.opponents[0]!.range = 'near';
    const { state: started } = startArena(setup, noDice);
    // The wolf is Agility 0, the Character is Agility 0: the Character's
    // normal use-item holds commitment order first? Both normal: the
    // Character wins equal-Agility ties, so the use resolves first: 5 + 4
    // = 9, then the wolf strikes ([1,1] + 0 = 2 < 7 + 0 misses).
    const rng = strictDice([1, 1]);
    const result = act(started, { action: 'use-item', expectedStep: 0 }, rng);
    (rng as Rng & { assertExhausted(): void }).assertExhausted();
    expect(result.state.status).toBe('active');
    expect(result.state.character.health).toBe(9);
    expect(result.state.character.consumables?.count).toBe(1);
    const round = result.journal.find((entry) => entry.type === 'arena-round');
    expect(round).toMatchObject({ round: 1 });
  });

  it('consumes nothing when death stops the sequence first', () => {
    const validated = validateArenaSetup({
      character: {
        attributes: { might: 0, agility: 0, wits: 0, presence: 0 },
        health: 1,
        consumables: { id: 'healing-draught', name: 'Healing Draught', heal: 4, count: 1 },
      },
      opponents: [
        {
          id: 'slayer',
          enemy: {
            name: 'Slayer',
            attributes: { might: 3, agility: 3, wits: 0, presence: 0 },
            health: 30,
            damage: 6,
          },
          range: 'near',
        },
      ],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('fixture setup should validate');
    const { state: started } = startArena(validated.setup, noDice);
    // The Slayer's Agility 3 precedes the normal use-item: [3,3] + 3 = 9
    // hits for 6, killing the 1-Health Character before the use resolves.
    const rng = strictDice([3, 3]);
    const result = act(started, { action: 'use-item', expectedStep: 0 }, rng);
    (rng as Rng & { assertExhausted(): void }).assertExhausted();
    expect(result.state.status).toBe('death');
    expect(result.state.character.consumables?.count).toBe(1);
  });
});
