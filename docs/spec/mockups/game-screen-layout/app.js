// THROWAWAY UI ONLY. Fixed dice fixtures and local actions deliberately do not implement the game engine.
const variants = { A: 'Book & character', B: 'Focused reader', C: 'Decision desk' };
let variant = new URLSearchParams(location.search).get('variant') || 'A';
if (!variants[variant]) variant = 'A';
const labEnabled = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const templates = {
  scholar: { title: 'The Scholar', description: 'Patient observation and a talent for finding what others overlook.', attributes: [1, 1, 3, 1], item: 'Archive coat', bonus: 'Wits' },
  courier: { title: 'The Courier', description: 'Quick feet, a steady hand, and a familiar face at every crossroads.', attributes: [1, 3, 1, 1], item: 'Travel coat', bonus: 'Agility' },
  keeper: { title: 'The Keeper', description: 'A calm voice and the strength to stand by a promise.', attributes: [2, 0, 1, 3], item: 'Keeper’s coat', bonus: 'Presence' },
};
const sceneFixtures = {
  ledger: { illustration: { src: 'scene-illustration.placeholder.svg', alt: 'Placeholder for an optional Scene illustration.', width: 1200, height: 675 } },
  location: { illustration: null },
};
let previewIllustration = true;
const attributeNames = ['Might', 'Agility', 'Wits', 'Presence'];
const initial = () => ({ screen: 'play', name: 'Rowan', template: 'scholar', health: 8, maxHealth: 12, healing: 2,
  equipped: true, sheetTab: 'character', scene: 'ledger', result: null, pending: null,
  location: 'The reading room', ending: 'victory', ended: false, outcomeMode: 'success',
  journal: [{ title: 'The reading room', text: 'You entered the archive. A clerk asked you to find a letter that should never have arrived.' }],
  flags: { ledgerRead: false }, revealed: ['The reading room'] });
let state = initial();
let savedPlaythrough = null;
let returnFocus;
let toastTimer;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const template = () => templates[state.template];
const effective = (index) => template().attributes[index] + (state.equipped && template().bonus === attributeNames[index] ? 1 : 0);
const action = (id, text, cls = '', attrs = '') => `<button type="button" data-action="${id}" class="${cls}" ${attrs}>${text}</button>`;
const journalButton = () => action('journal', 'Journal', 'quiet');

function prototypeToolbar() {
  if (!labEnabled) return '';
  return `<div class="lab"><span><strong>PROTOTYPE</strong> · In-memory fixtures · English UI</span><nav aria-label="Preview screens">${['picker', 'creation', 'play', 'ending'].map((s, i) => action('screen:' + s, ['Collection', 'Character creation', 'Play', 'Ending'][i], state.screen === s ? 'active' : '')).join('')}</nav><div class="row"><label><input id="illustration-mode" type="checkbox" ${previewIllustration ? 'checked' : ''}> Scene illustration</label><label><input id="failure-mode" type="checkbox" ${state.outcomeMode === 'failure' ? 'checked' : ''}> Preview failed Test</label>${action('reset', 'Reset demo')}</div></div>`;
}
function PrototypeSwitcher() {
  if (!labEnabled) return '';
  return `<nav class="switcher" aria-label="Prototype layout variants">${action('previous', '←', '', 'aria-label="Previous layout variant"')}<span><strong>${variant}</strong> · ${variants[variant]}</span>${action('next', '→', '', 'aria-label="Next layout variant"')}</nav>`;
}
function header() {
  return `<header class="topbar"><div><div class="brand"><span>❧</span> The Quiet Archive</div><div class="subtitle">${state.screen === 'picker' ? 'A collection of interactive stories' : 'The Letter at Dusk'}</div></div><div class="row">${state.screen !== 'picker' ? action('collection', 'Collection', 'quiet') : ''}${state.screen === 'play' || state.screen === 'ending' ? journalButton() : ''}</div></header>`;
}
function healthSummary() {
  return `<div class="row spread small"><span>Health</span><strong>${state.health} / ${state.maxHealth}</strong></div><div class="health" role="meter" aria-label="Health" aria-valuemin="0" aria-valuemax="12" aria-valuenow="${state.health}"><span style="width:${state.health / 12 * 100}%"></span></div>`;
}
function attributes() {
  return `<div class="attributes">${attributeNames.map((name, i) => `<div class="attribute"><b>${effective(i)}</b>${name}</div>`).join('')}</div>`;
}
function inventory() {
  return `<div class="row spread"><span class="eyebrow">Carried items</span><span class="muted small">No capacity limit</span></div>
    <div class="item"><div class="row spread"><span class="item-title">${template().item} ×1</span><span class="pill">${state.equipped ? 'Equipped · outfit' : 'Equipment'}</span></div><p>+1 ${template().bonus} while equipped.</p>${action('equip', state.equipped ? 'Unequip' : 'Equip', '', state.ended ? 'disabled' : '')}</div>
    <div class="item"><div class="row spread"><span class="item-title">Ashwood staff ×1</span><span class="pill">Equipped · weapon</span></div><p>Damage 2. A worn walking staff.</p></div>
    <div class="item"><div class="row spread"><span class="item-title">Restoring draught ×${state.healing}</span><span class="pill magic">✧ Magic</span></div><p>Consumable · restores 4 Health.</p>${action('heal', state.health === 12 ? 'Health is full' : state.healing === 0 ? 'None remaining' : 'Use · restore 4 Health', '', state.ended || state.health === 12 || !state.healing ? 'disabled' : '')}</div>
    <div class="item"><span class="item-title">Sealed letter ×1</span><p>Key Item · A letter addressed in your own handwriting.</p></div>`;
}
function sheet() {
  return `<div class="eyebrow">Character</div><div class="row spread" style="margin:10px 0 15px"><span class="sheet-title">${esc(state.name)}</span><span class="pill">${template().title.replace('The ', '')}</span></div>${healthSummary()}
  <div class="tabs" role="tablist" aria-label="Character details">${action('tab:character', 'Character', state.sheetTab === 'character' ? 'selected' : '', `role="tab" aria-selected="${state.sheetTab === 'character'}"`)}${action('tab:inventory', 'Inventory', state.sheetTab === 'inventory' ? 'selected' : '', `role="tab" aria-selected="${state.sheetTab === 'inventory'}"`)}</div>
  <div role="tabpanel">${state.sheetTab === 'inventory' ? inventory() : `${attributes()}<p class="small muted">${state.equipped ? `Includes +1 ${template().bonus} from ${template().item.toLowerCase()}.` : 'Base Attributes. No outfit equipped.'}</p><hr class="rule"><div class="eyebrow">Equipped</div><div class="item"><span class="item-title">Ashwood staff</span><p>Weapon · Damage 2</p></div><div class="item"><span class="item-title">${state.equipped ? template().item : 'No outfit'}</span><p>${state.equipped ? `Outfit · +1 ${template().bonus}` : 'Outfit slot is empty'}</p></div><div class="item"><span class="item-title">No talisman</span><p>Talisman slot is empty</p></div>${action('tab:inventory', 'Manage inventory', '', 'style="width:100%"')}`}</div><p class="sheet-foot">${state.ended ? 'This Playthrough has ended. Character details are read-only.' : 'Equipment can be changed outside Combat.'}</p>`;
}
function sceneIllustration() {
  const illustration = sceneFixtures[state.scene]?.illustration;
  if (!previewIllustration || !illustration) return '';
  return `<figure class="scene-illustration"><img src="${esc(illustration.src)}" alt="${esc(illustration.alt)}" width="${illustration.width}" height="${illustration.height}"></figure>`;
}
function storyContent() {
  if (state.ended) return `<div class="eyebrow">Playthrough complete</div><h1>A story remembered</h1><div class="story"><p>This Playthrough has ended. Its journal and Character sheet remain available to read.</p></div>${action('show-ending', 'Read the ending', 'primary')}`;
  if (state.scene === 'location') return `<div class="location-line eyebrow">Location · ${state.location}</div><h1>${state.location === 'The reading room' ? 'A moment between pages' : 'Beyond the glass'}</h1><div class="story"><p class="lead">${state.location === 'The reading room' ? 'Tall windows hold the last of the afternoon light. Between the shelves, the archive is slowly settling into silence.' : 'The glass corridor looks out over an empty courtyard. Rain threads its way down the windows.'}</p><p>You fold the letter carefully. There is still time to decide where to go next.</p></div>`;
  return `<div class="location-line eyebrow">Location · The reading room</div><h1>A letter out of time</h1>${sceneIllustration()}<div class="story"><p class="lead">The archive is almost empty when the clerk sets a sealed letter beside your lamp. The paper is dry and warm, though rain has followed every visitor through the door.</p><p>“It arrived tomorrow,” she says. “At least, that is what the ledger claims.”</p><p>You turn the envelope over. On the back, in your own handwriting, someone has written: <em>Do not let them close the east wing, ${esc(state.name)}.</em></p></div>`;
}
function resultContent() {
  if (!state.result) return '';
  const r = state.result;
  return `<section class="result ${r.success ? '' : 'fail'}" aria-label="Choice outcome" aria-live="polite"><div class="eyebrow">${r.test ? 'Test result' : 'Outcome'}</div><h3>${r.success ? r.test ? 'A detail falls into place' : 'You make your decision' : 'The page gives nothing away'}</h3>${r.test ? `<div class="dice" aria-label="Roll ${r.dice[0]} plus ${r.dice[1]} plus Wits ${r.attribute}, total ${r.total}, target 9"><span class="die">${r.dice[0]}</span><span>+</span><span class="die">${r.dice[1]}</span><span>+ ${r.attribute} Wits = <strong>${r.total}</strong></span><span class="pill">${r.success ? 'Success' : 'Failure'} · target 9</span></div>` : ''}<p>${esc(r.text)}</p>${action('continue', 'Continue →', 'primary')}</section>`;
}
function choicesContent() {
  if (state.ended) return `<div class="view-only">This Playthrough is complete. Read the ending or start a new Playthrough from the collection.</div>`;
  if (state.result) return resultContent();
  if (state.scene === 'location') return `<section class="choices"><div class="choice-heading">Explore this Location</div>${action('inspect', '<strong>Read the notice board</strong><span class="hint">Scene · Take a closer look</span>', 'choice')}<div class="choice-heading" style="margin-top:26px">Travel</div>${action('travel', `<strong>${state.location === 'The reading room' ? 'Walk to the glass corridor' : 'Return to the reading room'}</strong><span class="hint">Connection · Available passage</span>`, 'choice')}</section>`;
  return `<section class="choices"><div class="choice-heading">What will you do?</div>${action('read-ledger', '<strong><span class="num">01</span>Examine the arrival ledger</strong><span class="hint">Wits · Moderate (9) · 2d6 + Attribute</span>', 'choice')}${action('ask-clerk', '<strong><span class="num">02</span>Ask the clerk about the east wing</strong><span class="hint">No Test</span>', 'choice')}${action('leave-scene', '<strong><span class="num">03</span>Put the letter away for now</strong><span class="hint">Return to the Location</span>', 'choice')}</section>`;
}
function VariantA() {
  return `<div class="mobile-sheet"><span>${esc(state.name)} · Health <strong>${state.health}/12</strong></span>${action('open-sheet', 'Character & items')}</div><div class="layout-a"><article class="reading"><div class="chapter-number" aria-hidden="true">I.</div>${storyContent()}${choicesContent()}</article><aside aria-label="Character sheet">${sheet()}</aside></div>`;
}
function VariantB() {
  return `<div class="layout-b"><div class="reader-tools"><div class="reader-status"><span>${esc(state.name)} · <strong>${state.health}/12</strong> Health</span>${action('open-sheet', 'Character & inventory', 'quiet')}</div></div><article class="reading">${storyContent()}${choicesContent()}</article></div>`;
}
function VariantC() {
  return `<div class="desk-status"><strong>${esc(state.name)} <span class="muted small">· ${state.health}/12 Health</span></strong><div class="stats">${attributeNames.map((n, i) => `<span>${n} <strong>${effective(i)}</strong></span>`).join('')}</div>${action('open-sheet', 'Character & items')}</div><div class="layout-c"><article class="reading">${storyContent()}</article><aside class="decision-pane" aria-label="Available decisions">${choicesContent()}</aside></div>`;
}
function picker() {
  const cards = [{ title: 'The Letter at Dusk', desc: 'A letter arrives a day before it was sent. Follow its trail through an archive that is about to close.', symbol: '❧', available: true }, { title: 'Salt & Starlight', desc: 'An empty lighthouse. A ship that never docks. One last night to learn why.', symbol: '☾', color: 'blue' }, { title: 'The Orchard Road', desc: 'Take the long way home through a valley where every promise is remembered.', symbol: '♧', color: 'sand' }];
  return `<div class="screen-heading"><div class="eyebrow">Your next story</div><h1 style="margin:12px 0">A quiet place for adventure.</h1><p class="muted">Choose a Scenario, meet your Character, and see where your choices lead.</p></div><div class="resume"><div><div class="eyebrow">${state.ended ? 'Completed Playthrough' : 'Your Playthrough'}</div><strong>${esc(state.name)} · The Letter at Dusk</strong><p>${state.ended ? 'Read the ending and revisit the journal.' : `${state.location} · ${state.health}/12 Health`}</p></div>${action('resume', state.ended ? 'View Playthrough →' : 'Continue Playthrough →', 'primary')}</div><div class="collection collection-${variant.toLowerCase()}">${variant === 'C' ? '<div class="collection-note"><div class="eyebrow">Collection</div><h3 style="margin-top:14px">Stories, at your pace.</h3><p class="small muted">Your Playthroughs belong to this browser Session. You can return to the collection at any time.</p></div>' : ''}${cards.map((c) => `<article class="scenario"><div class="cover ${c.color || ''}" aria-hidden="true">${c.symbol}</div><div class="scenario-body"><h2>${c.title}</h2><p>${c.desc}</p><div class="scenario-meta">English · ${c.available ? 'Archive Press · v1.0' : 'Sample cover only'}</div>${action('new-playthrough', c.available ? 'Start a new Playthrough' : 'Not playable in this prototype', c.available ? 'primary' : '', c.available ? '' : 'disabled')}</div></article>`).join('')}</div>`;
}
function creation() {
  return `<div class="screen-heading"><div class="eyebrow">The Letter at Dusk</div><h1 style="margin:12px 0">Who will open the letter?</h1><p class="muted">Choose a Character Template. Your starting Attributes and equipment are included.</p></div><div class="creation creation-${variant.toLowerCase()}"><section><label for="character-name">Character name</label><input id="character-name" value="${esc(state.name)}" maxlength="50" autocomplete="off"><div class="eyebrow" style="margin-bottom:15px">Character Template</div><div class="templates">${Object.entries(templates).map(([key, t]) => `<button type="button" class="template ${state.template === key ? 'selected' : ''}" data-action="template:${key}" aria-pressed="${state.template === key}"><h3>${t.title}</h3><p>${t.description}</p><div class="template-stats">${attributeNames.map((n,i) => `${n} <strong>${t.attributes[i]}</strong>`).join(' · ')}</div></button>`).join('')}</div></section><aside class="creation-summary"><div class="eyebrow">Starting Character</div><h2 style="margin:14px 0">${template().title}</h2><p><strong>12 / 12 Health</strong></p><p class="small">${template().item} · +1 ${template().bonus}<br>Ashwood staff · Damage 2<br>Restoring draught ×2<br>Sealed letter ×1</p><p class="muted small">This Character belongs to this Playthrough. There are no Attribute rolls or points to distribute.</p>${action('begin', 'Begin the story →', 'primary', state.name.trim() ? '' : 'disabled')}<p class="small muted" style="margin-top:14px">“By the time the rain stops, the archive will have closed its doors for the last time.”</p></aside></div>`;
}
function ending() {
  const won = state.ending === 'victory';
  return `<div class="ending ending-${variant.toLowerCase()}"><div><div class="ending-symbol" aria-hidden="true">${won ? '❧' : '◇'}</div><div class="eyebrow">${won ? 'Victory' : 'Defeat'} · Playthrough complete</div><h1 style="margin-top:15px">${won ? 'A letter, delivered.' : 'The last page.'}</h1><div class="story"><p>${won ? `Morning finds the east wing open. The clerk puts the ledger back on its shelf, and ${esc(state.name)} steps out into a city that has quietly been given another day.` : `The archive grows silent. ${esc(state.name)}’s journey ends here, with the letter still waiting for an answer.`}</p><p>${won ? 'Somewhere, someone begins to write.' : 'Another Character may yet discover what was hidden.'}</p></div></div><div><div class="ending-summary"><div class="eyebrow">Your Playthrough</div><h3 style="margin:14px 0 8px">${esc(state.name)} · ${template().title}</h3><p class="small muted" style="margin:0">The Letter at Dusk<br>The journal and Character sheet remain available.</p></div><div class="row">${action('journal', 'Read journal')}${action('open-sheet', 'View Character')}${action('new-playthrough', 'New Playthrough', 'primary')}${action('collection', 'Collection', 'quiet')}</div></div></div>${labEnabled ? `<div class="row" style="justify-content:center;margin-top:30px">${action('ending:victory', 'Preview victory', 'quiet')}${action('ending:defeat', 'Preview death Ending', 'quiet')}</div>` : ''}`;
}
function render() {
  const body = state.screen === 'picker' ? picker() : state.screen === 'creation' ? creation() : state.screen === 'ending' ? ending() : ({ A: VariantA, B: VariantB, C: VariantC }[variant])();
  document.querySelector('#app').innerHTML = `${prototypeToolbar()}<div class="page">${header()}<main>${body}</main></div>${labEnabled ? `<details class="state"><summary>Prototype state · ${variant} / ${state.screen} · no persistence</summary><pre>${esc(JSON.stringify({ variant, previewIllustration, sceneIllustration: sceneFixtures[state.scene]?.illustration ?? null, ...state }, null, 2))}</pre></details>` : ''}${PrototypeSwitcher()}<dialog id="panel" aria-labelledby="panel-title"><div class="dialog-head"><h2 id="panel-title"></h2>${action('close-dialog', '✕', '', 'aria-label="Close panel"')}</div><div class="dialog-body"></div></dialog><div id="toast" role="status"></div>`;
}
function showPanel(kind) {
  returnFocus = document.activeElement?.dataset.action;
  const dialog = document.querySelector('#panel');
  dialog.dataset.kind = kind;
  document.querySelector('#panel-title').textContent = kind === 'journal' ? 'Your journal' : 'Character & inventory';
  document.querySelector('.dialog-body').innerHTML = kind === 'journal'
    ? `<p class="small muted">Past narration, choices, and outcomes. Reading an entry does not replay it.</p>${state.journal.map((e, i) => `<div class="journal-entry"><div class="eyebrow">${i + 1}. ${esc(e.title)}</div><p>${esc(e.text)}</p></div>`).join('')}` : sheet();
  if (!dialog.open) dialog.showModal();
}
function updateSheet() {
  const open = document.querySelector('#panel')?.open;
  const previousAction = document.activeElement?.dataset.action;
  const previousReturnFocus = returnFocus;
  render();
  if (open) {
    showPanel('sheet');
    returnFocus = previousReturnFocus;
    if (previousAction) document.querySelector(`#panel [data-action="${previousAction}"]`)?.focus();
  } else if (previousAction) document.querySelector(`[data-action="${previousAction}"]`)?.focus();
}
function toast(message) {
  const el = document.querySelector('#toast');
  clearTimeout(toastTimer);
  el.textContent = message;
  el.className = 'status-message';
  toastTimer = setTimeout(() => { el.className = ''; el.textContent = ''; }, 2800);
}
function switchVariant(delta) {
  variant = ['A', 'B', 'C'][(['A','B','C'].indexOf(variant) + delta + 3) % 3];
  const url = new URL(location.href); url.searchParams.set('variant', variant); history.replaceState({}, '', url);
  render();
}
function navigate(screen) { state.screen = screen; render(); window.scrollTo(0, 0); }
function record(title, text) { state.journal.push({ title, text }); }
function startOutcome(choice, text, test = false) {
  const success = !test || state.outcomeMode !== 'failure';
  const dice = success ? [3, 5] : [1, 2];
  state.result = { text, test, success, ...(test ? { dice, attribute: effective(2), total: dice[0] + dice[1] + effective(2) } : {}) };
  state.pending = 'location';
  if (test && success) state.flags.ledgerRead = true;
  record('A letter out of time', `The clerk brought a letter addressed in ${state.name}’s own handwriting: “Do not let them close the east wing.”`);
  record('Choice', choice);
  record(test ? 'Test outcome' : 'Outcome', `${test ? `2d6 (${dice.join(' + ')}) + Wits ${effective(2)} = ${state.result.total}, target 9. ${success ? 'Success' : 'Failure'}. ` : ''}${text}`);
  render();
  document.querySelector('.result')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
document.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const [id, value] = button.dataset.action.split(':');
  if (id === 'previous' || id === 'next') return switchVariant(id === 'next' ? 1 : -1);
  if (id === 'reset') { state = initial(); savedPlaythrough = null; return render(); }
  if (id === 'screen') {
    if (value === 'ending') { state.ended = true; state.ending = 'victory'; }
    if (value === 'play' && state.ended) { state.ended = false; state.health = 8; state.scene = 'ledger'; state.result = null; }
    return navigate(value);
  }
  if (id === 'journal' || id === 'open-sheet') return showPanel(id === 'journal' ? 'journal' : 'sheet');
  if (id === 'close-dialog') {
    document.querySelector('#panel').close();
    if (returnFocus) document.querySelector(`[data-action="${returnFocus}"]`)?.focus();
    return;
  }
  if (id === 'tab') { state.sheetTab = value; return updateSheet(); }
  if (id === 'collection') {
    if (savedPlaythrough) { state = savedPlaythrough; savedPlaythrough = null; }
    return navigate('picker');
  }
  if (id === 'resume') return navigate(state.ended ? 'ending' : 'play');
  if (id === 'new-playthrough') {
    savedPlaythrough = structuredClone(state);
    state.name = 'Rowan'; state.template = 'scholar';
    return navigate('creation');
  }
  if (id === 'template') { state.template = value; return render(); }
  if (id === 'begin') {
    const name = state.name.trim(); if (!name) return;
    const selectedTemplate = state.template;
    savedPlaythrough = null;
    state = { ...initial(), name, template: selectedTemplate, health: 12 };
    state.journal = [{ title: 'The story begins', text: 'By the time the rain stops, the archive will have closed its doors for the last time.' }, { title: 'The reading room', text: 'You arrived at the archive and met its last clerk.' }];
    return navigate('play');
  }
  if (id === 'equip' && !state.ended) { state.equipped = !state.equipped; updateSheet(); return toast(state.equipped ? `${template().item} equipped` : `${template().item} unequipped`); }
  if (id === 'heal' && !state.ended && state.health < 12 && state.healing > 0) {
    const amount = Math.min(4, 12 - state.health); state.health += amount; state.healing--;
    record('Item used', `Restoring draught restored ${amount} Health.`); updateSheet(); return toast(`Restored ${amount} Health`);
  }
  if (id === 'read-ledger') return startOutcome('Examine the arrival ledger', state.outcomeMode === 'failure' ? 'The ink has bled through the paper. You cannot make out the delivery time. The clerk points you toward the glass corridor.' : 'Beneath the fresh ink, an older entry names the glass corridor. The letter has been here before.', true);
  if (id === 'ask-clerk') return startOutcome('Ask the clerk about the east wing', '“The glass corridor leads there,” she says. “I have kept it unlocked. Just in case.”');
  if (id === 'leave-scene') return startOutcome('Put the letter away', 'You slip the letter into your coat and step away from the desk.');
  if (id === 'continue') { state.result = null; state.scene = state.pending || 'location'; state.pending = null; return render(); }
  if (id === 'travel') {
    state.location = state.location === 'The reading room' ? 'The glass corridor' : 'The reading room';
    if (!state.revealed.includes(state.location)) state.revealed.push(state.location);
    record('Location', `You entered ${state.location.toLowerCase()}.`); return render();
  }
  if (id === 'inspect') {
    state.result = { text: '“East wing: open until dusk.” Someone has crossed out the word “dusk” and written “tomorrow”.', success: true, test: false };
    state.pending = 'location'; record('The notice board', state.result.text); return render();
  }
  if (id === 'show-ending') return navigate('ending');
  if (id === 'ending') { state.ending = value; state.ended = true; state.health = value === 'defeat' ? 0 : 8; return render(); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'illustration-mode') { previewIllustration = e.target.checked; render(); document.querySelector('#illustration-mode')?.focus(); return; }
  if (e.target.id === 'character-name') { state.name = e.target.value; document.querySelector('[data-action="begin"]').disabled = !state.name.trim(); }
  if (e.target.id === 'failure-mode') { state.outcomeMode = e.target.checked ? 'failure' : 'success'; if (state.screen === 'play') { state.scene = 'ledger'; state.result = null; state.pending = null; } render(); }
});
document.addEventListener('keydown', (e) => {
  if (!labEnabled || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input,textarea,select,[contenteditable]') || document.querySelector('#panel')?.open) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); switchVariant(e.key === 'ArrowRight' ? 1 : -1); }
});
render();
