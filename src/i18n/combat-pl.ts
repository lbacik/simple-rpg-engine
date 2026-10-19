// Combat Interface Text: the Polish catalogue slice shipped to the browser
// (ADR 0011). Its shape is `CombatCatalogue` from `combat-en.ts`, so a missing
// message or a wrong signature fails `tsc`; there is no runtime fallback
// between the catalogues.
//
// A message places a Scenario-provided or engine-provided name only where
// Polish needs no inflection: as a label, after a colon, or in the
// nominative. Counts use the Polish plural forms (`one`/`few`/`many`/`other`:
// "1 obrażenie", "3 obrażenia", "5 obrażeń") and every number is formatted
// with `Intl` (docs/spec/architecture.md, interface text; docs/spec/ui.md,
// Polish terms). Engine vocabulary follows the term table (Walka, Zdrowie,
// Obrażenia, Dystans: Zwarcie/Blisko/Daleko, Zwycięstwo/Porażka, Runda);
// the MVP Combat wording (stances, cards, kondycja for stamina) is used
// consistently across this slice.
//
// Framework-free and client-safe, like `combat-en.ts`: no Next.js, React,
// persistence, content or engine runtime code, and never `server-only`.

import { formatNumber } from './format';
import type { InterfaceLanguage } from './languages';
import { selectPlural } from './plural';
import type { BlowParams, CombatCatalogue } from './combat-en';

const whole = (value: number): string => formatNumber('pl', value);

/** Damage amounts use the Polish plural forms, never a case-transformed name. */
const damageText = (amount: number): string =>
  selectPlural('pl', amount, {
    one: '1 obrażenie',
    few: `${formatNumber('pl', amount)} obrażenia`,
    many: `${formatNumber('pl', amount)} obrażeń`,
    other: `${formatNumber('pl', amount)} obrażenia`,
  });

function blowLine(kind: string, params: BlowParams): string {
  const outcome = params.hit ? `trafienie, ${damageText(params.hpLoss)}` : 'pudło';
  const redirect = params.redirected ? ` (przekierowano na ${params.recipient})` : '';
  const counter = params.counter ? ' · kontra wywołana' : '';
  return (
    `${kind}: ${params.actor} → ${params.target}${redirect}` +
    ` · ${whole(params.attackScore)} vs ${whole(params.defenseScore)} — ${outcome}` +
    ` · baza ${whole(params.raw)} − parada ${whole(params.parry)} − pancerz ${whole(params.armor)}` +
    ` − garda ${whole(params.absorbed)}${counter}`
  );
}

const resultName = {
  WIN: 'Zwycięstwo',
  LOSS: 'Porażka',
  LOSS_SURRENDER: 'Kapitulacja',
  DRAW_LIMIT: 'Remis po 30 rundach',
};

export const combatPl: CombatCatalogue = {
  code: 'pl' as InterfaceLanguage,
  reasons: {
    insufficient_stamina: (missing) => `Brak kondycji: ${whole(missing)}`,
    on_cooldown: (availableRound) => `Dostępne od rundy ${whole(availableRound)}`,
    stance_disallows: 'Ta postawa na to nie pozwala.',
    no_shot_ability: 'Bohater nie może strzelać.',
    not_engaged: 'Wymaga zwarcia.',
    must_disengage: 'Najpierw rozerwij zwarcie',
    actor_engaged: 'Jesteś w zwarciu.',
    target_far: 'Cel jest Daleko',
    target_not_near: 'Cel nie jest Blisko.',
    requires_near_ally: 'Wymaga pobliskiego sojusznika',
    invalid_target: 'Nieprawidłowy cel.',
    wrong_round: 'Ta runda już minęła.',
    wrong_phase: 'Błędna faza.',
    'in-combat': 'Niedostępne podczas Walki.',
  },
  events: {
    'round-planned': (params) =>
      `Plan: ${params.actor}: ${params.action} (${params.stance})` +
      (params.target === null ? '' : ` → ${params.target}`) +
      (params.attackSlot ? ' · slot ataku' : '') +
      (params.wasCandidate && !params.attackSlot ? ' · oczekiwanie' : '') +
      ` · baza ${whole(params.baseDamage)}, priorytet ${whole(params.priority)}`,
    declared: (params) =>
      `Deklaracja: ${params.actor}: ${params.action} (${params.stance})` +
      (params.target === null ? '' : ` → ${params.target}`) +
      ` · koszt ${whole(params.cost)}` +
      (params.preparedAccuracy > 0 || params.preparedDamage > 0
        ? ` · przygotowanie +${whole(params.preparedAccuracy)} celności, +${whole(params.preparedDamage)} obrażeń`
        : ''),
    'effect-established': (params) => {
      const parts: string[] = [`Efekt: ${params.actor}: ${params.action}`];
      if (params.guard > 0) parts.push(`garda ${whole(params.guard)}`);
      if (params.exposed) parts.push('odsłonięcie');
      if (params.counter) parts.push('kontra');
      if (params.ward !== null) parts.push(`osłona: ${params.ward}`);
      if (params.readyRound !== null) parts.push(`przygotowanie na rundę ${whole(params.readyRound)}`);
      return parts.join(' · ');
    },
    moved: (params) =>
      params.success
        ? `Ruch: ${params.actor}: ${params.action}` +
          (params.target === null ? '' : ` → ${params.target}`) +
          (params.detail === null ? '' : ` (${params.detail})`)
        : `Ruch nieudany: ${params.actor}: ${params.action}` +
          (params.target === null ? '' : ` → ${params.target}`) +
          (params.detail === null ? '' : ` — ${params.detail}`),
    attack: (params) => blowLine('Atak', params),
    riposte: (params) => blowLine('Riposta', params),
    cancelled: (params) =>
      `Przerwano: ${params.actor}` +
      (params.target === null ? '' : ` → ${params.target}`) +
      ` — ${params.reason}.`,
    eliminated: (actor) => `Wyeliminowano: ${actor}.`,
    regenerated: (params) =>
      `Regeneracja: ${params.actor} +${whole(params.gain)} do kondycji (${whole(params.stamina)}).`,
    'wait-age-updated': (params) => `Oczekiwanie: ${params.actor} (${whole(params.waitAge)}).`,
    finished: (params) => `Koniec: ${resultName[params.result]} · runda ${whole(params.round)}.`,
  },
  results: resultName,
  notices: {
    stale: 'Stan gry zmienił się w innej karcie; to jest jej aktualny stan.',
    rejected: (reason) => `Odrzucono polecenie: ${reason}.`,
    unreadable: 'Tej zapisanej walki nie da się odczytać. Zacznij od nowa albo zaimportuj walkę.',
    importUnverified: 'Zaimportowana historia nie jest zweryfikowana.',
  },
  parseIssues: {
    bad_rules_version: (actual) => `Nieznana wersja zasad: ${actual}.`,
    unexpected_state_version: 'Zapis używa wycofanej wersji stanu i nie da się go odczytać.',
    bad_round: 'Błędny numer rundy.',
    bad_phase: 'Błędna faza.',
    bad_result: 'Błędny wynik.',
    finished_without_result: 'Zakończona walka wymaga wyniku.',
    result_before_finish: 'Tylko zakończona walka ma wynik.',
    bad_next_group_serial: 'Błędny licznik grup.',
    bad_actors: 'Błędna lista uczestników.',
    duplicate_actor_id: (id) => `Powtórzony identyfikator: ${id}.`,
    bad_actor_id: (id) => `Błędny identyfikator: ${id}.`,
    unknown_profile: (params) => `Nieznany profil: ${params.profileId} (${params.id}).`,
    bad_team_role: (id) => `Drużyna i rola niezgodne: ${id}.`,
    bad_stance: (id) => `Błędna postawa: ${id}.`,
    bad_group_id: (id) => `Błędna grupa: ${id}.`,
    hp_out_of_range: (params) => `Zdrowie poza zakresem: ${params.id} (maks. ${whole(params.max)}).`,
    bad_stamina: (id) => `Błędna kondycja: ${id}.`,
    bad_ready_round: (id) => `Błędna runda gotowości: ${id}.`,
    bad_available_round: (id) => `Błędne odnowienie: ${id}.`,
    bad_power: (id) => `Błędna moc: ${id}.`,
    bad_phase_offset: (id) => `Błędne przesunięcie fazy: ${id}.`,
    bad_wait_age: (id) => `Błędny czas oczekiwania: ${id}.`,
    missing_hero: 'Walka wymaga dokładnie jednego bohatera.',
    too_many_companions: (count) => `Za dużo towarzyszy: ${whole(count)}.`,
    bad_enemy_count: (count) => `Liczba wrogów poza zakresem: ${whole(count)}.`,
    bad_state: 'Nieczytelna walka.',
    bad_ref: (id) => `Błędne odniesienie: ${id}.`,
    bad_profile_role: (id) => `Profil i rola niezgodne: ${id}.`,
    no_living_hero: 'Brak żywego bohatera.',
    no_living_enemies: 'Brak żywych wrogów.',
    bad_engagements: 'Błędna lista zwarć.',
    bad_engagement: (params) => `Błędne zwarcie: ${params.a}–${params.b} (${params.reason}).`,
    bad_frozen_plans: 'Błędne zamrożone plany.',
    bad_frozen_plan: (reason) => `Błędny zamrożony plan (${reason}).`,
    bad_log: 'Błędny zapis walki.',
  },
  importIssues: {
    malformed: 'Nieczytelny import.',
    unknown_schema_version: 'Nieznana wersja zapisu.',
    unexpected_state_version: 'Zapis używa wycofanej wersji stanu i nie da się go odczytać.',
    bad_origin: 'Błędne pochodzenie zapisu.',
    bad_setup: 'Błędny zapamiętany układ.',
    bad_initial: 'Błędna walka początkowa.',
  },
  cancelReasons: {
    actor_or_target_dead: 'Atakujący albo cel jest wyeliminowany.',
    range_lost: 'Brak Zwarcia z celem.',
    charge_failed: 'Szarża nie związała walką.',
    shooter_engaged: 'Strzelec jest związany walką.',
    target_dead: 'Cel jest wyeliminowany.',
  },
  panel: {
    heroHeading: 'Twoja postać',
    companionHeading: 'Towarzysz',
    intentsHeading: 'Jawne zamiary',
    slotsLine: (used, budget) => `${whole(used)}/${whole(budget)} miejsc ataku`,
    slotAttack: 'Miejsce ataku',
    slotWaiting: (guard) => `Czeka · ochrona ${whole(guard)}`,
    slotWould: (action) => `chciał(a): ${action}`,
    roundLine: (round) => `Runda ${whole(round)}`,
    stanceHeading: 'Postawa',
    cardsHeading: 'Karta lub czynność',
    basicHeading: 'Czynności podstawowe',
    movementHeading: 'Ruch',
    targetHeading: 'Cel',
    perspectiveHeading: 'Odległości z perspektywy',
    legalTarget: 'Legalny cel',
    chooseTargetHint: 'Wybierz cel na liście zamiarów.',
    noTargets: 'Brak legalnego celu.',
    engagedWith: (names) => `Związany z: ${names}`,
    free: 'Wolny',
    prepared: (round) => `Przygotowanie: premia w rundzie ${whole(round)}`,
    notPrepared: 'Przygotowanie: nieaktywne',
    cooldowns: 'Odnowienie',
    availableFrom: (action, round) => `${action}: od rundy ${whole(round)}`,
    allReady: 'Wszystkie karty gotowe',
    armorLine: (value) => `Pancerz ${whole(value)}`,
    priorityLine: (priority) => `priorytet ${whole(priority)}`,
    costLine: (cost) => `${whole(cost)} wytrz.`,
    selfWord: 'siebie',
    eliminated: 'Wyeliminowany',
    hpLine: (value, max) => `HP ${whole(value)} / ${whole(max)}`,
    staminaLine: (value, max) => `${whole(value)} / ${whole(max)} wytrz.`,
    forecastHeading: 'Prognoza rundy',
    forecastNone: 'Wybierz kartę, aby zobaczyć prognozę.',
    forecastBlocked: 'Tego wyboru nie można zatwierdzić.',
    blowsHeading: 'Kolejność ciosów',
    afterHeading: 'Po rundzie',
    regenHeading: 'Regeneracja',
    coverTag: (protector, ward) => `Osłona: ${protector} przejmuje atak na: ${ward}`,
    counterTag: 'Kontratak: parowanie 6',
    riposteTag: 'Riposta',
    cutoffLine: (blows) => `Walka kończy się tutaj — te ciosy się nie odbędą: ${blows}.`,
    noRegeneration: 'Brak regeneracji w rundzie kończącej.',
    engagementsAfter: (pairs) => `Związania po rundzie: ${pairs}`,
    engagementsNone: 'brak',
    moveVariant: { JOIN: 'dołączenie', ENGAGE: 'związanie' },
    moveGroup: (group) => `grupa ${group}`,
    blowSummary: (params) =>
      params.hit
        ? `${params.actor} → ${params.target} · trafienie · −${whole(params.hpLoss)} HP`
        : `${params.actor} → ${params.target} · pudło`,
    confirm: 'Rozegraj rundę',
    surrender: 'Poddaj walkę',
    resultHeading: 'Koniec walki',
  },
  actions: {
    heavy: 'Silny cios',
    counter: 'Kontra',
    feint: 'Zwód',
    cover: 'Osłona',
    charge: 'Szarża',
    prepare: 'Przygotowanie',
    strike: 'Uderzenie',
    brace: 'Obrona',
    shot: 'Strzał',
    approach: 'Zbliżenie',
    disengage: 'Oderwanie',
    withdraw: 'Wycofanie',
    wait: 'Oczekiwanie',
  },
  stances: {
    aggressive: 'Agresywna',
    balanced: 'Zrównoważona',
    defensive: 'Defensywna',
  },
  ranges: {
    self: 'Siebie',
    melee: 'Zwarcie',
    near: 'Blisko',
    far: 'Daleko',
  },
};
