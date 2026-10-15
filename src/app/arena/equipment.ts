// The Arena equipment catalogue (issue #169): the weapons, outfits,
// talismans and Consumables an Arena Setup draws the Character's Equipment
// from. Server-side like the Bestiary: the setup form receives plain option
// data as props, and the Start action re-validates every submitted id, so the
// fight never trusts the browser.
//
// Weapons cover the full Scenario ranges (docs/spec/mechanics.md, equipment):
// melee 2-4 Damage, ranged 2-3. Unarmed is an explicit option carrying no
// weapon, so the fight keeps the basic 2-Damage melee attack. Outfits and
// talismans each grant +1 to one Attribute; the two slots stack, so the +2
// cap holds by construction. The single Consumable kind carries a fixed heal
// with a configurable quantity.

import type { ArenaConsumables, ArenaWeapon } from '../../engine/index';
import type { InterfaceLanguage } from '../../i18n/index';

export type ArenaWeaponOption = {
  /** Unique within the weapon options; `unarmed` carries no weapon. */
  id: string;
  name: { en: string; pl: string };
  description: { en: string; pl: string };
  damage: number;
  reach: 'melee' | 'ranged';
};

export type ArenaBonusOption = {
  /** Unique within its slot; `none` grants no bonus. */
  id: string;
  name: { en: string; pl: string };
  description: { en: string; pl: string };
  /** The +1 Attribute bonus while equipped; absent on the empty slot. */
  bonus?: 'might' | 'agility' | 'wits' | 'presence';
};

/** The five armed options: melee across 2-4 Damage, ranged across 2-3. */
export const WEAPONS: ArenaWeaponOption[] = [
  {
    id: 'walking-staff',
    name: { en: 'Walking Staff', pl: 'Kostur' },
    description: {
      en: 'An ash staff shod with iron. Light, and always at hand.',
      pl: 'Jesienny kostur okuty żelazem. Lekki i zawsze pod ręką.',
    },
    damage: 2,
    reach: 'melee',
  },
  {
    id: 'sword',
    name: { en: 'Sword', pl: 'Miecz' },
    description: {
      en: 'A plain soldier’s blade, nicked but well kept.',
      pl: 'Prosty żołnierski miecz, wyszczerbiony, lecz zadbany.',
    },
    damage: 3,
    reach: 'melee',
  },
  {
    id: 'woodsman-axe',
    name: { en: 'Woodsman’s Axe', pl: 'Topór drwala' },
    description: {
      en: 'A heavy, long-hafted axe made for felling oaks.',
      pl: 'Ciężki topór na długim toporzysku, stworzony do ścinania dębów.',
    },
    damage: 4,
    reach: 'melee',
  },
  {
    id: 'short-bow',
    name: { en: 'Short Bow', pl: 'Krótki łuk' },
    description: {
      en: 'A short hunting bow, quick to draw at any distance.',
      pl: 'Krótki łuk myśliwski, szybki w użyciu na każdym dystansie.',
    },
    damage: 2,
    reach: 'ranged',
  },
  {
    id: 'hunting-bow',
    name: { en: 'Hunting Bow', pl: 'Łuk myśliwski' },
    description: {
      en: 'A supple yew bow, good for deer and for keeping trouble at a distance.',
      pl: 'Gibki cisowy łuk, dobry na jelenie i na trzymanie kłopotów na dystans.',
    },
    damage: 3,
    reach: 'ranged',
  },
];

/** Fighting bare-handed: no weapon, so the basic 2-Damage melee attack. */
export const UNARMED_OPTION: ArenaWeaponOption = {
  id: 'unarmed',
  name: { en: 'Bare hands', pl: 'Gołe ręce' },
  description: {
    en: 'No weapon. The basic attack deals 2 Damage at Near Range.',
    pl: 'Bez broni. Podstawowy atak zadaje 2 obrażenia w zwarciu.',
  },
  damage: 2,
  reach: 'melee',
};

export const WEAPON_OPTIONS: ArenaWeaponOption[] = [...WEAPONS, UNARMED_OPTION];

export const OUTFITS: ArenaBonusOption[] = [
  {
    id: 'none',
    name: { en: 'No outfit', pl: 'Bez stroju' },
    description: {
      en: 'No outfit. No Attribute bonus.',
      pl: 'Bez stroju. Bez bonusu do atrybutu.',
    },
  },
  {
    id: 'chain-shirt',
    name: { en: 'Chain Shirt', pl: 'Kolczuga' },
    description: {
      en: 'Heavy rings that teach the shoulders to carry weight. +1 Might.',
      pl: 'Ciężkie ogniwa uczą barki dźwigania ciężaru. +1 Krzepa.',
    },
    bonus: 'might',
  },
  {
    id: 'hunters-cloak',
    name: { en: 'Hunter’s Cloak', pl: 'Płaszcz łowcy' },
    description: {
      en: 'Mottled green wool that blends into the undergrowth. +1 Agility.',
      pl: 'Zielona wełna w cętki, zlewająca się z podszyciem. +1 Zręczność.',
    },
    bonus: 'agility',
  },
  {
    id: 'scholar-robe',
    name: { en: 'Scholar’s Robe', pl: 'Szata uczonego' },
    description: {
      en: 'A patched robe with roomy pockets for notes. +1 Wits.',
      pl: 'Łatana szata z obszernymi kieszeniami na notatki. +1 Spryt.',
    },
    bonus: 'wits',
  },
];

export const TALISMANS: ArenaBonusOption[] = [
  {
    id: 'none',
    name: { en: 'No talisman', pl: 'Bez talizmanu' },
    description: {
      en: 'No talisman. No Attribute bonus.',
      pl: 'Bez talizmanu. Bez bonusu do atrybutu.',
    },
  },
  {
    id: 'bear-fang',
    name: { en: 'Bear Fang', pl: 'Kieł niedźwiedzia' },
    description: {
      en: 'A heavy fang on a leather cord. +1 Might.',
      pl: 'Ciężki kieł na rzemieniu. +1 Krzepa.',
    },
    bonus: 'might',
  },
  {
    id: 'hawk-feather',
    name: { en: 'Hawk Feather', pl: 'Jastrzębie pióro' },
    description: {
      en: 'A barred feather that never seems to lie still. +1 Agility.',
      pl: 'Pręgowane pióro, które nigdy nie leży spokojnie. +1 Zręczność.',
    },
    bonus: 'agility',
  },
  {
    id: 'silver-charm',
    name: { en: 'Silver Charm', pl: 'Srebrny talizman' },
    description: {
      en: 'A tarnished silver disc engraved with a hawk. +1 Presence.',
      pl: 'Pociemniały srebrny krążek z wyrytym jastrzębiem. +1 Prezencja.',
    },
    bonus: 'presence',
  },
];

/** The single Arena Consumable kind: a fixed heal with a chosen quantity. */
export const ARENA_CONSUMABLE = {
  id: 'healing-draught',
  name: { en: 'Healing Draught', pl: 'Wywar leczniczy' },
  description: {
    en: 'A dark, bitter draught that knits wounds shut. Restores 4 Health.',
    pl: 'Ciemny, gorzki wywar, który zasklepia rany. Przywraca 4 punkty Zdrowia.',
  },
  heal: 4,
  maxQuantity: 3,
};

export function equipmentName(
  entry: ArenaWeaponOption | ArenaBonusOption | typeof ARENA_CONSUMABLE,
  language: InterfaceLanguage,
): string {
  return language === 'pl' ? entry.name.pl : entry.name.en;
}

export function equipmentDescription(
  entry: ArenaWeaponOption | ArenaBonusOption | typeof ARENA_CONSUMABLE,
  language: InterfaceLanguage,
): string {
  return language === 'pl' ? entry.description.pl : entry.description.en;
}

/**
 * Validate the catalogue itself: unique ids per list, weapons inside the
 * Scenario ranges (melee 2-4, ranged 2-3), the unarmed and empty-slot
 * options present, and a Consumable heal inside 1-12. Returns the issues,
 * empty when the catalogue is valid.
 */
export function validateEquipmentCatalogue(): string[] {
  const issues: string[] = [];
  const checkUnique = (ids: string[], list: string): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push(`Duplicate id "${id}" in ${list}`);
      seen.add(id);
    }
  };
  checkUnique(WEAPON_OPTIONS.map((weapon) => weapon.id), 'weapons');
  checkUnique(OUTFITS.map((outfit) => outfit.id), 'outfits');
  checkUnique(TALISMANS.map((talisman) => talisman.id), 'talismans');
  for (const weapon of WEAPONS) {
    const max = weapon.reach === 'melee' ? 4 : 3;
    if (weapon.damage < 2 || weapon.damage > max) {
      issues.push(`Weapon "${weapon.id}" deals ${weapon.damage} Damage out of 2-${max}`);
    }
  }
  if (!WEAPON_OPTIONS.some((weapon) => weapon.id === 'unarmed')) {
    issues.push('Missing the unarmed weapon option');
  }
  for (const list of [OUTFITS, TALISMANS] as const) {
    if (!list.some((entry) => entry.id === 'none')) {
      issues.push('Missing the empty-slot option');
    }
  }
  for (const entry of [...WEAPON_OPTIONS, ...OUTFITS, ...TALISMANS]) {
    if (entry.name.en.length === 0 || entry.name.pl.length === 0) {
      issues.push(`Option "${entry.id}" misses a name`);
    }
  }
  if (ARENA_CONSUMABLE.heal < 1 || ARENA_CONSUMABLE.heal > 12) {
    issues.push('The Consumable heal sits outside 1-12');
  }
  return issues;
}

/**
 * One submitted Equipment field: the raw form value, or null when the control
 * posted nothing. Strings because the form transports text; the engine's
 * `validateArenaSetup` owns the ranges.
 */
export type ArenaEquipmentFields = {
  weapon: string | null;
  outfit: string | null;
  talisman: string | null;
  consumables: string | null;
};

export type ParsedArenaEquipment = {
  weapon?: ArenaWeapon;
  bonuses?: { might?: number; agility?: number; wits?: number; presence?: number };
  consumables: ArenaConsumables;
};

/**
 * Parse the submitted Equipment controls into a Character definition
 * fragment. Returns undefined for unknown ids or an out-of-range Consumable
 * quantity; unarmed and the empty slots carry no weapon and no bonuses. The
 * Equipment names are stored as presented in the Interface Language, the way
 * the Setup stores the opponent name.
 */
export function parseArenaEquipment(
  fields: ArenaEquipmentFields,
  language: InterfaceLanguage,
): ParsedArenaEquipment | undefined {
  const weapon =
    fields.weapon === null ? undefined : WEAPON_OPTIONS.find((option) => option.id === fields.weapon);
  const outfit =
    fields.outfit === null ? undefined : OUTFITS.find((option) => option.id === fields.outfit);
  const talisman =
    fields.talisman === null
      ? undefined
      : TALISMANS.find((option) => option.id === fields.talisman);
  if (weapon === undefined || outfit === undefined || talisman === undefined) {
    return undefined;
  }
  if (fields.consumables === null || !/^\d+$/.test(fields.consumables.trim())) {
    return undefined;
  }
  const count = Number(fields.consumables.trim());
  if (!Number.isInteger(count) || count < 0 || count > ARENA_CONSUMABLE.maxQuantity) {
    return undefined;
  }
  const bonuses: { might?: number; agility?: number; wits?: number; presence?: number } = {};
  for (const bonus of [outfit.bonus, talisman.bonus]) {
    if (bonus !== undefined) bonuses[bonus] = (bonuses[bonus] ?? 0) + 1;
  }
  return {
    ...(weapon.id === 'unarmed'
      ? {}
      : {
          weapon: {
            name: equipmentName(weapon, language),
            damage: weapon.damage,
            reach: weapon.reach,
          },
        }),
    ...(Object.keys(bonuses).length === 0 ? {} : { bonuses }),
    consumables: {
      id: ARENA_CONSUMABLE.id,
      name: equipmentName(ARENA_CONSUMABLE, language),
      heal: ARENA_CONSUMABLE.heal,
      count,
    },
  };
}
