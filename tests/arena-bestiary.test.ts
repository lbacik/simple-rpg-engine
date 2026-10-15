// The Arena Bestiary (issue #166): the small initial offer of Enemy kinds an
// Arena Setup draws its opponents from, with the default Character kept for
// the fight. Every entry validates against the same Enemy limits as Scenario
// Enemies, through the Arena Setup validation.

import { describe, expect, it } from 'vitest';
import { validateArenaSetup } from '../src/engine/index';
import {
  BESTIARY,
  DEFAULT_ARENA_CHARACTER,
  bestiaryById,
  buildArenaSetup,
  validateBestiary,
  validateBestiaryEntry,
} from '../src/app/arena/bestiary';

describe('bestiary', () => {
  it('offers at least one Enemy with English and Polish names', () => {
    expect(BESTIARY.length).toBeGreaterThan(0);
    for (const entry of BESTIARY) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name.en.length).toBeGreaterThan(0);
      expect(entry.name.pl.length).toBeGreaterThan(0);
      expect(entry.description.en.length).toBeGreaterThan(0);
      expect(entry.description.pl.length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids', () => {
    const ids = BESTIARY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('validates every entry against the Arena Enemy limits', () => {
    for (const entry of BESTIARY) {
      const validated = validateArenaSetup({
        character: DEFAULT_ARENA_CHARACTER,
        opponents: [{ id: entry.id, enemy: entry.enemy, range: entry.range }],
      });
      expect(validated.ok, entry.id).toBe(true);
    }
  });

  it('builds a Setup with the Enemy name in the Interface Language', () => {
    const first = BESTIARY[0];
    if (first === undefined) throw new Error('expected a bestiary entry');
    const en = buildArenaSetup(first.id, 'en');
    const pl = buildArenaSetup(first.id, 'pl');
    expect(en?.opponents[0]?.enemy.name).toBe(first.name.en);
    expect(pl?.opponents[0]?.enemy.name).toBe(first.name.pl);
    expect(bestiaryById('no-such-foe')).toBeUndefined();
    expect(buildArenaSetup('no-such-foe', 'en')).toBeUndefined();
  });

  it('spans at least 10 entries with both Reaches and both Behaviours', () => {
    expect(BESTIARY.length).toBeGreaterThanOrEqual(10);
    expect(BESTIARY.length).toBeLessThanOrEqual(12);
    const reaches = new Set(BESTIARY.map((entry) => entry.enemy.reach));
    expect(reaches.has('melee')).toBe(true);
    expect(reaches.has('ranged')).toBe(true);
    const behaviours = new Set(BESTIARY.map((entry) => entry.enemy.behaviour));
    expect(behaviours.has('steady')).toBe(true);
    expect(behaviours.has('heavy')).toBe(true);
    // Both Reaches appear under both Behaviours: a steady and a heavy archer.
    expect(
      BESTIARY.some(
        (entry) => entry.enemy.reach === 'ranged' && entry.enemy.behaviour === 'steady',
      ),
    ).toBe(true);
    expect(
      BESTIARY.some(
        (entry) => entry.enemy.reach === 'ranged' && entry.enemy.behaviour === 'heavy',
      ),
    ).toBe(true);
  });

  it('covers the ordinary, boss and extreme ends of the Enemy limits', () => {
    // Ordinary duels: modest Health and Damage.
    expect(
      BESTIARY.filter((entry) => entry.enemy.health <= 10 && entry.enemy.damage <= 2).length,
    ).toBeGreaterThanOrEqual(6);
    // Boss duel: a heavy hitter around the Barrow Wight.
    expect(
      BESTIARY.some((entry) => entry.enemy.health >= 13 && entry.enemy.damage >= 3),
    ).toBe(true);
    // Extremes within the limits: Attributes 0 and 3, Damage 1 and 6,
    // fragile Health and the Health ceiling.
    const attributes = BESTIARY.flatMap((entry) => Object.values(entry.enemy.attributes));
    expect(Math.min(...attributes)).toBe(0);
    expect(Math.max(...attributes)).toBe(3);
    expect(Math.min(...BESTIARY.map((entry) => entry.enemy.damage))).toBe(1);
    expect(Math.max(...BESTIARY.map((entry) => entry.enemy.damage))).toBe(6);
    expect(Math.min(...BESTIARY.map((entry) => entry.enemy.health))).toBeLessThanOrEqual(3);
    expect(Math.max(...BESTIARY.map((entry) => entry.enemy.health))).toBe(30);
  });

  it('carries the stats the Arena picker shows for every entry', () => {
    for (const entry of BESTIARY) {
      const { attributes, health, damage, reach, behaviour } = entry.enemy;
      for (const value of Object.values(attributes)) {
        expect(Number.isInteger(value)).toBe(true);
      }
      expect(Number.isInteger(health)).toBe(true);
      expect(Number.isInteger(damage)).toBe(true);
      expect(['melee', 'ranged']).toContain(reach);
      expect(['steady', 'heavy']).toContain(behaviour);
      expect(['near', 'far']).toContain(entry.range);
    }
  });

  it('validates the whole Bestiary with no issues', () => {
    expect(validateBestiary()).toEqual([]);
  });

  it('rejects an invalid entry against the Scenario Enemy limits', () => {
    const valid = BESTIARY[0];
    if (valid === undefined) throw new Error('expected a bestiary entry');
    expect(validateBestiaryEntry(valid).ok).toBe(true);
    const tooStrong = {
      ...valid,
      enemy: { ...valid.enemy, attributes: { ...valid.enemy.attributes, might: 4 } },
    };
    const healthOverflow = { ...valid, enemy: { ...valid.enemy, health: 31 } };
    const damageOverflow = { ...valid, enemy: { ...valid.enemy, damage: 7 } };
    const missingPolish = { ...valid, name: { en: 'Grey Wolf', pl: '' } };
    const missingReach = {
      ...valid,
      enemy: { ...valid.enemy, reach: undefined },
    };
    const emptyEnemyName = { ...valid, enemy: { ...valid.enemy, name: '' } };
    for (const entry of [
      tooStrong,
      healthOverflow,
      damageOverflow,
      missingPolish,
      missingReach,
      emptyEnemyName,
    ]) {
      const result = validateBestiaryEntry(entry);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected validation to fail');
      expect(result.issues.length).toBeGreaterThan(0);
    }
    expect(validateBestiary([valid, valid])).not.toEqual([]);
  });
});
