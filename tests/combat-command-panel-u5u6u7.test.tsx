// Command panel U5/U6/U7 (Combat MVP 1.0, P4): the per-Round Combat log with
// skippable replay, the narrow-screen layout, and keyboard/screen-reader
// support. Static markup covers the server (and no-JavaScript) render; the
// replay stepping, arrow-key roving and reduced-motion branches are pure
// helpers tested directly, because the suite renders without a DOM.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { startCombat, submitRound } from '../src/engine/combat/index';
import type { CombatEvent, CombatState } from '../src/engine/combat/index';
import { CommandPanel } from '../src/app/combat/command-panel';
import { nextOptionIndex } from '../src/app/combat/command-panel-interactive';
import { groupLogByRound, heroChoiceOf, logLine } from '../src/app/combat/combat-log';
import { parseSelection } from '../src/app/combat/selection';
import { getCombatCatalogue } from '../src/i18n/combat';
import { scenarioInitial } from './combat-core-fixtures';

function t1Choose(): CombatState {
  const started = startCombat(scenarioInitial('T1'));
  if (!started.ok) throw new Error('T1 must start');
  return started.state;
}

function t6Choose(): CombatState {
  const started = startCombat(scenarioInitial('T6'));
  if (!started.ok) throw new Error('T6 must start');
  return started.state;
}

/** T1 after one resolved Round: the log holds Round 1 events. */
function t1AfterOneRound(): CombatState {
  const done = submitRound(t1Choose(), { round: 1, stance: 'balanced', actionId: 'strike', targetId: 'e01' });
  if (!done.ok) throw new Error('strike must commit');
  return done.state;
}

function render(state: CombatState, query: Record<string, string> = {}, language: 'en' | 'pl' = 'en') {
  return renderToStaticMarkup(
    <CommandPanel
      state={state}
      language={language}
      selection={parseSelection(query, state)}
      basePath="/arena"
      confirmAction="/arena/confirm"
      surrenderAction="/arena/surrender"
    />,
  );
}

function css(): string {
  return readFileSync(join(__dirname, '..', 'src', 'app', 'globals.css'), 'utf8');
}

function combatSources(): string {
  const files = [
    'command-panel.tsx',
    'command-panel-interactive.tsx',
    'combat-log.tsx',
    'combat-log-replay.tsx',
    'forecast.ts',
    'selection.ts',
  ];
  return files.map((file) => readFileSync(join(__dirname, '..', 'src', 'app', 'combat', file), 'utf8')).join('\n');
}

describe('Combat log (U5)', () => {
  it('groups the log per Round with the player choice', () => {
    const markup = render(t1AfterOneRound());
    expect(markup).toContain('Combat log');
    expect(markup).toContain('Round 1');
    // The hero declared Balanced Strike at e01: the choice line names it.
    expect(markup).toContain('Your choice: Balanced · Strike → e01');
    // Event lines come from the core log through the catalogue.
    expect(markup).toContain('Declared: h01');
    expect(markup).toContain('Attack:');
  });

  it('shows the planned Round before anything resolves', () => {
    const markup = render(t1Choose());
    expect(markup).toContain('Round 1');
    expect(markup).toContain('Planned: e01');
  });

  it('renders an empty state before the first Round is planned', () => {
    const markup = render({ ...t1Choose(), log: [] });
    expect(markup).toContain('Combat log');
    expect(markup).toContain('No rounds played yet.');
  });

  it('renders the log in Polish', () => {
    const markup = render(t1AfterOneRound(), {}, 'pl');
    expect(markup).toContain('Dziennik walki');
    expect(markup).toContain('Runda 1');
    expect(markup).toContain('Twój wybór:');
  });

  it('shows the full log with no replay controls before hydration', () => {
    // Progressive enhancement: the server and no-JavaScript renders carry the
    // whole log and no dead buttons; controls mount only in the browser.
    const markup = render(t1AfterOneRound(), { stance: 'balanced', action: 'strike', target: 'e01' });
    expect(markup).toContain('Declared: h01');
    expect(markup).not.toContain('Replay round');
    expect(markup).not.toContain('Show all');
    expect(markup).not.toContain('Next step');
    expect(markup).not.toContain('>Pause</button>');
  });

  it('keeps the replay vocabulary in both catalogues', () => {
    for (const language of ['en', 'pl'] as const) {
      const panel = getCombatCatalogue(language).panel;
      expect(panel.logHeading.length).toBeGreaterThan(0);
      expect(panel.logEmpty.length).toBeGreaterThan(0);
      expect(panel.logReplay(1).length).toBeGreaterThan(0);
      expect(panel.logNext.length).toBeGreaterThan(0);
      expect(panel.logPause.length).toBeGreaterThan(0);
      expect(panel.logSkip.length).toBeGreaterThan(0);
      expect(panel.logStep(1, 7).length).toBeGreaterThan(0);
    }
    expect(getCombatCatalogue('pl').panel.logReplay(2)).toContain('Odtwórz');
    expect(getCombatCatalogue('pl').panel.logSkip).toContain('Pokaż');
  });

  it('honours reduced motion in the stylesheet', () => {
    expect(css()).toContain('prefers-reduced-motion');
  });

  it('groups events by Round in log order', () => {
    const events = [
      { round: 2, seq: 3, type: 'moved' },
      { round: 1, seq: 1, type: 'declared' },
      { round: 1, seq: 0, type: 'round-planned' },
    ] as CombatEvent[];
    const groups = groupLogByRound(events);
    expect(groups.map((group) => group.round)).toEqual([1, 2]);
    expect(groups[0]!.events.map((event) => event.seq)).toEqual([0, 1]);
  });

  it('reads the hero choice from the declared event, or null without one', () => {
    const markup = t1AfterOneRound();
    const round1 = groupLogByRound(markup.log).find((group) => group.round === 1);
    expect(round1).toBeDefined();
    expect(heroChoiceOf(round1!.events)).toEqual({ stance: 'balanced', actionId: 'strike', targetId: 'e01' });
    expect(heroChoiceOf([])).toBeNull();
  });

  it('falls back to a stable line for an unknown event shape', () => {
    const text = getCombatCatalogue('en');
    expect(logLine(text, { round: 1, seq: 4 } as CombatEvent, (id) => id)).toBe('event #4');
  });
});

describe('Narrow layout (U6)', () => {
  it('keeps the threat strip sticky', () => {
    const threat = css().match(/\.cp-threat\s*\{[^}]*\}/);
    expect(threat).not.toBeNull();
    expect(threat![0]).toContain('position: sticky');
  });

  it('puts the intents above the cards below the narrow breakpoint', () => {
    const narrow = css().match(/@media\s*\(max-width:\s*56rem\)\s*\{[^@]*\.cp-center\s*\{[^}]*\}/);
    expect(narrow).not.toBeNull();
    expect(narrow![0]).toContain('order: -1');
    expect(narrow![0]).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('wraps panel text instead of overflowing at 390 px', () => {
    const styles = css();
    // No unbreakable badge line: the Polish waiting badge must wrap.
    expect(styles).not.toMatch(/\.cp-badge\s*\{[^}]*white-space:\s*nowrap/);
    // Clipped columns and wrapping boxes keep long lines inside the viewport.
    expect(styles).toContain('overflow-x: clip');
    expect(styles).toContain('overflow-wrap: break-word');
  });

  it('renders the wide T6 fight in both languages without fixed widths', () => {
    for (const language of ['en', 'pl'] as const) {
      const markup = render(t6Choose(), { stance: 'balanced', action: 'strike' }, language);
      expect(markup).toContain('cp-threat');
      expect(markup).toContain('cp-intents');
      // Meters size by percentage; nothing pins a pixel width inline.
      expect(markup).not.toMatch(/style="[^"]*\d+px/);
    }
    const polish = render(t6Choose(), { stance: 'balanced', action: 'strike' }, 'pl');
    expect(polish).toContain('Czeka · ochrona 3');
  });
});

describe('Keyboard and screen-reader support (U7)', () => {
  it('names each intent with its state and legality', () => {
    const markup = render(t1Choose(), { stance: 'balanced', action: 'strike' });
    expect(markup).toContain('aria-label="e01 · HP 26 / 26 · Melee · Aggressive · Attack slot · Legal target"');
    expect(markup).toContain('Legal target');
  });

  it('announces the disabled reason on an illegal target', () => {
    const markup = render(t1Choose(), { stance: 'defensive', action: 'heavy', target: 'e01' });
    // The illegal intent stays a focusable link carrying its reason.
    expect(markup).toMatch(/aria-disabled="true"[^>]*aria-label="e01[^"]*This stance disallows that action\./);
  });

  it('announces the disabled reason on each card', () => {
    const markup = render(t1Choose());
    // The hero cannot shoot: the Shot card is disabled but labelled.
    expect(markup).toContain('aria-label="Shot · The hero cannot shoot."');
    expect(markup).toMatch(/aria-disabled="true"[^>]*aria-label="Shot/);
  });

  it('names the self target with its legality', () => {
    const markup = render(t1Choose(), { stance: 'balanced', action: 'brace' });
    expect(markup).toContain('aria-label="self · Legal target"');
  });

  it('labels the forecast lists', () => {
    const markup = render(t1Choose(), { stance: 'balanced', action: 'strike', target: 'e01' });
    expect(markup).toContain('aria-label="Movement"');
    expect(markup).toContain('aria-label="Blow order"');
    expect(markup).toContain('aria-label="After the round"');
    expect(markup).toContain('aria-label="Regeneration"');
  });

  it('keeps the focus visible on every panel control', () => {
    const styles = css();
    expect(styles).toContain('.cp a:focus-visible');
    expect(styles).toContain('.cp button:focus-visible');
    expect(styles).toContain('.cp summary:focus-visible');
  });

  it('moves target focus with the arrow keys across the intent list', () => {
    expect(nextOptionIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(nextOptionIndex(2, 3, 'ArrowDown')).toBe(0);
    expect(nextOptionIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(nextOptionIndex(1, 3, 'Home')).toBe(0);
    expect(nextOptionIndex(1, 3, 'End')).toBe(2);
    expect(nextOptionIndex(0, 3, 'Enter')).toBeNull();
    expect(nextOptionIndex(0, 0, 'ArrowDown')).toBeNull();
  });

  it('confirms surrender in-page, never through a browser dialog', () => {
    const markup = render(t1Choose());
    expect(markup).toContain('<details class="cp-confirm">');
    expect(markup).toContain('<summary>Surrender</summary>');
    expect(markup).toContain('Surrender this fight?');
    expect(markup).toContain('Yes, surrender');
    // The POST still carries the round inside the confirmation.
    expect(markup).toMatch(/<details class="cp-confirm">[\s\S]*<form action="\/arena\/surrender" method="post">/);
    const polish = render(t1Choose(), {}, 'pl');
    expect(polish).toContain('<summary>Poddaj walkę</summary>');
    expect(polish).toContain('Tak, poddaj walkę');
  });

  it('opens no browser dialogs from the combat panel', () => {
    const sources = combatSources();
    expect(sources).not.toContain('window.confirm');
    expect(sources).not.toContain('window.alert');
    expect(sources).not.toMatch(/[^.]confirm\(/);
    expect(sources).not.toContain('alert(');
  });
});
