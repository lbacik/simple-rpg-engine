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
import { selectPlural } from './plural';

const whole = (value: number): string => formatNumber('en', value);

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

export const en = {
  app: {
    title: 'Simple RPG Engine',
    description: 'Single-player RPG adventures in the browser.',
  },
  nav: {
    scenarios: 'Scenarios',
    playthroughs: 'My Playthroughs',
  },
  language: {
    label: 'Language',
    menu: (name: string) => `Language: ${name}`,
    names: {
      en: 'English',
      pl: 'Polski',
    },
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
  range: {
    near: 'Near',
    far: 'Far',
  },
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
    travelTo: (name: string) => `Travel to ${name}`,
    heardOf: (name: string) => `${name} (heard of)`,
    showUnknown: 'Show unvisited exits as “?”',
    hideUnknown: 'Hide unvisited exits',
  },
  journal: {
    title: 'Journal',
    name: (entries: string) => `Journal, ${entries}`,
    count: entriesCount,
    total: (count: number) => `${entriesCount(count)}.`,
    openInNewTab: 'Open in new tab',
    close: 'Close',
    types: {
      intro: 'Intro',
      scene: 'Scene',
      choice: 'Choice taken',
      test: 'Test',
      outcome: 'Outcome',
      stateChange: 'State change',
      travel: 'Travel',
      combatStart: 'Combat start',
      combatRound: 'Combat round',
      combatEnd: 'Combat end',
      enemyDefeated: 'Enemy defeated',
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
  readOnly: {
    combat: 'Combat',
    roundRange: (round: number, range: string) =>
      `Round ${formatNumber('en', round)} · Range: ${range}`,
    health: (
      character: string,
      now: number,
      max: number,
      enemy: string,
      enemyNow: number,
      enemyMax: number,
    ) =>
      `${character}: Health ${formatNumber('en', now)}/${formatNumber('en', max)} · ` +
      `${enemy}: Health ${formatNumber('en', enemyNow)}/${formatNumber('en', enemyMax)}`,
  },
  closePanel: (title: string) => `Close ${title}`,
};

export type Catalogue = typeof en;
