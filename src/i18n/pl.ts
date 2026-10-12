// Polish Interface Text catalogue. Declared as a `Catalogue`, so a missing
// message or a wrong signature fails `tsc`
// (docs/spec/architecture.md, interface text).

import type { Catalogue } from './en';

export const pl: Catalogue = {
  nav: {
    scenarios: 'Scenariusze',
    playthroughs: 'Moje rozgrywki',
  },
  language: {
    label: 'Język',
    menu: (name: string) => `Język: ${name}`,
    names: {
      en: 'English',
      pl: 'Polski',
    },
  },
};
