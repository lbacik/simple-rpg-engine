// Polish Interface Text catalogue. Declared as a `Catalogue`, so a missing
// message or a wrong signature fails `tsc`
// (docs/spec/architecture.md, interface text).
//
// Polish wording follows the term table (docs/spec/ui.md, polish terms):
// Rozgrywka, Scenariusz, Postać, Szablon postaci, Zdrowie, Obrażenia, Dystans,
// Broń, Strój, Talizman, Ekwipunek, Przedmiot jednorazowy, Przedmiot
// fabularny, Walka, Dziennik, Zakończenie. A Scenario-provided name appears
// only where Polish needs no inflection: as a label or after a colon.
// Counts use the plural helper (`one | few | many | other`).

import { selectPlural } from './plural';
import type { Catalogue } from './en';

const number = new Intl.NumberFormat('pl');
const whole = (value: number): string => number.format(value);

export const pl: Catalogue = {
  app: {
    title: 'Simple RPG Engine',
    description: 'Solowe przygody RPG w przeglądarce.',
  },
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
  collection: {
    title: 'Scenariusze',
    description: 'Wybierz scenariusz, aby rozpocząć nową rozgrywkę.',
    empty: 'Brak dostępnych scenariuszy.',
    newPlaythrough: 'Nowa rozgrywka',
  },
  scenario: {
    description: 'Utwórz postać i rozpocznij nową rozgrywkę.',
    metaTitle: (scenarioTitle: string) => `Nowa rozgrywka: ${scenarioTitle}`,
    templatesHeading: 'Szablony postaci',
    beginHeading: 'Rozpocznij',
    attributesLine: (
      might: number,
      agility: number,
      wits: number,
      presence: number,
      health: number,
    ): string =>
      `Krzepa ${whole(might)} · Zręczność ${whole(agility)} · Spryt ${whole(wits)} · Prezencja ${whole(presence)} · Zdrowie ${whole(health)}`,
    slots: {
      weapon: 'Broń',
      outfit: 'Strój',
      talisman: 'Talizman',
    },
    templateItem: (itemName: string, quantity: number, slotName: string | null): string =>
      slotName === null
        ? `${itemName} × ${whole(quantity)}`
        : `${itemName} × ${whole(quantity)} (${slotName})`,
  },
  startForm: {
    templateLegend: 'Szablon postaci',
    nameLabel: 'Imię postaci',
    submit: 'Rozpocznij rozgrywkę',
    starting: 'Rozpoczynanie…',
    unknownScenario: 'Ten scenariusz jest już niedostępny.',
    unknownTemplate: 'Wybierz jeden z szablonów postaci.',
    invalidName: (): string =>
      `Podaj imię o długości ${whole(1)}–${whole(40)} ${selectPlural('pl', 40, { one: 'znak', few: 'znaki', many: 'znaków', other: 'znaku' })}.`,
  },
  playthroughs: {
    title: 'Moje rozgrywki',
    description: 'Kontynuuj aktywną rozgrywkę lub zobacz zakończoną.',
    activeHeading: 'Aktywne',
    endedHeading: 'Zakończone lub tylko do odczytu',
    empty: 'Brak rozgrywek.',
    emptyLink: 'Wybierz scenariusz',
    emptySuffix: ', aby rozpocząć.',
    noActive: 'Brak aktywnych rozgrywek.',
    noEnded: 'Brak zakończonych rozgrywek.',
    resume: 'Kontynuuj',
    view: 'Zobacz',
    statusActive: 'Aktywna',
    statusEnded: 'Zakończona',
    statusIncompatible: 'Niezgodna',
  },
  notFound: {
    title: 'Nie znaleziono strony',
    body: 'Strona, której szukasz, nie istnieje.',
    home: 'Wróć do scenariuszy',
  },
  error: {
    title: 'Coś poszło nie tak',
    body: 'Nie udało się wczytać strony. Spróbuj ponownie.',
    retry: 'Spróbuj ponownie',
    home: 'Wróć do scenariuszy',
  },
};
