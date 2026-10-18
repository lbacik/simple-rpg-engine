// THROWAWAY: a local typed Interface Text catalogue for the UI C prototype, shaped
// like src/i18n (ADR 0003): the resolver emits codes and numbers, these functions
// render them. A missing message in either language is a tsc error.
import type { ActionId, CancelReason, ParseIssue, ProfileId, Range, Reason, Result, Stance } from './engine';

export type Lang = 'en' | 'pl';

export type Text = {
  stance: Record<Stance, string>;
  stanceShort: Record<Stance, string>;
  action: Record<ActionId, string>;
  actionSummary: Record<ActionId, string>;
  profile: Record<ProfileId, string>;
  range: Record<Range, string>;
  result: Record<Result, string>;
  reason: (r: Reason, name: (id: string) => string) => string;
  cancel: (r: CancelReason) => string;
  parse: (p: ParseIssue) => string;
  ui: {
    eyebrow: string; banner: string; round: (r: number, max: number) => string; phase: Record<'CHOOSE' | 'FINISHED' | 'RESOLVE', string>;
    contextArena: string; contextScenario: string; language: string;
    you: string; hp: string; stamina: string; armor: string; attack: string; defense: string; prepared: (r: number) => string; notPrepared: string;
    engagedWith: (names: string) => string; free: string; freeShort: string; cooldowns: string; allReady: string; availableFrom: (a: string, r: number) => string;
    intents: string; slots: (used: number) => string; slot: string; waiting: string; waitingWould: (a: string) => string; self: string; priority: (p: number) => string;
    targetLegal: string; pickTarget: string; eliminated: string; companion: string; companionFrozen: string; companionLost: string; companionLostScenario: string; companionNone: string;
    stanceStep: string; actionStep: string; targetStep: string; basicActions: string; movement: string; costShort: (c: number) => string;
    perspective: string; perspectiveOf: (n: string) => string; relations: string; groups: string; groupLabel: (g: string) => string;
    forecast: string; forecastNone: string; forecastIllegal: string; costNow: string; regenEnd: string; regenNote: string;
    willHit: string; willMiss: string; expand: string; queue: string; declarations: string; moves: string; after: string; terminalCutoff: string; noRegenTerminal: string;
    confirm: string; confirming: string; surrender: string; surrenderConfirm: string; surrenderScenario: string; cancel: string; yesSurrender: string;
    log: string; logEmpty: string; replay: string; skip: string; step: (i: number, n: number) => string; showAll: string;
    noticeStale: string; noticeRejected: (reason: string) => string; dismiss: string; rejectedPhase: string; rejectedRound: string;
    serverMode: string; serverAccept: string; serverStale: string; serverReject: string; serverSlow: string;
    io: string; export: string; download: string; copy: string; copied: string; import: string; importFile: string; importPaste: string; importGo: string;
    importReplaceWarn: string; importReplaceConfirm: string; importedBanner: string; importIssues: string; finishedViewOnly: string;
    reload: string; reloadDone: string; unreadable: string;
    resultTitle: string; fightAgain: string; restart: string; restartUnavailable: string; continueOutcome: (o: string) => string; outcome: Record<'victory' | 'deathEnding' | 'surrender' | 'draw', string>;
    inventory: string; inventoryDisabled: string; noRestartScenario: string; scenarioHpNote: (hp: number) => string;
    setup: string; preset: string; startFight: string; offsets: string; offsetsOn: string; state: string;
    eventDeclare: (actor: string, action: string, stance: string, target: string | null) => string; eventGuard: (g: number) => string; eventExposed: string; eventPreparedBonus: string;
    eventMove: (actor: string, outcome: string, target: string | null) => string; moveOutcome: Record<'joined' | 'engaged' | 'disengaged' | 'withdrew' | 'no_change' | 'failed', string>;
    eventAttack: (actor: string, action: string, target: string) => string; eventRedirected: (protector: string, ward: string) => string; eventCounter: string; eventRiposte: string;
    eventHit: (loss: number, hp: number) => string; hit: string; eventMiss: string; eventEliminated: (n: string) => string; eventCancelled: (actor: string, action: string, why: string) => string;
    eventRegen: (actor: string, gain: number, after: number) => string; eventResult: (r: string) => string;
    math: { attack: string; defense: string; skill: string; stanceMod: string; card: string; preparedAcc: string; base: string; feintIgnores: string; exposed: string; raw: string; power: string; preparedDmg: string; parry: string; armorRed: string; guardAbs: (b: number) => string; feintGuard: string; hpLoss: string };
    hpDelta: (from: number, to: number) => string; staminaDelta: (from: number, to: number) => string; engagementsAfter: string; none: string;
  };
};

const cd = (r: number) => r;

export const en: Text = {
  stance: { aggressive: 'Aggressive', balanced: 'Balanced', defensive: 'Defensive' },
  stanceShort: { aggressive: 'A', balanced: 'B', defensive: 'D' },
  action: { heavy: 'Heavy Blow', counter: 'Counterattack', feint: 'Feint', cover: 'Cover', charge: 'Charge', prepare: 'Prepare', strike: 'Strike', brace: 'Brace', approach: 'Approach', disengage: 'Disengage', withdraw: 'Withdraw', shot: 'Shot', wait: 'Guarded Wait' },
  actionSummary: {
    heavy: '13 damage · accuracy −1 · priority 10 · CD 1 · you are Exposed',
    counter: 'Parry 6 · one riposte 7 · CD 1 · only direct attacks',
    feint: '6 (9 vs Defensive) · ignores stance bonus and guard · priority 30',
    cover: 'Guard 6 · take the first attack on a Near ally',
    charge: 'Near → Melee, then a blow of 6 · priority 20',
    prepare: '+5 stamina at round end · next round +2 hit / +3 damage',
    strike: '8 damage · priority 20',
    brace: 'Guard 6 this round',
    approach: 'Join a Far group, or engage a Near enemy',
    disengage: 'Remove all engagements · stay Near',
    withdraw: 'When free: move Far from everyone',
    shot: 'Ranged · needs a free shooter · priority 20',
    wait: 'No slot this round · guard 3',
  },
  profile: { hero: 'Wanderer', raider: 'Raider', brute: 'Brute', sentinel: 'Sentinel', archer: 'Archer', partySentinel: 'Party Sentinel', partyArcher: 'Party Archer' },
  range: { self: 'Self', melee: 'Melee', near: 'Near', far: 'Far' },
  result: { WIN: 'Victory', LOSS: 'Defeat', LOSS_SURRENDER: 'Surrendered', DRAW_LIMIT: 'Draw — round limit reached' },
  reason: (r, name) => {
    switch (r.code) {
      case 'wrong_stance': return `Requires ${r.stances.map(s => en.stance[s]).join(' or ')}`;
      case 'insufficient_stamina': return `Missing ${r.missing} stamina`;
      case 'on_cooldown': return `Available from round ${cd(r.availableRound)}`;
      case 'requires_engagement': return 'Requires an engagement';
      case 'requires_near_ally': return 'Requires an ally that is Near';
      case 'must_disengage': return 'Disengage first';
      case 'not_engaged': return 'You have no engagements';
      case 'target_not_enemy': return 'Choose an enemy';
      case 'target_not_ally': return 'Choose an ally';
      case 'target_dead': return 'Target is out of the fight';
      case 'target_near': return 'The target is Near, not in Melee';
      case 'target_far': return 'The target is Far';
      case 'target_melee': return 'Already in Melee';
      case 'approach_unneeded': return 'Already Near';
      case 'no_target': return 'No legal target';
    }
    void name;
  },
  cancel: r => ({ actor_dead: 'its author is out', target_dead: 'the target is out', not_engaged: 'no longer in Melee', charge_failed: 'the Charge movement failed', shooter_engaged: 'the shooter is engaged' })[r],
  parse: p => {
    switch (p.code) {
      case 'not_json': return 'This is not valid JSON.';
      case 'too_large': return `The file is too large (${Math.round(p.bytes / 1024)} KB, limit 1 MB).`;
      case 'rules_version': return `Saved under different rules (${p.found}).`;
      case 'phase_not_importable': return `A fight in phase ${p.phase} cannot be imported.`;
      case 'missing_field': return `Missing field: ${p.field}.`;
      case 'unknown_profile': return `Unknown profile for ${p.actorId}.`;
      case 'bad_engagement': return `Invalid engagement ${p.pair}.`;
      case 'hp_out_of_range': return `Health out of range for ${p.actorId}.`;
      case 'no_hero': return 'The fight has no hero.';
      case 'plan_target_unknown': return `The frozen plan of ${p.actorId} targets an unknown participant.`;
    }
  },
  ui: {
    eyebrow: 'SIMPLE-RPG-ENGINE / ARENA', banner: 'PROTOTYPE · throwaway · state in memory · real MVP 1.0 resolver (prototype copy)', round: (r, m) => `Round ${r} / ${m}`,
    phase: { CHOOSE: 'Choose', FINISHED: 'Finished', RESOLVE: 'Resolving' }, contextArena: 'Arena', contextScenario: 'Scenario Combat', language: 'Language',
    you: 'YOUR CHARACTER', hp: 'HP', stamina: 'stamina', armor: 'Armor', attack: 'Attack', defense: 'Defense', prepared: r => `Prepared: bonus in round ${r}`, notPrepared: 'Prepare: inactive',
    engagedWith: n => `Engaged with: ${n}`, free: 'Free — you can move', freeShort: 'Free', cooldowns: 'Cooldowns', allReady: 'All cards ready', availableFrom: (a, r) => `${a}: from round ${r}`,
    intents: 'Open intents', slots: u => `${u}/2 attack slots`, slot: 'Attack slot', waiting: 'Waiting · guard 3', waitingWould: a => `would ${a}`, self: 'self', priority: p => `priority ${p}`,
    targetLegal: 'Legal target', pickTarget: 'Choose the target in the intents list', eliminated: 'Out of the fight', companion: 'COMPANION', companionFrozen: 'PLAN FROZEN', companionLost: 'Out of the fight',
    companionLostScenario: 'Slain — will not return to this Playthrough', companionNone: 'No companion',
    stanceStep: '01 / STANCE', actionStep: '02 / ONE CARD OR ACTION', targetStep: '03 / TARGET AND RANGES', basicActions: 'Basic actions', movement: 'Movement', costShort: c => `${c} st.`,
    perspective: 'Ranges from the view of', perspectiveOf: n => n, relations: 'Relations', groups: 'Groups', groupLabel: g => `Group ${g}`,
    forecast: 'ROUND FORECAST', forecastNone: 'Choose an action to see the forecast.', forecastIllegal: 'This choice cannot be confirmed', costNow: 'cost now', regenEnd: 'at round end*',
    regenNote: '* Only if the fight continues. Clicking through choices costs nothing.', willHit: 'will hit', willMiss: 'will miss', expand: 'Numbers', queue: 'Blow order', declarations: 'Declarations', moves: 'Movement', after: 'After the round',
    terminalCutoff: 'The fight ends here — later blows do not happen', noRegenTerminal: 'No regeneration in a terminal round',
    confirm: 'Play round', confirming: 'Resolving…', surrender: 'Surrender', surrenderConfirm: 'Surrender this fight? It ends as a defeat without further blows.', surrenderScenario: 'Surrender this fight? The Encounter continues with its surrender outcome; you survive.',
    cancel: 'Cancel', yesSurrender: 'Yes, surrender',
    log: 'Combat log', logEmpty: 'Intents revealed. Waiting for your choice.', replay: 'Replay round', skip: 'Skip', step: (i, n) => `${i}/${n}`, showAll: 'Show all',
    noticeStale: 'The fight changed in another tab. Your choice was not played; review the current round.', noticeRejected: r => `The server rejected the command: ${r}. Nothing was paid.`, dismiss: 'Dismiss',
    rejectedPhase: 'the fight is not waiting for a choice', rejectedRound: 'it was meant for another round',
    serverMode: 'Next commit (prototype server)', serverAccept: 'accept', serverStale: 'stale step', serverReject: 'reject (rules)', serverSlow: 'slow (2 s)',
    io: 'Save file', export: 'Export fight (JSON)', download: 'Download', copy: 'Copy', copied: 'Copied', import: 'Import fight', importFile: 'From a file', importPaste: 'Paste JSON', importGo: 'Import',
    importReplaceWarn: 'A fight is in progress. Importing replaces it; the current fight cannot be recovered.', importReplaceConfirm: 'Replace the current fight', importedBanner: 'Imported fight — earlier history not verified by this server', importIssues: 'The file could not be imported:',
    finishedViewOnly: 'Imported finished fight — view only', reload: 'Simulate reopening the save', reloadDone: 'Reopened from the save: same round, same frozen intents.', unreadable: 'Your saved Arena fight could not be read. Start a new fight.',
    resultTitle: 'Fight over', fightAgain: 'Fight again', restart: 'Restart this fight', restartUnavailable: 'Restart is unavailable for an imported fight that was already in progress.', continueOutcome: o => `Continue — ${o}`,
    outcome: { victory: 'victory', deathEnding: 'death ending', surrender: 'surrender outcome', draw: 'draw outcome' },
    inventory: 'Inventory', inventoryDisabled: 'Unavailable during Combat', noRestartScenario: 'Scenario fights cannot be restarted. You can export the current state.', scenarioHpNote: hp => `Entered wounded: ${hp} of 40 HP carried in from the Playthrough.`,
    setup: 'Arena Setup', preset: 'Preset', startFight: 'Start fight', offsets: 'Phase offsets', offsetsOn: 'enemy n starts at cycle step n−1', state: 'Full prototype state',
    eventDeclare: (a, act, st, t) => `${a}: ${act} (${st})${t ? ` → ${t}` : ''}`, eventGuard: g => `guard ${g}`, eventExposed: 'Exposed (−2 defense)', eventPreparedBonus: 'Prepare bonus captured',
    eventMove: (a, o, t) => `${a} ${o}${t ? ` ${t}` : ''}`, moveOutcome: { joined: 'joins the group of', engaged: 'engages', disengaged: 'disengages from everyone', withdrew: 'withdraws Far', no_change: 'is already with', failed: 'fails to move toward' },
    eventAttack: (a, act, t) => `${a} — ${act} → ${t}`, eventRedirected: (p, w) => `Cover: ${p} takes the attack meant for ${w}`, eventCounter: 'Counter: parry 6', eventRiposte: 'Riposte',
    eventHit: (l, hp) => `−${l} HP → ${hp}`, hit: 'hit', eventMiss: 'miss', eventEliminated: n => `${n} is out of the fight`, eventCancelled: (a, act, why) => `${a}: ${act} cancelled — ${why}`,
    eventRegen: (a, g, s) => `${a} recovers ${g} stamina → ${s}`, eventResult: r => `Result: ${r}`,
    math: { attack: 'Attack', defense: 'Defense', skill: 'skill', stanceMod: 'stance', card: 'card', preparedAcc: 'Prepare', base: 'base', feintIgnores: 'Feint ignores the stance bonus', exposed: 'Exposed', raw: 'Raw', power: 'power', preparedDmg: 'Prepare', parry: 'parry', armorRed: 'armor', guardAbs: b => `guard (of ${b})`, feintGuard: 'Feint ignores guard', hpLoss: 'HP loss' },
    hpDelta: (f, t) => (f === t ? `${t}` : `${f} → ${t}`), staminaDelta: (f, t) => (f === t ? `${t}` : `${f} → ${t}`), engagementsAfter: 'Engagements after', none: 'none',
  },
};

export const pl: Text = {
  stance: { aggressive: 'Agresywna', balanced: 'Zrównoważona', defensive: 'Defensywna' },
  stanceShort: { aggressive: 'A', balanced: 'Z', defensive: 'D' },
  action: { heavy: 'Potężne uderzenie', counter: 'Kontratak', feint: 'Zwód', cover: 'Osłona', charge: 'Szarża', prepare: 'Przygotowanie', strike: 'Cios', brace: 'Obrona', approach: 'Podejście', disengage: 'Odskok', withdraw: 'Odwrót', shot: 'Strzał', wait: 'Czujne czekanie' },
  actionSummary: {
    heavy: '13 obrażeń · celność −1 · priorytet 10 · CD 1 · odsłonięcie',
    counter: 'Parowanie 6 · jedna riposta 7 · CD 1 · tylko ataki bezpośrednie',
    feint: '6 (9 przeciw Defensywnej) · pomija premię postawy i ochronę · priorytet 30',
    cover: 'Ochrona 6 · przejmij pierwszy atak na sojusznika Blisko',
    charge: 'Blisko → Zwarcie, potem cios 6 · priorytet 20',
    prepare: '+5 wytrz. na końcu rundy · w następnej +2 trafienie / +3 obrażenia',
    strike: '8 obrażeń · priorytet 20',
    brace: 'Ochrona 6 w tej rundzie',
    approach: 'Dołącz do grupy Daleko lub zwiąż wroga Blisko',
    disengage: 'Usuń wszystkie związania · zostań Blisko',
    withdraw: 'Gdy wolny: oddal się od wszystkich',
    shot: 'Dystansowy · strzelec musi być wolny · priorytet 20',
    wait: 'Brak miejsca ataku · ochrona 3',
  },
  profile: { hero: 'Wędrowiec', raider: 'Bandyta', brute: 'Osiłek', sentinel: 'Strażnik', archer: 'Łucznik', partySentinel: 'Strażnik drużyny', partyArcher: 'Łucznik drużyny' },
  range: { self: 'Na siebie', melee: 'Zwarcie', near: 'Blisko', far: 'Daleko' },
  result: { WIN: 'Zwycięstwo', LOSS: 'Porażka', LOSS_SURRENDER: 'Poddanie', DRAW_LIMIT: 'Remis — limit rund' },
  reason: r => {
    switch (r.code) {
      case 'wrong_stance': return `Wymaga postawy: ${r.stances.map(s => pl.stance[s]).join(' lub ')}`;
      case 'insufficient_stamina': return `Brakuje wytrzymałości: ${r.missing}`;
      case 'on_cooldown': return `Dostępne od rundy ${r.availableRound}`;
      case 'requires_engagement': return 'Wymaga związania';
      case 'requires_near_ally': return 'Wymaga sojusznika Blisko';
      case 'must_disengage': return 'Najpierw wykonaj Odskok';
      case 'not_engaged': return 'Nie masz żadnych związań';
      case 'target_not_enemy': return 'Wybierz przeciwnika';
      case 'target_not_ally': return 'Wybierz sojusznika';
      case 'target_dead': return 'Cel jest wyeliminowany';
      case 'target_near': return 'Cel jest Blisko, nie w Zwarciu';
      case 'target_far': return 'Cel jest Daleko';
      case 'target_melee': return 'Już w Zwarciu';
      case 'approach_unneeded': return 'Już Blisko';
      case 'no_target': return 'Brak legalnego celu';
    }
  },
  cancel: r => ({ actor_dead: 'autor jest wyeliminowany', target_dead: 'cel jest wyeliminowany', not_engaged: 'brak Zwarcia', charge_failed: 'ruch Szarży się nie udał', shooter_engaged: 'strzelec jest związany' })[r],
  parse: p => {
    switch (p.code) {
      case 'not_json': return 'To nie jest poprawny JSON.';
      case 'too_large': return `Plik jest za duży (${Math.round(p.bytes / 1024)} KB, limit 1 MB).`;
      case 'rules_version': return `Zapis według innych reguł (${p.found}).`;
      case 'phase_not_importable': return `Nie można zaimportować walki w fazie ${p.phase}.`;
      case 'missing_field': return `Brak pola: ${p.field}.`;
      case 'unknown_profile': return `Nieznany profil: ${p.actorId}.`;
      case 'bad_engagement': return `Niepoprawne związanie ${p.pair}.`;
      case 'hp_out_of_range': return `Zdrowie poza zakresem: ${p.actorId}.`;
      case 'no_hero': return 'W walce brak bohatera.';
      case 'plan_target_unknown': return `Zamrożony plan ${p.actorId} wskazuje nieznanego uczestnika.`;
    }
  },
  ui: {
    eyebrow: 'SIMPLE-RPG-ENGINE / ARENA', banner: 'PROTOTYP · jednorazowy · stan w pamięci · prawdziwy resolver MVP 1.0 (kopia prototypowa)', round: (r, m) => `Runda ${r} / ${m}`,
    phase: { CHOOSE: 'Wybór', FINISHED: 'Koniec', RESOLVE: 'Rozstrzyganie' }, contextArena: 'Arena', contextScenario: 'Walka w Scenariuszu', language: 'Język',
    you: 'TWOJA POSTAĆ', hp: 'HP', stamina: 'wytrz.', armor: 'Pancerz', attack: 'Atak', defense: 'Obrona', prepared: r => `Przygotowanie: premia w rundzie ${r}`, notPrepared: 'Przygotowanie: nieaktywne',
    engagedWith: n => `Związany z: ${n}`, free: 'Wolny — możesz się przemieszczać', freeShort: 'Wolny', cooldowns: 'Odnowienie', allReady: 'Wszystkie karty gotowe', availableFrom: (a, r) => `${a}: od rundy ${r}`,
    intents: 'Jawne zamiary', slots: u => `${u}/2 miejsc ataku`, slot: 'Miejsce ataku', waiting: 'Czeka · ochrona 3', waitingWould: a => `chciał(a): ${a}`, self: 'na siebie', priority: p => `priorytet ${p}`,
    targetLegal: 'Legalny cel', pickTarget: 'Wybierz cel na liście zamiarów', eliminated: 'Wyeliminowany', companion: 'TOWARZYSZ', companionFrozen: 'PLAN ZAMROŻONY', companionLost: 'Wyeliminowany',
    companionLostScenario: 'Poległ(a) — nie wróci do tej rozgrywki', companionNone: 'Brak towarzysza',
    stanceStep: '01 / POSTAWA', actionStep: '02 / JEDNA KARTA LUB CZYNNOŚĆ', targetStep: '03 / CEL I ODLEGŁOŚCI', basicActions: 'Czynności podstawowe', movement: 'Ruch', costShort: c => `${c} wytrz.`,
    perspective: 'Odległości z perspektywy', perspectiveOf: n => n, relations: 'Relacje', groups: 'Grupy', groupLabel: g => `Grupa ${g}`,
    forecast: 'PROGNOZA RUNDY', forecastNone: 'Wybierz akcję, aby zobaczyć prognozę.', forecastIllegal: 'Tego wyboru nie można zatwierdzić', costNow: 'koszt teraz', regenEnd: 'na końcu rundy*',
    regenNote: '* Tylko jeśli walka trwa dalej. Przeglądanie wyborów nic nie kosztuje.', willHit: 'trafi', willMiss: 'chybi', expand: 'Liczby', queue: 'Kolejność ciosów', declarations: 'Deklaracje', moves: 'Ruch', after: 'Po rundzie',
    terminalCutoff: 'Tu walka się kończy — późniejsze ciosy nie nastąpią', noRegenTerminal: 'Brak regeneracji w rundzie kończącej',
    confirm: 'Rozegraj rundę', confirming: 'Rozstrzyganie…', surrender: 'Poddaj walkę', surrenderConfirm: 'Poddać walkę? Kończy się porażką bez dalszych ciosów.', surrenderScenario: 'Poddać walkę? Spotkanie przejdzie do wyniku „poddanie”; przeżyjesz.',
    cancel: 'Anuluj', yesSurrender: 'Tak, poddaj',
    log: 'Dziennik walki', logEmpty: 'Zamiary ujawnione. Oczekiwanie na Twój wybór.', replay: 'Odtwórz rundę', skip: 'Pomiń', step: (i, n) => `${i}/${n}`, showAll: 'Pokaż wszystko',
    noticeStale: 'Walka zmieniła się w innej karcie. Twój wybór nie został rozegrany; sprawdź bieżącą rundę.', noticeRejected: r => `Serwer odrzucił polecenie: ${r}. Nic nie zostało pobrane.`, dismiss: 'Zamknij',
    rejectedPhase: 'walka nie czeka na wybór', rejectedRound: 'dotyczyło innej rundy',
    serverMode: 'Następne zatwierdzenie (serwer prototypu)', serverAccept: 'przyjmij', serverStale: 'nieaktualny krok', serverReject: 'odrzuć (reguły)', serverSlow: 'wolno (2 s)',
    io: 'Plik zapisu', export: 'Eksportuj walkę (JSON)', download: 'Pobierz', copy: 'Kopiuj', copied: 'Skopiowano', import: 'Importuj walkę', importFile: 'Z pliku', importPaste: 'Wklej JSON', importGo: 'Importuj',
    importReplaceWarn: 'Trwa walka. Import ją zastąpi; bieżącej walki nie da się odzyskać.', importReplaceConfirm: 'Zastąp bieżącą walkę', importedBanner: 'Walka zaimportowana — wcześniejsza historia niezweryfikowana przez serwer', importIssues: 'Nie można zaimportować pliku:',
    finishedViewOnly: 'Zaimportowana zakończona walka — tylko podgląd', reload: 'Symuluj ponowne otwarcie zapisu', reloadDone: 'Otwarto z zapisu: ta sama runda, te same zamrożone zamiary.', unreadable: 'Nie można odczytać zapisanej walki na Arenie. Rozpocznij nową walkę.',
    resultTitle: 'Koniec walki', fightAgain: 'Walcz ponownie', restart: 'Zrestartuj tę walkę', restartUnavailable: 'Restart jest niedostępny dla zaimportowanej walki w toku.', continueOutcome: o => `Dalej — ${o}`,
    outcome: { victory: 'zwycięstwo', deathEnding: 'zakończenie: śmierć', surrender: 'wynik: poddanie', draw: 'wynik: remis' },
    inventory: 'Ekwipunek', inventoryDisabled: 'Niedostępny podczas walki', noRestartScenario: 'Walki w Scenariuszu nie można zrestartować. Możesz wyeksportować bieżący stan.', scenarioHpNote: hp => `Wejście z ranami: ${hp} z 40 HP przeniesione z rozgrywki.`,
    setup: 'Ustawienia Areny', preset: 'Zestaw', startFight: 'Rozpocznij walkę', offsets: 'Przesunięcia faz', offsetsOn: 'wróg n zaczyna od kroku n−1', state: 'Pełny stan prototypu',
    eventDeclare: (a, act, st, t) => `${a}: ${act} (${st})${t ? ` → ${t}` : ''}`, eventGuard: g => `ochrona ${g}`, eventExposed: 'Odsłonięcie (−2 obrony)', eventPreparedBonus: 'Premia Przygotowania pobrana',
    eventMove: (a, o, t) => `${a}: ${o}${t ? ` ${t}` : ''}`, moveOutcome: { joined: 'dołącza do grupy —', engaged: 'wiąże —', disengaged: 'odskakuje od wszystkich', withdrew: 'oddala się (Daleko)', no_change: 'już w grupie —', failed: 'ruch nieudany —' },
    eventAttack: (a, act, t) => `${a} — ${act} → ${t}`, eventRedirected: (p, w) => `Osłona: ${p} przejmuje atak na: ${w}`, eventCounter: 'Kontratak: parowanie 6', eventRiposte: 'Riposta',
    eventHit: (l, hp) => `−${l} HP → ${hp}`, hit: 'trafienie', eventMiss: 'pudło', eventEliminated: n => `Wyeliminowany: ${n}`, eventCancelled: (a, act, why) => `${a}: ${act} anulowane — ${why}`,
    eventRegen: (a, g, s) => `${a}: +${g} wytrz. → ${s}`, eventResult: r => `Wynik: ${r}`,
    math: { attack: 'Atak', defense: 'Obrona', skill: 'umiejętność', stanceMod: 'postawa', card: 'karta', preparedAcc: 'Przygotowanie', base: 'baza', feintIgnores: 'Zwód pomija premię postawy', exposed: 'odsłonięcie', raw: 'Surowe', power: 'siła', preparedDmg: 'Przygotowanie', parry: 'parowanie', armorRed: 'pancerz', guardAbs: b => `ochrona (z ${b})`, feintGuard: 'Zwód pomija ochronę', hpLoss: 'Utrata HP' },
    hpDelta: (f, t) => (f === t ? `${t}` : `${f} → ${t}`), staminaDelta: (f, t) => (f === t ? `${t}` : `${f} → ${t}`), engagementsAfter: 'Związania po rundzie', none: 'brak',
  },
};

export const TEXT: Record<Lang, Text> = { en, pl };
