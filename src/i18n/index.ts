// Framework-free Interface Language module
// (docs/spec/architecture.md, repository shape and interface text).

export {
  INTERFACE_LANGUAGES,
  isInterfaceLanguage,
  primaryLanguageSubtag,
  type InterfaceLanguage,
} from './languages';
export { en, type Catalogue } from './en';
export { pl } from './pl';
export { getCatalogue } from './catalogues';
export { formatNumber } from './format';
export {
  pluralCategory,
  selectPlural,
  type PluralCategory,
  type PluralCategoryEn,
  type PluralCategoryPl,
} from './plural';
export { matchInterfaceLanguage, resolveInterfaceLanguage } from './match';
