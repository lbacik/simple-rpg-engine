// Language flags (docs/spec/ui.md, language flags): inline SVG, matched by
// primary language subtag. `en` is the flag of the United Kingdom, `pl` the
// flag of Poland. A language with no flag is marked by its primary subtag in
// capitals, in a box of the flag's size.

import { primaryLanguageSubtag } from '@/i18n/index';

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
}: {
  language: string;
  label?: string;
}): React.ReactNode {
  const primary = flagPrimarySubtag(language);
  const graphic =
    primary === 'en' ? (
      <UnitedKingdomFlag />
    ) : primary === 'pl' ? (
      <PolandFlag />
    ) : null;
  if (graphic === null) {
    return (
      <span
        className="flag flag-fallback"
        role="img"
        aria-label={label ?? primary.toUpperCase()}
      >
        {primary.toUpperCase()}
      </span>
    );
  }
  if (label === undefined) {
    return (
      <span className="flag" aria-hidden="true">
        {graphic}
      </span>
    );
  }
  return (
    <span className="flag" role="img" aria-label={label}>
      {graphic}
    </span>
  );
}
