// Interface Text for the non-game pages (docs/spec/ui.md, interface text;
// docs/spec/architecture.md, interface text): the collection, Character
// creation, the Playthroughs list, and the app's own not-found and error
// pages. Interface Text comes from the catalogue in the Interface Language, counts
// use the plural helper, and Scenario-provided names appear only where no
// inflection is needed and are never transformed. No catalogue ships to the
// browser: Client Components receive rendered strings as props.
//
// Relative imports only: vitest has no `@/` alias.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { errorStrings } from '../src/app/error-strings';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

const catalogues = { en, pl };

describe('non-game interface text', () => {
  it('is non-empty in both languages', () => {
    const strings: string[] = [
      en.collection.title,
      pl.collection.title,
      en.collection.description,
      pl.collection.description,
      en.collection.empty,
      pl.collection.empty,
      en.collection.newPlaythrough,
      pl.collection.newPlaythrough,
      en.scenario.description,
      pl.scenario.description,
      en.scenario.templatesHeading,
      pl.scenario.templatesHeading,
      en.scenario.beginHeading,
      pl.scenario.beginHeading,
      en.startForm.templateLegend,
      pl.startForm.templateLegend,
      en.startForm.nameLabel,
      pl.startForm.nameLabel,
      en.startForm.submit,
      pl.startForm.submit,
      en.startForm.starting,
      pl.startForm.starting,
      en.startForm.unknownScenario,
      pl.startForm.unknownScenario,
      en.startForm.unknownTemplate,
      pl.startForm.unknownTemplate,
      en.startForm.invalidName(),
      pl.startForm.invalidName(),
      en.playthroughs.title,
      pl.playthroughs.title,
      en.playthroughs.description,
      pl.playthroughs.description,
      en.playthroughs.activeHeading,
      pl.playthroughs.activeHeading,
      en.playthroughs.endedHeading,
      pl.playthroughs.endedHeading,
      en.playthroughs.empty,
      pl.playthroughs.empty,
      en.playthroughs.emptyLink,
      pl.playthroughs.emptyLink,
      en.playthroughs.emptySuffix,
      pl.playthroughs.emptySuffix,
      en.playthroughs.noActive,
      pl.playthroughs.noActive,
      en.playthroughs.noEnded,
      pl.playthroughs.noEnded,
      en.playthroughs.resume,
      pl.playthroughs.resume,
      en.playthroughs.view,
      pl.playthroughs.view,
      en.playthroughs.statusActive,
      pl.playthroughs.statusActive,
      en.playthroughs.statusEnded,
      pl.playthroughs.statusEnded,
      en.playthroughs.statusIncompatible,
      pl.playthroughs.statusIncompatible,
      en.notFound.title,
      pl.notFound.title,
      en.notFound.body,
      pl.notFound.body,
      en.notFound.home,
      pl.notFound.home,
      en.error.title,
      pl.error.title,
      en.error.body,
      pl.error.body,
      en.error.retry,
      pl.error.retry,
      en.error.home,
      pl.error.home,
      en.scenarioLanguage.name('pl'),
      pl.scenarioLanguage.name('en'),
      en.scenarioLanguage.flagName('pl', true),
      pl.scenarioLanguage.flagName('en', true),
      en.scenarioLanguage.flagName('en', false),
      pl.scenarioLanguage.flagName('pl', false),
      en.scenarioLanguage.inInterfaceLanguage('en'),
      pl.scenarioLanguage.inInterfaceLanguage('pl'),
      en.scenarioLanguage.otherLanguages,
      pl.scenarioLanguage.otherLanguages,
      en.scenarioLanguage.otherLanguagesNote('en'),
      pl.scenarioLanguage.otherLanguagesNote('pl'),
      en.scenarioLanguage.notTranslated('pl', 'en'),
      pl.scenarioLanguage.notTranslated('pl', 'en'),
      en.scenarioLanguage.textBadge('pl'),
      pl.scenarioLanguage.textBadge('en'),
      en.scenario.templateItemSuffix(1, null),
      pl.scenario.templateItemSuffix(2, 'Broń'),
      en.arena.title,
      pl.arena.title,
      en.arena.description,
      pl.arena.description,
      en.arena.bestiaryHeading,
      pl.arena.bestiaryHeading,
      en.arena.characterHeading,
      pl.arena.characterHeading,
      en.arena.start,
      pl.arena.start,
      en.arena.you,
      pl.arena.you,
      en.arena.backToSetup,
      pl.arena.backToSetup,
      en.nav.arena,
      pl.nav.arena,
    ];
    for (const text of strings) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('{');
    }
  });

  it('places the Scenario title after a colon in page titles', () => {
    expect(en.scenario.metaTitle('The Whispering Woods')).toBe(
      'New Playthrough: The Whispering Woods',
    );
    expect(pl.scenario.metaTitle('Szepczące Lasy')).toBe('Nowa rozgrywka: Szepczące Lasy');
  });

  it('never transforms a Scenario-provided name', () => {
    expect(en.scenario.templateItem('harbour blade', 1, 'Weapon')).toContain('harbour blade');
    expect(en.scenario.templateItem('harbour blade', 1, 'Weapon')).not.toContain('Harbour');
    expect(pl.scenario.templateItem('miecz', 2, 'Broń')).toContain('miecz');
    expect(pl.scenario.templateItem('miecz', 2, 'Broń')).not.toContain('Miecz');
    expect(pl.scenario.metaTitle('szepczące lasy')).toContain('szepczące lasy');
  });

  it('uses the Polish terms for Attributes, Health and slots', () => {
    expect(pl.scenario.attributesLine(2, 1, 1, 0, 12)).toBe(
      'Krzepa 2 · Zręczność 1 · Spryt 1 · Prezencja 0 · Zdrowie 12',
    );
    expect(en.scenario.attributesLine(2, 1, 1, 0, 12)).toBe(
      'Might 2 · Agility 1 · Wits 1 · Presence 0 · Health 12',
    );
    expect(Object.values(pl.scenario.slots).sort()).toEqual(['Broń', 'Strój', 'Talizman']);
  });

  it('renders counts through the plural helper', () => {
    expect(en.startForm.invalidName()).toBe('Enter a name of 1–40 characters.');
    expect(pl.startForm.invalidName()).toBe('Podaj imię o długości 1–40 znaków.');
  });

  it('covers the Arena setup, stats and result', () => {
    expect(en.arena.characterLine(2, 2, 1, 1, 12)).toBe(
      'Might 2 · Agility 2 · Wits 1 · Presence 1 · Health 12',
    );
    expect(pl.arena.characterLine(2, 2, 1, 1, 12)).toBe(
      'Krzepa 2 · Zręczność 2 · Spryt 1 · Prezencja 1 · Zdrowie 12',
    );
    expect(
      en.arena.enemyLine(1, 2, 1, 0, 8, 2, en.reach.melee, en.arena.behaviour.steady),
    ).toBe(
      'Might 1 · Agility 2 · Wits 1 · Presence 0 · Health 8 · Damage 2 · Reach melee · Steady',
    );
    expect(
      pl.arena.enemyLine(3, 0, 0, 1, 14, 3, pl.reach.melee, pl.arena.behaviour.heavy),
    ).toBe(
      'Krzepa 3 · Zręczność 0 · Spryt 0 · Prezencja 1 · Zdrowie 14 · Obrażenia 3 · Zasięg wręcz · Mocny',
    );
    expect(en.arena.rounds(1)).toBe('1 round');
    expect(en.arena.rounds(5)).toBe('5 rounds');
    expect(pl.arena.rounds(1)).toBe('1 runda');
    expect(pl.arena.rounds(3)).toBe('3 rundy');
    expect(pl.arena.rounds(5)).toBe('5 rund');
  });

  it('keeps the error page strings equal to the catalogue', () => {
    expect(errorStrings.en).toEqual(en.error);
    expect(errorStrings.pl).toEqual(pl.error);
  });
});

describe('browser bundle', () => {
  const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it('ships no catalogue to Client Components', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.includes("'use client'") && !text.includes('"use client"')) continue;
      const runtimeI18nImport = text
        .split('\n')
        .some(
          (line) =>
            /^import(?!\s+type\b)/.test(line) &&
            /['"]((@\/i18n)|(\.{1,2}\/)+i18n)\b/.test(line),
        );
      if (runtimeI18nImport) offenders.push(path.relative(srcDir, file));
    }
    expect(offenders).toEqual([]);
  });

  it('gives Client Components their wording as props or local strings', () => {
    const startForm = fs.readFileSync(
      path.join(srcDir, 'app', 'scenarios', '[scenarioId]', 'start-form.tsx'),
      'utf8',
    );
    expect(startForm).toContain('strings.legend');
    expect(startForm).toContain('strings.nameLabel');
    expect(startForm).toContain('strings.submit');
    expect(startForm).toContain('strings.starting');
  });
});

describe('catalogue parity', () => {
  it('covers the new sections in both languages', () => {
    for (const [name, catalogue] of Object.entries(catalogues)) {
      expect(Object.keys(catalogue), name).toContain('collection');
      expect(Object.keys(catalogue), name).toContain('scenario');
      expect(Object.keys(catalogue), name).toContain('startForm');
      expect(Object.keys(catalogue), name).toContain('playthroughs');
      expect(Object.keys(catalogue), name).toContain('notFound');
      expect(Object.keys(catalogue), name).toContain('error');
      expect(Object.keys(catalogue), name).toContain('scenarioLanguage');
      expect(Object.keys(catalogue), name).toContain('arena');
    }
  });
});
