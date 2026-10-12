// The Interface Language for Client Components (docs/spec/architecture.md,
// interface text). The language cookie is `HttpOnly`, so the browser cannot
// read it; the layout passes the resolved language down through this context
// instead. Only the two-letter language tag ships to the browser, never the
// catalogue: Client Components receive rendered strings as props and look up
// any client-side wording (today only the error page) from small local
// dictionaries by this tag.

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { InterfaceLanguage } from '@/i18n/languages';

const InterfaceLanguageContext = createContext<InterfaceLanguage>('en');

export function InterfaceLanguageProvider({
  language,
  children,
}: {
  language: InterfaceLanguage;
  children: ReactNode;
}): ReactNode {
  return (
    <InterfaceLanguageContext.Provider value={language}>
      {children}
    </InterfaceLanguageContext.Provider>
  );
}

export function useInterfaceLanguage(): InterfaceLanguage {
  return useContext(InterfaceLanguageContext);
}
