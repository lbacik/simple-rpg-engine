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
});
