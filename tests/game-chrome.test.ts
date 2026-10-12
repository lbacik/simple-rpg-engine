// Game-screen chrome in the Interface Language (docs/spec/ui.md, interface
// text): every heading, launcher, map label, Character/Inventory string,
// Ending kind and rejection notice comes from the catalogue, in English and
// in Polish, with numbers formatted by `Intl` in the Interface Language.

import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';
import { formatNumber } from '../src/i18n/format';

describe('formatNumber', () => {
  it('formats small numbers identically in both languages', () => {
    expect(formatNumber('en', 12)).toBe('12');
    expect(formatNumber('pl', 12)).toBe('12');
  });

  it('uses the Interface Language for grouping', () => {
    expect(formatNumber('en', 1234)).toBe('1,234');
    expect(formatNumber('pl', 1234)).not.toBe('1,234');
    expect(formatNumber('pl', 1234)).toContain('234');
  });
});

describe('game chrome catalogue', () => {
  it('renders the choice Test label from structured values, never raw ids', () => {
    expect(
      en.game.testLabel(en.attributes.might, en.difficulty['very-hard'], 13),
    ).toBe('Might, Very hard 13');
    expect(
      pl.game.testLabel(pl.attributes.might, pl.difficulty['very-hard'], 13),
    ).toBe('Krzepa, Bardzo trudna 13');
  });

  it('uses the Polish terms table for the engine vocabulary', () => {
    expect(pl.attributes).toEqual({
      might: 'Krzepa',
      agility: 'Zręczność',
      wits: 'Spryt',
      presence: 'Prezencja',
    });
    expect(pl.difficulty).toEqual({
      easy: 'Łatwa',
      ordinary: 'Zwykła',
      hard: 'Trudna',
      'very-hard': 'Bardzo trudna',
    });
    expect(pl.range).toEqual({ near: 'Blisko', far: 'Daleko' });
    expect(pl.reach).toEqual({ melee: 'wręcz', ranged: 'dystansowy' });
    expect(pl.slots).toEqual({ weapon: 'Broń', outfit: 'Strój', talisman: 'Talizman' });
    expect(pl.itemKinds).toEqual({
      equipment: 'Ekwipunek',
      consumable: 'Przedmiot jednorazowy',
      key: 'Przedmiot fabularny',
    });
    expect([pl.ending.victory, pl.ending.defeat]).toEqual(['Zwycięstwo', 'Porażka']);
    expect(en.ending.victory).toBe('Victory');
    expect(en.ending.defeat).toBe('Defeat');
  });

  it('counts items and journal entries with the language plural forms', () => {
    expect(en.inventory.count(1)).toBe('1 item');
    expect(en.inventory.count(3)).toBe('3 items');
    expect(en.journal.count(1)).toBe('1 entry');
    expect(en.journal.count(34)).toBe('34 entries');
    expect(pl.inventory.count(1)).toBe('1 przedmiot');
    expect(pl.inventory.count(3)).toBe('3 przedmioty');
    expect(pl.inventory.count(5)).toBe('5 przedmiotów');
    expect(pl.journal.count(1)).toBe('1 wpis');
    expect(pl.journal.count(2)).toBe('2 wpisy');
    expect(pl.journal.count(5)).toBe('5 wpisów');
    expect(pl.journal.count(12)).toBe('12 wpisów');
    expect(pl.journal.count(22)).toBe('22 wpisy');
  });

  it('renders weapon stats and healing chips without raw ids', () => {
    expect(en.inventory.weaponStats(3, en.reach.melee)).toBe('Damage 3 · Reach melee');
    expect(en.inventory.weaponStats(undefined, en.reach.ranged)).toBe('Reach ranged');
    expect(pl.inventory.weaponStats(3, pl.reach.melee)).toBe('Obrażenia 3 · Zasięg wręcz');
    expect(en.inventory.consumableChip(3)).toBe('Consumable · restores 3 Health');
    expect(pl.inventory.consumableChip(3)).toBe('Przedmiot jednorazowy · leczy 3');
    expect(pl.inventory.equipmentChip(pl.slots.weapon)).toBe('Ekwipunek · Broń');
  });

  it('renders notices, health and round lines in both languages', () => {
    for (const catalogue of [en, pl]) {
      expect(catalogue.notices.stale.length).toBeGreaterThan(0);
      expect(catalogue.notices.unavailable.length).toBeGreaterThan(0);
      for (const text of [catalogue.notices.stale, catalogue.notices.unavailable]) {
        expect(text).not.toContain('{');
        expect(text).not.toContain('undefined');
      }
    }
    expect(en.character.short(9, 12)).toBe('Health 9/12');
    expect(en.character.label(9, 12)).toBe('Health 9 of 12');
    expect(pl.character.short(9, 12)).toBe('Zdrowie 9/12');
    expect(pl.character.label(9, 12)).toBe('Zdrowie 9 z 12');
    expect(en.readOnly.roundRange(2, en.range.near)).toBe('Round 2 · Range: Near');
    expect(pl.readOnly.roundRange(2, pl.range.near)).toBe('Runda 2 · Dystans: Blisko');
  });

  it('places the Scenario name label-shaped, without inflection', () => {
    expect(en.game.startNew('The Whispering Woods')).toBe(
      'Start a new Playthrough of The Whispering Woods',
    );
    expect(pl.game.startNew('Szepczące Lasy')).toBe('Nowa rozgrywka: Szepczące Lasy');
    expect(en.map.travelTo('Ashford')).toBe('Travel to Ashford');
    expect(pl.map.travelTo('Ashford')).toBe('Podróż: Ashford');
  });
});
