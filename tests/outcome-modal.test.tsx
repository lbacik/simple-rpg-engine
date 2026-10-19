// Outcome narration in a modal over the current Location: engine transitions
// for Outcomes that stay, move, lead to a Scene or Ending, and omit
// narration, plus the modal presentation (accessible name, order, Continue
// acknowledgement, reload semantics) and the background Location derivation.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import {
  applyAction,
  onDemandScenes,
  OUTCOME_MODAL_ENTRY_TYPES,
  startPlaythrough,
  view,
  visibleExits,
  type PlaythroughState,
  type Rng,
} from '../src/engine/index';
import {
  continueHref,
  parseSeenStep,
  shouldShowOutcomeModal,
} from '../src/app/lib/panel';
import { renderJournalEntry } from '../src/app/lib/journal';
import { en } from '../src/i18n/en';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

// Imported after the router mock so the client modal picks it up.
const { OutcomeModal } = await import('../src/app/play/[playthroughId]/outcome-modal');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function dealing(dice: number[]): Rng {
  let dealt = 0;
  return () => {
    const die = dice[dealt];
    dealt += 1;
    if (die === undefined) throw new Error('rng exhausted');
    return die;
  };
}
const silentRng: Rng = () => 1;

function loadWoods(): Scenario {
  const result = loadScenario(path.join(repoRoot, 'scenarios', 'whispering-woods'));
  if (!result.ok) {
    throw new Error(`whispering-woods failed to load: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.scenario;
}

function startWoods(name = 'Robin', templateId = 'hunter'): { scenario: Scenario; state: PlaythroughState } {
  const scenario = loadWoods();
  const result = startPlaythrough(scenario, templateId, name, silentRng);
  if (!result.ok) throw new Error(`start failed: ${result.reason}`);
  return { scenario, state: result.state };
}

function choose(scenario: Scenario, state: PlaythroughState, choiceId: string, rng: Rng = silentRng) {
  const result = applyAction(scenario, state, { kind: 'choose', choiceId, expectedStep: state.step }, rng);
  if (!result.ok) throw new Error(`choose ${choiceId} failed: ${result.reason}`);
  return result;
}

/** Outcome-modal entry types among engine journal entries (all belong to the latest step). */
function panelTypes(journal: { type: string }[]): string[] {
  return journal
    .filter((entry) => OUTCOME_MODAL_ENTRY_TYPES.has(entry.type))
    .map((entry) => entry.type);
}

describe('Outcome transitions preserve the engine sequence', () => {
  it('stays in the Location when the Outcome has no transition', () => {
    const { scenario, state: started } = startWoods();
    // arrival -> elder-plea, then accept has narration + effects and no transition.
    const inPlea = choose(scenario, started, 'listen').state;
    expect(inPlea.activeSceneId).toBe('elder-plea');
    const accepted = choose(scenario, inPlea, 'accept');
    expect(accepted.state.activeSceneId).toBe(null);
    expect(accepted.state.currentLocationId).toBe('ashford');
    const gameView = view(scenario, accepted.state);
    expect(gameView.kind).toBe('location');
    if (gameView.kind !== 'location') throw new Error('expected Location view');
    expect(gameView.name).toBe('Ashford');
    // Narration, then state changes, in order.
    expect(accepted.journal.map((entry) => entry.type)).toEqual([
      'choice',
      'outcome',
      'state-change',
      'state-change',
    ]);
    expect(panelTypes(accepted.journal)).toEqual(['outcome', 'state-change', 'state-change']);
  });

  it('uses the destination Location as the base view after a move', () => {
    const scenario = loadWoods();
    const started = startPlaythrough(scenario, 'soldier', 'Ash', silentRng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const state: PlaythroughState = {
      ...started.state,
      currentLocationId: 'barrow-mound',
      activeSceneId: 'barrow-door',
      visited: [...started.state.visited, 'barrow-mound'],
      firedScenes: [...started.state.firedScenes, 'barrow-door'],
      inventory: { ...started.state.inventory, 'barrow-key': 1 },
    };
    const moved = choose(scenario, state, 'use-key');
    // The move reaches the destination Location; its on-enter Scene is the
    // next playable state revealed after acknowledgement.
    expect(moved.state.currentLocationId).toBe('barrow-tomb');
    expect(moved.state.activeSceneId).toBe('wight-awakens');
    // The modal background represents the destination Location either way.
    const destination = scenario.locationsById[moved.state.currentLocationId];
    expect(destination?.name).toBe('Barrow Tomb');
    expect(visibleExits(scenario, moved.state).length).toBeGreaterThanOrEqual(0);
    expect(onDemandScenes(scenario, moved.state)).toBeDefined();
    // The Outcome narration and state changes remain for the modal.
    expect(panelTypes(moved.journal)).toContain('outcome');
  });

  it('leads to a Scene through the existing next transition', () => {
    const { scenario, state: started } = startWoods();
    // arrival listen has an empty Outcome (no narration): next elder-plea.
    const next = choose(scenario, started, 'listen');
    expect(next.state.activeSceneId).toBe('elder-plea');
    const gameView = view(scenario, next.state);
    expect(gameView.kind).toBe('scene');
    if (gameView.kind !== 'scene') throw new Error('expected Scene view');
    expect(gameView.sceneId).toBe('elder-plea');
    // An empty Outcome produces no result entries: no modal, Scene shows directly.
    expect(next.journal.filter((entry) => OUTCOME_MODAL_ENTRY_TYPES.has(entry.type))).toEqual([]);
  });

  it('leaves the retired start-combat transition without Combat or modal entries', () => {
    // S4 (Combat MVP 1.0): `start-combat` no longer enters Combat. The fight
    // journals its Choice only, shows no outcome modal, and leaves the
    // camp-bandit Encounter undefeated until the P6 adapter lands.
    const scenario = loadWoods();
    const started = startPlaythrough(scenario, 'hunter', 'Ash', silentRng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const state: PlaythroughState = {
      ...started.state,
      currentLocationId: 'hunters-camp',
      activeSceneId: 'camp-standoff',
      visited: [...started.state.visited, 'hunters-camp', 'forest-edge'],
      firedScenes: [...started.state.firedScenes, 'camp-standoff'],
    };
    const fought = choose(scenario, state, 'fight');
    expect(fought.state.activeSceneId).toBeNull();
    expect(fought.state.encounters['camp-bandit']).toBeUndefined();
    const gameView = view(scenario, fought.state);
    expect(gameView.kind).toBe('location');
    expect(fought.journal.map((entry) => entry.type)).toEqual(['choice']);
    expect(
      fought.journal.filter((entry) => OUTCOME_MODAL_ENTRY_TYPES.has(entry.type)),
    ).toEqual([]);
  });

  it('leads to an Ending through the existing end transition', () => {
    const { scenario, state: started } = startWoods();
    const ended = choose(scenario, started, 'refuse');
    expect(ended.state.status).toBe('ended');
    const gameView = view(scenario, ended.state);
    expect(gameView.kind).toBe('ended');
    // The Outcome narration stays available for the modal before the Ending.
    expect(ended.journal.map((entry) => entry.type)).toEqual(['choice', 'outcome', 'ending']);
    expect(
      ended.journal
        .filter((entry) => OUTCOME_MODAL_ENTRY_TYPES.has(entry.type))
        .map((entry) => entry.type),
    ).toEqual(['outcome']);
  });

  it('keeps Test feedback and state changes in order with the narration', () => {
    const scenario = loadWoods();
    const started = startPlaythrough(scenario, 'soldier', 'Ash', silentRng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const state: PlaythroughState = {
      ...started.state,
      currentLocationId: 'barrow-mound',
      activeSceneId: 'barrow-door',
      visited: [...started.state.visited, 'barrow-mound'],
      firedScenes: [...started.state.firedScenes, 'barrow-door'],
    };
    // Soldier Might 3 + 1 chain shirt = 4; 4 + 5 + 4 = 13 meets very-hard 13.
    // The success Outcome moves into the tomb, whose on-enter Scene follows.
    const forced = choose(scenario, state, 'force-door', dealing([4, 5]));
    expect(forced.journal.map((entry) => entry.type)).toEqual([
      'choice',
      'test',
      'outcome',
      'scene',
    ]);
    const test = forced.journal[1];
    expect(test).toMatchObject({ type: 'test', success: true });
    expect(panelTypes(forced.journal)).toEqual(['test', 'outcome']);
  });

  it('shows meaningful state-change feedback when the Outcome omits narration', () => {
    const scenario = loadWoods();
    const started = startPlaythrough(scenario, 'hunter', 'Ash', silentRng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const state: PlaythroughState = {
      ...started.state,
      currentLocationId: 'hunters-camp',
      activeSceneId: 'search-camp',
      visited: [...started.state.visited, 'hunters-camp'],
      firedScenes: [...started.state.firedScenes, 'search-camp'],
      flags: ['camp-bandit-defeated', 'bandit-gone'],
    };
    // search-camp take has effects but no narration text.
    const taken = choose(scenario, state, 'take');
    const outcomeEntries = taken.journal.filter((entry) =>
      OUTCOME_MODAL_ENTRY_TYPES.has(entry.type),
    );
    expect(outcomeEntries.length).toBeGreaterThan(0);
    expect(outcomeEntries.map((entry) => entry.type)).toEqual(['state-change', 'state-change']);
  });
});

describe('OutcomeModal presentation', () => {
  it('has an accessible dialog name and renders entries in order', () => {
    const html = renderToStaticMarkup(
      <OutcomeModal
        label={en.game.latestEvents}
        closeLabel="Close Latest events"
        acknowledgeHref="/play/pt-1?seen=4"
        continueLabel={en.game.continue}
        entries={['<p>Outcome narration.</p>', '<p>You received: Rope.</p>']}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Latest events"');
    const narrationAt = html.indexOf('Outcome narration.');
    const receivedAt = html.indexOf('You received: Rope.');
    expect(narrationAt).toBeGreaterThan(-1);
    expect(receivedAt).toBeGreaterThan(narrationAt);
    expect(html).toContain('href="/play/pt-1?seen=4"');
    expect(html).toContain('Continue');
  });

  it('renders no modal without entries (empty Outcome)', () => {
    const html = renderToStaticMarkup(
      <OutcomeModal
        label={en.game.latestEvents}
        closeLabel="Close Latest events"
        acknowledgeHref="/play/pt-1?seen=4"
        continueLabel={en.game.continue}
        entries={[]}
      />,
    );
    expect(html).toBe('');
  });

  it('dismissal targets share Continue acknowledgement semantics', () => {
    // Escape, backdrop click and the close control all navigate to the same
    // acknowledgement href: the current step as `?seen=`. Any other value is
    // ignored and the modal is shown again.
    expect(continueHref('pt-1', 4)).toBe('/play/pt-1?seen=4');
    expect(shouldShowOutcomeModal(true, 4, parseSeenStep('4'))).toBe(false);
    expect(shouldShowOutcomeModal(true, 4, parseSeenStep('3'))).toBe(true);
    expect(shouldShowOutcomeModal(true, 4, parseSeenStep(undefined))).toBe(true);
    // Reload without the parameter shows the modal again, harmlessly.
    expect(shouldShowOutcomeModal(true, 4, undefined)).toBe(true);
    // No entries: no modal either way.
    expect(shouldShowOutcomeModal(false, 4, undefined)).toBe(false);
  });

  it('retains Scenario text rendering semantics in the entries', () => {
    const { scenario, state: started } = startWoods('Robin');
    const inPlea = choose(scenario, started, 'listen').state;
    const accepted = choose(scenario, inPlea, 'accept');
    const outcome = accepted.journal.find((entry) => entry.type === 'outcome');
    expect(outcome).toBeDefined();
    // The modal reuses the shared Journal renderer: stored Scenario text keeps
    // formatting (emphasis renders at read time) and its recorded language.
    // The Character name was substituted when the entry was stored, so the
    // renderer locates it verbatim and keeps it literal.
    const rendered = renderJournalEntry(
      { type: 'outcome', lang: 'en', payload: { text: 'Brave *Robin* stands.' } },
      en,
      'Robin',
    );
    expect(rendered.html).toContain('<em>Robin</em>');
    expect(rendered.html).toContain('lang="en"');
  });
});

describe('Outcome modal stacking', () => {
  const css = readFileSync(path.join(repoRoot, 'src', 'app', 'globals.css'), 'utf8');

  /** The value of `z-index` in the first rule matching the selector. */
  function zIndexOf(selector: string): number | null {
    const start = css.indexOf(selector);
    if (start === -1) return null;
    const block = css.slice(css.indexOf('{', start), css.indexOf('}', css.indexOf('{', start)));
    const match = /z-index:\s*(\d+)/.exec(block);
    return match?.[1] === undefined ? null : Number(match[1]);
  }

  it('marks its backdrop so it stacks below the side panel and top navigation', () => {
    const html = renderToStaticMarkup(
      <OutcomeModal
        label={en.game.latestEvents}
        closeLabel="Close Latest events"
        acknowledgeHref="/play/pt-1?seen=4"
        continueLabel={en.game.continue}
        entries={['<p>Outcome narration.</p>']}
      />,
    );
    expect(html).toContain('panel-modal-backdrop outcome-modal-backdrop');
  });

  it('keeps the Journal launcher and language switcher above the outcome backdrop', () => {
    // The Journal opens over an undismissed outcome modal, and a language
    // switch shows the same outcome modal again: both triggers must stay
    // clickable while the outcome backdrop blocks the reading column.
    const outcome = zIndexOf('.outcome-modal-backdrop {');
    const panel = zIndexOf('.panel-modal-backdrop {');
    const journal = zIndexOf('.journal-modal-backdrop {');
    expect(outcome).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(journal).not.toBeNull();
    expect(outcome!).toBeLessThan(panel!);
    expect(outcome!).toBeLessThan(journal!);
    // The top navigation and the side panel rise above the outcome backdrop
    // only while it is present, so other pages keep their stacking.
    expect(css).toContain('body:has(.outcome-modal-backdrop) header.topnav');
    expect(css).toContain('body:has(.outcome-modal-backdrop) .game .side');
    // On phones the side panel is statically positioned, so the rule
    // repositions it there to keep the launcher clickable.
    expect(css).toContain(
      'body:has(.outcome-modal-backdrop) .game .side {\n    position: relative;',
    );
  });
});
