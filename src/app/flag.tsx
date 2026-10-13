// Language flags (docs/spec/ui.md, language flags): inline SVG, matched by
// primary language subtag. `en` is the flag of the United Kingdom, `pl` the
// flag of Poland. A language with no flag is marked by its primary subtag in
// capitals, in a box of the flag's size.

import { primaryLanguageSubtag, type Catalogue } from '../i18n/index';

function UnitedKingdomFlag(): React.ReactNode {
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" />
      <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

function PolandFlag(): React.ReactNode {
  return (
    <svg viewBox="0 0 16 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect width="16" height="10" fill="#ffffff" />
      <rect y="5" width="16" height="5" fill="#DC143C" />
    </svg>
  );
}

export function flagPrimarySubtag(language: string): string {
  return primaryLanguageSubtag(language);
}

export function LanguageFlag({
  language,
  label,
  current,
}: {
  language: string;
  label?: string;
  /** The language the Scenario text is shown in now: ringed, the others dimmed. */
  current?: boolean;
}): React.ReactNode {
  const primary = flagPrimarySubtag(language);
  const className = `flag${current === true ? ' current' : ''}`;
  const graphic =
    primary === 'en' ? (
      <UnitedKingdomFlag />
    ) : primary === 'pl' ? (
      <PolandFlag />
    ) : null;
  if (graphic === null) {
    return (
      <span
        className={`${className} flag-fallback`}
        role="img"
        aria-label={label ?? primary.toUpperCase()}
      >
        {primary.toUpperCase()}
      </span>
    );
  }
  if (label === undefined) {
    return (
      <span className={className} aria-hidden="true">
        {graphic}
      </span>
    );
  }
  return (
    <span className={className} role="img" aria-label={label}>
      {graphic}
    </span>
  );
}

/**
 * One flag per language a Scenario can be shown in (docs/spec/ui.md, scenario
 * language flags): its Base Language first, then its Translations into
 * Interface Languages. The flag of the language the text is shown in now is
 * ringed; the others are dimmed. Every standalone flag carries an accessible
 * name, with "(original)" for the Base Language.
 */
export function ScenarioLanguageFlags({
  languages,
  shownLanguage,
  baseLanguage,
  catalogue,
}: {
  languages: string[];
  shownLanguage: string;
  baseLanguage: string;
  catalogue: Catalogue;
}): React.ReactNode {
  return (
    <span className="flags">
      {languages.map((language) => (
        <LanguageFlag
          key={language}
          language={language}
          label={catalogue.scenarioLanguage.flagName(language, language === baseLanguage)}
          current={language === shownLanguage}
        />
      ))}
    </span>
  );
}

/**
 * The fallback badge after the reading column's title (docs/spec/ui.md,
 * language fallback on the game screen): the Base Language's flag and
 * "Text: <language>". Shown for as long as the Scenario falls back.
 */
export function ScenarioFallbackBadge({
  baseLanguage,
  catalogue,
}: {
  baseLanguage: string;
  catalogue: Catalogue;
}): React.ReactNode {
  return (
    <span className="badge lang-chip">
      <LanguageFlag
        language={baseLanguage}
        label={catalogue.scenarioLanguage.flagName(baseLanguage, true)}
      />{' '}
      {catalogue.scenarioLanguage.textBadge(baseLanguage)}
    </span>
  );
}
