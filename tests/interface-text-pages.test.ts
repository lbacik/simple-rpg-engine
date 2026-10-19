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
      // P5: the Arena plays on the shared Combat core, so the Setup,
      // presets, restart and fight-again strings ship with it.
      en.arena.title,
      pl.arena.title,
      en.arena.description,
      pl.arena.description,
      en.arena.setupHeading,
      pl.arena.setupHeading,
      en.arena.opponentsHeading,
      pl.arena.opponentsHeading,
      en.arena.countLabel,
      pl.arena.countLabel,
      en.arena.opponentLegend(1),
      pl.arena.opponentLegend(1),
      en.arena.profileLabel,
      pl.arena.profileLabel,
      en.arena.groupLabel,
      pl.arena.groupLabel,
      en.arena.engagedLabel,
      pl.arena.engagedLabel,
      en.arena.phaseOffsetLabel,
      pl.arena.phaseOffsetLabel,
      en.arena.powerLabel,
      pl.arena.powerLabel,
      en.arena.companionHeading,
      pl.arena.companionHeading,
      en.arena.companionNone,
      pl.arena.companionNone,
      en.arena.startFight,
      pl.arena.startFight,
      en.arena.presetsHeading,
      pl.arena.presetsHeading,
      en.arena.presetsBlurb,
      pl.arena.presetsBlurb,
      en.arena.presetStart('T1'),
      pl.arena.presetStart('T1'),
      en.arena.fightAgain,
      pl.arena.fightAgain,
      en.arena.fightAgainBlurb,
      pl.arena.fightAgainBlurb,
      en.arena.restart,
      pl.arena.restart,
      en.arena.restartBlurb,
      pl.arena.restartBlurb,
      en.arena.replaceHeading,
      pl.arena.replaceHeading,
      en.arena.replaceBody,
      pl.arena.replaceBody,
      en.arena.restartConfirmHeading,
      pl.arena.restartConfirmHeading,
      en.arena.restartConfirmBody,
      pl.arena.restartConfirmBody,
      en.arena.keepFighting,
      pl.arena.keepFighting,
      en.arena.noRememberedSetup,
      pl.arena.noRememberedSetup,
      // P5 A3: Arena import and export strings.
      en.arena.importHeading,
      pl.arena.importHeading,
      en.arena.importBlurb,
      pl.arena.importBlurb,
      en.arena.fileLabel,
      pl.arena.fileLabel,
      en.arena.pasteLabel,
      pl.arena.pasteLabel,
      en.arena.importSubmit,
      pl.arena.importSubmit,
      en.arena.exportFight,
      pl.arena.exportFight,
      ...Object.values(en.arena.profiles),
      ...Object.values(pl.arena.profiles),
      ...Object.values(en.arena.setupErrors),
      ...Object.values(pl.arena.setupErrors),
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

  // P5: the Arena Setup/presets/result strings ship with the Arena on the
  // shared Combat core; victory/death/escape stay out of the Arena.

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
      expect(Object.keys(catalogue), name).toContain('illustration');
    }
  });
});
