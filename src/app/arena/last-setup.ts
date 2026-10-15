// The remembered Arena Setup (issue #171): the last setup is remembered per
// Session, so reopening the Arena restores it and Fight again starts a new
// Combat with the identical setup and fresh Health, Range and Intents.
//
// The snapshot keeps the raw form fields — option ids, not resolved bonuses —
// so an outfit-only bonus restores as the outfit and a duplicate Enemy kind
// restores twice. A rematch rebuilds through the same parse-and-validate
// pipeline as the Start action (`validatedSetupFromForm`), so the fresh fight
// can never diverge from what the form would start. Snapshots are validated
// on read: an unknown id (a Bestiary entry removed since) rebuilds to nothing
// and the setup form falls back per field, so the page always opens.

import { validateArenaSetup, type ArenaSetup } from '../../engine/index';
import type { InterfaceLanguage as Language } from '../../i18n/index';
import {
  BESTIARY,
  DEFAULT_ARENA_CHARACTER,
  arenaSetupFromForm,
  bestiaryById,
  parseArenaCharacter,
} from './bestiary';
import {
  ARENA_CONSUMABLE,
  OUTFITS,
  TALISMANS,
  WEAPON_OPTIONS,
  parseArenaEquipment,
} from './equipment';

/** The last Arena Setup as posted by the setup form: raw fields, not resolved. */
export type RememberedArenaSetup = {
  enemy1: string;
  range1: 'near' | 'far';
  enemy2: string;
  range2: 'near' | 'far';
  might: string;
  agility: string;
  wits: string;
  presence: string;
  health: string;
  weapon: string;
  outfit: string;
  talisman: string;
  consumables: string;
};

const SETUP_FIELDS = [
  'enemy1',
  'range1',
  'enemy2',
  'range2',
  'might',
  'agility',
  'wits',
  'presence',
  'health',
  'weapon',
  'outfit',
  'talisman',
  'consumables',
] as const;

function singleValue(formData: FormData, key: string): string | undefined {
  const values = formData.getAll(key);
  if (values.length !== 1) return undefined;
  const value = values[0];
  return typeof value === 'string' ? value : undefined;
}

function isRange(value: string): value is 'near' | 'far' {
  return value === 'near' || value === 'far';
}

function isIntegerText(value: string): boolean {
  return /^-?\d+$/.test(value.trim());
}

/**
 * Capture the posted setup form as a snapshot. Undefined when the form is
 * forged the way the Start action rejects it: a third opponent slot, a
 * repeated field, a missing field, an empty first opponent, a Range outside
 * near/far, or a non-integer Character or Consumables value. Unknown option
 * ids pass here — the Start action's engine validation owns them, and a
 * rematch re-runs it.
 */
export function captureRememberedSetup(formData: FormData): RememberedArenaSetup | undefined {
  for (const key of ['enemy3', 'range3', 'opponents', 'opponent3']) {
    if (formData.has(key)) return undefined;
  }
  const raw: Record<string, string | undefined> = {};
  for (const key of SETUP_FIELDS) raw[key] = singleValue(formData, key);
  if (
    raw['enemy1'] === undefined ||
    raw['enemy1'] === '' ||
    raw['range1'] === undefined ||
    !isRange(raw['range1']) ||
    raw['enemy2'] === undefined ||
    raw['range2'] === undefined ||
    !isRange(raw['range2']) ||
    raw['might'] === undefined ||
    raw['agility'] === undefined ||
    raw['wits'] === undefined ||
    raw['presence'] === undefined ||
    raw['health'] === undefined ||
    raw['weapon'] === undefined ||
    raw['weapon'] === '' ||
    raw['outfit'] === undefined ||
    raw['outfit'] === '' ||
    raw['talisman'] === undefined ||
    raw['talisman'] === '' ||
    raw['consumables'] === undefined ||
    !isIntegerText(raw['might']) ||
    !isIntegerText(raw['agility']) ||
    !isIntegerText(raw['wits']) ||
    !isIntegerText(raw['presence']) ||
    !isIntegerText(raw['health']) ||
    !isIntegerText(raw['consumables'])
  ) {
    return undefined;
  }
  return {
    enemy1: raw['enemy1'],
    range1: raw['range1'],
    enemy2: raw['enemy2'],
    range2: raw['range2'],
    might: raw['might'],
    agility: raw['agility'],
    wits: raw['wits'],
    presence: raw['presence'],
    health: raw['health'],
    weapon: raw['weapon'],
    outfit: raw['outfit'],
    talisman: raw['talisman'],
    consumables: raw['consumables'],
  };
}

/** The snapshot back as form fields, for the rematch pipeline. */
export function rememberedSetupToFormData(snapshot: RememberedArenaSetup): FormData {
  const formData = new FormData();
  formData.set('enemy1', snapshot.enemy1);
  formData.set('range1', snapshot.range1);
  formData.set('enemy2', snapshot.enemy2);
  formData.set('range2', snapshot.range2);
  formData.set('might', snapshot.might);
  formData.set('agility', snapshot.agility);
  formData.set('wits', snapshot.wits);
  formData.set('presence', snapshot.presence);
  formData.set('health', snapshot.health);
  formData.set('weapon', snapshot.weapon);
  formData.set('outfit', snapshot.outfit);
  formData.set('talisman', snapshot.talisman);
  formData.set('consumables', snapshot.consumables);
  return formData;
}

/**
 * The setup form through the Start action's pipeline: Character, Equipment
 * and opponents parsed and engine-validated. Shared by Start and Fight again,
 * so a rematch starts exactly what the form would start.
 */
export function validatedSetupFromForm(
  formData: FormData,
  language: Language,
): ArenaSetup | undefined {
  const field = (name: string): string | null => {
    const value = formData.get(name);
    return value === null ? null : String(value);
  };
  const character = parseArenaCharacter({
    might: field('might'),
    agility: field('agility'),
    wits: field('wits'),
    presence: field('presence'),
    health: field('health'),
  });
  const equipment = parseArenaEquipment(
    {
      weapon: field('weapon'),
      outfit: field('outfit'),
      talisman: field('talisman'),
      consumables: field('consumables'),
    },
    language,
  );
  const setup =
    character === undefined || equipment === undefined
      ? undefined
      : arenaSetupFromForm(formData, language, {
          ...character,
          ...(equipment.weapon !== undefined ? { weapon: equipment.weapon } : {}),
          ...(equipment.bonuses !== undefined ? { bonuses: equipment.bonuses } : {}),
          consumables: equipment.consumables,
        });
  const validated = setup === undefined ? undefined : validateArenaSetup(setup);
  return validated !== undefined && validated.ok ? validated.setup : undefined;
}

/**
 * The remembered setup as a validated fight: the identical setup with nothing
 * resolved yet — `startArena` gives it fresh Health, Range and Intents.
 * Undefined when the catalogue no longer knows an id.
 */
export function arenaSetupFromRemembered(
  snapshot: RememberedArenaSetup,
  language: Language,
): ArenaSetup | undefined {
  return validatedSetupFromForm(rememberedSetupToFormData(snapshot), language);
}

/** Parse a stored snapshot: shape-checked, catalogue-independent. */
export function parseRememberedSetup(json: string): RememberedArenaSetup | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const candidate = parsed as Record<string, unknown>;
  const texts: Record<string, string> = {};
  for (const key of SETUP_FIELDS) {
    const value = candidate[key];
    if (typeof value !== 'string') return undefined;
    texts[key] = value;
  }
  if (
    texts['enemy1'] === '' ||
    !isRange(texts['range1'] ?? '') ||
    !isRange(texts['range2'] ?? '') ||
    !isIntegerText(texts['might'] ?? '') ||
    !isIntegerText(texts['agility'] ?? '') ||
    !isIntegerText(texts['wits'] ?? '') ||
    !isIntegerText(texts['presence'] ?? '') ||
    !isIntegerText(texts['health'] ?? '') ||
    texts['weapon'] === '' ||
    texts['outfit'] === '' ||
    texts['talisman'] === ''
  ) {
    return undefined;
  }
  return {
    enemy1: texts['enemy1'] ?? '',
    range1: texts['range1'] === 'far' ? 'far' : 'near',
    enemy2: texts['enemy2'] ?? '',
    range2: texts['range2'] === 'far' ? 'far' : 'near',
    might: texts['might'] ?? '',
    agility: texts['agility'] ?? '',
    wits: texts['wits'] ?? '',
    presence: texts['presence'] ?? '',
    health: texts['health'] ?? '',
    weapon: texts['weapon'] ?? '',
    outfit: texts['outfit'] ?? '',
    talisman: texts['talisman'] ?? '',
    consumables: texts['consumables'] ?? '',
  };
}

export type RememberedFormDefaults = {
  opponent1: { enemy: string; range: 'near' | 'far' };
  opponent2: { enemy: string; range: 'near' | 'far' } | null;
  attributes: { might: number; agility: number; wits: number; presence: number };
  health: number;
  weapon: string;
  outfit: string;
  talisman: string;
  consumables: number;
};

function inRange(value: number, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/**
 * The setup form defaults from the remembered setup, falling back per field:
 * an id the catalogue no longer knows restores its default while every known
 * choice survives, so the page always opens.
 */
export function rememberedFormDefaults(snapshot: RememberedArenaSetup): RememberedFormDefaults {
  const fallbackEnemy = BESTIARY[0]?.id ?? 'grey-wolf';
  const character = DEFAULT_ARENA_CHARACTER;
  const integer = (text: string): number | undefined =>
    /^-?\d+$/.test(text.trim()) ? Number(text.trim()) : undefined;
  const attribute = (text: string, fallback: number): number => {
    const value = integer(text);
    return value === undefined ? fallback : inRange(value, 0, 3, fallback);
  };
  const health = (() => {
    const value = integer(snapshot.health);
    return value === undefined ? character.health : inRange(value, 1, 12, character.health);
  })();
  const consumables = (() => {
    const value = integer(snapshot.consumables);
    return value === undefined
      ? 1
      : inRange(value, 0, ARENA_CONSUMABLE.maxQuantity, 1);
  })();
  return {
    opponent1: {
      enemy: bestiaryById(snapshot.enemy1)?.id ?? fallbackEnemy,
      range: snapshot.range1,
    },
    opponent2:
      snapshot.enemy2 === ''
        ? null
        : bestiaryById(snapshot.enemy2) === undefined
          ? null
          : { enemy: snapshot.enemy2, range: snapshot.range2 },
    attributes: {
      might: attribute(snapshot.might, character.attributes.might),
      agility: attribute(snapshot.agility, character.attributes.agility),
      wits: attribute(snapshot.wits, character.attributes.wits),
      presence: attribute(snapshot.presence, character.attributes.presence),
    },
    health,
    weapon:
      WEAPON_OPTIONS.some((option) => option.id === snapshot.weapon) &&
      snapshot.weapon !== ''
        ? snapshot.weapon
        : 'unarmed',
    outfit: OUTFITS.some((option) => option.id === snapshot.outfit) ? snapshot.outfit : 'none',
    talisman: TALISMANS.some((option) => option.id === snapshot.talisman)
      ? snapshot.talisman
      : 'none',
    consumables,
  };
}
