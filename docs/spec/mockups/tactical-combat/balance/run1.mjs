import { DEFAULTS } from './rules.mjs';
import { CHARS, ENCOUNTERS, SCENARIO_CHARS, fixture } from './fixtures.mjs';
import { solve, evaluate, optimalChooser, naiveChooser } from './solver.mjs';
const pct = (x) => (100 * x).toFixed(0).padStart(3) + '%';
const encs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ENCOUNTERS);
for (const e of encs) {
  const sc = ENCOUNTERS[e].scenario;
  const chars = sc === 'ref' ? Object.keys(CHARS) : SCENARIO_CHARS[sc];
  for (const c of chars) {
    const fx = fixture(c, e);
    const t0 = Date.now();
    const sol = solve(fx, DEFAULTS);
    const o = evaluate(fx, sol, optimalChooser(sol));
    const n = evaluate(fx, sol, naiveChooser());
    const acts = Object.entries(o.actions).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${pct(v)}`).join(', ');
    console.log(`${e.padEnd(16)} ${CHARS[c].name.padEnd(15)} OPT win ${pct(o.win)} death ${pct(o.death)} rnds ${o.rounds.toFixed(1)} hpLeft ${o.hpLeftWin.toFixed(1)} d≤R2 ${pct(o.deathBy[1])} | NAIVE win ${pct(n.win)} rnds ${n.rounds.toFixed(1)} hpLeft ${n.hpLeftWin.toFixed(1)} | ${acts}  [${sol.count} st, ${Date.now()-t0}ms]`);
  }
}
