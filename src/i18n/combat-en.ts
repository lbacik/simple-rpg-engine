// Combat Interface Text: the English catalogue slice shipped to the browser
// (ADR 0011). It covers every listOptions reason code, every core event type,
// Combat results, Arena/Combat notices, every ParseIssue and every Arena
// import-envelope issue, plus the names of the Combat vocabulary the command
// panel renders (actions, stances, ranges). The `CombatCatalogue` type is this
// module's shape; `combat-pl.ts` is declared as one, so a missing key or a
// wrong signature fails `tsc`, and `combat.ts` additionally asserts the keys
// match the core unions (ReasonCode, CombatEventType, CombatResult,
// ParseIssueCode, ArenaRunIssueCode, ActionId, Stance, Range).
//
// The engine still emits structured values only, never sentences: each event
// carries every id and number its message needs, and actor ids read as labels
// after a colon, where English needs no inflection. Counts use the language's
// plural forms and every number is formatted with `Intl`.
//
// Framework-free and client-safe: this module imports no Next.js, React,
// persistence, content or engine runtime code (types from the engine
// excepted), and never `server-only`, so client components can import it
// without pulling the server-side catalogue.

import type {
  ActionId,
  ActorId,
  ArenaRunIssueCode,
  CancelReason,
  CombatEventType,
  CombatResult,
  ParseIssueCode,
  Range,
  ReasonCode,
  Stance,
} from '../engine/combat';
import { formatNumber } from './format';
import type { InterfaceLanguage } from './languages';
import { selectPlural } from './plural';

const whole = (value: number): string => formatNumber('en', value);

/** Damage amounts: "1 damage", "3 damage" (English never inflects the noun). */
const damageText = (amount: number): string =>
  selectPlural('en', amount, {
    one: '1 damage',
    other: `${formatNumber('en', amount)} damage`,
  });

/** One reason line per listOptions reason code (rules §14.2, combat-contract.md). */
export interface CombatReasons {
  insufficient_stamina: (missing: number) => string;
  on_cooldown: (availableRound: number) => string;
  stance_disallows: string;
  no_shot_ability: string;
  not_engaged: string;
  must_disengage: string;
  actor_engaged: string;
  target_far: string;
  target_not_near: string;
  requires_near_ally: string;
  invalid_target: string;
  wrong_round: string;
  wrong_phase: string;
  'in-combat': string;
}

export interface BlowParams {
  actor: ActorId;
  target: ActorId;
  recipient: ActorId;
  redirected: boolean;
  counter: boolean;
  range: string;
  attackScore: number;
  defenseScore: number;
  hit: boolean;
  raw: number;
  parry: number;
  armor: number;
  absorbed: number;
  hpLoss: number;
}

/** One forecast/log line per core event type (combat-contract.md). */
export interface CombatEvents {
  'round-planned': (params: {
    actor: ActorId;
    action: string;
    stance: string;
    attackSlot: boolean;
    wasCandidate: boolean;
    baseDamage: number;
    priority: number;
    target: ActorId | null;
  }) => string;
  declared: (params: {
    actor: ActorId;
    action: string;
    stance: string;
    cost: number;
    preparedAccuracy: number;
    preparedDamage: number;
    target: ActorId | null;
  }) => string;
  'effect-established': (params: {
    actor: ActorId;
    action: string;
    guard: number;
    exposed: boolean;
    counter: boolean;
    ward: ActorId | null;
    readyRound: number | null;
  }) => string;
  moved: (params: {
    actor: ActorId;
    action: string;
    target: ActorId | null;
    success: boolean;
    detail: string | null;
  }) => string;
  attack: (params: BlowParams) => string;
  riposte: (params: BlowParams) => string;
  cancelled: (params: { actor: ActorId; target: ActorId | null; reason: string }) => string;
  eliminated: (actor: ActorId) => string;
  regenerated: (params: { actor: ActorId; gain: number; stamina: number }) => string;
  'wait-age-updated': (params: { actor: ActorId; waitAge: number }) => string;
  finished: (params: { result: CombatResult; round: number }) => string;
}

export type CombatResults = Record<CombatResult, string>;

/** In-page banners and confirmations, never browser dialogs (ADR 0011). */
export interface CombatNotices {
  stale: string;
  rejected: (reason: string) => string;
  unreadable: string;
  importUnverified: string;
}

/** One line per strict-parser issue code (rules §12). */
export interface CombatParseIssues {
  bad_rules_version: (actual: string) => string;
  unexpected_state_version: string;
  bad_round: string;
  bad_phase: string;
  bad_result: string;
  finished_without_result: string;
  result_before_finish: string;
  bad_next_group_serial: string;
  bad_actors: string;
  duplicate_actor_id: (id: string) => string;
  bad_actor_id: (id: string) => string;
  unknown_profile: (params: { id: string; profileId: string }) => string;
  bad_team_role: (id: string) => string;
  bad_stance: (id: string) => string;
  bad_group_id: (id: string) => string;
  hp_out_of_range: (params: { id: string; max: number }) => string;
  bad_stamina: (id: string) => string;
  bad_ready_round: (id: string) => string;
  bad_available_round: (id: string) => string;
  bad_power: (id: string) => string;
  bad_phase_offset: (id: string) => string;
  bad_wait_age: (id: string) => string;
  missing_hero: string;
  too_many_companions: (count: number) => string;
  bad_enemy_count: (count: number) => string;
  bad_state: string;
  bad_ref: (id: string) => string;
  bad_profile_role: (id: string) => string;
  no_living_hero: string;
  no_living_enemies: string;
  bad_engagements: string;
  bad_engagement: (params: { a: string; b: string; reason: string }) => string;
  bad_frozen_plans: string;
  bad_frozen_plan: (reason: string) => string;
  bad_log: string;
}

/** One line per Arena import-envelope issue code (combat-contract.md). */
export type CombatImportIssues = Record<ArenaRunIssueCode, string>;

/** One line per halt code for a planned blow or move that never resolved. */
export type CombatCancelReasons = Record<CancelReason, string>;

/**
 * Command-panel chrome (rules §14.1, handoff U2–U4/U8): headings, slot badges,
 * forecast section labels, the terminal-cutoff and no-regeneration lines, and
 * the Confirm/Surrender buttons. Blow-by-blow arithmetic keeps the
 * `events.attack`/`events.riposte` formatters above; this section only frames
 * the panel around them.
 */
export interface CombatPanelText {
  heroHeading: string;
  companionHeading: string;
  intentsHeading: string;
  slotsLine: (used: number, budget: number) => string;
  slotAttack: string;
  slotWaiting: (guard: number) => string;
  slotWould: (action: string) => string;
  roundLine: (round: number) => string;
  stanceHeading: string;
  cardsHeading: string;
  basicHeading: string;
  movementHeading: string;
  targetHeading: string;
  perspectiveHeading: string;
  legalTarget: string;
  chooseTargetHint: string;
  noTargets: string;
  engagedWith: (names: string) => string;
  free: string;
  prepared: (round: number) => string;
  notPrepared: string;
  cooldowns: string;
  availableFrom: (action: string, round: number) => string;
  allReady: string;
  armorLine: (value: number) => string;
  priorityLine: (priority: number) => string;
  costLine: (cost: number) => string;
  selfWord: string;
  eliminated: string;
  hpLine: (value: number, max: number) => string;
  staminaLine: (value: number, max: number) => string;
  forecastHeading: string;
  forecastNone: string;
  forecastBlocked: string;
  blowsHeading: string;
  afterHeading: string;
  regenHeading: string;
  coverTag: (protector: string, ward: string) => string;
  counterTag: string;
  riposteTag: string;
  cutoffLine: (blows: string) => string;
  noRegeneration: string;
  engagementsAfter: (pairs: string) => string;
  engagementsNone: string;
  moveVariant: Record<'JOIN' | 'ENGAGE', string>;
  moveGroup: (group: string) => string;
  blowSummary: (params: { actor: string; target: string; hit: boolean; hpLoss: number }) => string;
  confirm: string;
  surrender: string;
  resultHeading: string;
}

const reasons: CombatReasons = {
  insufficient_stamina: (missing) => `Missing ${whole(missing)} stamina`,
  on_cooldown: (availableRound) => `Available from round ${whole(availableRound)}`,
  stance_disallows: 'This stance disallows that action.',
  no_shot_ability: 'The hero cannot shoot.',
  not_engaged: 'Requires an engagement.',
  must_disengage: 'Disengage first',
  actor_engaged: 'You are engaged.',
  target_far: 'The target is Far',
  target_not_near: 'The target is not Near.',
  requires_near_ally: 'Requires an ally that is Near',
  invalid_target: 'Invalid target.',
  wrong_round: 'That round already passed.',
  wrong_phase: 'Wrong phase.',
  'in-combat': 'Unavailable during Combat.',
};

function blowLine(kind: string, params: BlowParams): string {
  const outcome = params.hit
    ? `hit, ${damageText(params.hpLoss)}`
    : 'miss';
  const redirect = params.redirected ? ` (redirected to ${params.recipient})` : '';
  const counter = params.counter ? ' · counter triggered' : '';
  return (
    `${kind}: ${params.actor} → ${params.target}${redirect}` +
    ` · ${whole(params.attackScore)} vs ${whole(params.defenseScore)} — ${outcome}` +
    ` · raw ${whole(params.raw)} − parry ${whole(params.parry)} − armor ${whole(params.armor)}` +
    ` − absorbed ${whole(params.absorbed)}${counter}`
  );
}

const resultName: CombatResults = {
  WIN: 'Victory',
  LOSS: 'Defeat',
  LOSS_SURRENDER: 'Surrender',
  DRAW_LIMIT: 'Draw after 30 rounds',
};

const events: CombatEvents = {
  'round-planned': (params) =>
    `Planned: ${params.actor}: ${params.action} (${params.stance})` +
    (params.target === null ? '' : ` → ${params.target}`) +
    (params.attackSlot ? ' · attack slot' : '') +
    (params.wasCandidate && !params.attackSlot ? ' · waiting' : '') +
    ` · base ${whole(params.baseDamage)}, priority ${whole(params.priority)}`,
  declared: (params) =>
    `Declared: ${params.actor}: ${params.action} (${params.stance})` +
    (params.target === null ? '' : ` → ${params.target}`) +
    ` · cost ${whole(params.cost)}` +
    (params.preparedAccuracy > 0 || params.preparedDamage > 0
      ? ` · prepared +${whole(params.preparedAccuracy)} accuracy, +${whole(params.preparedDamage)} damage`
      : ''),
  'effect-established': (params) => {
    const parts: string[] = [`Established: ${params.actor}: ${params.action}`];
    if (params.guard > 0) parts.push(`guard ${whole(params.guard)}`);
    if (params.exposed) parts.push('exposed');
    if (params.counter) parts.push('counter');
    if (params.ward !== null) parts.push(`covering ${params.ward}`);
    if (params.readyRound !== null) parts.push(`prepared for round ${whole(params.readyRound)}`);
    return parts.join(' · ');
  },
  moved: (params) =>
    params.success
      ? `Moved: ${params.actor}: ${params.action}` +
        (params.target === null ? '' : ` → ${params.target}`) +
        (params.detail === null ? '' : ` (${params.detail})`)
      : `Move failed: ${params.actor}: ${params.action}` +
        (params.target === null ? '' : ` → ${params.target}`) +
        (params.detail === null ? '' : ` — ${params.detail}`),
  attack: (params) => blowLine('Attack', params),
  riposte: (params) => blowLine('Riposte', params),
  cancelled: (params) =>
    `Cancelled: ${params.actor}` +
    (params.target === null ? '' : ` → ${params.target}`) +
    ` — ${params.reason}.`,
  eliminated: (actor) => `Eliminated: ${actor}.`,
  regenerated: (params) =>
    `Regenerated: ${params.actor} +${whole(params.gain)} stamina (${whole(params.stamina)}).`,
  'wait-age-updated': (params) => `Waiting: ${params.actor} (${whole(params.waitAge)}).`,
  finished: (params) => `Finished: ${resultName[params.result]} · round ${whole(params.round)}.`,
};

const notices: CombatNotices = {
  stale: 'The game was advanced in another tab; this is its current state.',
  rejected: (reason) => `Command rejected: ${reason}.`,
  unreadable: 'This saved fight cannot be read. Start a new setup or import a fight.',
  importUnverified: 'Imported history is not verified.',
};

const parseIssues: CombatParseIssues = {
  bad_rules_version: (actual) => `Unknown rules version: ${actual}.`,
  unexpected_state_version: 'The save uses a retired state version and cannot be read.',
  bad_round: 'Bad round number.',
  bad_phase: 'Bad phase.',
  bad_result: 'Bad result.',
  finished_without_result: 'A finished fight needs a result.',
  result_before_finish: 'Only a finished fight carries a result.',
  bad_next_group_serial: 'Bad group serial.',
  bad_actors: 'Bad actor list.',
  duplicate_actor_id: (id) => `Duplicate actor id: ${id}.`,
  bad_actor_id: (id) => `Bad actor id: ${id}.`,
  unknown_profile: (params) => `Unknown profile: ${params.profileId} (${params.id}).`,
  bad_team_role: (id) => `Team and role disagree: ${id}.`,
  bad_stance: (id) => `Bad stance: ${id}.`,
  bad_group_id: (id) => `Bad group: ${id}.`,
  hp_out_of_range: (params) => `Health out of range: ${params.id} (max ${whole(params.max)}).`,
  bad_stamina: (id) => `Bad stamina: ${id}.`,
  bad_ready_round: (id) => `Bad ready round: ${id}.`,
  bad_available_round: (id) => `Bad cooldown: ${id}.`,
  bad_power: (id) => `Bad power: ${id}.`,
  bad_phase_offset: (id) => `Bad phase offset: ${id}.`,
  bad_wait_age: (id) => `Bad wait age: ${id}.`,
  missing_hero: 'The fight needs exactly one hero.',
  too_many_companions: (count) => `Too many companions: ${whole(count)}.`,
  bad_enemy_count: (count) => `Enemy count out of range: ${whole(count)}.`,
  bad_state: 'Not a readable fight.',
  bad_ref: (id) => `Bad reference: ${id}.`,
  bad_profile_role: (id) => `Profile and role disagree: ${id}.`,
  no_living_hero: 'No living hero.',
  no_living_enemies: 'No living enemies.',
  bad_engagements: 'Bad engagement list.',
  bad_engagement: (params) => `Bad engagement: ${params.a}–${params.b} (${params.reason}).`,
  bad_frozen_plans: 'Bad frozen plans.',
  bad_frozen_plan: (reason) => `Bad frozen plan (${reason}).`,
  bad_log: 'Bad fight log.',
};

const importIssues: CombatImportIssues = {
  malformed: 'Not a readable import.',
  unknown_schema_version: 'Unknown save version.',
  unexpected_state_version: 'The save uses a retired state version and cannot be read.',
  bad_origin: 'Bad save origin.',
  bad_setup: 'Bad remembered setup.',
  bad_initial: 'Bad initial fight.',
};

const cancelReasons: CombatCancelReasons = {
  actor_or_target_dead: 'Attacker or target is out of the fight.',
  range_lost: 'No longer in Melee with the target.',
  charge_failed: 'The Charge never engaged.',
  shooter_engaged: 'The shooter is engaged.',
  target_dead: 'The target is out of the fight.',
};

const panel: CombatPanelText = {
  heroHeading: 'Your character',
  companionHeading: 'Companion',
  intentsHeading: 'Open intents',
  slotsLine: (used, budget) => `${whole(used)}/${whole(budget)} attack slots`,
  slotAttack: 'Attack slot',
  slotWaiting: (guard) => `Waiting · guard ${whole(guard)}`,
  slotWould: (action) => `would ${action}`,
  roundLine: (round) => `Round ${whole(round)}`,
  stanceHeading: 'Stance',
  cardsHeading: 'Card or action',
  basicHeading: 'Basic actions',
  movementHeading: 'Movement',
  targetHeading: 'Target',
  perspectiveHeading: 'Ranges from the view of',
  legalTarget: 'Legal target',
  chooseTargetHint: 'Choose the target in the intents list.',
  noTargets: 'No legal target.',
  engagedWith: (names) => `Engaged with: ${names}`,
  free: 'Free',
  prepared: (round) => `Prepared: bonus in round ${whole(round)}`,
  notPrepared: 'Prepare: inactive',
  cooldowns: 'Cooldowns',
  availableFrom: (action, round) => `${action}: from round ${whole(round)}`,
  allReady: 'All cards ready',
  armorLine: (value) => `Armor ${whole(value)}`,
  priorityLine: (priority) => `priority ${whole(priority)}`,
  costLine: (cost) => `${whole(cost)} st.`,
  selfWord: 'self',
  eliminated: 'Out of the fight',
  hpLine: (value, max) => `HP ${whole(value)} / ${whole(max)}`,
  staminaLine: (value, max) => `${whole(value)} / ${whole(max)} stamina`,
  forecastHeading: 'Round forecast',
  forecastNone: 'Choose a card to see the forecast.',
  forecastBlocked: 'This choice cannot be confirmed.',
  blowsHeading: 'Blow order',
  afterHeading: 'After the round',
  regenHeading: 'Regeneration',
  coverTag: (protector, ward) => `Cover: ${protector} takes the attack meant for ${ward}`,
  counterTag: 'Counter: parry 6',
  riposteTag: 'Riposte',
  cutoffLine: (blows) => `The fight ends here — these blows do not happen: ${blows}.`,
  noRegeneration: 'No regeneration in a terminal round.',
  engagementsAfter: (pairs) => `Engagements after: ${pairs}`,
  engagementsNone: 'none',
  moveVariant: { JOIN: 'join', ENGAGE: 'engage' },
  moveGroup: (group) => `group ${group}`,
  blowSummary: (params) =>
    params.hit
      ? `${params.actor} → ${params.target} · hit · −${whole(params.hpLoss)} HP`
      : `${params.actor} → ${params.target} · miss`,
  confirm: 'Play round',
  surrender: 'Surrender',
  resultHeading: 'Fight over',
};

const actions: Record<ActionId, string> = {
  heavy: 'Heavy blow',
  counter: 'Counter',
  feint: 'Feint',
  cover: 'Cover',
  charge: 'Charge',
  prepare: 'Prepare',
  strike: 'Strike',
  brace: 'Brace',
  shot: 'Shot',
  approach: 'Approach',
  disengage: 'Disengage',
  withdraw: 'Withdraw',
  wait: 'Wait',
};

const stances: Record<Stance, string> = {
  aggressive: 'Aggressive',
  balanced: 'Balanced',
  defensive: 'Defensive',
};

const ranges: Record<Range, string> = {
  self: 'Self',
  melee: 'Melee',
  near: 'Near',
  far: 'Far',
};

export const combatEn = {
  code: 'en' as InterfaceLanguage,
  reasons,
  events,
  results: resultName,
  notices,
  parseIssues,
  importIssues,
  cancelReasons,
  panel,
  actions,
  stances,
  ranges,
};

export type CombatCatalogue = typeof combatEn;

// Key-equality guards: each slice section covers exactly its core union, so a
// missing or extra key fails typecheck here (and in `pl` through the
// `CombatCatalogue` annotation).
type KeysEqual<A extends string, B extends string> = Exclude<A, B> extends never
  ? Exclude<B, A> extends never
    ? true
    : false
  : false;

const reasonsKeys: KeysEqual<ReasonCode, keyof CombatReasons> = true;
const eventsKeys: KeysEqual<CombatEventType, keyof CombatEvents> = true;
const resultsKeys: KeysEqual<CombatResult, keyof CombatResults> = true;
const parseIssuesKeys: KeysEqual<ParseIssueCode, keyof CombatParseIssues> = true;
const importIssuesKeys: KeysEqual<ArenaRunIssueCode, keyof CombatImportIssues> = true;
const cancelReasonsKeys: KeysEqual<CancelReason, keyof CombatCancelReasons> = true;
const actionsKeys: KeysEqual<ActionId, keyof typeof actions> = true;
const stancesKeys: KeysEqual<Stance, keyof typeof stances> = true;
const rangesKeys: KeysEqual<Range, keyof typeof ranges> = true;

void reasonsKeys;
void eventsKeys;
void resultsKeys;
void parseIssuesKeys;
void importIssuesKeys;
void cancelReasonsKeys;
void actionsKeys;
void stancesKeys;
void rangesKeys;
