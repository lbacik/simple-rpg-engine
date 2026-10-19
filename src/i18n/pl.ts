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
import { primaryLanguageSubtag } from './languages';
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

// S4: `damageText` served the removed tactical Combat roll lines.

/** The name of a Scenario language in Polish; other tags read as their primary subtag in capitals. */
function scenarioLanguageName(language: string): string {
  const primary = primaryLanguageSubtag(language);
  if (primary === 'en') return 'angielski';
  if (primary === 'pl') return 'polski';
  return primary.toUpperCase();
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const pl: Catalogue = {
  // The Interface Language this catalogue renders (see `code` in en.ts).
  code: 'pl',
  app: {
    title: 'Simple RPG Engine',
    description: 'Solowe przygody RPG w przeglądarce.',
  },
  nav: {
    scenarios: 'Scenariusze',
    playthroughs: 'Moje rozgrywki',
    arena: 'Arena',
  },
  language: {
    label: 'Język',
    menu: (name: string) => `Język: ${name}`,
    names: {
      en: 'English',
      pl: 'Polski',
    },
  },
  scenarioLanguage: {
    name: (language: string): string => scenarioLanguageName(language),
    flagName: (language: string, original: boolean): string =>
      original
        ? `${cap(scenarioLanguageName(language))} (oryginał)`
        : cap(scenarioLanguageName(language)),
    inInterfaceLanguage: (language: string): string => {
      const primary = primaryLanguageSubtag(language);
      if (primary === 'pl') return 'Po polsku';
      if (primary === 'en') return 'Po angielsku';
      return primary.toUpperCase();
    },
    otherLanguages: 'W innych językach',
    otherLanguagesNote: (language: string): string =>
      `Te scenariusze nie mają jeszcze tłumaczenia na język ${scenarioLanguageName(language)}. Grasz w nie w oryginale.`,
    notTranslated: (shown: string, ui: string): string =>
      `Brak tłumaczenia na język ${scenarioLanguageName(ui)}. Tekst w języku: ${scenarioLanguageName(shown)}.`,
    textBadge: (shown: string): string => `Tekst: ${scenarioLanguageName(shown)}`,
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
    templateItemSuffix: (quantity: number, slotName: string | null): string =>
      slotName === null
        ? ` × ${whole(quantity)}`
        : ` × ${whole(quantity)} (${slotName})`,
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
  // Arena on the shared Combat core (Combat MVP 1.0, P5). Setup configures
  // 1–5 opponents in explicit order with an optional Companion; the hero
  // fights without equipment. Presets T1–T7 build the rules §15.2 states.
  arena: {
    title: 'Arena',
    description:
      'Zmierz się z 1–5 przeciwnikami na zasadach Walki, sam lub z Towarzyszem. Bez Scenariusza i Rozgrywki — sama walka.',
    setupHeading: 'Nowa walka',
    opponentsHeading: 'Przeciwnicy (1–5, w kolejności walki)',
    countLabel: 'Ilu',
    opponentLegend: (index: number) => `Przeciwnik ${index}`,
    profileLabel: 'Profil',
    groupLabel: 'Grupa początkowa',
    engagedLabel: 'Związany walką z bohaterem',
    phaseOffsetLabel: 'Przesunięcie fazy',
    powerLabel: 'Siła',
    companionHeading: 'Towarzysz',
    companionNone: 'Brak',
    startFight: 'Rozpocznij walkę',
    presetsHeading: 'Scenariusze referencyjne',
    presetsBlurb: 'T1–T7 z zasad: te same stany początkowe, które zawiera rozdział o balansie.',
    presetStart: (id: string) => `Zacznij ${id}`,
    fightAgain: 'Walcz ponownie',
    fightAgainBlurb: 'Ten sam zestaw, świeża walka.',
    restart: 'Zacznij od nowa',
    restartBlurb: 'Rozpocznij tę walkę od nowa, od jej stanu początkowego.',
    replaceHeading: 'Walka już trwa',
    replaceBody: 'Rozpoczęcie nowej walki odrzuca bieżącą. Tego nie da się cofnąć.',
    restartConfirmHeading: 'Zacząć tę walkę od nowa?',
    restartConfirmBody: 'Bieżąca runda zostaje odrzucona, a walka zaczyna się od nowa od stanu początkowego.',
    keepFighting: 'Kontynuuj walkę',
    noRememberedSetup: 'Brak zapamiętanego zestawu — skonfiguruj walkę poniżej.',
    importHeading: 'Importuj walkę',
    importBlurb:
      'Wczytaj plik walki (dokument JSON CombatState, maks. 1 MB) albo wklej jego treść. Błędny import sam się wyjaśni.',
    fileLabel: 'Plik walki',
    pasteLabel: 'Albo wklej JSON walki',
    importSubmit: 'Importuj walkę',
    exportFight: 'Eksportuj bieżącą walkę',
    profiles: {
      hero: 'Bohater',
      raider: 'Hultaj',
      brute: 'Brutal',
      sentinel: 'Wartownik',
      archer: 'Łucznik',
      'party-sentinel': 'Wartownik z drużyny',
      'party-archer': 'Łucznik z drużyny',
    },
    setupErrors: {
      bad_setup: 'Tego zestawu nie da się odczytać.',
      bad_opponent_count: 'Wybierz 1–5 przeciwników.',
      bad_opponent_profile: 'Nieznany profil przeciwnika.',
      bad_starting_group: 'Grupy początkowe wyglądają jak g0, g1, ….',
      bad_engaged_flag: 'Zaznacz, czy każdy przeciwnik zaczyna związany walką z bohaterem.',
      bad_phase_offset: 'Przesunięcia fazy to liczby całkowite od 0.',
      bad_power: 'Siła to liczba całkowita od 0 do 3.',
      bad_companion: 'Nieznany towarzysz.',
    },
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
  // S4: the Near/Far Range vocabulary belonged to the tactical rules.
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
    adventure: 'Twoja przygoda',
    currentScene: 'Bieżąca scena',
    currentLocation: 'Bieżąca lokacja',
    decide: 'Co robisz dalej?',
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
    expand: 'Powiększ mapę',
    travelTo: (name: string) => `Podróż: ${name}`,
    heardOf: (name: string) => `${name} (znane ze słyszenia)`,
    showUnknown: 'Pokaż niewidoczne wyjścia',
    hideUnknown: 'Ukryj niewidoczne wyjścia',
  },
  illustration: {
    pauseAnimation: 'Wstrzymaj animację',
    playAnimation: 'Odtwórz animację',
  },
  journal: {
    title: 'Dziennik',
    name: (entries: string) => `Dziennik, ${entries}`,
    count: entriesCount,
    total: (count: number) => `${entriesCount(count)}.`,
    openInNewTab: 'Otwórz w nowej karcie',
    close: 'Zamknij',
    backToGame: 'Wróć do gry',
    empty: 'Nic się jeszcze nie wydarzyło.',
    loadingOlder: 'Ładowanie starszych wpisów…',
    loadFailed: 'Nie udało się wczytać starszych wpisów.',
    retryOlder: 'Ponów wczytywanie starszych wpisów',
    startReached: 'Osiągnięto początek Dziennika.',
    olderEntries: 'Starsze wpisy',
    position: 'Krok {step} · wpis {seq} z {total}',
    stepNote: ' · krok {step}',
    types: {
      intro: 'Wstęp',
      scene: 'Scena',
      choice: 'Dokonany wybór',
      test: 'Test',
      outcome: 'Wynik',
      stateChange: 'Zmiana stanu',
      travel: 'Podróż',
      inventory: 'Inwentarz',
      ending: 'Zakończenie',
      combatStart: 'Początek walki',
      combatRound: 'Runda walki',
      combatEnd: 'Koniec walki',
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
    combatStart: 'Walka się zaczyna. Przeciwnicy:',
    combatEnd: (howEnded: 'win' | 'surrender' | 'draw'): string =>
      howEnded === 'win' ? 'Walka wygrana.' : howEnded === 'surrender' ? 'Walka poddana.' : 'Walka nierozstrzygnięta.',
  },
  // S4: the readOnly Combat/Range/Health lines belonged to the tactical rules.
  // S4: the Combat catalogue (actions, intents, roll lines, escape,
  // combatEndEscape, the tactical block with stopEscape) belonged to the
  // removed tactical rules. Scenario/Arena Combat return on the shared
  // Combat core with the adapter tickets.
  closePanel: (title: string) => `Zamknij: ${title}`,
};
