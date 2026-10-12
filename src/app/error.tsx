// The app's own error page (docs/spec/ui.md, interface text), in the
// Interface Language instead of Next.js's built-in English one. A Client
// Component by framework requirement; it takes no catalogue and receives no
// catalogue strings as props from Next (only `error` and `reset`), so it
// reads the language from `InterfaceLanguageProvider` and renders the
// matching `errorStrings`.

'use client';

import { useEffect } from 'react';
import { errorStrings } from './error-strings';
import { useInterfaceLanguage } from './language-context';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  const strings = errorStrings[useInterfaceLanguage()];
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main>
      <h1>{strings.title}</h1>
      <p>{strings.body}</p>
      <p>
        <button className="button" type="button" onClick={() => reset()}>
          {strings.retry}
        </button>{' '}
        <a className="button secondary" href="/">
          {strings.home}
        </a>
      </p>
    </main>
  );
}
