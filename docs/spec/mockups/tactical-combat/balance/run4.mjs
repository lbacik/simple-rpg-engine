import { TUNED } from './rules.mjs';
import { CHARS, fixture } from './fixtures.mjs';
import { solve, evaluate, optimalChooser } from './solver.mjs';
for (const e of ['ref-wolf-archer', 'ref-two-wolves']) for (const c of Object.keys(CHARS)) {
  const fx = fixture(c, e);
  const so = solve(fx, TUNED, { hpWeight: 0, escapeValue: 1, discount: 1 }); const o = evaluate(fx, so, optimalChooser(so), TUNED);
  console.log(e.padEnd(16), CHARS[c].name.padEnd(15), 'min death', (100*o.death).toFixed(1)+'%', 'win', (100*o.win).toFixed(0)+'%', 'esc', (100*o.escape).toFixed(0)+'%');
}
