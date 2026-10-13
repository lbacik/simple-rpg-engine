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

/** An ordinal place ("1st", "2nd", "3rd"): the arena holds at most three actions. */
const ordinal = (value: number): string => {
  const mod100 = value % 100;
  const mod10 = value % 10;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? 'st'
      : mod10 === 2 && mod100 !== 12
        ? 'nd'
        : mod10 === 3 && mod100 !== 13
          ? 'rd'
          : 'th';
  return `${whole(value)}${suffix}`;
};

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
  combat: {
    title: 'Combat',
    round: (round: number) => `Round ${whole(round)}`,
    log: 'Log',
    lastRound: (round: number) => `Last round · ${whole(round)}`,
    noRolls: 'No rolls yet.',
    noConsumables: 'No Consumables held.',
    guardUp: 'Guard up',
    unarmed: 'Bare hands',
    groups: {
      position: 'Position',
      fight: 'Fight',
      items: 'Items',
      leave: 'Leave',
    },
    advance: 'Advance',
    fallBack: 'Fall back',
    attack: 'Attack',
    attackWith: (weapon: string) => `Attack: ${weapon}`,
    defend: 'Defend',
    distract: 'Distract',
    useItem: (item: string) => `Use: ${item}`,
    escape: 'Escape',
    reasonAlreadyAt: (range: string) => `Already at ${range} Range.`,
    reasonNeedsNear: (weapon: string, range: string) => `Your ${weapon} needs ${range} Range.`,
    reasonNeedsNearUnarmed: (range: string) => `Unarmed attacks need ${range} Range.`,
    reasonFullHealth: 'Already at full Health.',
    reasonWary: 'Wary: cannot be distracted.',
    reasonNeedsNearTarget: (weapon: string, needRange: string, target: string, targetRange: string) =>
      `Your ${weapon} needs ${needRange} Range; ${target} is ${targetRange}.`,
    reasonNeedsNearUnarmedTarget: (needRange: string, target: string, targetRange: string) =>
      `Unarmed attacks need ${needRange} Range; ${target} is ${targetRange}.`,
    reasonAlreadyNearTarget: (target: string, range: string) =>
      `You are already ${range} ${target}.`,
    reasonWaryTarget: (target: string, round: number) =>
      `${target} is wary of tricks until the end of round ${whole(round)}.`,
    arenaLabel: 'Combat arena',
    speeds: {
      fast: 'Fast',
      normal: 'Normal',
      slow: 'Slow',
    },
    intents: {
      strikeMelee: 'Strike',
      strikeRanged: 'Shoot',
      closeIn: 'Close in',
      prepareMelee: 'Wind up',
      prepareRanged: 'Take aim',
      heavyMelee: 'Heavy blow',
      heavyRanged: 'Aimed shot',
    },
    thisRound: 'This round',
    orderHint: 'Focus an action to preview its place here.',
    previewChip: (order: number, label: string) => `#${whole(order)} ${label} (preview)`,
    placeOf: (position: number, total: number) => `${ordinal(position)} of ${whole(total)}`,
    actsOrder: (position: number, total: number) =>
      `acts ${ordinal(position)} of ${whole(total)}`,
    needsThreshold: (threshold: number) => `needs ${whole(threshold)}+`,
    towards: (target: string) => `→ ${target}`,
    escapeBonus: (bonus: number) => `includes +${whole(bonus)} committed bonus`,
    targetPicker: 'Target',
    targetNote: 'Used by Attack, Distract and Advance.',
    preparedMelee: 'Wound up',
    preparedRanged: 'Aiming',
    waryUntil: (round: number) => `Wary · to round ${whole(round)}`,
    defeatedBadge: 'Defeated',
    hitsYouOn: (hit: number, guarded: number) =>
      `hits you on ${whole(hit)}+, ${whole(guarded)}+ if you Defend`,
    preparesNext: (intent: string, speed: string, damage: number) =>
      `next round: ${intent}, ${speed.toLowerCase()}, ${whole(damage)} Damage`,
    arenaRange: (range: string) => `Range: ${range}`,
    farMarker: (range: string) => `‹ — — ${range} — — ›`,
    damage: (amount: number) => `${whole(amount)} Damage`,
    rollScore: (die1: number, die2: number, modifier: number, total: number, target: number) =>
      `${whole(die1)}+${whole(die2)}+${whole(modifier)}=${whole(total)} vs ${whole(target)}`,
    rollHit: (who: string, score: string, damage: string) => `${who}: ${score} — hit, ${damage}`,
    rollSuccess: (who: string, score: string) => `${who}: ${score} — success`,
    rollMiss: (who: string, score: string) => `${who}: ${score} — miss`,
    lineAdvance: (range: string) => `Advance — now at ${range} Range.`,
    lineFallBackSuccess: (score: string, range: string) =>
      `Fall back (${score}): success, now at ${range} Range.`,
    lineFallBackFailure: (score: string, range: string) =>
      `Fall back (${score}): failure, staying at ${range} Range.`,
    lineEscapeSuccess: (score: string) => `Escape (${score}): success.`,
    lineEscapeFailure: (score: string) => `Escape attempt (${score}): failure.`,
    lineUseItem: (item: string, health: number) => `Use: ${item} — Health +${whole(health)}.`,
    lineDefend: 'You raise your guard.',
    lineAttackHit: (weapon: string, score: string, damage: string) =>
      `Attack: ${weapon} (${score}) — hit, ${damage}.`,
    lineAttackMiss: (weapon: string, score: string) => `Attack: ${weapon} (${score}) — miss.`,
    lineEnemyAttackHit: (enemy: string, score: string, damage: string) =>
      `${enemy} attacks (${score}) — hit, ${damage}.`,
    lineEnemyAttackMiss: (enemy: string, score: string, counter: boolean) =>
      counter
        ? `${enemy} attacks (${score}) — miss; your counterattack deals 1 Damage.`
        : `${enemy} attacks (${score}) — miss.`,
    lineEnemyClosesIn: (enemy: string, range: string) =>
      `${enemy} closes in to ${range} Range instead of attacking.`,
    opponent: (enemy: string) => `Opponent: ${enemy}.`,
    combatEndVictory: (enemy: string) => `${enemy} is defeated.`,
    combatEndEscape: (enemy: string) => `You escape from ${enemy}.`,
    enemyDefeated: (enemy: string) => `The ${enemy} is defeated.`,
    tactical: {
      speedFast: 'Fast',
      speedNormal: 'Normal',
      speedSlow: 'Slow',
      intentStrike: 'Strike',
      intentCloseIn: 'Close in',
      intentPrepare: 'Prepare',
      intentHeavyAttack: 'Heavy attack',
      cancelled: (reason: string) => `Cancelled: ${reason}.`,
      cancelInterrupted: 'interrupted by your distraction',
      cancelTargetDefeated: 'the target had already fallen',
      cancelOutOfReach: 'out of Reach',
      cancelAlreadyNear: 'already Near',
      cancelNoneNear: 'nothing was Near any more',
      dropped: 'Did not act: defeated earlier this round.',
      notReached: 'Did not happen: the fight was already over.',
      stopEscape: 'You escape.',
      stopVictory: 'Every enemy has fallen.',
      stopDeath: 'You fell.',
      falls: (name: string) => `— ${name} falls.`,
      counter: '↳ Counterattack:',
      guarded: 'Guarded until the end of the round',
      waryUntil: (round: number) => `Wary until the end of round ${whole(round)}`,
      prepared: 'prepares; its heavy attack comes next round',
      preparationLost: 'its preparation is lost',
      nowNear: (name: string) => `now Near ${name}`,
      nowFar: 'now Far',
      healed: (amount: number) => `+${whole(amount)} Health`,
      guardHeld: '(your guard held)',
      guardThrough: '(through your guard)',
      hit: (damage: string) => `hit, ${damage}`,
      miss: 'miss',
      success: 'success',
      failure: 'failure',
      actionInterrupted: (name: string) => `${name}'s action is interrupted`,
    },
  },
  closePanel: (title: string) => `Close ${title}`,
};

export type Catalogue = typeof en;
