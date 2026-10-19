// Combat Interface Text slice entry point (ADR 0011): the only catalogue
// client components may import. `getCombatCatalogue` returns the English or
// Polish slice; the rest of the catalogue (`en.ts`, `pl.ts`, `catalogues.ts`)
// stays server-side. Import this module from `@/i18n/combat`, never from
// `@/i18n/index`, so client bundles carry only this slice.
//
// Framework-free and client-safe: this module (and everything it imports)
// pulls no Next.js, React, persistence, content or engine runtime code, and
// never `server-only`. Engine imports are type-only and erased at build.

import { combatEn, type CombatCatalogue } from './combat-en';
import { combatPl } from './combat-pl';
import type { InterfaceLanguage } from './languages';

export type {
  BlowParams,
  CombatCancelReasons,
  CombatCatalogue,
  CombatEvents,
  CombatImportIssues,
  CombatNotices,
  CombatPanelText,
  CombatParseIssues,
  CombatReasons,
  CombatResults,
} from './combat-en';
export { combatEn } from './combat-en';
export { combatPl } from './combat-pl';

const COMBAT_CATALOGUES: Record<InterfaceLanguage, CombatCatalogue> = {
  en: combatEn,
  pl: combatPl,
};

export function getCombatCatalogue(language: InterfaceLanguage): CombatCatalogue {
  return COMBAT_CATALOGUES[language];
}
