// Heavy-behaviour comparison: same Enemy as steady vs heavy under variants.
import { DEFAULTS } from './rules.mjs';
import { CHARS, ENCOUNTERS, SCENARIO_CHARS, fixture } from './fixtures.mjs';
import { solve, evaluate, optimalChooser } from './solver.mjs';
const pct = (x) => (100 * x).toFixed(0).padStart(3) + '%';
const FIGHT = { hpWeight: 0.25, escapeValue: 0, discount: 0.98 };
const variants = { steady: { prepareFaces: 0 }, 'heavy +2 (now)': {}, 'heavy x2': { heavyDouble: true }, 'heavy +3': { heavyBonus: 3 }, '+2, prep 1-3': { prepareFaces: 3 } };
for (const e of ['camp-bandit', 'wight-fight', 'foundry-fight', 'tower-fight', 'ref-wolf-archer']) {
  const sc = ENCOUNTERS[e].scenario; const chars = sc === 'ref' ? ['hunter', 'soldier', 'warden', 'engineer'] : SCENARIO_CHARS[sc];
  for (const c of chars) {
    const fx = fixture(c, e); const cells = [];
    for (const [n, v] of Object.entries(variants)) { const p = { ...DEFAULTS, ...v }; const sol = solve(fx, p, FIGHT); const o = evaluate(fx, sol, optimalChooser(sol), p); const nonAtk = 1 - (o.actions.attack || 0) - (o.actions.advance || 0) - (o.actions.consume || 0); cells.push(`${n}: ${pct(o.win)} hp${o.hpLeftWin.toFixed(1).padStart(5)} tac${pct(nonAtk)}`); }
    console.log(`${e.padEnd(15)} ${CHARS[c].name.padEnd(14)} ${cells.join(' | ')}`);
  }
}
