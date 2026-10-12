// Catalogue lookup. Rendering happens in `src/app`: Server Components and
// Server Actions call `getCatalogue(await getInterfaceLanguage())` and no
// catalogue is shipped to the browser
// (docs/spec/architecture.md, interface text).

import { en, type Catalogue } from './en';
import { pl } from './pl';
import type { InterfaceLanguage } from './languages';

export type { Catalogue };

const CATALOGUES: Record<InterfaceLanguage, Catalogue> = { en, pl };

export function getCatalogue(language: InterfaceLanguage): Catalogue {
  return CATALOGUES[language];
}
