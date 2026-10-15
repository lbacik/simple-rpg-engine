// The top navigation (docs/spec/ui.md, language switcher): a component of
// its own, rendered on every page from the layout. The language menu sits at
// its right end. It is a `<details>` disclosure whose items are submit
// buttons of a form posting to the switching Server Action, so it works
// without JavaScript.

import { INTERFACE_LANGUAGES, type Catalogue, type InterfaceLanguage } from '@/i18n/index';
import { LanguageFlag } from './flag';
import { setInterfaceLanguage } from './lib/language-action';

export function TopNavigation({
  language,
  catalogue,
}: {
  language: InterfaceLanguage;
  catalogue: Catalogue;
}): React.ReactNode {
  const currentName = catalogue.language.names[language];
  return (
    <nav>
      <a href="/">{catalogue.nav.scenarios}</a>
      <a href="/playthroughs">{catalogue.nav.playthroughs}</a>
      <span className="spacer" aria-hidden="true" />
      <details className="langmenu">
        <summary aria-label={catalogue.language.menu(currentName)}>
          <LanguageFlag language={language} />
          <span className="lang-name">{currentName}</span>{' '}
          <span aria-hidden="true">▾</span>
        </summary>
        <div className="menu">
          <form action={setInterfaceLanguage}>
            {INTERFACE_LANGUAGES.map((option) => (
              <button
                key={option}
                type="submit"
                name="language"
                value={option}
                lang={option}
                aria-current={option === language ? 'true' : undefined}
              >
                <span>
                  <LanguageFlag language={option} />
                  {catalogue.language.names[option]}
                </span>
                <span aria-hidden="true">{option === language ? '✓' : ''}</span>
              </button>
            ))}
          </form>
        </div>
      </details>
    </nav>
  );
}
