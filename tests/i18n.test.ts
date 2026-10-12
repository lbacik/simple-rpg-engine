// Interface Text unit tests (docs/spec/architecture.md, testing strategy):
// the catalogue key-parity test, the plural helper boundaries, and the
// `Accept-Language` matcher cases.

import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';
import { matchInterfaceLanguage } from '../src/i18n/match';
import { pluralCategory } from '../src/i18n/plural';
import { resolveInterfaceLanguage } from '../src/i18n/match';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'function') return [prefix];
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('catalogues', () => {
  it('have the same set of keys', () => {
    expect(leafKeys(pl).sort()).toEqual(leafKeys(en).sort());
  });
});

describe('pluralCategory', () => {
  it('returns one for 1 and other otherwise in English', () => {
    expect(pluralCategory('en', 0)).toBe('other');
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', 2)).toBe('other');
    expect(pluralCategory('en', 5)).toBe('other');
  });

  it('follows the Polish one/few/many boundaries', () => {
    expect(pluralCategory('pl', 1)).toBe('one');
    expect(pluralCategory('pl', 2)).toBe('few');
    expect(pluralCategory('pl', 5)).toBe('many');
    expect(pluralCategory('pl', 12)).toBe('many');
    expect(pluralCategory('pl', 22)).toBe('few');
    expect(pluralCategory('pl', 25)).toBe('many');
    expect(pluralCategory('pl', 112)).toBe('many');
  });
});

describe('matchInterfaceLanguage', () => {
  it.each([
    ['pl-PL,pl;q=0.9,en;q=0.8', 'pl'],
    ['de-DE,pl;q=0.5', 'pl'],
    ['pl;q=0,en;q=0.1', 'en'],
    ['*', 'en'],
    ['not a language!!', 'en'],
    ['', 'en'],
    [null, 'en'],
    [undefined, 'en'],
    ['de-DE,de;q=0.9', 'en'],
    ['en-US,en;q=0.9', 'en'],
    ['PL-pl', 'pl'],
  ] as const)('matches %s to %s', (header, expected) => {
    expect(matchInterfaceLanguage(header)).toBe(expected);
  });
});

describe('resolveInterfaceLanguage', () => {
  it('prefers a valid cookie over the header', () => {
    expect(resolveInterfaceLanguage('pl', 'en-US,en;q=0.9')).toBe('pl');
  });

  it('ignores a cookie value that is not an Interface Language', () => {
    expect(resolveInterfaceLanguage('de', 'pl-PL,pl;q=0.9')).toBe('pl');
    expect(resolveInterfaceLanguage('xx', null)).toBe('en');
  });
});
