// The Arena Bestiary (issue #166): the small initial offer of Enemy kinds an
// Arena Setup draws its opponents from, with the default Character kept for
// the fight. Names and descriptions are content in English and Polish; the
// fight stores the name in the language the Setup was built in, the way the
// Journal stores Scenario text as presented.
//
// Issue #167 seeds the full Bestiary across the balance tiers; this module
// owns the shape it grows into: unique ids, one inline Enemy definition and
// one starting Range per entry.

import type {
  ArenaCharacterDefinition,
  ArenaEnemyDefinition,
  ArenaSetup,
} from '../../engine/index';
import type { InterfaceLanguage } from '../../i18n/index';

export type BestiaryEntry = {
  /** Unique within the Bestiary; the Arena opponent id of a fight against it. */
  id: string;
  name: { en: string; pl: string };
  description: { en: string; pl: string };
  enemy: ArenaEnemyDefinition;
  range: 'near' | 'far';
};

/** The default Character every Arena fight keeps (issue #166). */
export const DEFAULT_ARENA_CHARACTER: ArenaCharacterDefinition = {
  attributes: { might: 2, agility: 2, wits: 1, presence: 1 },
  health: 12,
};

export const BESTIARY: BestiaryEntry[] = [
  {
    id: 'grey-wolf',
    name: { en: 'Grey Wolf', pl: 'Szary Wilk' },
    description: {
      en: 'A lean hunter of the woods. Fast, but frail.',
      pl: 'Chudy łowca z lasu. Szybki, lecz kruchy.',
    },
    enemy: {
      name: 'Grey Wolf',
      attributes: { might: 1, agility: 2, wits: 1, presence: 0 },
      health: 8,
      damage: 2,
      reach: 'melee',
      behaviour: 'steady',
    },
    range: 'near',
  },
  {
    id: 'bandit-archer',
    name: { en: 'Bandit Archer', pl: 'Bandyta łucznik' },
    description: {
      en: 'A poacher who shoots first and talks never.',
      pl: 'Kłusownik, który najpierw strzela, a nigdy nie rozmawia.',
    },
    enemy: {
      name: 'Bandit Archer',
      attributes: { might: 1, agility: 1, wits: 1, presence: 1 },
      health: 7,
      damage: 2,
      reach: 'ranged',
      behaviour: 'steady',
    },
    range: 'far',
  },
  {
    id: 'cave-bear',
    name: { en: 'Cave Bear', pl: 'Niedźwiedź jaskiniowy' },
    description: {
      en: 'A wall of muscle and hunger. It winds up its heaviest blows.',
      pl: 'Ściana mięśni i głodu. Bierze zamach do najcięższych ciosów.',
    },
    enemy: {
      name: 'Cave Bear',
      attributes: { might: 3, agility: 0, wits: 0, presence: 1 },
      health: 14,
      damage: 3,
      reach: 'melee',
      behaviour: 'heavy',
    },
    range: 'near',
  },
];

export function bestiaryById(id: string): BestiaryEntry | undefined {
  return BESTIARY.find((entry) => entry.id === id);
}

export function bestiaryName(entry: BestiaryEntry, language: InterfaceLanguage): string {
  return language === 'pl' ? entry.name.pl : entry.name.en;
}

export function bestiaryDescription(entry: BestiaryEntry, language: InterfaceLanguage): string {
  return language === 'pl' ? entry.description.pl : entry.description.en;
}

/**
 * One Arena Setup for a fight against the Bestiary entry: the default
 * Character and the single opponent with its Enemy name in the Interface
 * Language. Undefined for an unknown entry id.
 */
export function buildArenaSetup(id: string, language: InterfaceLanguage): ArenaSetup | undefined {
  const entry = bestiaryById(id);
  if (entry === undefined) {
    return undefined;
  }
  return {
    character: { ...DEFAULT_ARENA_CHARACTER },
    opponents: [
      {
        id: entry.id,
        enemy: { ...entry.enemy, name: bestiaryName(entry, language) },
        range: entry.range,
      },
    ],
  };
}
