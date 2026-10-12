// PROTOTYPE page shell (issue #83). Thin layer over rules.mjs / fixtures.mjs / solver.mjs.

const PRESETS = {
  accepted: { label: 'Accepted (Heavy +3, Escape bonus on commit)', knobs: { heavyBonus: 3, escapeBonusAt: 'commit' } },
  spec: { label: 'Spec before review (Heavy +2)', knobs: {} },
  offbalance: { label: 'Off-balance +2', knobs: { offBalance: 2 } },
  proposal: { label: 'Off-balance +2, Heavy +3', knobs: { offBalance: 2, heavyBonus: 3 } },
  legacy: { label: 'Old rules (one Enemy only)', knobs: { legacy: true, prepareFaces: 0 } },
};
const KNOBS = [
  ['offBalance', 'Off-balance: your hit bonus vs a Wary Enemy'],
  ['heavyBonus', 'Heavy attack: Damage bonus'],
  ['prepareFaces', 'heavy Behaviour prepares on 1..N'],
  ['guardBonus', 'Guarded: Enemy target +N'],
  ['counterDamage', 'Counterattack Damage'],
  ['distractBase', 'Distract target base'],
  ['waryRounds', 'Wary lasts N more Rounds'],
  ['escapeFarBonus', 'Escape bonus when nothing is Near'],
];
const FIGHT = { hpWeight: 0.25, escapeValue: 0, discount: 0.98 };
const SURVIVE = { hpWeight: 0.25, escapeValue: 0.8, discount: 0.98 };

const ACTION_NAMES = { defend: 'Defend', distract: 'Distract', attack: 'Attack', advance: 'Advance', consume: 'Use a Consumable', escape: 'Escape', fallback: 'Fall back' };
const ENC_NAMES = {
  'hollow-wolf': 'Hollow wolf (Grey Wolf, Far)', 'camp-bandit': 'Camp bandit (Bandit Archer, Far)', 'wight-fight': 'Wight (Barrow Wight, Near)',
  'porter-fight': 'Porter (Drowned Porter, Near)', 'foundry-fight': 'Foundry (Iron Foreman, Near)', 'tower-fight': 'Tower (Channel Watchman, Far)', 'auditor-fight': 'Auditor (Brass Auditor, Near)',
  'ref-wolf-archer': 'Reference: Grey Wolf + Bandit Archer (Far)', 'ref-two-wolves': 'Reference: two Grey Wolves (Far)',
};

const UI = { tab: 'play', preset: 'accepted', knobs: { ...DEFAULTS }, char: 'scholar', enc: 'hollow-wolf', seed: 7, hp: 12, hints: true, game: null, prev: null, lastLog: null, history: [], walk: null, summary: {} };
const cache = new Map();
const $ = (sel) => document.querySelector(sel);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => Math.round(100 * x) + '%';

function params() { return { ...UI.knobs }; }
function presetParams(id) { return { ...DEFAULTS, ...PRESETS[id].knobs }; }
function fx() { return fixture(UI.char, UI.enc); }
function solved() {
  const k = JSON.stringify([params(), UI.char, UI.enc, UI.hp]);
  if (!cache.has(k)) { const f = fx(); f.char.hp = UI.hp; cache.set(k, solveFrom(f)); }
  return cache.get(k);
}
function solveFrom(f) { return solve(f, params(), FIGHT, UI.hp); }

function newGame() {
  UI.game = startCombat(fx(), seededDice(UI.seed), params(), { hp: UI.hp });
  UI.dice = seededDice(UI.seed * 7919 + 1);
  UI.dice.draw(); // keep the start draw separate from round dice
  UI.prev = null; UI.lastLog = null; UI.history = [];
}

function nameOf(s, id) { const p = s.parts.find((q) => q.id === id); if (!p) return id; const same = s.parts.filter((q) => q.kind === p.kind); return p.name + (same.length > 1 ? ' ' + 'AB'[same.indexOf(p)] : ''); }
const alive2 = (p) => p.taken < p.maxHp;
const need = (target, mod) => Math.max(2, target - mod);
function intentText(s, p) {
  const word = { strike: p.reach === 'ranged' ? 'Shoot' : 'Strike', close: 'Close in', prepare: p.reach === 'ranged' ? 'Take aim' : 'Wind up', heavy: p.reach === 'ranged' ? 'Aimed shot' : 'Heavy blow' }[p.intent];
  const k = UI.knobs;
  const dmg = p.intent === 'heavy' ? (k.heavyDouble ? 2 * p.dmg : p.dmg + k.heavyBonus) : p.dmg;
  let t = `${word} · ${INTENT_SPEED[p.intent]}`;
  if (p.intent === 'strike' || p.intent === 'heavy') t += ` · ${dmg} Damage · hits you on ${need(k.hitBase + s.char.A, p.M)}+ (${need(k.hitBase + k.guardBonus + s.char.A, p.M)}+ if you Defend)`;
  if (p.intent === 'prepare') t += ` · next Round: slow ${p.reach === 'ranged' ? 'Aimed shot' : 'Heavy blow'}, ${k.heavyDouble ? 2 * p.dmg : p.dmg + k.heavyBonus} Damage`;
  return t;
}
function actionThreshold(s, a) {
  const k = UI.knobs, c = s.char, t = a.target && s.parts.find((p) => p.id === a.target);
  const live = s.parts.filter(alive2);
  switch (a.kind) {
    case 'attack': return `needs ${need(k.hitBase + t.A, c.M + (t.waryUntil >= s.round ? k.offBalance : 0))}+` + (t.waryUntil >= s.round && k.offBalance ? ' (off-balance)' : '');
    case 'distract': return `needs ${need(k.distractBase + t.W, c.W)}+`;
    case 'escape': { const near = live.some((p) => p.range === 'near'); /* shown state = commit state */ return `needs ${need(7 + Math.max(...live.map((p) => p.A)), c.A + (near ? 0 : k.escapeFarBonus))}+`; }
    case 'fallback': return `needs ${need(7 + Math.max(...live.filter((p) => p.range === 'near').map((p) => p.A)), c.A)}+`;
    case 'consume': return `+${c.heal} Health (${c.items} left)`;
    default: return 'no roll';
  }
}
function orderText(s, a) {
  const o = roundOrder(s, a); const i = o.findIndex((e) => e.actor === 'char');
  return `acts ${i + 1} of ${o.length}`;
}

function logText(s, L) {
  const who = L.actor === 'char' ? 'You' : nameOf(s, L.actor);
  const rollT = (r) => r.d1 ? `${r.d1}+${r.d2}${r.mod >= 0 ? '+' : ''}${r.mod} = ${r.d1 + r.d2 + r.mod} vs ${r.target}` : '';
  let what = L.actor === 'char' ? ACTION_NAMES[L.kind] + (L.target ? ' → ' + nameOf(s, L.target) : '') : ({ strike: 'Strike', close: 'Close in', prepare: 'Prepare', heavy: 'Heavy attack' }[L.kind]);
  if (L.dropped) return `${who}: ${what} — did not act (defeated earlier this Round)`;
  if (L.cancelled) return `${who}: ${what} — cancelled (${L.cancelled})`;
  let t = `${who}: ${what}`;
  if (L.roll) t += ` <span class="chip">${rollT(L.roll)}</span> ${L.roll.ok ? 'success' : 'failure'}`;
  if (L.damage) t += ` — ${L.damage} Damage to you`;
  if (L.counter) t += `<br>&nbsp;&nbsp;↳ Counterattack <span class="chip">${rollT(L.counter)}</span> ${L.counter.ok ? 'hits for ' + UI.knobs.counterDamage : 'misses'}`;
  return t;
}

function act(a) {
  if (!UI.game || UI.game.over) return;
  const legal = legalActions(UI.game).some((x) => actionKey(x) === actionKey(a));
  if (!legal) { UI.notice = `Rejected: ${ACTION_NAMES[a.kind]} is not available now.`; render(); return; }
  UI.prev = UI.game;
  const before = UI.game;
  let best = null;
  if (UI.hints) { const qs = solved().policy.get(keyOf(before)); if (qs) best = { best: qs[0], chosen: qs.find((q) => q.key === actionKey(a)) }; }
  const r = resolveRound(UI.game, a, UI.dice, params());
  UI.game = r.state; UI.lastLog = { log: r.log, state: r.state, round: before.round };
  UI.history.push({ round: before.round, action: actionKey(a), hp: r.state.char.hp, best });
  UI.notice = null;
  render();
}

// ---------------------------------------------------------------- tabs
const TABS = { play: 'Play', walk: 'Walkthroughs', summary: 'Summary tables', findings: 'Findings' };
function renderTabs() {
  $('#tabs').innerHTML = Object.entries(TABS).map(([k, v]) => `<button role="tab" aria-selected="${UI.tab === k}" data-tab="${k}">${v}</button>`).join('');
  $('#tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { UI.tab = b.dataset.tab; render(); });
}

function controls() {
  const opt = (obj, cur, lab) => Object.keys(obj).map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(lab(k))}</option>`).join('');
  return `<div class="row">
    <label>Character Template<select id="c-char">${opt(CHARS, UI.char, (k) => CHARS[k].name + ` (M${CHARS[k].M} A${CHARS[k].A} W${CHARS[k].W}, ${CHARS[k].dmg} ${CHARS[k].reach})`)}</select></label>
    <label>Encounter<select id="c-enc">${opt(ENCOUNTERS, UI.enc, (k) => ENC_NAMES[k])}</select></label>
    <label>Tuning<select id="c-preset">${opt(PRESETS, UI.preset, (k) => PRESETS[k].label)}</select></label>
    <label>Seed<input type="number" id="c-seed" value="${UI.seed}"></label>
    <label>Start Health<input type="number" id="c-hp" min="1" max="12" value="${UI.hp}"></label>
    <label><span><input type="checkbox" id="c-hints" ${UI.hints ? 'checked' : ''}> solver hints</span></label>
    <button class="plain primary" id="c-new">New fight</button>
  </div>
  <details class="small" style="margin-top:8px"><summary>Tuning knobs</summary><div class="row" style="margin-top:6px">${KNOBS.map(([k, l]) => `<label>${l}<input type="number" data-knob="${k}" value="${UI.knobs[k]}"></label>`).join('')}
  <label><span><input type="checkbox" data-knob="heavyDouble" ${UI.knobs.heavyDouble ? 'checked' : ''}> Heavy = double Damage</span></label>
  <label><span><input type="checkbox" data-knob="escapeBonusAt" ${UI.knobs.escapeBonusAt === 'commit' ? 'checked' : ''}> Escape bonus read on commit</span></label></div></details>`;
}
function bindControls() {
  const on = (id, f) => { const el = $(id); if (el) el.onchange = f; };
  on('#c-char', (e) => { UI.char = e.target.value; newGame(); render(); });
  on('#c-enc', (e) => { UI.enc = e.target.value; newGame(); render(); });
  on('#c-preset', (e) => { UI.preset = e.target.value; UI.knobs = presetParams(UI.preset); newGame(); render(); });
  on('#c-seed', (e) => { UI.seed = Number(e.target.value) || 1; newGame(); render(); });
  on('#c-hp', (e) => { UI.hp = Math.max(1, Math.min(12, Number(e.target.value) || 12)); newGame(); render(); });
  on('#c-hints', (e) => { UI.hints = e.target.checked; render(); });
  const nb = $('#c-new'); if (nb) nb.onclick = () => { UI.seed += 1; newGame(); render(); };
  document.querySelectorAll('[data-knob]').forEach((el) => el.onchange = () => { UI.knobs[el.dataset.knob] = el.dataset.knob === 'escapeBonusAt' ? (el.checked ? 'commit' : 'resolution') : el.type === 'checkbox' ? el.checked : Number(el.value); if (el.dataset.knob === 'prepareFaces' || el.dataset.knob === 'heavyDouble' || true) { newGame(); } render(); });
}

function arena() {
  const s = UI.game, prev = UI.prev;
  const c = s.char, pc = prev && prev.char;
  const ch = (a, b) => (prev && a !== b ? ' class="changed"' : '');
  let h = `<div class="grid">`;
  h += `<div class="card"><h3>${esc(c.name)} — Round ${s.round}</h3><div class="bar"><i style="width:${100 * c.hp / c.maxHp}%"></i></div>
    <dl class="kv"><dt>Health</dt><dd${ch(c.hp, pc && pc.hp)}>${c.hp} / ${c.maxHp}</dd><dt>Consumables</dt><dd${ch(c.items, pc && pc.items)}>${c.items} × +${c.heal}</dd>
    <dt>Attributes</dt><dd>Might ${c.M} · Agility ${c.A} · Wits ${c.W}</dd><dt>Weapon</dt><dd>${c.dmg} Damage, ${c.reach}</dd></dl></div>`;
  for (const p of s.parts) {
    const pp = prev && prev.parts.find((q) => q.id === p.id);
    const hp = p.maxHp - p.taken;
    h += `<div class="card" style="${alive2(p) ? '' : 'opacity:.5'}"><h3>${esc(nameOf(s, p.id))}${alive2(p) ? '' : ' — Defeated'}</h3><div class="bar"><i style="width:${100 * hp / p.maxHp}%;background:var(--bad)"></i></div>
      <dl class="kv"><dt>Health</dt><dd${ch(p.taken, pp && pp.taken)}>${hp} / ${p.maxHp}</dd><dt>Range</dt><dd${ch(p.range, pp && pp.range)}>${p.range === 'near' ? 'Near' : 'Far'}</dd>
      <dt>Attributes</dt><dd>Might ${p.M} · Agility ${p.A} · Wits ${p.W}</dd><dt>Kind</dt><dd>${p.dmg} Damage, ${p.reach}, ${p.behaviour}</dd>
      ${alive2(p) && !s.over ? `<dt>Intent</dt><dd><b>${esc(intentText(s, p))}</b></dd>` : ''}
      ${p.prepared ? `<dt>State</dt><dd>${p.reach === 'ranged' ? 'Aiming' : 'Wound up'}</dd>` : ''}
      ${p.waryUntil >= s.round ? `<dt>Wary</dt><dd>through Round ${p.waryUntil}${UI.knobs.offBalance ? ` (off-balance: +${UI.knobs.offBalance} to hit it)` : ''}</dd>` : ''}</dl></div>`;
  }
  return h + `</div>`;
}

function actionsPanel() {
  const s = UI.game;
  if (s.over) return `<div class="over">${{ victory: 'Victory', death: 'The Character died', escape: 'Escaped' }[s.over]} after ${s.round} Round${s.round > 1 ? 's' : ''} — Health ${s.char.hp}, Consumables left ${s.char.items}.</div>`;
  const acts = legalActions(s);
  let qs = null;
  if (UI.hints) qs = solved().policy.get(keyOf(s));
  const bestKey = qs && qs[0].key;
  return `<h3>Your action ${UI.hints && qs ? `<span class="small muted">— solver: win chance with perfect play from here ${pct(Math.min(1, qs[0].q))}</span>` : ''}</h3><div class="actions">${acts.map((a) => {
    const k = actionKey(a); const q = qs && qs.find((x) => x.key === k);
    return `<button class="act ${k === bestKey ? 'best' : ''}" data-act="${k}"><b>${ACTION_NAMES[a.kind]}${a.target ? ' → ' + esc(nameOf(s, a.target)) : ''}</b>
      <span class="sub">${ACTION_SPEED[a.kind]} · ${orderText(s, a)} · ${actionThreshold(s, a)}</span>
      ${q ? `<span class="sub">solver value ${q.q.toFixed(3)}${k === bestKey ? ' · best' : ` · ${(qs[0].q - q.q).toFixed(3)} worse`}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

function logPanel() {
  let h = '';
  if (UI.lastLog) h += `<div class="card log" style="margin-top:12px"><b>Round ${UI.lastLog.round}</b><ol>${UI.lastLog.log.map((L) => `<li>${logText(UI.lastLog.state, L)}</li>`).join('')}</ol></div>`;
  if (UI.history.length) h += `<p class="small muted" style="margin-top:8px">History: ${UI.history.map((x) => `R${x.round} ${x.action}${x.best && x.best.best.key !== x.action ? ` <span title="solver preferred ${x.best.best.key}">(best: ${x.best.best.key})</span>` : ''} → ${x.hp} HP`).join(' · ')}</p>`;
  return h;
}

function bindActions() {
  document.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => { const [kind, target] = b.dataset.act.split(':'); act(target ? { kind, target } : { kind }); });
}

function renderPlay() {
  if (!UI.game) newGame();
  return controls() + (UI.notice ? `<p class="over">${esc(UI.notice)}</p>` : '') + arena() + actionsPanel() + logPanel();
}

// ---------------------------------------------------------------- walkthroughs
function renderWalk() {
  let h = `<p class="muted small">Each walkthrough resets to a fixed seed, so it plays out the same every time. Press the steps in order; the Play view below follows along. Solver hints stay on, so you can compare the scripted choice with the best one.</p>`;
  h += `<div class="steps">${WALKS.map((w, i) => `<button class="plain ${UI.walk === i ? 'primary' : ''}" data-walk="${i}">${i + 1}. ${esc(w.title)}</button>`).join('')}</div>`;
  if (UI.walk != null) {
    const w = WALKS[UI.walk];
    h += `<div class="card"><h3>${esc(w.title)}</h3>${w.text.map((p) => `<p>${p}</p>`).join('')}
      <div class="steps">${w.steps.map((st, i) => `<button class="plain ${i < UI.walkStep ? 'done' : ''} ${i === UI.walkStep ? 'primary' : ''}" data-step="${i}">${i + 1}. ${esc(st.label)}</button>`).join('')}</div></div>`;
    h += arena() + actionsPanel() + logPanel();
  }
  return h;
}
function startWalk(i) {
  const w = WALKS[i]; UI.walk = i; UI.walkStep = 0;
  UI.char = w.char; UI.enc = w.enc; UI.preset = w.preset; UI.knobs = presetParams(w.preset); UI.seed = w.seed; UI.hp = w.hp ?? 12; UI.hints = true;
  newGame();
}
function bindWalk() {
  document.querySelectorAll('[data-walk]').forEach((b) => b.onclick = () => { startWalk(Number(b.dataset.walk)); render(); });
  document.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.step); if (i !== UI.walkStep) return;
    const [kind, target] = WALKS[UI.walk].steps[i].action.split(':'); UI.walkStep++; act(target ? { kind, target } : { kind });
  });
}

// ---------------------------------------------------------------- summary
async function computeSummary(presetId) {
  const p = presetParams(presetId); const rows = [];
  const encs = Object.keys(ENCOUNTERS).filter((e) => !(p.legacy && ENCOUNTERS[e].parts.length > 1));
  const total = encs.reduce((n, e) => n + (ENCOUNTERS[e].scenario === 'ref' ? Object.keys(CHARS).length : SCENARIO_CHARS[ENCOUNTERS[e].scenario].length), 0);
  for (const e of encs) {
    const chars = ENCOUNTERS[e].scenario === 'ref' ? Object.keys(CHARS) : SCENARIO_CHARS[ENCOUNTERS[e].scenario];
    for (const c of chars) {
      const f = fixture(c, e);
      const so = solve(f, p, FIGHT); const o = evaluate(f, so, optimalChooser(so), p);
      const n = evaluate(f, so, naiveChooser(), p);
      const sv = solve(f, p, SURVIVE); const s = evaluate(f, sv, optimalChooser(sv), p);
      rows.push({ e, c, o, n, s });
      UI.summary[presetId] = { rows, done: rows.length, total };
      if ($('#sum-progress')) $('#sum-progress').textContent = `${rows.length} / ${total}`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  UI.summary[presetId].finished = true; render();
}
function renderSummary() {
  const opt = Object.keys(PRESETS).map((k) => `<option value="${k}" ${k === UI.preset ? 'selected' : ''}>${PRESETS[k].label}</option>`).join('');
  let h = `<div class="row"><label>Tuning<select id="s-preset">${opt}</select></label><button class="plain primary" id="s-go">Compute</button><span class="small muted" id="sum-progress"></span></div>
  <p class="small muted">Full Health start. <b>Win</b>, <b>Rounds</b>, <b>Health left</b> and the <b>action mix</b> come from the solver fighting to the finish. <b>Naive win</b>: heal at 4 Health or less, otherwise Attack the weakest reachable Enemy (Advance when nothing is in Reach); never Defend, Distract or Escape. <b>Survival-first</b>: the solver values a successful Escape at 0.8 of a win; its death rate shows whether getting out is viable. <b>Tactical</b>: share of Rounds spent on Defend, Distract or Fall back.</p>`;
  const S = UI.summary[UI.preset];
  if (S) {
    h += `<div class="scroll"><table><thead><tr><th>Encounter</th><th>Template</th><th>Win</th><th>Naive win</th><th>Rounds</th><th>Health left</th><th>Dead by R3</th><th>Survival-first: death</th><th>escape</th><th>Tactical</th><th>Action mix</th></tr></thead><tbody>`;
    for (const r of S.rows) {
      const tac = (r.o.actions.defend || 0) + (r.o.actions.distract || 0) + (r.o.actions.fallback || 0);
      const mix = Object.entries(r.o.actions).filter(([, v]) => v >= 0.02).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join(', ');
      h += `<tr><td>${ENC_NAMES[r.e]}</td><td>${CHARS[r.c].name}</td><td class="${r.o.win < 0.5 ? 'lo' : r.o.win > 0.95 ? 'hi' : ''}">${pct(r.o.win)}</td><td>${pct(r.n.win)}</td><td>${r.o.rounds.toFixed(1)}</td><td>${r.o.hpLeftWin.toFixed(1)}</td><td>${pct(r.o.deathBy[2])}</td><td class="${r.s.death > 0.15 ? 'lo' : ''}">${pct(r.s.death)}</td><td>${pct(r.s.escape)}</td><td>${pct(tac)}</td><td style="text-align:left">${mix}</td></tr>`;
    }
    h += `</tbody></table></div>`;
  }
  return h;
}
function bindSummary() {
  const sel = $('#s-preset'); if (sel) sel.onchange = (e) => { UI.preset = e.target.value; UI.knobs = presetParams(UI.preset); render(); };
  const go = $('#s-go'); if (go) go.onclick = () => computeSummary(UI.preset);
}

function render() {
  renderTabs();
  const panel = $('#panel');
  if (UI.tab === 'play') { panel.innerHTML = renderPlay(); bindControls(); bindActions(); }
  if (UI.tab === 'walk') { panel.innerHTML = renderWalk(); bindWalk(); bindActions(); }
  if (UI.tab === 'summary') { panel.innerHTML = renderSummary(); bindSummary(); }
  if (UI.tab === 'findings') { panel.innerHTML = FINDINGS; }
}
UI.knobs = presetParams(UI.preset);
render();
