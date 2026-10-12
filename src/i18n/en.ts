// English Interface Text catalogue. Its shape defines the `Catalogue` type;
// every other catalogue is declared as one, so a missing message or a wrong
// signature fails `tsc` (docs/spec/architecture.md, interface text).
//
// Only the top navigation lives here yet; every other Interface Text moves to
// the catalogue in later tickets.

export const en = {
  nav: {
    scenarios: 'Scenarios',
    playthroughs: 'My Playthroughs',
  },
  language: {
    label: 'Language',
    menu: (name: string) => `Language: ${name}`,
    names: {
      en: 'English',
      pl: 'Polski',
    },
  },
};

export type Catalogue = typeof en;
