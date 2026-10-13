// Arena text helpers (docs/spec/ui.md, participant names; Combat panel):
// same-kind participants gain a capital letter from their ordinal, author ids
// are never shown, Intent names follow Reach, and per-target disabled reasons
// name the selected target.

import { describe, expect, it } from 'vitest';
import {
  combatTargetReasonText,
  intentDisplayName,
  participantDisplayName,
} from '../src/app/lib/combat-text';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

describe('participantDisplayName', () => {
  it('shows the Enemy name alone when its kind is unique', () => {
    expect(participantDisplayName('Grey Wolf')).toBe('Grey Wolf');
  });

  it('adds a capital letter from the ordinal for same-kind participants', () => {
    expect(participantDisplayName('Grey Wolf', 1)).toBe('Grey Wolf A');
    expect(participantDisplayName('Grey Wolf', 2)).toBe('Grey Wolf B');
  });
});

describe('intentDisplayName', () => {
  it('names melee and ranged Intents in English', () => {
    expect(intentDisplayName('strike', 'melee', en)).toBe('Strike');
    expect(intentDisplayName('strike', 'ranged', en)).toBe('Shoot');
    expect(intentDisplayName('close-in', 'melee', en)).toBe('Close in');
    expect(intentDisplayName('prepare', 'melee', en)).toBe('Wind up');
    expect(intentDisplayName('prepare', 'ranged', en)).toBe('Take aim');
    expect(intentDisplayName('heavy-attack', 'melee', en)).toBe('Heavy blow');
    expect(intentDisplayName('heavy-attack', 'ranged', en)).toBe('Aimed shot');
  });

  it('names Intents in Polish without inflecting Scenario names', () => {
    expect(intentDisplayName('strike', 'melee', pl)).toBe('Cios');
    expect(intentDisplayName('heavy-attack', 'ranged', pl)).toBe('Wycelowany strzał');
  });
});

describe('combatTargetReasonText', () => {
  it('is undefined when the selected target allows the action', () => {
    expect(
      combatTargetReasonText(
        { id: 'attack', weaponName: 'Sword' },
        {
          participantId: 'wolf-a',
          name: 'Grey Wolf',
          ordinal: 1,
          range: 'near',
          enabled: true,
        },
        {},
        en,
      ),
    ).toBeUndefined();
  });

  it('names the weapon and the out-of-Reach target for Attack', () => {
    expect(
      combatTargetReasonText(
        { id: 'attack', weaponName: 'Sword' },
        {
          participantId: 'wolf-b',
          name: 'Grey Wolf',
          ordinal: 2,
          range: 'far',
          enabled: false,
          reason: 'needs-near',
        },
        {},
        en,
      ),
    ).toBe('Your Sword needs Near Range; Grey Wolf B is Far.');
  });

  it('names the already-Near target for Advance', () => {
    expect(
      combatTargetReasonText(
        { id: 'advance' },
        {
          participantId: 'wolf-a',
          name: 'Grey Wolf',
          ordinal: 1,
          range: 'near',
          enabled: false,
          reason: 'already-near',
        },
        {},
        en,
      ),
    ).toBe('You are already Near Grey Wolf A.');
  });

  it('names the Wary target and its last round for Distract', () => {
    expect(
      combatTargetReasonText(
        { id: 'distract' },
        {
          participantId: 'wolf-a',
          name: 'Grey Wolf',
          ordinal: 1,
          range: 'near',
          enabled: false,
          reason: 'wary',
        },
        { waryUntilRound: 5 },
        en,
      ),
    ).toBe('Grey Wolf A is wary of tricks until the end of round 5.');
  });
});
