// English Interface Text catalogue. Its shape defines the `Catalogue` type;
// every other catalogue is declared as one, so a missing message or a wrong
// signature fails `tsc` (docs/spec/architecture.md, interface text).
//
// Interface Text for every page other than the game screen lives here: the
// Scenario collection, Character creation with the start form, the
// Playthroughs list, and the app's own not-found and error pages, including
// page titles and descriptions. Scenario text keeps flowing through
// unchanged. Messages that
// take a Scenario-provided name place it only where English needs no
// inflection (as a label or after a colon), and numbers are formatted with
// `Intl` in this catalogue's language.

import type { EquipmentSlot } from '../engine/inventory';
import { selectPlural } from './plural';

const number = new Intl.NumberFormat('en');
const whole = (value: number): string => number.format(value);

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
};

export type Catalogue = typeof en;
