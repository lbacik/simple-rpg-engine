// Journal rendering and cursor batches (docs/spec/playthrough-state.md,
// journal; docs/spec/ui.md, journal): every entry type renders in order with
// the step that produced it, narration entries reuse the game screen's
// Markdown subset on the stored text, and batches slice the append-only
// journal_entries table newest first by sequence cursor.

import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import {
  JOURNAL_BATCH_SIZE,
  journalEntryLabel,
  journalHref,
  latestJournalEnding,
  parseJournalCursor,
  renderJournalEntries,
  renderJournalEntry,
} from '../src/app/lib/journal';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';
import {
  MIGRATIONS,
  migrateDatabase,
  openDatabase,
  PlaythroughStore,
} from '../src/persistence/index';
import { STATE_VERSION, type PlaythroughState } from '../src/engine/state';

function makeState(): PlaythroughState {
  return {
    stateVersion: STATE_VERSION,
    scenarioId: 'meadow',
    scenarioVersion: '1.0.0',
    contentHash: 'abc',
    status: 'active',
    step: 0,
    character: {
      templateId: 'hunter',
      name: 'Robin',
      baseAttributes: { might: 1, agility: 3, wits: 2, presence: 0 },
      health: 12,
    },
    inventory: {},
    equipment: {},
    currentLocationId: 'glade',
    activeSceneId: null,
    activeCombat: null,
    visited: ['glade'],
    revealed: [],
    firedScenes: [],
    takenOnceChoices: [],
    flags: [],
    encounterDamage: {},
  };
}

describe('renderJournalEntry', () => {
  const name = 'Robin';

  it('renders the intro with the Markdown subset on the stored text', () => {
    const rendered = renderJournalEntry(
      { type: 'intro', lang: 'en', payload: { text: 'You wake, **Robin**-less stranger.' } },
      en,
      name,
    );
    expect(rendered.label).toBe('Intro');
    expect(rendered.html).toContain('<strong>');
    expect(rendered.html).toContain('<p>');
    expect(rendered.html).toContain('lang="en"');
  });

  it('renders Scene narration with the Markdown subset', () => {
    const rendered = renderJournalEntry(
      { type: 'scene', lang: 'en', payload: { sceneId: 'mist', text: 'The *mist* parts.' } },
      en,
      name,
    );
    expect(rendered.label).toBe('Scene');
    expect(rendered.html).toContain('<em>mist</em>');
    expect(rendered.html).toContain('lang="en"');
  });

  it('renders the Choice wording verbatim with the catalogue label only', () => {
    const rendered = renderJournalEntry(
      {
        type: 'choice',
        lang: 'en',
        payload: { sceneId: 's', choiceId: 'c', text: 'Push on <b>now</b>' },
      },
      en,
      name,
    );
    expect(rendered.label).toBe('Choice taken');
    expect(rendered.html).toContain('&lt;b&gt;now&lt;/b&gt;');
    expect(rendered.html).not.toContain('<b>');
    expect(rendered.html).not.toContain('Chose:');
    expect(rendered.html).toContain('lang="en"');
  });

  it('renders the structured Test through the catalogue', () => {
    const rendered = renderJournalEntry(
      {
        type: 'test',
        lang: 'en',
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
      en,
      name,
    );
    expect(rendered.label).toBe('Test');
    expect(rendered.html).toContain('Might');
    expect(rendered.html).toContain('Ordinary');
    expect(rendered.html).toContain('3+4+2=9');
    expect(rendered.html).toContain('success');
    const polish = renderJournalEntry(
      {
        type: 'test',
        lang: 'en',
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
      pl,
      name,
    );
    expect(polish.label).toBe('Test');
    expect(polish.html).toContain('Krzepa');
    expect(polish.html).toContain('sukces');
  });

  it('renders legacy Test rows verbatim in English with only the label translated', () => {
    const legacy =
      'Might, Ordinary 9: rolled 3 and 4, modifier +2, total 9 — success.';
    for (const catalogue of [en, pl]) {
      const rendered = renderJournalEntry(
        {
          type: 'test',
          lang: 'en',
          payload: {
            text: legacy,
            attribute: 'might',
            difficulty: 'ordinary',
            die1: 3,
            die2: 4,
            modifier: 2,
            total: 9,
            success: true,
          },
        },
        catalogue,
        name,
      );
      expect(rendered.html).toContain(legacy);
    }
    expect(
      renderJournalEntry(
        { type: 'test', lang: 'en', payload: { text: legacy } },
        pl,
        name,
      ).label,
    ).toBe('Test');
  });

  it('renders Outcome narration with the Markdown subset', () => {
    const rendered = renderJournalEntry(
      { type: 'outcome', lang: 'en', payload: { text: 'You **win** the day.' } },
      en,
      name,
    );
    expect(rendered.label).toBe('Outcome');
    expect(rendered.html).toContain('<strong>win</strong>');
    expect(rendered.html).toContain('lang="en"');
  });

  it('renders structured state changes through the catalogue with the name in its lang', () => {
    const received = renderJournalEntry(
      {
        type: 'state-change',
        lang: 'en',
        payload: { change: 'item-received', itemId: 'rope', name: 'rope', amount: 2 },
      },
      en,
      name,
    );
    expect(received.label).toBe('State change');
    expect(received.html).toContain('Received:');
    expect(received.html).toContain('<span lang="en">rope</span>');
    const lost = renderJournalEntry(
      {
        type: 'state-change',
        lang: 'pl',
        payload: { change: 'health-lost', amount: 2 },
      },
      pl,
      name,
    );
    expect(lost.label).toBe('Zmiana stanu');
    expect(lost.html).toContain('obrażenia');
  });

  it('renders legacy state-change rows verbatim in English with only the label translated', () => {
    for (const catalogue of [en, pl]) {
      const rendered = renderJournalEntry(
        { type: 'state-change', lang: 'en', payload: { text: 'received: rope ×2' } },
        catalogue,
        name,
      );
      expect(rendered.html).toContain('received: rope ×2');
    }
    expect(
      renderJournalEntry(
        { type: 'state-change', lang: 'en', payload: { text: 'received: rope ×2' } },
        pl,
        name,
      ).label,
    ).toBe('Zmiana stanu');
  });

  it('renders structured travel through the catalogue with the name in its lang', () => {
    const rendered = renderJournalEntry(
      { type: 'travel', lang: 'en', payload: { to: 'grove', name: 'Dark Grove' } },
      en,
      name,
    );
    expect(rendered.label).toBe('Travel');
    expect(rendered.html).toContain('Travelled to');
    expect(rendered.html).toContain('<span lang="en">Dark Grove</span>');
    const polish = renderJournalEntry(
      { type: 'travel', lang: 'pl', payload: { to: 'grove', name: 'Mroczny Gaj' } },
      pl,
      name,
    );
    expect(polish.label).toBe('Podróż');
    expect(polish.html).toContain('Podróż:');
    expect(polish.html).toContain('<span lang="pl">Mroczny Gaj</span>');
  });

  it('renders legacy travel rows verbatim in English with only the label translated', () => {
    for (const catalogue of [en, pl]) {
      const rendered = renderJournalEntry(
        { type: 'travel', lang: 'en', payload: { text: 'Travelled to Dark Grove.', to: 'grove' } },
        catalogue,
        name,
      );
      expect(rendered.html).toContain('Travelled to Dark Grove.');
    }
    expect(
      renderJournalEntry(
        { type: 'travel', lang: 'en', payload: { text: 'Travelled to Dark Grove.', to: 'grove' } },
        pl,
        name,
      ).label,
    ).toBe('Podróż');
  });

  it('renders Combat start narration with the Markdown subset', () => {
    const rendered = renderJournalEntry(
      { type: 'combat-start', lang: 'en', payload: { text: 'A **wolf** lunges from the *mist*!' } },
      en,
      name,
    );
    expect(rendered.label).toBe('Combat start');
    expect(rendered.html).toContain('<strong>wolf</strong>');
    expect(rendered.html).toContain('<em>mist</em>');
  });

  it('renders a Combat round as plain text', () => {
    const rendered = renderJournalEntry(
      {
        type: 'combat-round',
        lang: 'en',
        payload: { text: 'Round 1: attacked for 3 damage, enemy missed. Range: near.' },
      },
      en,
      name,
    );
    expect(rendered.label).toBe('Combat round');
    expect(rendered.html).toContain('Round 1');
  });

  it('renders Combat end as plain text', () => {
    const rendered = renderJournalEntry(
      { type: 'combat-end', lang: 'en', payload: { text: 'Victory! The wolf falls.' } },
      en,
      name,
    );
    expect(rendered.label).toBe('Combat end');
    expect(rendered.html).toContain('Victory! The wolf falls.');
  });

  it('renders the Enemy-defeated notice as plain text', () => {
    const rendered = renderJournalEntry(
      { type: 'enemy-defeated', lang: 'en', payload: { text: 'The wolf is defeated.' } },
      en,
      name,
    );
    expect(rendered.label).toBe('Enemy defeated');
    expect(rendered.html).toContain('The wolf is defeated.');
  });

  it('renders structured inventory actions through the catalogue with the name in its lang', () => {
    const equipped = renderJournalEntry(
      {
        type: 'inventory',
        lang: 'en',
        payload: { action: 'equipped', itemId: 'cloak', name: 'Hunter’s Cloak' },
      },
      en,
      name,
    );
    expect(equipped.label).toBe('Inventory');
    expect(equipped.html).toContain('Equipped:');
    expect(equipped.html).toContain('<span lang="en">Hunter’s Cloak</span>');
    const used = renderJournalEntry(
      {
        type: 'inventory',
        lang: 'en',
        payload: { action: 'used', itemId: 'herbs', name: 'Herbs', healed: 3 },
      },
      pl,
      name,
    );
    expect(used.label).toBe('Inwentarz');
    expect(used.html).toContain('Użyto:');
    expect(used.html).toContain('<span lang="en">Herbs</span>');
  });

  it('renders legacy inventory rows verbatim in English with only the label translated', () => {
    for (const text of [
      'Equipped Hunter’s Cloak.',
      'Unequipped Hunter’s Cloak.',
      'Used Herbs, restored 3 Health.',
    ]) {
      for (const catalogue of [en, pl]) {
        const rendered = renderJournalEntry(
          { type: 'inventory', lang: 'en', payload: { text } },
          catalogue,
          name,
        );
        expect(rendered.html).toContain(text.split(',')[0] ?? text);
      }
    }
    expect(
      renderJournalEntry(
        { type: 'inventory', lang: 'en', payload: { text: 'Equipped Hunter’s Cloak.' } },
        pl,
        name,
      ).label,
    ).toBe('Inwentarz');
  });

  it('renders the Ending kind from the catalogue with title and Markdown narration', () => {
    const rendered = renderJournalEntry(
      {
        type: 'ending',
        lang: 'en',
        payload: { endingId: 'dawn', kind: 'victory', title: 'Dawn Breaks', text: 'The **sun** rises, Robin.' },
      },
      en,
      name,
    );
    expect(rendered.label).toBe('Ending');
    expect(rendered.html).toContain('Victory');
    expect(rendered.html).toContain('Dawn Breaks');
    expect(rendered.html).toContain('<strong>sun</strong>');
    expect(rendered.html).toContain('lang="en"');
    const polish = renderJournalEntry(
      {
        type: 'ending',
        lang: 'en',
        payload: { endingId: 'dawn', kind: 'defeat', title: 'Zmierzch', text: 'Koniec.' },
      },
      pl,
      name,
    );
    expect(polish.label).toBe('Zakończenie');
    expect(polish.html).toContain('Porażka');
    expect(polish.html).not.toContain('Defeat');
  });

  it('keeps a markup-like character name literal in narration entries', () => {
    const rendered = renderJournalEntry(
      { type: 'scene', lang: 'en', payload: { sceneId: 's', text: 'Hail, **boss**!' } },
      en,
      '**boss**',
    );
    // The name stays literal: its asterisks never form emphasis.
    expect(rendered.html).toBe('<div lang="en"><p>Hail, **boss**!</p></div>');
  });

  it('labels unknown types with the raw type', () => {
    expect(journalEntryLabel('mystery', en)).toBe('mystery');
    expect(journalEntryLabel('mystery', pl)).toBe('mystery');
  });

  it('takes every type label from the catalogue', () => {
    expect(journalEntryLabel('travel', pl)).toBe('Podróż');
    expect(journalEntryLabel('intro', pl)).toBe('Wstęp');
    expect(journalEntryLabel('ending', pl)).toBe('Zakończenie');
  });
});

describe('legacy rows seeded through the persistence port', () => {
  it('render verbatim in English with a catalogue type label', async () => {
    const db = openDatabase(':memory:');
    try {
      await migrateDatabase(db);
      const store = new PlaythroughStore(db);
      await store.create(
        {
          id: 'pt-legacy',
          sessionId: 'hash-1',
          scenarioId: 'meadow',
          scenarioVersion: '1.0.0',
          contentHash: 'abc',
          status: 'active',
          step: 1,
          state: makeState(),
        },
        [],
      );
      // Rows as stored before Interface Languages existed: English text, no
      // event data, tagged `en` by the migration.
      await store.appendJournal('pt-legacy', [
        { step: 0, type: 'intro', lang: 'en', payload: { text: 'You wake in the **grass**.' } },
        {
          step: 1,
          type: 'travel',
          lang: 'en',
          payload: { text: 'Travelled to Dark Grove.', to: 'grove' },
        },
      ]);
      const entries = await store.listJournal('pt-legacy');
      expect(entries.map((entry) => entry.lang)).toEqual(['en', 'en']);
      const rendered = renderJournalEntries(entries, pl, 'Robin');
      expect(rendered[0]?.label).toBe('Wstęp');
      expect(rendered[0]?.html).toContain('You wake in the');
      expect(rendered[0]?.html).toContain('<strong>grass</strong>');
      expect(rendered[1]?.label).toBe('Podróż');
      expect(rendered[1]?.html).toContain('Travelled to Dark Grove.');
    } finally {
      await db.destroy();
    }
  });
});

describe('journal lang migration', () => {
  it('tags rows stored before Interface Languages existed as English', async () => {
    const db = openDatabase(':memory:');
    try {
      await MIGRATIONS['001_init'].up(db);
      // A legacy row, written while journal_entries had no lang column.
      await sql`INSERT INTO journal_entries (playthrough_id, seq, step, type, payload, created_at)
        VALUES ('pt-old', 1, 0, 'intro', '{"text":"You wake."}', '2026-01-01T00:00:00.000Z')`.execute(db);
      await MIGRATIONS['002_journal_lang'].up(db);
      const rows = await db.selectFrom('journal_entries').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.lang).toBe('en');
      // New rows record the language they were presented in.
      const store = new PlaythroughStore(db);
      await store.appendJournal('pt-old', [
        { step: 1, type: 'travel', lang: 'pl', payload: { to: 'grove', name: 'Gaj' } },
      ]);
      const entries = await store.listJournal('pt-old');
      expect(entries.map((entry) => entry.lang)).toEqual(['en', 'pl']);
    } finally {
      await db.destroy();
    }
  });
});

describe('journal cursor helpers', () => {
  it('parses sequence cursors with a safe default', () => {
    expect(parseJournalCursor(undefined)).toBeUndefined();
    expect(parseJournalCursor('6')).toBe(6);
    expect(parseJournalCursor('0')).toBeUndefined();
    expect(parseJournalCursor('-3')).toBeUndefined();
    expect(parseJournalCursor('nope')).toBeUndefined();
    expect(parseJournalCursor('')).toBeUndefined();
  });

  it('builds cursor links that degrade to plain links without JavaScript', () => {
    expect(journalHref('pt-1')).toBe('/play/pt-1/journal');
    expect(journalHref('pt-1', null)).toBe('/play/pt-1/journal');
    expect(journalHref('pt-1', 6)).toBe('/play/pt-1/journal?before=6');
  });

  it('uses a fixed batch size', () => {
    expect(JOURNAL_BATCH_SIZE).toBe(20);
  });

  it('renders a batch newest first with labels and steps', () => {
    const rendered = renderJournalEntries(
      [
        { seq: 2, step: 1, type: 'travel', lang: 'en', payload: { text: 'Travelled on.' } },
        { seq: 1, step: 0, type: 'intro', lang: 'en', payload: { text: 'You wake.' } },
      ],
      en,
      'Robin',
    );
    expect(rendered.map((entry) => entry.seq)).toEqual([2, 1]);
    expect(rendered[0]).toMatchObject({ label: 'Travel', step: 1 });
    expect(rendered[0]?.html).toContain('Travelled on.');
    expect(rendered[1]).toMatchObject({ label: 'Intro', step: 0 });
  });
});

describe('journal cursor batches in the store', () => {
  async function journalWith(count: number) {
    const db = openDatabase(':memory:');
    await migrateDatabase(db);
    const store = new PlaythroughStore(db);
    await store.create(
      {
        id: 'pt-journal',
        sessionId: 'hash-1',
        scenarioId: 'meadow',
        scenarioVersion: '1.0.0',
        contentHash: 'abc',
        status: 'active',
        step: count,
        state: makeState(),
      },
      [],
    );
    await store.appendJournal(
      'pt-journal',
      Array.from({ length: count }, (_, index) => ({
        step: index,
        type: index % 2 === 0 ? 'scene' : 'travel',
        lang: 'en',
        payload: { text: `entry ${index + 1}` },
      })),
    );
    return { db, store };
  }

  it('reads the first batch newest first', async () => {
    const { db, store } = await journalWith(JOURNAL_BATCH_SIZE + 5);
    try {
      expect(await store.countJournal('pt-journal')).toBe(JOURNAL_BATCH_SIZE + 5);

      const first = await store.listJournalBatch('pt-journal', {
        limit: JOURNAL_BATCH_SIZE,
      });
      expect(first.entries).toHaveLength(JOURNAL_BATCH_SIZE);
      expect(first.entries.map((entry) => entry.seq)).toEqual(
        Array.from({ length: JOURNAL_BATCH_SIZE }, (_, index) => JOURNAL_BATCH_SIZE + 5 - index),
      );
      expect(first.nextCursor).toBe(6);

      // The full list stays oldest first for the game screen.
      const all = await store.listJournal('pt-journal');
      expect(all.map((entry) => entry.seq)).toEqual(
        Array.from({ length: JOURNAL_BATCH_SIZE + 5 }, (_, index) => index + 1),
      );
    } finally {
      await db.destroy();
    }
  });

  it('reads a middle batch older than the cursor', async () => {
    const { db, store } = await journalWith(JOURNAL_BATCH_SIZE + 5);
    try {
      const middle = await store.listJournalBatch('pt-journal', {
        limit: 10,
        beforeSeq: 16,
      });
      expect(middle.entries.map((entry) => entry.seq)).toEqual(
        [15, 14, 13, 12, 11, 10, 9, 8, 7, 6],
      );
      expect(middle.nextCursor).toBe(6);
    } finally {
      await db.destroy();
    }
  });

  it('ends the last partial batch at the first entry', async () => {
    const { db, store } = await journalWith(JOURNAL_BATCH_SIZE + 5);
    try {
      const last = await store.listJournalBatch('pt-journal', {
        limit: JOURNAL_BATCH_SIZE,
        beforeSeq: 6,
      });
      expect(last.entries.map((entry) => entry.seq)).toEqual([5, 4, 3, 2, 1]);
      expect(last.nextCursor).toBeUndefined();
    } finally {
      await db.destroy();
    }
  });

  it('reads an empty journal as an empty batch', async () => {
    const { db, store } = await journalWith(0);
    try {
      expect(await store.countJournal('pt-journal')).toBe(0);
      const batch = await store.listJournalBatch('pt-journal', {
        limit: JOURNAL_BATCH_SIZE,
      });
      expect(batch.entries).toEqual([]);
      expect(batch.nextCursor).toBeUndefined();
    } finally {
      await db.destroy();
    }
  });

  it('reads an invalid cursor as the newest batch', async () => {
    const { db, store } = await journalWith(3);
    try {
      for (const beforeSeq of [Number.NaN, -3, 0]) {
        const batch = await store.listJournalBatch('pt-journal', {
          limit: JOURNAL_BATCH_SIZE,
          beforeSeq,
        });
        expect(batch.entries.map((entry) => entry.seq)).toEqual([3, 2, 1]);
        expect(batch.nextCursor).toBeUndefined();
      }
    } finally {
      await db.destroy();
    }
  });

  it('never shifts a batch when entries are appended after opening', async () => {
    const { db, store } = await journalWith(8);
    try {
      const first = await store.listJournalBatch('pt-journal', { limit: 5 });
      expect(first.entries.map((entry) => entry.seq)).toEqual([8, 7, 6, 5, 4]);
      expect(first.nextCursor).toBe(4);

      await store.appendJournal('pt-journal', [
        { step: 8, type: 'travel', lang: 'en', payload: { text: 'entry 9' } },
        { step: 9, type: 'travel', lang: 'en', payload: { text: 'entry 10' } },
      ]);

      const older = await store.listJournalBatch('pt-journal', {
        limit: 5,
        beforeSeq: first.nextCursor,
      });
      expect(older.entries.map((entry) => entry.seq)).toEqual([3, 2, 1]);
      const seen = [...first.entries, ...older.entries].map((entry) => entry.seq);
      expect(new Set(seen).size).toBe(seen.length);
    } finally {
      await db.destroy();
    }
  });
});

describe('latestJournalEnding', () => {
  it('reads the last Ending from the Journal and handles none', () => {
    expect(latestJournalEnding([{ type: 'intro', payload: {} }])).toBeUndefined();
    expect(
      latestJournalEnding([
        { type: 'ending', payload: { endingId: 'a', kind: 'defeat', title: 'A', text: 'a.' } },
        { type: 'travel', payload: {} },
        { type: 'ending', payload: { endingId: 'b', kind: 'victory', title: 'B', text: 'b.' } },
      ]),
    ).toEqual({ endingId: 'b', kind: 'victory', title: 'B', text: 'b.', lang: 'en' });
  });

  it('carries the entry language into the Ending', () => {
    expect(
      latestJournalEnding([
        { type: 'ending', lang: 'pl', payload: { endingId: 'b', kind: 'victory', title: 'B', text: 'b.' } },
      ]),
    ).toEqual({ endingId: 'b', kind: 'victory', title: 'B', text: 'b.', lang: 'pl' });
  });
});
