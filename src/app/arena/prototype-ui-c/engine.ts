// THROWAWAY: a prototype-only resolver for simple-rpg-engine MVP 1.0 combat
// (docs/sources/combat-mvp-1.0/rules.md, sections 3–10 and 13). It exists so the
// UI C prototype renders real resolver output; it is not the production core
// decided in #181 and must be rewritten, with tests, in src/engine/combat/.

export type Stance = 'aggressive' | 'balanced' | 'defensive';
export type ActionId =
  | 'heavy' | 'counter' | 'feint' | 'cover' | 'charge' | 'prepare'
  | 'strike' | 'brace' | 'approach' | 'disengage' | 'withdraw' | 'shot' | 'wait';
export type ProfileId = 'hero' | 'raider' | 'brute' | 'sentinel' | 'archer' | 'partySentinel' | 'partyArcher';
export type Range = 'self' | 'melee' | 'near' | 'far';
export type Phase = 'PLAN' | 'CHOOSE' | 'RESOLVE' | 'FINISHED';
export type Result = 'WIN' | 'LOSS' | 'LOSS_SURRENDER' | 'DRAW_LIMIT';
export type Role = 'hero' | 'companion' | 'enemy';

export const RULES_VERSION = 'simple-rpg-engine-stance-cards-1.0';
export const ROUND_LIMIT = 30;

type CycleEntry = { action: 'strike' | 'heavy' | 'brace' | 'prepare' | 'shot'; stance: Stance };
export type Profile = {
  hp: number; stamina: number | null; skill: number; defense: number; armor: number; power: number;
  strike: number; heavy: number | null; shot: number | null; cycle: CycleEntry[]; actions: ActionId[];
};

const S = (s: Stance) => ({ action: 'strike', stance: s }) as CycleEntry;
const H = (s: Stance) => ({ action: 'heavy', stance: s }) as CycleEntry;
const B = (s: Stance) => ({ action: 'brace', stance: s }) as CycleEntry;
const P = (s: Stance) => ({ action: 'prepare', stance: s }) as CycleEntry;
const R = (s: Stance) => ({ action: 'shot', stance: s }) as CycleEntry;
const HERO_ACTIONS: ActionId[] = ['heavy', 'counter', 'feint', 'cover', 'charge', 'prepare', 'strike', 'brace', 'approach', 'disengage', 'withdraw'];

export const PROFILES: Record<ProfileId, Profile> = {
  hero: { hp: 40, stamina: 10, skill: 4, defense: 4, armor: 1, power: 0, strike: 8, heavy: 13, shot: null, cycle: [], actions: HERO_ACTIONS },
  raider: { hp: 14, stamina: null, skill: 4, defense: 4, armor: 0, power: 0, strike: 7, heavy: 12, shot: null, cycle: [S('aggressive'), H('aggressive'), S('balanced'), B('defensive')], actions: [] },
  brute: { hp: 26, stamina: null, skill: 4, defense: 4, armor: 1, power: 0, strike: 8, heavy: 12, shot: null, cycle: [H('aggressive'), P('defensive'), S('balanced')], actions: [] },
  sentinel: { hp: 20, stamina: null, skill: 4, defense: 4, armor: 1, power: 0, strike: 6, heavy: 11, shot: null, cycle: [B('defensive'), S('balanced'), H('aggressive')], actions: [] },
  archer: { hp: 12, stamina: null, skill: 4, defense: 4, armor: 0, power: 0, strike: 4, heavy: null, shot: 6, cycle: [R('balanced'), R('balanced'), P('defensive')], actions: [] },
  partySentinel: { hp: 24, stamina: 8, skill: 4, defense: 4, armor: 1, power: 0, strike: 8, heavy: null, shot: null, cycle: [], actions: ['strike', 'cover', 'brace', 'prepare', 'approach', 'disengage'] },
  partyArcher: { hp: 18, stamina: 8, skill: 4, defense: 4, armor: 0, power: 0, strike: 8, heavy: null, shot: 5, cycle: [], actions: ['shot', 'strike', 'prepare', 'approach', 'disengage'] },
};

export type ActionRule = { cost: number; stances: Stance[]; accuracy: number; priority: number; cd: number };
export const ACTIONS: Record<ActionId, ActionRule> = {
  heavy: { cost: 4, stances: ['aggressive', 'balanced'], accuracy: -1, priority: 10, cd: 1 },
  counter: { cost: 3, stances: ['balanced', 'defensive'], accuracy: 2, priority: 0, cd: 1 },
  feint: { cost: 2, stances: ['aggressive', 'balanced'], accuracy: 2, priority: 30, cd: 0 },
  cover: { cost: 2, stances: ['balanced', 'defensive'], accuracy: 0, priority: 0, cd: 0 },
  charge: { cost: 3, stances: ['aggressive'], accuracy: 0, priority: 20, cd: 0 },
  prepare: { cost: 0, stances: ['aggressive', 'balanced', 'defensive'], accuracy: 0, priority: 0, cd: 0 },
  strike: { cost: 0, stances: ['aggressive', 'balanced', 'defensive'], accuracy: 0, priority: 20, cd: 0 },
  brace: { cost: 0, stances: ['aggressive', 'balanced', 'defensive'], accuracy: 0, priority: 0, cd: 0 },
  approach: { cost: 0, stances: ['aggressive', 'balanced', 'defensive'], accuracy: 0, priority: 0, cd: 0 },
  disengage: { cost: 1, stances: ['aggressive', 'balanced', 'defensive'], accuracy: 0, priority: 0, cd: 0 },
  withdraw: { cost: 0, stances: ['aggressive', 'balanced', 'defensive'], accuracy: 0, priority: 0, cd: 0 },
  shot: { cost: 0, stances: ['aggressive', 'balanced', 'defensive'], accuracy: 0, priority: 20, cd: 0 },
  wait: { cost: 0, stances: ['aggressive', 'balanced', 'defensive'], accuracy: 0, priority: 0, cd: 0 },
};
export const STANCE_MOD: Record<Stance, number> = { aggressive: 2, balanced: 0, defensive: -2 };
const PRIMARY: ActionId[] = ['strike', 'heavy', 'feint', 'charge', 'shot'];
const DIRECT: ActionId[] = ['strike', 'heavy', 'charge'];
const MELEE_ATTACKS: ActionId[] = ['strike', 'heavy', 'feint'];
export const isPrimaryAttack = (a: ActionId) => PRIMARY.includes(a);

export type Actor = {
  id: string; team: 'heroes' | 'enemies'; role: Role; profileId: ProfileId; ref: string;
  hp: number; stamina: number | null; stance: Stance; groupId: string; readyRound: number | null;
  availableRound: Partial<Record<ActionId, number>>; phaseOffset?: number; waitAge?: number;
};
export type Plan = {
  actorId: string; stance: Stance; actionId: ActionId; targetId: string | null; moveVariant: 'JOIN' | 'ENGAGE' | null;
  wasCandidate: boolean; attackSlot: boolean; baseDamage: number; priority: number;
  /** Prototype-only: the action a Waiting enemy gave up, so the UI can say what it would have done. */
  replacedActionId?: ActionId;
};
export type CombatState = {
  rulesVersion: string; round: number; phase: Phase; result: Result | null; nextGroupSerial: number;
  actors: Actor[]; engagements: [string, string][]; frozenEnemyPlans: Plan[]; frozenCompanionPlan: Plan | null;
};
export type Command = { round: number; stance: Stance; actionId: ActionId; targetId: string | null };

export type AttackEvent = {
  kind: 'attack'; actorId: string; actionId: ActionId; originalTargetId: string; recipientId: string;
  redirectedBy: string | null; riposte: boolean; counterTriggered: boolean;
  attack: { skill: number; stance: number; card: number; prepared: number; total: number };
  defense: { base: number; stance: number; stanceUsed: number; exposed: number; total: number };
  hit: boolean;
  damage: { base: number; power: number; prepared: number; raw: number; parry: number; armor: number; guardBefore: number; absorbed: number; hpLoss: number; hpAfter: number; feintIgnoresGuard: boolean } | null;
  eliminated: boolean;
};
export type CancelReason = 'actor_dead' | 'target_dead' | 'not_engaged' | 'charge_failed' | 'shooter_engaged';
export type CombatEvent =
  | { kind: 'declare'; actorId: string; actionId: ActionId; stance: Stance; targetId: string | null; cost: number; preparedBonus: boolean; guard: number; exposed: boolean; replacedActionId?: ActionId }
  | { kind: 'move'; actorId: string; actionId: ActionId; targetId: string | null; outcome: 'joined' | 'engaged' | 'disengaged' | 'withdrew' | 'no_change' | 'failed'; fromGroup: string; toGroup: string; removed: [string, string][]; added: [string, string][] }
  | { kind: 'cancelled'; actorId: string; actionId: ActionId; targetId: string | null; reason: CancelReason }
  | AttackEvent
  | { kind: 'regen'; actorId: string; gain: number; staminaAfter: number }
  | { kind: 'result'; result: Result };

// ---------- helpers ----------
export const profileOf = (a: Actor) => PROFILES[a.profileId];
export const maxHp = (a: Actor) => profileOf(a).hp;
export const alive = (a: Actor | undefined): a is Actor => !!a && a.hp > 0;
export const actor = (s: CombatState, id: string | null) => s.actors.find(a => a.id === id);
const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
export const engaged = (s: CombatState, a: string, b: string) => {
  const [x, y] = pairKey(a, b);
  return s.engagements.some(([p, q]) => p === x && q === y);
};
export const engagedWith = (s: CombatState, id: string) =>
  s.engagements.filter(([p, q]) => p === id || q === id).map(([p, q]) => (p === id ? q : p)).filter(o => alive(actor(s, o)));
export const isFree = (s: CombatState, id: string) => engagedWith(s, id).length === 0;
export function range(s: CombatState, a: string, b: string): Range {
  if (a === b) return 'self';
  if (engaged(s, a, b)) return 'melee';
  return actor(s, a)!.groupId === actor(s, b)!.groupId ? 'near' : 'far';
}
const roleOrder = (a: Actor) => (a.role === 'hero' ? 0 : a.role === 'companion' ? 1 : 2);
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const hero = (s: CombatState) => s.actors.find(a => a.role === 'hero')!;
export const companion = (s: CombatState) => s.actors.find(a => a.role === 'companion');
export const enemies = (s: CombatState) => s.actors.filter(a => a.team === 'enemies');
const lowestHp = (list: Actor[]) => [...list].sort((a, b) => a.hp - b.hp || byId(a, b))[0];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function baseDamageFor(a: Actor, actionId: ActionId, s?: CombatState, targetId?: string | null): number {
  const p = profileOf(a);
  if (actionId === 'strike') return p.strike;
  if (actionId === 'heavy') return p.heavy ?? 0;
  if (actionId === 'shot') return p.shot ?? 0;
  if (actionId === 'charge') return 6;
  if (actionId === 'feint') return s && targetId && actor(s, targetId)?.stance === 'defensive' ? 9 : 6;
  return 0;
}
const mkPlan = (a: Actor, stance: Stance, actionId: ActionId, targetId: string | null, moveVariant: Plan['moveVariant'] = null): Plan => ({
  actorId: a.id, stance, actionId, targetId, moveVariant, wasCandidate: false, attackSlot: false,
  baseDamage: baseDamageFor(a, actionId), priority: ACTIONS[actionId].priority,
});

// ---------- setup ----------
export type ParticipantSetup = { profileId: ProfileId; ref: string; group: 'hero' | 'far'; engaged: boolean; phaseOffset?: number };
export type Setup = { enemies: ParticipantSetup[]; companion: { profileId: 'partySentinel' | 'partyArcher'; ref: string } | null; heroHp?: number };

export function initialState(setup: Setup): CombatState {
  const actors: Actor[] = [{ id: 'h01', team: 'heroes', role: 'hero', profileId: 'hero', ref: 'hero', hp: setup.heroHp ?? 40, stamina: 10, stance: 'balanced', groupId: 'g0', readyRound: null, availableRound: {} }];
  if (setup.companion) actors.push({ id: 'c01', team: 'heroes', role: 'companion', profileId: setup.companion.profileId, ref: setup.companion.ref, hp: PROFILES[setup.companion.profileId].hp, stamina: 8, stance: 'balanced', groupId: 'g0', readyRound: null, availableRound: {} });
  const engagements: [string, string][] = [];
  setup.enemies.forEach((e, i) => {
    const id = `e0${i + 1}`;
    actors.push({ id, team: 'enemies', role: 'enemy', profileId: e.profileId, ref: e.ref, hp: PROFILES[e.profileId].hp, stamina: null, stance: 'balanced', groupId: e.group === 'hero' ? 'g0' : 'g1', readyRound: null, availableRound: {}, phaseOffset: e.phaseOffset ?? 0, waitAge: 0 });
    if (e.engaged) engagements.push(pairKey('h01', id));
  });
  return { rulesVersion: RULES_VERSION, round: 1, phase: 'PLAN', result: null, nextGroupSerial: 2, actors, engagements, frozenEnemyPlans: [], frozenCompanionPlan: null };
}

// ---------- planning (13.1, 8, 9, 10) ----------
export function planRound(input: CombatState): CombatState {
  const s = clone(input);
  if (s.phase !== 'PLAN' || s.result) return s;
  const plans: Plan[] = [];
  const h = hero(s);
  for (const e of enemies(s).filter(alive).sort(byId)) {
    const p = profileOf(e);
    const entry = p.cycle[(s.round - 1 + (e.phaseOffset ?? 0)) % p.cycle.length];
    let plan: Plan;
    const engagedFoes = engagedWith(s, e.id).map(id => actor(s, id)!);
    if (e.profileId === 'archer' && engagedFoes.length) {
      plan = mkPlan(e, 'balanced', 'strike', lowestHp(engagedFoes).id);
    } else if (entry.action === 'strike' || entry.action === 'heavy') {
      const target = engagedFoes.length ? lowestHp(engagedFoes) : h;
      if (engaged(s, e.id, target.id)) plan = mkPlan(e, entry.stance, entry.action, target.id);
      else if (range(s, e.id, target.id) === 'far') plan = mkPlan(e, entry.stance, 'approach', target.id, 'JOIN');
      else if (entry.stance === 'aggressive') plan = mkPlan(e, 'aggressive', 'charge', target.id);
      else plan = mkPlan(e, 'balanced', 'approach', target.id, 'ENGAGE');
    } else if (entry.action === 'shot') {
      plan = mkPlan(e, entry.stance, 'shot', h.id);
    } else {
      plan = mkPlan(e, entry.stance, entry.action, e.id);
    }
    plan.wasCandidate = isPrimaryAttack(plan.actionId);
    plans.push(plan);
  }
  const candidates = plans.filter(p => p.wasCandidate).sort((a, b) => {
    const ea = actor(s, a.actorId)!, eb = actor(s, b.actorId)!;
    return (eb.waitAge ?? 0) - (ea.waitAge ?? 0) || b.baseDamage - a.baseDamage || byId(ea, eb);
  });
  candidates.forEach((p, i) => {
    p.attackSlot = i < 2;
    if (!p.attackSlot) {
      p.replacedActionId = p.actionId;
      p.actionId = 'wait'; p.targetId = p.actorId; p.moveVariant = null; p.priority = 0;
    }
  });
  s.frozenEnemyPlans = plans;
  s.frozenCompanionPlan = companionPlan(s, plans);
  s.phase = 'CHOOSE';
  return s;
}

function companionPlan(s: CombatState, enemyPlans: Plan[]): Plan | null {
  const c = companion(s);
  if (!alive(c)) return null;
  const h = hero(s);
  const foes = engagedWith(s, c.id).map(id => actor(s, id)!);
  if (c.profileId === 'partySentinel') {
    if ((c.stamina ?? 0) < 2) return mkPlan(c, 'defensive', 'prepare', c.id);
    if (range(s, c.id, h.id) === 'near' && enemyPlans.some(p => p.attackSlot && p.targetId === h.id)) return mkPlan(c, 'defensive', 'cover', h.id);
    if (foes.length) return mkPlan(c, 'balanced', 'strike', lowestHp(foes).id);
    if (range(s, c.id, h.id) === 'far') return mkPlan(c, 'defensive', 'approach', h.id, 'JOIN');
    return mkPlan(c, 'defensive', 'brace', c.id);
  }
  if (foes.length) return (c.stamina ?? 0) >= 1 ? mkPlan(c, 'defensive', 'disengage', c.id) : mkPlan(c, 'defensive', 'prepare', c.id);
  return mkPlan(c, 'balanced', 'shot', lowestHp(enemies(s).filter(alive)).id);
}

// ---------- options and validation ----------
export type Reason =
  | { code: 'wrong_stance'; stances: Stance[] }
  | { code: 'insufficient_stamina'; missing: number }
  | { code: 'on_cooldown'; availableRound: number }
  | { code: 'requires_engagement' }
  | { code: 'requires_near_ally' }
  | { code: 'must_disengage' }
  | { code: 'not_engaged' }
  | { code: 'target_not_enemy' }
  | { code: 'target_not_ally' }
  | { code: 'target_dead' }
  | { code: 'target_near' }
  | { code: 'target_far' }
  | { code: 'target_melee' }
  | { code: 'approach_unneeded' }
  | { code: 'no_target' };
export type TargetKind = 'self' | 'enemy' | 'ally' | 'any' | 'none';
export const TARGET_KIND: Record<ActionId, TargetKind> = {
  heavy: 'enemy', counter: 'self', feint: 'enemy', cover: 'ally', charge: 'enemy', prepare: 'self',
  strike: 'enemy', brace: 'self', approach: 'any', disengage: 'self', withdraw: 'none', shot: 'enemy', wait: 'self',
};
export type ActionOption = { actionId: ActionId; reason: Reason | null; targets: { id: string; reason: Reason | null }[] };

function actionReason(s: CombatState, a: Actor, stance: Stance, actionId: ActionId): Reason | null {
  const rule = ACTIONS[actionId];
  if (!rule.stances.includes(stance)) return { code: 'wrong_stance', stances: rule.stances };
  const free = isFree(s, a.id);
  if ((actionId === 'counter') && free) return { code: 'requires_engagement' };
  if (actionId === 'cover' && !s.actors.some(o => o.id !== a.id && o.team === a.team && alive(o) && range(s, a.id, o.id) === 'near')) return { code: 'requires_near_ally' };
  if (['approach', 'charge', 'withdraw'].includes(actionId) && !free) return { code: 'must_disengage' };
  if (actionId === 'disengage' && free) return { code: 'not_engaged' };
  const due = a.availableRound[actionId] ?? 1;
  if (due > s.round) return { code: 'on_cooldown', availableRound: due };
  if ((a.stamina ?? 0) < rule.cost) return { code: 'insufficient_stamina', missing: rule.cost - (a.stamina ?? 0) };
  return null;
}

export function targetReason(s: CombatState, a: Actor, actionId: ActionId, targetId: string): Reason | null {
  const t = actor(s, targetId);
  if (!alive(t)) return { code: 'target_dead' };
  const kind = TARGET_KIND[actionId];
  const r = range(s, a.id, t.id);
  if (kind === 'enemy' && t.team === a.team) return { code: 'target_not_enemy' };
  if (kind === 'ally' && (t.team !== a.team || t.id === a.id)) return { code: 'target_not_ally' };
  if (MELEE_ATTACKS.includes(actionId) && r !== 'melee') return r === 'near' ? { code: 'target_near' } : { code: 'target_far' };
  if (actionId === 'charge' && r !== 'near') return r === 'far' ? { code: 'target_far' } : { code: 'target_melee' };
  if (actionId === 'cover' && r !== 'near') return { code: 'target_far' };
  if (actionId === 'approach') {
    if (t.id === a.id) return { code: 'no_target' };
    if (r === 'melee') return { code: 'target_melee' };
    if (r === 'near' && t.team === a.team) return { code: 'approach_unneeded' };
  }
  return null;
}

export function listOptions(s: CombatState, stance: Stance): ActionOption[] {
  const h = hero(s);
  return HERO_ACTIONS.map(actionId => {
    const reason = actionReason(s, h, stance, actionId);
    const kind = TARGET_KIND[actionId];
    const pool = kind === 'self' ? [h] : kind === 'none' ? [] : s.actors.filter(o => alive(o) && o.id !== h.id);
    const targets = pool.map(t => ({ id: t.id, reason: kind === 'self' ? null : targetReason(s, h, actionId, t.id) }));
    const anyTarget = kind === 'none' || kind === 'self' || targets.some(t => !t.reason);
    return { actionId, reason: reason ?? (anyTarget ? null : { code: 'no_target' }), targets };
  });
}

export type Rejection = { code: 'phase' | 'round' | 'illegal_action' | 'illegal_target'; reason?: Reason };
export function validateCommand(s: CombatState, cmd: Command): Rejection | null {
  if (s.phase !== 'CHOOSE' || s.result) return { code: 'phase' };
  if (cmd.round !== s.round) return { code: 'round' };
  const h = hero(s);
  const ar = actionReason(s, h, cmd.stance, cmd.actionId);
  if (ar) return { code: 'illegal_action', reason: ar };
  const kind = TARGET_KIND[cmd.actionId];
  if (kind === 'self' && cmd.targetId !== h.id) return { code: 'illegal_target', reason: { code: 'no_target' } };
  if (kind === 'none' && cmd.targetId !== null) return { code: 'illegal_target', reason: { code: 'no_target' } };
  if (kind !== 'self' && kind !== 'none') {
    if (!cmd.targetId) return { code: 'illegal_target', reason: { code: 'no_target' } };
    const tr = targetReason(s, h, cmd.actionId, cmd.targetId);
    if (tr) return { code: 'illegal_target', reason: tr };
  }
  return null;
}

// ---------- resolution (13.2–13.4) ----------
type Work = {
  s: CombatState; events: CombatEvent[];
  guard: Record<string, number>; exposed: Record<string, boolean>; counter: Record<string, boolean>;
  coverWard: Record<string, string | null>; prepared: Map<Plan, boolean>; chargeOk: Set<Plan>;
};

function heroPlan(s: CombatState, cmd: Command): Plan {
  const h = hero(s);
  const plan = mkPlan(h, cmd.stance, cmd.actionId, cmd.targetId);
  if (cmd.actionId === 'approach' && cmd.targetId) plan.moveVariant = range(s, h.id, cmd.targetId) === 'far' ? 'JOIN' : 'ENGAGE';
  return plan;
}

function terminal(w: Work) {
  const s = w.s;
  if (!alive(hero(s))) s.result = 'LOSS';
  else if (!enemies(s).some(alive)) s.result = 'WIN';
}

function damage(w: Work, a: Actor, t: Actor, plan: Plan, opts: { riposte: boolean; original: Actor; redirectedBy: string | null; counterTriggered: boolean }) {
  const s = w.s;
  const isFeint = plan.actionId === 'feint' && !opts.riposte;
  const prepared = w.prepared.get(plan) ? 1 : 0;
  const card = opts.riposte ? 2 : ACTIONS[plan.actionId].accuracy;
  const attack = { skill: profileOf(a).skill, stance: STANCE_MOD[a.stance], card, prepared: prepared * 2, total: 0 };
  attack.total = attack.skill + attack.stance + attack.card + attack.prepared;
  const stanceDef = -STANCE_MOD[t.stance];
  const stanceUsed = isFeint ? Math.min(0, stanceDef) : stanceDef;
  const exposed = w.exposed[t.id] ? 2 : 0;
  const defense = { base: profileOf(t).defense, stance: stanceDef, stanceUsed, exposed, total: Math.max(0, profileOf(t).defense + stanceUsed - exposed) };
  const hit = attack.total >= defense.total;
  let dmg: AttackEvent['damage'] = null;
  let eliminated = false;
  if (hit) {
    const base = opts.riposte ? 7 : plan.actionId === 'feint' ? (t.stance === 'defensive' ? 9 : 6) : plan.baseDamage;
    const raw = Math.max(0, base + profileOf(a).power + prepared * 3);
    const parry = opts.counterTriggered ? 6 : 0;
    const afterArmor = Math.max(0, Math.max(0, raw - parry) - profileOf(t).armor);
    const guardBefore = w.guard[t.id] ?? 0;
    const absorbed = isFeint ? 0 : Math.min(guardBefore, afterArmor);
    w.guard[t.id] = guardBefore - absorbed;
    const hpLoss = afterArmor - absorbed;
    t.hp = Math.max(0, t.hp - hpLoss);
    dmg = { base, power: profileOf(a).power, prepared: prepared * 3, raw, parry, armor: profileOf(t).armor, guardBefore, absorbed, hpLoss, hpAfter: t.hp, feintIgnoresGuard: isFeint };
    if (t.hp === 0) {
      eliminated = true;
      s.engagements = s.engagements.filter(([p, q]) => p !== t.id && q !== t.id);
    }
  }
  w.events.push({ kind: 'attack', actorId: a.id, actionId: opts.riposte ? 'counter' : plan.actionId, originalTargetId: opts.original.id, recipientId: t.id, redirectedBy: opts.redirectedBy, riposte: opts.riposte, counterTriggered: opts.counterTriggered, attack, defense, hit, damage: dmg, eliminated });
  if (hit) terminal(w);
}

function resolvePrimaryAttack(w: Work, plan: Plan, plans: Plan[]) {
  const s = w.s;
  const a = actor(s, plan.actorId)!;
  const original = actor(s, plan.targetId)!;
  const cancel = (reason: CancelReason) => w.events.push({ kind: 'cancelled', actorId: a.id, actionId: plan.actionId, targetId: plan.targetId, reason });
  if (!alive(a)) return cancel('actor_dead');
  if (!alive(original)) return cancel('target_dead');
  if (plan.actionId === 'charge' && (!w.chargeOk.has(plan) || !engaged(s, a.id, original.id))) return cancel('charge_failed');
  if (MELEE_ATTACKS.includes(plan.actionId) && !engaged(s, a.id, original.id)) return cancel('not_engaged');
  if (plan.actionId === 'shot' && !isFree(s, a.id)) return cancel('shooter_engaged');

  let t = original;
  let redirectedBy: string | null = null;
  const protector = s.actors.filter(p => alive(p) && w.coverWard[p.id] === original.id && p.id !== a.id && range(s, p.id, original.id) === 'near').sort(byId)[0];
  if (protector) { t = protector; redirectedBy = protector.id; w.coverWard[protector.id] = null; }
  const counterTriggered = DIRECT.includes(plan.actionId) && !!w.counter[t.id] && engaged(s, a.id, t.id);
  if (counterTriggered) w.counter[t.id] = false;
  damage(w, a, t, plan, { riposte: false, original, redirectedBy, counterTriggered });
  if (s.result) return;
  if (counterTriggered && alive(a) && alive(t) && engaged(s, a.id, t.id)) {
    const counterPlan = plans.find(p => p.actorId === t.id)!;
    damage(w, t, a, counterPlan, { riposte: true, original: a, redirectedBy: null, counterTriggered: false });
  }
}

function executeMove(w: Work, plan: Plan) {
  const s = w.s;
  const a = actor(s, plan.actorId)!;
  if (!alive(a) || !['approach', 'charge', 'disengage', 'withdraw'].includes(plan.actionId)) return;
  const fromGroup = a.groupId;
  const ev = (outcome: Extract<CombatEvent, { kind: 'move' }>['outcome'], removed: [string, string][] = [], added: [string, string][] = []) =>
    w.events.push({ kind: 'move', actorId: a.id, actionId: plan.actionId, targetId: plan.targetId, outcome, fromGroup, toGroup: a.groupId, removed, added });
  if (plan.actionId === 'disengage') {
    const removed = s.engagements.filter(([p, q]) => p === a.id || q === a.id);
    s.engagements = s.engagements.filter(([p, q]) => p !== a.id && q !== a.id);
    return ev('disengaged', removed);
  }
  if (plan.actionId === 'withdraw') {
    if (!isFree(s, a.id)) return ev('failed');
    a.groupId = `g${s.nextGroupSerial++}`;
    return ev('withdrew');
  }
  const t = actor(s, plan.targetId);
  if (!alive(t) || !isFree(s, a.id)) return ev('failed');
  if (plan.actionId === 'approach' && plan.moveVariant === 'JOIN') {
    if (a.groupId === t.groupId) return ev('no_change');
    a.groupId = t.groupId;
    return ev('joined');
  }
  if (range(s, a.id, t.id) === 'near' && a.team !== t.team) {
    const pair = pairKey(a.id, t.id);
    s.engagements.push(pair);
    if (plan.actionId === 'charge') w.chargeOk.add(plan);
    return ev('engaged', [], [pair]);
  }
  return ev('failed');
}

export type Resolution = { state: CombatState; events: CombatEvent[] };

export function resolveRound(input: CombatState, cmd: Command, planNext = true): Resolution | Rejection {
  const rejection = validateCommand(input, cmd);
  if (rejection) return rejection;
  const s = clone(input);
  s.phase = 'RESOLVE';
  const w: Work = { s, events: [], guard: {}, exposed: {}, counter: {}, coverWard: {}, prepared: new Map(), chargeOk: new Set() };
  const plans: Plan[] = [heroPlan(s, cmd), ...(s.frozenCompanionPlan ? [clone(s.frozenCompanionPlan)] : []), ...clone(s.frozenEnemyPlans)];

  for (const plan of plans) {
    const a = actor(s, plan.actorId)!;
    const rule = ACTIONS[plan.actionId];
    if (a.team === 'heroes') {
      a.stamina = (a.stamina ?? 0) - rule.cost;
      if (rule.cd > 0) a.availableRound[plan.actionId] = s.round + rule.cd + 1;
    }
    a.stance = plan.stance;
    const offensive = isPrimaryAttack(plan.actionId) || plan.actionId === 'counter';
    w.prepared.set(plan, offensive && a.readyRound === s.round);
    if (offensive && a.readyRound === s.round) a.readyRound = null;
  }
  for (const plan of plans) {
    const a = actor(s, plan.actorId)!;
    if (plan.actionId === 'heavy') w.exposed[a.id] = true;
    if (plan.actionId === 'brace' || plan.actionId === 'cover') w.guard[a.id] = 6;
    if (plan.actionId === 'wait') w.guard[a.id] = 3;
    if (plan.actionId === 'counter') w.counter[a.id] = true;
    if (plan.actionId === 'cover') w.coverWard[a.id] = plan.targetId;
    if (plan.actionId === 'prepare') a.readyRound = s.round + 1;
    w.events.push({ kind: 'declare', actorId: a.id, actionId: plan.actionId, stance: plan.stance, targetId: plan.targetId, cost: a.team === 'heroes' ? ACTIONS[plan.actionId].cost : 0, preparedBonus: !!w.prepared.get(plan), guard: w.guard[a.id] ?? 0, exposed: !!w.exposed[a.id], replacedActionId: plan.replacedActionId });
  }
  const ordered = [...plans].sort((p, q) => roleOrder(actor(s, p.actorId)!) - roleOrder(actor(s, q.actorId)!) || (p.actorId < q.actorId ? -1 : 1));
  for (const plan of ordered) executeMove(w, plan);
  const attacks = plans.filter(p => isPrimaryAttack(p.actionId)).sort((p, q) =>
    q.priority - p.priority || roleOrder(actor(s, p.actorId)!) - roleOrder(actor(s, q.actorId)!) || (p.actorId < q.actorId ? -1 : 1));
  for (const plan of attacks) {
    if (s.result) break;
    resolvePrimaryAttack(w, plan, plans);
  }
  if (s.result) {
    s.phase = 'FINISHED';
    w.events.push({ kind: 'result', result: s.result });
    return { state: s, events: w.events };
  }
  for (const a of [hero(s), companion(s)]) {
    if (!alive(a)) continue;
    const plan = plans.find(p => p.actorId === a.id)!;
    const gain = 2 + (plan.actionId === 'prepare' ? 3 : 0);
    const before = a.stamina ?? 0;
    a.stamina = Math.min(profileOf(a).stamina ?? 0, before + gain);
    w.events.push({ kind: 'regen', actorId: a.id, gain: a.stamina - before, staminaAfter: a.stamina });
  }
  for (const e of enemies(s).filter(alive)) {
    const p = plans.find(x => x.actorId === e.id)!;
    e.waitAge = p.wasCandidate && !p.attackSlot ? (e.waitAge ?? 0) + 1 : 0;
  }
  for (const a of s.actors) if (a.readyRound !== null && a.readyRound <= s.round) a.readyRound = null;
  if (s.round === ROUND_LIMIT) {
    s.result = 'DRAW_LIMIT'; s.phase = 'FINISHED';
    w.events.push({ kind: 'result', result: s.result });
    return { state: s, events: w.events };
  }
  s.round += 1;
  s.phase = 'PLAN';
  return { state: planNext ? planRound(s) : s, events: w.events };
}

/** Preview is the commit's own resolver on a copy (#181), without planning the next round's intents. */
export function previewRound(s: CombatState, cmd: Command): Resolution | Rejection {
  return resolveRound(s, cmd, false);
}

export function surrender(input: CombatState): CombatState {
  const s = clone(input);
  if (s.phase !== 'CHOOSE') return s;
  s.result = 'LOSS_SURRENDER';
  s.phase = 'FINISHED';
  return s;
}

// ---------- import parsing (strict, prototype-level) ----------
export type ParseIssue =
  | { code: 'not_json' } | { code: 'too_large'; bytes: number } | { code: 'rules_version'; found: string }
  | { code: 'phase_not_importable'; phase: string } | { code: 'missing_field'; field: string }
  | { code: 'unknown_profile'; actorId: string } | { code: 'bad_engagement'; pair: string } | { code: 'hp_out_of_range'; actorId: string }
  | { code: 'no_hero' } | { code: 'plan_target_unknown'; actorId: string };

export function parseImport(text: string): { state: CombatState } | { issues: ParseIssue[] } {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > 1_000_000) return { issues: [{ code: 'too_large', bytes }] };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { issues: [{ code: 'not_json' }] }; }
  const issues: ParseIssue[] = [];
  const o = raw as Partial<CombatState>;
  for (const f of ['rulesVersion', 'round', 'phase', 'actors', 'engagements', 'frozenEnemyPlans'] as const) if (o?.[f] === undefined) issues.push({ code: 'missing_field', field: f });
  if (issues.length) return { issues };
  if (o.rulesVersion !== RULES_VERSION) issues.push({ code: 'rules_version', found: String(o.rulesVersion) });
  if (!['PLAN', 'CHOOSE', 'FINISHED'].includes(String(o.phase))) issues.push({ code: 'phase_not_importable', phase: String(o.phase) });
  const ids = new Set((o.actors ?? []).map(a => a.id));
  if (!(o.actors ?? []).some(a => a.role === 'hero')) issues.push({ code: 'no_hero' });
  for (const a of o.actors ?? []) {
    if (!PROFILES[a.profileId]) { issues.push({ code: 'unknown_profile', actorId: a.id }); continue; }
    if (a.hp < 0 || a.hp > PROFILES[a.profileId].hp) issues.push({ code: 'hp_out_of_range', actorId: a.id });
  }
  for (const [p, q] of o.engagements ?? []) {
    const ap = o.actors!.find(a => a.id === p), aq = o.actors!.find(a => a.id === q);
    if (!ap || !aq || ap.team === aq.team || ap.groupId !== aq.groupId) issues.push({ code: 'bad_engagement', pair: `${p}–${q}` });
  }
  if (o.phase === 'CHOOSE') for (const pl of o.frozenEnemyPlans ?? []) if (pl.targetId && !ids.has(pl.targetId)) issues.push({ code: 'plan_target_unknown', actorId: pl.actorId });
  if (issues.length) return { issues };
  const state = clone(o as CombatState);
  state.engagements = state.engagements.map(([p, q]) => pairKey(p, q));
  return { state: state.phase === 'PLAN' ? planRound(state) : state };
}
