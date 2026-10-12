// PROTOTYPE (issue #83): exact optimal play by value iteration over the reachable Round states.
import { DEFAULTS, startCombat, legalActions, resolveRound, enumerate } from './rules.mjs';

export function keyOf(s) {
  if (s.over) return s.over === 'victory' ? `V${s.char.hp}` : s.over === 'death' ? 'D' : `E${s.char.hp}`;
  return `${s.char.hp},${s.char.items}|` + s.parts.map((p) => `${p.taken},${p.range[0]},${p.intent ? p.intent[0] : '-'},${p.prepared ? 1 : 0},${Math.max(-1, p.waryUntil - s.round)}`).join('|');
}
export const actionKey = (a) => a.target ? `${a.kind}:${a.target}` : a.kind;

// objective: value of terminal outcomes. victory = 1 + hpWeight * hp / maxHp; escape = escapeValue; death = 0.
export function solve(fixture, params = DEFAULTS, objective = { hpWeight: 0.25, escapeValue: 0, discount: 0.98 }, startHp) {
  const maxHp = fixture.char.maxHp;
  const g = objective.discount ?? 1;
  const terminal = (k) => k === 'D' ? 0 : k[0] === 'V' ? 1 + objective.hpWeight * Number(k.slice(1)) / maxHp : objective.escapeValue;
  const index = new Map(); const states = []; const trans = [];
  const add = (s, k) => { if (index.has(k)) return index.get(k); const i = states.length; index.set(k, i); states.push(s); return i; };
  const start = enumerate((d) => startCombat(fixture, d, params, { hp: startHp }), params).map(([p, s]) => [p, s]);
  const merge = (list) => { const m = new Map(); for (const [p, s] of list) { const k = keyOf(s); const e = m.get(k); if (e) e[0] += p; else m.set(k, [p, s]); } return [...m.entries()].map(([k, [p, s]]) => ({ p, k, s })); };
  const startDist = merge(start).map(({ p, k, s }) => ({ p, k, i: s.over ? -1 : add(s, k) }));
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    const acts = legalActions(s);
    trans[i] = acts.map((a) => ({
      a, key: actionKey(a),
      out: merge(enumerate((d) => resolveRound(s, a, d, params).state, params)).map(({ p, k, s: n }) => n.over ? { p, t: terminal(k), k } : { p, i: add(n, k), k }),
    }));
  }
  const V = new Float64Array(states.length);
  for (let it = 0; it < 5000; it++) {
    let delta = 0;
    for (let i = 0; i < states.length; i++) {
      let best = -1;
      for (const tr of trans[i]) { let v = 0; for (const o of tr.out) v += o.p * (o.i === undefined ? o.t : g * V[o.i]); if (v > best) best = v; }
      delta = Math.max(delta, Math.abs(best - V[i])); V[i] = best;
    }
    if (delta < 1e-9) break;
  }
  const qValues = (i) => trans[i].map((tr) => ({ key: tr.key, a: tr.a, q: tr.out.reduce((v, o) => v + o.p * (o.i === undefined ? o.t : g * V[o.i]), 0) }));
  const policy = new Map();
  for (let i = 0; i < states.length; i++) { const qs = qValues(i); qs.sort((x, y) => y.q - x.q); policy.set(keyOf(states[i]), qs); }
  const value = startDist.reduce((v, d) => v + d.p * (d.i < 0 ? terminal(d.k) : V[d.i]), 0);
  return { policy, value, count: states.length, states, trans, V, index, startDist };
}

// Exact outcome distribution of following a policy (map key -> actionKey) from the start, via Markov chain iteration.
export function evaluate(fixture, solved, chooser, params = DEFAULTS, rounds = 60) {
  const { trans, states, startDist } = solved;
  let dist = new Map();
  for (const d of startDist) if (d.i >= 0) dist.set(d.i, (dist.get(d.i) || 0) + d.p);
  const res = { win: 0, death: 0, escape: 0, rounds: 0, hpLeftWin: 0, deathBy: [], actions: {}, unresolved: 0 };
  for (let r = 1; r <= rounds; r++) {
    const next = new Map(); let deathNow = 0;
    for (const [i, p] of dist) {
      const pick = chooser(states[i], trans[i]);
      const tr = trans[i].find((t) => t.key === pick) || trans[i][0];
      const kind = tr.a.kind; res.actions[kind] = (res.actions[kind] || 0) + p;
      for (const o of tr.out) {
        const q = p * o.p;
        if (o.i !== undefined) { next.set(o.i, (next.get(o.i) || 0) + q); continue; }
        res.rounds += q * r;
        if (o.k === 'D') { res.death += q; deathNow += q; }
        else if (o.k[0] === 'V') { res.win += q; res.hpLeftWin += q * Number(o.k.slice(1)); }
        else res.escape += q;
      }
    }
    res.deathBy.push(res.death);
    dist = next;
  }
  for (const p of dist.values()) res.unresolved += p;
  res.hpLeftWin = res.win ? res.hpLeftWin / res.win : 0;
  const total = Object.values(res.actions).reduce((a, b) => a + b, 0);
  for (const k in res.actions) res.actions[k] /= total;
  res.rounds = res.rounds / (1 - res.unresolved);
  return res;
}

export const optimalChooser = (solved) => (s) => solved.policy.get(keyOf(s))[0].key;

// Naive player: heal at low Health, otherwise Attack the weakest reachable participant, else Advance. Never Defends, Distracts or Escapes.
export const naiveChooser = (healAt = 4) => (s, trs) => {
  const has = (k) => trs.some((t) => t.key === k);
  if (s.char.hp <= healAt && has('consume')) return 'consume';
  const live = s.parts.filter((p) => p.taken < p.maxHp);
  const atk = live.filter((p) => has('attack:' + p.id)).sort((a, b) => (a.maxHp - a.taken) - (b.maxHp - b.taken));
  if (atk.length) return 'attack:' + atk[0].id;
  const adv = live.filter((p) => has('advance:' + p.id)).sort((a, b) => (a.reach === 'ranged' ? 0 : 1) - (b.reach === 'ranged' ? 0 : 1));
  if (adv.length) return 'advance:' + adv[0].id;
  return 'defend';
};

// Restricted optimum: best play using only the listed action kinds.
export function restrictedChooser(solved, kinds) {
  return (s) => { const qs = solved.policy.get(keyOf(s)); return (qs.find((q) => kinds.includes(q.a.kind)) || qs[0]).key; };
}
