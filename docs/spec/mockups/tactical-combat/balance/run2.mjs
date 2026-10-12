import { DEFAULTS, LEGACY } from './rules.mjs';
import { CHARS, ENCOUNTERS, SCENARIO_CHARS, fixture } from './fixtures.mjs';
import { solve, evaluate, optimalChooser, naiveChooser } from './solver.mjs';
const pct = (x) => (100 * x).toFixed(0).padStart(3) + '%';
const args = process.argv.slice(2);
const params = { ...DEFAULTS, ...(JSON.parse(process.env.TUNE || '{}')) };
const encs = args.length ? args : Object.keys(ENCOUNTERS);
const FIGHT = { hpWeight: 0.25, escapeValue: 0, discount: 0.98 };
const SURVIVE = { hpWeight: 0.25, escapeValue: 0.8, discount: 0.98 };
for (const e of encs) {
  const sc = ENCOUNTERS[e].scenario;
  const chars = sc === 'ref' ? Object.keys(CHARS) : SCENARIO_CHARS[sc];
  for (const c of chars) {
    const fx = fixture(c, e);
    const sol = solve(fx, params, FIGHT);
    const o = evaluate(fx, sol, optimalChooser(sol), params);
    const n = evaluate(fx, sol, naiveChooser(), params);
    const sv = solve(fx, params, SURVIVE); const s = evaluate(fx, sv, optimalChooser(sv), params);
    let leg = '';
    if (ENCOUNTERS[e].parts.length === 1 && !process.env.NOLEG) { const ls = solve(fx, LEGACY, FIGHT); const l = evaluate(fx, ls, optimalChooser(ls), LEGACY); leg = `OLD win ${pct(l.win)} r ${l.rounds.toFixed(1).padStart(4)} hp ${l.hpLeftWin.toFixed(1).padStart(4)} | `; }
    const acts = Object.entries(o.actions).filter(([,v])=>v>=0.01).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${(100*v).toFixed(0)}`).join(' ');
    console.log(`${e.padEnd(15)} ${CHARS[c].name.padEnd(14)} ${leg}NEW win ${pct(o.win)} r ${o.rounds.toFixed(1).padStart(4)} hp ${o.hpLeftWin.toFixed(1).padStart(4)} | naive ${pct(n.win)} | survive: death ${pct(s.death)} esc ${pct(s.escape)} | ${acts}`);
  }
}
