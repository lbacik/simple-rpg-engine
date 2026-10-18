// The Scenario intro modal over the starting Location: the intro shows above
// the Location base view, Continue acknowledges without advancing state, and
// a Scenario without an intro opens directly with no modal.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadScenario } from '../src/content/index';
import { startPlaythrough, view, type Rng } from '../src/engine/index';
import { renderJournalEntry } from '../src/app/lib/journal';
import { continueHref, shouldShowIntroModal } from '../src/app/lib/panel';
import { IntroModal } from '../src/app/play/[playthroughId]/intro-modal';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

const rng: Rng = () => 1;

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function loadFixture(opts: { intro?: string } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-intro-'));
  const name = 'meadow';
  const scenarioDir = path.join(dir, name);
  const introLines =
    opts.intro === undefined
      ? []
      : ['intro: |', ...opts.intro.split('\n').map((line) => `  ${line}`)];
  writeFiles(scenarioDir, {
    'scenario.yaml': [
      'schemaVersion: 1',
      `id: ${name}`,
      'title: Meadow',
      'description: A quiet meadow.',
      'author: Test',
      'version: "1.0.0"',
      'language: en',
      ...introLines,
      'startLocation: glade',
      'deathEnding: death',
      'locations:',
      '  - locations/glade.yaml',
      'scenes:',
      '  - scenes/path.yaml',
      'templates:',
      '  - templates.yaml',
      'endings:',
      '  - endings.yaml',
      'items:',
      '  - items.yaml',
      '',
    ].join('\n'),
    'locations/glade.yaml':
      'id: glade\nname: Glade\ndescription: Sunlight through leaves.\nmap: { x: 10, y: 20 }\nscenes: [path]\n',
    'scenes/path.yaml':
      'id: path\ntitle: Path\ntrigger: on-enter\ntext: A path leads home.\nchoices:\n  - id: go\n    text: Go home.\n    outcome:\n      end: home\n',
    'items.yaml': '- id: sword\n  kind: equipment\n  name: Sword\n  slot: weapon\n  damage: 3\n',
    'templates.yaml': [
      '- id: hunter',
      '  name: Hunter',
      '  description: Knows the woods.',
      '  attributes: { might: 1, agility: 3, wits: 2, presence: 0 }',
      '  items:',
      '    - { item: sword }',
      '',
    ].join('\n'),
    'endings.yaml':
      '- id: death\n  kind: defeat\n  title: Gone\n  text: The end.\n- id: home\n  kind: victory\n  title: Home\n  text: You made it.\n',
  });
  const result = loadScenario(scenarioDir);
  if (!result.ok) throw new Error(`fixture failed to load: ${JSON.stringify(result.diagnostics)}`);
  return result.scenario;
}

describe('shouldShowIntroModal', () => {
  it('opens over the starting Location until acknowledged', () => {
    // Not yet acknowledged: the modal shows.
    expect(shouldShowIntroModal(true, 0, undefined)).toBe(true);
  });

  it('reveals the position after Continue without changing state', () => {
    // `?seen=` equal to the current step: no modal, the position renders.
    expect(shouldShowIntroModal(true, 0, 0)).toBe(false);
  });

  it('ignores a step parameter that does not match, so a reload shows the modal again', () => {
    expect(shouldShowIntroModal(true, 0, 3)).toBe(true);
    expect(shouldShowIntroModal(true, 0, 999)).toBe(true);
    // Reloading the acknowledged URL keeps the position: `?seen=` still matches.
    expect(shouldShowIntroModal(true, 0, 0)).toBe(false);
  });

  it('never opens without an intro', () => {
    expect(shouldShowIntroModal(false, 0, undefined)).toBe(false);
    expect(shouldShowIntroModal(false, 0, 0)).toBe(false);
    expect(shouldShowIntroModal(false, 4, undefined)).toBe(false);
  });

  it('never opens for a later step without an intro entry', () => {
    expect(shouldShowIntroModal(false, 2, undefined)).toBe(false);
    expect(shouldShowIntroModal(false, 2, 2)).toBe(false);
  });
});

describe('starting with and without an intro', () => {
  it('starts with an intro entry and a pending on-enter Scene', () => {
    const scenario = loadFixture({ intro: 'You wake, **{name}**.' });
    const result = startPlaythrough(scenario, 'hunter', 'Robin', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.step).toBe(0);
    expect(result.journal.map((entry) => entry.type)).toEqual(['intro', 'scene']);
    // The intro entry carries the shown language and the substituted name.
    expect(result.journal[0]).toMatchObject({ type: 'intro', lang: 'en' });
    expect(String((result.journal[0] as { text: string }).text)).toContain('Robin');
    // The pending entry Scene follows the existing engine sequence: the view
    // after acknowledgement is the on-enter Scene, unchanged by the modal.
    expect(result.state.activeSceneId).toBe('path');
    expect(view(scenario, result.state).kind).toBe('scene');
    // Before acknowledgement the modal shows; after, the Scene renders.
    expect(shouldShowIntroModal(true, result.state.step, undefined)).toBe(true);
    expect(shouldShowIntroModal(true, result.state.step, result.state.step)).toBe(false);
  });

  it('starts without an intro directly in the normal position with no modal', () => {
    const scenario = loadFixture();
    const result = startPlaythrough(scenario, 'hunter', 'Robin', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.journal.map((entry) => entry.type)).toEqual(['scene']);
    expect(shouldShowIntroModal(false, result.state.step, undefined)).toBe(false);
    // The normal initial playable state is the pending on-enter Scene.
    expect(view(scenario, result.state).kind).toBe('scene');
  });

  it('acknowledging repeats no Effects and duplicates no Journal entries', () => {
    const scenario = loadFixture({ intro: 'You wake.' });
    const result = startPlaythrough(scenario, 'hunter', 'Robin', rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = JSON.stringify(result.state);
    const journalLength = result.journal.length;
    // Continue is client-side only: the acknowledgement URL carries the step
    // and changes no game state. Re-evaluating the same acknowledgement keeps
    // the position without new entries.
    expect(continueHref('pt-1', result.state.step)).toBe('/play/pt-1?seen=0');
    expect(shouldShowIntroModal(true, result.state.step, result.state.step)).toBe(false);
    expect(JSON.stringify(result.state)).toBe(before);
    expect(result.journal.length).toBe(journalLength);
  });
});

describe('intro narration rendering', () => {
  it('keeps Scenario formatting and the Character name', () => {
    const rendered = renderJournalEntry(
      { type: 'intro', lang: 'en', payload: { text: 'You wake, **Robin**-less stranger.' } },
      en,
      'Robin',
    );
    expect(rendered.html).toContain('<strong>Robin</strong>');
    expect(rendered.label).toBe(en.journal.types.intro);
  });

  it('keeps the entry language for the Translation fallback', () => {
    const rendered = renderJournalEntry(
      { type: 'intro', lang: 'en', payload: { text: 'You wake.' } },
      pl,
      'Robin',
    );
    expect(rendered.html).toContain('lang="en"');
    expect(rendered.label).toBe(pl.journal.types.intro);
  });
});

describe('IntroModal', () => {
  it('renders an accessible dialog with the intro and a Continue acknowledgement', () => {
    const html = renderToStaticMarkup(
      <IntroModal
        continueHref="/play/pt-1?seen=0"
        continueLabel={en.game.continue}
        title={en.journal.types.intro}
        introHtml="<p>You wake.</p>"
        lang="en"
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby');
    expect(html).toContain('Intro');
    expect(html).toContain('You wake.');
    expect(html).toContain('href="/play/pt-1?seen=0"');
    expect(html).toContain('Continue');
    expect(html).toContain('lang="en"');
    // Continue is a plain link, not a form: following it changes no game
    // state and does not advance `step`.
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    expect(html).toContain('data-testid="intro-modal"');
  });

  it('renders the Continue control in Polish', () => {
    const html = renderToStaticMarkup(
      <IntroModal
        continueHref="/play/pt-1?seen=0"
        continueLabel={pl.game.continue}
        title={pl.journal.types.intro}
        introHtml="<p>Budzisz się.</p>"
        lang="pl"
      />,
    );
    expect(html).toContain('Kontynuuj');
    expect(html).toContain('Wstęp');
    expect(html).toContain('lang="pl"');
  });

  it('keeps the acknowledgement on the Continue href', () => {
    expect(continueHref('pt-1', 0)).toBe('/play/pt-1?seen=0');
  });
});
