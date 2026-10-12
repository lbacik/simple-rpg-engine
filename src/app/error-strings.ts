// Error page wording by Interface Language (docs/spec/ui.md, interface
// text). The error boundary (`error.tsx`) must be a Client Component, so it
// cannot call `getCatalogue`; it reads the language from
// `InterfaceLanguageProvider` and these strings instead. The values mirror
// `catalogue.error`, and `tests/interface-text-pages.test.ts` fails when they
// drift apart, so this stays a copy of the catalogue rather than a second
// source of truth. Only these four strings ship to the browser, never the
// catalogue.

import type { InterfaceLanguage } from '@/i18n/languages';

export const errorStrings: Record<
  InterfaceLanguage,
  { title: string; body: string; retry: string; home: string }
> = {
  en: {
    title: 'Something went wrong',
    body: 'The page failed to load. Try again.',
    retry: 'Try again',
    home: 'Back to the Scenarios',
  },
  pl: {
    title: 'Coś poszło nie tak',
    body: 'Nie udało się wczytać strony. Spróbuj ponownie.',
    retry: 'Spróbuj ponownie',
    home: 'Wróć do scenariuszy',
  },
};
