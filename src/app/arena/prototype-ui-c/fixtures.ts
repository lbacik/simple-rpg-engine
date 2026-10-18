// THROWAWAY: setups (MVP 15.2 presets T1–T7, one Scenario Encounter) and the
// review states the bottom bar cycles through. Every state is reached by playing
// commands through the prototype resolver, never hand-built, so the UI is judged
// on output the rules can actually produce.
import {
  companion, initialState, planRound, resolveRound, alive,
  type CombatEvent, type CombatState, type Command, type Setup, type Stance, type ActionId,
} from './engine';

export type PresetId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7';
const raider = (engaged: boolean, group: 'hero' | 'far' = 'hero') => ({ profileId: 'raider' as const, ref: 'raider', group, engaged });
export const PRESETS: Record<PresetId, Setup> = {
  T1: { enemies: [{ profileId: 'brute', ref: 'brute', group: 'hero', engaged: true }], companion: null },
  T2: { enemies: [{ profileId: 'sentinel', ref: 'sentinel', group: 'hero', engaged: true }], companion: null },
  T3: { enemies: [raider(true), raider(true), raider(true)], companion: null },
  T4: { enemies: [raider(true), { profileId: 'archer', ref: 'archer', group: 'far', engaged: false }], companion: null },
  T5: { enemies: [{ profileId: 'archer', ref: 'archer', group: 'far', engaged: false }], companion: null },
  T6: { enemies: [raider(true), raider(true), { profileId: 'archer', ref: 'archer', group: 'far', engaged: false }], companion: { profileId: 'partySentinel', ref: 'party-sentinel' } },
  T7: {
    enemies: [raider(true), raider(true), { profileId: 'sentinel', ref: 'sentinel', group: 'hero', engaged: false }, { profileId: 'archer', ref: 'archer', group: 'far', engaged: false }, { profileId: 'archer', ref: 'archer', group: 'far', engaged: false }],
    companion: { profileId: 'partyArcher', ref: 'party-archer' },
  },
};
export const PRESET_LABEL: Record<PresetId, { en: string; pl: string }> = {
  T1: { en: 'T1 · Duel with a Brute', pl: 'T1 · Pojedynek z Osiłkiem' },
  T2: { en: 'T2 · Sentinel duel', pl: 'T2 · Pojedynek ze Strażnikiem' },
  T3: { en: 'T3 · Three Raiders', pl: 'T3 · Trzech Bandytów' },
  T4: { en: 'T4 · Raider and a distant Archer', pl: 'T4 · Bandyta i odległy Łucznik' },
  T5: { en: 'T5 · Reach the Archer', pl: 'T5 · Dotrzeć do Łucznika' },
  T6: { en: 'T6 · Party Sentinel and Cover', pl: 'T6 · Strażnik drużyny i Osłona' },
  T7: { en: 'T7 · Five enemies and a companion', pl: 'T7 · Pięciu wrogów i towarzysz' },
};
export function withOffsets(setup: Setup): Setup {
  return { ...setup, enemies: setup.enemies.map((e, i) => ({ ...e, phaseOffset: i })) };
}

// The Frost Cairn, `harek-and-guard` after content migration (#184): startRange far,
// Astrid as the party-sentinel Companion, the hero entering below 40 HP (#183).
export const SCENARIO_SETUP: Setup = {
  heroHp: 27,
  enemies: [
    { profileId: 'brute', ref: 'jarl-harek', group: 'far', engaged: false },
    { profileId: 'sentinel', ref: 'draugr-sentry', group: 'far', engaged: false },
  ],
  companion: { profileId: 'partySentinel', ref: 'astrid' },
};
export const SCENARIO_NAMES: Record<string, { en: string; pl: string }> = {
  'jarl-harek': { en: 'Jarl Harek Iron-Tooth', pl: 'Jarl Harek Żelaznozęby' },
  'draugr-sentry': { en: 'Draugr Sentry', pl: 'Strażnik draugrów' },
  astrid: { en: 'Astrid the Skald', pl: 'Astrid, skaldka' },
};
export const SCENARIO_TITLE = { en: 'The Frost Cairn · Harek and his guard', pl: 'Kurhan Mrozu · Harek i jego straż' };

// ---------- scripted play ----------
type Step = Omit<Command, 'round'> | { policy: (s: CombatState) => Omit<Command, 'round'>; until: (s: CombatState) => boolean; max?: number };
export type RoundRecord = { round: number; command: Command; events: CombatEvent[] };
export type Played = { state: CombatState; history: RoundRecord[] };

export function play(setup: Setup, steps: Step[]): Played {
  let state = planRound(initialState(setup));
  const history: RoundRecord[] = [];
  const apply = (c: Omit<Command, 'round'>) => {
    const command = { ...c, round: state.round };
    const r = resolveRound(state, command);
    if ('code' in r) throw new Error(`fixture command rejected: ${JSON.stringify({ command, r })}`);
    history.push({ round: command.round, command, events: r.events });
    state = r.state;
  };
  for (const step of steps) {
    if ('policy' in step) {
      for (let i = 0; i < (step.max ?? 30) && !state.result && !step.until(state); i++) apply(step.policy(state));
    } else apply(step);
  }
  return { state, history };
}

const cmd = (stance: Stance, actionId: ActionId, targetId: string | null): Omit<Command, 'round'> => ({ stance, actionId, targetId });
const braceD = () => cmd('defensive', 'brace', 'h01');

// ---------- review states ----------
export type Context = 'arena' | 'scenario';
export type Notice = 'stale' | 'rejected' | 'unreadable' | null;
export type ReviewState = {
  key: string; label: string; context: Context; preset: PresetId | null; offsets?: boolean;
  played: () => Played; origin: 'setup' | 'import'; importedFrom?: 'PLAN' | 'CHOOSE' | 'FINISHED';
  notice?: Notice; panel?: 'import' | 'export' | 'surrender' | 'setup'; importDraft?: string; note: string;
};

const T = (p: PresetId) => PRESETS[p];
export const REVIEW_STATES: ReviewState[] = [
  { key: 't1-r1', label: 'T1 · round 1', context: 'arena', preset: 'T1', origin: 'setup', played: () => play(T('T1'), []), note: 'Duel opening: Brute announces Heavy Blow A. Try Counterattack D (reference 11.1) and expand the riposte numbers.' },
  { key: 't1-r3', label: 'T1 · round 3 terminal', context: 'arena', preset: 'T1', origin: 'setup', played: () => play(T('T1'), [cmd('defensive', 'counter', 'h01'), cmd('balanced', 'feint', 'e01')]), note: 'Reference 11.1 round 3: the Brute announces Strike B with Prepare. Choose Heavy Blow A: the Brute strikes first (priority 20 before 10), then your blow ends the fight; no regeneration.' },
  { key: 't3-r2', label: 'T3 · slot rotation', context: 'arena', preset: 'T3', origin: 'setup', played: () => play(T('T3'), [cmd('defensive', 'counter', 'h01')]), note: 'Reference 11.3 round 2: e03 takes a slot through wait age, e02 waits with guard 3. Counterattack is disabled until round 3. Strike A on e01 kills it; its slot is not refilled.' },
  { key: 't4-r1', label: 'T4 · engaged + archer Far', context: 'arena', preset: 'T4', origin: 'setup', played: () => play(T('T4'), []), note: 'Approach / Charge / Withdraw disabled with “Disengage first”. The Archer shoots from Far; Disengage costs 1.' },
  { key: 't5-r1', label: 'T5 · Far start', context: 'arena', preset: 'T5', origin: 'setup', played: () => play(T('T5'), []), note: 'Reference 11.4: melee cards disabled (“The target is Far”). Approach D joins the Archer group.' },
  { key: 't5-r2', label: 'T5 · Charge cancels Shot', context: 'arena', preset: 'T5', origin: 'setup', played: () => play(T('T5'), [cmd('defensive', 'approach', 'e01')]), note: 'Choose Charge A on the Archer: the forecast shows the engagement first and the announced Shot cancelled.' },
  { key: 't6-r1', label: 'T6 · Party Sentinel covers', context: 'arena', preset: 'T6', origin: 'setup', played: () => play(T('T6'), []), note: 'The companion covers you. Compare Counterattack (yours, parry + riposte) with Cover (companion takes the first attack). Use the relations panel from the companion view.' },
  { key: 't7-r1', label: 'T7 · five enemies + companion', context: 'arena', preset: 'T7', origin: 'setup', played: () => play(T('T7'), []), note: 'Information load: five intents, three Waiting or self actions, two slots. Check narrow width: intents must stay above the card choice.' },
  { key: 't7-r4', label: 'T7 · mid-fight', context: 'arena', preset: 'T7', origin: 'setup', played: () => play(T('T7'), [cmd('defensive', 'counter', 'h01'), cmd('balanced', 'feint', 'e01'), cmd('balanced', 'strike', 'e02')]), note: 'Round 4: one Raider down, the hero badly wounded (8 HP), both Archers now hold the slots. Low-HP presentation and a longer log.' },
  { key: 't2-stamina', label: 'T2 · low stamina', context: 'arena', preset: 'T2', origin: 'setup', played: () => play(T('T2'), [cmd('balanced', 'heavy', 'e01'), cmd('balanced', 'counter', 'h01'), cmd('balanced', 'heavy', 'e01'), cmd('balanced', 'counter', 'h01'), cmd('balanced', 'heavy', 'e01')]), note: 'Stamina drained by alternating Heavy Blow and Counterattack: “Missing N stamina” and cooldown reasons side by side.' },
  { key: 't1-win', label: 'T1 · victory', context: 'arena', preset: 'T1', origin: 'setup', played: () => play(T('T1'), [cmd('defensive', 'counter', 'h01'), cmd('balanced', 'feint', 'e01'), cmd('aggressive', 'heavy', 'e01')]), note: 'Result screen: Fight again, Restart, export. Temporary effects are not shown as active.' },
  { key: 't3-loss', label: 'T3 · defeat', context: 'arena', preset: 'T3', origin: 'setup', played: () => play(T('T3'), [{ policy: () => cmd('aggressive', 'brace', 'h01'), until: () => false }]), note: 'Bracing in Aggressive until death: LOSS and the terminal cutoff in the last round.' },
  { key: 'stale', label: 'Stale command', context: 'arena', preset: 'T3', origin: 'setup', notice: 'stale', played: () => play(T('T3'), []), note: 'The server rejected the command because the step moved on (another tab). Nothing was paid.' },
  { key: 'rejected', label: 'Rejected command', context: 'arena', preset: 'T1', origin: 'setup', notice: 'rejected', played: () => play(T('T1'), []), note: '?notice=rejected renders the reason code. Use the prototype server control to trigger any outcome on the next commit.' },
  { key: 'import', label: 'Import over a fight', context: 'arena', preset: 'T1', origin: 'setup', panel: 'import', importDraft: '{"rulesVersion":"simple-rpg-engine-stance-cards-0.9","round":2,"phase":"RESOLVE","actors":[],"engagements":[],"frozenEnemyPlans":[]}', played: () => play(T('T1'), [cmd('defensive', 'counter', 'h01')]), note: 'Import while a fight runs: in-page replace confirmation, file and paste inputs, ParseIssue codes rendered.' },
  { key: 'imported', label: 'Imported mid-fight', context: 'arena', preset: null, origin: 'import', importedFrom: 'CHOOSE', played: () => play(T('T6'), [braceD(), braceD()]), note: 'origin: import — history not verified; Restart unavailable (CHOOSE import); Fight again unavailable (no remembered Setup).' },
  { key: 'reload', label: 'Planned-state restore', context: 'arena', preset: 'T7', origin: 'setup', played: () => play(T('T7'), [cmd('aggressive', 'strike', 'e01')]), note: 'Use “Simulate reopening the save”: the round and frozen intents must come back identical.' },
  { key: 'unreadable', label: 'Unreadable save', context: 'arena', preset: 'T1', origin: 'setup', notice: 'unreadable', panel: 'setup', played: () => play(T('T1'), []), note: 'The saved Arena fight could not be read: notice plus the Setup form.' },
  { key: 'sc-r1', label: 'Scenario · Harek (Far, 27 HP)', context: 'scenario', preset: null, origin: 'setup', played: () => play(SCENARIO_SETUP, []), note: 'Scenario Combat: entering wounded (27/40), Astrid in c01, startRange far, inventory disabled, no Restart.' },
  { key: 'sc-astrid', label: 'Scenario · Astrid slain', context: 'scenario', preset: null, origin: 'setup', played: () => play(SCENARIO_SETUP, [{ policy: () => braceD(), until: s => !alive(companion(s)) }]), note: 'Bracing in Defensive while Astrid keeps covering you: she falls in round 21. Permanent Companion loss presentation inside the fight.' },
  { key: 'sc-surrender', label: 'Scenario · surrender', context: 'scenario', preset: null, origin: 'setup', panel: 'surrender', played: () => play(SCENARIO_SETUP, [cmd('defensive', 'approach', 'e01')]), note: 'In-page surrender confirmation; routes to the Encounter `surrender` Outcome, the Character survives.' },
  { key: 'sc-draw', label: 'Scenario · draw (30 rounds)', context: 'scenario', preset: null, origin: 'setup', played: () => play({ heroHp: 31, enemies: [{ profileId: 'sentinel', ref: 'draugr-sentry', group: 'hero', engaged: true }], companion: null }, [{ policy: () => braceD(), until: () => false }]), note: 'DRAW_LIMIT routes to the `draw` Outcome. Bracing in Defensive never gets hit by a Sentinel, so the limit is reached.' },
];
