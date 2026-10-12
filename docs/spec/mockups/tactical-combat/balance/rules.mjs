// PROTOTYPE (issue #83): tactical Combat rules per docs/spec/mechanics.md, with tuning knobs.
// Pure: no DOM. Dice are injected: dice.test(mod, target) -> { ok, d1, d2 }, dice.draw() -> 1..6.

export const DEFAULTS = {
  maxHp: 12,
  hitBase: 7,          // 2d6 + Might >= hitBase + Agility
  guardBonus: 2,       // Guarded: attackers need hitBase + guardBonus + Agility
  counterDamage: 1,
  heavyBonus: 2,       // Heavy attack Damage = Enemy Damage + heavyBonus
  prepareFaces: 2,     // heavy Behaviour prepares on a draw of 1..prepareFaces
  distractBase: 7,     // 2d6 + Wits >= distractBase + target Wits
  waryRounds: 1,       // Wary lasts until the end of round + waryRounds
  escapeFarBonus: 2,
  escapeBonusAt: 'resolution', // 'commit': the +2 is read from the state shown when the Character commits
  offBalance: 0,       // EXPERIMENT: bonus to the Character's hit rolls against a Wary participant
  heavyDouble: false,  // EXPERIMENT: Heavy attack deals double Damage instead of + heavyBonus
  charOrder: 'agility',// EXPERIMENT: 'last' puts the Character after Enemies of the same Speed (measures the worth of initiative)
  legacy: false,       // pre-tactical rules (one Enemy): Character first, flat counter, steady response, no Distract
};
export const LEGACY = { ...DEFAULTS, legacy: true, prepareFaces: 0 };
// Accepted tuning from the issue #83 review.
export const TUNED = { ...DEFAULTS, heavyBonus: 3, escapeBonusAt: 'commit' };

const SPEED_RANK = { fast: 0, normal: 1, slow: 2 };
export const ACTION_SPEED = { defend: 'fast', distract: 'fast', attack: 'normal', advance: 'normal', consume: 'normal', escape: 'normal', fallback: 'slow' };
export const INTENT_SPEED = { strike: 'normal', close: 'normal', prepare: 'normal', heavy: 'slow' };

export function p2d6(need) { let c = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= need) c++; return c / 36; }

const alive = (p) => p.taken < p.maxHp;
const inReach = (reach, range) => reach === 'ranged' || range === 'near';

export function clone(s) {
  return { ...s, char: { ...s.char }, parts: s.parts.map((p) => ({ ...p })) };
}

export function startCombat(fixture, dice, params = DEFAULTS, opts = {}) {
  const c = fixture.char;
  const s = {
    round: 1,
    over: null,
    legacy: params.legacy,
    charOrder: params.charOrder,
    char: { ...c, hp: opts.hp ?? params.maxHp },
    parts: fixture.enemies.map((e, i) => ({ ...e, id: e.id ?? `p${i}`, taken: e.taken ?? 0, range: fixture.startRange ?? 'far', intent: null, prepared: false, waryUntil: 0 })),
  };
  selectIntents(s, dice, params);
  return s;
}

export function selectIntents(s, dice, params) {
  for (const p of s.parts) p.intent = null;
  for (const p of s.parts) {
    if (!alive(p)) { p.intent = null; continue; }
    if (p.prepared) {
      if (inReach(p.reach, p.range)) { p.intent = 'heavy'; continue; }
      p.prepared = false;
    }
    if (p.reach === 'melee' && p.range === 'far') { p.intent = 'close'; continue; }
    const blocked = s.parts.some((q) => q !== p && alive(q) && (q.prepared || q.intent === 'prepare'));
    if (p.behaviour === 'heavy' && !blocked) {
      if (dice.draw() <= params.prepareFaces) { p.intent = 'prepare'; continue; }
    }
    p.intent = 'strike';
  }
}

export function legalActions(s) {
  const out = [{ kind: 'defend' }];
  const live = s.parts.filter(alive);
  for (const p of live) {
    if (!s.legacy && p.waryUntil < s.round) out.push({ kind: 'distract', target: p.id });
    if (inReach(s.char.reach, p.range)) out.push({ kind: 'attack', target: p.id });
    if (p.range === 'far') out.push({ kind: 'advance', target: p.id });
  }
  if (s.char.items > 0 && s.char.hp < s.char.maxHp) out.push({ kind: 'consume' });
  out.push({ kind: 'escape' });
  if (live.some((p) => p.range === 'near')) out.push({ kind: 'fallback' });
  return out;
}

export function roundOrder(s, action) {
  const entries = [{ actor: 'char', speed: ACTION_SPEED[action.kind], agility: s.charOrder === 'last' ? -1 : s.char.A, idx: -1 }];
  s.parts.forEach((p, i) => { if (alive(p)) entries.push({ actor: p.id, speed: INTENT_SPEED[p.intent], agility: p.A, idx: i }); });
  if (s.legacy) return entries;
  return entries.sort((a, b) => SPEED_RANK[a.speed] - SPEED_RANK[b.speed] || b.agility - a.agility || a.idx - b.idx);
}

// Resolves one whole Round including cleanup. Returns { state, log }.
export function resolveRound(s0, action, dice, params = DEFAULTS) {
  const s = clone(s0);
  const c = s.char;
  const byId = (id) => s.parts.find((p) => p.id === id);
  const log = [];
  let guarded = false, counterUsed = false;
  const interrupted = new Set();
  const checkEnd = () => {
    if (c.hp <= 0) { s.over = 'death'; return true; }
    if (!s.parts.some(alive)) { s.over = 'victory'; return true; }
    return s.over === 'escape';
  };
  const noneNearAtCommit = !s.parts.some((p) => alive(p) && p.range === 'near');
  const order = roundOrder(s, action);
  for (const e of order) {
    if (e.actor === 'char') {
      const t = action.target ? byId(action.target) : null;
      const L = { actor: 'char', kind: action.kind, target: action.target };
      switch (action.kind) {
        case 'defend': guarded = true; break;
        case 'distract': {
          if (!alive(t)) { L.cancelled = 'target defeated'; break; }
          const r = dice.test(c.W, params.distractBase + t.W); L.roll = r;
          if (r.ok) { interrupted.add(t.id); t.prepared = false; t.waryUntil = s.round + params.waryRounds; }
          break;
        }
        case 'attack': {
          if (!alive(t)) { L.cancelled = 'target defeated'; break; }
          if (!inReach(c.reach, t.range)) { L.cancelled = 'out of Reach'; break; }
          const r = dice.test(c.M + (t.waryUntil >= s.round ? params.offBalance : 0), params.hitBase + t.A); L.roll = r;
          if (r.ok) t.taken = Math.min(t.maxHp, t.taken + c.dmg);
          break;
        }
        case 'advance':
          if (!alive(t)) { L.cancelled = 'target defeated'; break; }
          if (t.range === 'near') { L.cancelled = 'already Near'; break; }
          t.range = 'near'; break;
        case 'consume': c.hp = Math.min(c.maxHp, c.hp + c.heal); c.items -= 1; break;
        case 'escape': {
          const live = s.parts.filter(alive);
          const opp = Math.max(...live.map((p) => p.A));
          const far = params.escapeBonusAt === 'commit' ? noneNearAtCommit : !live.some((p) => p.range === 'near');
          const bonus = far ? params.escapeFarBonus : 0;
          const r = dice.test(c.A + bonus, 7 + opp); L.roll = r;
          if (r.ok) s.over = 'escape';
          break;
        }
        case 'fallback': {
          const near = s.parts.filter((p) => alive(p) && p.range === 'near');
          if (!near.length) { L.cancelled = 'none Near'; break; }
          const r = dice.test(c.A, 7 + Math.max(...near.map((p) => p.A))); L.roll = r;
          if (r.ok) near.forEach((p) => { p.range = 'far'; });
          break;
        }
      }
      log.push(L);
    } else {
      const p = byId(e.actor);
      if (params.legacy && alive(p)) p.intent = p.reach === 'melee' && p.range === 'far' ? 'close' : 'strike';
      const L = { actor: p.id, kind: p.intent };
      if (!alive(p)) { L.dropped = true; log.push(L); continue; }
      if (interrupted.has(p.id)) { L.cancelled = 'interrupted'; if (p.intent === 'heavy') p.prepared = false; log.push(L); continue; }
      switch (p.intent) {
        case 'close':
          if (p.range === 'near') L.cancelled = 'already Near'; else p.range = 'near';
          break;
        case 'prepare': p.prepared = true; break;
        case 'strike':
        case 'heavy': {
          if (p.intent === 'heavy') p.prepared = false;
          if (!inReach(p.reach, p.range)) { L.cancelled = 'out of Reach'; break; }
          const r = dice.test(p.M, params.hitBase + (guarded ? params.guardBonus : 0) + c.A); L.roll = r;
          if (r.ok) { const d = p.intent === 'heavy' ? (params.heavyDouble ? 2 * p.dmg : p.dmg + params.heavyBonus) : p.dmg; c.hp = Math.max(0, c.hp - d); L.damage = d; }
          else if (guarded && params.legacy) {
            L.counter = { ok: true }; p.taken = Math.min(p.maxHp, p.taken + params.counterDamage);
          }
          else if (guarded && p.reach === 'melee' && !counterUsed) {
            counterUsed = true;
            const cr = dice.test(c.M, params.hitBase + p.A); L.counter = cr;
            if (cr.ok) p.taken = Math.min(p.maxHp, p.taken + params.counterDamage);
          }
          break;
        }
      }
      log.push(L);
    }
    if (checkEnd()) break;
  }
  if (!s.over) {
    s.round += 1;
    selectIntents(s, dice, params);
  }
  return { state: s, log, order };
}

// Dice sources -------------------------------------------------------------

export function seededDice(seed) {
  let t = seed >>> 0;
  const rnd = () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const d6 = () => 1 + Math.floor(rnd() * 6);
  return {
    test(mod, target) { const d1 = d6(), d2 = d6(); return { ok: d1 + d2 + mod >= target, d1, d2, mod, target }; },
    draw: d6,
  };
}

// Enumerates every branch of a probabilistic computation by re-execution.
// fn(dice) runs with a dice object whose results are binary branches.
export function enumerate(fn, params = DEFAULTS) {
  const results = [];
  const stack = [[]]; // each entry: forced prefix of branch indices
  while (stack.length) {
    const prefix = stack.pop();
    let i = 0, prob = 1;
    const pick = (pTrue) => {
      if (i < prefix.length) { const b = prefix[i++]; prob *= b ? pTrue : 1 - pTrue; return b; }
      // new choice point: take true now, queue the false branch
      if (pTrue <= 0) { i++; prefix.push(0); return 0; }
      if (pTrue >= 1) { i++; prefix.push(1); return 1; }
      stack.push([...prefix, 0]);
      prefix.push(1); i++; prob *= pTrue; return 1;
    };
    const dice = {
      test(mod, target) { const ok = pick(p2d6(target - mod)); return { ok: !!ok, mod, target }; },
      draw() { return pick(params.prepareFaces / 6) ? 1 : 6; },
    };
    const value = fn(dice);
    if (prob > 0) results.push([prob, value]);
  }
  return results;
}
