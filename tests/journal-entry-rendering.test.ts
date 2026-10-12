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

// One example of every structured event kind of this batch: intro, Scene
// narration, Choice taken, Outcome narration, travel and Ending. Later
// tickets extend this table with their kinds (Test, state changes, Combat
// events, inventory actions).
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
        // Scenario text carries the entry's language.
        expect(rendered.html).toContain(`lang="${String(entry.lang)}"`);
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
