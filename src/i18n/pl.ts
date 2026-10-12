// Polish Interface Text catalogue. Declared as a `Catalogue`, so a missing
// message or a wrong signature fails `tsc`
// (docs/spec/architecture.md, interface text).
//
// Polish wording follows the term table (docs/spec/ui.md, polish terms):
// Rozgrywka, Scenariusz, Postać, Szablon postaci, Zdrowie, Obrażenia, Dystans,
// Broń, Strój, Talizman, Ekwipunek, Przedmiot jednorazowy, Przedmiot
// fabularny, Walka, Dziennik, Zakończenie. The engine vocabulary follows the
// Polish terms table; every other message is UI copy. A Scenario-provided name
// appears only where Polish needs no inflection: as a label, after a colon, or
// in the nominative. Scenario text is never case-transformed. Counts use the
// plural helper (`one | few | many | other`).

import type { Catalogue } from './en';
import { formatNumber } from './format';
import { selectPlural } from './plural';

const whole = (value: number): string => formatNumber('pl', value);

const itemsCount = (count: number): string =>
  selectPlural('pl', count, {
    one: '1 przedmiot',
    few: `${formatNumber('pl', count)} przedmioty`,
    many: `${formatNumber('pl', count)} przedmiotów`,
    other: `${formatNumber('pl', count)} przedmiotów`,
  });

const entriesCount = (count: number): string =>
  selectPlural('pl', count, {
    one: '1 wpis',
    few: `${formatNumber('pl', count)} wpisy`,
    many: `${formatNumber('pl', count)} wpisów`,
    other: `${formatNumber('pl', count)} wpisów`,
  });

// Damage amounts use the language's plural forms ("1 obrażenie",
// "3 obrażenia", "5 obrażeń"), never a case-transformed name.
const damageText = (amount: number): string =>
  selectPlural('pl', amount, {
    one: '1 obrażenie',
    few: `${formatNumber('pl', amount)} obrażenia`,
    many: `${formatNumber('pl', amount)} obrażeń`,
    other: `${formatNumber('pl', amount)} obrażenia`,
  });

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
  notices: {
    stale: 'Stan gry zmienił się w innej karcie; to jest jej aktualny stan.',
    unavailable: 'Ta akcja nie jest już dostępna.',
  },
  attributes: {
    might: 'Krzepa',
    agility: 'Zręczność',
    wits: 'Spryt',
    presence: 'Prezencja',
  },
  difficulty: {
    easy: 'Łatwa',
    ordinary: 'Zwykła',
    hard: 'Trudna',
    'very-hard': 'Bardzo trudna',
  },
  range: {
    near: 'Blisko',
    far: 'Daleko',
  },
  reach: {
    melee: 'wręcz',
    ranged: 'dystansowy',
  },
  slots: {
    weapon: 'Broń',
    outfit: 'Strój',
    talisman: 'Talizman',
  },
  itemKinds: {
    equipment: 'Ekwipunek',
    consumable: 'Przedmiot jednorazowy',
    key: 'Przedmiot fabularny',
  },
  ending: {
    title: 'Zakończenie',
    victory: 'Zwycięstwo',
    defeat: 'Porażka',
  },
  game: {
    scenes: 'Sceny',
    exits: 'Wyjścia',
    choices: 'Wybory',
    continue: 'Kontynuuj',
    latestEvents: 'Ostatnie wydarzenia',
    afterEnding: 'Po zakończeniu',
    viewJournal: 'Zobacz dziennik',
    startNew: (title: string) => `Nowa rozgrywka: ${title}`,
    returnToCollection: 'Wróć do kolekcji',
    scenarioGone:
      'Ten scenariusz nie jest już dostępny, więc ta rozgrywka jest tylko do odczytu.',
    scenarioChanged:
      'Ten scenariusz zmienił się od czasu gry, więc ta rozgrywka jest tylko do odczytu.',
    locationGone:
      'Lokacja, w której znajduje się ta rozgrywka, nie jest już częścią tego scenariusza.',
    endingGone:
      'Zakończenie osiągnięte w tej rozgrywce nie jest już częścią tego scenariusza.',
    testLabel: (attribute: string, difficulty: string, target: number) =>
      `${attribute}, ${difficulty} ${formatNumber('pl', target)}`,
  },
  character: {
    title: 'Postać',
    panelLabel: 'Postać i ekwipunek',
    status: 'Status postaci',
    attributes: 'Atrybuty',
    health: 'Zdrowie',
    equipped: 'Założone',
    legend: '● podstawa ◆ bonus z ekwipunku (maks. +2)',
    short: (now: number, max: number) =>
      `Zdrowie ${formatNumber('pl', now)}/${formatNumber('pl', max)}`,
    label: (now: number, max: number) =>
      `Zdrowie ${formatNumber('pl', now)} z ${formatNumber('pl', max)}`,
    name: (health: string) => `Postać, ${health}`,
    bonusBase: (base: number) => `podstawa ${formatNumber('pl', base)}`,
    bonusPoint: (item: string) => `+1 ${item}`,
    bonusCapped: 'bonus ograniczony do +2',
  },
  inventory: {
    title: 'Ekwipunek',
    combatNote: 'Akcje ekwipunku są niedostępne podczas walki.',
    equipped: 'Założone',
    emptySlot: 'Puste',
    carried: 'Niesione',
    carriedEmpty: 'Pusto.',
    ribbon: 'założone',
    magicTitle: 'Magiczny przedmiot',
    magicLabel: '✦ magiczny',
    equip: 'Załóż',
    unequip: 'Zdejmij',
    use: 'Użyj',
    noChangeInCombat: 'Nie można zmieniać ekwipunku podczas walki.',
    noUseInCombat: 'Nie można tu używać przedmiotów podczas walki.',
    fullHealth: 'Już pełne zdrowie.',
    name: (items: string) => `Ekwipunek, ${items}`,
    count: itemsCount,
    keyChip: 'Przedmiot fabularny',
    consumableChip: (heal: number) =>
      `Przedmiot jednorazowy · leczy ${formatNumber('pl', heal)}`,
    equipmentChip: (slot: string) => `Ekwipunek · ${slot}`,
    bonusStat: (attribute: string) => `+1 ${attribute}`,
    weaponStats: (damage: number | undefined, reach: string) =>
      damage === undefined
        ? `Zasięg ${reach}`
        : `Obrażenia ${formatNumber('pl', damage)} · Zasięg ${reach}`,
  },
  map: {
    title: 'Mapa',
    label: 'Mapa lokacji',
    travelSub: 'Podróż',
    youAreHere: 'Tu jesteś',
    travelTo: (name: string) => `Podróż: ${name}`,
    heardOf: (name: string) => `${name} (znane ze słyszenia)`,
    showUnknown: 'Pokaż nieodwiedzone wyjścia jako „?”',
    hideUnknown: 'Ukryj nieodwiedzone wyjścia',
  },
  journal: {
    title: 'Dziennik',
    name: (entries: string) => `Dziennik, ${entries}`,
    count: entriesCount,
    total: (count: number) => `${entriesCount(count)}.`,
    openInNewTab: 'Otwórz w nowej karcie',
    close: 'Zamknij',
    types: {
      intro: 'Wstęp',
      scene: 'Scena',
      choice: 'Dokonany wybór',
      test: 'Test',
      outcome: 'Wynik',
      stateChange: 'Zmiana stanu',
      travel: 'Podróż',
      combatStart: 'Początek walki',
      combatRound: 'Runda walki',
      combatEnd: 'Koniec walki',
      enemyDefeated: 'Pokonany przeciwnik',
      inventory: 'Inwentarz',
      ending: 'Zakończenie',
    },
    travel: (name: string): string => `Podróż: ${name}`,
    victory: 'Zwycięstwo',
    defeat: 'Porażka',
    test: (
      attribute: string,
      difficulty: string,
      target: number,
      die1: number,
      die2: number,
      modifier: number,
      total: number,
      success: boolean,
    ): string => {
      const signed = modifier >= 0 ? `+${whole(modifier)}` : `−${whole(Math.abs(modifier))}`;
      const result = success ? 'sukces' : 'porażka';
      return (
        `Test: ${attribute}, ${difficulty} ${whole(target)}: ` +
        `${whole(die1)}+${whole(die2)}${signed}=${whole(total)} vs ${whole(target)} — ${result}.`
      );
    },
    itemReceived: (name: string, count: number): string =>
      count === 1 ? `Otrzymano: ${name}` : `Otrzymano: ${name} ×${whole(count)}`,
    itemLost: (name: string, count: number): string =>
      count === 1 ? `Utracono: ${name}` : `Utracono: ${name} ×${whole(count)}`,
    healthGained: (amount: number): string =>
      selectPlural('pl', amount, {
        one: `+${whole(amount)} punkt Zdrowia`,
        few: `+${whole(amount)} punkty Zdrowia`,
        many: `+${whole(amount)} punktów Zdrowia`,
        other: `+${whole(amount)} punktu Zdrowia`,
      }),
    healthLost: (amount: number): string =>
      selectPlural('pl', amount, {
        one: `${whole(amount)} obrażenie`,
        few: `${whole(amount)} obrażenia`,
        many: `${whole(amount)} obrażeń`,
        other: `${whole(amount)} obrażenia`,
      }),
    revealed: (name: string): string => `Odkryto: ${name}`,
    equipped: (name: string): string => `Założono: ${name}`,
    unequipped: (name: string): string => `Zdjęto: ${name}`,
    used: (name: string, restored: number): string =>
      `Użyto: ${name} (+${whole(restored)} Zdrowia)`,
  },
  readOnly: {
    combat: 'Walka',
    roundRange: (round: number, range: string) =>
      `Runda ${formatNumber('pl', round)} · Dystans: ${range}`,
    health: (
      character: string,
      now: number,
      max: number,
      enemy: string,
      enemyNow: number,
      enemyMax: number,
    ) =>
      `${character}: Zdrowie ${formatNumber('pl', now)}/${formatNumber('pl', max)} · ` +
      `${enemy}: Zdrowie ${formatNumber('pl', enemyNow)}/${formatNumber('pl', enemyMax)}`,
  },
  combat: {
    title: 'Walka',
    round: (round: number) => `Runda ${whole(round)}`,
    log: 'Przebieg',
    lastRound: (round: number) => `Ostatnia runda · ${whole(round)}`,
    noRolls: 'Brak rzutów.',
    noConsumables: 'Brak przedmiotów jednorazowych.',
    guardUp: 'Garda',
    unarmed: 'Gołe ręce',
    groups: {
      position: 'Pozycja',
      fight: 'Walka',
      items: 'Przedmioty',
      leave: 'Ucieczka',
    },
    advance: 'Podejdź',
    fallBack: 'Wycofaj się',
    attack: 'Atak',
    attackWith: (weapon: string) => `Atak: ${weapon}`,
    defend: 'Obrona',
    useItem: (item: string) => `Użyj: ${item}`,
    escape: 'Ucieczka',
    reasonAlreadyAt: (range: string) => `Już: ${range}.`,
    reasonNeedsNear: (weapon: string, range: string) => `${weapon}: tylko ${range}.`,
    reasonNeedsNearUnarmed: (range: string) => `Bez broni: tylko ${range}.`,
    reasonFullHealth: 'Zdrowie już pełne.',
    arenaRange: (range: string) => `Dystans: ${range}`,
    farMarker: (range: string) => `‹ — — ${range} — — ›`,
    damage: damageText,
    rollScore: (die1: number, die2: number, modifier: number, total: number, target: number) =>
      `${whole(die1)}+${whole(die2)}+${whole(modifier)}=${whole(total)} vs ${whole(target)}`,
    rollHit: (who: string, score: string, damage: string) => `${who}: ${score} — trafienie, ${damage}`,
    rollSuccess: (who: string, score: string) => `${who}: ${score} — powodzenie`,
    rollMiss: (who: string, score: string) => `${who}: ${score} — pudło`,
    lineAdvance: (range: string) => `Zbliżenie: ${range}.`,
    lineFallBackSuccess: (score: string, range: string) =>
      `Wycofanie (${score}): powodzenie, ${range}.`,
    lineFallBackFailure: (score: string, range: string) =>
      `Wycofanie (${score}): niepowodzenie, ${range}.`,
    lineEscapeSuccess: (score: string) => `Ucieczka (${score}): powodzenie.`,
    lineEscapeFailure: (score: string) => `Ucieczka (${score}): niepowodzenie.`,
    lineUseItem: (item: string, health: number) => `Użycie: ${item} — Zdrowie +${whole(health)}.`,
    lineDefend: 'Obrona: garda w górze.',
    lineAttackHit: (weapon: string, score: string, damage: string) =>
      `Atak: ${weapon} (${score}) — trafienie, ${damage}.`,
    lineAttackMiss: (weapon: string, score: string) => `Atak: ${weapon} (${score}) — pudło.`,
    lineEnemyAttackHit: (enemy: string, score: string, damage: string) =>
      `Atak: ${enemy} (${score}) — trafienie, ${damage}.`,
    lineEnemyAttackMiss: (enemy: string, score: string, counter: boolean) =>
      counter
        ? `Atak: ${enemy} (${score}) — pudło, kontratak: ${damageText(1)}.`
        : `Atak: ${enemy} (${score}) — pudło.`,
    lineEnemyClosesIn: (enemy: string, range: string) =>
      `${enemy}: zbliża się (${range}), zamiast atakować.`,
    opponent: (enemy: string) => `Przeciwnik: ${enemy}.`,
    combatEndVictory: (enemy: string) => `Pokonano: ${enemy}.`,
    combatEndEscape: (enemy: string) => `Ucieczka: ${enemy}.`,
    enemyDefeated: (enemy: string) => `Pokonany: ${enemy}.`,
  },
  closePanel: (title: string) => `Zamknij: ${title}`,
};
