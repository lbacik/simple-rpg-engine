// Scenario Combat Journal rendering (P6 G6): `combat-start`, `combat-round`
// (`version: 3`, events plus the actor-to-`ref` mapping) and `combat-end`
// (`win`/`surrender`/`draw`) entries render from the catalogue in both
// Interface Languages without Scenario content, in the full and modal
// Journal. `combat-start` holds Scenario text (flagged on a language switch);
// the Round and end entries are engine-generated and never flagged.

import { describe, expect, it } from 'vitest';

import {
  modalJournalBatch,
  renderJournalEntries,
  type StoredJournalEntry,
} from '../src/app/lib/journal';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

const catalogues = { en, pl };

function stored(entry: Omit<StoredJournalEntry, 'seq' | 'step'>, seq = 1): StoredJournalEntry {
  return { ...entry, seq, step: 4 };
}

const startEntry: StoredJournalEntry = stored({
  type: 'combat-start',
  lang: 'en',
  payload: {
    encounterId: 'wolf-fight',
    text: 'Two wolves circle out of the dark.',
    participants: [
      { ref: 'alpha', name: 'Alpha wolf' },
      { ref: 'beta', name: 'Beta wolf' },
    ],
  },
});

const roundEntry: StoredJournalEntry = stored(
  {
    type: 'combat-round',
    lang: 'en',
    payload: {
      version: 3,
      encounterId: 'wolf-fight',
      round: 1,
      events: [
        { type: 'declared', actor: 'h01', action: 'brace', stance: 'balanced', round: 1, seq: 0 },
        { type: 'eliminated', actor: 'e01', round: 1, seq: 5 },
      ],
      actors: { h01: null, e01: 'alpha', e02: 'beta' },
      names: { h01: 'Robin', e01: 'Alpha wolf', e02: 'Beta wolf' },
    },
  },
  2,
);

const endEntry: StoredJournalEntry = stored(
  {
    type: 'combat-end',
    lang: 'en',
    payload: { encounterId: 'wolf-fight', howEnded: 'win' },
  },
  3,
);

describe('scenario combat journal entries', () => {
  for (const [code, catalogue] of Object.entries(catalogues)) {
    describe(`in ${code}`, () => {
      it('labels combat entries from the catalogue', () => {
        const rendered = renderJournalEntries([startEntry, roundEntry, endEntry], catalogue, 'Robin');
        expect(rendered.map((entry) => entry.label)).toEqual([
          catalogue.journal.types.combatStart,
          catalogue.journal.types.combatRound,
          catalogue.journal.types.combatEnd,
        ]);
      });

      it('renders combat-start with the opening narration and the participant names', () => {
        const rendered = renderJournalEntries([startEntry], catalogue, 'Robin');
        const html = rendered[0]?.html ?? '';
        expect(html).toContain('Two wolves circle out of the dark.');
        expect(html).toContain('Alpha wolf');
        expect(html).toContain('Beta wolf');
        expect(html).toContain(`lang="en"`);
        expect(html).not.toContain('undefined');
      });

      it('renders combat-round events through the combat catalogue with entry names', () => {
        const rendered = renderJournalEntries([roundEntry], catalogue, 'Robin');
        const html = rendered[0]?.html ?? '';
        // The Round line plus one line per event, naming the actors from the entry.
        expect(html).toContain('1');
        expect(html).toContain('Robin');
        expect(html).toContain('Alpha wolf');
        expect(html).not.toContain('undefined');
        expect(html).not.toContain('NaN');
      });

      it('renders combat-end for win, surrender and draw', () => {
        for (const howEnded of ['win', 'surrender', 'draw'] as const) {
          const rendered = renderJournalEntries(
            [stored({ type: 'combat-end', lang: 'en', payload: { encounterId: 'w', howEnded } })],
            catalogue,
            'Robin',
          );
          expect(rendered[0]?.html ?? '').toContain(catalogue.journal.combatEnd(howEnded));
        }
      });
    });
  }

  it('flags combat-start as Scenario text on a language switch, never the round or end', () => {
    const switched = { ...startEntry, lang: 'pl' };
    const rendered = renderJournalEntries([switched, roundEntry, endEntry], en, 'Robin');
    expect(rendered[0]?.flag).toBe('pl');
    expect(rendered[0]?.flagLabel).toBe(en.scenarioLanguage.flagName('pl', false));
    expect(rendered[1]?.flag).toBeNull();
    expect(rendered[2]?.flag).toBeNull();
  });

  it('renders the same entries in the modal batch', () => {
    const batch = modalJournalBatch([startEntry, roundEntry, endEntry], en, 'Robin');
    expect(batch.total).toBe(3);
    // The modal batch is newest first.
    expect(batch.entries.map((entry) => entry.label)).toEqual([
      en.journal.types.combatEnd,
      en.journal.types.combatRound,
      en.journal.types.combatStart,
    ]);
  });
});
