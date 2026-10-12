import { DEFAULTS, startCombat, resolveRound, seededDice, legalActions } from './rules.mjs';
import { fixture } from './fixtures.mjs';
import { solve, keyOf, actionKey } from './solver.mjs';
const [char, enc, knobs, seedFrom, seedTo, maxR, mode] = process.argv.slice(2);
const p = { ...DEFAULTS, ...JSON.parse(knobs) };
const obj = mode === 'survive' ? { hpWeight: 0.25, escapeValue: 0.8, discount: 0.98 } : { hpWeight: 0.25, escapeValue: 0, discount: 0.98 };
const sol = solve(fixture(char, enc), p, obj);
for (let seed = +seedFrom; seed <= +seedTo; seed++) {
  let s = startCombat(fixture(char, enc), seededDice(seed), p);
  const dice = seededDice(seed * 7919 + 1); dice.draw();
  const lines = []; const acts = [];
  while (!s.over && s.round <= +maxR) {
    const intents = s.parts.filter(q=>q.taken<q.maxHp).map((q) => q.id + ':' + q.intent + (q.waryUntil>=s.round?'(W)':'')).join(',');
    const a = sol.policy.get(keyOf(s))[0].a;
    const r = resolveRound(s, a, dice, p);
    const res = r.log.map((L) => `${L.actor==='char'?'C':L.actor.slice(0,6)}.${L.kind}${L.roll ? (L.roll.ok ? '+' : '-') : ''}${L.cancelled ? '(x:' + L.cancelled + ')' : ''}${L.counter ? '[ctr' + (L.counter.ok ? '+' : '-') + ']' : ''}`).join(' ');
    lines.push(`R${s.round} [${intents}] ${actionKey(a)} => ${res} | hp ${r.state.char.hp} it ${r.state.char.items} | ${r.state.parts.map(q=>q.maxHp-q.taken).join('/')}`);
    acts.push(actionKey(a)); s = r.state;
  }
  console.log(`seed ${seed}: ${s.over || 'running'} R${s.round} :: ${JSON.stringify(acts)}`); lines.forEach((l) => console.log('   ' + l));
}
