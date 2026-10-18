// The Journal across Interface Languages (docs/spec/playthrough-state.md,
// journal; docs/spec/ui.md, journal; ADR 0004): entries record the language
// of the Scenario text actually shown, narration entries played in another
// language are visibly marked with its flag after the type label, Interface
// Text always follows the current Interface Language, and stored entries never
// change when a Translation does.
//
// Relative imports only: vitest has no `@/` alias.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario, type Scenario } from '../src/content/index';
import { localizeScenario } from '../src/content/localize';
import {
  applyAction,
  startPlaythrough,
  type Rng,
} from '../src/engine/index';
import {
  journalEntryFlag,
  renderJournalEntries,
  renderJournalEntry,
  type JournalEntryView,
} from '../src/app/lib/journal';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(testsDir, 'fixtures', 'scenarios');

const rng: Rng = () => 1;

function loadFixture(name: string): Scenario {
  const result = loadScenario(path.join(fixturesDir, name));
  if (!result.ok) throw new Error(`fixture ${name} failed to load`);
  return result.scenario;
}

function narration(type: string, lang: unknown, text: string): JournalEntryView {
  return { type, lang, payload: { text } };
}

describe('journalEntryFlag', () => {
  it('marks narration entries shown in another language', () => {
    for (const type of ['intro', 'scene', 'choice', 'outcome', 'ending']) {
      const flagged = journalEntryFlag(narration(type, 'pl', 'Tekst.'), en);
      expect(flagged).toEqual({ lang: 'pl', label: 'Polish' });
    }
  });

  it('marks the Combat opening narration like any other narration', () => {
    const flagged = journalEntryFlag(
      {
        type: 'combat-start',
        lang: 'pl',
        payload: { encounterId: 'wilk', enemyName: 'Szary Wilk', text: 'Wilk **atakuje**.' },
      },
      en,
    );
    expect(flagged).toEqual({ lang: 'pl', label: 'Polish' });
  });

  it('names the flag in the Interface Language', () => {
    expect(journalEntryFlag(narration('scene', 'en', 'Text.'), pl)).toEqual({
      lang: 'en',
      label: 'Angielski',
    });
  });

  it('carries no flag when the entry matches by primary subtag', () => {
    expect(journalEntryFlag(narration('scene', 'en', 'Text.'), en)).toBeUndefined();
    expect(journalEntryFlag(narration('scene', 'en-US', 'Text.'), en)).toBeUndefined();
    expect(journalEntryFlag(narration('scene', 'pl', 'Tekst.'), pl)).toBeUndefined();
  });

  it('counts legacy rows without a language as English', () => {
    expect(journalEntryFlag({ type: 'scene', payload: { text: 'Text.' } }, pl)).toEqual({
      lang: 'en',
      label: 'Angielski',
    });
    expect(journalEntryFlag({ type: 'scene', payload: { text: 'Text.' } }, en)).toBeUndefined();
  });

  it('never flags engine-generated entries, even ones mentioning names', () => {
    const cases: JournalEntryView[] = [
      {
        type: 'test',
        lang: 'pl',
        payload: {
          attribute: 'might',
          difficulty: 'ordinary',
          target: 9,
          die1: 3,
          die2: 4,
          modifier: 2,
          total: 9,
          success: true,
        },
      },
      {
        type: 'state-change',
        lang: 'pl',
        payload: { change: 'item-received', itemId: 'miecz', name: 'Miecz', amount: 1 },
      },
      { type: 'travel', lang: 'pl', payload: { to: 'gaj', name: 'Mroczny Gaj' } },
      {
        type: 'combat-round',
        lang: 'pl',
        payload: {
          encounterId: 'wilk',
          round: 1,
          action: 'attack',
          rangeBefore: 'near',
          rangeAfter: 'near',
          guard: false,
          enemyName: 'Szary Wilk',
          rolls: [],
        },
      },
      {
        type: 'combat-end',
        lang: 'pl',
        payload: { encounterId: 'wilk', enemyName: 'Szary Wilk', howEnded: 'victory' },
      },
      {
        type: 'enemy-defeated',
        lang: 'pl',
        payload: { encounterId: 'wilk', enemyName: 'Szary Wilk' },
      },
      {
        type: 'inventory',
        lang: 'pl',
        payload: { action: 'used', itemId: 'chleb', name: 'Chleb', healed: 2 },
      },
    ];
    for (const entry of cases) {
      expect(journalEntryFlag(entry, en)).toBeUndefined();
    }
  });
});

describe('renderJournalEntry flags', () => {
  it('carries the flag alongside the label and html', () => {
    const rendered = renderJournalEntry(narration('intro', 'en', 'You wake.'), pl, 'Robin');
    expect(rendered.label).toBe('Wstęp');
    expect(rendered.flag).toBe('en');
    expect(rendered.flagLabel).toBe('Angielski');
    expect(rendered.html).toContain('lang="en"');
  });

  it('carries no flag when the languages match', () => {
    const rendered = renderJournalEntry(narration('intro', 'en', 'You wake.'), en, 'Robin');
    expect(rendered.flag).toBeNull();
    expect(rendered.flagLabel).toBeNull();
  });

  it('wraps a name inside an engine message in its own lang element', () => {
    const rendered = renderJournalEntry(
      { type: 'travel', lang: 'pl', payload: { to: 'gaj', name: 'Mroczny Gaj' } },
      en,
      'Robin',
    );
    expect(rendered.flag).toBeNull();
    expect(rendered.html).toContain('<span lang="pl">Mroczny Gaj</span>');
  });
});

describe('the outcome modal after a language switch', () => {
  // Entries recorded in Polish, read back under the English catalogue: the
  // narration keeps the language it was presented in, while the Test and the
  // state change follow the new Interface Language.
  const entries = [
    { seq: 1, step: 1, type: 'test', lang: 'pl', payload: {
      attribute: 'might',
      difficulty: 'ordinary',
      target: 9,
      die1: 3,
      die2: 4,
      modifier: 2,
      total: 9,
      success: true,
    } },
    { seq: 2, step: 1, type: 'outcome', lang: 'pl', payload: { text: 'Otwierasz **drzwi**.' } },
    { seq: 3, step: 1, type: 'state-change', lang: 'pl', payload: {
      change: 'item-received',
      itemId: 'miecz',
      name: 'Miecz',
      amount: 1,
    } },
  ] as const;

  it('keeps narration in its presented language with a flag', () => {
    const rendered = renderJournalEntries(
      entries.map((entry) => ({ ...entry, payload: { ...entry.payload } })),
      en,
      'Robin',
    );
    const outcome = rendered.find((entry) => entry.seq === 2);
    expect(outcome?.label).toBe('Outcome');
    expect(outcome?.flag).toBe('pl');
    expect(outcome?.html).toContain('lang="pl"');
    expect(outcome?.html).toContain('Otwierasz');
  });

  it('renders the Test and state changes in the new Interface Language', () => {
    const rendered = renderJournalEntries(
      entries.map((entry) => ({ ...entry, payload: { ...entry.payload } })),
      en,
      'Robin',
    );
    const test = rendered.find((entry) => entry.seq === 1);
    expect(test?.label).toBe('Test');
    expect(test?.flag).toBeNull();
    expect(test?.html).toContain('Might');
    expect(test?.html).toContain('success');
    const change = rendered.find((entry) => entry.seq === 3);
    expect(change?.flag).toBeNull();
    expect(change?.html).toContain('Received:');
    // The name inside stays as presented, in its own lang element.
    expect(change?.html).toContain('<span lang="pl">Miecz</span>');
  });
});

describe('stored entries across Translation changes', () => {
  function playInPolish() {
    const scenario = loadFixture('two-bridges');
    const shown = localizeScenario(scenario, 'pl').scenario;
    const started = startPlaythrough(shown, 'wayfarer', 'E2E', rng);
    if (!started.ok) throw new Error(`start failed: ${started.reason}`);
    const chosen = applyAction(
      shown,
      started.state,
      { kind: 'choose', choiceId: 'listen', expectedStep: started.state.step },
      rng,
    );
    if (!chosen.ok) throw new Error(`choose failed: ${chosen.reason}`);
    return { journal: [...started.journal, ...chosen.journal] };
  }

  it('records the presented language and names', () => {
    const { journal } = playInPolish();
    expect(journal.length).toBeGreaterThan(0);
    for (const entry of journal) {
      expect(entry.lang).toBe('pl');
    }
    const texts = journal.map((entry) => JSON.stringify(entry));
    expect(texts.join('\n')).toContain('Mosiężny klucz');
    expect(texts.join('\n')).not.toContain('Brass Key');
  });

  it('never changes stored entries when the Translation changes', () => {
    const { journal } = playInPolish();
    const snapshot = JSON.parse(JSON.stringify(journal)) as typeof journal;

    // The Translation is rejected, outdated or rewritten: play continues in
    // the Base Language, but the stored rows are never touched.
    const base = loadFixture('two-bridges');
    const fallback = localizeScenario(base, 'de').scenario;
    expect(fallback.language).toBe('en');
    const restarted = startPlaythrough(fallback, 'wayfarer', 'E2E', rng);
    if (!restarted.ok) throw new Error(`start failed: ${restarted.reason}`);
    expect(restarted.journal[0]?.lang).toBe('en');

    // The old rows are byte-identical, and still render the presented text.
    expect(journal).toEqual(snapshot);
    const rendered = renderJournalEntries(
      snapshot.map((entry, index) => {
        const { type, lang, ...payload } = entry;
        return { seq: index + 1, step: 0, type, lang, payload };
      }),
      en,
      'E2E',
    );
    const html = rendered.map((entry) => entry.html).join('\n');
    expect(html).toContain('Mosiężny klucz');
    expect(html).not.toContain('Brass Key');
    expect(html).toContain('lang="pl"');
  });
});
