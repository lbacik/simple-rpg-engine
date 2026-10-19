// Scenario text selection and overlay (docs/spec/scenario-format.md, language
// tags; docs/spec/ui.md, shared presentation).
//
// For an Interface Language, a Scenario's text comes from the Translation
// whose primary language subtag equals it (`en-US` selects an `en`
// Translation). When the Base Language matches, the base text is shown.
// Otherwise the base text is the fallback. Text is never mixed within a
// Scenario: the overlay swaps every translatable field, and the Illustration
// `alt` follows the Translation while the images do not.
//
// Relative imports only: vitest has no `@/` alias.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/content/index';
import type { CompiledTranslation, Scenario } from '../src/content/model';
import {
  displayLanguages,
  localizeScenario,
  selectScenarioText,
} from '../src/content/localize';
import { startPlaythrough, type Rng } from '../src/engine/index';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(testsDir, 'fixtures', 'scenarios');

const rng: Rng = () => 1;

function loadFixture(name: string): Scenario {
  const result = loadScenario(path.join(fixturesDir, name));
  if (!result.ok) throw new Error(`fixture ${name} failed to load`);
  return result.scenario;
}

describe('selectScenarioText', () => {
  it('shows the base text when the Base Language matches', () => {
    const scenario = loadFixture('two-bridges');
    const selected = selectScenarioText(scenario, 'en');
    expect(selected.translation).toBeUndefined();
    expect(selected.shownLanguage).toBe('en');
    expect(selected.fallback).toBe(false);
  });

  it('selects a Translation by primary language subtag', () => {
    const scenario = loadFixture('two-bridges');
    const selected = selectScenarioText(scenario, 'pl');
    expect(selected.translation?.language).toBe('pl');
    expect(selected.shownLanguage).toBe('pl');
    expect(selected.fallback).toBe(false);
  });

  it('matches a regional Interface Language to its Translation', () => {
    const scenario = loadFixture('two-bridges');
    const selected = selectScenarioText(scenario, 'en-US');
    expect(selected.translation).toBeUndefined();
    expect(selected.shownLanguage).toBe('en');
    expect(selected.fallback).toBe(false);
  });

  it('shows a non-English base when it matches', () => {
    const scenario = loadFixture('stara-studnia');
    const selected = selectScenarioText(scenario, 'pl');
    expect(selected.translation).toBeUndefined();
    expect(selected.shownLanguage).toBe('pl');
    expect(selected.fallback).toBe(false);
  });

  it('selects the English Translation of a Polish-base Scenario', () => {
    const scenario = loadFixture('stara-studnia');
    const selected = selectScenarioText(scenario, 'en');
    expect(selected.translation?.language).toBe('en');
    expect(selected.shownLanguage).toBe('en');
    expect(selected.fallback).toBe(false);
  });

  it('falls back to the Base Language without a matching Translation', () => {
    const scenario = loadFixture('two-bridges');
    const selected = selectScenarioText(scenario, 'de');
    expect(selected.translation).toBeUndefined();
    expect(selected.shownLanguage).toBe('en');
    expect(selected.fallback).toBe(true);
  });
});

describe('displayLanguages', () => {
  it('lists the Base Language first, then Translations into Interface Languages', () => {
    expect(displayLanguages(loadFixture('two-bridges'))).toEqual(['en', 'pl']);
    expect(displayLanguages(loadFixture('stara-studnia'))).toEqual(['pl', 'en']);
  });

  it('leaves out Translations into other languages', () => {
    const scenario = loadFixture('two-bridges');
    const german: CompiledTranslation = {
      ...(scenario.translations[0] as CompiledTranslation),
      language: 'de',
    };
    const withGerman: Scenario = {
      ...scenario,
      translations: [...scenario.translations, german],
    };
    expect(displayLanguages(withGerman)).toEqual(['en', 'pl']);
    expect(selectScenarioText(withGerman, 'de').fallback).toBe(true);
  });
});

describe('localizeScenario', () => {
  it('returns the base Scenario unchanged when the Base Language matches', () => {
    const scenario = loadFixture('two-bridges');
    const localized = localizeScenario(scenario, 'en');
    expect(localized.scenario).toBe(scenario);
    expect(localized.shownLanguage).toBe('en');
    expect(localized.fallback).toBe(false);
    expect(localized.languages).toEqual(['en', 'pl']);
  });

  it('overlays the manifest text', () => {
    const scenario = loadFixture('two-bridges');
    const { scenario: pl } = localizeScenario(scenario, 'pl');
    expect(pl.language).toBe('pl');
    expect(pl.title).toBe('Dwa mosty');
    expect(pl.description).toBe(
      'Rzeka, dwa mosty i przewoźnik, który zamiast monety żąda klucza. Przejdź albo zawróć.',
    );
    expect(pl.intro).toBe('Deszcze wezbrały rzekę, {name}, a obu mostów pilnują.\n');
  });

  it('overlays Locations and their Connection labels', () => {
    const scenario = loadFixture('two-bridges');
    const { scenario: pl } = localizeScenario(scenario, 'pl');
    const east = pl.locationsById['east-bank'];
    expect(east?.name).toBe('Wschodni Brzeg');
    expect(east?.description).toContain('Błoto, trzciny');
    expect(east?.connections[0]?.label).toBe('Przejdź przez bliski most');
    // The base omits this Connection's label, so the overlay defaults to the
    // translated target name instead of mixing in the English one.
    const west = pl.locationsById['west-bank'];
    expect(west?.connections[0]?.label).toBe('Wschodni Brzeg');
    expect(west?.name).toBe('Zachodni Brzeg');
  });

  it('overlays Scenes, Choices and Outcome texts while keeping mechanics', () => {
    const scenario = loadFixture('two-bridges');
    const { scenario: pl } = localizeScenario(scenario, 'pl');
    const arrival = pl.scenesById['arrival'];
    expect(arrival?.title).toBe('Bliski most');
    expect(arrival?.text).toContain('Przewoźnik zastawia drogę');
    const listen = arrival?.choices.find((choice) => choice.id === 'listen');
    expect(listen?.text).toBe('Zapytaj, jaki klucz ma na myśli.');
    expect(listen?.outcome?.text).toContain('Mosiężny klucz');
    // Mechanics survive the overlay: the translated Outcome still gives the
    // item and moves on.
    expect(listen?.outcome?.effects).toHaveLength(1);
    expect(listen?.outcome?.effects[0]).toHaveProperty(
      'give-item',
      expect.objectContaining({ item: 'brass-key' }),
    );
    expect(listen?.outcome?.next?.id).toBe('ferry');
    const cross = arrival?.choices.find((choice) => choice.id === 'cross');
    expect(cross?.text).toBe('Przebiegnij przez deski.');
    expect(cross?.test?.success.text).toContain('Przemykasz obok niego');
    expect(cross?.test?.failure.text).toContain('Deska pęka pod tobą');
    expect(cross?.test?.attribute).toBe('agility');
  });

  it('overlays items, Enemies, Encounters, Templates and Endings', () => {
    const scenario = loadFixture('two-bridges');
    const { scenario: pl } = localizeScenario(scenario, 'pl');
    expect(pl.itemsById['bridge-sword']?.name).toBe('Miecz mostowy');
    expect(pl.itemsById['bread']?.name).toBe('Chleb');
    expect(pl.itemsById['bread']?.description).toBeUndefined();
    expect(pl.enemiesById['river-wolf']?.name).toBe('Rzeczny wilk');
    const ambush = pl.encountersById['wolf-ambush'];
    expect(ambush?.text).toContain('Trzciny się rozstępują');
    expect(ambush?.victory?.text).toContain('Wilk utyka w dal');
    expect(ambush?.surrender?.text).toContain('wycofujesz');
    expect(ambush?.draw?.text).toContain('zatacza krąg');
    expect(pl.templatesById['wayfarer']?.name).toBe('Wędrowiec');
    expect(pl.templatesById['wayfarer']?.description).toBe('Idziesz tam, dokąd prowadzi droga.');
    expect(pl.endingsById['home']?.title).toBe('Cicha droga');
    // Mechanics stay in the base: the Template still grants the same items.
    expect(pl.templatesById['wayfarer']?.items.map((entry) => entry.item.id)).toEqual([
      'bridge-sword',
      'ferryman-cloak',
      'bread',
    ]);
  });

  it('translates Illustration alt text without replacing the images', () => {
    const scenario = loadFixture('two-bridges');
    const { scenario: pl } = localizeScenario(scenario, 'pl');
    const alt = pl.imagesById['east-bank']?.alt;
    expect(alt).toBe('Błotniste trzciny i uginający się most nad brunatną wodą.');
    const baseImage = scenario.imagesById['east-bank'];
    const translatedImage = pl.imagesById['east-bank'];
    expect(translatedImage?.path).toBe(baseImage?.path);
    expect(translatedImage?.width).toBe(baseImage?.width);
    expect(translatedImage?.height).toBe(baseImage?.height);
    // The Location's Illustration is the translated entry.
    expect(pl.locationsById['east-bank']?.illustration?.alt).toBe(alt);
  });

  it('keeps the compiled wiring on the overlaid Scenario', () => {
    const scenario = loadFixture('two-bridges');
    const { scenario: pl } = localizeScenario(scenario, 'pl');
    expect(pl.startLocation.id).toBe('east-bank');
    expect(pl.startLocation.name).toBe('Wschodni Brzeg');
    expect(pl.locationsById['east-bank']).toBe(pl.startLocation);
    expect(pl.scenesById['arrival']?.location).toBe(pl.locationsById['east-bank']);
    expect(pl.locationsById['east-bank']?.scenes.map((scene) => scene.id)).toEqual(['arrival']);
    expect(pl.locationsById['east-bank']?.connections[0]?.to).toBe(pl.locationsById['west-bank']);
    expect(pl.deathEnding.id).toBe('death');
    expect(pl.contentHash).toBe(scenario.contentHash);
  });

  it('leaves the base Scenario untouched', () => {
    const scenario = loadFixture('two-bridges');
    localizeScenario(scenario, 'pl');
    expect(scenario.language).toBe('en');
    expect(scenario.title).toBe('Two Bridges');
    expect(scenario.locationsById['east-bank']?.name).toBe('East Bank');
  });

  it('starts a Playthrough in the shown language', () => {
    const scenario = loadFixture('two-bridges');
    const { scenario: pl } = localizeScenario(scenario, 'pl');
    const started = startPlaythrough(pl, 'wayfarer', 'Jakub', rng);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.journal[0]?.lang).toBe('pl');
    expect(started.journal).toContainEqual(
      expect.objectContaining({ type: 'intro', lang: 'pl' }),
    );
  });
});
