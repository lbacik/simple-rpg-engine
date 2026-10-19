// English Interface Text catalogue. Its shape defines the `Catalogue` type;
// every other catalogue is declared as one, so a missing message or a wrong
// signature fails `tsc` (docs/spec/architecture.md, interface text). Messages
// with arguments are functions with typed parameters; counts use the
// language's plural forms and every number is formatted with `Intl`.
//
// Interface Text for every page other than the game screen lives here alongside
// the game-screen chrome: the Scenario collection, Character creation with the
// start form, the Playthroughs list, and the app's own not-found and error
// pages, including page titles and descriptions. Scenario text keeps flowing
// through unchanged. A message places a Scenario-provided name only where
// English needs no inflection: as a label, after a colon, or in the nominative.
// Scenario text is never case-transformed.

import type { EquipmentSlot } from '../engine/inventory';
import { formatNumber } from './format';
import { primaryLanguageSubtag, type InterfaceLanguage } from './languages';
import { selectPlural } from './plural';

const whole = (value: number): string => formatNumber('en', value);

// S4: `ordinal` served the removed tactical Combat order lines.

const itemsCount = (count: number): string =>
  selectPlural('en', count, {
    one: '1 item',
    other: `${formatNumber('en', count)} items`,
  });

const entriesCount = (count: number): string =>
  selectPlural('en', count, {
    one: '1 entry',
    other: `${formatNumber('en', count)} entries`,
  });

/** The name of a Scenario language in English; other tags read as their primary subtag in capitals. */
function scenarioLanguageName(language: string): string {
  const primary = primaryLanguageSubtag(language);
  if (primary === 'en') return 'English';
  if (primary === 'pl') return 'Polish';
  return primary.toUpperCase();
}

export const en = {
  /**
   * The Interface Language this catalogue renders. Journal flags compare an
   * entry's recorded `lang` against it, so rendering an entry needs only the
   * entry and the catalogue (docs/spec/playthrough-state.md, journal).
   */
  code: 'en' as InterfaceLanguage,
  app: {
    title: 'Simple RPG Engine',
    description: 'Single-player RPG adventures in the browser.',
  },
  nav: {
    scenarios: 'Scenarios',
    playthroughs: 'My Playthroughs',
    arena: 'Arena',
  },
  language: {
    label: 'Language',
    menu: (name: string) => `Language: ${name}`,
    names: {
      en: 'English',
      pl: 'Polski',
    },
  },
  scenarioLanguage: {
    /** The name of a Scenario language in English. */
    name: (language: string): string => scenarioLanguageName(language),
    /** The accessible name of a standalone language flag. */
    flagName: (language: string, original: boolean): string =>
      original
        ? `${scenarioLanguageName(language)} (original)`
        : scenarioLanguageName(language),
    /** The collection group heading for Scenarios shown in the Interface Language. */
    inInterfaceLanguage: (language: string): string => `In ${scenarioLanguageName(language)}`,
    otherLanguages: 'In other languages',
    otherLanguagesNote: (language: string): string =>
      `These Scenarios are not translated into ${scenarioLanguageName(language)} yet. You play them in their original language.`,
    notTranslated: (shown: string, ui: string): string =>
      `Not translated into ${scenarioLanguageName(ui)}. Shown in ${scenarioLanguageName(shown)}.`,
    textBadge: (shown: string): string => `Text: ${scenarioLanguageName(shown)}`,
  },
  collection: {
    title: 'Scenarios',
    description: 'Choose a Scenario to start a new Playthrough.',
    empty: 'No Scenarios are available right now.',
    newPlaythrough: 'New Playthrough',
  },
  scenario: {
    description: 'Create a Character and start a new Playthrough.',
    metaTitle: (scenarioTitle: string) => `New Playthrough: ${scenarioTitle}`,
    templatesHeading: 'Character Templates',
    beginHeading: 'Begin',
    attributesLine: (
      might: number,
      agility: number,
      wits: number,
      presence: number,
      health: number,
    ): string =>
      `Might ${whole(might)} · Agility ${whole(agility)} · Wits ${whole(wits)} · Presence ${whole(presence)} · Health ${whole(health)}`,
    slots: {
      weapon: 'Weapon',
      outfit: 'Outfit',
      talisman: 'Talisman',
    } as Record<EquipmentSlot, string>,
    templateItem: (itemName: string, quantity: number, slotName: string | null): string =>
      slotName === null
        ? `${itemName} × ${whole(quantity)}`
        : `${itemName} × ${whole(quantity)} (${slotName})`,
    templateItemSuffix: (quantity: number, slotName: string | null): string =>
      slotName === null
        ? ` × ${whole(quantity)}`
        : ` × ${whole(quantity)} (${slotName})`,
  },
  startForm: {
    templateLegend: 'Character Template',
    nameLabel: 'Character name',
    submit: 'Start the Playthrough',
    starting: 'Starting…',
    unknownScenario: 'That Scenario is no longer available.',
    unknownTemplate: 'Choose one of the Character Templates.',
    invalidName: (): string =>
      `Enter a name of ${whole(1)}–${whole(40)} ${selectPlural('en', 40, { one: 'character', other: 'characters' })}.`,
  },
  playthroughs: {
    title: 'My Playthroughs',
    description: 'Resume an active Playthrough or view an ended one.',
    activeHeading: 'Active',
    endedHeading: 'Ended or read-only',
    empty: 'No Playthroughs yet.',
    emptyLink: 'Choose a Scenario',
    emptySuffix: ' to begin.',
    noActive: 'No active Playthroughs.',
    noEnded: 'No ended or read-only Playthroughs.',
    resume: 'Resume',
    view: 'View',
    statusActive: 'Active',
    statusEnded: 'Ended',
    statusIncompatible: 'Incompatible',
  },
  // Arena on the shared Combat core (Combat MVP 1.0, P5). Setup configures
  // 1–5 opponents in explicit order with an optional Companion; the hero
  // fights without equipment. Presets T1–T7 build the rules §15.2 states.
  arena: {
    title: 'Arena',
    description:
      'Face 1–5 opponents under the Combat rules, alone or with a Companion. No Scenario, no Playthrough — just the fight.',
    setupHeading: 'New fight',
    opponentsHeading: 'Opponents (1–5, in fighting order)',
    countLabel: 'How many',
    opponentLegend: (index: number) => `Opponent ${index}`,
    profileLabel: 'Profile',
    groupLabel: 'Starting group',
    engagedLabel: 'Engaged with the hero',
    phaseOffsetLabel: 'Phase offset',
    powerLabel: 'Power',
    companionHeading: 'Companion',
    companionNone: 'None',
    startFight: 'Start the fight',
    presetsHeading: 'Reference scenarios',
    presetsBlurb: 'T1–T7 from the rules: the same opening states the balance chapter ships.',
    presetStart: (id: string) => `Start ${id}`,
    fightAgain: 'Fight again',
    fightAgainBlurb: 'Same setup, a fresh fight.',
    restart: 'Restart',
    restartBlurb: 'Start this fight over from its opening state.',
    replaceHeading: 'A fight is already in progress',
    replaceBody: 'Starting a new fight discards the current one. This cannot be undone.',
    restartConfirmHeading: 'Restart this fight?',
    restartConfirmBody: 'The current round is discarded and the fight starts over from its opening state.',
    confirmStart: 'Yes, start a new fight',
    confirmRestart: 'Yes, restart the fight',
    keepFighting: 'Keep fighting',
    noRememberedSetup: 'No remembered setup yet — configure the fight below.',
    profiles: {
      hero: 'Hero',
      raider: 'Raider',
      brute: 'Brute',
      sentinel: 'Sentinel',
      archer: 'Archer',
      'party-sentinel': 'Party sentinel',
      'party-archer': 'Party archer',
    },
    setupErrors: {
      bad_setup: 'That setup cannot be read.',
      bad_opponent_count: 'Choose 1–5 opponents.',
      bad_opponent_profile: 'Unknown opponent profile.',
      bad_starting_group: 'Starting groups look like g0, g1, ….',
      bad_engaged_flag: 'Mark whether each opponent starts engaged with the hero.',
      bad_phase_offset: 'Phase offsets are whole numbers from 0.',
      bad_power: 'Power is a whole number from 0 to 3.',
      bad_companion: 'Unknown companion.',
    },
  },
  notFound: {
    title: 'Page not found',
    body: 'The page you asked for does not exist.',
    home: 'Back to the Scenarios',
  },
  error: {
    title: 'Something went wrong',
    body: 'The page failed to load. Try again.',
    retry: 'Try again',
    home: 'Back to the Scenarios',
  },
  notices: {
    stale: 'The game was advanced in another tab; this is its current state.',
    unavailable: 'That action is no longer available.',
  },
  attributes: {
    might: 'Might',
    agility: 'Agility',
    wits: 'Wits',
    presence: 'Presence',
  },
  difficulty: {
    easy: 'Easy',
    ordinary: 'Ordinary',
    hard: 'Hard',
    'very-hard': 'Very hard',
  },
  // S4: the Near/Far Range vocabulary belonged to the tactical rules.
  reach: {
    melee: 'melee',
    ranged: 'ranged',
  },
  slots: {
    weapon: 'Weapon',
    outfit: 'Outfit',
    talisman: 'Talisman',
  },
  itemKinds: {
    equipment: 'Equipment',
    consumable: 'Consumable',
    key: 'Key item',
  },
  ending: {
    title: 'Ending',
    victory: 'Victory',
    defeat: 'Defeat',
  },
  game: {
    scenes: 'Scenes',
    exits: 'Exits',
    choices: 'Choices',
    continue: 'Continue',
    latestEvents: 'Latest events',
    afterEnding: 'After the ending',
    viewJournal: 'View journal',
    adventure: 'Your adventure',
    currentScene: 'Current scene',
    currentLocation: 'Current location',
    decide: 'What do you do next?',
    startNew: (title: string) => `Start a new Playthrough of ${title}`,
    returnToCollection: 'Return to the collection',
    scenarioGone:
      'This Scenario is no longer available, so this Playthrough is read-only.',
    scenarioChanged:
      'This Scenario has changed since it was played, so this Playthrough is read-only.',
    locationGone:
      'The Location this Playthrough stands in is no longer part of this Scenario.',
    endingGone:
      'The Ending this Playthrough reached is no longer part of this Scenario.',
    testLabel: (attribute: string, difficulty: string, target: number) =>
      `${attribute}, ${difficulty} ${formatNumber('en', target)}`,
  },
  character: {
    title: 'Character',
    panelLabel: 'Character and inventory',
    status: 'Character status',
    attributes: 'Attributes',
    health: 'Health',
    equipped: 'Equipped',
    legend: '● base ◆ equipment bonus (max +2)',
    short: (now: number, max: number) =>
      `Health ${formatNumber('en', now)}/${formatNumber('en', max)}`,
    label: (now: number, max: number) =>
      `Health ${formatNumber('en', now)} of ${formatNumber('en', max)}`,
    name: (health: string) => `Character, ${health}`,
    bonusBase: (base: number) => `base ${formatNumber('en', base)}`,
    bonusPoint: (item: string) => `+1 ${item}`,
    bonusCapped: 'bonus capped at +2',
  },
  inventory: {
    title: 'Inventory',
    combatNote: 'Inventory actions are unavailable during Combat.',
    equipped: 'Equipped',
    emptySlot: 'Empty',
    carried: 'Carried',
    carriedEmpty: 'Empty.',
    ribbon: 'equipped',
    magicTitle: 'Magic item',
    magicLabel: '✦ magic',
    equip: 'Equip',
    unequip: 'Unequip',
    use: 'Use',
    noChangeInCombat: 'Cannot change equipment during Combat.',
    noUseInCombat: 'Cannot use items here during Combat.',
    fullHealth: 'Already at full Health.',
    name: (items: string) => `Inventory, ${items}`,
    count: itemsCount,
    keyChip: 'Key item',
    consumableChip: (heal: number) =>
      `Consumable · restores ${formatNumber('en', heal)} Health`,
    equipmentChip: (slot: string) => `Equipment · ${slot}`,
    bonusStat: (attribute: string) => `+1 ${attribute}`,
    weaponStats: (damage: number | undefined, reach: string) =>
      damage === undefined
        ? `Reach ${reach}`
        : `Damage ${formatNumber('en', damage)} · Reach ${reach}`,
  },
  map: {
    title: 'Map',
    label: 'Location map',
    travelSub: 'Travel',
    youAreHere: 'You are here',
    expand: 'Expand map',
    travelTo: (name: string) => `Travel to ${name}`,
    heardOf: (name: string) => `${name} (heard of)`,
    showUnknown: 'Show unseen exits',
    hideUnknown: 'Hide unseen exits',
  },
  illustration: {
    pauseAnimation: 'Pause animation',
    playAnimation: 'Play animation',
  },
  journal: {
    title: 'Journal',
    name: (entries: string) => `Journal, ${entries}`,
    count: entriesCount,
    total: (count: number) => `${entriesCount(count)}.`,
    openInNewTab: 'Open in new tab',
    close: 'Close',
    backToGame: 'Back to the game',
    empty: 'Nothing has happened yet.',
    loadingOlder: 'Loading older entries…',
    loadFailed: 'Could not load older entries.',
    retryOlder: 'Retry loading older entries',
    startReached: 'Start of the Journal reached.',
    olderEntries: 'Older entries',
    position: 'Step {step} · entry {seq} of {total}',
    stepNote: ' · step {step}',
    types: {
      intro: 'Intro',
      scene: 'Scene',
      choice: 'Choice taken',
      test: 'Test',
      outcome: 'Outcome',
      stateChange: 'State change',
      travel: 'Travel',
      inventory: 'Inventory',
      ending: 'Ending',
    },
    travel: (name: string): string => `Travelled to ${name}.`,
    victory: 'Victory',
    defeat: 'Defeat',
    test: (
      attribute: string,
      difficulty: string,
      target: number,
      die1: number,
      die2: number,
      modifier: number,
      total: number,
      success: boolean,
    ): string => {
      const signed = modifier >= 0 ? `+${whole(modifier)}` : `−${whole(Math.abs(modifier))}`;
      const result = success ? 'success' : 'failure';
      return (
        `${attribute}, ${difficulty} ${whole(target)}: ` +
        `${whole(die1)}+${whole(die2)}${signed}=${whole(total)} vs ${whole(target)} — ${result}.`
      );
    },
    itemReceived: (name: string, count: number): string =>
      count === 1 ? `Received: ${name}` : `Received: ${name} ×${whole(count)}`,
    itemLost: (name: string, count: number): string =>
      count === 1 ? `Lost: ${name}` : `Lost: ${name} ×${whole(count)}`,
    healthGained: (amount: number): string => `+${whole(amount)} Health`,
    healthLost: (amount: number): string => `−${whole(amount)} Health`,
    revealed: (name: string): string => `Revealed: ${name}`,
    equipped: (name: string): string => `Equipped: ${name}`,
    unequipped: (name: string): string => `Unequipped: ${name}`,
    used: (name: string, restored: number): string =>
      `Used: ${name} (+${whole(restored)} Health)`,
  },
  // S4: the readOnly Combat/Range/Health lines belonged to the tactical rules.
  // S4: the Combat catalogue (actions, intents, roll lines, escape,
  // combatEndEscape, the tactical block with stopEscape) belonged to the
  // removed tactical rules. Scenario/Arena Combat return on the shared
  // Combat core with the adapter tickets.
  closePanel: (title: string) => `Close ${title}`,
};

export type Catalogue = typeof en;
