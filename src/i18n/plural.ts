// Plural helper over `Intl.PluralRules` (docs/spec/architecture.md,
// interface text). Categories are typed per language: `one | other` for
// `en`, `one | few | many | other` for `pl`. A missing category is a type
// error at the call site.

import type { InterfaceLanguage } from './languages';

export type PluralCategoryEn = 'one' | 'other';
export type PluralCategoryPl = 'one' | 'few' | 'many' | 'other';

export type PluralCategory<Lang extends InterfaceLanguage> = Lang extends 'pl'
  ? PluralCategoryPl
  : PluralCategoryEn;

const rulesCache = new Map<InterfaceLanguage, Intl.PluralRules>();

function rulesFor(language: InterfaceLanguage): Intl.PluralRules {
  const cached = rulesCache.get(language);
  if (cached) return cached;
  const rules = new Intl.PluralRules(language);
  rulesCache.set(language, rules);
  return rules;
}

export function pluralCategory(language: 'en', count: number): PluralCategoryEn;
export function pluralCategory(language: 'pl', count: number): PluralCategoryPl;
export function pluralCategory(
  language: InterfaceLanguage,
  count: number,
): PluralCategoryPl {
  return rulesFor(language).select(count) as PluralCategoryPl;
}

/**
 * Pick the message form for `count` in `language`. Every category of the
 * language must be present, so a missing form is a type error.
 */
export function selectPlural<Lang extends InterfaceLanguage>(
  language: Lang,
  count: number,
  forms: Record<PluralCategory<Lang>, string>,
): string {
  return forms[pluralCategory(language as 'pl', count) as PluralCategory<Lang>];
}
