// Interface Text rendering of the Journal's structured event kinds
// (docs/spec/architecture.md, testing strategy; ADR 0004): one example of
// every structured event kind the engine emits, rendered with both
// catalogues. Each result is non-empty and contains no `undefined`, `NaN` or
// `{`. Later tickets add their kinds to this table as more engine entries
// move to structured events. There are no snapshots of whole texts; wording
// is reviewed by a person against the term table (docs/spec/ui.md,
// polish terms).

import { describe, expect, it } from 'vitest';
import { renderJournalEntry, type JournalEntryView } from '../src/app/lib/journal';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

const catalogues = { en, pl };

// One example of every structured event kind the engine emits today: intro,
// Scene narration, Choice taken, Outcome narration, travel, Ending, Test,
// state changes and inventory actions. (The retired tactical Combat entries
// left with S4; legacy combat rows render verbatim, covered below.)
const STRUCTURED_CASES: ReadonlyArray<{ kind: string; entry: JournalEntryView }> = [
  {
    kind: 'intro',
    entry: { type: 'intro', lang: 'en', payload: { text: 'You wake in the **grass**.' } },
  },
  {
    kind: 'scene',
    entry: {
      type: 'scene',
      lang: 'pl',
      payload: { sceneId: 'arrival', text: 'Dzwon *bije*.' },
    },
  },
  {
    kind: 'choice',
    entry: {
      type: 'choice',
      lang: 'en',
      payload: { sceneId: 'arrival', choiceId: 'listen', text: 'Listen at the door.' },
    },
  },
  {
    kind: 'outcome',
    entry: { type: 'outcome', lang: 'pl', payload: { text: 'Otwierasz **drzwi**.' } },
  },
  {
    kind: 'travel',
    entry: { type: 'travel', lang: 'en', payload: { to: 'grove', name: 'Dark Grove' } },
  },
  {
    kind: 'ending',
    entry: {
      type: 'ending',
      lang: 'en',
      payload: {
        endingId: 'dawn',
        kind: 'victory',
        title: 'Dawn Breaks',
        text: 'The **sun** rises.',
      },
    },
  },
  {
    kind: 'test',
    entry: {
      type: 'test',
      lang: 'en',
      payload: {
        attribute: 'might',
        difficulty: 'very-hard',
        target: 13,
        die1: 4,
        die2: 5,
        modifier: 4,
        total: 13,
        success: true,
      },
    },
  },
  {
    kind: 'item-received',
    entry: {
      type: 'state-change',
      lang: 'en',
      payload: { change: 'item-received', itemId: 'rope', name: 'Rope', amount: 2 },
    },
  },
  {
    kind: 'item-lost',
    entry: {
      type: 'state-change',
      lang: 'pl',
      payload: { change: 'item-lost', itemId: 'sword', name: 'Miecz', amount: 1 },
    },
  },
  {
    kind: 'health-gained',
    entry: {
      type: 'state-change',
      lang: 'en',
      payload: { change: 'health-gained', amount: 2 },
    },
  },
  {
    kind: 'health-lost',
    entry: {
      type: 'state-change',
      lang: 'pl',
      payload: { change: 'health-lost', amount: 3 },
    },
  },
  {
    kind: 'revealed',
    entry: {
      type: 'state-change',
      lang: 'en',
      payload: { change: 'revealed', itemId: 'grove', name: 'Dark Grove' },
    },
  },
  {
    kind: 'equipped',
    entry: {
      type: 'inventory',
      lang: 'en',
      payload: { action: 'equipped', itemId: 'cloak', name: 'Hunter’s Cloak' },
    },
  },
  {
    kind: 'unequipped',
    entry: {
      type: 'inventory',
      lang: 'pl',
      payload: { action: 'unequipped', itemId: 'cloak', name: 'Płaszcz' },
    },
  },
  {
    kind: 'used',
    entry: {
      type: 'inventory',
      lang: 'en',
      payload: { action: 'used', itemId: 'herbs', name: 'Herbs', healed: 3 },
    },
  },
];

describe('structured journal entries in both catalogues', () => {
  for (const catalogueEntry of Object.entries(catalogues)) {
    const [language, catalogue] = catalogueEntry as ['en' | 'pl', typeof en];
    for (const { kind, entry } of STRUCTURED_CASES) {
      it(`renders ${kind} in ${language} without placeholders`, () => {
        const rendered = renderJournalEntry(entry, catalogue, 'Robin');
        expect(rendered.label.length).toBeGreaterThan(0);
        expect(rendered.html.length).toBeGreaterThan(0);
        for (const result of [rendered.label, rendered.html]) {
          expect(result).not.toContain('undefined');
          expect(result).not.toContain('NaN');
          expect(result).not.toContain('{');
        }
        // Scenario text carries the entry's language: every name inside an
        // engine message is wrapped in its own element with the entry's
        // `lang`. Entries with no Scenario text inside (Test, Health
        // gained/lost) carry Interface Text only and no `lang` element.
        const payload = (entry.payload ?? {}) as Record<string, unknown>;
        if (typeof payload.name === 'string' || typeof payload.text === 'string') {
          expect(rendered.html).toContain(`lang="${String(entry.lang)}"`);
        }
      });
    }
  }

  it('renders Interface Text in the catalogue language, not the entry language', () => {
    const english = renderJournalEntry(STRUCTURED_CASES[4]?.entry as JournalEntryView, en, 'Robin');
    const polish = renderJournalEntry(STRUCTURED_CASES[4]?.entry as JournalEntryView, pl, 'Robin');
    expect(english.html).not.toEqual(polish.html);
    expect(polish.label).toBe('Podróż');
  });

});

describe('legacy combat rows', () => {
  it('leaves legacy combat rows verbatim and never reinterprets them', () => {
    const legacy: JournalEntryView = {
      type: 'combat-round',
      lang: 'en',
      payload: { encounterId: 'wolf', text: 'Robin guards against the Grey Wolf.' },
    };
    for (const catalogue of [en, pl]) {
      const rendered = renderJournalEntry(legacy, catalogue, 'Robin');
      expect(rendered.html).toContain('Robin guards against the Grey Wolf.');
      expect(rendered.html).not.toContain('tactical-round');
    }
  });
});
