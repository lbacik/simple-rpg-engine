// The Arena Bestiary (issue #166): the small initial offer of Enemy kinds an
// Arena Setup draws its opponents from, with the default Character kept for
// the fight. Every entry validates against the same Enemy limits as Scenario
// Enemies, through the Arena Setup validation.
//
// Issue #167 seeds the full Bestiary across the balance tiers; this module
// owns the shape it grows into: unique ids, one inline Enemy definition and
// one starting Range per entry, plus a Bestiary-level validator that checks
// entries against the same Enemy limits as Scenario Enemies (EnemySchema).

import type {
  ArenaCharacterDefinition,
  ArenaEnemyDefinition,
  ArenaSetup,
} from '../../engine/index';
import { EnemySchema } from '../../content/schema';
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

// Ordinary duels sit around the Grey Wolf (docs/spec/mechanics.md,
// balance targets): the porters, foremen, watchmen and auditors below are the
// ordinary tier, Aldric is the boss duel, and the sentinel (Health 30) and the
// breaker (Damage 6) are the extreme ends of the Enemy limits. Both Reaches
// and both Behaviours appear, including a steady and a heavy ranged fighter.
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
      attributes: { might: 2, agility: 2, wits: 1, presence: 0 },
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
      en: 'A poacher who shoots first and talks never. Takes aim before every heavy shot.',
      pl: 'Kłusownik, który najpierw strzela, a nigdy nie rozmawia. Przed każdym mocnym strzałem celuje.',
    },
    enemy: {
      name: 'Bandit Archer',
      attributes: { might: 1, agility: 2, wits: 1, presence: 1 },
      health: 6,
      damage: 2,
      reach: 'ranged',
      behaviour: 'heavy',
    },
    range: 'far',
  },
  {
    id: 'drowned-porter',
    name: { en: 'Drowned Porter', pl: 'Utopiony tragarz' },
    description: {
      en: 'A frightened porter bound to his last instruction. Weak, but he keeps coming.',
      pl: 'Przestraszony tragarz, wierny ostatniemu poleceniu. Słaby, lecz nie ustępuje.',
    },
    enemy: {
      name: 'Drowned Porter',
      attributes: { might: 1, agility: 1, wits: 1, presence: 1 },
      health: 6,
      damage: 1,
      reach: 'melee',
      behaviour: 'steady',
    },
    range: 'near',
  },
  {
    id: 'iron-foreman',
    name: { en: 'Iron Foreman', pl: 'Żelazny majster' },
    description: {
      en: 'A workshop guardian of scrap and orders. Slow, and winds up its heaviest blows.',
      pl: 'Strażnik warsztatu ze złomu i rozkazów. Powolny, bierze zamach do najcięższych ciosów.',
    },
    enemy: {
      name: 'Iron Foreman',
      attributes: { might: 2, agility: 0, wits: 1, presence: 1 },
      health: 9,
      damage: 2,
      reach: 'melee',
      behaviour: 'heavy',
    },
    range: 'near',
  },
  {
    id: 'channel-watchman',
    name: { en: 'Channel Watchman', pl: 'Strażnik kanału' },
    description: {
      en: 'A dead archer keeping the harbour clear under obsolete orders. Steady aim, no theatrics.',
      pl: 'Martwy łucznik pilnujący portu według dawnych rozkazów. Pewny cel, bez popisów.',
    },
    enemy: {
      name: 'Channel Watchman',
      attributes: { might: 1, agility: 2, wits: 1, presence: 1 },
      health: 7,
      damage: 2,
      reach: 'ranged',
      behaviour: 'steady',
    },
    range: 'far',
  },
  {
    id: 'brass-auditor',
    name: { en: 'Brass Auditor', pl: 'Mosiężny rewident' },
    description: {
      en: 'An account guardian of tally sticks and borrowed authority. It notices everything.',
      pl: 'Strażnik rachunków z patyczków i pożyczonej powagi. Zauważa wszystko.',
    },
    enemy: {
      name: 'Brass Auditor',
      attributes: { might: 2, agility: 1, wits: 2, presence: 0 },
      health: 10,
      damage: 2,
      reach: 'melee',
      behaviour: 'steady',
    },
    range: 'near',
  },
  {
    id: 'barrow-wight',
    name: { en: 'Aldric, the Barrow Wight', pl: 'Aldrik, kurhanowy upiór' },
    description: {
      en: 'A lord of the old kingdom, bound to his grave by a broken oath. The Bestiary boss.',
      pl: 'Władca starego królestwa, przykuty do grobu złamaną przysięgą. Boss Bestiariusza.',
    },
    enemy: {
      name: 'Aldric, the Barrow Wight',
      attributes: { might: 3, agility: 1, wits: 2, presence: 3 },
      health: 14,
      damage: 3,
      reach: 'melee',
      behaviour: 'heavy',
    },
    range: 'near',
  },
  {
    id: 'ember-shaman',
    name: { en: 'Ember Shaman', pl: 'Szaman popiołów' },
    description: {
      en: 'A clan seer who throws burning cinders. Keen-eyed, and takes aim before heavy shots.',
      pl: 'Klanowy wieszcz, który ciska płonącym żarem. Bystry, przed mocnymi strzałami celuje.',
    },
    enemy: {
      name: 'Ember Shaman',
      attributes: { might: 1, agility: 1, wits: 3, presence: 2 },
      health: 7,
      damage: 2,
      reach: 'ranged',
      behaviour: 'heavy',
    },
    range: 'far',
  },
  {
    id: 'mire-wisp',
    name: { en: 'Mire Wisp', pl: 'Mglisty ognik' },
    description: {
      en: 'A flicker over the marsh that leads travellers astray. Frail, quick and hard to catch.',
      pl: 'Błysk nad bagnem, który zwodzi wędrowców. Kruchy, szybki i trudny do złapania.',
    },
    enemy: {
      name: 'Mire Wisp',
      attributes: { might: 0, agility: 3, wits: 2, presence: 1 },
      health: 3,
      damage: 1,
      reach: 'ranged',
      behaviour: 'steady',
    },
    range: 'far',
  },
  {
    id: 'ash-hound',
    name: { en: 'Ash Hound', pl: 'Popielny ogar' },
    description: {
      en: 'A scorched black hound with embers in its fur. Faster than it looks.',
      pl: 'Osmolony czarny ogar z żarem w sierści. Szybszy, niż wygląda.',
    },
    enemy: {
      name: 'Ash Hound',
      attributes: { might: 1, agility: 3, wits: 0, presence: 0 },
      health: 5,
      damage: 2,
      reach: 'melee',
      behaviour: 'steady',
    },
    range: 'near',
  },
  {
    id: 'stone-sentinel',
    name: { en: 'Stone Sentinel', pl: 'Kamienny strażnik' },
    description: {
      en: 'A gate guardian that has outlasted its gate. It barely moves, and barely falls.',
      pl: 'Strażnik bramy, który przetrwał swoją bramę. Ledwie się rusza i ledwie pada.',
    },
    enemy: {
      name: 'Stone Sentinel',
      attributes: { might: 2, agility: 0, wits: 0, presence: 0 },
      health: 30,
      damage: 2,
      reach: 'melee',
      behaviour: 'steady',
    },
    range: 'near',
  },
  {
    id: 'siege-breaker',
    name: { en: 'Siege Breaker', pl: 'Burzyciel' },
    description: {
      en: 'A giant in a scorched bearskin with a smith’s maul. Its wound-up blows are the heaviest here.',
      pl: 'Olbrzym w osmolonej niedźwiedziej skórze z kowalskim młotem. Jego zamaszyste ciosy są tu najcięższe.',
    },
    enemy: {
      name: 'Siege Breaker',
      attributes: { might: 3, agility: 1, wits: 0, presence: 1 },
      health: 12,
      damage: 6,
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

export type BestiaryIssue = {
  path: string;
  message: string;
};

export type ValidateBestiaryEntryResult =
  | { ok: true }
  | { ok: false; issues: BestiaryIssue[] };

/**
 * Validate one Bestiary entry against the same Enemy limits as Scenario
 * Enemies (EnemySchema in src/content/schema.ts: Attributes 0-3, Health
 * 1-30, Damage 1-6, Reach and Behaviour vocabularies), plus the Bestiary
 * shape itself: a unique-string id, non-empty English and Polish names and
 * descriptions, and a starting Range. An out-of-range value fails, the way a
 * Scenario Enemy with the same value would.
 */
export function validateBestiaryEntry(entry: unknown): ValidateBestiaryEntryResult {
  const issues: BestiaryIssue[] = [];
  if (typeof entry !== 'object' || entry === null) {
    return { ok: false, issues: [{ path: '', message: 'Expected an object' }] };
  }
  const candidate = entry as Record<string, unknown>;
  if (typeof candidate['id'] !== 'string' || (candidate['id'] as string).length === 0) {
    issues.push({ path: 'id', message: 'Expected a non-empty id' });
  }
  for (const key of ['name', 'description'] as const) {
    const text = candidate[key] as { en?: unknown; pl?: unknown } | undefined;
    if (typeof text !== 'object' || text === null) {
      issues.push({ path: key, message: `Expected ${key} with en and pl text` });
      continue;
    }
    for (const language of ['en', 'pl'] as const) {
      const value = text[language];
      if (typeof value !== 'string' || value.length === 0) {
        issues.push({ path: `${key}.${language}`, message: `Expected a non-empty ${key}` });
      }
    }
  }
  const range = candidate['range'];
  if (range !== 'near' && range !== 'far') {
    issues.push({ path: 'range', message: 'Expected "near" or "far"' });
  }
  const enemy = candidate['enemy'] as Record<string, unknown> | undefined;
  if (typeof enemy !== 'object' || enemy === null) {
    issues.push({ path: 'enemy', message: 'Expected an enemy definition' });
  } else {
    // The Bestiary shape requires these explicitly: unlike a Scenario Enemy
    // file (where EnemySchema defaults apply), an entry must state its name,
    // Reach and Behaviour, so a missing field fails here instead of being
    // silently defaulted below.
    if (typeof enemy['name'] !== 'string' || enemy['name'].length === 0) {
      issues.push({ path: 'enemy.name', message: 'Expected a non-empty name' });
    }
    if (enemy['reach'] !== 'melee' && enemy['reach'] !== 'ranged') {
      issues.push({ path: 'enemy.reach', message: 'Expected "melee" or "ranged"' });
    }
    if (enemy['behaviour'] !== 'steady' && enemy['behaviour'] !== 'heavy') {
      issues.push({ path: 'enemy.behaviour', message: 'Expected "steady" or "heavy"' });
    }
    const parsed = EnemySchema.safeParse({
      id: typeof candidate['id'] === 'string' ? candidate['id'] : 'bestiary-entry',
      name: typeof enemy['name'] === 'string' && enemy['name'].length > 0 ? enemy['name'] : 'bestiary-foe',
      ...(typeof enemy['description'] === 'string' ? { description: enemy['description'] } : {}),
      attributes: enemy['attributes'],
      health: enemy['health'],
      damage: enemy['damage'],
      reach: enemy['reach'],
      behaviour: enemy['behaviour'],
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          path: `enemy.${issue.path.map(String).join('.')}`,
          message: issue.message,
        });
      }
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/**
 * Validate the whole Bestiary: every entry against the Scenario Enemy limits,
 * plus unique ids. Returns the issues, empty when the Bestiary is valid.
 */
export function validateBestiary(entries: BestiaryEntry[] = BESTIARY): BestiaryIssue[] {
  const issues: BestiaryIssue[] = [];
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    const result = validateBestiaryEntry(entry);
    if (!result.ok) {
      for (const issue of result.issues) {
        issues.push({ path: `bestiary.${index}.${issue.path}`, message: issue.message });
      }
    }
    if (seen.has(entry.id)) {
      issues.push({ path: `bestiary.${index}.id`, message: `Duplicate bestiary id "${entry.id}"` });
    }
    seen.add(entry.id);
  });
  return issues;
}

/**
 * One submitted Character field: the raw form value, or null when the control
 * posted nothing. Strings because the form transports text; the engine's
 * `validateArenaSetup` owns the ranges.
 */
export type ArenaCharacterFields = {
  might: string | null;
  agility: string | null;
  wits: string | null;
  presence: string | null;
  health: string | null;
};

function parseArenaInteger(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  // An empty control posts '': `Number('')` is 0, which would silently pass
  // for an Attribute, so emptiness is invalid here rather than zero.
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

/**
 * Parse the submitted Character controls into a Character definition. Returns
 * undefined for missing or non-integer values; the Attribute (0-3) and Health
 * (1-12) ranges are enforced by the engine's `validateArenaSetup`, which the
 * Start action runs over the built Setup.
 */
export function parseArenaCharacter(fields: ArenaCharacterFields): ArenaCharacterDefinition | undefined {
  const might = parseArenaInteger(fields.might);
  const agility = parseArenaInteger(fields.agility);
  const wits = parseArenaInteger(fields.wits);
  const presence = parseArenaInteger(fields.presence);
  const health = parseArenaInteger(fields.health);
  if (
    might === undefined ||
    agility === undefined ||
    wits === undefined ||
    presence === undefined ||
    health === undefined
  ) {
    return undefined;
  }
  return { attributes: { might, agility, wits, presence }, health };
}

/**
 * One Arena Setup for a fight against the Bestiary entry: the given Character
 * (the default one when omitted) and the single opponent with its Enemy name
 * in the Interface Language. Undefined for an unknown entry id.
 */
export function buildArenaSetup(
  id: string,
  language: InterfaceLanguage,
  character: ArenaCharacterDefinition = DEFAULT_ARENA_CHARACTER,
): ArenaSetup | undefined {
  const entry = bestiaryById(id);
  if (entry === undefined) {
    return undefined;
  }
  return {
    character: { attributes: { ...character.attributes }, health: character.health },
    opponents: [
      {
        id: entry.id,
        enemy: { ...entry.enemy, name: bestiaryName(entry, language) },
        range: entry.range,
      },
    ],
  };
}
