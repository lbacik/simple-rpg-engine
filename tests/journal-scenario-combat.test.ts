// Scenario Combat Journal rendering (P6 G6): `combat-start`, `combat-round`
// (`version: 3`, events plus the actor-to-`ref` mapping) and `combat-end`
// (`win`/`surrender`/`draw`) entries render from the catalogue in both
// Interface Languages without Scenario content, in the full and modal
// Journal. `combat-start` holds Scenario text (flagged on a language switch);
// the Round and end entries are engine-generated and never flagged.
//
// Companion presence (G4/G6) renders the same way: `companion-joined`,
// `companion-left` and `companion-lost` entries render from the catalogue in
// both Interface Languages, with the Companion name as presented carrying the
// entry's `lang`; a `combat-start` fought with the Companion names them on
// their own catalogue line. Companion entries are engine-generated and never
// flagged.

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

const joinedEntry: StoredJournalEntry = stored(
  {
    type: 'companion-joined',
    lang: 'en',
    payload: { companionId: 'astrid', name: 'Astrid the Skald' },
  },
  4,
);

const leftEntry: StoredJournalEntry = stored(
  {
    type: 'companion-left',
    lang: 'en',
    payload: { companionId: 'astrid', name: 'Astrid the Skald' },
  },
  5,
);

const lostEntry: StoredJournalEntry = stored(
  {
    type: 'companion-lost',
    lang: 'en',
    payload: { companionId: 'astrid', name: 'Astrid the Skald' },
  },
  6,
);

const startWithCompanionEntry: StoredJournalEntry = stored(
  {
    type: 'combat-start',
    lang: 'en',
    payload: {
      encounterId: 'wolf-fight',
      text: 'Two wolves circle out of the dark.',
      participants: [{ ref: 'alpha', name: 'Alpha wolf' }],
      companion: { ref: 'astrid', name: 'Astrid the Skald' },
    },
  },
  7,
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

      it('labels companion entries from the catalogue', () => {
        const rendered = renderJournalEntries([joinedEntry, leftEntry, lostEntry], catalogue, 'Robin');
        expect(rendered.map((entry) => entry.label)).toEqual([
          catalogue.journal.types.companionJoined,
          catalogue.journal.types.companionLeft,
          catalogue.journal.types.companionLost,
        ]);
      });

      it('renders companion joined/left/lost from the catalogue with the name as presented', () => {
        const cases = [
          { entry: joinedEntry, message: catalogue.journal.companionJoined('Astrid the Skald') },
          { entry: leftEntry, message: catalogue.journal.companionLeft('Astrid the Skald') },
          { entry: lostEntry, message: catalogue.journal.companionLost('Astrid the Skald') },
        ] as const;
        for (const { entry, message } of cases) {
          const html = renderJournalEntries([entry], catalogue, 'Robin')[0]?.html ?? '';
          // The message fragment around the name, plus the name carrying the
          // entry's `lang` — never the Interface Language.
          const fragment = message.replace('Astrid the Skald', '').trim();
          expect(html).toContain(fragment);
          expect(html).toContain('<span lang="en">Astrid the Skald</span>');
          expect(html).not.toContain('undefined');
        }
      });

      it('renders combat-start with the Companion on its own catalogue line', () => {
        const alongside = catalogue.journal.combatWithCompanion('').trim();
        const withCompanion =
          renderJournalEntries([startWithCompanionEntry], catalogue, 'Robin')[0]?.html ?? '';
        expect(withCompanion).toContain('Two wolves circle out of the dark.');
        expect(withCompanion).toContain('Alpha wolf');
        expect(withCompanion).toContain(alongside);
        expect(withCompanion).toContain('<span lang="en">Astrid the Skald</span>');
        // Rows written before Companions carry no `companion` and render as
        // before: no alongside line.
        const withoutCompanion =
          renderJournalEntries([startEntry], catalogue, 'Robin')[0]?.html ?? '';
        expect(withoutCompanion).not.toContain(alongside);
      });
    });
  }

  it('flags combat-start as Scenario text on a language switch, never the round, end or companion entries', () => {
    const switched = { ...startEntry, lang: 'pl' };
    const switchedJoined = { ...joinedEntry, lang: 'pl' };
    const switchedLeft = { ...leftEntry, lang: 'pl' };
    const switchedLost = { ...lostEntry, lang: 'pl' };
    const rendered = renderJournalEntries(
      [switched, roundEntry, endEntry, switchedJoined, switchedLeft, switchedLost],
      en,
      'Robin',
    );
    expect(rendered[0]?.flag).toBe('pl');
    expect(rendered[0]?.flagLabel).toBe(en.scenarioLanguage.flagName('pl', false));
    expect(rendered[1]?.flag).toBeNull();
    expect(rendered[2]?.flag).toBeNull();
    expect(rendered[3]?.flag).toBeNull();
    expect(rendered[4]?.flag).toBeNull();
    expect(rendered[5]?.flag).toBeNull();
  });

  it('renders the same entries in the modal batch', () => {
    const batch = modalJournalBatch(
      [startEntry, roundEntry, endEntry, joinedEntry, leftEntry, lostEntry, startWithCompanionEntry],
      en,
      'Robin',
    );
    expect(batch.total).toBe(7);
    // The modal batch is newest first.
    expect(batch.entries.map((entry) => entry.label)).toEqual([
      en.journal.types.combatStart,
      en.journal.types.companionLost,
      en.journal.types.companionLeft,
      en.journal.types.companionJoined,
      en.journal.types.combatEnd,
      en.journal.types.combatRound,
      en.journal.types.combatStart,
    ]);
    // Parity with the full Journal: the same rows render to the same HTML.
    const full = renderJournalEntries(
      [startEntry, roundEntry, endEntry, joinedEntry, leftEntry, lostEntry, startWithCompanionEntry],
      en,
      'Robin',
    );
    const fullBySeq = new Map(full.map((entry) => [entry.seq, entry.html]));
    for (const entry of batch.entries) {
      expect(entry.html).toBe(fullBySeq.get(entry.seq));
    }
  });
});
