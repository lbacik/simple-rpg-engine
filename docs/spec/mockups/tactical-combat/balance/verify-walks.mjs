import { readFileSync } from 'node:fs';
import { DEFAULTS, startCombat, resolveRound, seededDice, legalActions } from './rules.mjs';
import { fixture } from './fixtures.mjs';
import { actionKey } from './solver.mjs';
const src = readFileSync('content.js', 'utf8') + readFileSync('page.js', 'utf8').match(/const PRESETS = \{[\s\S]*?\n\};/)[0] + '\n;globalThis.W = WALKS; globalThis.P = PRESETS;';
new Function(src)();
for (const w of W) {
  const p = { ...DEFAULTS, ...P[w.preset].knobs };
  let s = startCombat(fixture(w.char, w.enc), seededDice(w.seed), p);
  const d = seededDice(w.seed * 7919 + 1); d.draw();
  const out = [];
  for (const st of w.steps) {
    if (s.over) { out.push(`(${st.action}: fight over)`); continue; }
    const [kind, target] = st.action.split(':'); const a = target ? { kind, target } : { kind };
    if (!legalActions(s).some((x) => actionKey(x) === st.action)) { out.push(`ILLEGAL ${st.action}`); continue; }
    const intents = s.parts.filter((q) => q.taken < q.maxHp).map((q) => q.intent).join('/');
    s = resolveRound(s, a, d, p).state; out.push(`R${s.round - (s.over ? 0 : 1)}[${intents}] ${st.action}→hp${s.char.hp} e${s.parts.map((q) => q.maxHp - q.taken).join('/')}${s.over ? ' ' + s.over : ''}`);
  }
  console.log(w.title + '\n   ' + out.join('\n   '));
}
