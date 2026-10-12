// The Character sheet (docs/spec/ui.md, Character sheet): header with a
// large Health medal, Attributes with pips, Health with a segment bar, and
// the equipped mini list. Pips equal the effective value (base first, then
// counted bonuses); bonuses beyond the +2 cap render struck through with the
// cap explanation.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '../src/content/model';
import type { PlaythroughState } from '../src/engine/state';
import { CharacterSheet } from '../src/app/play/[playthroughId]/character-sheet';

function testScenario(): Scenario {
  return {
    templatesById: {
      hunter: { id: 'hunter', name: 'Hunter', description: 'Tracks prey through the woods.' },
    },
    itemsById: {
      blade: { id: 'blade', name: 'Harbour Blade', kind: 'equipment', slot: 'weapon', bonus: 'might' },
      coat: { id: 'coat', name: 'Padded Watch Coat', kind: 'equipment', slot: 'outfit', bonus: 'might' },
      charm: { id: 'charm', name: 'Lucky Charm', kind: 'equipment', slot: 'talisman', bonus: 'might' },
      cloak: { id: 'cloak', name: "Hunter's Cloak", kind: 'equipment', slot: 'outfit', bonus: 'agility' },
    },
  } as unknown as Scenario;
}

function testState(overrides: Partial<PlaythroughState> = {}): PlaythroughState {
  return {
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 2, agility: 3, wits: 0, presence: 1 },
      health: 9,
    },
    equipment: { weapon: 'blade', outfit: 'coat' },
    ...overrides,
  } as PlaythroughState;
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

describe('CharacterSheet', () => {
  it('shows the header, Health and equipped items', () => {
    const markup = renderToStaticMarkup(
      <CharacterSheet scenario={testScenario()} state={testState()} locationName="Ashford" />,
    );
    // Header: name, Template, Location and Template description.
    expect(markup).toContain('Robin');
    expect(markup).toContain('Hunter');
    expect(markup).toContain('Ashford');
    expect(markup).toContain('Tracks prey through the woods.');
    // Health as a large "9 / 12" with an accessible segment-bar label.
    expect(markup).toContain('aria-label="Health 9 of 12"');
    // Equipped mini list: the two items by name, "—" for the empty slot.
    expect(markup).toContain('Harbour Blade');
    expect(markup).toContain('Padded Watch Coat');
    expect(markup).toContain('—');
    expect(markup).toContain('Weapon');
    expect(markup).toContain('Outfit');
    expect(markup).toContain('Talisman');
    // The legend names both pip kinds.
    expect(markup).toContain('● base ◆ equipment bonus (max +2)');
  });

  it('fills pips to the effective value, base first then bonuses', () => {
    const markup = renderToStaticMarkup(
      <CharacterSheet scenario={testScenario()} state={testState()} locationName="Ashford" />,
    );
    // Might is base 2 with two bonuses (blade and coat); agility is base 3,
    // wits base 0, presence base 1. Base pips: 2 + 3 + 0 + 1 = 6; bonus
    // pips: 2 + 0 + 0 + 0 = 2.
    expect(count(markup, 'pip base')).toBe(6);
    expect(count(markup, 'pip bonus')).toBe(2);
    // Five pips per Attribute row: 20 total, the rest hollow.
    expect(count(markup, 'class="pip"')).toBe(12);
    // The source line names each counted bonus.
    expect(markup).toContain('base 2');
    expect(markup).toContain('+1 Harbour Blade');
    expect(markup).toContain('+1 Padded Watch Coat');
  });

  it('strikes through bonuses beyond the +2 cap with the cap explanation', () => {
    const markup = renderToStaticMarkup(
      <CharacterSheet
        scenario={testScenario()}
        state={testState({
          character: {
            templateId: 'hunter',
            name: 'Robin',
            baseAttributes: { might: 3, agility: 0, wits: 0, presence: 0 },
            health: 12,
          },
          equipment: { weapon: 'blade', outfit: 'coat', talisman: 'charm' },
        })}
        locationName="Ashford"
      />,
    );
    // Might 3 + 3 bonuses: only two count (effective 5), the third is struck.
    expect(markup).toContain('bonus capped at +2');
    expect(markup).toContain('<s');
    expect(markup).toContain('+1 Lucky Charm');
    // Base pips 3 + bonus pips 2 = the effective value of 5.
    expect(count(markup, 'pip base')).toBe(3);
    expect(count(markup, 'pip bonus')).toBe(2);
  });

  it('marks low Health on the medal ring and the segment bar', () => {
    const low = renderToStaticMarkup(
      <CharacterSheet
        scenario={testScenario()}
        state={testState({
          character: {
            templateId: 'hunter',
            name: 'Robin',
            baseAttributes: { might: 2, agility: 3, wits: 0, presence: 1 },
            health: 4,
          },
        })}
        locationName="Ashford"
      />,
    );
    expect(low).toContain('status-medal sheet-medal low');
    expect(low).toContain('health-segments low');
    expect(low).toContain('aria-label="Health 4 of 12"');

    const full = renderToStaticMarkup(
      <CharacterSheet scenario={testScenario()} state={testState()} locationName="Ashford" />,
    );
    expect(full).not.toContain('low');
  });

  it('reads best effort when the Template is gone from the content', () => {
    const markup = renderToStaticMarkup(
      <CharacterSheet
        scenario={testScenario()}
        state={testState({
          character: {
            templateId: 'gone',
            name: 'Robin',
            baseAttributes: { might: 2, agility: 3, wits: 0, presence: 1 },
            health: 9,
          },
          equipment: {},
        })}
        locationName="Ashford"
      />,
    );
    expect(markup).toContain('gone');
    expect(markup).toContain('Ashford');
  });
});
